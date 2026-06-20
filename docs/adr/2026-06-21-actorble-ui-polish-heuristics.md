# ADR 2026-06-21: Actorble UI Polish Heuristics

Status: Accepted
Date: 2026-06-21

## Context

The React migration made the browser extension easier to compose, but the first
pass still exposed several generic UI patterns: CSS-drawn brand marks, uppercase
labels, bold status pills, single-side issue borders inside rounded surfaces,
duplicated low-value status, and long rows of commands.

These patterns make the product feel less deliberate and make first-view
hierarchy weaker. Actorble is intended for non-developers as well as developers,
so the UI must prioritize the current scenario, workflow, selected step, and
next action over environment status and maintenance commands.

## Decision

Actorble product UI uses the actual SVG symbol and wordmark assets. Product
surfaces do not redraw the mark with CSS or placeholder letters.

Actorble UI uses sentence case by default. Full-uppercase labels, uppercase
brand text, bold badge typography, and decorative single-side borders are
avoided in primary product surfaces.

Idle/default state such as ready tab, not recording, idle run, and zero saved
counts are not top-level content. Changed or blocking state can surface inline;
default state belongs in metadata, disclosure, or can be omitted.

Command groups show the next useful action first. When a local group has more
than three actions, lower-priority commands move into an overflow menu near the
content they affect.

## Consequences

Browser extension chrome becomes quieter. Scenario and workflow content becomes
more prominent than readiness/status chrome. Overflow menus add one more
interaction for maintenance commands, but reduce visual competition in the
default surface.

The repo gains a project-local Codex skill that captures these heuristics for
future UI work.

## Alternatives Considered

Keep the React UI visual structure and only replace the logo. This would fix
brand fidelity but leave hierarchy and generic styling issues intact.

Keep all commands visible for discoverability. This was rejected because the
number of buttons diluted primary actions and made constrained surfaces harder
to scan.

Use uppercase labels for dense scanning. This remains allowed only for rare
diagnostic tables, not for default product UI.

## References

- `docs/ui-system.md`
- `docs/browser-extension-architecture.md`
- Nielsen Norman Group, "Visual Hierarchy in UX: Definition":
  https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- PatternFly, "Overflow menu":
  https://www.patternfly.org/components/overflow-menu/design-guidelines/
- Carbon Design System, "Overflow menu":
  https://v10.carbondesignsystem.com/components/overflow-menu/style/
