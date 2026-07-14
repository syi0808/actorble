# ADR 2026-07-14: Remove Target ScrollTo Compatibility

Status: Accepted
Date: 2026-07-14

## Context

The browser reveal and stability ADR separated target reveal from explicit scrolling but allowed a
temporary deprecated `scrollTo(target)` alias. Actorble's browser runtime and portable scenario draft
are still pre-1.0, and retaining two meanings under `scrollTo` would carry ambiguous overloads into
facades, scenario producers, validation, and generated code.

## Decision

Actorble removes target-based `scrollTo` instead of providing a compatibility overload. Target
visibility uses `reveal(target)`. Absolute and relative numeric scrolling use `scrollTo(position)` and
`scrollBy(delta)`. `ScrollPosition` and `ScrollDelta` contain only `x` and `y`.

The portable draft schema, browser extension authoring flow, compiler, and code exporter emit only
these distinct actions. Existing draft documents containing `{ action: 'scrollTo', target }` are
rejected; no automatic migration or compatibility acceptance is provided.

## Consequences

- TypeScript callers must replace `scrollTo(target)` with `reveal(target)`.
- Stored draft scenario documents using target scroll must be edited before import.
- Runtime and portable scenario contracts no longer need ambiguous target-or-position unions.
- This amends only the compatibility clause of the browser reveal and stability ADR; its reveal,
  settlement, cancellation, and module-boundary decisions remain accepted.

## Alternatives Considered

- Keep a deprecated facade overload: rejected because it preserves semantic ambiguity and complicates
  result typing.
- Auto-migrate draft documents: rejected because the approved change intentionally makes the draft
  contract breaking and explicit.

## References

- `docs/adr/2026-07-14-browser-reveal-stability-runtime.md`
- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
- `docs/browser-extension-architecture.md`
