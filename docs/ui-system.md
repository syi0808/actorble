# Actorble UI System

## 1. Purpose

Actorble UI System은 browser extension, future native desktop apps, docs
landing page가 공유하는 제품 UI 스펙입니다. 이 문서는 재사용 가능한 UI 구현
패키지가 아니라, 플랫폼별 구현이 따라야 하는 디자인 언어와 정보 구조를
정의합니다.

Actorble은 단일 브랜드 이름입니다. Platform-specific UI toolkit은 달라질 수
있지만, 사용자가 만나는 command hierarchy, status language, scenario authoring
flow는 플랫폼 전반에서 동일해야 합니다.

이 문서가 소유하는 것:

```txt
- product UI principles
- design token model
- user-facing terminology
- primitive component specs
- Actorble product component specs
- browser extension, native app, landing page mapping rules
```

이 문서가 소유하지 않는 것:

```txt
- browser runtime semantics
- scenario schema shape
- native platform implementation choice
- React, SwiftUI, WinUI, GTK, Qt 같은 구체 UI framework API
- full accessibility conformance policy
```

Decision history: `docs/adr/2026-06-20-actorble-ui-system.md`.

Polish heuristics decision history:
`docs/adr/2026-06-21-actorble-ui-polish-heuristics.md`.

## 2. Product Principles

### Scenario-first

Actorble UI는 scenario를 만들고 실행하는 제품 UI입니다. Runtime diagnostic detail이나
JSON document shape를 먼저 보여주는 developer tool UI가 아닙니다.

Normal authoring flow:

```txt
Choose or create scenario
-> Build workflow steps
-> Pick targets
-> Check or test
-> Run or save
-> Open diagnostics only when detail is needed
```

### Consistent across platforms

Browser extension, macOS, Windows, Linux 앱은 같은 product model을 사용합니다.
Native UI toolkit을 사용하더라도 다음 구조는 유지합니다.

```txt
App shell
-> Scenario shell
-> Workflow workbench
   -> Step flow
   -> Inline selected step editor
-> Diagnostics disclosure
```

Popup처럼 수명이 짧은 surface는 full builder를 축소하지 않고 quick-run remote로
제한합니다.

### Comfortable by default

기본 density는 `comfortable`입니다. 비개발자도 scenario를 읽고 편집할 수 있도록
control height, spacing, field grouping에 여유를 둡니다.

`compact` density는 browser extension popup, constrained side panel, DevTools panel,
dense diagnostic table처럼 공간 제약이 큰 surface에만 사용합니다.

### Progressive disclosure

Advanced detail은 다음 사용자 행동에 필요할 때만 기본 화면에 드러납니다.

```txt
Default surface:
- scenario
- workflow
- step
- action
- target
- status
- issue

Disclosed or advanced surface:
- locator candidates
- JSON repair
- schema validation payload
- run trace
- failure payload
- capability and fidelity detail
```

### Landing page flexibility

Landing page는 product UI보다 표현이 자유롭습니다. Hero, cinematic demo, feature
sections, platform storytelling은 landing-specific composition을 사용할 수 있습니다.
단, Button, Badge, CTA group, surface card, brand token은 같은 언어를 공유합니다.

### Native and headless defaults

Accessibility는 별도의 엄격한 기준을 아직 정의하지 않습니다. Native UI kit이나
headless library가 제공하는 keyboard, focus, role, labeling behavior를 기본으로
사용하고, Actorble UI가 그것을 훼손하지 않아야 합니다.

### Deliberate product polish

Actorble UI should avoid generic high-noise product styling. Visual hierarchy
must come from importance, proximity, scale, and grouping before decorative
emphasis.

Rules:

```txt
- Use actual Actorble SVG symbol and wordmark assets; do not redraw them in CSS.
- Use sentence case for labels, badges, tabs, and menu items.
- Avoid full-uppercase brand text or labels unless the asset itself contains it.
- Badge and pill text should be regular or medium weight, not bold.
- Do not combine rounded containers with single-side border emphasis.
- Do not show idle/default status as top-level content.
- Do not repeat low-value counts such as "0 saved" in first-view chrome.
- Empty states should invite the next action without overexplaining the absence.
```

When a command group needs more than three visible actions, keep the primary
action and frequent context action visible, then place lower-priority commands
in an overflow menu near the content they affect.

## 3. Token Model

Tokens are specified by meaning first. Platform implementations may map these
tokens to CSS variables, design assets, native color roles, or theme objects.

### Brand Tokens

Brand tokens come from the current Actorble symbol and landing direction.

```txt
actorble.ink        #101418
actorble.inkSoft    #17222C
actorble.mint       #33E6C2
actorble.amber      #F2B84B
actorble.wordmark   #F7FBFF
```

The symbol uses mint as the primary motion color and amber as the secondary
crossing/action color. Product UI should use mint/teal as the primary accent and
amber for attention, highlight, or secondary motion moments.

### Semantic Color Tokens

```txt
background
surface
surfaceSoft
surfaceStrong
text
textMuted
border
focus
accent
accentStrong
accentSoft
success
warning
danger
disabled
selection
```

Default mapping direction:

```txt
accent        -> Actorble mint/teal family
success       -> accent family
warning       -> Actorble amber family
danger        -> red/coral family
focus         -> accent with enough contrast against the active surface
selection     -> accentSoft with explicit border or leading indicator
```

Dark and light themes must preserve semantic meaning. Exact color values may be
adapted per platform for contrast and native appearance.

### Spacing

Use a small even scale.

```txt
2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
```

Product UI should prefer 12, 16, 20, and 24 for comfortable layouts. Compact
surfaces may use 6, 8, 10, and 12.

### Radius

```txt
control radius      8
compact radius      6 or 8
panel radius        8
pill radius         999
```

Cards and framed repeated items should stay at 8px radius or less. Top-level
page sections should not all become floating cards.

### Typography

Use platform system fonts by default.

```txt
product title       20-28, semibold/bold
section title       16-20, semibold/bold
body                13-15, regular
caption             12-13, regular/medium
label               11-12, regular/medium, sentence case by default
monospace           platform monospace, diagnostics and JSON only
```

Product UI labels use sentence case by default. Uppercase labels are reserved
for rare dense diagnostic surfaces where scanning benefits clearly outweigh the
extra visual noise.

Product app typography should not scale directly with viewport width. Landing
pages may use larger editorial display sizes as long as component text remains
stable and readable.

### Density

```txt
comfortable control height    40-44
compact control height        34-38
comfortable row height        48-72
compact row height            34-52
icon size                     16-20 in controls
```

Comfortable is the default for native apps and primary builder surfaces.
Compact is allowed for browser extension popup, narrow side panel regions, and
diagnostic panels.

### Motion

Motion should clarify state changes, not decorate every surface.

```txt
fast state change       120-180ms
standard transition     180-260ms
workflow reveal         220-320ms
demo choreography       landing-specific
```

Runtime visual feedback such as Actorble cursor motion belongs to runtime
visual layer policy, not the product UI token contract.

## 4. User-Facing Terminology

Actorble is used by non-developers, so product UI must avoid exposing internal
runtime terms as the default language.

| Concept | User-facing term | Usage |
| --- | --- | --- |
| Saved runnable document | Scenario | Primary noun. Use "Create scenario", "Save scenario", "Run scenario". |
| Ordered visual sequence inside a scenario | Workflow | Use for the builder area, not as a separate stored object. |
| One item in a workflow | Step | Use "Add step", "Move step", "Test step". |
| What a step performs | Action | Use in the action selector and step editor. |
| Element or location Actorble controls | Target | Use "Pick target" and "Target". Explain as a page/app element when helpful. |
| Page/app readiness | Ready / Blocked / Checking | Use compact status language. |
| Scenario validation | Check | Button label should be "Check scenario", not "Validate" in primary UI. |
| Per-step dry run | Test step | Use "Test step", not "Dry run" in primary UI. |
| Execution details | Run details | Use in disclosed detail surfaces. |
| Problems to fix | Issues | Use inline issues before opening diagnostics. |

Terms to avoid in normal UI:

```txt
locator
selector
schema
trace
capability
fidelity
payload
compiled scenario
runtime scenario
JSON repair
```

Allowed advanced labels:

```txt
Diagnostics
Locator candidates
Run trace
Advanced JSON repair
Capability report
Fidelity report
```

These labels may appear only inside disclosed advanced or diagnostic surfaces.

## 5. Primitive Components

Primitive components define behavior and visual contract. Implementations may
use React + Headless UI, native UI components, or another toolkit.

### Button

Variants:

```txt
primary    main action on the current surface
secondary  supporting action
subtle     low-emphasis command
danger     destructive or stopping action
```

Rules:

```txt
- One primary action per local command group.
- Buttons may include icons when the action benefits from quick recognition.
- Loading state must preserve button size.
- Disabled state must not be the only explanation for why an action is unavailable.
```

### Icon Button

Use icon buttons for familiar repeated utility actions such as open panel,
move up, move down, duplicate, delete, import, export, pause, stop, and run
when space is constrained.

Rules:

```txt
- Must have accessible label.
- Must have tooltip on web implementations.
- Must use familiar symbols where available.
```

### Field

Field is the standard label + control + optional hint/error wrapper.

Rules:

```txt
- Label is always visible.
- Error or issue text is attached to the field it affects.
- Required fields use issue state instead of decorative marks only.
```

### Badge / Pill

Use for compact status only.

Status groups:

```txt
neutral    idle, unknown, checking
success    ready, running, completed, saved
warning    paused, stopped, blocked, attention
danger     failed, error, invalid
```

Status cards are discouraged. Use inline field state, row state, or compact
badges unless the status itself is the main content.

Badge text should use regular or medium type. Do not use bold badge text as the
main visual differentiator; rely on placement, icon, border, and semantic color.

### Tabs

Use tabs for peer diagnostic or detail views, such as validation, locator, run
trace, and failure detail. Do not use tabs to hide required normal authoring
fields.

### Disclosure / Drawer

Use disclosure for advanced details and repair flows.

Default disclosed surfaces:

```txt
- Diagnostics drawer
- Advanced JSON repair
- Locator candidate detail
- Failure payload
```

### Toolbar

Toolbar groups commands for the current surface. Toolbar commands must follow
the command hierarchy and should wrap cleanly in narrow panels.

Toolbar rules:

```txt
- Prefer one primary command and at most two visible secondary commands.
- Put maintenance commands such as import, export, duplicate, move, delete, and
  diagnostics handoff into overflow when the group becomes crowded.
- Do not hide the user's next required action in overflow.
```

## 6. Product Components

### App Shell

Top-level product frame for native apps and large web surfaces.

Contains:

```txt
- Actorble brand
- selected workspace or scenario context when applicable
- platform readiness
- global run or record state when active
```

### Scenario Shell

Sticky or persistent control area for the active scenario.

Contains:

```txt
- scenario selector
- scenario name and description
- dirty/saved state
- target app/tab readiness
- save, run, record, import, export, check commands
```

Scenario metadata is part of the shell. It should not become a separate primary
card next to the builder.

### Run Controls

Controls execution state.

States:

```txt
idle
ready
running
paused
completed
failed
blocked
```

Commands:

```txt
Run
Pause
Resume
Stop
Open run details
```

Popup surfaces show only quick-run controls. Full builder controls belong in
the side panel or native app.

### Record Controls

Controls recording state.

Commands:

```txt
Record
Stop recording
Review recorded draft
Append
Replace
Save as new
Discard
Export draft
```

Recorded draft review must be explicit. Actorble should not silently replace a
user's current draft after recording.

### Action Selector

Primary way to add a step.

Rules:

```txt
- Uses a dropdown/select control, not a grid of action cards.
- May show action icons, labels, and concise hints inside a custom select.
- Creates the pending step only after the user chooses an action.
```

### Workflow Step Card

Primary navigation row for scenario steps.

Shows:

```txt
- order
- action
- target/input summary
- selected state
- issue or run feedback state
```

Step feedback appears here before it appears in diagnostics.

Selected state should use border, outline, or shadow. Avoid filling the whole
selected step with accent color because the expanded card already contains
multiple controls and field states.

### Inline Selected Step Editor

Expanded editing area inside the selected workflow step card.

Contains:

```txt
- selected step summary
- action selector
- action-specific fields
- target slots
- Test step command
- duplicate, move, delete commands
- advanced repair disclosure
```

### Target Slot Picker

Inline target assignment control inside the step inspector.

Rules:

```txt
- Only appears for actions that need targets.
- Uses action-specific slot names such as target, from, to, anchor, focus.
- Starts element picking directly from the target slot row.
- Do not duplicate separate Set target, Pick target, and Stop controls in the same local group.
- Selecting a target in the inspector ends the active picking interaction.
- Shows locator candidates only when selection is ambiguous, failed, or being inspected.
```

### Issues List

Inline list of problems the user can fix.

Rules:

```txt
- Prefer field-level issue placement.
- Attach step issues to the affected step first.
- Use diagnostics only for deeper detail.
```

### Diagnostics Drawer

Advanced detail surface.

May contain:

```txt
- check result details
- locator candidates
- run details
- failure detail
- trace event summary
- capability/fidelity detail
```

Diagnostics must not replace inline workflow feedback.

### Landing Components

Landing page may reuse:

```txt
- Brand lockup
- Button
- CTA group
- Badge / Pill
- Feature grid
- Surface card
- Product window mock
```

Landing may use more expressive layout, imagery, cinematic demos, and display
typography than product apps.

## 7. Platform Mapping

### Browser Extension

The browser extension should move toward a framework-based UI when the current
vanilla entrypoints become costly to maintain. React + Headless UI is an
acceptable default direction.

Rules:

```txt
- Keep view models and product state outside framework-specific components.
- Use headless primitives for dialog, disclosure, menu, tabs, tooltip, and listbox behavior.
- Use the shared terminology and component hierarchy from this document.
- Keep popup as quick-run remote.
- Keep side panel as scenario workbench.
```

### Native Desktop Apps

Native apps may use native UI kits. The exact stack is not decided.

Rules:

```txt
- Preserve the shared information architecture.
- Map semantic tokens to native color roles.
- Use native controls where they improve platform fit.
- Keep command names, status names, and workflow structure consistent.
- Do not expose runtime diagnostics by default just because the platform has space.
```

### Documentation Landing Page

The landing page may remain Astro-based and visually expressive.

Rules:

```txt
- Reuse brand tokens and base button language.
- Product mockups should reflect the actual product information architecture.
- Marketing sections may use landing-specific layout and larger type.
```

## 8. References

- `docs/high-level-architecture.md`
- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
- `docs/adr/2026-06-20-browser-extension-workflow-builder-ux.md`
