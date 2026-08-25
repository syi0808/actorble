# ADR 2026-08-26: Restore Target Visibility During Pointer Motion

Status: Accepted
Date: 2026-08-26

## Context

Target actions reveal before pointer movement and refresh the pointer endpoint when scroll, resize, or
layout changes move the target. A user scroll during a timed pointer move can still move the target out
of view. Endpoint refresh alone then keeps the cursor moving toward stale geometry or leaves final
preflight to fail instead of restoring the action's target.

## Decision

During target-directed pointer motion, a coalesced layout invalidation containing a scroll reason
triggers recovery reveal before endpoint geometry is refreshed. Recovery uses the action's resolved
reveal policy, deadline, and cancellation signal. Actions with `reveal: false` continue to refresh the
endpoint but do not scroll.

Resize- or mutation-only invalidations continue to refresh geometry without automatically scrolling.
Scroll invalidations produced by recovery are coalesced through the existing tracker; a subsequent
reveal must converge to a no-op once required visibility is satisfied.

## Consequences

- User scrolling during pointer motion brings the current action target back into view.
- Cursor endpoint refresh observes post-reveal geometry, keeping visual and dispatch coordinates aligned.
- Explicit reveal options, including motion and safe area, also govern recovery.
- Recovery can add scroll work to an active pointer action but cannot outlive its timeout or cancellation.
- `reveal: false` remains a complete opt-out from automatic scrolling.

## Alternatives Considered

- Refresh only the pointer endpoint: rejected because it cannot recover an off-screen target.
- Recover on every layout invalidation: rejected because resize and mutation do not necessarily express
  competing scroll intent and could cause surprising viewport movement.
- Start an independent background reveal: rejected because concurrent motion would complicate ordering,
  cancellation, and final pointer dispatch consistency.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/adr/2026-07-14-browser-reveal-stability-runtime.md`
- `docs/adr/2026-08-24-adopt-scroller2.md`
- `docs/adr/2026-08-25-match-automatic-reveal-to-pointer-motion.md`
