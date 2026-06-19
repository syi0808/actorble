#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

type RpcMessage = {
  id?: string | number;
  method?: string;
  params?: JsonObject;
  result?: Json;
  error?: { code?: number; message?: string; data?: Json };
};

type PendingRequest = {
  resolve: (value: Json) => void;
  reject: (error: Error) => void;
};

type ToolRequestUserInputQuestion = {
  id: string;
  header: string;
  question: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: Array<{ label: string; description: string }> | null;
};

type ToolRequestUserInputParams = {
  threadId: string;
  turnId: string;
  itemId: string;
  questions: ToolRequestUserInputQuestion[];
  autoResolutionMs: number | null;
};

type ToolRequestUserInputResponse = {
  answers: Record<string, { answers: string[] }>;
};

type Args = {
  taskDoc: string;
  task: string;
  cwd: string;
  model?: string;
  answers?: ToolRequestUserInputResponse;
  checkAppServer: boolean;
  selfTest: boolean;
};

type TurnOutcome = {
  turnId: string;
  planText: string | null;
  lastAgentMessage: string | null;
};

const SKILL_DIR = resolve(new URL("..", import.meta.url).pathname);
const PROMPT_CONTRACT_PATH = resolve(SKILL_DIR, "references/prompt-contract.md");

function log(message: string): void {
  process.stderr.write(`[actorble-task-orchestrator] ${message}\n`);
}

function emit(value: JsonObject): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(message: string, lastEvent?: Json): never {
  emit({ state: "FAILED", reason: message, lastEvent: lastEvent ?? null });
  throw new Error(message);
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    taskDoc: "browser/docs/implementation_tasks.md",
    task: "next",
    cwd: process.cwd(),
    checkAppServer: false,
    selfTest: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value) {
        fail(`Missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    if (arg === "--task-doc") {
      args.taskDoc = next();
    } else if (arg === "--task") {
      args.task = next();
    } else if (arg === "--cwd") {
      args.cwd = resolve(next());
    } else if (arg === "--model") {
      args.model = next();
    } else if (arg === "--answers") {
      args.answers = readAnswers(next());
    } else if (arg === "--check-app-server") {
      args.checkAppServer = true;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp(): void {
  process.stdout.write(`Usage:
  node .codex/skills/actorble-task-orchestrator/scripts/orchestrate-task-loop.ts [options]

Options:
  --task-doc <path>   Task document path. Default: browser/docs/implementation_tasks.md
  --task <id|next>    Task selector. Default: next
  --cwd <path>        Workspace root. Default: current directory
  --model <model>     Optional model override for child Codex turns
  --answers <json|file> Pre-provided ToolRequestUserInputResponse
  --check-app-server  Validate initialize and collaborationMode/list only
  --self-test         Validate local bridge helpers without starting App Server
`);
}

function readAnswers(value: string): ToolRequestUserInputResponse {
  const raw = existsSync(value) ? readFileSync(value, "utf8") : value;
  return normalizeAnswers(JSON.parse(raw));
}

function normalizeAnswers(value: unknown): ToolRequestUserInputResponse {
  if (!isRecord(value)) {
    fail("Answers must be a JSON object");
  }
  const maybeAnswers = isRecord(value.answers) ? value.answers : value;
  const answers: Record<string, { answers: string[] }> = {};
  for (const [key, answer] of Object.entries(maybeAnswers)) {
    if (isRecord(answer) && Array.isArray(answer.answers)) {
      answers[key] = { answers: answer.answers.map(String) };
    } else if (Array.isArray(answer)) {
      answers[key] = { answers: answer.map(String) };
    } else if (typeof answer === "string") {
      answers[key] = { answers: [answer] };
    } else {
      fail(`Invalid answer for question '${key}'`);
    }
  }
  return { answers };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class AppServerClient {
  private nextId = 1;
  private pending = new Map<string | number, PendingRequest>();
  private buffer = "";
  private readonly child;
  private closed = false;
  public onNotification: (message: RpcMessage) => void = () => {};
  public onServerRequest: (message: RpcMessage) => Promise<Json> = async () => {
    throw new Error("Unhandled server request");
  };

  constructor() {
    this.child = spawn(
      "codex",
      ["app-server", "--stdio", "--enable", "collaboration_modes"],
      {
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.handleData(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) {
          log(`app-server: ${line}`);
        }
      }
    });
    this.child.on("exit", (code, signal) => {
      this.closed = true;
      const reason = `App Server exited with code ${code ?? "null"} signal ${signal ?? "null"}`;
      for (const pending of this.pending.values()) {
        pending.reject(new Error(reason));
      }
      this.pending.clear();
    });
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      clientInfo: {
        name: "actorble_task_orchestrator",
        title: "Actorble Task Orchestrator",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.notify("initialized", {});
  }

  request(method: string, params: JsonObject = {}): Promise<Json> {
    if (this.closed) {
      return Promise.reject(new Error("App Server is closed"));
    }
    const id = this.nextId;
    this.nextId += 1;
    const message = { id, method, params };
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
      this.write(message);
    });
  }

  respond(id: string | number, result: Json): void {
    this.write({ id, result });
  }

  notify(method: string, params: JsonObject): void {
    this.write({ method, params });
  }

  close(): void {
    if (!this.closed) {
      this.child.kill();
    }
  }

  isClosed(): boolean {
    return this.closed;
  }

  private write(message: JsonObject): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleData(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf("\n");
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      if (line) {
        void this.handleLine(line);
      }
      index = this.buffer.indexOf("\n");
    }
  }

  private async handleLine(line: string): Promise<void> {
    let message: RpcMessage;
    try {
      message = JSON.parse(line);
    } catch (error) {
      log(`Ignoring malformed App Server line: ${String(error)}`);
      return;
    }

    if (message.id !== undefined && (message.result !== undefined || message.error !== undefined)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        log(`No pending request for response id ${String(message.id)}`);
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result ?? null);
      }
      return;
    }

    if (message.id !== undefined && message.method) {
      try {
        const result = await this.onServerRequest(message);
        this.respond(message.id, result);
      } catch (error) {
        this.write({
          id: message.id,
          error: { code: -32000, message: error instanceof Error ? error.message : String(error) },
        });
      }
      return;
    }

    if (message.method) {
      this.onNotification(message);
    }
  }
}

function buildPlanningPrompt(args: Args): string {
  return `Use $actorble-task-runner to plan the requested Actorble implementation task, but do not edit files or execute the task yet.

Task document: ${args.taskDoc}
Task selector: ${args.task}

Ground yourself in the repo before asking questions. Read the task entry, relevant architecture docs, existing source/tests, and git status.

Ask the user via request_user_input if any meaningful decision exists. Ask even if there is only one question. Do not auto-resolve recommended options.

If no user decision is needed, produce one decision-complete <proposed_plan> block. The plan must specify the task id, intended behavior, files or modules likely touched, tests to add/run, verification command, completion-status update, and conventional commit intent.

Do not mutate files in this planning turn.`;
}

function buildExecutionPrompt(args: Args, planText: string): string {
  return `Use $actorble-task-runner to execute the approved Actorble task plan.

Approved plan:
${planText}

Task document: ${args.taskDoc}
Task selector: ${args.task}

Follow TDD. Preserve unrelated user changes. Verify with the narrowest relevant tests. Mark the task complete in the task document only after verification passes. Commit only task-related changes with a conventional commit.

At the end, report the task id, changed behavior, tests run, commit hash, and residual risk.`;
}

async function waitForHumanAnswers(params: ToolRequestUserInputParams): Promise<ToolRequestUserInputResponse> {
  emit({
    state: "NEEDS_HUMAN",
    runId: randomUUID(),
    requestId: params.itemId,
    threadId: params.threadId,
    turnId: params.turnId,
    questions: params.questions as unknown as Json,
    autoResolutionMs: params.autoResolutionMs,
    context: "Forward these questions through the current session request_user_input tool, then send its JSON result to this command stdin.",
  });

  log("Waiting for parent session answers on stdin as one JSON line");
  const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    rl.close();
    return normalizeAnswers(JSON.parse(trimmed));
  }
  fail("stdin closed before user answers were provided");
}

async function runTurn(
  client: AppServerClient,
  threadId: string,
  prompt: string,
  params: JsonObject,
): Promise<TurnOutcome> {
  let outcome: TurnOutcome = {
    turnId: "",
    planText: null,
    lastAgentMessage: null,
  };
  let completed = false;
  let failed: Error | null = null;

  const previousNotification = client.onNotification;
  client.onNotification = (message) => {
    previousNotification(message);
    const paramsObject = isRecord(message.params) ? message.params : {};
    if (message.method === "item/completed") {
      const item = paramsObject.item;
      if (isRecord(item) && item.type === "plan" && typeof item.text === "string") {
        outcome.planText = item.text;
      }
      if (isRecord(item) && item.type === "agentMessage" && typeof item.text === "string") {
        outcome.lastAgentMessage = item.text;
      }
    } else if (message.method === "turn/completed") {
      const turn = paramsObject.turn;
      if (isRecord(turn) && turn.id === outcome.turnId) {
        completed = true;
      }
    } else if (message.method === "turn/failed") {
      const turn = paramsObject.turn;
      if (!outcome.turnId || (isRecord(turn) && turn.id === outcome.turnId)) {
        failed = new Error(JSON.stringify(paramsObject));
      }
    }
  };

  const response = await client.request("turn/start", {
    threadId,
    input: [{ type: "text", text: prompt, text_elements: [] }],
    ...params,
  });
  if (!isRecord(response) || !isRecord(response.turn) || typeof response.turn.id !== "string") {
    fail("turn/start response did not include a turn id", response);
  }
  outcome.turnId = response.turn.id;

  while (!completed && !failed && !client.isClosed()) {
    await delay(250);
  }
  client.onNotification = previousNotification;
  if (!completed && !failed && client.isClosed()) {
    throw new Error("App Server closed before turn completion");
  }
  if (failed) {
    throw failed;
  }
  return outcome;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    selfTest();
    return;
  }
  if (args.checkAppServer) {
    await checkAppServer();
    return;
  }

  if (!existsSync(resolve(args.cwd, args.taskDoc))) {
    fail(`Task document does not exist: ${args.taskDoc}`);
  }
  if (!existsSync(PROMPT_CONTRACT_PATH)) {
    fail(`Prompt contract does not exist: ${PROMPT_CONTRACT_PATH}`);
  }

  const beforeCommit = gitHead(args.cwd);
  const client = new AppServerClient();
  let queuedAnswers = args.answers;
  client.onServerRequest = async (message) => {
    if (message.method === "item/tool/requestUserInput") {
      const params = message.params as ToolRequestUserInputParams;
      const answers = queuedAnswers ?? (await waitForHumanAnswers(params));
      queuedAnswers = undefined;
      return answers as unknown as JsonObject;
    }
    throw new Error(`Unhandled App Server request: ${message.method}`);
  };

  try {
    await client.initialize();
    const modes = await client.request("collaborationMode/list", {});
    assertPlanModeAvailable(modes);

    const threadStart = await client.request("thread/start", {
      cwd: args.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      ...(args.model ? { model: args.model } : {}),
    });
    if (!isRecord(threadStart) || !isRecord(threadStart.thread) || typeof threadStart.thread.id !== "string") {
      fail("thread/start response did not include a thread id", threadStart);
    }
    const threadId = threadStart.thread.id;

    emit({ state: "PLAN_CHECK", taskDoc: args.taskDoc, task: args.task, threadId });
    const plan = await runTurn(client, threadId, buildPlanningPrompt(args), {
      approvalPolicy: "never",
      effort: "medium",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: args.model ?? String(threadStart.model ?? "default"),
          reasoning_effort: "medium",
          developer_instructions: null,
        },
      },
    });
    if (!plan.planText || !plan.planText.trim()) {
      fail("Planning turn completed without a proposed plan", {
        lastAgentMessage: plan.lastAgentMessage,
      });
    }

    emit({ state: "EXECUTE", taskDoc: args.taskDoc, task: args.task, threadId });
    const execute = await runTurn(client, threadId, buildExecutionPrompt(args, plan.planText), {
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "workspaceWrite",
        writableRoots: [args.cwd],
        networkAccess: false,
        excludeTmpdirEnvVar: false,
        excludeSlashTmp: false,
      },
      collaborationMode: {
        mode: "default",
        settings: {
          model: args.model ?? String(threadStart.model ?? "default"),
          reasoning_effort: null,
          developer_instructions: null,
        },
      },
    });

    const afterCommit = gitHead(args.cwd);
    emit({
      state: "DONE",
      taskId: args.task,
      threadId,
      commit: afterCommit !== beforeCommit ? afterCommit : null,
      tests: extractTests(execute.lastAgentMessage ?? ""),
      summary: execute.lastAgentMessage ?? "",
    });
  } finally {
    client.close();
  }
}

async function checkAppServer(): Promise<void> {
  const client = new AppServerClient();
  try {
    await client.initialize();
    const modes = await client.request("collaborationMode/list", {});
    assertPlanModeAvailable(modes);
    emit({ state: "APP_SERVER_CHECK_OK" });
  } finally {
    client.close();
  }
}

function assertPlanModeAvailable(value: Json): void {
  if (!isRecord(value) || !Array.isArray(value.data)) {
    fail("collaborationMode/list did not return a data array", value);
  }
  const hasPlan = value.data.some((entry) => isRecord(entry) && entry.mode === "plan");
  if (!hasPlan) {
    fail("App Server does not expose Plan collaboration mode", value);
  }
}

function gitHead(cwd: string): string | null {
  const result = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    return null;
  }
  return result.stdout.trim() || null;
}

function extractTests(text: string): string[] {
  const tests = new Set<string>();
  for (const match of text.matchAll(/`([^`]*(?:test|vitest|tsc|pnpm)[^`]*)`/gi)) {
    tests.add(match[1]);
  }
  return [...tests];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function selfTest(): void {
  const answers = normalizeAnswers({
    answers: {
      confirm_path: { answers: ["Yes (Recommended)"] },
      note: "free form",
    },
  });
  if (answers.answers.confirm_path.answers[0] !== "Yes (Recommended)") {
    fail("self-test failed to normalize selected answer");
  }
  if (answers.answers.note.answers[0] !== "free form") {
    fail("self-test failed to normalize string answer");
  }
  assertPlanModeAvailable({ data: [{ name: "Plan", mode: "plan" }] });
  emit({ state: "SELF_TEST_OK" });
}

main().catch((error) => {
  log(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
