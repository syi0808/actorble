# ADR 2026-06-17: Browser Options Model

Status: Proposed
Date: 2026-06-17

## Context

The browser runtime currently exposes options across several layers: facade
creation, visual feedback, action calls, scenario runner options, and engine
dependency injection. Some names are implementation-oriented rather than
user-intent-oriented. In particular, `mode: "interactive" | "headless"` and
`visual` overlap in meaning, motion defaults are scattered across runtime
modules, and raw option objects are passed deep enough that defaults and merge
rules are hard to reason about.

The next browser work will revise settings, options, and interface APIs, so the
option ownership model needs to be documented before implementation.

## Decision

Browser runtime options are resolved through a dedicated option module. The
module owns centralized defaults, public-to-internal option normalization,
runner-level motion policy, action-level default merging, and step/call-level
override resolution.

The public API should replace overlapping `mode` and `visual` concerns with an
intent-oriented feedback surface. The current proposed direction is a `feedback`
option such as `"off"`, `"cursor"`, `"debug"`, or an object with explicit
feedback channels. Motion remains a separate runtime policy because visual
feedback and movement timing are related but distinct.

Runner-level options may enable or disable motion and may define action-specific
defaults. Scenario step options and direct call options override runner-level
defaults.

Pointer motion profiles are revised so `linear` is not a separate kind. Linear
movement is represented as an `ease` timing function. `inertia` and `spring`
profiles no longer accept `duration`; they use profile-specific parameters such
as velocity/deceleration or stiffness/damping/mass.

## Consequences

Options become easier to audit because default values and merge rules live in
one module.

Lower-level engines should no longer receive raw public option objects simply to
rediscover defaults. They should consume resolved internal options or a narrow
execution context.

Existing `mode`, `visual`, and `PointerMotionProfile` APIs will need a migration
path. Compatibility aliases may be useful during implementation, but the design
target is the normalized option model described in the architecture docs.

`inertia` and `spring` can remain unimplemented initially, but implementation
tasks must be created before they are exposed as working runtime behavior.

## Alternatives Considered

Keep `mode` and `visual` separate. This was rejected because the current names
make it unclear which option controls feedback, overlay creation, and execution
behavior.

Add string presets directly to `motion`. This was rejected because `motion`
already represents a structured profile, and string presets would mix profile
selection with timing parameters.

Keep action defaults only at step level. This was rejected because runner-level
defaults are needed for consistent scenario playback behavior and to avoid
duplicating motion/delay settings on every step.

## References

- `docs/high-level-architecture.md`
- `docs/browser-architecture.md`
