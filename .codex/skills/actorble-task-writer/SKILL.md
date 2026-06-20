---
name: actorble-task-writer
description: Write or revise Actorble implementation task documents with dependency-aware sequencing and explicit completion status fields. Use when Codex is asked to create docs such as implementation_tasks.md, derive module dependencies, split implementation work into tasks, or brief tasks before execution.
---

# Actorble Task Writer

Use this skill to turn Actorble architecture and scaffold structure into implementation tasks. Do not implement code while using this skill unless the user separately asks for execution.

## Workflow

1. Ground in the current repo state.
   - Read applicable `AGENTS.md`.
   - Inspect architecture docs, scaffolded modules, existing task docs, and `git status --short`.
2. Derive dependency direction before listing tasks.
   - Composition layers may depend on engines.
   - Engines should depend on shared primitives and narrow ports.
   - Platform-specific DOM/event/style code should remain behind platform adapters.
3. Write tasks that are executable.
   - Give each task a stable ID.
   - Include an explicit completion status line.
   - Include briefing, dependencies, completion criteria, and test expectations.
   - Include decision constraints for scope, public API/schema shape, fallback policy, sensitive-data policy, and verification depth whenever those choices could otherwise be asked during execution.
   - Include an `Ask only if` note for genuine execution-discovered blockers; write `None expected` when the task is fully decision-ready.
   - Include an `Expert preflight` note only when fact-check, research, security/privacy review, cross-package design, or verification strategy needs a specialist before execution; write `None expected` otherwise.
   - Keep task boundaries small enough for TDD and review.
4. Keep the document implementation-neutral.
   - Define behavior and boundaries, not full code designs.
   - Avoid over-specifying internals, but do specify schema/API/fallback policy when leaving it open would force the implementer to ask.
5. Highlight the first vertical slice.
   - Identify the smallest behavior that proves the module graph works end to end.

Read `references/task-document-format.md` before writing or restructuring a task document.

## Defaults

- Prefer `browser/docs/implementation_tasks.md` for browser-package tasks unless the user names another path.
- Keep Actorble naming current even if source architecture docs still contain older project names.
- Preserve user-authored content and staged changes; edit around them when possible.
- Respect the active collaboration mode. In Plan Mode, propose the task document shape without mutating files.
