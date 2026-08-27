# ADR 2026-08-27: Reconcile Pointer Hit After Layout Invalidation

Status: Accepted
Date: 2026-08-27

## Context

Actorble derives hover state while processing sampled pointer movement. Once movement ends, user
scrolling, viewport resize, DOM mutation, resource loading, and animation can move a different element
under the unchanged pointer coordinate. The existing browser visual tracker instead anchors a
successful `moveTo` cursor to its target, while semantic hover remains tied to the last
`pointer:moved`. This can leave pointer visuals, hit-testing, and mirrored hover in contradictory
states.

No browser observer reports every possible cause of layout movement. Continuously hit-testing while
the runtime is idle would avoid missed signals but would impose unnecessary work.

## Decision

The Pointer Engine viewport coordinate remains authoritative after motion completes. A completed
cursor does not follow its target.

The browser runtime coalesces observable layout invalidations and, in the next animation-frame read
phase, hit-tests the current pointer point at most once. It sends the resulting hover chain to the
Interaction State Store as an internal `pointer:hit-reconciled` event. This event updates hover and
cursor presentation without changing pointer position or dispatching physical `pointermove` or
`mousemove` events.

Uncertain multi-frame changes may run a bounded animation-frame reconciliation loop while the pointer
is active. Consecutive stable results or a deadline stop the loop. Pointer active/pressed and capture
semantics remain independent from hover reconciliation.

## Consequences

- Scrolling or layout movement correctly clears stale mirrored hover and applies hover under the
  unchanged pointer point.
- Cursor geometry stays consistent with Pointer Engine state; only its CSS cursor presentation changes
  after reconciliation.
- Multiple dirty signals per frame share one hit-test through the existing invalidation coalescing.
- Observable invalidations remain best-effort, so bounded settling is needed for animations and changes
  that do not expose a reliable observer signal.
- Target endpoint tracking remains valid during motion but no longer owns the cursor after success.

## Alternatives Considered

- Keep the cursor anchored to the last target: rejected because it models an element attachment rather
  than a pointer and diverges from semantic hit state.
- Hit-test continuously for the runtime lifetime: rejected because idle pages would pay recurring DOM
  read costs.
- Clear hover on every invalidation: rejected because most invalidations do not change the element under
  the pointer and would cause visual flicker and incorrect leave/re-enter behavior.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
