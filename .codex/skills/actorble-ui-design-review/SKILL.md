---
name: actorble-ui-design-review
description: Review and improve Actorble product UI quality. Use when Codex designs, implements, reviews, or polishes Actorble UI surfaces such as the browser extension, landing page, future native apps, design tokens, component specs, command bars, badges, status displays, typography, brand marks, or information hierarchy.
---

# Actorble UI Design Review

Use this skill as a product-UI quality filter before and after editing Actorble
interfaces. Treat `docs/ui-system.md` as the design source of truth; if the
policy changes, use `actorble-design-updater` to update docs and ADRs.

## Workflow

1. Inspect the actual surface before proposing fixes.
   - Read the component code, CSS, and relevant architecture/UI docs.
   - Locate brand assets before drawing or approximating marks.
   - Check the current visible hierarchy: what the user sees first, what repeats, and what is hidden.
2. Classify information by user importance.
   - Primary: the scenario, current workflow, selected step, next useful action, blocking issue.
   - Secondary: save state, import/export, recording review, per-step utilities.
   - Tertiary: tab readiness, idle/not-recording/default status, counts like `0 saved`, trace/detail state.
   - Move tertiary information into compact metadata, disclosure, or omit it until state changes.
3. Compress command groups.
   - Keep at most one primary action visible per local group.
   - Keep two or three visible actions only when they are frequent and context-critical.
   - Move lower-priority actions into an overflow menu near the content they affect.
   - Never hide the only next required action in overflow.
4. Remove generic AI-looking polish patterns.
   - Avoid full-uppercase labels, eyebrow text, and brand text unless the brand asset itself uses it.
   - Use sentence case for labels, menu items, badges, and helper text.
   - Avoid bold type inside badges/pills/status chips; use regular or medium weight.
   - Do not combine rounded containers with single-side `border-left` emphasis.
   - Prefer full outline, subtle tint, inline icon, or small state text for emphasis.
   - Avoid explaining empty states too heavily. Use concise prompts such as `Add a step`.
5. Apply brand assets faithfully.
   - Use `docs/src/assets/actorble-logo.svg` for the symbol.
   - Use `docs/src/assets/actorble-wordmark.svg` or `actorble-wordmark-light.svg` for wordmark contexts.
   - Do not redraw the logo with CSS bars or placeholder letters.
   - If the surface is too small for the full wordmark, use the symbol plus normal text only when needed.
6. Verify after edits.
   - Run the package typecheck/tests/build required by the touched surface.
   - Search CSS for `text-transform: uppercase`, high badge font weights, and `border-left`.
   - Visually inspect constrained viewports when a browser or screenshot path is available.

## Actorble UI Heuristics

- Scenario-first: make the current scenario and workflow clearer than environment status.
- Action-first: make the next useful command easier to find than maintenance commands.
- Quiet chrome: app chrome should frame the work, not compete with it.
- State on demand: idle/default statuses should not occupy top-level visual real estate.
- Repair late: diagnostics, locator candidates, JSON repair, and traces stay disclosed unless they block progress.
- Native restraint: use platform and headless primitive behavior without adding decorative wrappers.

## Common Fixes

- Replace a row of `New / Import / Export / Check / Save / Record / Run` with `Run`, `Save`, and an overflow menu for maintenance commands.
- Replace `Tab ready / Not recording / Idle` top-level pills with a small disclosed `Status` line or show only changed states like `Recording` or `Run failed`.
- Replace `No step selected. Select a step...` with a concise empty workbench prompt and the action palette.
- Replace side-left issue bars with a neutral issue row using icon, full border, or soft background.
- Replace CSS-drawn brand marks with the SVG symbol/wordmark assets.
