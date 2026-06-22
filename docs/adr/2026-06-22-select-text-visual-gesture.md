# ADR 2026-06-22: Select Text Visual Gesture

Status: Accepted
Date: 2026-06-22

## Context

`selectText` is already a first-class intent action, but its browser runtime path
applies Selection API or input range changes immediately. That is correct for
automation fidelity, but visually it feels incomplete because users do not see
the cursor movement or progressive selection growth they would expect from a
manual text selection.

The runtime already supports cursor visuals and pointer/mouse event dispatch for
pointer actions. Reusing public low-level pointer steps would break the
cleanup-safe intent-action model, while relying only on synthetic pointer events
would not reliably create native selection in browsers.

## Decision

`selectText` supports `duration` and `motion` options using the same public
movement option model as pointer-oriented actions. When movement is requested,
the Action Orchestrator owns an internal selection visual gesture:

- dispatch pointer/mouse down, move, and up events for the drag selection;
- show the visual cursor as a pressed text cursor during the drag;
- progressively update document, input, textarea, or contenteditable selection
  ranges during movement;
- dispatch no click activation for drag selection;
- close the action with the same timeout, cancellation, trace, and cleanup
  ownership as other public actions.

The action remains an intent action. Public `pointerDown`, `pointerMove`, and
`pointerUp` scenario steps are still not introduced.

## Consequences

Selection replay becomes visually inspectable in examples, traces, and browser
extension runs without exposing open-ended pointer primitives. Apps that listen
for pointer and mouse drag selection events can observe the synthetic event
stream. Because synthetic events alone are insufficient for selection fidelity,
the runtime must continue applying Selection API and input range changes itself.

Caret geometry for document/contenteditable selections can use Range geometry.
Caret geometry for input and textarea selections requires a platform mirror
measurement helper.

## Alternatives Considered

Only show the final cursor position. This was rejected because it does not
explain selection growth over time.

Dispatch pointer events without applying selection ranges. This was rejected
because browsers do not consistently create selection from synthetic pointer
events.

Expose low-level pointer primitives. This was rejected for the same cleanup and
transaction-boundary reasons recorded in ADR 2026-06-19.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/adr/2026-06-19-text-selection-and-pointer-sequence.md`
