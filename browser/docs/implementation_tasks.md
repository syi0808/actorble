# Actorble Browser Implementation Tasks

이 문서는 `browser/src/`에 스캐폴딩된 Actorble browser 모듈들의 의존성 방향과 구현 태스크를 정의한다. 기준 문서는 `../docs/browser-architecture.md`이며, 패키지명은 `@actorble/browser`로 둔다.

## 현재 상태

- T0 스캐폴딩은 완료됐다. `src/index.ts` barrel, 모듈별 `index.ts`, `tsconfig.json`, Vitest, package build/typecheck/test scripts가 있다.
- T1 shared primitive와 port 경계는 완료됐다. `src/shared/index.ts`가 좌표/rect/locator/target/options/error/result/adapter port를 제공한다.
- T2 diagnostics trace 최소 코어는 완료됐다. `src/diagnostics-trace/index.ts`가 in-memory span/event/snapshot/warning collector를 제공한다.
- T3 이후 모듈은 대부분 public interface와 `notImplemented()` shell만 있다. 다음 작업은 shell을 실제 동작으로 좁게 채우는 방식으로 진행한다.
- 모든 새 동작은 TDD로 진행한다. 먼저 실패하는 Vitest 케이스를 추가하고, 최소 구현으로 통과시킨 뒤 리팩터링한다.

기본 검증 명령:

```txt
pnpm test
pnpm typecheck
pnpm build
```

## 의존성 방향

의존성은 아래 방향으로만 흐른다. 내부 구현은 concrete class를 직접 새로 만들기보다 interface/port를 생성자 주입으로 받는 것을 기본값으로 한다.

```txt
src/index.ts
  -> 모든 public export를 모으는 barrel only

shared
  -> 외부 Actorble feature module 의존 없음

diagnostics-trace
  -> shared

platform-adapter/*
  -> shared

target-resolver
  -> shared
  -> platform-adapter/dom-adapter
  -> diagnostics-trace

surface-engine
  -> shared
  -> platform-adapter/dom-adapter

geometry-engine
  -> shared
  -> surface-engine
  -> platform-adapter/dom-adapter

interactability-engine
  -> shared
  -> geometry-engine
  -> platform-adapter/dom-adapter

timeline-engine
  -> shared

pointer-signals
  -> shared

pointer-engine
  -> shared
  -> timeline-engine
  -> pointer-signals

interaction-state-store
  -> shared
  -> pointer-signals

gesture-engine
  -> shared
  -> pointer-engine
  -> pointer-signals
  -> timeline-engine

focus-engine
  -> shared
  -> platform-adapter/dom-adapter
  -> interaction-state-store

keyboard-engine
  -> shared
  -> platform-adapter/event-dispatcher
  -> interaction-state-store

text-input-engine
  -> shared
  -> focus-engine
  -> platform-adapter/event-dispatcher
  -> interaction-state-store

wait-observation-engine
  -> shared
  -> timeline-engine
  -> platform-adapter/dom-adapter

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

scenario-runner
  -> action-orchestrator
  -> timeline-engine
  -> diagnostics-trace

pseudo-state-mirror
  -> shared
  -> interaction-state-store
  -> platform-adapter/state-applier
  -> platform-adapter/style-adapter
  -> diagnostics-trace

visual-layer
  -> shared
  -> platform-adapter/dom-adapter
  -> platform-adapter/state-applier

capability-fidelity
  -> shared
  -> platform-adapter

actorble-facade
  -> scenario-runner
  -> action-orchestrator
  -> target-resolver
  -> geometry-engine
  -> capability-fidelity
  -> diagnostics-trace
```

핵심 규칙:

- `src/index.ts`는 외부 사용자를 위한 barrel이다. 내부 모듈은 `src/index.ts`를 import하지 않는다.
- `shared`는 foundation이다. 다른 feature module을 import하지 않는다.
- `diagnostics-trace`는 feature module 타입을 끌어오지 않는다. trace input/output은 `shared` primitive 또는 diagnostics 내부 타입으로 제한한다.
- DOM API 직접 호출은 `platform-adapter` 하위 모듈에만 둔다.
- `action-orchestrator`는 lifecycle을 조율하지만 DOM read/write/event dispatch를 직접 수행하지 않는다.
- `interaction-state-store`는 state diff/effect descriptor를 만들고, 실제 DOM 반영은 adapter 또는 visual layer가 수행한다.
- 순환 import는 금지한다. 필요하면 좁은 port를 `shared`로 올리거나 facade composition에서 주입한다.

## 모듈별 구현 계획

| 모듈 | 직접 의존 | 첫 구현 범위 | 테스트 초점 |
| --- | --- | --- | --- |
| `shared` | 없음 | 완료된 primitive를 유지하고 누락된 error code/option만 태스크별로 추가 | feature module import 금지, helper shape 안정성 |
| `diagnostics-trace` | `shared` | 완료된 in-memory collector 유지, 필요 시 span attributes만 확장 | span lifecycle, snapshot immutability, feature import 금지 |
| `platform-adapter/dom-adapter` | `shared` | root/query/rect/style/hit-test/focus/scroll/describeElement 구현 | jsdom DOM read/write, internal overlay hit-test 제외 |
| `platform-adapter/event-dispatcher` | `shared` | pointer/mouse/keyboard/input event descriptor를 실제 DOM event로 dispatch | dispatch order, bubbling/cancelable/defaultPrevented |
| `platform-adapter/state-applier` | `shared` | `data-actorble-*` state attribute apply/cleanup | hover/active/focus-visible cleanup |
| `platform-adapter/style-adapter` | `shared` | runtime style injection/disposal | style element lifecycle, duplicate cleanup |
| `target-resolver` | `shared`, dom adapter, diagnostics | `element`/`css` locator, strict mode, stale validation | 0/1/N candidate, snapshot handle, detached target |
| `surface-engine` | `shared`, dom adapter | viewport surface, scrollable ancestors, `ensureVisible` | scroll delegation, coordinate-space metadata |
| `geometry-engine` | `shared`, surface, dom adapter | rect, visible rect, center, clickable point result | deterministic geometry, no interactability decisions |
| `interactability-engine` | `shared`, geometry, dom adapter | visible/enabled/editable/focusable/pointer-events/occlusion report | action-specific preflight and force policy |
| `timeline-engine` | `shared` | controllable clock, timeout, cancellation, next-frame/settled primitive | fake clock, cancellation, timeout |
| `pointer-signals` | `shared` | in-memory signal bus | subscribe/unsubscribe, signal order |
| `pointer-engine` | `shared`, timeline, signals | position/previous/motion/buttons, move/down/up/cancel | DOM-free pointer state and emitted signals |
| `interaction-state-store` | `shared`, pointer signals | hover/active/focus/typing slices and effect descriptors | reducer diff, no platform concrete imports |
| `gesture-engine` | `shared`, pointer engine, signals, timeline | click and double-click pointer sequence, drag extension point | fake pointer/timeline sequence |
| `focus-engine` | `shared`, dom adapter, store | focus request, activeElement sync, focus-visible modality | platform focus sync, focus failure |
| `keyboard-engine` | `shared`, event dispatcher, store | keyDown/keyUp/press, modifier state | modifier ordering, keyboard modality |
| `text-input-engine` | `shared`, focus, event dispatcher, store | `type`, `typeInto`, `fill` strategy split | focus before type, input/change dispatch |
| `wait-observation-engine` | `shared`, timeline, dom adapter | wait strategies: none, next-frame, settled, custom predicate | timeout, mutation quiet hook shape |
| `action-orchestrator` | resolver/surface/geometry/interactability/input/wait/timeline/diagnostics | `moveTo`, `click`, `typeInto` transaction lifecycle | resolve before dispatch, cleanup, trace context |
| `scenario-runner` | orchestrator, timeline, diagnostics | ordered step execution, pause/resume/stop state | delegation and cancellation |
| `actorble-facade` | runner/orchestrator/resolver/diagnostics/capabilities | composition root and public API delegation | facade methods delegate to injected modules |
| `pseudo-state-mirror` | store, state/style adapters, diagnostics | best-effort `:hover`/`:active`/`:focus-visible` mirror | warning not action failure |
| `visual-layer` | dom/state adapters | non-interactive overlay root and cursor/highlight shell | `pointer-events: none`, hit-test exclusion |
| `capability-fidelity` | platform adapter, shared | synthetic browser runtime capability report | report shape and unsupported limits |

## 작업 순서

### T0. Package and module scaffold - 완료

브리핑: package metadata, TypeScript build, Vitest, `src/index.ts`, 모듈별 `index.ts` shell을 만든다.

완료 기준:

- `@actorble/browser` package name, `build`, `typecheck`, `test`, `test:watch` scripts가 있다.
- 모든 아키텍처 모듈이 public export shell을 가진다.
- scaffold test가 모듈 경계를 검증한다.

### T1. Shared primitive와 port 경계 확정 - 완료

브리핑: 모든 모듈이 공유할 최소 타입을 `src/shared`에 둔다. 좌표, rect, timeout, cancellation, result/error, locator-like, target-like, clock, adapter port를 먼저 고정한다.

완료 기준:

- `Point`, `Rect`, `CoordinateSpace`, `TimeoutOptions`, `Cancellation`, `Result`, `ActorbleError` helper가 있다.
- platform adapter를 직접 import하지 않아도 엔진 테스트를 작성할 수 있는 port 타입이 있다.
- `shared`가 다른 feature module을 import하지 않는 테스트가 있다.

### T2. Diagnostics / Trace 최소 코어 분리 - 완료

브리핑: span 기반 trace와 debug event collector를 먼저 만든다. 초기 구현은 in-memory trace만 지원하고, 각 엔진은 trace 객체 전체가 아니라 span recorder interface만 받도록 한다.

완료 기준:

- span start/end/error/cancel lifecycle을 기록한다.
- event append, snapshot attach, warning 기록이 가능하다.
- trace 모듈이 action/target/geometry 같은 구체 모듈을 import하지 않는다.

### T3. Platform Adapter 최소 구현

브리핑: DOM 접근, event dispatch, state apply, style injection shell을 실제 브라우저/jsdom 동작으로 채운다. 이 태스크는 후속 엔진이 fake adapter 없이도 기본 DOM 테스트를 작성할 수 있게 만드는 기반이다.

의존성: `shared`, 선택적으로 `diagnostics-trace`.

완료 기준:

- `BrowserDomAdapter`가 root/query/rect/style/hit-test/contains/isConnected/activeElement/focus/blur/scroll/describeElement를 수행한다.
- `BrowserEventDispatcher`가 pointer/mouse/keyboard/input event를 descriptor 기반으로 dispatch하고 boolean result를 반환한다.
- `BrowserStateApplier`가 `data-actorble-hover`, `data-actorble-active`, `data-actorble-focus-visible`, `data-actorble-focus`, `data-actorble-dragging`을 apply/cleanup한다.
- `BrowserStyleAdapter`가 style injection과 dispose를 지원한다.

### T4. Target Resolver: element/css slice

브리핑: locator를 target handle로 바꾸는 계층을 구현한다. 첫 slice는 `element()`과 `css()`만 대상으로 하고, role/text/label/testId는 후속 확장으로 남긴다.

의존성: `shared`, `platform-adapter/dom-adapter`, `diagnostics-trace`.

완료 기준:

- `resolve`, `resolveAll`, `exists`, `inspect`, `validate`가 element/css locator에서 동작한다.
- strict mode에서 후보 0개는 `TARGET_NOT_FOUND`, 2개 이상은 `TARGET_AMBIGUOUS`로 구분된다.
- `TargetHandle`은 snapshot handle이며 detached/stale 검증 진입점이 있다.

### T5. Surface Engine: viewport와 scroll chain

브리핑: target이 속한 surface와 scroll/reveal 책임을 Target Resolver에서 분리한다. viewport와 scroll container를 먼저 지원하고, iframe/shadow/dialog/popover는 확장 지점으로 둔다.

의존성: `shared`, `platform-adapter/dom-adapter`.

완료 기준:

- target의 viewport surface snapshot을 계산한다.
- scrollable ancestor chain을 찾는다.
- `ensureVisible`과 `scrollTo`는 DOM adapter를 통해서만 scroll을 수행한다.

### T6. Geometry Engine: rect와 clickable point

브리핑: bounding rect, visible rect, center, clickable point 후보 계산을 별도 모듈로 둔다. 조작 가능 여부 판단은 하지 않고 계산 결과와 실패 이유만 반환한다.

의존성: `shared`, `surface-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- `GeometrySnapshot`을 deterministic하게 만든다.
- visible rect와 center point 계산 테스트가 있다.
- clickable point는 `Point | null`이 아니라 strategy/reason이 있는 result로 반환된다.

### T7. Interactability Engine: action preflight

브리핑: visibility, enabled, editable, focusable, pointer-events, occlusion 판단을 Geometry Engine에서 분리한다. action별 preflight는 `canClick`, `canFocus`, `canType` 같은 report field로 표현한다.

의존성: `shared`, `geometry-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- click/focus/type preflight report가 분리되어 있다.
- disabled, readonly, pointer-events none, occlusion 케이스 테스트가 있다.
- force option으로 우회 가능한 이유와 불가능한 이유를 구분할 수 있다.

### T8. Timeline Engine

브리핑: duration, next-frame, settled, timeout, cancellation primitive를 독립 구현한다. Pointer/Wait/Scenario/Action은 이 primitive를 주입받는다.

의존성: `shared`.

완료 기준:

- fake clock 또는 controllable scheduler로 테스트할 수 있다.
- timeout과 cancellation이 `ActorbleError` helper와 연결된다.
- `none`, `next-frame`, `settled` 전략의 최소 동작이 있다.

### T9. Pointer Signals와 Pointer Engine

브리핑: pointer 좌표와 버튼 상태를 의미 상태에서 분리한다. Pointer Engine은 signal만 발행하고 hover/active target을 소유하지 않는다.

의존성: `shared`, `timeline-engine`, `pointer-signals`.

완료 기준:

- signal bus가 subscribe/unsubscribe와 ordered emit을 지원한다.
- pointer state가 position, previousPosition, motion, buttons로 분리된다.
- move/down/up/cancel signal이 순서대로 발행된다.

### T10. Interaction State Store와 slice 구조

브리핑: pointer/focus/keyboard/text input signal을 받아 hover, active, focus, focus-visible, typing, dragging state를 reducer 방식으로 관리한다. 실제 DOM 반영은 effect descriptor로만 표현한다.

의존성: `shared`, `pointer-signals`.

완료 기준:

- state snapshot과 diff가 분리된다.
- hover/active/focus/typing slice가 독립 테스트 가능하다.
- platform adapter나 visual layer concrete implementation을 import하지 않는다.

### T11. Gesture Engine

브리핑: click, doubleClick, drag 같은 composite pointer action을 Pointer Engine 위에 구성한다. Action Orchestrator가 lifecycle을 소유하고 Gesture Engine은 pointer sequence만 책임진다.

의존성: `shared`, `pointer-engine`, `pointer-signals`, `timeline-engine`.

완료 기준:

- click gesture가 move/down/up signal sequence를 만든다.
- double click과 drag는 capability 확장 지점을 가진다.
- gesture test는 fake pointer/timeline으로 실행된다.

### T12. Focus, Keyboard, Text Input Engine

브리핑: focus 요청, key sequence, text insertion을 별도 엔진으로 둔다. `type`, `typeInto`, `fill`의 의미 차이를 API 수준에서 보존한다.

의존성: `shared`, `platform-adapter/dom-adapter`, `platform-adapter/event-dispatcher`, `interaction-state-store`.

완료 기준:

- Focus Engine은 platform active element를 읽어 store와 sync한다.
- Keyboard Engine은 keyDown/keyUp/press와 modifier state를 관리한다.
- Text Input Engine은 fill과 type을 별도 strategy로 처리한다.

### T13. Wait / Observation Engine

브리핑: action 후 settlement와 명시적 wait condition을 담당한다. mutation quiet, next frame, layout stable 같은 wait strategy를 action lifecycle 밖의 독립 primitive로 만든다.

의존성: `shared`, `timeline-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- `none`, `next-frame`, `settled`, custom predicate 전략의 최소 구현이 있다.
- timeout error가 diagnostics context와 연결될 수 있다.
- mutation/resize/scroll 변화가 geometry cache invalidation hook으로 연결될 수 있다.

### T14. Action Orchestrator click vertical slice

브리핑: resolve, validate, ensureVisible, geometry, interactability preflight, perform, wait, cleanup 순서를 하나의 action transaction으로 묶는다. 먼저 `moveTo`, `click`, `typeInto`만 대상으로 한다.

의존성: resolver/surface/geometry/interactability/gesture/focus/text/wait/timeline/diagnostics.

완료 기준:

- `click(target)`이 resolve before dispatch 규칙을 지킨다.
- pointer down 이후 실패 또는 cancel 시 cleanup이 보장된다.
- action span에 input, output, failure context가 남는다.

### T15. Actorble Facade와 Scenario Runner 조립

브리핑: Scenario Runner는 step 순서, pause/resume/stop, scenario timeout/cancellation만 소유하고 개별 action은 orchestrator에 위임한다. Facade는 public API와 composition root 역할을 한다.

의존성: `action-orchestrator`, `target-resolver`, `scenario-runner`, `diagnostics-trace`, `capability-fidelity`.

완료 기준:

- public facade가 resolve/click/typeInto/waitFor/run의 초기 entrypoint를 제공한다.
- scenario runner가 step execution을 orchestrator에 위임한다.
- facade 외부에서 concrete module graph를 직접 조립하지 않아도 된다.

### T16. Pseudo State Mirror, Visual Layer, Capability / Fidelity

브리핑: core correctness와 visual fidelity를 분리한다. pseudo-state mirror와 overlay는 실패해도 action을 실패시키지 않고 diagnostics warning으로 남긴다. capability report는 synthetic browser runtime의 한계를 명시한다.

의존성: `interaction-state-store`, `platform-adapter/state-applier`, `platform-adapter/style-adapter`, `platform-adapter/dom-adapter`, `diagnostics-trace`, `shared`.

완료 기준:

- visual overlay는 `pointer-events: none`을 기본으로 한다.
- pseudo mirror failure는 warning trace로 남고 action failure가 되지 않는다.
- capability/fidelity report가 pointer, keyboard, text input, pseudo state, trusted events, drag/drop 한계를 표현한다.

### T17. Locator와 browser fidelity 확장

브리핑: 첫 vertical slice 이후 role/text/label/testId/point locator, shadow root, iframe, dialog/popover, drag/drop capability를 확장한다.

의존성: 완료된 T3-T16.

완료 기준:

- locator별 ranking과 ambiguity 정책이 trace에 남는다.
- cross-origin frame, closed shadow root, trusted event 한계가 capability/fidelity에 반영된다.
- 확장 기능은 기존 `click(css(...))` vertical slice를 깨지 않는다.

## 첫 vertical slice

첫 번째 실제 동작 가능한 slice는 다음 흐름으로 제한한다.

```txt
shared primitives
-> diagnostics trace
-> browser platform adapter
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

완료 시 `createActorble().click(css('button'))` 또는 equivalent locator가 target resolve부터 synthetic click dispatch, state cleanup, trace 기록까지 한 흐름으로 검증되어야 한다.

## 작업 분리 체크리스트

- 새 모듈 구현은 해당 모듈 테스트와 함께 진행한다.
- cross-module import는 의존성 방향 표에 있는 방향만 허용한다.
- DOM API 직접 호출은 `platform-adapter` 하위 모듈에만 둔다.
- geometry와 interactability를 같은 단위 테스트에서 섞지 않는다.
- Action Orchestrator 테스트는 fake engines로 lifecycle 순서를 검증하고, browser integration test는 별도로 둔다.
- bug fix는 실패하는 회귀 테스트를 먼저 추가한다.
- 각 태스크 완료 시 `pnpm test`, `pnpm typecheck`, `pnpm build`를 통과시킨다.
