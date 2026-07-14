# ADR 2026-07-14: Browser Reveal and Stability Runtime

Status: Accepted
Date: 2026-07-14

## Context

The browser runtime can resolve stale targets, dispatch synthetic interaction, track target-anchored
cursor geometry, and apply action-level timeout and cancellation. Its current scrolling contract still
combines target reveal and absolute positioning under `scrollTo(targetOrPosition)`, delegates target
scrolling to a single DOM operation, and treats a microtask plus animation frame as generic settlement.

Automated product walkthroughs need nested target reveal, observable scroll completion, presentation-grade
visual stability, declarative UI-state waits, and deterministic interruption without adding presentation
concepts such as scenes, spotlight, narration, or user-takeover policy to Actorble core.

## Decision

Actorble separates target reveal from explicit scrolling:

- `reveal(target)` satisfies a requested visibility condition and returns a structured `RevealResult`.
- `scrollTo(position)` performs absolute scrolling on the selected surface.
- `scrollBy(delta)` performs relative scrolling on the selected surface.
- The legacy `scrollTo(target)` overload may remain temporarily as a deprecated alias to `reveal(target)`.

The Surface Engine remains the public architecture boundary. It owns internal scroll-chain resolution,
reveal planning, scroll execution, and scroll settlement observation. Reveal traverses open shadow hosts,
plans nested surfaces inner-to-outer, uses effective viewport constraints, and refreshes geometry between
steps. Oversized targets produce the best achievable visibility and a non-fully-visible result rather
than an automatic action failure.

The runtime distinguishes `interaction-stable`, `scroll-stable`, and `visual-stable`. Ordinary interaction
actions default to interaction stability, reveal defaults to scroll stability, and presentation-grade
visual stability is opt-in through an explicit wait condition or policy.

Wait conditions expand to attached, detached, enabled, disabled, focused, target-scoped text, value,
attribute, stable, URL, custom, and `all` / `any` composition in addition to visible and hidden.

Pointer movement, gestures, typing, timed scrolling, and waits share a cancellation invariant: future
scheduled work stops, observers and listeners are disposed, semantic interaction state is cleared, and
the next Actorble action can execute. Scroll cancellation preserves the current scroll position and does
not roll back already-applied side effects.

Scenema presentation semantics remain outside Actorble. Actorble exposes deterministic interaction and
observation primitives only.

## Consequences

- Public and scenario schemas gain `reveal` and `scrollBy`; callers must migrate target-based `scrollTo`.
- Surface Engine gains internal modules but no new top-level `ScrollEngine` boundary.
- Geometry and layout reads increase during reveal and visual-stable observation, so reads must be frame-
  coalesced and observers must be lifecycle-scoped.
- Native `scrollend` can improve responsiveness but cannot be the sole compatibility mechanism.
- Visual-stable waits cost more than interaction-stable waits and remain opt-in.
- Capability and fidelity reports expose nested scrolling, planned reveal, and observed stability support.
- Cross-origin frames, closed shadow roots, trusted wheel input, and desktop scroll implementations remain
  outside this browser improvement scope.

## Alternatives Considered

- Add a top-level Scroll Engine: rejected because Surface Engine already owns surface activation,
  coordinate mapping, scroll chains, and target reveal.
- Keep `scrollTo(targetOrPosition)`: rejected because target visibility and coordinate positioning have
  different lifecycle, result, and migration semantics.
- Use `Element.scrollIntoView()` as reveal: rejected because it does not provide deterministic nested
  planning, safe-area placement, per-step geometry refresh, or structured results.
- Treat one animation frame as settled: rejected because it does not prove smooth-scroll completion,
  scroll snapping, mutation quiet, or layout stability.
- Make visual stability the default after every action: rejected because of its observation cost and the
  unnecessary latency it would add to ordinary interaction sequences.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `browser/docs/implementation_tasks.md`
