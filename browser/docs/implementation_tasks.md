# Actorble Browser Implementation Tasks

이 문서는 `browser/src/`에 스캐폴딩된 모듈들의 의존성 방향을 정리하고, 각 모듈을 독립적으로 분리 구현하기 위한 작업 단위를 정의한다. 기준 문서는 `../docs/browser-architecture.md`이며, 패키지명과 구현체 이름은 `@actorble/browser` / Actorble로 둔다.

## 의존성 원칙

모듈 의존성은 orchestration이 구체 엔진을 조립하고, 엔진은 좁은 port와 shared primitive에만 의존하는 방향으로 유지한다.

```txt
actorble-facade
  -> scenario-runner
  -> action-orchestrator
  -> target-resolver
  -> capability-fidelity
  -> diagnostics-trace

scenario-runner
  -> action-orchestrator
  -> timeline-engine
  -> diagnostics-trace

action-orchestrator
  -> target-resolver
  -> surface-engine
  -> geometry-engine
  -> interactability-engine
  -> gesture-engine
  -> focus-engine
  -> keyboard-engine
  -> text-input-engine
  -> wait-observation-engine
  -> timeline-engine
  -> diagnostics-trace

target-resolver
  -> platform-adapter/dom-adapter
  -> diagnostics-trace
  -> shared

surface-engine
  -> platform-adapter/dom-adapter
  -> shared

geometry-engine
  -> surface-engine
  -> platform-adapter/dom-adapter
  -> shared

interactability-engine
  -> geometry-engine
  -> platform-adapter/dom-adapter
  -> shared

gesture-engine
  -> pointer-engine
  -> pointer-signals
  -> timeline-engine
  -> shared

pointer-engine
  -> pointer-signals
  -> timeline-engine
  -> shared

interaction-state-store
  -> pointer-signals
  -> shared

focus-engine
  -> platform-adapter/dom-adapter
  -> interaction-state-store
  -> shared

keyboard-engine
  -> platform-adapter/event-dispatcher
  -> interaction-state-store
  -> shared

text-input-engine
  -> focus-engine
  -> platform-adapter/event-dispatcher
  -> interaction-state-store
  -> shared

wait-observation-engine
  -> platform-adapter/dom-adapter
  -> timeline-engine
  -> shared

pseudo-state-mirror
  -> platform-adapter/style-adapter
  -> platform-adapter/state-applier
  -> interaction-state-store
  -> shared

visual-layer
  -> platform-adapter/dom-adapter
  -> platform-adapter/state-applier
  -> shared

capability-fidelity
  -> platform-adapter
  -> shared

diagnostics-trace
  -> shared

platform-adapter/*
  -> shared
```

핵심 규칙:

- `shared`는 leaf dependency가 아니라 foundation이다. 다른 Actorble 모듈을 import하지 않는다.
- `actorble-facade`는 composition root다. 실제 구현체 조립은 이 계층 또는 별도 factory에서만 수행한다.
- `action-orchestrator`는 action lifecycle을 조율하지만 DOM을 직접 읽거나 event를 직접 dispatch하지 않는다.
- `interaction-state-store`는 platform과 visual에 직접 effect를 적용하지 않고 state diff/effect descriptor를 만든다. 실제 적용은 adapter나 visual layer가 맡는다.
- `diagnostics-trace`는 모든 모듈의 구체 타입을 끌어오지 않는다. 공통 trace/event/error shape는 `shared` 또는 diagnostics 내부의 좁은 타입으로 제한한다.
- 순환 import는 금지한다. 필요한 경우 interface/port 타입을 `shared`로 올리거나 facade composition에서 주입한다.

## 작업 순서

각 작업은 TDD로 진행한다. 먼저 실패하는 Vitest 케이스를 추가하고, 가장 작은 구현으로 통과시킨 뒤 리팩터링한다.

### T1. Shared primitive와 port 경계 확정

브리핑: 모든 모듈이 공유할 최소 타입을 `src/shared`에 둔다. 좌표, rect, timeout, cancellation, result/error, locator-like, target-like, clock, adapter port 같은 primitive를 먼저 고정해 이후 모듈 간 직접 참조를 줄인다.

의존성: 없음.

완료 기준:

- `Point`, `Rect`, `CoordinateSpace`, `TimeoutOptions`, `Cancellation`, `Result` 또는 error helper의 초기 형태가 있다.
- platform adapter를 직접 import하지 않아도 엔진 테스트를 작성할 수 있는 port 타입이 있다.
- `shared`가 다른 feature module을 import하지 않는 테스트 또는 lint성 테스트가 있다.

### T2. Diagnostics / Trace 최소 코어 분리

브리핑: span 기반 trace와 debug event collector를 먼저 만든다. 초기 구현은 in-memory trace만 지원하고, 각 엔진은 trace 객체 전체가 아니라 span recorder interface만 받도록 한다.

의존성: `shared`.

완료 기준:

- span start/end/error/cancel lifecycle을 기록한다.
- event append와 snapshot attach가 가능하다.
- trace 모듈이 action/target/geometry 같은 구체 모듈을 import하지 않는다.

### T3. Platform Adapter port와 브라우저 adapter shell 분리

브리핑: DOM 접근, event dispatch, state apply, style injection을 하위 adapter로 분리한다. 이 단계에서는 실제 동작을 최소화하고, 테스트용 fake adapter를 쉽게 만들 수 있는 interface를 확정한다.

의존성: `shared`, 선택적으로 `diagnostics-trace`.

완료 기준:

- `dom-adapter`, `event-dispatcher`, `state-applier`, `style-adapter`가 독립 export 단위를 갖는다.
- DOM read/write/event/style 책임이 서로 섞이지 않는다.
- overlay/internal element를 hit-test에서 제외할 수 있는 계약이 있다.

### T4. Target Resolver 분리

브리핑: locator를 target handle로 바꾸는 계층을 구현한다. 첫 slice는 element locator와 css locator부터 시작하고, role/text/label/testId는 후속 task로 확장한다.

의존성: `shared`, `platform-adapter/dom-adapter`, `diagnostics-trace`.

완료 기준:

- resolve, resolveAll, exists의 최소 동작이 있다.
- strict mode에서 0개/2개 이상 후보가 구분된다.
- `TargetHandle`은 snapshot handle이며 detached/stale 검증 진입점이 있다.

### T5. Surface Engine 분리

브리핑: target이 속한 surface와 scroll/reveal 책임을 Target Resolver에서 분리한다. viewport와 scroll container를 먼저 지원하고, iframe/shadow/dialog/popover는 확장 지점으로 둔다.

의존성: `shared`, `platform-adapter/dom-adapter`.

완료 기준:

- target의 surface snapshot을 계산한다.
- scrollable ancestor chain을 찾는다.
- `ensureVisible`은 DOM adapter를 통해서만 scroll을 수행한다.

### T6. Geometry Engine 분리

브리핑: bounding rect, visible rect, center, clickable point 후보 계산을 별도 모듈로 둔다. 조작 가능 여부 판단은 하지 않고 계산 결과와 실패 이유만 반환한다.

의존성: `shared`, `surface-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- geometry snapshot을 deterministic하게 만든다.
- visible rect와 center point 계산 테스트가 있다.
- clickable point는 `Point | null`이 아니라 strategy/reason이 있는 result로 반환된다.

### T7. Interactability Engine 분리

브리핑: visibility, enabled, editable, focusable, pointer-events, occlusion 판단을 Geometry Engine에서 분리한다. action별 preflight는 `canClick`, `canFocus`, `canType` 같은 report field로 표현한다.

의존성: `shared`, `geometry-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- click/focus/type preflight report가 분리되어 있다.
- disabled, readonly, pointer-events none, occlusion 케이스 테스트가 있다.
- force option으로 우회 가능한 이유와 불가능한 이유를 구분할 수 있다.

### T8. Timeline, Pointer Engine, Pointer Signals 분리

브리핑: pointer 좌표와 버튼 상태를 의미 상태에서 분리한다. Pointer Engine은 signal만 발행하고 hover/active target을 소유하지 않는다.

의존성: `shared`, `timeline-engine`, `pointer-signals`.

완료 기준:

- pointer state가 position, previousPosition, motion, buttons로 분리된다.
- move/down/up/cancel signal이 순서대로 발행된다.
- pointer engine 테스트는 DOM 없이 실행된다.

### T9. Interaction State Store와 slice 구조 분리

브리핑: pointer/focus/keyboard/text input signal을 받아 hover, active, focus, focus-visible, typing, dragging state를 reducer 방식으로 관리한다. 실제 DOM 반영은 effect descriptor로만 표현한다.

의존성: `shared`, `pointer-signals`.

완료 기준:

- state snapshot과 diff가 분리된다.
- hover/active/focus/typing slice가 독립 테스트 가능하다.
- platform adapter나 visual layer의 concrete implementation을 import하지 않는다.

### T10. Gesture Engine 분리

브리핑: click, doubleClick, drag 같은 composite pointer action을 Pointer Engine 위에 구성한다. Action Orchestrator가 lifecycle을 소유하고 Gesture Engine은 pointer sequence만 책임진다.

의존성: `shared`, `pointer-engine`, `pointer-signals`, `timeline-engine`.

완료 기준:

- click gesture가 move/down/up signal sequence를 만든다.
- double click과 drag는 capability 확장 지점을 가진다.
- gesture test는 fake pointer/timeline으로 실행된다.

### T11. Focus, Keyboard, Text Input Engine 분리

브리핑: focus 요청, key sequence, text insertion을 별도 엔진으로 둔다. `type`, `typeInto`, `fill`의 의미 차이를 API 수준에서 보존한다.

의존성: `shared`, `platform-adapter/dom-adapter`, `platform-adapter/event-dispatcher`, `interaction-state-store`.

완료 기준:

- Focus Engine은 platform active element를 읽어 store와 sync한다.
- Keyboard Engine은 keyDown/keyUp/press와 modifier state를 관리한다.
- Text Input Engine은 fill과 type을 별도 strategy로 처리한다.

### T12. Wait / Observation Engine 분리

브리핑: action 후 settlement와 명시적 wait condition을 담당한다. mutation quiet, next frame, layout stable 같은 wait strategy를 action lifecycle 밖의 독립 primitive로 만든다.

의존성: `shared`, `timeline-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- `none`, `next-frame`, `settled` 전략의 최소 구현이 있다.
- timeout error가 diagnostics context와 연결된다.
- mutation/resize/scroll 변화가 geometry cache invalidation hook으로 연결될 수 있다.

### T13. Action Orchestrator transaction 구현

브리핑: resolve, validate, ensureVisible, geometry, interactability preflight, perform, wait, cleanup 순서를 하나의 action transaction으로 묶는다. 먼저 `moveTo`, `click`, `typeInto`만 대상으로 한다.

의존성: resolver/surface/geometry/interactability/gesture/focus/text/wait/timeline/diagnostics.

완료 기준:

- `click(target)`이 resolve before dispatch 규칙을 지킨다.
- pointer down 이후 실패 또는 cancel 시 cleanup이 보장된다.
- action span에 input, output, failure context가 남는다.

### T14. Scenario Runner와 Actorble Facade 조립

브리핑: Scenario Runner는 step 순서, pause/resume/stop, scenario timeout/cancellation만 소유하고 개별 action은 orchestrator에 위임한다. Facade는 public API와 composition root 역할을 한다.

의존성: `action-orchestrator`, `target-resolver`, `scenario-runner`, `diagnostics-trace`, `capability-fidelity`.

완료 기준:

- public facade가 resolve/click/typeInto/waitFor/run의 초기 entrypoint를 제공한다.
- scenario runner가 step execution을 orchestrator에 위임한다.
- facade 외부에서 concrete module graph를 직접 조립하지 않아도 된다.

### T15. Pseudo State Mirror, Visual Layer, Capability / Fidelity 분리

브리핑: core correctness와 visual fidelity를 분리한다. pseudo-state mirror와 overlay는 실패해도 action을 실패시키지 않고 diagnostics warning으로 남긴다. capability report는 synthetic browser runtime의 한계를 명시한다.

의존성: `interaction-state-store`, `platform-adapter/state-applier`, `platform-adapter/style-adapter`, `platform-adapter/dom-adapter`, `diagnostics-trace`, `shared`.

완료 기준:

- visual overlay는 `pointer-events: none`을 기본으로 한다.
- pseudo mirror failure는 warning trace로 남고 action failure가 되지 않는다.
- capability/fidelity report가 pointer, keyboard, text input, pseudo state, trusted events, drag/drop 한계를 표현한다.

## 우선 구현 slice

첫 번째 동작 가능한 vertical slice는 다음 순서로 제한한다.

```txt
shared primitives
-> diagnostics trace
-> fake/browser platform adapter shell
-> target resolver for element/css
-> surface viewport reveal
-> geometry center/clickable point
-> interactability visible/enabled/pointer-events
-> timeline + pointer signal
-> interaction state hover/active
-> gesture click
-> action orchestrator click
-> facade click
```

이 slice가 끝나면 `Actorble.click(css('button'))` 또는 equivalent locator가 target resolve부터 synthetic click dispatch, state cleanup, trace 기록까지 한 흐름으로 검증되어야 한다.

## 분리 작업 체크리스트

- 새 모듈을 구현할 때 public export, internal helper, test fixture를 분리한다.
- cross-module import는 위 의존성 표에 있는 방향만 허용한다.
- DOM API 직접 호출은 `platform-adapter` 하위 모듈에만 둔다.
- geometry와 interactability를 한 테스트에서 함께 검증하지 않는다. 공간 계산과 조작 가능성 판단은 별도 테스트로 둔다.
- Action Orchestrator 테스트는 fake engines로 lifecycle 순서를 검증하고, browser integration test는 별도로 둔다.
- bug fix는 실패하는 회귀 테스트를 먼저 추가한다.
