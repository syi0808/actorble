---
name: actorble-task-runner
description: Clarify and execute Actorble implementation tasks from task docs using a TDD-first workflow. Use when Codex is asked to run a task from implementation_tasks.md, implement an Actorble module slice, or continue task execution after a task has been selected.
---

# Actorble Task Runner

Use this skill to execute one Actorble implementation task at a time with clear intent, tests, implementation, and verification.

## Workflow

1. Select and understand the task.
   - Read the requested task from the task doc.
   - Read related architecture docs, module READMEs, source files, tests, and `AGENTS.md`.
   - Inspect `git status --short` and preserve unrelated user changes.
2. Clarify only high-impact ambiguity.
   - Ask when goal, scope, success criteria, public API, or compatibility constraints are unclear after exploration.
   - If ambiguity is low impact, make a conservative assumption and report it.
3. Execute with TDD.
   - Add or update the failing Vitest case first.
   - Implement the smallest change that passes.
   - Refactor while keeping tests green.
4. Preserve module boundaries.
   - Follow the dependency map in the task doc.
   - Do not call DOM APIs outside platform adapter modules.
   - Do not merge geometry calculation with interactability judgment.
5. Verify and report.
   - Run the narrowest relevant tests.
   - Summarize changed files, behavior completed, tests run, and residual risk.

Read `references/execution-protocol.md` before executing a task that changes code.

## Defaults

- Use `browser/docs/implementation_tasks.md` unless the user names another task document.
- Use pnpm commands from the package being changed.
- Prefer behavior-focused tests over snapshot-only tests.
- Respect the active collaboration mode. In Plan Mode, produce an execution plan only and do not mutate files.
