# ADR 2026-06-19: Text Selection And Pointer Sequence

Status: Accepted
Date: 2026-06-19

## Context

Manual browser-extension testing found that text selection is not detected as a
distinct recorder intent and is replayed as a simple click. The same recorder
shape is likely to miss drag gestures because it currently observes click and
text events but not full pointer windows, selection changes, or drag/drop
events.

The browser runtime already has internal pointer primitives and a public drag
action, but it does not expose text selection as a first-class action. A tempting
fix is to expose low-level `pointerDown`, `pointerMove`, and `pointerUp` as
scenario steps. That would preserve raw input fidelity, but it would also let a
public action end while the runtime is intentionally left with pressed buttons,
active state, or pointer capture.

Actorble public actions are expected to be cleanup-safe transactions: after a
public action succeeds, fails, times out, or is cancelled, Action Orchestrator
can close trace spans and clean up interaction state.

## Decision

Text selection is a first-class user intent, separate from drag/drop. Browser
runtime design includes a `selectText` action that changes document, input,
textarea, contenteditable, or editor selection. The concrete endpoint model must
be validated by PoC before the API is considered stable across all browser
surfaces.

Low-level pointer replay crosses the public scenario boundary only as a closed
transaction such as `pointerSequence`. `pointerDown`, `pointerMove`, and
`pointerUp` remain internal Pointer Engine primitives and may later be exposed
under an advanced device-control namespace, but they are not the default
portable scenario action shape and are not the recorder normalizer's preferred
output.

The recorder captures enough raw data to distinguish click, text input, text
selection, drag/drop, and low-level fallback windows. The normalizer prefers
stable intent steps such as `fill`, `typeInto`, `click`, `selectText`, and
`drag`. It emits `pointerSequence` only when the gesture cannot be classified
without losing replay fidelity.

Shared scenario schema should not add independent `pointerDown`/`pointerUp`
steps. A stable `selectText` schema action depends on the browser PoC. A
`pointerSequence` schema action, if added, must represent one cleanup-safe
transaction rather than individual pointer primitives.

## Consequences

Selection replay can be modeled by intent instead of being hidden under click or
drag. Runtime diagnostics can report selection-specific capability and failure
details.

Action Orchestrator remains the owner of cancellation, timeout, pointer
up/cancel cleanup, interaction-state cleanup, and trace closure for low-level
pointer replay.

Recorder implementation becomes more complex because it must buffer event
windows and correlate pointer movement, selectionchange, drag/drop, and text
events before choosing a step.

Initial implementation work must start with a browser PoC for selection endpoint
models across ordinary document text, input/textarea, contenteditable, editor
adapters, iframe, and shadow root boundaries.

## Alternatives Considered

Treat text selection as a drag variant. This was rejected because drag/drop and
text selection can share pointer signals but have different user intent,
capability reporting, state, and replay verification.

Expose `pointerDown`, `pointerMove`, and `pointerUp` as normal public scenario
steps. This was rejected because each call can leave runtime state open across a
public action boundary, making cleanup ownership ambiguous after exceptions,
timeouts, cancellation, navigation, or recorder/editor interleaving.

Record only raw pointer events. This was rejected because scenario documents
should prefer stable user intent where possible. Raw pointer replay is useful as
a fallback, not as the primary authoring model.

Add portable schema support immediately. This was deferred because `selectText`
needs a browser PoC and `pointerSequence` should be introduced only as a closed
transaction if portable replay is required.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/browser-extension-architecture.md`
