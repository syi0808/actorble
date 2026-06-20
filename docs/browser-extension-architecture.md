# Actorble Browser Extension Architecture

## 1. Purpose

browser extension은 Actorble의 browser GUI shell입니다. 목표는 browser runtime을
쉽게 사용할 수 있게 하되, `@actorble/browser`가 JSON storage, schema interpretation,
authoring UI, recorder behavior까지 책임지지 않도록 경계를 유지하는 것입니다.

extension은 browser-specific scenario authoring을 소유합니다.

```txt
Scenario document JSON
-> extension validation and migration
-> extension compiler
-> @actorble/browser runtime scenario
-> Actorble.run(...)
```

공통 schema는 `schemas/scenario` 아래에 둡니다. extension compiler는 browser
permission, tab, frame, locator fidelity, recorder output, runtime capability를
이해해야 하므로 extension application 내부에 둡니다.

## 2. Extension Boundaries

browser extension이 소유하는 것:

- popup과 side panel UI
- scenario import/export/save/load
- scenario document validation과 migration wiring
- browser scenario compiler
- target inspector UI
- event recorder와 event-to-step normalization
- runtime injection과 message routing
- run control과 trace display

`@actorble/browser`가 소유하는 것:

- public browser control API
- scenario runner semantic
- target resolution
- geometry와 interactability
- pointer, keyboard, text, scroll, drag, wait, settlement behavior
- diagnostics와 runtime trace

shared schema가 소유하는 것:

- portable document shape
- draft/stable version identifier
- semantic note
- valid/invalid conformance fixture

## 3. Top-Level Structure

```txt
browser-extension/
  wxt.config.ts
  src/
    entrypoints/
      popup/
      sidepanel/
      background/
      content/
      devtools/
      devtools-panel/
    ui/
      tokens.css
      components.tsx
      icons.tsx
    scenario/
      validate.ts
      migrate.ts
      compile-to-browser-runtime.ts
      export-code.ts
    builder/
      authoring-session.ts
      step-operations.ts
      target-slots.ts
    recorder/
      event-capture.ts
      event-to-step.ts
      locator-synthesis.ts
    inspector/
      target-picker.ts
      locator-preview.ts
    storage/
    messaging/
    trace/
```

WXT가 extension manifest를 생성하므로 source `manifest.json`은 두지 않습니다.
entrypoint-specific code는 `src/entrypoints` 아래에 두고, workflow builder처럼
테스트 가능한 authoring logic은 entrypoint 밖의 feature module에 둡니다.

Related decisions:

- `docs/adr/2026-06-18-browser-extension-workflow-builder.md`
- `docs/adr/2026-06-19-browser-extension-sidepanel-recomposition.md`
- `docs/adr/2026-06-20-browser-extension-product-ui-composition.md`
- `docs/adr/2026-06-20-browser-extension-workflow-builder-ux.md`
- `docs/adr/2026-06-21-browser-extension-react-ui.md`
- `docs/adr/2026-06-19-inspector-match-index-targeting.md`
- `docs/adr/2026-06-19-text-selection-and-pointer-sequence.md`

## 4. Runtime Components

### Popup

popup은 짧은 control에 집중합니다.

- recording 시작/중지
- 선택된 scenario 실행
- 현재 run pause/resume/stop
- side panel 열기
- 현재 tab readiness와 마지막 run status 표시

popup lifetime과 focus behavior는 multi-step editing에 맞지 않으므로 full builder
workflow를 popup이 소유하지 않습니다.

#### Popup Information Architecture

popup은 builder의 축소판이 아니라 quick-run remote입니다. 기본 화면은 현재 탭이
실행 가능한지, 어떤 scenario가 선택되었는지, 지금 실행 또는 녹화를 시작할 수
있는지만 보여줍니다.

```txt
Current tab readiness
-> Scenario selector
-> Primary run command
-> Secondary record and open panel commands
-> Active run command bar when needed
```

`Run`은 선택된 scenario가 있고 target tab이 ready일 때 기본 primary command입니다.
`Record`는 scenario 생성 입력 경로이므로 secondary command로 남기되, recording 중에는
`Stop recording` 상태로 전환합니다. `Pause`, `Resume`, `Stop` 같은 active-run
command는 실행 중일 때만 command bar에 표시합니다. Side panel 열기는 editing
handoff이므로 icon button 또는 낮은 무게의 secondary command로 취급합니다.

popup은 세부 diagnostics, JSON repair, step editing, locator candidate review를
노출하지 않습니다. 오류가 사용자의 다음 행동에 필요하면 한 줄 상태와 side panel
handoff로 연결합니다.

### Side Panel

side panel은 primary authoring surface이며, 단순 step JSON editor가 아니라
**scenario workflow builder**입니다. 사용자는 action을 추가하고, action별 입력을
채우고, target이 필요한 slot을 inspector로 지정하고, step 단위 또는 scenario 전체를
dry-run한 뒤 저장합니다.

- scenario list
- authoring session과 unsaved draft 관리
- step add / insert / duplicate / delete / reorder
- action family별 structured editor
- target slot picker와 locator candidate preview
- options editor
- validation error
- import/export
- per-step dry run
- trace와 failure detail

side panel은 raw JSON textarea를 primary editor로 노출하지 않습니다. JSON import,
export, advanced repair는 가능하지만, 일반 authoring flow는 structured operation을
통해 scenario document를 변경합니다.

권장 authoring session model:

```txt
ScenarioAuthoringSession
- selectedScenarioId
- draftDocument
- dirty state
- selectedStepId
- selectedTargetSlot
- run session
- record session
- trace view
- validation issues
```

`selectedTargetSlot`은 target이 들어갈 위치를 명시합니다.

```txt
TargetSlot
- step target
- drag from
- drag to
- text selection anchor
- text selection focus
- waitFor target
- scrollTo target
```

inspector와 locator preview는 target slot이 선택된 상태에서만 primary authoring
flow에 진입합니다. standalone inspector는 diagnostics 용도로만 허용합니다.

#### Side Panel Information Architecture

side panel은 기능 카드를 병렬로 나열하지 않고, scenario lifecycle과 builder 작업을
중심으로 구성합니다.

```txt
Sticky scenario shell
-> Builder workbench
   -> Timeline
   -> Selected step editor
      -> Action fields
      -> Inline target assignment
-> Recorded draft review
-> Collapsible diagnostics drawer
```

Scenario shell은 기존 Document card를 대체합니다. scenario 선택, 생성, 이름과
설명 편집, dirty/saved 상태, target tab readiness, import/export, save, record,
run은 하나의 scenario lifecycle control로 노출합니다. document metadata는 scenario
metadata로 취급하고, 별도 primary card로 분리하지 않습니다. Shell은 scroll 중에도
작업 맥락과 primary command를 잃지 않도록 side panel 상단의 sticky workbar로 둘 수
있습니다.

Scenario builder workbench는 step list와 selected step editor를 같은 작업면에
둡니다. step add/insert/duplicate/delete/reorder, action family 선택, action별
structured field editing, per-step dry run은 선택된 step 맥락 안에서 동작합니다.
Steps와 Step Editor는 별도 primary card가 아닙니다.

#### Workflow Builder Behavior

Builder는 scenario document 편집 폼이 아니라 ordered workflow authoring surface입니다.
사용자는 다음 동작을 통해 scenario를 작성합니다.

```txt
Choose or create scenario
-> Add an action from an action palette
-> Select a step in the flow
-> Configure that step in the properties inspector
-> Assign required targets from the step context
-> Check or test the selected step
-> Reorder, duplicate, or remove steps from the selected step context
-> Save or run the scenario
```

Step flow는 scenario의 순서를 보여주는 primary navigation입니다. 각 step은 action,
순서, target/input 요약, validation state, selected state를 함께 보여야 합니다.
사용자가 flow item을 선택하면 properties inspector는 해당 step의 action-specific
fields, target slots, run controls, repair controls를 보여줍니다.

Action 추가는 raw select와 add button 조합이 아니라 action palette 동작입니다. Palette는
사용 가능한 action family를 보여주고, 선택된 family로 새 step을 추가하거나 현재 step
뒤에 삽입합니다. Raw select는 keyboard and fallback control로 남길 수 있지만 primary
authoring interaction은 palette입니다.

Step reorder, duplicate, delete는 global toolbar가 아니라 selected step context action으로
취급합니다. 이 동작은 선택된 workflow step을 기준으로 draft session을 변경합니다.
step이 선택되지 않은 상태에서는 삭제나 위치 변경 command를 비활성화합니다.

Step validation과 run feedback은 영향을 받은 step에 먼저 붙습니다. Diagnostics drawer는
세부 정보를 보여줄 수 있지만, flow item과 inspector field state가 다음에 봐야 할
문제를 먼저 표시해야 합니다.

Target assignment는 selected step editor 내부의 target field control입니다. target이
필요한 action만 `Set target` interaction을 활성화합니다. drag는 from/to, waitFor는
wait target, scrollTo target은 scroll target처럼 action-specific slot을 명시합니다.
target picker UI는 standalone card가 아니라 해당 slot을 채우는 버튼과 진행 상태입니다.
inspector에서 요소를 선택하면 extension은 locator candidate를 preview하고, 선택된
요소와 매칭되는 최상위 candidate를 correlated target slot에 즉시 기록합니다.
candidate가 여러 요소에 매칭되면 browser locator의 0-based `matchIndex`로 선택
요소를 disambiguate합니다. Locator candidates는 정상 authoring flow에서 기본 노출하지
않고, ambiguous 또는 failed 상태일 때만 compact chooser 또는 diagnostics drawer에
표시합니다.

Recording은 builder의 primary input path입니다. record start/stop은 scenario shell에서
제공하고, stop 후 draft가 있으면 builder review surface에 표시합니다. recorded draft는
현재 draft를 조용히 덮어쓰지 않고 replace, append, save as new, export, discard 중
명시적 사용자 선택으로만 반영합니다. empty recording과 sensitive input confirmation은
review surface에서 처리합니다.

Recorder는 click/input/change만 보지 않고 pointer sequence, selectionchange,
drag/drop event도 capture host에서 관측해야 합니다. Normalizer는 raw event를 그대로
저장하기보다 `click`, `fill`, `typeInto`, `selectText`, `drag` 같은 stable intent를
우선 생성합니다. Gesture intent를 안정적으로 판별하지 못했지만 replay fidelity를
보존해야 하는 경우에만 cleanup-safe한 `pointerSequence` fallback을 사용합니다.

Locator preview, validation details, run trace, failure detail은 debugging information으로
취급합니다. 기본 상태는 접힌 debug drawer이며, validation failure나 run failure처럼
사용자의 다음 행동에 필요한 경우에만 열거나 강조할 수 있습니다. Debug drawer는
authoring flow를 보조하지만 scenario 생성, step editing, target setting의 primary
surface가 아닙니다.

#### Extension UI System

Extension entrypoints apply the cross-platform Actorble UI system defined in
`docs/ui-system.md` instead of styling each button and panel independently.
Browser extension product entrypoints use React with headless primitives for the
rendering layer. WXT owns extension entrypoint bundling, React owns local UI
composition, and framework-agnostic view models continue to own product state
projection. The source of design truth remains the repo-level UI system spec.

The extension uses unstyled headless primitives only where they improve
interaction semantics, such as tooltip, tabs, and disclosure behavior. Native
form controls remain acceptable for simple inputs and selects when they preserve
keyboard and platform behavior with less code.

- Commands use explicit hierarchy: primary, secondary, subtle, and danger.
- Icon-only controls require accessible labels and tooltips.
- Text buttons are reserved for high-clarity commands; repeated utility
  controls such as move, delete, run, pause, stop, import, export, and panel
  handoff should use a familiar icon with concise text or an icon-only affordance.
- Status is shown with compact badges or inline field state, not with separate
  status cards.
- Repeated items such as steps, locator candidates, and recorded draft choices
  may use rows or compact cards. Top-level page sections should not all render as
  equal floating cards.
- Advanced JSON repair, locator diagnostics, validation details, run trace, and
  failure payloads belong behind disclosure controls unless they are required for
  the next user action.
- Primary UI labels should use non-developer product language from the UI system:
  scenario, workflow, step, action, target, check, test step, run details, and
  issues.

### Background Service Worker

background service worker는 extension-level state를 조율합니다.

- tab/frame routing
- extension command handling
- storage access
- content script readiness
- long-running run/record session metadata
- recording event buffering across navigation
- permission check

Actorble action을 직접 실행하지 않습니다.

### Content Script

content script는 page runtime host입니다.

- `Actorble` browser instance 생성
- compiled runtime scenario 실행
- recording 중 page event capture와 incremental event flush
- target inspector overlay host
- trace와 status update를 extension UI로 stream

content script는 browser extension isolation과 permission boundary를 넘나들기
때문에 page-facing code를 작고 명시적으로 유지해야 합니다.

content script memory는 navigation과 frame reload에 의해 사라질 수 있으므로,
recording source of truth를 content script 내부 배열로 두지 않습니다. content
script는 capture host이고, background service worker가 correlated recording
session과 event buffer를 소유합니다.

### Optional DevTools Panel

advanced debugging을 위해 DevTools panel을 나중에 추가할 수 있습니다.

- full trace inspection
- locator diagnostics
- runtime capability report
- frame/surface debugging

첫 usable extension에는 필수가 아닙니다.

## 5. Scenario Flow

### Run Existing Scenario

```txt
Side panel or popup
-> load scenario document
-> validate against schemas/scenario/draft/scenario.schema.json
-> migrate if needed
-> compile with browser-extension/src/scenario
-> send runtime scenario to content script
-> Actorble.run(runtimeScenario)
-> stream status and trace back to UI
```

### Record Scenario

```txt
Popup or side panel
-> record:start
-> background creates recording session and event buffer
-> content script captures page, pointer, selection, drag/drop, and text events
-> content script flushes record:event messages
-> pagehide/navigation flushes pending events before cleanup
-> record:stop asks background to normalize buffered events
-> recorder synthesizes locator candidates
-> event-to-step normalizer compresses raw events
-> draft scenario document is opened in side panel builder review
-> user merges, edits, validates, saves, or exports
```

recorder output은 draft로 다룹니다. raw browser event보다 `fill`, `click`,
`selectText`, `drag` 같은 stable intent step을 우선합니다.

Recorder normalizer는 다음 우선순위로 event window를 해석합니다.

```txt
text input/change
→ fill 또는 typeInto

pointer down/move/up + selectionchange
→ selectText

dragstart/drop 또는 명확한 draggable/drop target
→ drag

movement threshold 이하 + selection 변화 없음
→ click

판별 실패 + replay fidelity 필요
→ pointerSequence fallback
```

`pointerDown`, `pointerMove`, `pointerUp`는 독립 scenario step으로 정규화하지
않습니다. Low-level pointer 재생이 필요한 경우에도 하나의 `pointerSequence` step으로
닫아 Action Orchestrator가 cleanup을 책임지게 합니다.

recording은 browser 사용을 scenario화하는 primary input path입니다. 따라서 다음
invariants를 지켜야 합니다.

- content script navigation 또는 reload가 recorded events를 잃게 하면 안 됩니다.
- stop 시점에 event가 없으면 invalid empty scenario 대신 user-facing empty recording
  state를 반환해야 합니다.
- recorded draft는 기존 scenario를 조용히 덮어쓰지 않습니다. builder가 replace,
  append, discard를 명시적으로 선택하게 합니다.
- sensitive input은 draft review에서 확인해야 저장할 수 있습니다.

### Pick Target

```txt
Side panel target slot
-> inspector:start with target slot correlation
-> content script shows hover highlight
-> user selects element
-> locator synthesis previews ranked candidates and selected match index
-> best candidate matching the selected element is written into the correlated target slot
```

target picker는 별도 feature가 아니라 builder의 target assignment interaction입니다.
선택 결과는 현재 step의 단일 `target` 필드에만 쓰지 않고, correlated target slot에
씁니다. target slot이 없는 action에서는 inspector launch를 비활성화합니다.
선택된 요소를 어떤 candidate도 확인하지 못하면 draft document를 변경하지 않고
locator issue를 표시합니다.

### Build Scenario

```txt
Side panel
-> create or select scenario authoring session
-> add/insert step by action family
-> edit action-specific fields
-> choose target slot
-> pick target and auto-apply matching locator into draft document
-> validate affected step and document
-> dry-run step or run scenario
-> save portable scenario document
```

builder는 portable scenario document만 저장합니다. builder-specific UI state,
selected slot, temporary locator candidates, trace view는 scenario document에
저장하지 않습니다. target group의 `platform["actorble.browser"].inspector` metadata는
선택 당시의 browser-specific inspector evidence이며, 실행 의미는 locator의
`matchIndex`가 담당합니다.

## 6. Scenario Compiler Responsibilities

extension compiler는 portable JSON intent를 browser runtime object로 변환합니다.
compiler가 해야 할 일:

- 지원하지 않는 schema version 거부
- 필요한 browser capability 검증
- JSON locator를 `@actorble/browser` locator object로 변환
- 지원하는 browser platform extension을 해석하고 나머지는 명시적으로 fail 처리
- default timeout과 pacing 적용
- trace correlation에 유용한 step id 보존
- `selectText`와 `pointerSequence` 같은 capability-sensitive action의 runtime 지원 여부 검증
- unsupported locator, ambiguous target, unsupported option에 대해 actionable
  error 생성

compiler가 하지 말아야 할 일:

- input event dispatch
- pointer/keyboard behavior 재구현
- action settlement semantic 결정
- pointer sequence cleanup semantic 결정
- text selection endpoint semantic 결정
- browser extension UI state 의존

## 7. Message Channels

초기 message group:

- `scenario:validate`
- `scenario:compile`
- `scenario:run`
- `scenario:pause`
- `scenario:resume`
- `scenario:stop`
- `record:start`
- `record:event`
- `record:stop`
- `record:draft:get`
- `inspector:start`
- `inspector:stop`
- `inspector:selected`
- `inspector:cancelled`
- `locator:preview`
- `trace:event`
- `runtime:status`
- `content:ready`

가능한 경우 message에는 `tabId`, `frameId`, `scenarioId`, `runId`를 포함합니다.
recording, inspection, execution이 같은 tab에서 시간차를 두고 일어날 수 있으므로
runtime message는 correlation-friendly해야 합니다.

`frameId`는 known frame에 대해서만 포함합니다. top-frame operation이라고 가정해서
항상 `frameId: 0`을 넣지 않습니다. active tab의 content readiness와 frame routing은
background가 판단하고, iframe target은 inspector 또는 recorder가 관측한 frame
correlation으로만 지정합니다. cross-origin frame은 별도 capability boundary로
표시합니다.

## 8. Storage Model

extension은 runtime scenario가 아니라 scenario document를 저장합니다.

권장 storage record:

```txt
ScenarioRecord
- id
- name
- schemaVersion
- document
- createdAt
- updatedAt
- lastRun
```

먼저 browser extension storage API를 사용합니다. sync 또는 remote storage는
scenario document model을 바꾸지 않고 나중에 추가할 수 있습니다.

## 9. Safety And Privacy

recorder는 sensitive data handling을 명시적으로 다뤄야 합니다.

- password value를 조용히 저장하지 않기
- secret일 수 있는 recorded text field 표시
- selection에 포함된 text도 secret일 수 있으므로 draft review에서 표시/마스킹 정책 적용
- input value masking 또는 omission 허용
- host permission을 좁게 scope
- content script를 실행할 수 없는 page 표시
- cross-origin frame을 별도 capability boundary로 처리

## 10. Delivery Phases

1. active tab routing과 content readiness를 안정화하고 frame correlation 정책 정리
2. card-first side panel shell을 scenario shell, builder workbench, debug drawer로 재구성
3. side panel scenario workflow builder와 authoring session model 도입
4. target slot 기반 inspector와 locator preview를 selected step editor에 통합
5. navigation-safe recorder event buffering과 recorded draft review 도입
6. pointer/selection-aware recorder normalization과 `selectText` PoC 도입
7. step dry-run, scenario run, trace display를 builder action flow에 결합
8. popup을 short-lived run/record control과 side panel handoff에 한정
9. scenario JSON에서 TypeScript code export 유지
10. optional DevTools trace panel 유지
