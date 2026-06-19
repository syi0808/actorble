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
  once: boolean;
  maxTasks: number;
  parentCommit: boolean;
};

type TurnOutcome = {
  turnId: string;
  planText: string | null;
  lastAgentMessage: string | null;
};

type TaskEntry = {
  id: string;
  title: string;
  line: number;
  statusText: string | null;
  terminal: boolean;
};

type TaskRunResult = {
  taskId: string;
  threadId: string;
  commit: string | null;
  parentCommit: boolean;
  tests: string[];
  summary: string;
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
    once: false,
    maxTasks: 100,
    parentCommit: true,
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
    } else if (arg === "--once") {
      args.once = true;
    } else if (arg === "--max-tasks") {
      args.maxTasks = parsePositiveInteger(next(), "--max-tasks");
    } else if (arg === "--no-parent-commit") {
      args.parentCommit = false;
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
  --task <id|next>    Task selector. Default: next. The next selector loops until all tasks are terminal.
  --cwd <path>        Workspace root. Default: current directory
  --model <model>     Optional model override for child Codex turns
  --answers <json|file> Pre-provided ToolRequestUserInputResponse
  --once              Run only the selected task, preserving the old one-task behavior
  --max-tasks <n>     Safety cap for a full task-doc loop. Default: 100
  --no-parent-commit  Do not create a parent-process commit if the child cannot write .git
  --check-app-server  Validate initialize and collaborationMode/list only
  --self-test         Validate local bridge helpers without starting App Server
`);
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    fail(`${label} must be a positive integer`);
  }
  return parsed;
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

function buildPlanningPrompt(args: Args, taskSelector: string): string {
  return `Use $actorble-task-runner to plan the requested Actorble implementation task, but do not edit files or execute the task yet.

Task document: ${args.taskDoc}
Task selector: ${taskSelector}

Ground yourself in the repo before asking questions. Read the task entry, relevant architecture docs, existing source/tests, and git status.

Ask the user via request_user_input if any meaningful decision exists. Ask even if there is only one question. Do not auto-resolve recommended options.

If no user decision is needed, produce one decision-complete <proposed_plan> block. The plan must specify the task id, intended behavior, files or modules likely touched, tests to add/run, verification command, completion-status update, and conventional commit intent.

Do not mutate files in this planning turn.`;
}

function buildExecutionPrompt(args: Args, taskSelector: string, planText: string): string {
  return `Use $actorble-task-runner to execute the approved Actorble task plan.

Approved plan:
${planText}

Task document: ${args.taskDoc}
Task selector: ${taskSelector}

Follow TDD. Preserve unrelated user changes. Verify with the narrowest relevant tests. Mark the task complete in the task document only after verification passes. Commit only task-related changes with a conventional commit.

At the end, report the task id, changed behavior, tests run, commit hash, and residual risk. If the sandbox prevents staging or committing, report the exact conventional commit message that should be used for the task.`;
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

function readTaskEntries(cwd: string, taskDoc: string): TaskEntry[] {
  const taskPath = resolve(cwd, taskDoc);
  return parseTaskEntries(readFileSync(taskPath, "utf8"));
}

function parseTaskEntries(text: string): TaskEntry[] {
  const lines = text.split(/\r?\n/);
  const entries: TaskEntry[] = [];
  let current: TaskEntry | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = /^###\s+(.+?)\s*$/.exec(lines[index]);
    if (heading) {
      if (current) {
        current.terminal = isTerminalTask(current.title, current.statusText);
        entries.push(current);
      }
      const title = heading[1].trim();
      current = {
        id: taskIdFromHeading(title),
        title,
        line: index + 1,
        statusText: null,
        terminal: false,
      };
      continue;
    }

    if (current) {
      const status = /^-\s*Status:\s*(.+?)\s*$/.exec(lines[index]);
      if (status) {
        current.statusText = status[1].trim();
      }
    }
  }

  if (current) {
    current.terminal = isTerminalTask(current.title, current.statusText);
    entries.push(current);
  }

  return entries;
}

function taskIdFromHeading(title: string): string {
  return title.split(/\s+/)[0].replace(/[.:]$/, "");
}

function isTerminalTask(title: string, statusText: string | null): boolean {
  if (statusText) {
    const checkbox = /\[([^\]]*)\]/.exec(statusText);
    if (checkbox) {
      return /^[xX-]$/.test(checkbox[1].trim());
    }
    return /\bCompleted\b|Rejected|완료|반려/.test(statusText);
  }

  return /\bCompleted\b|완료/.test(title);
}

function selectTaskEntry(args: Args): TaskEntry | null {
  const entries = readTaskEntries(args.cwd, args.taskDoc);

  if (args.task === "next") {
    return entries.find((entry) => !entry.terminal) ?? null;
  }

  const selected = entries.find((entry) => entry.id === args.task);
  if (!selected) {
    fail(`Task '${args.task}' was not found in ${args.taskDoc}`);
  }
  if (selected.terminal) {
    fail(`Task '${args.task}' is already terminal in ${args.taskDoc}`);
  }
  return selected;
}

function assertTaskMarkedTerminal(args: Args, taskId: string): void {
  const updated = readTaskEntries(args.cwd, args.taskDoc).find((entry) => entry.id === taskId);
  if (!updated) {
    fail(`Task '${taskId}' disappeared from ${args.taskDoc}`);
  }
  if (!updated.terminal) {
    fail(`Task '${taskId}' did not reach a terminal status after execution`, {
      taskId,
      status: updated.statusText,
      line: updated.line,
    });
  }
}

function gitStatus(cwd: string): string {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fail("Could not read git status", {
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return result.stdout;
}

function assertCleanWorktree(cwd: string, taskId: string): void {
  const status = gitStatus(cwd).trim();
  if (status) {
    fail(`Worktree must be clean before orchestrating task '${taskId}'`, {
      status: status.split(/\r?\n/),
    });
  }
}

function isWorktreeDirty(cwd: string): boolean {
  return gitStatus(cwd).trim().length > 0;
}

function commitDirtyWorktree(cwd: string, message: string): string {
  const add = spawnSync("git", ["add", "--all"], {
    cwd,
    encoding: "utf8",
  });
  if (add.status !== 0) {
    fail("Parent process could not stage task changes", {
      stdout: add.stdout,
      stderr: add.stderr,
      message,
    });
  }

  const commit = spawnSync("git", ["commit", "-m", message], {
    cwd,
    encoding: "utf8",
  });
  if (commit.status !== 0) {
    fail("Parent process could not commit task changes", {
      stdout: commit.stdout,
      stderr: commit.stderr,
      message,
    });
  }

  const head = gitHead(cwd);
  if (!head) {
    fail("Parent commit succeeded but HEAD could not be read", { message });
  }
  return head;
}

function extractCommitMessage(text: string, taskId: string): string {
  const patterns = [
    /Intended commit message(?: remains)?:\s*`([^`]+)`/i,
    /Commit message:\s*`([^`]+)`/i,
    /Commit:\s*\n-\s*`([^`]+)`/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1] && isConventionalCommit(match[1])) {
      return match[1];
    }
  }

  return `chore(actorble): complete ${taskId}`;
}

function isConventionalCommit(message: string): boolean {
  return /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([^)]+\))?!?:\s+\S/.test(message);
}

async function startThread(client: AppServerClient, args: Args): Promise<{ threadId: string; model: string }> {
  const threadStart = await client.request("thread/start", {
    cwd: args.cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    ...(args.model ? { model: args.model } : {}),
  });
  if (!isRecord(threadStart) || !isRecord(threadStart.thread) || typeof threadStart.thread.id !== "string") {
    fail("thread/start response did not include a thread id", threadStart);
  }
  return {
    threadId: threadStart.thread.id,
    model: args.model ?? String(threadStart.model ?? "default"),
  };
}

async function runTaskIteration(
  client: AppServerClient,
  args: Args,
  task: TaskEntry,
  iteration: number,
): Promise<TaskRunResult> {
  assertCleanWorktree(args.cwd, task.id);
  const beforeCommit = gitHead(args.cwd);
  const { threadId, model } = await startThread(client, args);

  emit({ state: "PLAN_CHECK", taskDoc: args.taskDoc, task: task.id, iteration, threadId });
  const plan = await runTurn(client, threadId, buildPlanningPrompt(args, task.id), {
    approvalPolicy: "never",
    effort: "medium",
    collaborationMode: {
      mode: "plan",
      settings: {
        model,
        reasoning_effort: "medium",
        developer_instructions: null,
      },
    },
  });
  if (!plan.planText || !plan.planText.trim()) {
    fail("Planning turn completed without a proposed plan", {
      taskId: task.id,
      lastAgentMessage: plan.lastAgentMessage,
    });
  }

  emit({ state: "EXECUTE", taskDoc: args.taskDoc, task: task.id, iteration, threadId });
  const execute = await runTurn(client, threadId, buildExecutionPrompt(args, task.id, plan.planText), {
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
        model,
        reasoning_effort: null,
        developer_instructions: null,
      },
    },
  });

  assertTaskMarkedTerminal(args, task.id);

  let afterCommit = gitHead(args.cwd);
  let parentCommit = false;
  if (afterCommit === beforeCommit && isWorktreeDirty(args.cwd)) {
    if (!args.parentCommit) {
      fail(`Task '${task.id}' left uncommitted changes and parent commits are disabled`, {
        taskId: task.id,
        status: gitStatus(args.cwd).trim().split(/\r?\n/),
      });
    }
    const commitMessage = extractCommitMessage(execute.lastAgentMessage ?? "", task.id);
    afterCommit = commitDirtyWorktree(args.cwd, commitMessage);
    parentCommit = true;
  }

  if (isWorktreeDirty(args.cwd)) {
    fail(`Task '${task.id}' left the worktree dirty after execution`, {
      taskId: task.id,
      status: gitStatus(args.cwd).trim().split(/\r?\n/),
    });
  }

  const result: TaskRunResult = {
    taskId: task.id,
    threadId,
    commit: afterCommit !== beforeCommit ? afterCommit : null,
    parentCommit,
    tests: extractTests(execute.lastAgentMessage ?? ""),
    summary: execute.lastAgentMessage ?? "",
  };
  emit({
    state: "TASK_DONE",
    taskId: result.taskId,
    threadId: result.threadId,
    commit: result.commit,
    parentCommit: result.parentCommit,
    tests: result.tests,
  });
  return result;
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

    const loopMode = !args.once && args.task === "next";
    const results: TaskRunResult[] = [];
    for (let iteration = 1; iteration <= args.maxTasks; iteration += 1) {
      const task = selectTaskEntry(args);
      if (!task) {
        emit({
          state: "DONE",
          taskDoc: args.taskDoc,
          taskId: args.task,
          allDone: true,
          completedTasks: results.map((result) => result.taskId),
          commits: results.map((result) => result.commit).filter((commit): commit is string => Boolean(commit)),
          tests: [...new Set(results.flatMap((result) => result.tests))],
          summary: results.map((result) => result.summary).filter(Boolean).join("\n\n---\n\n"),
        });
        return;
      }

      const result = await runTaskIteration(client, args, task, iteration);
      results.push(result);

      if (!loopMode) {
        emit({
          state: "DONE",
          taskDoc: args.taskDoc,
          taskId: task.id,
          allDone: false,
          completedTasks: [task.id],
          commits: result.commit ? [result.commit] : [],
          tests: result.tests,
          summary: result.summary,
        });
        return;
      }
    }

    fail(`Reached --max-tasks=${args.maxTasks} before ${args.taskDoc} reached a terminal state`, {
      completedTasks: results.map((result) => result.taskId),
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

  const entries = parseTaskEntries(`# Tasks

### T0. Scaffold - 완료

### TSPS-01 First Task
- Status: [x] Completed

### TSPS-02 Next Task
- Status: [ ] Not started

### TSPS-03 Rejected Task
- Status: [-] Rejected (반려됨)
`);
  if (entries.length !== 4 || entries[0].id !== "T0" || entries[2].id !== "TSPS-02") {
    fail("self-test failed to parse task ids");
  }
  if (!entries[0].terminal || !entries[1].terminal || entries[2].terminal || !entries[3].terminal) {
    fail("self-test failed to classify task terminal status");
  }

  const commitMessage = extractCommitMessage(
    "Commit:\n- Not created.\n- Intended commit message remains: `feat(browser): add selection state`.",
    "TSPS-04",
  );
  if (commitMessage !== "feat(browser): add selection state") {
    fail("self-test failed to extract intended commit message");
  }
  if (extractCommitMessage("", "TSPS-04") !== "chore(actorble): complete TSPS-04") {
    fail("self-test failed to build fallback commit message");
  }

  emit({ state: "SELF_TEST_OK" });
}

main().catch((error) => {
  log(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
