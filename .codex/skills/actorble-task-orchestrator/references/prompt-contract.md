# Actorble Task Orchestrator Prompt Contract

## Planning Turn

Run the planning turn in Codex App Server Plan mode with read-only sandbox:

- Use built-in Plan mode instructions by setting `collaborationMode.settings.developer_instructions` to `null`.
- Ask the child agent to use `actorble-task-runner` context, but only for planning.
- Require environment grounding before any question.
- Require `request_user_input` whenever there is at least one meaningful user decision.
- Require exactly one `<proposed_plan>` block only when no unanswered decision remains.

Planning prompt template:

```text
Use $actorble-task-runner to plan the requested Actorble implementation task, but do not edit files or execute the task yet.

Task document: {taskDoc}
Task selector: {taskSelector}

Ground yourself in the repo before asking questions. Read the task entry, relevant architecture docs, existing source/tests, and git status.

Ask the user via request_user_input if any meaningful decision exists. Ask even if there is only one question. Do not auto-resolve recommended options.

If no user decision is needed, produce one decision-complete <proposed_plan> block. The plan must specify the task id, intended behavior, files or modules likely touched, tests to add/run, verification command, completion-status update, and conventional commit intent.

Do not mutate files in this planning turn.
```

## Execution Turn

Run the execution turn after planning succeeds or after the user answers every child question.

Execution prompt template:

```text
Use $actorble-task-runner to execute the approved Actorble task plan.

Approved plan:
{planText}

Task document: {taskDoc}
Task selector: {taskSelector}

Follow TDD. Preserve unrelated user changes. Verify with the narrowest relevant tests. Mark the task complete in the task document only after verification passes. Commit only task-related changes with a conventional commit.

At the end, report the task id, changed behavior, tests run, commit hash, and residual risk.
```

## Parent Session Bridge

When the script prints `NEEDS_HUMAN`, map the emitted `questions` array directly to the current session's `request_user_input` tool. Return the tool result to the running command as one JSON line:

```json
{"answers":{"question_id":{"answers":["selected label or free-form answer"]}}}
```

Do not change files while waiting for user input.
