# ADR 2026-06-21: Browser Extension Inline Workflow Step Editing

Status: Accepted
Date: 2026-06-21

## Context

The side panel workflow builder already has step cards, a selected-step
properties panel, and an action palette. In practice, the palette duplicates
the action selector and turns adding a step into a separate area beside the
workflow instead of part of the flow itself.

The builder should make the ordered workflow the editing surface. A selected
step should open where it lives, and adding a step should feel like appending
to the workflow, not choosing from a separate card grid.

## Decision

The side panel workflow uses inline selected step editing. Selecting a step
expands that step card and shows the action selector, action-specific fields,
target assignment, test command, context actions, and advanced repair
disclosure inside the card.

Adding a step starts from the final `+` control below the last step. The `+`
opens a UI-only pending step card. The pending card is not stored in the draft
document and becomes a real step only after the user chooses an action from the
card dropdown.

Action selection uses a dropdown/select control. The control may be custom and
show icons and concise hints, but the primary UI does not list every action as
a card grid.

Step reorder uses drag and drop from a dedicated drag handle on each persisted
step card. Duplicate and delete remain selected-step context actions.

The workflow list is rendered directly in the builder section. It does not add
a nested workflow card with a repeated title and description.

Selected steps are highlighted with border, outline, or shadow rather than a
full accent background.

Target slot rows own target picking. Clicking a slot selects that slot and
starts picking; the side panel does not show separate Set target, Pick target,
and Stop controls for the same action. A target click in the content inspector
ends the active picking interaction.

The side panel uses a light white/mint product tone aligned with the landing
page while leaving shared extension tokens available for other entrypoints.

## Consequences

The scenario schema, compiler, storage format, and browser runtime contract do
not need placeholder or actionless steps.

The React side panel owns the pending-step UI state locally. Save, run, check,
and test commands should not treat pending UI state as document content.

The extension gains a focused drag-and-drop dependency for sortable workflow
cards. The existing builder session `reorderStep` operation remains the single
document mutation path.

The target picker stop API remains available for Escape, page navigation,
programmatic cancellation, and tests, but it is not a primary side panel button.

## Alternatives Considered

Keep the action palette and separate selected-step panel. This keeps the
current implementation but leaves adding and editing split across multiple
surfaces.

Store an actionless step in the draft schema. This would model an empty step
directly, but it would affect validation, compilation, export, and migration
for a UI-only transition state.

Use whole-card dragging. This is faster to target but conflicts with selecting
the card, editing fields, opening dropdowns, and pressing target controls.

## References

- `docs/browser-extension-architecture.md`
- `docs/ui-system.md`
- `docs/adr/2026-06-20-browser-extension-workflow-builder-ux.md`
