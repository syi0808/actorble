# ADR 2026-08-24: Adopt scroller2 for Browser Scrolling

Status: Accepted
Date: 2026-08-24

Supersedes the scrolling implementation ownership portion of
`docs/adr/2026-07-14-browser-reveal-stability-runtime.md`. Its public intent, stability, timeout,
cancellation, and diagnostic decisions remain accepted.

## Context

Actorble currently owns browser scroll-chain discovery, reveal planning, scroll motion, and settlement
observation. The independently published `scroller2` package now provides the same reusable scrolling
kernel. Keeping both implementations would duplicate browser edge-case handling and split maintenance.

Actorble still needs stable public reveal and explicit-scroll contracts, action lifecycle integration,
geometry cache invalidation, structured trace output, and Actorble-specific error semantics.

## Decision

The browser Surface Engine delegates scroll-chain discovery, reveal planning, motion execution,
settlement, and cancellation to the npm `scroller2` package.

Actorble keeps the Surface Engine as its public architecture boundary. A narrow platform adapter connects
Actorble's DOM port to scroller2, and the Surface Engine maps Actorble options, results, deadlines, errors,
diagnostics, and cache invalidation around the dependency. Actorble removes its own scroll-chain resolver,
reveal planner, and scroll settlement observer modules.

This decision does not change Actorble's public `reveal`, `scrollTo`, or `scrollBy` intents or the portable
scenario schema.

## Consequences

- Browser scrolling behavior has one reusable implementation and one upstream maintenance path.
- `scroller2` becomes a runtime dependency of `@actorble/browser`.
- Actorble retains integration tests for its public contracts instead of duplicating scroller2 unit tests.
- Actorble-specific options that do not map directly must be normalized at the integration boundary.
- Dependency upgrades require contract and browser smoke verification.

## Alternatives Considered

- Keep both implementations: rejected because it preserves duplicated algorithms and divergent fixes.
- Copy scroller2 source into Actorble: rejected because it loses independent versioning and ownership.
- Expose scroller2 directly as Actorble's public API: rejected because it would leak dependency contracts
  across the platform-neutral Actorble boundary.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/adr/2026-07-14-browser-reveal-stability-runtime.md`
- `https://github.com/syi0808/scroller2`
