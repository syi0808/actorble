# Actorble Browser Performance Tasks

이 문서는 2026-06-16 기준 browser package에서 관찰된 성능 개선 후보를 실행 가능한 태스크로 정리한다. 기준 구현은 `docs/implementation_tasks.md`의 T0-T44 완료 상태이며, 성능 작업은 correctness contract를 바꾸지 않고 비용을 관찰 가능하게 줄이는 것을 목표로 한다.

## 현재 상태

- `benchmarks/performance.bench.js`와 `vitest.bench.config.mjs`가 추가되어 `pnpm bench`로 성능 경로를 측정할 수 있다.
- 첫 benchmark 범위는 jsdom에서도 비용을 재현할 수 있는 Target Resolver, Wait Observation, Pseudo-state Mirror, Visual Layer, Pointer Engine이다.
- 2026-06-16 baseline fixture는 80개 row DOM과 50개 pseudo-state style rule을 사용한다.
- 2026-06-16 `pnpm bench` 결과에서 CSS locator 평균은 약 0.63ms였고, role/label/partial text locator는 약 145-256ms 범위였다. Visible wait의 role target path는 약 266ms였고 root text wait는 약 0.11ms였다.
- Geometry/Interactability의 layout 비용은 jsdom 단독 측정보다 browser smoke 또는 instrumented DOM port가 더 적합하므로 별도 태스크로 둔다.
- 모든 최적화는 기존 behavior test를 먼저 유지하고, 필요한 경우 benchmark 전후 결과를 PR 설명에 남긴다.
- 특정 최적화가 기존 benchmark fixture에서 직접 드러나지 않으면, 해당 task에서 전용 benchmark fixture를 추가하거나 임시 before/after benchmark를 같은 코드로 실행해 결과를 남긴다.

## 의존성 원칙

- 성능 캐시는 feature boundary를 넘겨 concrete DOM 구현을 직접 참조하지 않는다.
- DOM read 비용 최적화는 `platform-adapter/dom-adapter` 또는 주입된 좁은 cache/read port 경계에서 처리한다.
- Geometry 계산과 Interactability 판단은 계속 분리한다.
- Action Orchestrator는 lifecycle coordinator로 남고, layout invalidation 또는 cache policy의 소유자가 되지 않는다.
- Diagnostics는 성능 문제를 관찰 가능하게 만들되 긴 scenario에서 무제한 메모리 성장을 강제하지 않는다.

## Benchmark 측정 원칙

- 각 성능 task는 변경 전후의 같은 fixture, 같은 benchmark command, 같은 Node/pnpm runtime에서 mean/hz/RME를 비교한다.
- 기존 `benchmarks/performance.bench.js`가 hot path를 직접 재현하지 못하면 task 전용 benchmark를 추가하거나 임시 benchmark worktree를 사용하고, fixture 크기와 측정 경로를 기록한다.
- before/after 비교는 가능하면 직전 커밋과 task 커밋을 같은 benchmark 코드로 실행한다. 이미 구현 후 측정하는 경우에는 임시 worktree 또는 `git worktree`로 이전 커밋을 체크아웃해 비교한다.
- PR 또는 완료 보고에는 최소한 benchmark 이름, fixture 크기, before mean, after mean, 개선 배율 또는 감소율, noise/RME 해석을 남긴다.
- correctness test와 spy 기반 read-count test가 최적화의 계약을 고정하고, benchmark는 비용 변화 관찰 자료로 사용한다.

## 의존성 맵

```txt
benchmark harness
  -> target-resolver
  -> wait-observation-engine
  -> pseudo-state-mirror
  -> visual-layer
  -> pointer-engine

target-resolver optimization
  -> platform-adapter/dom-adapter
  -> diagnostics-trace

geometry cache
  -> layout-invalidation-tracker
  -> surface-engine
  -> geometry-engine
  -> interactability-engine
  -> action-orchestrator injection

wait optimization
  -> wait-observation-engine
  -> target-resolver
  -> geometry-engine
  -> interactability-engine
  -> layout-invalidation-tracker

visual optimization
  -> pseudo-state-mirror
  -> style-adapter
  -> visual-layer
  -> pointer-engine
  -> diagnostics-trace
```

## 작업 순서

### P2026-06-16-00 Benchmark Harness

- Status: [x] Completed
- Briefing: 성능 개선 전후를 비교할 수 있도록 현재 hot path를 Vitest benchmark로 측정한다.
- Dependencies: `vitest`, `target-resolver`, `wait-observation-engine`, `pseudo-state-mirror`, `visual-layer`, `pointer-engine`.
- Completion criteria:
  - `pnpm bench`가 benchmark file을 찾아 실행한다.
  - target resolver의 css/role/label/text locator 비용을 같은 fixture에서 비교할 수 있다.
  - wait, pseudo-state mirror, visual cursor, pointer motion 비용이 별도 benchmark name으로 출력된다.
- Test expectations:
  - `pnpm bench`
  - `pnpm test`
  - `pnpm typecheck`

### P2026-06-16-01 Resolver Per-pass Read Memoization

- Status: [x] Completed
- Briefing: `resolve()` 또는 `resolveAll()` 한 번 안에서 같은 element의 debug info, accessible name, hidden state, computed style을 반복 계산하지 않도록 per-pass cache를 둔다.
- Dependencies: `target-resolver`, `platform-adapter/dom-adapter`.
- Completion criteria:
  - role/text/label locator는 같은 resolution pass 안에서 동일 element의 `describeElement()`와 hidden ancestor 판정을 중복 호출하지 않는다.
  - cache lifetime은 단일 resolve call로 제한되어 DOM mutation 이후 stale data를 재사용하지 않는다.
  - diagnostics candidate snapshot은 기존 shape를 유지한다.
- Test expectations:
  - DOM port spy를 사용해 repeated style/debug reads가 줄어드는 regression test를 먼저 추가한다.
  - `pnpm test -- tests/target-resolver.test.js`
  - `pnpm bench -- target`

### P2026-06-16-02 Resolver Fast Paths

- Status: [x] Completed
- Briefing: `exists()`와 common locator paths가 후보 전체 ranking을 만들지 않고 필요한 시점에 short-circuit할 수 있게 한다.
- Dependencies: 완료된 P2026-06-16-01, `target-resolver`.
- Completion criteria:
  - `exists(css/testId/element)`는 후보 전체 handle/ranking/snapshot을 만들지 않는다.
  - non-strict `resolve(css/testId)`는 첫 유효 후보만 필요한 경우 불필요한 sort를 피한다.
  - strict mode와 diagnostics-enabled mode는 기존 ambiguity/candidate visibility contract를 유지한다.
- Test expectations:
  - `exists()`가 첫 match 뒤 추가 expensive reads를 하지 않는 spy test를 추가한다.
  - strict ambiguity test가 계속 통과한다.
  - `pnpm test -- tests/target-resolver.test.js`

### P2026-06-16-03 Text Locator Ancestor Pruning

- Status: [x] Completed
- Briefing: text locator의 ancestor match 제거가 후보 수에 대해 O(n²)로 커지지 않도록 pruning 알고리즘을 바꾼다.
- Dependencies: 완료된 P2026-06-16-01, `target-resolver`, `DomPort.contains`.
- Completion criteria:
  - partial text query에서 ancestor/container 후보가 leaf 후보를 덮어쓰지 않는다.
  - ancestor pruning은 후보 수가 큰 fixture에서도 nested `candidates.some()` 구조를 사용하지 않는다.
  - DOM order와 scoring contract는 기존과 동일하다.
- Test expectations:
  - 중첩 container/leaf text fixture의 기존 behavior regression test를 유지한다.
  - `pnpm test -- tests/target-resolver.test.js`
  - `pnpm bench -- "partial text"`
  - 전용 large nested text fixture로 ancestor pruning before/after mean과 `contains()` read count 변화를 기록한다.

### P2026-06-16-04 Frame-scoped Geometry And Surface Cache

- Status: [x] Completed
- Briefing: 같은 animation frame 안에서 같은 target/ancestor의 rect, scroll metrics, scrollable ancestor chain을 반복 계산하지 않도록 layout invalidation과 연결된 cache를 도입한다.
- Dependencies: `layout-invalidation-tracker`, `surface-engine`, `geometry-engine`, `interactability-engine`.
- Completion criteria:
  - cache는 layout invalidation event, scroll, resize, mutation, manual invalidation 이후 폐기된다.
  - Geometry Engine은 Interactability 판단을 포함하지 않고 rect/visibleRect/clickablePoint snapshot만 캐시한다.
  - Surface Engine의 scrollable ancestor discovery는 같은 target과 frame에서 재사용된다.
- Test expectations:
  - fake DOM port로 same-frame repeated geometry snapshot의 rect/style/scroll read count 감소를 검증한다.
  - invalidation 후 fresh DOM read가 발생하는 test를 추가한다.
  - `pnpm test -- tests/geometry-engine.test.js tests/surface-engine.test.js tests/interactability-engine.test.js`
  - instrumented DOM port benchmark로 same-frame repeated geometry/surface snapshot과 invalidation-after-read 경로의 before/after read count 및 mean을 기록한다.

### P2026-06-16-05 Conditional Fresh Geometry Before Dispatch

- Status: [x] Completed
- Briefing: pointer dispatch 직전 geometry refresh를 항상 수행하지 않고, initial geometry 이후 layout dirty 신호가 있었을 때만 수행할 수 있게 한다.
- Dependencies: 완료된 P2026-06-16-04, `action-orchestrator`, `layout-invalidation-tracker`, `gesture-engine`.
- Completion criteria:
  - click/doubleClick/typeInto click-focus/drag는 layout이 변하지 않은 경우 중복 snapshot을 피한다.
  - layout이 dirty인 경우 기존처럼 dispatch 전 fresh geometry와 interactability preflight를 수행한다.
  - 안전성이 필요한 경로는 option 또는 internal policy로 forced refresh를 유지할 수 있다.
- Test expectations:
  - no-dirty click path에서 geometry snapshot call count가 줄어드는 orchestrator test를 추가한다.
  - dirty event 이후 fresh point를 사용하는 기존 회귀 테스트가 계속 통과한다.
  - `pnpm test -- tests/action-orchestrator.test.js`
  - 전용 orchestrator benchmark로 no-dirty click/doubleClick/typeInto click-focus 경로의 geometry snapshot count와 mean을 before/after 비교한다.

### P2026-06-16-06 Dirty-driven Wait Observation

- Status: [ ] Not started
- Briefing: wait loop가 매 settle마다 resolve/geometry/interactability 또는 root text normalization을 반복하지 않고, DOM/layout dirty 신호와 polling strategy를 조합한다.
- Dependencies: `wait-observation-engine`, `layout-invalidation-tracker`, `target-resolver`, `geometry-engine`, `interactability-engine`.
- Completion criteria:
  - visible/hidden wait는 handle을 재사용하고 stale/detached 또는 dirty 상태에서만 re-resolve한다.
  - text wait는 root text snapshot을 mutation dirty flag와 함께 재사용한다.
  - custom predicate wait는 기존처럼 사용자 predicate를 반복 평가한다.
  - timeout/cancellation diagnostics의 attempts와 lastObservation은 유지된다.
- Test expectations:
  - injected resolver/geometry spies로 unchanged wait retry의 repeated work 감소를 검증한다.
  - mutation/layout invalidation 이후 observation이 갱신되는 test를 추가한다.
  - `pnpm test -- tests/wait-observation-engine.test.js`
  - 전용 wait benchmark로 unchanged visible wait retry, dirty-after-retry visible wait, unchanged root text wait의 repeated resolve/read count와 mean을 기록한다.

### P2026-06-16-07 Pseudo-state Stylesheet Mirror Cache

- Status: [ ] Not started
- Briefing: pseudo-state mirror가 동일 stylesheet set을 매 mirror lifecycle마다 scan/rewrite하지 않도록 reusable cache와 invalidation policy를 둔다.
- Dependencies: `pseudo-state-mirror`, `style-adapter`, `diagnostics-trace`.
- Completion criteria:
  - 동일 document/root와 stylesheet version에서는 rewritten mirror CSS를 재사용한다.
  - style/link mutation 또는 inaccessible stylesheet warning 변화가 있으면 cache를 무효화한다.
  - mirror failure는 기존처럼 warning으로 남고 action success를 깨지 않는다.
- Test expectations:
  - style scanner spy로 두 번째 mirror apply에서 scan count가 줄어드는 test를 추가한다.
  - stylesheet mutation 후 scan이 다시 수행되는 test를 추가한다.
  - `pnpm test -- tests/pseudo-state-mirror.test.js tests/pseudo-state-selector-rewriter.test.js`
  - `pnpm bench -- pseudo-state`와 전용 repeated mirror apply benchmark로 cache hit path와 stylesheet mutation miss path의 before/after mean을 기록한다.

### P2026-06-16-08 Visual Cursor DOM Diffing

- Status: [ ] Not started
- Briefing: cursor overlay가 같은 cursor kind에서 매 move마다 style 전체와 SVG subtree를 다시 만들지 않고 transform/pressed 상태만 갱신한다.
- Dependencies: `visual-layer`, `pointer-visual-tracker`, `action-orchestrator` visual callbacks.
- Completion criteria:
  - 같은 cursor kind에서 `showCursor()`는 기존 SVG subtree를 재사용한다.
  - cursor kind, scale, pressed visual이 바뀌면 필요한 DOM만 갱신한다.
  - overlay hit-testing exclusion과 visual appearance contract는 유지된다.
- Test expectations:
  - repeated same-kind cursor update에서 SVG node identity가 유지되는 test를 추가한다.
  - cursor kind 변경 시 expected variant가 갱신되는 기존 visual tests를 유지한다.
  - `pnpm test -- tests/visual-layer.test.js tests/action-orchestrator.test.js`
  - `pnpm bench -- visual`에 same-kind cursor update와 cursor kind switch를 분리해 before/after mean 및 DOM node churn 감소를 기록한다.

### P2026-06-16-09 Pointer Motion Allocation Control

- Status: [ ] Not started
- Briefing: Pointer Engine의 animated movement가 frame마다 path 배열 전체를 복사하지 않도록 allocation을 줄인다.
- Dependencies: `pointer-engine`, `pointer-signals`, `gesture-engine`.
- Completion criteria:
  - public `PointerState.motion.path` snapshot contract는 유지한다.
  - internal movement update는 path append를 위해 매 frame full-array clone을 하지 않는다.
  - cancellation과 final state path는 기존 tests와 동일하게 관찰된다.
- Test expectations:
  - existing pointer motion path tests를 유지한다.
  - long movement benchmark에서 allocation-sensitive path가 개선되었는지 `pnpm bench -- pointer`로 확인한다.
  - `pnpm test -- tests/pointer-engine.test.js tests/gesture-engine.test.js`
  - 전용 long animated movement benchmark로 frame count, final path length, before/after mean을 기록하고 가능한 경우 allocation proxy metric을 함께 남긴다.

### P2026-06-16-10 Diagnostics Trace Retention Policy

- Status: [ ] Not started
- Briefing: 긴 scenario에서 span/event/snapshot/warning이 무제한으로 커지지 않도록 retention 또는 sampling option을 추가한다.
- Dependencies: `diagnostics-trace`, `target-resolver`, `wait-observation-engine`, `scenario-runner`.
- Completion criteria:
  - 기본값은 기존 full trace behavior를 유지한다.
  - opt-in retention limit은 오래된 events/snapshots를 predictable하게 제한한다.
  - target resolution candidate snapshot은 limit 적용 후에도 timeout/error context를 이해할 수 있다.
- Test expectations:
  - retention limit이 적용된 trace에서 max events/snapshots를 넘지 않는 test를 추가한다.
  - default trace tests는 기존 snapshot immutability contract를 유지한다.
  - `pnpm test -- tests/diagnostics-trace.test.js tests/target-resolver.test.js tests/wait-observation-engine.test.js`
  - 전용 long trace benchmark로 unlimited 기본값과 retention limit opt-in의 event/snapshot count, retained size proxy, append mean을 before/after 또는 default/limited로 비교한다.

## 첫 vertical slice

첫 성능 vertical slice는 Target Resolver에 제한한다.

```txt
benchmark harness
-> target resolver role/text/label fixture
-> per-pass resolver read memoization
-> text ancestor pruning
-> benchmark comparison
```

이 slice가 끝나면 role/text/label locator의 큰 DOM benchmark가 개선되고, 기존 resolver correctness tests와 diagnostics contract가 유지되어야 한다.

## 실행 체크리스트

- 성능 작업 전후에 `pnpm bench` 또는 task 전용 benchmark 결과를 기록한다.
- 기존 benchmark가 최적화 경로를 직접 재지 못하면 전용 fixture를 추가하거나 임시 worktree benchmark로 같은 benchmark 코드의 before/after를 비교한다.
- behavior 변경 전에는 실패하는 Vitest 또는 spy 기반 regression test를 먼저 추가한다.
- DOM read cache는 mutation/frame boundary를 명확히 테스트한다.
- 최적화 후 `pnpm test`, `pnpm typecheck`, `pnpm build`를 통과시킨다.
- browser runtime에서만 드러나는 layout 비용은 example smoke 또는 Playwright 기반 검증을 별도 PR에 포함한다.
