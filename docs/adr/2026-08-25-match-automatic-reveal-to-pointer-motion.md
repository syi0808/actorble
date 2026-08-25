# ADR 2026-08-25: Match Automatic Reveal to Pointer Motion

Status: Accepted
Date: 2026-08-25

## Context

Target actions reveal off-screen targets before moving the visual cursor. Browser reveal currently
defaults to instant motion, while pointer actions default to an eased movement. The resulting viewport
jump breaks the visual continuity of product walkthroughs even though scrolling is delegated correctly
to `scroller2`.

## Decision

Actorble coordinates automatic target reveal with the resolved pointer motion of the current action.
When the caller does not provide `reveal.motion`, an `ease` pointer profile is mapped to a timed scroll
motion with the same timing and duration. Disabling pointer motion also makes automatic reveal instant.

The centralized browser reveal default uses the same `ease-in-out`, 250 ms timing as the centralized
pointer default. Target actions without a pointer profile, and pointer profiles that the current scroll
contract cannot represent directly, use this centralized reveal motion. An explicit `reveal.motion`
always takes precedence.

## Consequences

- Off-screen target actions keep viewport and cursor movement perceptually consistent by default.
- Custom eased pointer durations automatically affect reveal unless the caller overrides reveal motion.
- Motion-disabled runs remain immediate for both pointer movement and automatic reveal.
- `inertia` and `spring` pointer profiles continue to use the timed reveal fallback until the public
  scroll motion contract can represent those profiles.
- Explicit `reveal`, `scrollTo`, and `scrollBy` retain their existing public intents and override rules.

## Alternatives Considered

- Keep instant reveal by default: rejected because it produces a visible jump before cursor movement.
- Use a fixed smooth reveal for every target action: rejected because custom pointer duration and motion
  disablement would still diverge from scrolling.
- Add `inertia` and `spring` to the public scroll contract now: rejected because scroller2 integration and
  settlement semantics for those profiles require a separate design decision.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/adr/2026-06-17-browser-options-model.md`
- `docs/adr/2026-08-24-adopt-scroller2.md`
