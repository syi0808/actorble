---
name: actorble-task-orchestrator
description: Orchestrate Actorble implementation task documents end-to-end through Codex App Server Plan mode. Use when Codex is asked to automatically run every incomplete task in an Actorble task list until the document is complete, plan-gate each task before execution, forward child task questions to the current user, or execute the next task from browser/docs/implementation_tasks.md with the existing actorble-task-runner workflow.
---

# Actorble Task Orchestrator

Use this skill to run an Actorble task document to completion. The orchestrator owns the loop over incomplete task entries; `actorble-task-runner` still owns exactly one task per iteration.

## Workflow

1. Read `references/prompt-contract.md`.
2. Start the orchestrator script from the repository root:

   ```bash
   pnpm dlx tsx .codex/skills/actorble-task-orchestrator/scripts/orchestrate-task-loop.ts --task-doc browser/docs/implementation_tasks.md
   ```

3. Keep the command session open while it runs. With `--task next` (the default), the script repeatedly selects the next non-terminal task from the document and stops only when no incomplete task remains.
4. If the script prints `NEEDS_HUMAN`, call `request_user_input` in the current root session using the emitted `questions` payload.
5. Send the response JSON back to the running command's stdin.
6. When the script prints `TASK_DONE`, keep monitoring; this means one iteration completed and the loop may continue.
7. When the script prints final `DONE`, report completed task ids, commits, tests, and residual risks.
8. If the script prints `FAILED`, report the reason and the last event summary.

Use `--once` only when the user explicitly asks to run a single task. Use `--max-tasks <n>` to lower the safety cap for a long document.

## Hard Rules

- Use only Codex App Server. Do not fall back to `codex exec`, `codex mcp-server`, or PTY control of the interactive TUI.
- Treat any child question as mandatory. If one or more questions are emitted, ask the user; do not auto-select recommended options.
- Preserve the existing Actorble task-runner boundaries: TDD first, narrow task scope, verify, mark task complete, and create a conventional commit.
- Do not run the execution turn unless the planning turn either completes without questions or receives the user's answers through the bridge.
- Do not continue to the next task if the previous iteration leaves the worktree dirty, fails verification, fails to mark the task terminal, or cannot be committed.

## Script Notes

- The script starts `codex app-server --stdio --enable collaboration_modes`.
- Each task iteration starts a fresh App Server thread.
- The planning turn uses `collaborationMode.mode = "plan"` and `settings.developer_instructions = null` to use Codex's built-in Plan mode instructions.
- The execution turn switches to default mode and workspace-write sandbox.
- The script expects a clean worktree before each iteration. If the child cannot write `.git` but leaves a verified terminal task diff, the parent process creates the task commit unless `--no-parent-commit` is set.
- Terminal task entries are detected from `- Status: [x]`, `- Status: [-]`, `Completed`, `Rejected`, `완료`, or `반려`.
- `--self-test` checks the local JSON-RPC bridge without starting App Server.
