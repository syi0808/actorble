# Actorble Task Orchestrator Prompt Contract

## Loop Contract

The script owns the full task-document loop. For `--task next`, repeat these steps until the task document has no non-terminal task entries:

1. Parse the task document and select the next non-terminal `###` task entry.
2. Start a fresh App Server thread for that task.
3. Run one planning turn and one execution turn for that selected task only.
4. Require the execution turn to verify, mark that selected task terminal, and commit.
5. Emit `TASK_DONE`, then re-read the task document before selecting the next task.
6. Emit final `DONE` only when no incomplete task remains.

Use `--once` to preserve the previous one-task behavior.

## Planning Turn

Run the planning turn in Codex App Server Plan mode with read-only sandbox:

- Use built-in Plan mode instructions by setting `collaborationMode.settings.developer_instructions` to `null`.
- Ask the child agent to use `actorble-task-runner` context, but only for planning.
- Require environment grounding before any question.
- Require `request_user_input` only when a high-impact decision remains unresolved after reading the task entry, architecture docs, ADRs, existing source/tests, and git status.
- Do not ask for low-impact implementation details, test placement, helper names, fixture style, or choices where existing repo patterns imply one answer. The child must make a conservative assumption and record it in the plan.
- Treat missing pre-task decisions as task-document gaps. If such a gap blocks the task, the question must say what source failed to decide it and why the answer changes public behavior, compatibility, privacy, user workflow, or acceptance criteria.
- Permit read-only expert subagents only behind the strict delegation gate below.
- Require exactly one `<proposed_plan>` block only when no high-impact unanswered decision remains.

Planning prompt template:

```text
Use $actorble-task-runner to plan the requested Actorble implementation task, but do not edit files or execute the task yet.

Task document: {taskDoc}
Task selector: {taskSelector}

Ground yourself in the repo before asking questions. Read the task entry, relevant architecture docs, existing source/tests, and git status.

Question gate:
- Treat the task document, architecture docs, ADRs, and existing code as the decision source of truth. Resolve choices from those sources before asking.
- Ask the user via request_user_input only when a high-impact decision remains unresolved after grounding. High-impact means public API/schema shape, compatibility or privacy policy, cross-task semantics, user-visible workflow, or task scope that changes acceptance criteria.
- Do not ask about low-impact implementation details, test placement, helper names, fixture style, or choices where existing repo patterns clearly imply one answer. Make a conservative assumption and record it in the plan.
- If the unresolved choice should have been decided during task writing, label it as a task-doc gap in the question and explain which source failed to decide it. Batch related blockers into one question set.

Expert delegation gate:
- If subagent tools are available, use at most one read-only expert subagent during planning only when it is likely to prevent a high-impact user question or avoid a costly wrong plan.
- Delegate only for current external fact-checks, browser/platform/library behavior research, security/privacy review, cross-package architecture design, or nontrivial verification strategy. Do not delegate routine repo search, helper names, test placement, local implementation details, or questions that existing docs/code already answer.
- Give the subagent a narrow persona and question, pass raw paths or artifacts, and ask for evidence and a recommendation. Do not ask the subagent to edit files or make the user decision.
- In the proposed plan, record any expert used, the question asked, evidence considered, and how it affected the plan. If no expert was used, omit this section.

If no high-impact unresolved user decision remains, produce one decision-complete <proposed_plan> block. The plan must specify the task id, intended behavior, files or modules likely touched, tests to add/run, verification command, completion-status update, conventional commit intent, and a Decisions and Assumptions section that lists choices resolved from source material plus conservative assumptions made without asking.

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

At the end, report the task id, changed behavior, tests run, commit hash, and residual risk. If the sandbox prevents staging or committing, report the exact conventional commit message that should be used for the task.
```

## Parent Session Bridge

When the script prints `NEEDS_HUMAN`, map the emitted `questions` array directly to the current session's `request_user_input` tool. Return the tool result to the running command as one JSON line:

```json
{"answers":{"question_id":{"answers":["selected label or free-form answer"]}}}
```

Do not change files while waiting for user input.

## Script Events

- `PLAN_CHECK`: one selected task is entering Plan mode.
- `NEEDS_HUMAN`: parent session must ask the emitted questions and return answers on stdin.
- `EXECUTE`: one approved task plan is entering execution.
- `TASK_DONE`: one task iteration completed; keep monitoring because the loop may continue.
- `DONE`: the requested single task is finished, or the full task document has no incomplete entries.
- `FAILED`: stop; report `reason` and `lastEvent`.
