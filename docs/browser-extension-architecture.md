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
- waitFor target
- scrollTo target
```

inspector와 locator preview는 target slot이 선택된 상태에서만 primary authoring
flow에 진입합니다. standalone inspector는 diagnostics 용도로만 허용합니다.

#### Side Panel Information Architecture

side panel은 기능 카드를 병렬로 나열하지 않고, scenario lifecycle과 builder 작업을
중심으로 구성합니다.

```txt
Scenario shell
-> Scenario builder workbench
-> Target assignment interaction
-> Recorded draft review
-> Collapsible debug drawer
```

Scenario shell은 기존 Document card를 대체합니다. scenario 선택, 생성, 이름과
설명 편집, dirty/saved 상태, target tab readiness, import/export, save, record,
run은 하나의 scenario lifecycle control로 노출합니다. document metadata는 scenario
metadata로 취급하고, 별도 primary card로 분리하지 않습니다.

Scenario builder workbench는 step list와 selected step editor를 같은 작업면에
둡니다. step add/insert/duplicate/delete/reorder, action family 선택, action별
structured field editing, per-step dry run은 선택된 step 맥락 안에서 동작합니다.
Steps와 Step Editor는 별도 primary card가 아닙니다.

Target assignment는 selected step editor 내부의 target field control입니다. target이
필요한 action만 `Set target` interaction을 활성화합니다. drag는 from/to, waitFor는
wait target, scrollTo target은 scroll target처럼 action-specific slot을 명시합니다.
target picker UI는 standalone card가 아니라 해당 slot을 채우는 버튼과 진행 상태입니다.
선택된 locator candidate는 항상 correlated target slot에 기록합니다.

Recording은 builder의 primary input path입니다. record start/stop은 scenario shell에서
제공하고, stop 후 draft가 있으면 builder review surface에 표시합니다. recorded draft는
현재 draft를 조용히 덮어쓰지 않고 replace, append, save as new, export, discard 중
명시적 사용자 선택으로만 반영합니다. empty recording과 sensitive input confirmation은
review surface에서 처리합니다.

Locator preview, validation details, run trace, failure detail은 debugging information으로
취급합니다. 기본 상태는 접힌 debug drawer이며, validation failure나 run failure처럼
사용자의 다음 행동에 필요한 경우에만 열거나 강조할 수 있습니다. Debug drawer는
authoring flow를 보조하지만 scenario 생성, step editing, target setting의 primary
surface가 아닙니다.

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
-> content script captures page events and flushes record:event messages
-> pagehide/navigation flushes pending events before cleanup
-> record:stop asks background to normalize buffered events
-> recorder synthesizes locator candidates
-> event-to-step normalizer compresses raw events
-> draft scenario document is opened in side panel builder review
-> user merges, edits, validates, saves, or exports
```

recorder output은 draft로 다룹니다. raw browser event보다 `fill`, `click` 같은
stable intent step을 우선합니다.

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
-> locator synthesis returns ranked candidates
-> side panel previews match count and strictness
-> selected locator is written into the correlated target slot
```

target picker는 별도 feature가 아니라 builder의 target assignment interaction입니다.
선택 결과는 현재 step의 단일 `target` 필드에만 쓰지 않고, correlated target slot에
씁니다. target slot이 없는 action에서는 inspector launch를 비활성화합니다.

### Build Scenario

```txt
Side panel
-> create or select scenario authoring session
-> add/insert step by action family
-> edit action-specific fields
-> choose target slot
-> pick target and preview locator candidates
-> write chosen target into draft document
-> validate affected step and document
-> dry-run step or run scenario
-> save portable scenario document
```

builder는 portable scenario document만 저장합니다. builder-specific UI state,
selected slot, temporary locator candidates, trace view는 scenario document에
저장하지 않습니다.

## 6. Scenario Compiler Responsibilities

extension compiler는 portable JSON intent를 browser runtime object로 변환합니다.
compiler가 해야 할 일:

- 지원하지 않는 schema version 거부
- 필요한 browser capability 검증
- JSON locator를 `@actorble/browser` locator object로 변환
- 지원하지 않는 platform extension을 명시적으로 drop 또는 fail 처리
- default timeout과 pacing 적용
- trace correlation에 유용한 step id 보존
- unsupported locator, ambiguous target, unsupported option에 대해 actionable
  error 생성

compiler가 하지 말아야 할 일:

- input event dispatch
- pointer/keyboard behavior 재구현
- action settlement semantic 결정
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
6. step dry-run, scenario run, trace display를 builder action flow에 결합
7. popup을 short-lived run/record control과 side panel handoff에 한정
8. scenario JSON에서 TypeScript code export 유지
9. optional DevTools trace panel 유지
