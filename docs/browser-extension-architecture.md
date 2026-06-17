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
  manifest.json
  src/
    popup/
    side-panel/
    background/
    content-script/
    scenario/
      validate.ts
      migrate.ts
      compile-to-browser-runtime.ts
      export-code.ts
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

이 문서는 의도적으로 abstract level에 머뭅니다. 위 디렉토리는 필요한 build setup을
정한 뒤 implementation을 시작할 때 생성합니다.

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

side panel은 primary authoring surface입니다.

- scenario list
- step list와 step editor
- target picker launch
- locator candidate preview
- options editor
- validation error
- import/export
- per-step dry run
- trace와 failure detail

### Background Service Worker

background service worker는 extension-level state를 조율합니다.

- tab/frame routing
- extension command handling
- storage access
- content script readiness
- long-running run/record session metadata
- permission check

Actorble action을 직접 실행하지 않습니다.

### Content Script

content script는 page runtime host입니다.

- `Actorble` browser instance 생성
- compiled runtime scenario 실행
- recording 중 page event capture
- target inspector overlay host
- trace와 status update를 extension UI로 stream

content script는 browser extension isolation과 permission boundary를 넘나들기
때문에 page-facing code를 작고 명시적으로 유지해야 합니다.

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
-> content script captures page events
-> recorder synthesizes locator candidates
-> event-to-step normalizer compresses raw events
-> draft scenario document is returned to side panel
-> user edits, validates, saves, or exports
```

recorder output은 draft로 다룹니다. raw browser event보다 `fill`, `click` 같은
stable intent step을 우선합니다.

### Pick Target

```txt
Side panel
-> inspector:start
-> content script shows hover highlight
-> user selects element
-> locator synthesis returns ranked candidates
-> side panel previews match count and strictness
-> selected target is written into the scenario document
```

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
- `record:stop`
- `inspector:start`
- `inspector:stop`
- `trace:event`
- `runtime:status`

가능한 경우 message에는 `tabId`, `frameId`, `scenarioId`, `runId`를 포함합니다.
recording, inspection, execution이 같은 tab에서 시간차를 두고 일어날 수 있으므로
runtime message는 correlation-friendly해야 합니다.

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

1. active tab에서 imported scenario JSON 실행
2. scenario document save/load/import/export
3. target inspector와 locator preview 추가
4. side-panel scenario builder 추가
5. recorder와 event-to-step normalization 추가
6. scenario JSON에서 TypeScript code export 추가
7. optional DevTools trace panel 추가
