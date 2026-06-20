# ADR 2026-06-21: Browser Extension React UI

Status: Accepted
Date: 2026-06-21

## Context

The browser extension popup and side panel now follow the Actorble UI system and
product composition direction, but their rendering layer is still imperative DOM
code. The side panel in particular combines event wiring, DOM lookup, view model
rendering, and UI composition in one entrypoint file. That makes component reuse,
landing-page-aligned primitives, and future native UI mapping harder to reason
about.

WXT supports React entrypoints through its React module, and the extension
already keeps most authoring, recorder, inspector, storage, and runtime wiring
outside the visible markup layer. This makes the rendering layer a good boundary
for adopting React without moving runtime semantics into UI components.

## Decision

Browser extension product entrypoints use React for local UI composition. Popup
and side panel mount independent React apps from their WXT HTML entrypoints.

The extension uses Radix Primitives as the default headless primitive library for
web-only interactions such as tooltips, tabs, and collapsible diagnostic
surfaces. The extension does not adopt Radix Themes, Tailwind, or a component
theme framework in this decision. Actorble design tokens remain plain CSS custom
properties aligned with `docs/ui-system.md`.

The existing framework-agnostic view model modules remain the boundary between
product state and rendering. React components receive view snapshots and command
handlers; they do not own scenario validation, migration, compilation, storage,
recorder behavior, inspector behavior, or browser runtime semantics.

## Consequences

Popup and side panel markup becomes componentized and easier to share across
extension surfaces. The side panel can express scenario shell, workflow, selected
step inspector, target assignment, recorded draft review, and diagnostics as
composable product components instead of manual DOM render functions.

React adds package and bundling dependencies to the extension. WXT remains the
entrypoint and manifest owner, and non-product entrypoints may remain vanilla
until they need shared UI components.

Tests should keep covering the framework-agnostic behavior modules. UI migration
verification should include typecheck, Vitest, build, and lightweight render or
DOM checks for the React entrypoints as the component layer settles.

## Alternatives Considered

Keep imperative DOM and extract helpers. This would reduce some file size but
would not give the extension a reusable component model for product UI.

Use Headless UI. It is a good unstyled React library, but it is optimized around
Tailwind-oriented usage and has a narrower primitive set for this extension.

Use React Aria for all primitives. It provides strong accessibility coverage,
but it is deeper than the current extension needs. It can be revisited for more
complex collection or selection behavior.

Adopt Radix Themes or another themed component kit. This was rejected because
Actorble already owns its design tokens and cross-platform product language.

## References

- `docs/browser-extension-architecture.md`
- `docs/ui-system.md`
- `docs/adr/2026-06-20-actorble-ui-system.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
