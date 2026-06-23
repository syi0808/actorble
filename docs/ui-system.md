# Actorble UI System

## 1. Purpose

The Actorble UI System is the shared product UI specification for the browser
extension, future native desktop apps, and documentation or landing surfaces.
It is a design contract, not a reusable UI package. Each platform may implement
the contract with its own toolkit as long as the resulting product hierarchy,
component dimensions, typography, spacing, status language, and interaction
states remain recognizable as Actorble.

Actorble is the single product and brand name. Platform-specific UI toolkits
may differ, but the command hierarchy, status language, scenario authoring
flow, and component proportions must remain consistent across browser, macOS,
Windows, Linux, and web documentation surfaces.

This document owns:

```txt
- product UI principles
- design token model
- user-facing terminology
- primitive component specs
- Actorble product component specs
- browser extension, native app, and landing page mapping rules
```

This document does not own:

```txt
- browser runtime semantics
- scenario schema shape
- native platform implementation choice
- React, SwiftUI, WinUI, GTK, Qt, or web framework APIs
- full accessibility conformance policy
```

Decision history:

```txt
docs/adr/2026-06-20-actorble-ui-system.md
docs/adr/2026-06-21-actorble-ui-polish-heuristics.md
docs/adr/2026-06-24-actorble-design-system-component-spec.md
```

## 2. Design Reference Model

Actorble uses shadcn/ui as a reference for the level of component specificity,
not as a dependency or visual clone. The useful ideas to borrow are:

```txt
- semantic theme tokens instead of raw color usage
- copy-owned primitives that can be adapted per product
- explicit component variants and sizes
- Field composition around label, control, description, and error
- headless primitives for menus, popovers, tabs, tooltips, and dialogs
- icon-aware button spacing
```

Actorble translates those ideas into a platform-neutral system. Web
implementations may use Radix, Headless UI, React Aria, native controls, or
plain HTML depending on the surface. Native implementations should map the same
tokens and component states onto platform-native roles and controls.

## 3. Product Principles

### Scenario-First

Actorble UI is product UI for creating and running scenarios. It is not a
developer tool that exposes runtime diagnostics or JSON document shape first.

Normal authoring flow:

```txt
Choose or create scenario
-> Build workflow steps
-> Pick targets
-> Check or test
-> Run or save
-> Open diagnostics only when detail is needed
```

### Consistent Across Platforms

Browser extension, macOS, Windows, and Linux apps use the same product model.
Native UI kits may change details, but this structure must remain intact:

```txt
App shell
-> Scenario shell
-> Workflow workbench
   -> Step flow
   -> Inline selected step editor
-> Diagnostics disclosure
```

Short-lived surfaces such as browser popups are quick-run remotes. They should
not compress the full builder into a tiny surface.

### Comfortable By Default

The default density is `comfortable`. Non-developers should be able to scan,
read, and edit scenarios without fighting cramped controls.

`compact` density is allowed for browser extension popups, constrained side
panels, DevTools panels, dense diagnostic tables, and other space-constrained
surfaces.

### Progressive Disclosure

Advanced detail appears only when it helps the user's next action.

Default surface:

```txt
- scenario
- workflow
- step
- action
- target
- status
- issue
```

Disclosed or advanced surface:

```txt
- locator candidates
- JSON repair
- schema validation payload
- run trace
- failure payload
- capability and fidelity detail
```

### Native And Headless Defaults

Use platform-native controls or headless primitives when they provide keyboard,
focus, role, and labeling behavior. Actorble styling must not remove those
behaviors. Custom rendering is acceptable only when the product interaction
requires it.

### Deliberate Product Polish

Actorble avoids generic high-noise product styling. Visual hierarchy must come
from importance, proximity, scale, and grouping before decorative emphasis.

Rules:

```txt
- Use the actual Actorble SVG symbol and wordmark assets.
- Do not redraw the logo with CSS bars, placeholder letters, or approximate marks.
- Use sentence case for labels, badges, tabs, menus, and helper text.
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

## 4. Token Model

Tokens are specified by meaning first. Platform implementations may map these
tokens to CSS variables, native color roles, theme objects, design assets, or
platform-specific constants.

### Brand Tokens

Brand tokens come from the current Actorble symbol and landing direction.

| Token | Value | Usage |
| --- | --- | --- |
| `actorble.ink` | `#101418` | Brand dark base, logo contrast, high-emphasis text. |
| `actorble.inkSoft` | `#17222C` | Deep product chrome and dark surface support. |
| `actorble.mint` | `#33E6C2` | Primary motion/accent color. |
| `actorble.amber` | `#F2B84B` | Secondary crossing/action color and attention moments. |
| `actorble.wordmark` | `#F7FBFF` | Light wordmark color. |

Mint/teal is the primary product accent. Amber is reserved for attention,
highlight, and secondary motion moments. Danger uses a red/coral family, not
amber.

### Semantic Color Tokens

Actorble follows a semantic color model with foreground pairs where text or
icons sit directly on a colored surface.

| Token | Purpose |
| --- | --- |
| `color.background` | App/page background. |
| `color.foreground` | Default text and icon color on background. |
| `color.surface` | Default panels, controls, fields, and repeated items. |
| `color.surfaceForeground` | Text and icons on `surface`. |
| `color.surfaceSoft` | Low-emphasis surfaces, secondary controls, hover fills. |
| `color.surfaceStrong` | Pressed state, selected neutral state, stronger grouping. |
| `color.popover` | Menus, popovers, tooltips, and floating overlays. |
| `color.popoverForeground` | Text and icons on `popover`. |
| `color.primary` | Primary command and selected accent. |
| `color.primaryForeground` | Text and icons on `primary`. |
| `color.secondary` | Supporting command surface. |
| `color.secondaryForeground` | Text and icons on `secondary`. |
| `color.muted` | Quiet metadata surface. |
| `color.mutedForeground` | Secondary text, descriptions, timestamps, inactive hints. |
| `color.accent` | Interactive accent, focus-adjacent highlight, active slot. |
| `color.accentForeground` | Text and icons on `accent`. |
| `color.accentSoft` | Soft selected state, target preview, low-emphasis accent fill. |
| `color.success` | Completed, ready, saved, valid. |
| `color.warning` | Paused, stopped, blocked, needs attention. |
| `color.danger` | Failed, invalid, destructive, stop/delete when dangerous. |
| `color.border` | Default borders and separators. |
| `color.input` | Field borders and input chrome. |
| `color.ring` | Focus-visible outline/ring. |
| `color.disabled` | Disabled text and icons. |
| `color.selection` | Text selection and selected row support. |

Default light mapping:

| Token | Value |
| --- | --- |
| `background` | `#F6F7F8` |
| `foreground` | `#15181D` |
| `surface` | `#FFFFFF` |
| `surfaceSoft` | `#EEF1F4` |
| `surfaceStrong` | `#E5E9EE` |
| `mutedForeground` | `#5D6876` |
| `border` | `#D5DCE4` |
| `primary` / `accent` / `success` | `#0F766E` |
| `primaryStrong` | `#0B5F59` |
| `accentSoft` | `#E2F5F0` |
| `warning` | `#956100` |
| `danger` | `#BD322B` |
| `disabled` | `#8C97A4` |
| `selection` | `#D8F4EE` |

Default dark mapping:

| Token | Value |
| --- | --- |
| `background` | `#17191C` |
| `foreground` | `#EEF2F6` |
| `surface` | `#20242A` |
| `surfaceSoft` | `#292F37` |
| `surfaceStrong` | `#343C46` |
| `mutedForeground` | `#A9B4C0` |
| `border` | `#3A4654` |
| `primary` / `accent` / `success` | `#63CDB7` |
| `primaryStrong` | `#8EE0CF` |
| `accentSoft` | `#173B36` |
| `warning` | `#E7BD6F` |
| `danger` | `#FFB4AB` |
| `disabled` | `#6F7A87` |
| `selection` | `#173B36` |

Exact values may be adjusted per platform for contrast and native appearance,
but the semantic role must not change.

### Spacing

Use a small even scale.

```txt
0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64
```

Component internals prefer `4`, `6`, `8`, `10`, and `12`. Product layout
prefers `12`, `16`, `20`, and `24`. Large page or landing sections may use
`32`, `40`, `48`, and `64`.

### Radius

| Token | Value | Usage |
| --- | --- | --- |
| `radius.xs` | `4` | Tiny tags, inner handles, code chips. |
| `radius.sm` | `6` | Compact controls, menu items, small inputs. |
| `radius.md` | `8` | Default controls, cards, panels, repeated items. |
| `radius.pill` | `999` | Pills, badges, circular icon-only affordances. |

Cards and framed repeated items stay at `8px` radius or less. Top-level page
sections should not all become floating cards.

### Typography

Use platform system fonts by default.

| Token | Size / line | Weight | Usage |
| --- | --- | --- | --- |
| `type.productTitle` | `20/26` to `28/34` | semibold/bold | Scenario title, app-level product title. |
| `type.sectionTitle` | `16/22` to `20/26` | semibold | Workbench sections, drawer headings. |
| `type.subsectionTitle` | `14/20` | semibold | Step editor groups and compact panels. |
| `type.body` | `13/20` to `15/22` | regular | Primary product text. |
| `type.control` | `13/18` | medium | Buttons, tabs, select triggers. |
| `type.caption` | `12/16` to `13/18` | regular/medium | Metadata, descriptions, status details. |
| `type.label` | `12/16` | medium | Field labels, compact row labels. |
| `type.monospace` | `12/18` to `13/20` | regular | JSON, code, diagnostics only. |

Text rules:

```txt
- Product labels use sentence case by default.
- Letter spacing is 0 unless a platform-native control requires otherwise.
- Product app typography must not scale directly with viewport width.
- Landing pages may use larger display type, but component text remains stable.
- Button, tab, badge, and menu labels must fit without clipping at all supported widths.
```

### Density

| Density | Default control height | Row height | Usage |
| --- | --- | --- | --- |
| `compact` | `34-38` | `34-52` | Browser popup, narrow side panel areas, diagnostics. |
| `comfortable` | `40-44` | `48-72` | Primary builder surfaces and native desktop apps. |

Icons inside controls are usually `16px`. Large controls may use `18px`.
Standalone product icons may use `20px` or `24px` when they are the content,
not decoration.

### Motion

Motion clarifies state changes. It should not decorate every surface.

| Token | Duration | Usage |
| --- | --- | --- |
| `motion.fast` | `120-180ms` | Hover, focus, selected, quick state change. |
| `motion.standard` | `180-260ms` | Menus, popovers, small disclosures. |
| `motion.workflowReveal` | `220-320ms` | Selected step expansion and drawer reveal. |

Runtime visual feedback such as Actorble cursor motion belongs to runtime
visual layer policy, not the product UI token contract.

## 5. User-Facing Terminology

Actorble is used by non-developers, so primary UI avoids internal runtime terms.

| Concept | User-facing term | Usage |
| --- | --- | --- |
| Saved runnable document | Scenario | Use "Create scenario", "Save scenario", "Run scenario". |
| Ordered visual sequence inside a scenario | Workflow | Use for the builder area, not as a separate stored object. |
| One item in a workflow | Step | Use "Add step", "Move step", "Test step". |
| What a step performs | Action | Use in the action selector and step editor. |
| Element or location Actorble controls | Target | Use "Pick target" and "Target". Explain as a page/app element only when helpful. |
| Page/app readiness | Ready / Blocked / Checking | Use compact status language. |
| Scenario validation | Check | Button label is "Check scenario", not "Validate" in primary UI. |
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

## 6. Primitive Components

Primitive components define behavior, sizing, spacing, typography, and state
contracts. Implementations may use React with headless primitives, native UI
components, or another toolkit.

### Common Component States

Every interactive primitive that supports the state must define it explicitly.

| State | Visual contract |
| --- | --- |
| `default` | Uses base variant styling and normal foreground contrast. |
| `hover` | Changes border, surface, or foreground subtly; never moves layout. |
| `active` / `pressed` | Uses `surfaceStrong` or a stronger variant tone. |
| `focus-visible` | Uses a 2px `ring` outline or native equivalent with 2px offset where possible. |
| `selected` | Uses structure: border, outline, ring, checkmark, or selected indicator. Avoid full accent fills for dense editable cards. |
| `disabled` | Reduces contrast and removes pointer interaction, but the UI must still explain why action is unavailable when needed. |
| `loading` / `pending` | Preserves component width and height. Use spinner or progress text without shifting labels. |
| `invalid` | Uses `danger` border or text plus attached issue copy. Color alone is insufficient. |

### Button

Button follows a shadcn-style variant and size model, translated into
Actorble-specific names.

Variants:

| Variant | Meaning | Visual contract |
| --- | --- | --- |
| `primary` | Main action in the current local command group. | Filled `primary` background, `primaryForeground` text, stronger hover. |
| `secondary` | Supporting action that should remain visible. | Bordered or soft filled surface, default text, subtle accent hover. |
| `subtle` | Low-emphasis command or local utility. | Transparent or nearly transparent background, visible on hover/focus. |
| `danger` | Destructive, stopping, or risky action. | Danger foreground and/or danger-tinted surface. Use filled danger only for irreversible confirmation. |

Sizes:

| Size | Height | Horizontal padding | Gap | Font | Icon | Usage |
| --- | --- | --- | --- | --- | --- | --- |
| `xs` | `28` | `8` | `4` | `12/16 medium` | `14` | Dense tables, tiny inline utilities. |
| `sm` | `34` | `10` | `6` | `13/18 medium` | `16` | Compact extension surfaces and tight toolbars. |
| `md` | `40` | `14` | `8` | `13/18 medium` | `16` | Default product button. |
| `lg` | `44` | `18` | `8` | `14/20 medium` | `18` | High-emphasis primary action or landing CTA. |

Icon-only sizes:

| Size | Box | Icon | Radius |
| --- | --- | --- | --- |
| `xs` | `28 x 28` | `14` | `6` or pill |
| `sm` | `34 x 34` | `16` | `8` or pill |
| `md` | `40 x 40` | `16` | `8` or pill |
| `lg` | `44 x 44` | `18` | `8` or pill |

Rules:

```txt
- One primary button per local command group.
- Use text buttons for clear, infrequent commands.
- Use icon + text for commands that benefit from recognition and clarity.
- Icon-only buttons require accessible labels and tooltips on web.
- Loading state must preserve button size.
- Disabled state must not be the only explanation for unavailable action.
- Do not use pill-shaped text buttons by default; reserve pill shape for badges, compact filters, or brand CTAs.
- Button labels use sentence case and should not wrap unless the button is full width.
```

Button content layout:

```txt
leading icon -> label -> trailing icon/spinner
```

If a spinner replaces an icon, it uses the same icon slot size. If a button has
both icon and loading state, the spinner replaces the icon rather than adding a
third visual item.

### Icon Button

Use icon buttons for familiar repeated utility actions such as open panel, move
up, move down, duplicate, delete, import, export, pause, stop, run, close,
expand, collapse, and more actions.

Rules:

```txt
- Must have an accessible label.
- Must have a tooltip on web implementations.
- Must use familiar symbols where available.
- Must not be used for unfamiliar destructive commands without nearby text.
- Keeps a fixed square box from the button size table.
```

### Button Group

Button Group joins related commands into a single local command set.

Specs:

```txt
- Internal gap: 0 when visually joined, 6-8 when separate buttons are grouped.
- Border radius: outer buttons keep radius, inner joins are square on joined edges.
- Height follows the selected Button size.
- Use only when commands operate on the same object or mode.
```

### Segmented Control

Use segmented control for mutually exclusive modes or views with two to five
options. It is not a replacement for top-level navigation.

Specs:

| Size | Height | Trigger padding | Font | Gap |
| --- | --- | --- | --- | --- |
| `sm` | `32` | `8` | `12/16 medium` | `2` |
| `md` | `38` | `10-12` | `13/18 medium` | `2` |

Rules:

```txt
- Each option has equal visual height.
- Selected state uses surface, border, or check indicator.
- Use icons only when all options have equally familiar icons.
```

### Field

Field is the standard label + control + optional description/error wrapper.
It follows the same composition idea as shadcn Field: related labels, controls,
descriptions, and errors are grouped into one accessible unit.

Structure:

```txt
Field
-> FieldLabel
-> Control
-> FieldDescription optional
-> FieldError optional
```

Vertical field specs:

```txt
label -> control gap: 6
control -> description gap: 4
control -> error gap: 6
field -> field gap: 12 comfortable, 8 compact
```

Horizontal field specs:

```txt
label column: 96-132 depending on surface
column gap: 10-12
align: label baseline or control center depending on control type
switch/checkbox labels sit beside the control, not above it
```

Rules:

```txt
- Label is always visible for editable product fields.
- Placeholder text is not a label.
- Error or issue text is attached to the affected field.
- Required fields use issue state and copy instead of decorative marks only.
- Field descriptions are concise and omitted when the label is self-explanatory.
```

### Text Input

Sizes:

| Size | Height | Padding | Font | Radius |
| --- | --- | --- | --- | --- |
| `sm` | `34` | `0 10` | `13/18 regular` | `6-8` |
| `md` | `40` | `0 12` | `13/20 regular` | `8` |
| `lg` | `44` | `0 14` | `14/20 regular` | `8` |

Rules:

```txt
- Field width is layout-owned; inputs fill their container by default.
- Text must not be clipped vertically.
- Read-only state uses muted foreground and a soft surface.
- Invalid state uses danger border plus FieldError.
- Inline leading/trailing icons use the same icon slot as Button.
```

### Textarea

Specs:

```txt
minimum height: 92 compact, 112 comfortable
padding: 10-12
font: body for prose, monospace only for JSON/code
resize: vertical on web unless fixed by the platform surface
```

### Select

Use Select for choosing one value from a bounded list. Native select is
acceptable when it preserves keyboard and platform behavior with less code.
Custom select/listbox is appropriate when options need icons, descriptions, or
grouping.

Sizes match Text Input. Trigger content layout:

```txt
selected value / placeholder -> trailing chevron
```

Rules:

```txt
- Use native select for simple option lists.
- Use custom select for action selectors, target slot choices, or grouped choices.
- Keep trigger height stable when value changes.
- Invalid state attaches to Field and Select trigger.
- Placeholder text describes the expected choice, not the field label.
```

### Checkbox, Radio, And Switch

Specs:

| Primitive | Control size | Label gap | Usage |
| --- | --- | --- | --- |
| Checkbox | `16-18` | `8` | Independent binary setting. |
| Radio | `16-18` | `8` | Mutually exclusive choice inside a fieldset. |
| Switch | `36 x 20` compact, `40 x 22` comfortable | `8-10` | Persistent on/off setting. |

Rules:

```txt
- Use checkbox for binary settings, not small text buttons.
- Use radio when all options should be visible.
- Use switch only for settings that apply immediately or clearly persist.
- Label and description are part of the hit target where platform behavior allows.
```

### Badge / Pill

Use badges and pills for compact status or metadata only. They do not replace
buttons.

Tones:

| Tone | Meaning |
| --- | --- |
| `neutral` | Idle, unknown, checking, metadata. |
| `success` | Ready, running, completed, saved, valid. |
| `warning` | Paused, stopped, blocked, attention. |
| `danger` | Failed, error, invalid. |
| `accent` | Selected filter or active target slot. |

Sizes:

| Size | Height | Padding | Gap | Font | Icon |
| --- | --- | --- | --- | --- | --- |
| `sm` | `20` | `6` | `4` | `12/16 regular` | `12` |
| `md` | `24` | `8` | `5` | `12/16 medium` | `14` |

Rules:

```txt
- Badge text is regular or medium, not bold.
- Use sentence case.
- Avoid all-caps status labels.
- Do not show idle/default badges as first-view chrome.
- If a badge is clickable, it must behave like a button or link and meet that primitive's accessibility contract.
```

### Tabs

Use tabs for peer diagnostic or detail views such as validation, locator, run
trace, and failure detail. Do not use tabs to hide required authoring fields.

Specs:

```txt
tab list height: 34 compact, 38 comfortable
trigger padding: 10-12 horizontal
trigger gap with icon: 6
font: control
content gap below tabs: 12
```

Rules:

```txt
- Tabs represent peer sections at the same hierarchy level.
- Selected tab uses structure or surface contrast, not only color.
- Tab labels should fit on one line in supported viewports.
```

### Disclosure

Use disclosure for optional details and repair flows.

Specs:

```txt
trigger height: Button sm/md depending on density
content top gap: 8-12
content indentation: 0 by default, 12 only when nested structure needs it
```

Default disclosed surfaces:

```txt
- Diagnostics drawer
- Advanced JSON repair
- Locator candidate detail
- Failure payload
```

### Drawer And Dialog

Use drawers for persistent secondary work areas such as diagnostics. Use dialogs
for blocking confirmation or focused flows.

Drawer specs:

```txt
side panel drawer max height: available viewport
desktop drawer width: 360-480
content padding: 16 comfortable, 12 compact
section gap: 16 comfortable, 12 compact
```

Dialog specs:

```txt
width: 360-560 for product flows
padding: 20 comfortable, 16 compact
title: sectionTitle
footer gap: 8
primary action: right-aligned on desktop where platform convention allows
```

Rules:

```txt
- Do not use dialogs for routine inline editing.
- Destructive dialogs must name the affected object.
- Drawer content remains secondary to the builder unless the user opens it.
```

### Dropdown Menu

Use dropdown menus for overflow and maintenance commands.

Specs:

```txt
menu min width: 180
menu padding: 5-6
item height: 32 compact, 36 comfortable
item padding: 8-10 horizontal
item icon: 16
item gap: 8
item radius: 6
separator margin: 4
```

Rules:

```txt
- Menu items use sentence case.
- Destructive items use danger foreground and may include a destructive icon.
- Do not hide the user's only next required action in a menu.
- Overflow trigger is near the content it affects.
```

### Tooltip

Use tooltips for icon-only controls and unfamiliar compact utilities.

Specs:

```txt
delay: 300-500ms
max width: 220
padding: 6 8
font: caption
radius: 6
```

Rules:

```txt
- Tooltip text names the action or clarifies a disabled condition.
- Tooltip content is not required to understand primary workflows.
- Tooltips appear on hover and keyboard focus where the platform supports it.
```

### Toolbar

Toolbar groups commands for the current surface. Toolbar commands follow the
command hierarchy and wrap cleanly in narrow panels.

Specs:

```txt
gap: 8
row gap when wrapping: 8
alignment: center
primary action position: first in narrow vertical groups, right or leading depending on platform convention in desktop shell
```

Rules:

```txt
- Prefer one primary command and at most two visible secondary commands.
- Move maintenance commands such as import, export, duplicate, move, delete, and diagnostics handoff into overflow when crowded.
- Do not hide the user's next required action in overflow.
```

### Empty State

Empty states are concise product prompts, not explanatory articles.

Specs:

```txt
title: subsectionTitle or body medium
description: caption/body, max 1-2 short lines
primary action: Button md or sm depending on surface
gap: 8-12
```

Preferred examples:

```txt
Add a step
Pick a target
Record a workflow
```

Avoid long explanations of why the surface is empty unless the user must fix a
blocked state.

## 7. Product Components

### App Shell

Top-level product frame for native apps and large web surfaces.

Contains:

```txt
- Actorble brand
- selected workspace or scenario context when applicable
- platform readiness
- global run or record state when active
```

Specs:

```txt
shell padding: 16-20 desktop, 12-16 constrained
brand symbol: 24-32 depending on surface
wordmark width: 116-152 in compact/product chrome
global command gap: 8
```

### Scenario Shell

Persistent control area for the active scenario.

Contains:

```txt
- scenario selector
- scenario name and description
- dirty/saved state
- target app/tab readiness
- save, run, record, import, export, check commands
```

Specs:

```txt
padding: 12-16 compact side panel, 16-20 comfortable desktop
internal gap: 10-12
toolbar gap: 8
field grid gap: 8 compact, 12 comfortable
sticky shell shadow: subtle, only enough to separate from scrolled content
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

Specs:

```txt
Run: primary when runnable
Pause/Resume: secondary while active
Stop: danger or secondary-danger depending on risk and active state
Open run details: subtle or overflow unless failure details are the next action
```

Popup surfaces show quick-run controls only. Full builder controls belong in
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

Specs:

```txt
Record: secondary by default, primary only on record-first surfaces
Stop recording: danger while recording
Review actions: Replace primary, Append secondary, Discard danger/subtle depending on context
```

Recorded draft review must be explicit. Actorble should not silently replace a
user's current draft after recording.

### Action Selector

Primary way to add or configure a step action.

Rules:

```txt
- Uses a dropdown/select control, not a grid of action cards.
- May show action icons, labels, and concise hints inside a custom select.
- Creates the pending step only after the user chooses an action.
- Uses Field + Select sizing from the primitive specs.
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

Collapsed specs:

| Density | Min height | Padding | Gap | Icon/order box |
| --- | --- | --- | --- | --- |
| `compact` | `44-52` | `10-12` | `8-10` | `28` |
| `comfortable` | `56-64` | `12-14` | `10-12` | `32` |

Expanded selected specs:

```txt
editor gap: 12 compact, 16 comfortable
field group gap: 10-12
action row min height: Button sm/md
advanced disclosure gap: 8-12
```

Selected state should use border, outline, or shadow. Avoid filling the whole
selected step with accent color because the expanded card contains controls,
field states, and issue states.

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

Rules:

```txt
- The editor is part of the selected step card, not a separate unrelated panel.
- Duplicate, move, and delete are selected-step context actions.
- Test step stays visible when a step is runnable.
- Advanced repair remains disclosed unless it is required for the next user action.
```

### Target Slot Picker

Inline target assignment control inside the step editor.

Rules:

```txt
- Only appears for actions that need targets.
- Uses action-specific slot names such as target, from, to, anchor, focus.
- Starts element picking directly from the target slot row.
- Do not duplicate separate Set target, Pick target, and Stop controls in the same local group.
- Selecting a target in the inspector ends the active picking interaction.
- Shows locator candidates only when selection is ambiguous, failed, or being inspected.
```

Specs:

```txt
row min height: 40 compact, 44 comfortable
row padding: 10-12
row gap: 8
label font: label
summary font: caption/body
pick command: Button sm in compact, md in comfortable
active picking state: accentSoft background or accent border plus clear state text
```

### Issues List

Inline list of problems the user can fix.

Rules:

```txt
- Prefer field-level issue placement.
- Attach step issues to the affected step first.
- Use diagnostics only for deeper detail.
- Use danger text with icon or border; do not rely on red alone.
```

Specs:

```txt
issue row padding: 8-10
issue row gap: 8
icon: 16
font: 13/20 body
border radius: 8
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

Specs:

```txt
drawer trigger: subtle or secondary command
default state: collapsed
tabs: validation, locator, run trace, failure detail when peer sections exist
monospace blocks: 12/18 or 13/20
table row height: 34-40
```

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
typography than product apps. Component primitives still use the same variants,
states, and basic proportions.

## 8. Platform Mapping

### Browser Extension

Browser extension product entrypoints apply this UI system instead of styling
each button and panel independently. React with headless primitives is an
acceptable implementation direction, but the design source of truth remains
this document.

Rules:

```txt
- Keep view models and product state outside framework-specific components.
- Use headless primitives for dialog, disclosure, menu, tabs, tooltip, and listbox behavior when useful.
- Use native controls for simple inputs and selects when they preserve platform behavior with less code.
- Use the shared terminology and component hierarchy from this document.
- Keep popup as quick-run remote.
- Keep side panel as scenario workbench.
- Implement component size and variant props instead of ad hoc per-entrypoint CSS.
```

### Native Desktop Apps

Native apps may use native UI kits. The exact stack is not decided.

Rules:

```txt
- Preserve the shared information architecture.
- Map semantic tokens to native color roles.
- Use native controls where they improve platform fit.
- Keep command names, status names, and workflow structure consistent.
- Match component heights, typography roles, spacing, and status tones from this document where platform conventions allow.
- Do not expose runtime diagnostics by default just because the platform has space.
```

### Documentation Landing Page

The landing page may remain Astro-based and visually expressive.

Rules:

```txt
- Reuse brand tokens and base button language.
- Product mockups should reflect the actual product information architecture.
- Marketing sections may use landing-specific layout and larger type.
- Landing CTAs still follow Button variant, size, icon, loading, and focus rules.
```

## 9. Implementation Invariants

Any platform implementation of the Actorble UI System should preserve these
invariants:

```txt
- Component variants and sizes are explicit API or style-layer concepts.
- Product surfaces do not invent one-off button heights, badge weights, or field spacing.
- Semantic tokens are used before raw color values.
- Primary actions are local to a command group, not repeated across every card.
- Icon-only controls have accessible labels and web tooltips.
- Default/idle status does not dominate first-view chrome.
- Advanced runtime terms remain in diagnostics or disclosures.
- Text fits its container at supported compact and comfortable widths.
- Focus-visible state is clearly visible and not removed by custom styling.
```

## 10. References

- `docs/high-level-architecture.md`
- `docs/browser-extension-architecture.md`
- `docs/adr/2026-06-20-actorble-ui-system.md`
- `docs/adr/2026-06-21-actorble-ui-polish-heuristics.md`
- `docs/adr/2026-06-24-actorble-design-system-component-spec.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
- `docs/adr/2026-06-20-browser-extension-workflow-builder-ux.md`
- shadcn/ui Button: https://ui.shadcn.com/docs/components/button
- shadcn/ui Field: https://ui.shadcn.com/docs/components/field
- shadcn/ui Select: https://ui.shadcn.com/docs/components/select
- shadcn/ui Theming: https://ui.shadcn.com/docs/theming
