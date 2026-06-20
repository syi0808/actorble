# ADR 2026-06-20: Actorble UI System

Status: Accepted
Date: 2026-06-20

## Context

Actorble is browser-first today, but it is intended to span browser extension,
macOS, Windows, Linux, and documentation landing surfaces. The browser extension
already needs a stronger shared UI language, and future native apps should feel
like the same product even when they use platform-native UI kits.

The product is also intended for non-developers. The UI needs to emphasize
scenario authoring, workflow steps, target picking, run state, and fixable
issues instead of exposing JSON, locators, traces, schema details, and runtime
capability detail as primary concepts.

## Decision

Actorble uses an independent UI system specification at `docs/ui-system.md`.
The UI system is a platform-neutral design spec, not an implementation package.

Actorble is the single product and brand name. Browser extension, native desktop
apps, and reusable landing-page components share brand tokens, command
hierarchy, status language, terminology, and product component definitions.

The default product density is comfortable. Compact density is allowed for
constrained extension surfaces and diagnostics.

User-facing terminology is standardized around scenario, workflow, step, action,
target, check, test step, run details, and issues. Internal terms such as
locator, schema, trace, capability, fidelity, payload, and JSON repair are not
shown in normal UI and remain limited to disclosed advanced or diagnostic
surfaces.

The browser extension may adopt React with Headless UI or similar headless
primitives. Native desktop apps may use platform-native UI kits. These choices
must preserve the shared information architecture and terminology.

Landing pages may use freer visual composition, but should reuse brand tokens
and basic primitives such as buttons, badges, CTA groups, and product surface
cards.

## Consequences

Product UI decisions have a single cross-platform reference before a reusable
implementation package exists.

Browser extension work can introduce a framework without turning framework
components into the source of design truth.

Native app implementation remains open while keeping product structure and
language consistent across macOS, Windows, and Linux.

Some existing labels such as "Validate" and "Dry run" should eventually move to
"Check scenario" and "Test step" in primary UI.

Accessibility remains a baseline expectation inherited from native UI kits or
headless primitives, not a formal WCAG conformance target yet.

## Alternatives Considered

Create a reusable UI package first. This was rejected for now because the native
desktop implementation strategy is not decided, and the immediate need is a
stable design contract.

Let each platform define its own UI. This would make native surfaces feel more
platform-local, but it would weaken Actorble's product consistency.

Make the browser extension UI system authoritative. This was rejected because
the extension is only one surface and has density constraints that should not
define the default desktop product experience.

Keep developer terminology in the product UI. This would be convenient for
early implementation, but it conflicts with the goal that non-developers can use
the builder.

## References

- `docs/ui-system.md`
- `docs/high-level-architecture.md`
- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
- `docs/adr/2026-06-20-browser-extension-workflow-builder-ux.md`
