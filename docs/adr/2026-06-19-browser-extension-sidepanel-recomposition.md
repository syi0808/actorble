# ADR 2026-06-19: Browser Extension Side Panel Recomposition

Status: Proposed
Date: 2026-06-19

## Context

The browser extension side panel has the right underlying model for scenario
authoring, including draft documents, selected steps, selected target slots,
recording state, validation issues, run state, and trace view. The visible UI,
however, is still organized as independent cards for scenarios, document fields,
recording, steps, step editing, target picking, locator preview, validation, and
run status.

That card-first structure prevents the main product workflow from feeling
coherent. Users need to create or load a scenario, build steps, assign targets,
record drafts, validate, dry-run, run, and save as one scenario-building flow.
Standalone cards make target picking, locator preview, validation, and run
feedback appear like separate features rather than supporting states for the
selected scenario and selected step.

## Decision

The side panel is recomposed around the scenario builder workflow instead of
independent feature cards.

The Document card is removed as a primary surface. Scenario selection, creation,
metadata editing, dirty/saved state, import/export, save, record, and run belong
to a scenario shell.

The Steps and Step Editor cards are merged into a builder workbench. The step
list and selected step editor are one work surface, and step operations are
shown next to the timeline or selected step they affect.

Target Picker is no longer a standalone card. Target selection starts from the
selected step editor as a `Set target` interaction for a concrete target slot.
The picker and locator candidate preview inherit the selected scenario, selected
step, and selected target slot correlation.

Recording remains a primary input path, but its output is reviewed inside the
builder flow. A stopped recording can produce a recorded draft review where the
user explicitly replaces the current draft, appends steps, saves as a new
scenario, exports, or discards.

Locator preview, validation details, run trace, and failure detail are moved to
a collapsible debug drawer. They support authoring and troubleshooting, but they
are not primary cards in the default builder workflow.

## Consequences

The extension can preserve the existing authoring session, recorder, inspector,
locator preview, validation, compiler, run, and trace boundaries while replacing
the side panel layout and DOM wiring.

The primary UI becomes easier to reason about because every control answers one
of these questions: which scenario is open, which step is selected, what does
the step do, what target slot is being filled, and what should happen to the
draft.

Debugging information becomes less visually dominant. Validation or runtime
failure can still surface immediately by opening or highlighting the debug
drawer.

Implementation should expect broad side panel markup, styling, and rendering
changes. Core builder and orchestration modules should only change when the new
UI exposes a missing behavior or state.

## Alternatives Considered

Keep the existing cards and rename them. This was rejected because the problem
is structural: the cards split a single scenario-building workflow into separate
features.

Patch only Recording. This was rejected because the recorder pipeline already
exists, and the larger issue is that recorded drafts are not absorbed into a
coherent builder review and editing flow.

Keep Target Picker and Locator Preview as diagnostics cards. This was rejected
for the default UI because target picking is a step-editing action. Diagnostics
can remain available through the debug drawer.

Expose raw JSON editing more prominently to complete missing fields. This was
rejected because the side panel is meant to be a structured scenario builder.
Raw JSON remains an import/export and advanced repair path.

## References

- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-18-browser-extension-workflow-builder.md`
