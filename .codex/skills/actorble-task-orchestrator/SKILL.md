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
4. If the script prints `NEEDS_HUMAN`, inspect whether the question is a real blocker or a task-document gap. Call `request_user_input` in the current root session using the emitted `questions` payload; do not answer it yourself.
5. Send the response JSON back to the running command's stdin.
6. When the script prints `TASK_DONE`, keep monitoring; this means one iteration completed and the loop may continue.
7. When the script prints final `DONE`, report completed task ids, commits, tests, and residual risks.
8. If the script prints `FAILED`, report the reason and the last event summary.

Use `--once` only when the user explicitly asks to run a single task. Use `--max-tasks <n>` to lower the safety cap for a long document.

## Question Discipline

The orchestrator should reduce unnecessary questions at the planning source, not by silently answering child questions in the parent session.

- Planning children must resolve decisions from the task document, architecture docs, ADRs, and existing code before asking.
- Ask only for unresolved high-impact decisions: public API/schema shape, compatibility or privacy policy, cross-task semantics, user-visible workflow, or task scope that changes acceptance criteria.
- Do not ask about low-impact implementation details, test placement, helper names, fixture style, or choices where repo patterns clearly imply one answer. Record conservative assumptions in the plan instead.
- If a question exposes a missing pre-task decision, treat it as a task-document gap. If the same gap class could affect later tasks, complete the current safe task only, then rerun with `--once` or pause the full loop and update the task document with `actorble-task-writer` before continuing.
- For new or recently revised task documents, prefer a short decision-readiness pass before long orchestration: scan for open API shape, fallback policy, sensitive-data policy, verification scope, and cross-package boundary choices that should be settled in the task document.

## Expert Delegation

Use expert subagents sparingly. Delegation is a way to resolve evidence gaps before bothering the user, not a default planning step.

- Default to no subagent. Use one only when it can prevent a high-impact user question or avoid a costly wrong plan.
- Valid triggers: current external fact-check, browser/platform/library behavior research, security or privacy review, cross-package architecture design, or nontrivial verification strategy.
- Invalid triggers: routine repo search, helper names, test placement, fixture style, simple implementation details, or anything already answered by the task document, architecture docs, ADRs, or local code.
- Prefer one read-only expert per task. Use more than one only for independent high-impact questions with different evidence domains.
- Give the expert a narrow persona and question, pass raw paths/artifacts, and ask for evidence plus a recommendation. Do not ask the expert to edit files or decide user preferences.
- Require the child plan to record any expert used, the evidence considered, and how the recommendation affected the plan.

## Hard Rules

- Use only Codex App Server. Do not fall back to `codex exec`, `codex mcp-server`, or PTY control of the interactive TUI.
- Treat any emitted child question as mandatory. If one or more questions are emitted, ask the user; do not auto-select recommended options.
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
