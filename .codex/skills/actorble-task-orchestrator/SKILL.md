---
name: actorble-task-orchestrator
description: Orchestrate Actorble implementation task loops through Codex App Server Plan mode. Use when Codex is asked to automatically run Actorble task documents end-to-end, plan-gate a task before execution, forward child task questions to the current user, or execute the next task from browser/docs/implementation_tasks.md with the existing actorble-task-runner workflow.
---

# Actorble Task Orchestrator

Use this skill to run one Actorble task through an App Server backed planning gate before execution.

## Workflow

1. Read `references/prompt-contract.md`.
2. Start the orchestrator script from the repository root:

   ```bash
   pnpm dlx tsx .codex/skills/actorble-task-orchestrator/scripts/orchestrate-task-loop.ts --task-doc browser/docs/implementation_tasks.md --task next
   ```

3. Keep the command session open while it runs.
4. If the script prints `NEEDS_HUMAN`, call `request_user_input` in the current root session using the emitted `questions` payload.
5. Send the response JSON back to the running command's stdin.
6. When the script prints `DONE`, report the task id, tests, commit, and residual risks.
7. If the script prints `FAILED`, report the reason and the last event summary.

## Hard Rules

- Use only Codex App Server. Do not fall back to `codex exec`, `codex mcp-server`, or PTY control of the interactive TUI.
- Treat any child question as mandatory. If one or more questions are emitted, ask the user; do not auto-select recommended options.
- Preserve the existing Actorble task-runner boundaries: TDD first, narrow task scope, verify, mark task complete, and create a conventional commit.
- Do not run the execution turn unless the planning turn either completes without questions or receives the user's answers through the bridge.

## Script Notes

- The script starts `codex app-server --stdio --enable collaboration_modes`.
- The planning turn uses `collaborationMode.mode = "plan"` and `settings.developer_instructions = null` to use Codex's built-in Plan mode instructions.
- The execution turn switches to default mode and workspace-write sandbox.
- `--self-test` checks the local JSON-RPC bridge without starting App Server.
