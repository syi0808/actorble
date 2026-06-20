# ADR 2026-06-20: Browser Extension Workflow Builder UX

Status: Accepted
Date: 2026-06-20

## Context

The side panel now has better command hierarchy, but the builder still feels
like a form around scenario JSON. A commercial workflow builder should make the
ordered flow, selected step, action palette, step properties, and step feedback
clear without exposing implementation details first.

The current authoring model can already create, select, duplicate, reorder,
validate, dry-run, and save steps. The UI needs to present those behaviors as a
workflow authoring surface, not as separate low-level controls.

## Decision

The side panel builder uses a flow-and-properties model.

The step flow is the primary navigation for the scenario. Each step shows order,
action, target or input summary, validation state, and selected state. Selecting
a step opens its properties inspector.

Adding steps uses an action palette. The palette shows available action
families and lets the user add a new step or insert after the selected step.
The existing select control may remain as a fallback, but it is not the main
authoring interaction.

Selected-step operations such as duplicate, move, delete, and dry-run are
context actions in the properties inspector. Target picking starts from the
selected step property area. JSON repair and diagnostics remain behind
disclosure controls.

Validation and run feedback attach to the affected step before they appear in
diagnostics. The diagnostics drawer remains available for detail, but it does
not replace inline workflow feedback.

## Consequences

The extension can keep the existing builder session and storage contract while
changing side panel markup, rendering, and styling.

The side panel needs additional view rendering for step cards and action palette
buttons. These controls should reuse the existing builder operations instead of
adding new document mutation paths.

Keyboard and fallback controls should remain available because the builder still
needs to work in a browser extension panel with constrained width.

## Alternatives Considered

Keep the current timeline plus form layout. This keeps implementation small but
does not make the panel feel like a workflow builder.

Adopt a full visual node canvas. This is heavier than the current product needs
and would add drag geometry, canvas state, and zoom behavior before the core
step authoring experience is strong.

Replace the current vanilla WXT UI with a framework. That may be useful later,
but the current behavior can be implemented with the existing WXT entrypoint and
small shared UI helpers.

## References

- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-18-browser-extension-workflow-builder.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
