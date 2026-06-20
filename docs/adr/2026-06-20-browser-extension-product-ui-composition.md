# ADR 2026-06-20: Browser Extension Product UI Composition

Status: Accepted
Date: 2026-06-20

## Context

The browser extension has the right product boundaries, but the popup and side
panel still read like engineering scaffolding. The popup shows several text
commands with the same weight. The side panel exposes scenario metadata,
timeline editing, selected step fields, target picking, locator candidates,
JSON repair, validation, run trace, and failure detail with similar visual
weight.

The extension needs to feel like a browser product without moving runtime
semantics into the UI layer. The existing workflow builder and side panel
recomposition decisions remain valid, but the visible shell needs stronger
command hierarchy, less diagnostic noise, and a shared UI language.

## Decision

The popup becomes a quick-run remote. It shows current tab readiness, the
selected scenario, a primary run command, secondary record and open-panel
commands, and active-run controls only while a run is active. It does not expose
builder editing, locator review, JSON repair, or trace details.

The side panel becomes a product workbench. A sticky scenario shell keeps the
selected scenario, save/run/record commands, dirty state, and target tab status
available. The main workbench is split into a timeline and selected step editor.
Target assignment is inline within the selected step editor. Locator candidates
are hidden unless selection is ambiguous, failed, or being inspected in
diagnostics.

The extension uses a small shared UI system for its entrypoints. Commands have
explicit hierarchy. Familiar utility actions use icons with accessible labels
and tooltips. Status uses compact badges and field state. Top-level sections are
not all equal floating cards. Diagnostics and raw JSON repair stay behind
disclosure controls unless they are needed for the next user action.

## Consequences

The UI can keep the current authoring session, recorder, inspector, validation,
compiler, and trace module boundaries while replacing the visible markup and
styles.

Popup changes should be low risk because the popup already owns a narrow run
control model. Side panel changes are broader because markup, rendering, and CSS
need to reflect the scenario shell, timeline, selected step editor, inline target
assignment, and diagnostics drawer hierarchy.

Tests should keep covering state and button availability, but visual structure
needs additional DOM-level checks as the UI primitives settle.

## Alternatives Considered

Only restyle the existing cards. This would improve polish but leave the main
problem intact: the product workflow would still look like unrelated feature
blocks.

Move more controls into the popup. This conflicts with popup lifetime and focus
behavior, and it would duplicate the side panel builder.

Make locator candidates and JSON repair more prominent. Those surfaces are
useful for repair and diagnostics, but they distract from normal authoring when
shown by default.

## References

- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-18-browser-extension-workflow-builder.md`
- `docs/adr/2026-06-19-browser-extension-sidepanel-recomposition.md`
