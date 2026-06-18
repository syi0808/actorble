# ADR 2026-06-18: Browser Extension Workflow Builder

Status: Accepted
Date: 2026-06-18

## Context

The browser extension is intended to turn browser usage into Actorble scenarios
and let users author or run explicit scenarios. The current extension code has
separate surfaces for recording, step editing, target picking, locator preview,
validation, and run status. That separation makes the extension compile and pass
model tests, but it does not create a usable scenario authoring workflow.

The current recorder also depends on content-script memory until stop. Browser
navigation or frame reload can clear captured events before the draft is handed
off. The target picker can select elements, but the selected locator only writes
to the currently selected step's top-level target field, so it cannot reliably
author new actions or assign targets to action-specific slots.

## Decision

The side panel is redesigned as a scenario workflow builder. It owns an
authoring session with a draft document, dirty state, selected step, selected
target slot, run state, record state, trace view, and validation issues.

Scenario editing happens through structured builder operations: create/select a
scenario, add or insert steps, duplicate/delete/reorder steps, choose an action
family, edit action-specific fields, select target slots, validate, dry-run, and
save. Raw JSON editing remains an import/export or repair path, not the primary
builder interaction.

The inspector and locator preview are integrated into target assignment. A
target picker session starts from a correlated target slot, produces target
metadata, previews locator candidates, and writes the chosen locator back into
that slot. Supported slots include step target, drag from, drag to, waitFor
target, and scrollTo target.

Recording becomes a navigation-safe input path for the builder. The background
service worker owns the correlated recording session and event buffer. Content
scripts capture page events and flush incremental `record:event` messages.
Navigation and `pagehide` flush pending events before cleanup. Stopping a
recording normalizes the buffered events into a draft scenario and opens it in
builder review, where the user explicitly replaces, appends, saves, exports, or
discards it.

Frame routing is explicit. The extension does not blindly attach `frameId: 0` to
every user operation. `frameId` is included only for known frame correlations
from background readiness, inspector selection, recorder capture, or runtime
state. Cross-origin frame limits are surfaced as capability boundaries.

## Consequences

The side panel becomes the single place where scenario authoring, target
assignment, recording review, validation, dry-run, and run feedback meet.

The recorder can survive normal page transitions because the event buffer is not
owned only by a content script instance. Empty recordings can be shown as an
empty recording state instead of invalid scenario JSON.

The inspector stops being a detached feature and becomes the target-setting
interaction for concrete action slots. This requires a builder-side target slot
model and action-specific editors.

The background service worker gains more responsibility for content readiness,
frame correlation, and recording session buffering, but it still does not run
Actorble actions or own runtime semantics.

Existing tests that only assert message payloads and pure model behavior are no
longer sufficient. The redesigned workflow needs tests for builder operations,
target-slot write-back, navigation-safe recording buffers, side panel draft
handoff, and content readiness routing.

## Alternatives Considered

Keep the current separate panels and patch Record. This was rejected because the
main product problem is not only event capture; the user still cannot build a
workflow from actions, targets, inputs, and dry-runs.

Make popup the primary recorder and builder handoff surface. This was rejected
because popup lifetime and focus behavior are unsuitable for multi-step editing
and review.

Keep inspector as a standalone utility and write only to the selected step's
top-level target. This was rejected because many actions have different target
slots, and users need to create or edit steps in context.

Store compiled runtime scenarios or builder UI state. This was rejected because
the extension storage contract remains portable scenario documents; compiled
runtime shape and transient UI state are not portable source artifacts.

## References

- `docs/browser-extension-architecture.md`
- `docs/high-level-architecture.md`
