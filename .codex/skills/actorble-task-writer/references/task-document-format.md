# Actorble Task Document Format

Use this format for `implementation_tasks.md` style documents.

## Required Sections

1. Title and purpose.
2. Dependency principles.
3. Dependency map.
4. Task sequence.
5. First vertical slice.
6. Execution checklist.

## Dependency Principles

- Place shared primitives below all feature modules.
- Keep diagnostics able to record from many modules without importing their concrete implementations.
- Keep DOM, event dispatch, state application, and style injection inside platform adapter boundaries.
- Keep Action Orchestrator as lifecycle coordinator, not a direct DOM/event module.
- Keep Interaction State Store as semantic state owner, not an effect applier.
- Avoid circular imports; move shared port types into `shared` if needed.

## Task Shape

Each task should include:

- Heading with stable task ID and short name.
- Status line immediately after the heading.
- Briefing: what the task does and why it is separated.
- Dependencies: module prerequisites, not every imported type.
- Decision constraints: pre-decided scope, public API/schema shape, fallback policy, sensitive-data policy, verification depth, and out-of-scope choices when those could otherwise become planning questions.
- Ask only if: the narrow execution-discovered blockers that should still be escalated, or `None expected` when the task is decision-ready.
- Expert preflight: optional strict note for fact-check, research, security/privacy review, cross-package design, or verification strategy that should be handled by a specialist before execution; use `None expected` by default.
- Completion criteria: observable done conditions.
- Test expectations: behavior-focused Vitest cases or verification commands.

Prefer concise task wording. The task should be detailed enough for another engineer to start, but not so detailed that it duplicates the future implementation.

Resolve cross-task decisions before writing the sequence. If a choice affects multiple tasks, record it once in dependency principles or the dependency map, then reference it from tasks instead of letting each task ask again.

Use this task template:

```md
### TASK-ID Short Name

- Status: [ ] Not started
- Briefing: ...
- Dependencies: ...
- Decision constraints:
  - ...
- Ask only if: None expected.
- Expert preflight: None expected.
- Completion criteria:
  - ...
- Test expectations:
  - ...
```

Use `Status: [ ] Not started` for new or incomplete tasks and `Status: [x] Completed` only when repository evidence shows the task has already been finished. The status line is workflow state; it does not replace completion criteria.

## Vertical Slice Guidance

Define the first slice as the shortest path that proves the architecture:

```txt
shared primitives
-> diagnostics trace
-> platform adapter shell
-> resolver
-> surface
-> geometry
-> interactability
-> pointer signals
-> interaction state
-> gesture
-> action orchestrator
-> facade
```

Narrow the slice to one user-visible behavior, such as resolving and clicking a CSS target.

## Quality Checks

- Check task order matches dependency direction.
- Check every task has an explicit status line.
- Check every task has a concrete completion signal.
- Check every task includes TDD or verification guidance.
- Check every task that touches public API, schema, compatibility, privacy/sensitive data, or user-visible workflow has decision constraints.
- Check `Ask only if` entries are reserved for execution-discovered blockers, not ordinary implementation details.
- Check `Expert preflight` is `None expected` unless a specialist answer is likely to prevent a high-impact question or costly wrong implementation.
- Check the document does not secretly ask the implementer to make major product decisions.
