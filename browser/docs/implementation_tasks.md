# Actorble Browser Implementation Tasks

이 문서는 `browser/src/`에 스캐폴딩된 Actorble browser 모듈들의 의존성 방향과 구현 태스크를 정의한다. 기준 문서는 `../docs/browser-architecture.md`이며, 패키지명은 `@actorble/browser`로 둔다.

## 현재 상태

- T0 스캐폴딩은 완료됐다. `src/index.ts` barrel, 모듈별 `index.ts`, `tsconfig.json`, Vitest, package build/typecheck/test scripts가 있다.
- T1 shared primitive와 port 경계는 완료됐다. `src/shared/index.ts`가 좌표/rect/locator/target/options/error/result/adapter port를 제공한다.
- T2 diagnostics trace 최소 코어는 완료됐다. `src/diagnostics/diagnostics-trace/index.ts`가 in-memory span/event/snapshot/warning collector를 제공한다.
- T3 platform adapter 최소 구현은 완료됐다. `src/platform/platform-adapter/*`가 jsdom 기반 DOM/event/state/style adapter 동작을 제공한다.
- `src/`는 architecture layer를 드러내도록 `api`, `runtime`, `targeting`, `input`, `state`, `visual`, `platform`, `diagnostics`, `capability`, `shared`로 나뉜다.
- Public facade 메서드는 composition root에서 resolver/orchestrator/runner/geometry/trace로 위임된다. 지원하지 않는 browser 한계는 silent shell 대신 capability/fidelity report 또는 `PLATFORM_UNSUPPORTED` error로 드러낸다.
- T18-T22는 cursor overlay, motion profile, typing cadence, keystroke feedback, visual fidelity example을 실제 runtime에 연결한 완료 태스크다.
- T23-T25는 browser-like cursor visual, CSS `cursor` 반영, pointer press feedback을 기존 visual runtime 위에 보강한 완료 태스크다.
- T26-T33은 example에서 확인된 visual fidelity 문제를 다뤘다. 기본 입력 타이밍, click press 가시성, 조용한 visual 기본값, CSS pseudo-state mirror, cursor 의미 보정, browser smoke 검증을 순서대로 보강했다.
- T34-T40은 scenario timeline과 runner 중 visual 안정성 문제를 다뤘다. `delay` step, run-level pacing, click 기반 type focus, scroll/resize/layout 변화에 따른 cursor tracking과 dispatch 좌표 보정을 순서대로 보강했다.
- T0-T40 이후 follow-up 완료 기록과 최신 smoke 정합성은 `docs/tasks-2026-06-14.md`에서 관리한다. F 작업은 이 문서의 T41+ 항목으로 복제하지 않는다.
- 모든 새 동작은 TDD로 진행한다. 먼저 실패하는 Vitest 케이스를 추가하고, 최소 구현으로 통과시킨 뒤 리팩터링한다.

기본 검증 명령과 2026-06-15 기준 결과:

```txt
pnpm test              -> pass, 23 files / 311 tests
pnpm typecheck         -> pass
pnpm build             -> pass
pnpm example:typecheck -> pass
pnpm example:build     -> pass
pnpm example:smoke     -> pass
```

## 의존성 방향

의존성은 아래 방향으로만 흐른다. 내부 구현은 concrete class를 직접 새로 만들기보다 interface/port를 생성자 주입으로 받는 것을 기본값으로 한다.

```txt
src/index.ts
  -> 모든 public export를 모으는 barrel only

shared
  -> 외부 Actorble feature module 의존 없음

diagnostics/diagnostics-trace
  -> shared

platform/platform-adapter/*
  -> shared

targeting/target-resolver
  -> shared
  -> platform/platform-adapter/dom-adapter
  -> diagnostics/diagnostics-trace

targeting/surface-engine
  -> shared
  -> platform/platform-adapter/dom-adapter

targeting/geometry-engine
  -> shared
  -> targeting/surface-engine
  -> platform/platform-adapter/dom-adapter

targeting/interactability-engine
  -> shared
  -> targeting/geometry-engine
  -> platform/platform-adapter/dom-adapter

runtime/timeline-engine
  -> shared

input/pointer-signals
  -> shared

input/pointer-engine
  -> shared
  -> runtime/timeline-engine
  -> input/pointer-signals

state/interaction-state-store
  -> shared
  -> input/pointer-signals

input/gesture-engine
  -> shared
  -> input/pointer-engine
  -> input/pointer-signals
  -> runtime/timeline-engine

input/focus-engine
  -> shared
  -> platform/platform-adapter/dom-adapter
  -> state/interaction-state-store

input/keyboard-engine
  -> shared
  -> platform/platform-adapter/event-dispatcher
  -> state/interaction-state-store

input/text-input-engine
  -> shared
  -> input/focus-engine
  -> platform/platform-adapter/event-dispatcher
  -> state/interaction-state-store

runtime/wait-observation-engine
  -> shared
  -> runtime/timeline-engine
  -> platform/platform-adapter/dom-adapter

runtime/action-orchestrator
  -> targeting/target-resolver
  -> targeting/surface-engine
  -> targeting/geometry-engine
  -> targeting/interactability-engine
  -> input/gesture-engine
  -> input/focus-engine
  -> input/keyboard-engine
  -> input/text-input-engine
  -> runtime/wait-observation-engine
  -> runtime/timeline-engine
  -> diagnostics/diagnostics-trace

runtime/scenario-runner
  -> runtime/action-orchestrator
  -> runtime/timeline-engine
  -> diagnostics/diagnostics-trace

visual/pseudo-state-mirror
  -> shared
  -> state/interaction-state-store
  -> platform/platform-adapter/state-applier
  -> platform/platform-adapter/style-adapter
  -> diagnostics/diagnostics-trace

visual/visual-layer
  -> shared
  -> platform/platform-adapter/dom-adapter
  -> platform/platform-adapter/state-applier

capability/capability-fidelity
  -> shared
  -> platform/platform-adapter

api/actorble-facade
  -> runtime/scenario-runner
  -> runtime/action-orchestrator
  -> targeting/target-resolver
  -> targeting/geometry-engine
  -> capability/capability-fidelity
  -> diagnostics/diagnostics-trace
```

핵심 규칙:

- `src/index.ts`는 외부 사용자를 위한 barrel이다. 내부 모듈은 `src/index.ts`를 import하지 않는다.
- `shared`는 foundation이다. 다른 feature module을 import하지 않는다.
- `diagnostics-trace`는 feature module 타입을 끌어오지 않는다. trace input/output은 `shared` primitive 또는 diagnostics 내부 타입으로 제한한다.
- DOM API 직접 호출은 `platform/platform-adapter` 하위 모듈에만 둔다.
- `runtime/action-orchestrator`는 lifecycle을 조율하지만 DOM read/write/event dispatch를 직접 수행하지 않는다.
- `state/interaction-state-store`는 state diff/effect descriptor를 만들고, 실제 DOM 반영은 adapter 또는 visual layer가 수행한다.
- 순환 import는 금지한다. 필요하면 좁은 port를 `shared`로 올리거나 facade composition에서 주입한다.

## 모듈별 구현 계획

| 모듈 | 직접 의존 | 첫 구현 범위 | 테스트 초점 |
| --- | --- | --- | --- |
| `shared` | 없음 | 완료된 primitive를 유지하고 누락된 error code/option만 태스크별로 추가 | feature module import 금지, helper shape 안정성 |
| `diagnostics/diagnostics-trace` | `shared` | 완료된 in-memory collector 유지, 필요 시 span attributes만 확장 | span lifecycle, snapshot immutability, feature import 금지 |
| `platform/platform-adapter/dom-adapter` | `shared` | root/query/rect/style/hit-test/focus/scroll/describeElement 구현 | jsdom DOM read/write, internal overlay hit-test 제외 |
| `platform/platform-adapter/event-dispatcher` | `shared` | pointer/mouse/keyboard/input event descriptor를 실제 DOM event로 dispatch | dispatch order, bubbling/cancelable/defaultPrevented |
| `platform/platform-adapter/state-applier` | `shared` | `data-actorble-*` state attribute apply/cleanup | hover/active/focus-visible cleanup |
| `platform/platform-adapter/style-adapter` | `shared` | runtime style injection/disposal | style element lifecycle, duplicate cleanup |
| `targeting/target-resolver` | `shared`, dom adapter, diagnostics | `element`/`css` locator, strict mode, stale validation | 0/1/N candidate, snapshot handle, detached target |
| `targeting/surface-engine` | `shared`, dom adapter | viewport surface, scrollable ancestors, `ensureVisible` | scroll delegation, coordinate-space metadata |
| `targeting/geometry-engine` | `shared`, surface, dom adapter | rect, visible rect, center, clickable point result | deterministic geometry, no interactability decisions |
| `targeting/interactability-engine` | `shared`, geometry, dom adapter | visible/enabled/editable/focusable/pointer-events/occlusion report | action-specific preflight and force policy |
| `runtime/timeline-engine` | `shared` | controllable clock, timeout, cancellation, next-frame/settled primitive | fake clock, cancellation, timeout |
| `input/pointer-signals` | `shared` | in-memory signal bus | subscribe/unsubscribe, signal order |
| `input/pointer-engine` | `shared`, timeline, signals | position/previous/motion/buttons, move/down/up/cancel | DOM-free pointer state and emitted signals |
| `state/interaction-state-store` | `shared`, pointer signals | hover/active/focus/typing slices and effect descriptors | reducer diff, no platform concrete imports |
| `input/gesture-engine` | `shared`, pointer engine, signals, timeline | click and double-click pointer sequence, drag extension point | fake pointer/timeline sequence |
| `input/focus-engine` | `shared`, dom adapter, store | focus request, activeElement sync, focus-visible modality | platform focus sync, focus failure |
| `input/keyboard-engine` | `shared`, event dispatcher, store | keyDown/keyUp/press, modifier state | modifier ordering, keyboard modality |
| `input/text-input-engine` | `shared`, focus, event dispatcher, store | `type`, `typeInto`, `fill` strategy split | focus before type, input/change dispatch |
| `runtime/wait-observation-engine` | `shared`, timeline, dom adapter | wait strategies: none, next-frame, settled, custom predicate | timeout, mutation quiet hook shape |
| `runtime/action-orchestrator` | resolver/surface/geometry/interactability/input/wait/timeline/diagnostics | `moveTo`, `click`, `typeInto` transaction lifecycle | resolve before dispatch, cleanup, trace context |
| `runtime/scenario-runner` | orchestrator, timeline, diagnostics | ordered step execution, pause/resume/stop state | delegation and cancellation |
| `api/actorble-facade` | runner/orchestrator/resolver/diagnostics/capabilities | composition root and public API delegation | facade methods delegate to injected modules |
| `visual/pseudo-state-mirror` | store, state/style adapters, diagnostics | best-effort `:hover`/`:active`/`:focus-visible` mirror | warning not action failure |
| `visual/visual-layer` | dom/state adapters | non-interactive overlay root and cursor/highlight shell | `pointer-events: none`, hit-test exclusion |
| `capability/capability-fidelity` | platform adapter, shared | synthetic browser runtime capability report | report shape and unsupported limits |

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

### T3. Platform Adapter 최소 구현 - 완료

브리핑: DOM 접근, event dispatch, state apply, style injection shell을 실제 브라우저/jsdom 동작으로 채운다. 이 태스크는 후속 엔진이 fake adapter 없이도 기본 DOM 테스트를 작성할 수 있게 만드는 기반이다.

의존성: `shared`, 선택적으로 `diagnostics-trace`.

완료 기준:

- `BrowserDomAdapter`가 root/query/rect/style/hit-test/contains/isConnected/activeElement/focus/blur/scroll/describeElement를 수행한다.
- `BrowserEventDispatcher`가 pointer/mouse/keyboard/input event를 descriptor 기반으로 dispatch하고 boolean result를 반환한다.
- `BrowserStateApplier`가 `data-actorble-hover`, `data-actorble-active`, `data-actorble-focus-visible`, `data-actorble-focus`, `data-actorble-dragging`을 apply/cleanup한다.
- `BrowserStyleAdapter`가 style injection과 dispose를 지원한다.

### T4. Target Resolver: element/css slice - 완료

브리핑: locator를 target handle로 바꾸는 계층을 구현한다. 첫 slice는 `element()`과 `css()`만 대상으로 하고, role/text/label/testId는 후속 확장으로 남긴다.

의존성: `shared`, `platform-adapter/dom-adapter`, `diagnostics-trace`.

완료 기준:

- `resolve`, `resolveAll`, `exists`, `inspect`, `validate`가 element/css locator에서 동작한다.
- strict mode에서 후보 0개는 `TARGET_NOT_FOUND`, 2개 이상은 `TARGET_AMBIGUOUS`로 구분된다.
- `TargetHandle`은 snapshot handle이며 detached/stale 검증 진입점이 있다.

### T5. Surface Engine: viewport와 scroll chain - 완료

브리핑: target이 속한 surface와 scroll/reveal 책임을 Target Resolver에서 분리한다. viewport와 scroll container를 먼저 지원하고, iframe/shadow/dialog/popover는 확장 지점으로 둔다.

의존성: `shared`, `platform-adapter/dom-adapter`.

완료 기준:

- target의 viewport surface snapshot을 계산한다.
- scrollable ancestor chain을 찾는다.
- `ensureVisible`과 `scrollTo`는 DOM adapter를 통해서만 scroll을 수행한다.

### T6. Geometry Engine: rect와 clickable point - 완료

브리핑: bounding rect, visible rect, center, clickable point 후보 계산을 별도 모듈로 둔다. 조작 가능 여부 판단은 하지 않고 계산 결과와 실패 이유만 반환한다.

의존성: `shared`, `surface-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- `GeometrySnapshot`을 deterministic하게 만든다.
- visible rect와 center point 계산 테스트가 있다.
- clickable point는 `Point | null`이 아니라 strategy/reason이 있는 result로 반환된다.

### T7. Interactability Engine: action preflight - 완료

브리핑: visibility, enabled, editable, focusable, pointer-events, occlusion 판단을 Geometry Engine에서 분리한다. action별 preflight는 `canClick`, `canFocus`, `canType` 같은 report field로 표현한다.

의존성: `shared`, `geometry-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- click/focus/type preflight report가 분리되어 있다.
- disabled, readonly, pointer-events none, occlusion 케이스 테스트가 있다.
- force option으로 우회 가능한 이유와 불가능한 이유를 구분할 수 있다.

### T8. Timeline Engine - 완료

브리핑: duration, next-frame, settled, timeout, cancellation primitive를 독립 구현한다. Pointer/Wait/Scenario/Action은 이 primitive를 주입받는다.

의존성: `shared`.

완료 기준:

- fake clock 또는 controllable scheduler로 테스트할 수 있다.
- timeout과 cancellation이 `ActorbleError` helper와 연결된다.
- `none`, `next-frame`, `settled` 전략의 최소 동작이 있다.

### T9. Pointer Signals와 Pointer Engine - 완료

브리핑: pointer 좌표와 버튼 상태를 의미 상태에서 분리한다. Pointer Engine은 signal만 발행하고 hover/active target을 소유하지 않는다.

의존성: `shared`, `timeline-engine`, `pointer-signals`.

완료 기준:

- signal bus가 subscribe/unsubscribe와 ordered emit을 지원한다.
- pointer state가 position, previousPosition, motion, buttons로 분리된다.
- move/down/up/cancel signal이 순서대로 발행된다.

### T10. Interaction State Store와 slice 구조 - 완료

브리핑: pointer/focus/keyboard/text input signal을 받아 hover, active, focus, focus-visible, typing, dragging state를 reducer 방식으로 관리한다. 실제 DOM 반영은 effect descriptor로만 표현한다.

의존성: `shared`, `pointer-signals`.

완료 기준:

- state snapshot과 diff가 분리된다.
- hover/active/focus/typing slice가 독립 테스트 가능하다.
- platform adapter나 visual layer concrete implementation을 import하지 않는다.

### T11. Gesture Engine - 완료

브리핑: click, doubleClick, drag 같은 composite pointer action을 Pointer Engine 위에 구성한다. Action Orchestrator가 lifecycle을 소유하고 Gesture Engine은 pointer sequence만 책임진다.

의존성: `shared`, `pointer-engine`, `pointer-signals`, `timeline-engine`.

완료 기준:

- click gesture가 move/down/up signal sequence를 만든다.
- double click과 drag는 capability 확장 지점을 가진다.
- gesture test는 fake pointer/timeline으로 실행된다.

### T12. Focus, Keyboard, Text Input Engine - 완료

브리핑: focus 요청, key sequence, text insertion을 별도 엔진으로 둔다. `type`, `typeInto`, `fill`의 의미 차이를 API 수준에서 보존한다.

의존성: `shared`, `platform-adapter/dom-adapter`, `platform-adapter/event-dispatcher`, `interaction-state-store`.

완료 기준:

- Focus Engine은 platform active element를 읽어 store와 sync한다.
- Keyboard Engine은 keyDown/keyUp/press와 modifier state를 관리한다.
- Text Input Engine은 fill과 type을 별도 strategy로 처리한다.

### T13. Wait / Observation Engine - 완료

브리핑: action 후 settlement와 명시적 wait condition을 담당한다. mutation quiet, next frame, layout stable 같은 wait strategy를 action lifecycle 밖의 독립 primitive로 만든다.

의존성: `shared`, `timeline-engine`, `platform-adapter/dom-adapter`.

완료 기준:

- `none`, `next-frame`, `settled`, custom predicate 전략의 최소 구현이 있다.
- timeout error가 diagnostics context와 연결될 수 있다.
- mutation/resize/scroll 변화가 geometry cache invalidation hook으로 연결될 수 있다.

### T14. Action Orchestrator click vertical slice - 완료

브리핑: resolve, validate, ensureVisible, geometry, interactability preflight, perform, wait, cleanup 순서를 하나의 action transaction으로 묶는다. 먼저 `moveTo`, `click`, `typeInto`만 대상으로 한다.

의존성: resolver/surface/geometry/interactability/gesture/focus/text/wait/timeline/diagnostics.

완료 기준:

- `click(target)`이 resolve before dispatch 규칙을 지킨다.
- pointer down 이후 실패 또는 cancel 시 cleanup이 보장된다.
- action span에 input, output, failure context가 남는다.

### T15. Actorble Facade와 Scenario Runner 조립 - 완료

브리핑: Scenario Runner는 step 순서, pause/resume/stop, scenario timeout/cancellation만 소유하고 개별 action은 orchestrator에 위임한다. Facade는 public API와 composition root 역할을 한다.

의존성: `action-orchestrator`, `target-resolver`, `scenario-runner`, `diagnostics-trace`, `capability-fidelity`.

완료 기준:

- public facade가 resolve/click/typeInto/waitFor/run의 초기 entrypoint를 제공한다.
- scenario runner가 step execution을 orchestrator에 위임한다.
- facade 외부에서 concrete module graph를 직접 조립하지 않아도 된다.

### T16. Pseudo State Mirror, Visual Layer, Capability / Fidelity - 완료

브리핑: core correctness와 visual fidelity를 분리한다. pseudo-state mirror와 overlay는 실패해도 action을 실패시키지 않고 diagnostics warning으로 남긴다. capability report는 synthetic browser runtime의 한계를 명시한다.

의존성: `interaction-state-store`, `platform-adapter/state-applier`, `platform-adapter/style-adapter`, `platform-adapter/dom-adapter`, `diagnostics-trace`, `shared`.

완료 기준:

- visual overlay는 `pointer-events: none`을 기본으로 한다.
- pseudo mirror failure는 warning trace로 남고 action failure가 되지 않는다.
- capability/fidelity report가 pointer, keyboard, text input, pseudo state, trusted events, drag/drop 한계를 표현한다.

### T17. Locator와 browser fidelity 확장 - 완료

브리핑: 첫 vertical slice 이후 role/text/label/testId/point locator, shadow root, iframe, dialog/popover, drag/drop capability를 확장한다.

의존성: 완료된 T3-T16.

완료 기준:

- locator별 ranking과 ambiguity 정책이 trace에 남는다.
- cross-origin frame, closed shadow root, trusted event 한계가 capability/fidelity에 반영된다.
- 확장 기능은 기존 `click(css(...))` vertical slice를 깨지 않는다.

### T18. Visual Layer runtime 연결

- Status: [x] Completed

브리핑: T16의 overlay shell을 실제 action 실행 경로에 연결한다. Visual Layer는 core correctness가 아니라 관찰 가능한 보조 표현이어야 하며, 실패해도 action을 실패시키지 않는다.

의존성: 완료된 T9-T16, `visual-layer`, `action-orchestrator`, `actorble-facade`, `diagnostics-trace`.

완료 기준:

- composition root가 runtime 옵션에 따라 Visual Layer를 생성하거나 주입받을 수 있다.
- `pointer:moved` signal은 cursor overlay 위치를 갱신한다.
- `click`/`moveTo`/`typeInto` action은 target geometry를 이용해 highlight 또는 affordance를 표시할 수 있다.
- click gesture는 pointer down/up 흐름과 분리된 click visual feedback을 남긴다.
- Visual Layer 실패는 diagnostics warning으로 기록되고 action success/failure 판정에 영향을 주지 않는다.
- overlay는 계속 `pointer-events: none`이며 target resolution과 hit-test에서 제외된다.

테스트 기대:

- fake Visual Layer를 주입한 Action Orchestrator 테스트가 pointer signal과 visual 호출 순서를 검증한다.
- jsdom 기반 Visual Layer 테스트가 overlay root, cursor, highlight, click feedback이 target hit-test를 막지 않음을 검증한다.
- visual disabled/headless 옵션에서 overlay DOM을 만들지 않는 회귀 테스트를 둔다.

### T19. Pointer motion profile과 easing

- Status: [x] Completed

브리핑: Pointer Engine의 현재 선형 `duration` 이동을 확장해 사람이 조작하는 듯한 motion profile을 지원한다. Pointer Engine은 좌표와 path만 소유하고, target 의미 상태와 Visual Layer 표현은 계속 외부 계층에 둔다.

의존성: `shared`, `timeline-engine`, `pointer-signals`, `pointer-engine`, `gesture-engine`.

완료 기준:

- move option이 deterministic 기본 profile과 명시적 motion profile을 구분할 수 있다.
- linear 외 easing 기반 movement가 frame별 `pointer:moved` signal을 만든다.
- spring-like movement는 overshoot/settling을 표현하더라도 최종 좌표가 요청 target으로 수렴한다.
- cancellation은 motion status와 pressed button state를 일관되게 정리한다.
- motion path는 테스트에서 재현 가능해야 하며 임의 난수는 seed 또는 deterministic profile 뒤에 숨긴다.

테스트 기대:

- fake timeline으로 easing progress와 emitted path를 검증한다.
- spring-like profile이 최종 target point와 idle status로 끝나는지 검증한다.
- cancel 중단 시 추가 frame signal이 나오지 않고 `pointer:cancelled`가 기록되는지 검증한다.

### T20. Text input typing cadence

- Status: [x] Completed

브리핑: `type`과 `typeInto`가 글자를 즉시 모두 삽입하지 않고 cadence를 적용할 수 있게 한다. `fill`은 빠른 값 대체 전략으로 유지해 `type`과 의미를 분리한다.

의존성: `shared`, `timeline-engine`, `focus-engine`, `text-input-engine`, `action-orchestrator`.

완료 기준:

- Text Input Engine이 Timeline Engine을 주입받아 grapheme 단위 입력 사이에 delay를 적용한다.
- `TypeOptions.delay`는 `type`과 `typeInto`에 반영되고 `fill`에는 적용하지 않는다.
- `beforeinput`이 취소된 글자는 mutation 없이 다음 입력으로 진행하되 cadence와 event order를 보존한다.
- action cancellation은 typing state를 반드시 clear한다.
- 빈 문자열 입력은 불필요한 delay 없이 typing lifecycle을 안전하게 종료한다.

테스트 기대:

- fake timeline으로 `typeInto('abc', { delay })`가 각 글자 사이에 delay를 호출하는지 검증한다.
- `beforeinput` cancel, timeout/cancellation, 빈 문자열 케이스의 typing state cleanup을 검증한다.
- Action Orchestrator가 TypeOptions를 Text Input Engine까지 전달하는 회귀 테스트를 둔다.

### T21. Typing, focus, keystroke visual feedback

- Status: [x] Completed

브리핑: Interaction State Store의 focus/typing 상태를 사용자가 볼 수 있는 표현으로 연결한다. 이 태스크는 실제 입력 correctness가 아니라 focus ring, typing indicator, keystroke overlay 같은 visual fidelity에만 집중한다.

의존성: 완료된 T18, T20, `interaction-state-store`, `visual-layer`, `focus-engine`, `keyboard-engine`, `text-input-engine`.

완료 기준:

- Visual Layer가 focus ring과 typing/keystroke feedback을 표현할 수 있다.
- focus/typing state effect는 DOM state applier와 visual 표현을 독립적으로 갱신한다.
- keystroke overlay는 입력 대상, 입력 문자, 또는 safe label을 표시하되 민감한 원문 노출을 끌 수 있다.
- visual feedback은 action cleanup, cancellation, `destroy()`에서 제거된다.
- visual feedback failure는 diagnostics warning으로 남고 input action을 실패시키지 않는다.

테스트 기대:

- focus/typing state change에 따른 visual call 또는 overlay DOM 변화를 검증한다.
- sensitive text masking 옵션을 검증한다.
- cancellation과 destroy cleanup 후 overlay part가 남지 않는지 검증한다.

### T22. Human-like visual fidelity example과 report 정렬

- Status: [x] Completed

브리핑: visual runtime이 실제로 보이는지 예제와 fidelity report로 검증한다. 현재 capability/fidelity report가 shell 존재와 runtime 연결을 혼동하지 않도록 구현 상태를 정확히 표현한다.

의존성: 완료된 T18-T21, `capability-fidelity`, `actorble-facade`, `example/*`.

완료 기준:

- action playground 또는 별도 예제가 cursor movement, target highlight, click feedback, typing cadence를 한 흐름에서 보여준다.
- capability/fidelity report가 synthetic input 한계와 visual runtime 지원 수준을 구분해 설명한다.
- visual fidelity가 꺼진 모드와 켜진 모드의 동작 차이가 예제에서 확인 가능하다.
- 예제는 구현된 public API만 사용하고 내부 모듈에 직접 의존하지 않는다.

테스트 기대:

- 예제 TypeScript typecheck가 통과한다.
- capability/fidelity report snapshot 테스트가 visual runtime 지원 수준을 검증한다.
- 가능하면 Playwright 또는 browser-driven smoke test로 overlay가 생성되고 target hit-test를 막지 않음을 확인한다.

### T23. Browser-like cursor visual

- Status: [x] Completed

브리핑: 현재 cursor overlay는 위치를 나타내는 작은 원형 marker에 가깝다. 이 태스크는 Visual Layer가 실제 브라우저 커서처럼 보이는 overlay를 표현하도록 개선한다. Visual Layer는 여전히 표현 계층이며, target resolution, hit-test, pointer event dispatch에는 관여하지 않는다.

의존성: 완료된 T18-T22, `visual-layer`, `shared`.

완료 기준:

- 기본 cursor overlay가 원형 점이 아니라 browser-like pointer hotspot을 가진 커서 형태로 렌더링된다.
- Visual Layer는 `default`/`auto`, `pointer`, `text`, `not-allowed`, `wait` 또는 `progress`, `grab`/`grabbing`, `move`, `crosshair` 같은 주요 cursor 의미를 구분해 표현할 수 있다.
- 지원하지 않는 cursor 값은 안전한 기본 cursor visual로 degrade된다.
- overlay root와 cursor part는 계속 `pointer-events: none`이며 `data-actorble-internal` marker를 유지한다.
- `hide()`, `destroy()`, visual disabled 옵션에서 cursor overlay DOM이 남지 않는다.

테스트 기대:

- jsdom 기반 Visual Layer 테스트가 cursor variant별 attribute/class/style 변화를 검증한다.
- cursor hotspot 기준 위치가 기존 center marker와 다르게 안정적으로 적용되는지 검증한다.
- visual disabled/headless equivalent 경로에서 cursor DOM을 만들지 않는 회귀 테스트를 둔다.

### T24. CSS cursor resolution and visual routing

- Status: [x] Completed

브리핑: CSS `cursor`는 target style과 pseudo-state mirror 결과에 의해 바뀔 수 있다. 이 태스크는 pointer lifecycle 중 현재 target의 computed cursor를 읽고 Visual Layer에 전달한다. CSS/DOM 읽기는 adapter 또는 orchestrator 경계에 남기고, Visual Layer가 target/style resolution을 직접 수행하지 않게 한다.

의존성: 완료된 T23, `action-orchestrator`, `platform-adapter/dom-adapter`, `interaction-state-store`, `pseudo-state-mirror`, `visual-layer`.

완료 기준:

- `pointer:moved` 처리 시 hover state effect와 pseudo-state mirror 적용 이후 target의 computed `cursor` 값이 cursor visual에 반영된다.
- `pointer:down`/`pointer:up` 처리 시 active state에 의해 CSS cursor가 달라질 수 있는 경우 cursor visual도 갱신된다.
- `auto`, `inherit`, 빈 값처럼 직접 표현하기 어려운 값은 필요하면 ancestor chain 또는 안전한 기본값으로 해석한다.
- Actorble internal overlay 요소는 cursor resolution과 hit-test에 영향을 주지 않는다.
- cursor style 읽기 또는 visual update 실패는 diagnostics warning으로 남고 action success/failure 판정에 영향을 주지 않는다.

테스트 기대:

- fake DOM/style adapter를 사용하는 Action Orchestrator 테스트가 computed `cursor` 값이 Visual Layer 호출로 전달되는지 검증한다.
- hover/active state effect 적용 순서 이후 cursor를 읽는 회귀 테스트를 둔다.
- unsupported cursor 값과 visual failure warning 경로를 검증한다.

### T25. Cursor press feedback

- Status: [x] Completed

브리핑: click ripple과 별개로, 실제 커서 자체가 눌릴 때 약간 작아졌다가 pointer up 이후 원래 크기로 돌아오는 visual feedback을 추가한다. 이 효과는 core click correctness가 아니라 Visual Layer affordance이며, pointer button state와 cleanup 흐름을 따라야 한다.

의존성: 완료된 T23-T24, `pointer-signals`, `action-orchestrator`, `interaction-state-store`, `visual-layer`, `diagnostics-trace`.

완료 기준:

- `pointer:down`은 cursor visual에 pressed 상태를 반영하고, `pointer:up`은 원래 상태로 복귀시킨다.
- `pointer:cancelled`, action cancellation, failed perform cleanup 이후 pressed visual state가 남지 않는다.
- cursor shrink/restore 효과는 deterministic CSS transition 또는 equivalent visual state로 표현되며 pointer event dispatch 순서를 바꾸지 않는다.
- 기존 `showClick` click feedback은 pointer up 이후 click affordance로 유지되고, cursor press feedback과 책임이 섞이지 않는다.
- visual disabled/headless 경로에서는 press feedback이 DOM을 만들거나 action 동작을 바꾸지 않는다.

테스트 기대:

- Visual Layer 테스트가 pressed state attribute/class와 restore 동작을 검증한다.
- Action Orchestrator 테스트가 `pointer:down`/`pointer:up`/`pointer:cancelled`에 따른 cursor visual 호출 순서와 cleanup을 검증한다.
- click visual feedback과 cursor press feedback이 독립적으로 호출되는 회귀 테스트를 둔다.

### T26. Public pointer motion defaults and click movement routing

- Status: [x] Completed

브리핑: 현재 public action의 기본 pointer movement는 옵션이 없으면 즉시 이동하거나 example에서 `spring` profile을 직접 사용해 통통 튀어 보인다. 기본 사용자-facing 동작은 nonzero duration의 tween/easing으로 두고, `spring`은 명시적 opt-in profile로만 유지한다.

의존성: 완료된 T19, `shared`, `pointer-engine`, `gesture-engine`, `action-orchestrator`, `actorble-facade`, `example/*`.

완료 기준:

- `moveTo` public path에서 `duration`/`motion`이 생략되면 안정적인 `ease-in-out` tween 기본값을 사용한다.
- `click`은 target point로 이동할 때 public movement 기본값 또는 명시된 movement option을 거친 뒤 `pointerdown`/`pointerup`을 수행한다.
- 명시적 `duration: 0` 또는 명시적 `motion`은 caller 의도를 보존하고 기본값으로 덮어쓰지 않는다.
- `spring` profile은 계속 지원하되 기본 action/example flow에는 사용하지 않는다.
- 기본값은 한 곳에서 관리되고, low-level `PointerEngine`의 deterministic 직접 사용성을 불필요하게 깨지 않는다.

테스트 기대:

- fake timeline 기반 Action Orchestrator 또는 Gesture Engine 테스트가 option 없는 `click`에서 `pointer:moved` frame들이 `pointerdown`보다 먼저 발생함을 검증한다.
- explicit zero-duration movement와 explicit `spring` profile이 기존처럼 opt-in으로 동작하는 회귀 테스트를 둔다.
- action playground가 normal visual flow에서 `spring`을 쓰지 않는지 example typecheck로 검증한다.

### T27. Public typing cadence defaults

- Status: [x] Completed

브리핑: `type`/`typeInto`는 사람이 입력하는 API인데 `delay`가 없으면 글자가 즉시 모두 삽입된다. public action 기본값에는 grapheme 사이 cadence를 두고, 빠른 값 대체는 `fill`의 책임으로 유지한다.

의존성: 완료된 T20, `shared`, `timeline-engine`, `text-input-engine`, `action-orchestrator`, `actorble-facade`.

완료 기준:

- public `typeInto`에서 `delay`가 생략되면 사람이 볼 수 있는 기본 grapheme delay를 적용한다.
- 명시적 `delay` 값은 기본값보다 우선하며, `delay: 0`은 즉시 입력을 요청하는 opt-out으로 동작한다.
- `fill`은 typing cadence 기본값의 영향을 받지 않는다.
- timeout/cancellation은 기본 cadence가 적용된 경우에도 typing state cleanup을 보장한다.

테스트 기대:

- fake timeline 테스트가 option 없는 `typeInto('abc')`에서 기본 delay를 두 번 호출하는지 검증한다.
- explicit `delay: 0`과 explicit custom delay가 기본값을 덮어쓰는 회귀 테스트를 둔다.
- cancellation/timeout 중 typing state가 남지 않는 기존 테스트를 기본 cadence 경로로 확장한다.

### T28. Perceptible click press dwell and cursor shrink

- Status: [x] Completed

브리핑: `pointerdown` 직후 `pointerup`이 같은 tick에 가까워 cursor shrink transition이 렌더링될 시간이 없다. click correctness와 event order는 유지하되, visual runtime에서는 down 상태가 최소 한 frame 이상 관찰 가능해야 한다.

의존성: 완료된 T25-T26, `shared`, `timeline-engine`, `gesture-engine`, `action-orchestrator`, `visual-layer`.

완료 기준:

- `click` gesture는 기본 press dwell을 두어 cursor pressed visual이 관찰 가능하다.
- 명시적 option으로 press dwell을 줄이거나 끌 수 있어 테스트와 caller 제어성을 유지한다.
- cursor pressed transform/transition은 browser-like cursor shape를 유지하면서 충분히 보이는 수준으로 조정된다.
- `pointerdown` → dwell → `pointerup` → synthetic `click` event order는 변하지 않는다.
- cancellation 또는 failed perform cleanup 이후 pressed visual state가 남지 않는다.

테스트 기대:

- fake timeline 테스트가 click 중 dwell delay가 `pointerdown`과 `pointerup` 사이에서 호출됨을 검증한다.
- Visual Layer 테스트가 pressed cursor transform/transition이 복귀 transform과 구분되는지 검증한다.
- cancellation/failed cleanup 테스트가 pressed visual restore를 검증한다.

### T29. Quiet visual feedback defaults and granular visual options

- Status: [x] Completed

브리핑: 현재 Visual Layer는 cursor 외에도 target highlight, click ring, focus ring, typing indicator, keystroke overlay를 기본 action path에서 그린다. 기본 visual mode는 앱의 실제 UI를 방해하지 않는 cursor 중심 표현으로 낮추고, 부가 feedback은 명시적 debug/option으로만 켠다.

의존성: 완료된 T18, T21-T25, `shared`, `visual-layer`, `action-orchestrator`, `actorble-facade`, `capability-fidelity`.

완료 기준:

- `VisualFeedbackOptions`가 cursor, target highlight, click feedback, focus overlay, typing indicator, keystroke overlay를 독립적으로 제어할 수 있다.
- `visual: true`의 기본값은 cursor와 core cleanup만 켜고, click ring/target highlight/focus overlay/typing indicator/keystroke overlay는 기본으로 생성하지 않는다.
- 명시적 visual option 또는 debug preset을 통해 기존 부가 feedback을 다시 켤 수 있다.
- visual disabled/headless 경로는 overlay DOM을 만들지 않는 기존 동작을 유지한다.
- fidelity report는 visual overlay runtime과 visual feedback detail level을 혼동하지 않는다.

테스트 기대:

- `visual: true` click/type flow에서 click ring, focus overlay, typing indicator, keystroke overlay가 생성되지 않는 회귀 테스트를 둔다.
- 각 granular option을 켰을 때 해당 overlay part만 생성되는 Visual Layer 또는 Facade 테스트를 둔다.
- `destroy()`와 failed action cleanup이 opt-in overlay part를 제거하는지 검증한다.

### T30. Pseudo-state mirror fallback removal and focus-visible correctness

- Status: [x] Completed

브리핑: pseudo-state mirror가 실제 app CSS를 복제하지 못할 때 임의 fallback style을 넣으면 앱의 hover/focus 디자인과 달라진다. mirror 실패 또는 미지원 상태에서는 state attribute만 남기고, 스타일은 임의로 만들지 않는다.

의존성: 완료된 T16, T21, `pseudo-state-mirror`, `interaction-state-store`, `focus-engine`, `text-input-engine`, `platform-adapter/state-applier`, `platform-adapter/style-adapter`.

완료 기준:

- 기본 mirror CSS에서 임의 `outline`, border, background 같은 fallback visual style을 제거한다.
- `:hover`, `:active`, `:focus-visible` mirror stylesheet 생성에 실패하면 action은 성공하되 fallback visual style을 주입하지 않는다.
- `typeInto`는 typing lifecycle 때문에 `focus-visible`을 강제로 켜지 않는다. focus-visible은 focus option 또는 modality 정책에 따라 별도로 결정된다.
- state attribute apply/cleanup은 유지되어 diagnostics와 향후 CSS mirror의 입력으로 사용할 수 있다.

테스트 기대:

- Pseudo State Mirror 테스트가 기본 주입 CSS에 arbitrary focus outline이 없음을 검증한다.
- style injection 실패 경로에서 warning만 남고 fallback style이 추가되지 않는지 검증한다.
- `typeInto` 회귀 테스트가 입력 중 focus state와 focus-visible state를 구분해 검증한다.

### T31. Stylesheet-driven pseudo-state selector mirror

- Status: [x] Completed

브리핑: 현재 pseudo-state mirror는 이름과 달리 app stylesheet의 `:hover`/`:active`/`:focus-visible` selector를 rewrite하지 않는다. 접근 가능한 stylesheet를 스캔하고 selector를 data attribute 기반 mirror selector로 변환해, 가능한 경우 기존 앱 스타일을 그대로 재현한다.

의존성: 완료된 T30, `pseudo-state-mirror`, `platform-adapter/style-adapter`, `diagnostics-trace`, `shared`.

완료 기준:

- same-origin 또는 runtime에서 접근 가능한 stylesheet의 CSS rule을 스캔한다.
- `:hover`, `:active`, `:focus-visible` selector를 각각 `data-actorble-hover`, `data-actorble-active`, `data-actorble-focus-visible` 기반 selector로 rewrite한다.
- rewrite된 mirror stylesheet는 원본 selector의 의도를 가능한 범위에서 유지하되, 지원 불가 selector/rule은 warning 또는 trace event로 건너뛴다.
- inaccessible stylesheet, parse failure, injection failure는 action failure가 아니라 diagnostics warning으로 남긴다.
- 지원되는 rule이 하나도 없으면 임의 fallback style 없이 style injection을 생략할 수 있다.

테스트 기대:

- selector rewriter 단위 테스트가 class/id/compound selector의 pseudo-state rewrite 결과를 검증한다.
- jsdom style adapter 테스트가 `.button:hover` 같은 rule이 `[data-actorble-hover]` mirror rule로 주입되는지 검증한다.
- inaccessible stylesheet 또는 unsupported rule이 warning만 남기고 action success를 깨지 않는지 검증한다.

### T32. Cursor semantics for editable and indirect cursor targets

- Status: [x] Completed

브리핑: input 같은 editable target에서 computed `cursor`가 `auto` 또는 inherited value로 남으면 cursor overlay가 arrow처럼 보일 수 있다. Cursor visual은 DOM style resolution을 우선하되, style이 indirect value일 때 target semantics로 browser-like fallback을 선택해야 한다.

의존성: 완료된 T24, T29, `action-orchestrator`, `platform-adapter/dom-adapter`, `interactability-engine`, `visual-layer`.

완료 기준:

- editable text target의 resolved cursor가 `auto`/`inherit`/empty 계열이면 text cursor visual로 degrade된다.
- disabled, not-allowed, progress/wait, pointer button 같은 explicit cursor 값은 semantic fallback보다 우선한다.
- cursor resolution은 Visual Layer 내부가 아니라 orchestrator/adapter 경계에서 수행한다.
- resolution 실패는 기존처럼 diagnostics warning으로 남고 action success를 깨지 않는다.

테스트 기대:

- Action Orchestrator 테스트가 input target에서 computed `auto`가 `text` cursor visual request로 전달되는지 검증한다.
- explicit `cursor: pointer` 또는 ancestor-resolved cursor가 semantic fallback보다 우선하는 회귀 테스트를 둔다.
- cursor style read failure warning 경로를 유지한다.

### T33. Browser visual fidelity example and smoke verification

- Status: [x] Completed

브리핑: visual fidelity 개선은 jsdom style assertions만으로는 충분히 확인하기 어렵다. action playground를 조용한 기본 visual과 opt-in debug visual을 보여주도록 정리하고, 실제 browser runtime에서 불필요한 overlay가 보이지 않는지 smoke 검증한다.

의존성: 완료된 T26-T32, `example/*`, `actorble-facade`, `visual-layer`, `capability-fidelity`.

완료 기준:

- action playground의 normal flow는 tween movement, typing cadence, click dwell을 보여주되 `spring`, click ring, typing indicator 같은 부가 visual을 기본으로 사용하지 않는다.
- debug 또는 visual detail toggle을 통해 opt-in overlay feedback을 명확히 비교할 수 있다.
- example UI는 public API만 사용하고 내부 모듈에 직접 의존하지 않는다.
- browser smoke 검증에서 overlay root가 hit-test를 막지 않고, default visual mode에 불필요한 overlay part가 생성되지 않음을 확인한다.

테스트 기대:

- `pnpm example:typecheck`와 `pnpm example:build`가 통과한다.
- 가능하면 Playwright 또는 Browser-driven smoke test로 action playground default flow의 overlay DOM과 event 결과를 검증한다.
- fidelity report snapshot 또는 integration test가 visual overlay enabled와 visual detail option을 구분하는지 검증한다.

### T34. First-class scenario delay step

- Status: [x] Completed

브리핑: delay를 step option이 아니라 scenario를 구성하는 명시적 step으로 추가한다. 사용자는 action 사이의 의도적인 대기를 scenario timeline에서 읽을 수 있어야 하며, runner는 delay 중에도 pause/stop/timeout을 즉시 반영해야 한다.

의존성: 완료된 T8, T15, `shared`, `scenario-runner`, `timeline-engine`, `diagnostics-trace`.

완료 기준:

- `ScenarioStep` union에 `action: 'delay'` step을 추가하고, 양수 duration을 runner timeline delay로 실행한다.
- delay step은 Action Orchestrator로 위임하지 않고 Scenario Runner 책임으로 처리한다.
- scenario timeout, external abort, `stop()`은 delay 중에도 action 실행 중과 동일하게 취소된다.
- `pause()`는 delay step 시작 전 또는 다음 step 시작 전 runner 경계에서 기존 pause semantics와 일관되게 동작한다.
- trace에는 delay step의 duration과 완료/취소 결과를 식별할 수 있는 event 또는 span이 남는다.

테스트 기대:

- Scenario Runner 테스트가 `delay` step을 순서대로 실행하고 다음 action 전에 timeline delay가 호출되는지 검증한다.
- delay 중 `stop()`과 scenario timeout이 같은 AbortSignal 경로로 취소되는 회귀 테스트를 둔다.
- unsupported step 테스트가 `delay`를 더 이상 unsupported action으로 처리하지 않음을 검증한다.

### T35. Run-level scenario pacing

- Status: [x] Completed

브리핑: 명시적 `delay` step과 별개로, runner 실행 전체에 적용되는 기본 step 간격을 제공한다. 이 pacing은 scenario의 모든 대기를 대체하지 않고, 반복 실행이나 demo flow에서 기본 리듬을 주기 위한 runner option이다.

의존성: 완료된 T34, `shared`, `scenario-runner`, `timeline-engine`, `diagnostics-trace`.

완료 기준:

- `RunOptions`에 step 사이 기본 간격을 표현하는 pacing option을 추가한다.
- runner는 step이 성공적으로 끝난 뒤 마지막 step이 아니면 pacing delay를 적용한다.
- 명시적 `delay` step은 scenario timeline의 독립 step으로 유지되며, run-level pacing과 schema 책임이 섞이지 않는다.
- pacing delay도 scenario timeout, external abort, `stop()`에 의해 취소된다.
- trace 또는 diagnostics에서 explicit delay step과 run-level pacing delay를 구분할 수 있다.

테스트 기대:

- Scenario Runner 테스트가 `pacing.betweenSteps`가 action 사이에서 호출되고 마지막 step 뒤에는 호출되지 않음을 검증한다.
- explicit delay step과 run-level pacing을 함께 둔 scenario에서 둘이 순서대로 관찰되는지 검증한다.
- cancellation/timeout 테스트를 pacing delay 경로로 확장한다.

### T36. Click-based focus acquisition for typeInto

- Status: [x] Completed

브리핑: `typeInto`는 현재 programmatic focus 뒤 바로 입력한다. interactive flow에서는 target으로 pointer가 이동하고 click으로 focus를 획득한 뒤 typing cadence가 시작되는 경로가 필요하다. 이 동작은 `type`/`fill`과 섞지 않고 `typeInto`의 focus acquisition option으로 둔다.

의존성: 완료된 T26-T28, T30, `shared`, `action-orchestrator`, `gesture-engine`, `focus-engine`, `text-input-engine`, `interactability-engine`, `visual-layer`.

완료 기준:

- `TypeOptions`에 focus 획득 전략을 표현하는 option을 추가한다.
- click 기반 전략은 resolve/reveal/geometry/type preflight 이후 target의 최신 clickable point로 pointer click을 수행하고, focus가 실제 target 또는 editable target으로 잡혔는지 확인한 뒤 typing을 시작한다.
- programmatic focus 경로는 기존 headless/test 사용성을 깨지 않도록 유지한다.
- click focus와 typing 사이에 관찰 가능한 짧은 settle 또는 configurable delay를 둘 수 있다.
- `type(text)`는 계속 현재 focused editable target만 사용하고 자동 target click을 수행하지 않는다.

테스트 기대:

- Action Orchestrator 테스트가 `typeInto(..., { focusStrategy: 'click' })`에서 pointer move/down/up/click event가 input event보다 먼저 발생함을 검증한다.
- programmatic focus 기본 경로 또는 opt-in 경로가 기존 `typeInto` 테스트를 깨지 않는지 검증한다.
- click focus 중 cancellation/timeout 발생 시 pointer active/pressed visual과 typing state가 남지 않는 회귀 테스트를 둔다.

### T37. Runner-active layout invalidation tracker

- Status: [x] Completed

브리핑: runner 실행 중에는 scroll, resize, DOM mutation, CSS animation 같은 layout 변화를 평소보다 민감하게 관찰해야 한다. 단, 이벤트마다 geometry를 즉시 읽으면 과도한 layout read가 발생하므로 dirty flag와 animation frame coalescing으로 제어한다.

의존성: 완료된 T13, T15, `scenario-runner`, `wait-observation-engine`, `timeline-engine`, `platform-adapter/dom-adapter`, `diagnostics-trace`.

완료 기준:

- runner 실행 중에만 활성화되는 layout invalidation 관찰 경로를 추가한다.
- viewport/window resize, scrollable ancestor scroll, root-level DOM mutation 또는 equivalent invalidation source를 dirty signal로 모은다.
- dirty signal은 직접 geometry read/write를 하지 않고 다음 frame 또는 settle boundary에서 coalescing된다.
- runner idle, stopped, destroyed 상태에서는 observer/listener가 cleanup된다.
- diagnostics에는 invalidation reason과 coalesced update 횟수를 추적할 수 있는 event가 남는다.

테스트 기대:

- fake observer 또는 adapter 기반 테스트가 여러 scroll/resize signal이 한 frame의 invalidation으로 합쳐지는지 검증한다.
- runner stop/failure 이후 listener cleanup이 호출되는지 검증한다.
- wait/settle 중 invalidation이 action failure로 전파되지 않고 diagnostics에 남는지 검증한다.

### T38. Target-anchor cursor visual tracking

- Status: [x] Completed

브리핑: cursor visual은 마지막 viewport 좌표가 아니라 현재 명령이 가리키는 target anchor를 따라가야 한다. runner가 delay 또는 wait 중이어도 target이 scroll/resize/animation으로 움직이면 cursor visual은 최신 geometry에 맞게 업데이트되어야 한다.

의존성: 완료된 T37, `action-orchestrator`, `geometry-engine`, `surface-engine`, `visual-layer`, `interaction-state-store`, `diagnostics-trace`.

완료 기준:

- cursor visual state는 free point와 target anchor 상태를 구분해 저장한다.
- target anchor 상태는 target handle, anchor 계산 방식, pressed state, command id를 포함해 최신 명령이 이전 follow 상태를 폐기할 수 있다.
- runner-active invalidation이 발생하면 현재 anchor target의 geometry를 재계산해 cursor visual point를 다시 투영한다.
- point 변화가 의미 없을 때는 Visual Layer DOM write를 생략해 과도한 업데이트를 줄인다.
- target이 detached/stale이면 cursor follow를 중단하거나 diagnostics warning으로 degrade하되 runner 전체를 불필요하게 실패시키지 않는다.

테스트 기대:

- Action Orchestrator 또는 tracker 단위 테스트가 target rect가 바뀐 뒤 cursor visual request point가 새 rect를 따라가는지 검증한다.
- 새 click/move/typeInto command가 시작되면 이전 command id의 cursor follow update가 무시되는지 검증한다.
- detached target 경로에서 warning과 cleanup이 발생하고 stale cursor가 계속 남지 않는지 검증한다.

### T39. Fresh geometry before pointer dispatch

- Status: [x] Completed

브리핑: cursor visual만 target을 따라가면 실제 pointer event dispatch 좌표와 화면 표시가 어긋날 수 있다. click, click-based type focus, future drag 같은 pointer action은 pointerdown 직전 최신 geometry를 다시 확인해야 한다.

의존성: 완료된 T36, T38, `action-orchestrator`, `gesture-engine`, `geometry-engine`, `interactability-engine`, `surface-engine`, `platform-adapter/event-dispatcher`.

완료 기준:

- pointer action은 initial geometry 이후 perform 직전 또는 pointerdown 직전에 target freshness와 clickable point를 다시 확인한다.
- scroll/resize/layout 변화로 target point가 바뀐 경우 pointer move endpoint와 pointerdown/up dispatch point가 최신 geometry를 따른다.
- target이 더 이상 interactable하지 않으면 기존 interactability error 체계로 실패하고 cleanup을 수행한다.
- explicit force click 정책은 기존 interactability force semantics와 충돌하지 않는다.
- visual cursor anchor와 actual dispatch point가 같은 geometry source를 공유하거나 trace에서 차이를 진단할 수 있다.

테스트 기대:

- fake geometry가 perform 직전에 다른 point를 반환하는 테스트에서 pointerdown/click event가 최신 point를 사용하는지 검증한다.
- fresh geometry preflight가 실패할 때 pointerdown이 dispatch되지 않고 action failure phase와 cleanup이 기록되는지 검증한다.
- click-based `typeInto` 경로에서도 focus click 좌표가 최신 geometry를 사용하는지 검증한다.

### T40. Scenario timing and tracking example smoke

- Status: [x] Completed

브리핑: delay step, run-level pacing, click-to-focus typing, runner-active cursor tracking은 jsdom 단위 테스트만으로 체감 품질을 확인하기 어렵다. action playground 또는 scenario runner example에서 실제 browser flow로 묶어 확인한다.

의존성: 완료된 T34-T39, `example/*`, `actorble-facade`, `scenario-runner`, `visual-layer`, `capability-fidelity`.

완료 기준:

- scenario runner example이 `delay` step을 public scenario syntax로 보여준다.
- action playground 또는 scenario example에서 `typeInto` click focus 전략을 사용해 pointer click, focus, typing 순서를 관찰할 수 있다.
- runner 실행 중 scroll 또는 layout 변화가 있는 target을 따라 cursor visual이 갱신되는 demo path를 제공한다.
- example code는 public API만 사용하고 internal tracker/orchestrator concrete state에 직접 의존하지 않는다.
- smoke 검증은 default visual mode와 debug visual mode가 모두 hit-testing을 방해하지 않음을 확인한다.

테스트 기대:

- `pnpm example:typecheck`와 `pnpm example:build`가 통과한다.
- Playwright 또는 equivalent browser smoke가 delay step, click-to-focus typeInto, scroll/resize cursor follow를 최소 한 flow로 검증한다.
- smoke 실패 시 trace 또는 DOM diagnostics로 어느 step에서 drift가 발생했는지 확인할 수 있어야 한다.

### T41. Strict resolver ambiguity contract

- Status: [x] Completed

브리핑: `strict: true` target resolution이 문서 계약처럼 후보 2개 이상을 모두 ambiguous로 처리하도록 맞춘다. 현재 구현은 최고 점수 동률만 ambiguous로 보므로 exact 후보와 lower-ranked 후보가 함께 있을 때 strict 계약을 우회한다.

의존성: 완료된 T4, T17, `target-resolver`, `diagnostics-trace`, `shared` error helpers.

완료 기준:

- `resolve(locator, { strict: true })`는 후보가 2개 이상이면 score 차이와 무관하게 `TARGET_AMBIGUOUS`를 반환한다.
- `strict: false`는 기존 ranking 기반 best candidate 선택을 유지한다.
- ambiguous error details는 locator summary, 후보 수, ambiguity reason을 포함한다.
- trace candidate snapshot은 기존처럼 후보 ranking을 남긴다.

테스트 기대:

- `tests/target-resolver.test.js`에 exact/partial 또는 role/text ranking 차이가 있는 2개 후보 strict 회귀 테스트를 먼저 추가한다.
- 기존 css strict ambiguity 테스트와 non-strict best candidate 테스트가 계속 통과한다.
- `pnpm test -- tests/target-resolver.test.js`
- `pnpm typecheck`

### T42. Native label accessible names for role locators

- Status: [x] Completed

브리핑: `role(kind, { name })`이 browser native label association을 accessible name 후보로 사용할 수 있게 한다. 새 accessibility dependency를 추가하지 않고, 현재 label locator가 이미 가진 `<label for>`와 nested label 탐색을 재사용한다.

의존성: 완료된 T17, `platform-adapter/dom-adapter`, `target-resolver`.

완료 기준:

- `<label for="email">Email</label><input id="email">`에서 `role('textbox', { name: 'Email' })`가 input을 찾는다.
- `<label>Name <input /></label>` nested label도 같은 role name path에서 동작한다.
- `aria-label`과 `aria-labelledby`는 native label보다 우선한다.
- hidden label/control은 기존 visibility policy를 깨지 않는다.
- cross-root 또는 closed shadow root 한계는 기존 browser fidelity warning 정책에 남긴다.

테스트 기대:

- `tests/target-resolver.test.js`에 native label 기반 role name 회귀 테스트를 먼저 추가한다.
- 기존 `label()` locator 테스트와 role aria-name 테스트가 계속 통과한다.
- `pnpm test -- tests/target-resolver.test.js tests/platform-adapter.test.js`
- `pnpm typecheck`

### T43. Programmatic focus for negative tabindex

- Status: [x] Completed

브리핑: `tabindex="-1"` 요소는 Tab 순서에는 없지만 native `.focus()` 대상이다. Interactability의 `canFocus`는 programmatic focus 가능성과 sequential tab 가능성을 섞지 않도록 수정한다.

의존성: 완료된 T7, T12, `interactability-engine`, `focus-engine`, `action-orchestrator`.

완료 기준:

- `[tabindex="-1"]` target은 visible/enabled 상태에서 `canFocus: true`로 판정된다.
- sequential tab 후보 정책은 `focusEngine.tab()` 경계에 남고, `canFocus`와 섞이지 않는다.
- disabled, inert, hidden, pointer-independent focus blockers는 기존처럼 focus를 막는다.
- focus action은 negative tabindex target을 programmatic focus로 처리하고 wait/cleanup lifecycle을 유지한다.

테스트 기대:

- `tests/interactability-engine.test.js`에 negative tabindex focusability 회귀 테스트를 먼저 추가한다.
- 필요하면 `tests/focus-keyboard-text-input.test.js` 또는 `tests/action-orchestrator.test.js`에 public focus path 테스트를 추가한다.
- `pnpm test -- tests/interactability-engine.test.js tests/focus-keyboard-text-input.test.js tests/action-orchestrator.test.js`
- `pnpm typecheck`

### T44. Unified action timeout envelope for pointer perform

- Status: [ ] Not started

브리핑: pointer action의 public `timeout`이 resolve/reveal/preflight/wait뿐 아니라 gesture perform 전체에도 적용되도록 정리한다. 현재 pointer movement와 click dwell은 timeout option을 부분적으로 전달하지만 전체 deadline을 직접 강제하지 않아 action timeout 계약과 drift가 생길 수 있다.

의존성: 완료된 T9, T10, T13, T15, T19, T27, T39, `timeline-engine`, `pointer-engine`, `gesture-engine`, `action-orchestrator`.

완료 기준:

- `moveTo`, `click`, `doubleClick`, `clickCurrent`, click-focus `typeInto`, `drag`의 perform phase는 하나의 action-level deadline 또는 abort signal을 공유한다.
- timeout 발생 시 `ACTION_TIMEOUT` error operation은 public action 또는 documented lower-level operation과 일관되게 report된다.
- pointer down 이후 timeout/cancellation은 pressed button, active/hover state, cursor visual, drag state cleanup을 보장한다.
- timeout 없는 경로와 external `AbortSignal` 경로는 기존 동작을 유지한다.
- 기존 `TimelineEngine` primitive를 우선 사용하고 새 timeout helper는 중복을 줄일 때만 추가한다.

테스트 기대:

- `tests/action-orchestrator.test.js`에 perform 중 stuck movement 또는 dwell timeout 회귀 테스트를 먼저 추가한다.
- `tests/gesture-engine.test.js` 또는 `tests/pointer-engine.test.js`에 lower-level signal cleanup 테스트를 필요한 최소 범위로 추가한다.
- 기존 text/keyboard/scenario timeout 테스트가 영향을 받지 않는지 확인한다.
- `pnpm test -- tests/action-orchestrator.test.js tests/gesture-engine.test.js tests/pointer-engine.test.js`
- `pnpm typecheck`

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
