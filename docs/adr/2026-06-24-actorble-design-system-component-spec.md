# ADR 2026-06-24: Actorble Component-Level Design System Specification

Status: Accepted
Date: 2026-06-24

## Context

Actorble already had a cross-platform UI system document, but it mostly defined
product principles, terminology, and information architecture. That was enough
to guide composition, but not enough to keep platform-specific implementations
visually consistent once browser, macOS, Windows, Linux, documentation, and
landing surfaces diverge.

The missing detail is component-level specification: button sizes, control
heights, icon spacing, field composition, typography roles, status badge
weights, menu item sizing, drawer spacing, and product component proportions.
Without those details, each platform can implement the same product concepts
while still drifting visually.

shadcn/ui is a useful reference for the level of specificity because it uses
semantic theme tokens, copy-owned primitives, explicit variants and sizes, and
Field composition around label, control, description, and error. Actorble should
borrow that specificity without adopting shadcn/ui as a runtime dependency or
requiring Tailwind, Radix, React, or web-only implementation choices.

## Decision

Actorble expands `docs/ui-system.md` into an English, component-level design
system specification.

The UI system defines:

- semantic color, spacing, radius, typography, density, and motion tokens
- common component states
- Button variants and sizes, including icon-only sizing
- Field, Text Input, Textarea, Select, Checkbox, Radio, Switch, Badge, Tabs,
  Disclosure, Drawer, Dialog, Dropdown Menu, Tooltip, Toolbar, and Empty State
  specs
- product component specs for App Shell, Scenario Shell, Run Controls, Record
  Controls, Action Selector, Workflow Step Card, Inline Selected Step Editor,
  Target Slot Picker, Issues List, Diagnostics Drawer, and Landing Components
- implementation invariants for platform-specific implementations

The shadcn/ui model is a reference for specification depth and primitive
structure, not a dependency, visual clone, or source of truth. Actorble owns its
own variant names, token names, product terminology, and product component
hierarchy.

Platform implementations may use native controls or headless primitives, but
they must preserve the shared component dimensions, spacing relationships,
typography roles, semantic token usage, command hierarchy, and status language.

## Consequences

Platform teams have a concrete visual contract before a shared UI package
exists.

The browser extension can gradually move from entrypoint-specific CSS toward
explicit component size and variant APIs.

Future native apps can use platform-native controls while matching Actorble's
component proportions and product hierarchy.

The document becomes longer and more prescriptive. That is intentional: visual
consistency across separately implemented platforms needs more detail than
principle-only guidance.

Some current browser extension CSS may not yet expose all specified sizes as
component props. That is an implementation follow-up, not a reason to keep the
design contract vague.

## Alternatives Considered

Keep the UI system principle-only. This would preserve flexibility, but it
would not answer practical implementation questions such as button size,
spacing, icon dimensions, and field error placement.

Adopt shadcn/ui directly as the design system. This was rejected because
Actorble targets native desktop platforms as well as browser surfaces, and the
source of truth should not be tied to Tailwind, React, Radix, or web component
code.

Create a shared UI package first. This was rejected for now because the native
desktop toolkit strategy is still open. A platform-neutral spec can guide
browser and native work before shared implementation code exists.

Let each platform derive its own component specs from the product architecture.
This would make local implementation faster initially, but it would increase
visual drift and make future cross-platform QA harder.

## References

- `docs/ui-system.md`
- `docs/high-level-architecture.md`
- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-20-actorble-ui-system.md`
- `docs/adr/2026-06-21-actorble-ui-polish-heuristics.md`
- shadcn/ui Button: https://ui.shadcn.com/docs/components/button
- shadcn/ui Field: https://ui.shadcn.com/docs/components/field
- shadcn/ui Select: https://ui.shadcn.com/docs/components/select
- shadcn/ui Theming: https://ui.shadcn.com/docs/theming
