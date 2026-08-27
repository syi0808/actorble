# ADR 2026-08-27: Cursor Feedback Labels

Status: Accepted
Date: 2026-08-27

## Context

Actorble can display more than one visual cursor when separate runtime
instances or roles are demonstrated together. Cursor shape alone does not tell
viewers which participant a cursor represents, especially in recordings and
role-oriented scenarios. General annotations or action captions would add
presentation semantics that do not belong in the interaction runtime.

The browser overlay is clipped to the viewport. A label attached only at the
cursor's preferred lower-right position could therefore become partially or
fully invisible near viewport edges.

## Decision

Cursor feedback accepts either the existing boolean or a cursor feedback object
with an optional user-provided `label`. The object form enables the cursor
channel. Empty and whitespace-only values are treated as no label, while the
existing boolean and string presets remain compatible.

The built-in Visual Layer renders the label as compact, single-line,
non-interactive text attached to the cursor graphic. It prefers a lower-right
placement, flips horizontally or vertically before crossing the corresponding
viewport edge, and finally clamps both axes to a viewport-safe margin. Its
width is bounded and overflowing text is ellipsized. Cursor pressed-state
scaling applies only to the cursor graphic, not the label.

The label is visual identity metadata. It is not a stable actor ID, pointer
state, action caption, diagnostic correlation key, or presentation-runtime
annotation. Rendering uses text content rather than HTML, and the overlay
continues to be ignored by hit-testing and target resolution.

## Consequences

Users can distinguish role- or instance-specific cursors without adding a
multi-actor model to the runtime. Existing `cursor: true`, feedback presets,
and unlabeled defaults remain unchanged.

Feedback normalization and cursor visual requests carry the optional label to
both the built-in and injected Visual Layer. The built-in layer must measure or
otherwise account for label dimensions when placing it, while avoiding pointer
motion changes, interaction state, or target geometry changes.

Labels can be duplicated or changed and therefore cannot identify actors in
traces. A future multi-actor contract may add a stable actor ID and color
policy separately.

## Alternatives Considered

Add a top-level `cursorLabel` option. This was rejected because the value only
has meaning when cursor feedback is active and would split one visual channel
across unrelated option fields.

Use a general annotation or walkthrough caption. This was rejected because
those surfaces describe actions or scenes and belong to a presentation
runtime, while this feature only identifies a cursor.

Always render below and to the right. This was rejected because the overlay
clips at viewport edges and would hide the label in common target positions.

Use the label as an actor ID. This was rejected because user-facing labels are
neither unique nor stable.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/adr/2026-06-17-browser-options-model.md`
