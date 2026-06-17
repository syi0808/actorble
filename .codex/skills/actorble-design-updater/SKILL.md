---
name: actorble-design-updater
description: Update Actorble architecture and design documentation using repo-level architecture docs as the single source of truth, and record design decision history in ADRs. Use when Codex is asked to change Actorble design policy, architecture docs, option/API design, module boundaries, cross-package behavior, or any design update that should be documented before implementation.
---

# Actorble Design Updater

Use this skill to make design documentation changes before or alongside implementation planning. Keep architecture truth centralized and keep decision history explicit.

## Source Of Truth Policy

- Treat repo-level architecture docs under `docs/` as the single source of design truth.
- Use `docs/high-level-architecture.md` for cross-platform and system-wide architecture.
- Use the relevant repo-level domain architecture doc for package or platform design, such as `docs/browser-architecture.md` or `docs/browser-extension-architecture.md`.
- From a package directory, resolve these as `../docs/...`; do not create competing design truth inside package-local docs.
- Package `README.md`, module `README.md`, task docs, tests, and inline comments may summarize or point to architecture, but must not become the authoritative design record.
- Record decision history in `docs/adr/`. Architecture docs state the current design; ADRs explain why the design changed.

## Workflow

1. Ground in the repo.
   - Read applicable `AGENTS.md`.
   - Inspect `git status --short`.
   - Read `docs/high-level-architecture.md` and the relevant repo-level architecture doc before editing.
   - Check existing `docs/adr/` entries if the directory exists.
2. Identify the design decision.
   - Separate current-state architecture updates from decision history.
   - Ask only when the decision, scope, compatibility rule, or target architecture doc is materially unclear.
3. Update the architecture source of truth.
   - Edit the relevant repo-level architecture doc directly.
   - Keep the text declarative: ownership, boundaries, contracts, lifecycle, and invariants.
   - Avoid implementation task detail unless it is required to define the architecture.
4. Add or update an ADR.
   - Create `docs/adr/` when it does not exist.
   - Use `YYYY-MM-DD-short-title.md` filenames.
   - Include: title, status, date, context, decision, consequences, alternatives considered, and references.
   - Use `Status: Proposed` when the user has not accepted the decision; use `Status: Accepted` when the user asks to adopt it.
   - If replacing a prior decision, mark the new ADR as superseding the old one and update the old ADR status when appropriate.
5. Keep links and ownership coherent.
   - Link the architecture update to the relevant ADR when useful.
   - Link the ADR back to the architecture doc section it updates.
   - Do not duplicate long design text between architecture docs and ADRs.
6. Verify.
   - Review `git diff`.
   - Check links and paths.
   - Run docs formatting or tests only when the repo provides a relevant command or the change includes code.
7. Report.
   - Summarize the architecture doc changes, ADR added or updated, assumptions, and any unresolved design questions.

## ADR Template

```markdown
# ADR YYYY-MM-DD: Short Decision Title

Status: Proposed
Date: YYYY-MM-DD

## Context

Describe the forces, constraints, and problem that require a decision.

## Decision

State the decision in present tense.

## Consequences

List expected benefits, costs, compatibility impact, and migration implications.

## Alternatives Considered

Record serious alternatives and why they were not chosen.

## References

- `docs/high-level-architecture.md`
- `docs/<relevant-architecture-doc>.md`
```

## Defaults

- Prefer editing architecture docs before task docs.
- Prefer one ADR per meaningful decision, not one ADR per file edit.
- Use the current date for new ADR filenames.
- Preserve user-authored changes and staged changes; edit around them.
- Respect the active collaboration mode. In Plan Mode, propose the documentation changes without mutating files.
