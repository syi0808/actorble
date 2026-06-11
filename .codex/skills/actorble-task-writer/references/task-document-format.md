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
- Completion criteria: observable done conditions.
- Test expectations: behavior-focused Vitest cases or verification commands.

Prefer concise task wording. The task should be detailed enough for another engineer to start, but not so detailed that it duplicates the future implementation.

Use this task template:

```md
### TASK-ID Short Name

- Status: [ ] Not started
- Briefing: ...
- Dependencies: ...
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
- Check the document does not secretly ask the implementer to make major product decisions.
