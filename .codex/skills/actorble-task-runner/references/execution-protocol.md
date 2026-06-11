# Actorble Task Execution Protocol

Use this protocol before changing code for an Actorble implementation task.

## Grounding

- Read the task doc entry completely.
- Read applicable architecture sections and module READMEs.
- Inspect current tests and package scripts.
- Run `git status --short` and identify unrelated changes.

## Clarification Gate

Ask the user only when exploration cannot answer a high-impact decision:

- Which task or slice should be executed.
- Whether the work changes public API.
- Which compatibility behavior to preserve.
- Whether to prefer a narrow implementation or a broader refactor.

Proceed with stated assumptions for lower-impact details.

## TDD Loop

1. Write or update a failing Vitest test.
2. Run the narrow test command and confirm failure when practical.
3. Implement the smallest passing code.
4. Run the narrow test command again.
5. Refactor without changing behavior.
6. Run the relevant suite or explain why it could not run.

## Task Completion and Commit

After verification succeeds:

1. Update the executed task entry in the task document from `Status: [ ] Not started` to `Status: [x] Completed`.
2. If the task document uses another explicit status format, preserve that format and mark only the executed task complete.
3. Run `git status --short` and inspect the relevant diff.
4. Stage only task-related files, including the task document status update.
5. Create one conventional commit for the completed task.

Do not commit unrelated user changes. If unrelated changes are already staged, do not unstage or modify them unless the user explicitly asks; report that the commit is blocked by pre-existing staged changes.

## Boundary Rules

- Resolve targets before dispatching input.
- Keep Surface Engine responsible for spaces, scroll paths, and coordinate mapping.
- Keep Geometry Engine responsible for rects and points.
- Keep Interactability Engine responsible for whether an action may proceed.
- Keep Pointer Engine responsible for coordinates and button state only.
- Keep Interaction State Store responsible for semantic hover, active, focus, typing, and dragging state.
- Keep Platform Adapter responsible for DOM reads/writes, event dispatch, state application, and style injection.

## Completion Report

Report:

- Task ID or task title.
- Behavior completed.
- Files changed.
- Tests run and results.
- Commit hash.
- Assumptions made.
- Residual risks or follow-up tasks.
