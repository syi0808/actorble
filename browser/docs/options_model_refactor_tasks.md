# Actorble Browser Options Model Refactor Tasks

이 문서는 `docs/adr/2026-06-17-browser-options-model.md`를 기준으로
browser runtime option 모델을 전용 `src/options/` 경계로 이동하고, public
API에서 겹치던 `mode`/`visual` 옵션과 기존 pointer motion profile을 정리하는
리팩토링 태스크를 정의한다.

기준 문서:

- `docs/adr/2026-06-17-browser-options-model.md`
- `docs/browser-architecture.md`
- `docs/high-level-architecture.md`
- `browser/docs/implementation_tasks.md`

이 문서는 완료된 T0-T44 기록을 수정하지 않는 별도 후속 태스크 문서다. 새
작업은 모두 TDD로 진행한다.

## 리팩토링 목표

- Browser runtime option 기본값, public-to-internal normalization, runner-level
  policy, action default 병합을 `src/options/`에 집중시킨다.
- Public API에서는 `mode`와 `visual`을 제거하고 intent-oriented `feedback`
  surface로 교체한다.
- 기존 public `PointerMotionProfile`에서 `linear` kind를 제거하고,
  `inertia`/`spring`의 `duration` 기반 pseudo 구현을 제거한다.
- 하위 engine은 raw public option object를 다시 해석하지 않고 resolved internal
  option 또는 좁은 execution context만 소비한다.

## 마이그레이션 정책

이번 리팩토링은 즉시 교체 정책을 따른다.

- Public `ActorbleOptions.mode`와 `ActorbleOptions.visual`은 제거한다.
- Public feedback 설정은 `feedback`만 사용한다.
- Custom visual layer 주입은 public feedback API와 섞지 않고 composition-only
  option으로 분리한다.
- `PointerMotionProfile.kind: 'linear'`는 제거하고 `{ kind: 'ease', timing:
  'linear' }`로 표현한다.
- `inertia`와 `spring` profile은 `duration`을 받지 않는다.
- Legacy alias나 deprecation shim을 추가하지 않는다.

## 의존성 원칙

- `src/options/`는 `shared` primitive와 public/shared type만 의존한다.
- `src/options/`는 runtime engine, visual layer, platform adapter concrete
  implementation을 import하지 않는다.
- Facade와 Scenario Runner는 public option을 runtime boundary에서 resolved
  option으로 바꾼 뒤 하위 계층에 넘긴다.
- Action Orchestrator는 action lifecycle coordinator로 남고 option 기본값
  owner가 되지 않는다.
- Gesture/Pointer/Text input engine은 resolved action option 또는 narrow
  movement/typing context만 소비한다.
- Visual feedback policy와 motion policy는 별도 축으로 유지한다.
- DOM, event dispatch, state apply, style injection은 계속 platform adapter
  경계 안에 둔다.
- 순환 import가 필요해지면 shared type 또는 options-local type으로 경계를
  좁힌다.

## 의존성 맵

```txt
shared
  -> no feature module dependencies

options
  -> shared

visual-layer
  -> shared
  -> platform/platform-adapter/dom-adapter
  -> platform/platform-adapter/state-applier

pointer-engine
  -> shared
  -> runtime/timeline-engine
  -> input/pointer-signals

gesture-engine
  -> shared
  -> input/pointer-engine
  -> runtime/timeline-engine

action-orchestrator
  -> options resolved action option types
  -> targeting engines
  -> input engines
  -> wait/timeline
  -> diagnostics

scenario-runner
  -> options runner/action default resolver
  -> runtime/action-orchestrator
  -> runtime/timeline-engine
  -> diagnostics

actorble-facade
  -> options actorble option resolver
  -> runtime/scenario-runner
  -> runtime/action-orchestrator
  -> visual-layer composition
  -> capability-fidelity
```

## Public option target shape

```ts
type ActorbleFeedback =
  | 'off'
  | 'cursor'
  | 'debug'
  | {
      cursor?: boolean
      target?: boolean
      click?: boolean
      focus?: boolean
      typing?: boolean
      keystroke?: boolean
      text?: 'hidden' | 'masked' | 'plain'
    }

type RunOptions = OperationOptions & {
  pacing?: ScenarioPacingOptions
  motion?: boolean
  actionDefaults?: BrowserActionDefaults
}

type PointerMotionProfile =
  | {
      kind: 'ease'
      timing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
      duration?: DurationMs
    }
  | {
      kind: 'inertia'
      initialVelocity?: number
      deceleration?: number
    }
  | {
      kind: 'spring'
      stiffness?: number
      damping?: number
      mass?: number
    }
```

Option 병합 순서는 아래로 고정한다.

```txt
1. centralized browser defaults
2. actorble-level defaults
3. runner-level motion policy
4. runner-level actionDefaults[action]
5. scenario step options or direct call options
```

Step/call option은 항상 runner-level default보다 우선한다.

## 작업 순서

### BOPT-01 Dedicated Options Module

- Status: [x] Completed
- Briefing: `src/options/`를 추가해 browser option 기본값, public feedback
  normalization, resolved action option type, action default merge helper를 한
  경계에 둔다. 이 태스크는 runtime behavior 변경보다 option ownership을 먼저
  고정한다.
- Dependencies: `shared`, ADR browser option model.
- Completion criteria:
  - `src/options/index.ts`가 centralized browser defaults를 제공한다.
  - actorble-level option, run-level option, action-level option을 resolved
    internal option으로 바꾸는 entrypoint가 있다.
  - 기본 pointer motion, typing delay, click press dwell, feedback channel
    default가 facade/orchestrator/gesture helper가 아니라 options module에서
    나온다.
  - `options` module은 runtime, visual, platform concrete implementation을
    import하지 않는다.
- Test expectations:
  - `tests/options-model.test.js`가 default resolution과 merge order의 최소
    shape를 검증한다.
  - import boundary 테스트가 `src/options/`의 concrete module import를 막는다.
  - `pnpm test -- tests/options-model.test.js`
  - `pnpm typecheck`

### BOPT-02 Feedback Surface Replacement

- Status: [x] Completed
- Briefing: public `mode`/`visual` 옵션을 제거하고 `feedback` surface로 facade
  composition, visual feedback routing, capability/fidelity report를 정렬한다.
- Dependencies: BOPT-01, `actorble-facade`, `visual-layer`, `capability-fidelity`.
- Completion criteria:
  - public `ActorbleOptions`는 `feedback?: ActorbleFeedback`을 사용한다.
  - `feedback: 'off'`는 overlay runtime과 feedback channel을 모두 끈다.
  - `feedback: 'cursor'`는 cursor 중심 기본 feedback만 켠다.
  - `feedback: 'debug'`는 target/click/focus/typing/keystroke feedback을 켠다.
  - object feedback은 명시된 channel만 켜며 `text` visibility policy를 전달한다.
  - custom visual layer 주입은 `feedback`과 분리된 composition-only option으로
    이동한다.
  - public `mode`와 `visual` type/test/example 사용이 제거된다.
- Test expectations:
  - facade tests가 `off`, `cursor`, `debug`, object feedback routing을 검증한다.
  - capability/fidelity tests가 feedback detail과 synthetic input fidelity를
    혼동하지 않음을 검증한다.
  - legacy `mode`/`visual` test는 새 feedback contract로 교체한다.
  - `pnpm test -- tests/actorble-facade.test.js tests/capability-fidelity.test.js`
  - `pnpm typecheck`

### BOPT-03 Actorble Defaults And Direct Call Resolution

- Status: [ ] Not started
- Briefing: `createActorble()` 시점의 actorble-level defaults를 direct public
  action call에 적용한다. Scenario Runner가 없는 `click`, `moveTo`, `typeInto`
  같은 호출도 options module의 resolved option을 거쳐야 한다.
- Dependencies: BOPT-01, BOPT-02, `actorble-facade`, `action-orchestrator`.
- Completion criteria:
  - `ActorbleOptions`에 actorble-level `motion?: boolean`과
    `actionDefaults?: BrowserActionDefaults`가 있다.
  - direct call option은 centralized defaults와 actorble-level defaults 위에
    caller override를 병합한다.
  - `motion: false`는 direct pointer action의 default movement를 끄되, 명시적
    call-level motion/duration override는 보존한다.
  - facade는 raw public option object를 하위 engine에 그대로 넘기지 않는다.
- Test expectations:
  - facade or options tests가 actorble-level action default와 direct call override
    precedence를 검증한다.
  - action-orchestrator tests는 resolved option을 받는 경로로 갱신한다.
  - `pnpm test -- tests/options-model.test.js tests/actorble-facade.test.js tests/action-orchestrator.test.js`
  - `pnpm typecheck`

### BOPT-04 Runner Defaults And Step Override Resolution

- Status: [ ] Not started
- Briefing: Scenario Runner가 run-level motion policy와 actionDefaults를 적용해
  각 scenario step option을 최종 action option으로 materialize한다.
- Dependencies: BOPT-01, BOPT-03, `scenario-runner`, `action-orchestrator`.
- Completion criteria:
  - `RunOptions`는 `motion?: boolean`과 `actionDefaults?: BrowserActionDefaults`를
    가진다.
  - runner는 step 실행 전 options module을 통해 action별 final option을 만든다.
  - runner-level `actionDefaults[action]`는 step option보다 낮은 우선순위를 가진다.
  - runner-level `motion: false`는 pointer action의 default movement만 끄며 action
    실행 자체를 막지 않는다.
  - scenario cancellation signal은 option merge 과정에서 보존된다.
- Test expectations:
  - scenario-runner tests가 run-level default, motion disabled policy, step-level
    override, signal preservation을 검증한다.
  - direct call tests가 runner defaults의 영향을 받지 않는지 검증한다.
  - `pnpm test -- tests/scenario-runner.test.js tests/options-model.test.js`
  - `pnpm typecheck`

### BOPT-05 Runtime Consumption Of Resolved Options

- Status: [ ] Not started
- Briefing: Action Orchestrator, Gesture Engine, Text Input Engine의 ad hoc default
  helper를 제거하고, 하위 layer가 resolved option 또는 좁은 context만 소비하도록
  정리한다.
- Dependencies: BOPT-03, BOPT-04, `action-orchestrator`, `gesture-engine`,
  `text-input-engine`.
- Completion criteria:
  - public pointer motion default, typing delay, press dwell default가
    action-orchestrator/gesture-engine 내부 상수가 아니다.
  - action-orchestrator는 default를 재해석하지 않고 resolved action option을
    gesture/text/wait 계층에 전달한다.
  - gesture-engine은 pointer movement와 press dwell execution만 담당한다.
  - text-input-engine은 typing cadence execution만 담당하고 public default를
    소유하지 않는다.
- Test expectations:
  - action-orchestrator tests가 resolved click/move/type option 전달과 cleanup을
    검증한다.
  - gesture/text input tests가 explicit option execution에 집중하도록 갱신된다.
  - `pnpm test -- tests/action-orchestrator.test.js tests/gesture-engine.test.js tests/focus-keyboard-text-input.test.js`
  - `pnpm typecheck`

### BOPT-06 Pointer Motion Contract Cleanup

- Status: [ ] Not started
- Briefing: public `PointerMotionProfile`에서 `linear` kind와 `duration` 기반
  `inertia`/`spring` profile을 제거한다. 이 태스크는 contract cleanup과
  unsupported guard까지만 수행한다.
- Dependencies: BOPT-01, `shared`, `pointer-engine`, `gesture-engine`.
- Completion criteria:
  - `PointerMotionProfile`은 `ease`, `inertia`, `spring` 세 kind만 가진다.
  - linear movement는 `{ kind: 'ease', timing: 'linear' }`로 표현한다.
  - `ease` profile은 `timing` field를 사용하고 기존 `easing` field를 제거한다.
  - `inertia`와 `spring`은 `duration` field를 받지 않는다.
  - inertia/spring runtime behavior가 아직 구현되지 않았다면 명시적
    `PLATFORM_UNSUPPORTED` error를 반환한다.
  - 예제와 테스트에서 legacy `kind: 'linear'`, `easing`, `spring.duration`,
    `inertia.duration` 사용이 제거된다.
- Test expectations:
  - pointer-engine tests가 `ease` timing별 movement를 검증한다.
  - unsupported inertia/spring guard tests가 error details를 검증한다.
  - typecheck가 legacy motion profile 사용을 잡도록 테스트 fixture를 갱신한다.
  - `pnpm test -- tests/pointer-engine.test.js tests/gesture-engine.test.js`
  - `pnpm typecheck`

### BOPT-07 Inertia Motion Implementation

- Status: [ ] Not started
- Briefing: `initialVelocity`와 `deceleration` 기반 deterministic inertia motion을
  구현한다. 이 태스크는 unsupported guard를 실제 runtime behavior로 교체한다.
- Dependencies: BOPT-06, `pointer-engine`, `timeline-engine`.
- Completion criteria:
  - inertia profile은 duration 없이 endpoint로 수렴하는 deterministic path를 만든다.
  - default `initialVelocity`와 `deceleration`은 options module 기본값에서 온다.
  - cancellation 중에는 추가 movement frame을 emit하지 않고 pointer state를 정리한다.
  - path snapshot은 테스트에서 재현 가능하다.
- Test expectations:
  - fake timeline pointer tests가 inertia path, final point, idle status를 검증한다.
  - cancellation test가 `pointer:cancelled`와 no later movement frame을 검증한다.
  - `pnpm test -- tests/pointer-engine.test.js`
  - `pnpm typecheck`

### BOPT-08 Spring Motion Implementation

- Status: [ ] Not started
- Briefing: `stiffness`, `damping`, `mass` 기반 deterministic spring motion을
  구현한다. 이 태스크는 spring settlement rule을 runtime behavior로 확정한다.
- Dependencies: BOPT-06, `pointer-engine`, `timeline-engine`.
- Completion criteria:
  - spring profile은 duration 없이 endpoint로 수렴한다.
  - default stiffness/damping/mass는 options module 기본값에서 온다.
  - overshoot가 발생해도 settlement 후 final point는 요청 endpoint와 일치한다.
  - cancellation 중에는 button/motion state cleanup이 보장된다.
- Test expectations:
  - fake timeline pointer tests가 spring overshoot, settlement, final point를
    검증한다.
  - cancellation test가 stale movement frame이 남지 않음을 검증한다.
  - `pnpm test -- tests/pointer-engine.test.js`
  - `pnpm typecheck`

### BOPT-09 Docs, Examples, And Smoke Alignment

- Status: [ ] Not started
- Briefing: browser docs, examples, smoke 검증을 새 `feedback` option과 revised
  motion profile contract에 맞춘다.
- Dependencies: BOPT-02, BOPT-04, BOPT-06, BOPT-07, BOPT-08, `example/*`,
  public docs.
- Completion criteria:
  - docs/examples/smoke에서 public `mode`, public `visual`, `kind: 'linear'`,
    `easing`, `spring.duration`, `inertia.duration` 사용이 제거된다.
  - action playground 또는 browser examples는 `feedback: 'cursor'`와
    `feedback: 'debug'` 차이를 public API로 보여준다.
  - smoke 검증은 feedback off/cursor/debug가 target hit-test를 방해하지 않음을
    확인한다.
  - capability/fidelity 설명은 feedback detail과 synthetic event 한계를 분리한다.
- Test expectations:
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm example:typecheck`
  - `pnpm example:build`
  - `pnpm example:smoke`

## 첫 vertical slice

첫 구현 slice는 BOPT-01부터 BOPT-04의 최소 경로로 제한한다.

```txt
shared option types
-> src/options defaults and merge helpers
-> facade feedback/default resolution
-> scenario runner run-level action defaults
-> action orchestrator resolved click options
-> gesture pointer movement
-> visual cursor feedback
```

검증 목표:

```ts
const actorble = createActorble({
  feedback: 'cursor',
  actionDefaults: {
    click: { pressDwell: 0 },
  },
})

await actorble.run(
  {
    steps: [
      {
        action: 'click',
        target: css('#submit'),
        options: {
          motion: { kind: 'ease', timing: 'linear', duration: 0 },
        },
      },
    ],
  },
  {
    motion: false,
    actionDefaults: {
      click: { timeout: 1000 },
    },
  },
)
```

완료 시 이 slice는 다음을 증명해야 한다.

- `feedback: 'cursor'`가 cursor feedback만 활성화한다.
- actorble-level click default가 direct call과 runner call 모두에서 병합된다.
- runner-level `motion: false`가 default motion을 끄지만 step-level explicit motion은
  유지된다.
- runner-level action default보다 step option이 우선한다.
- click action은 target resolve부터 dispatch, cleanup, trace 기록까지 기존
  lifecycle을 유지한다.

## 실행 체크리스트

- 각 태스크는 실패하는 Vitest를 먼저 추가한 뒤 구현한다.
- 태스크 완료 시 해당 task의 status를 `[x] Completed`로 바꾸고 검증 결과를
  커밋 메시지나 작업 로그에 남긴다.
- Public type 변경 태스크는 `pnpm typecheck`를 반드시 포함한다.
- Runtime behavior 변경 태스크는 action-orchestrator 또는 pointer-engine 경계
  테스트를 포함한다.
- Example/docs 변경 태스크는 `pnpm example:typecheck`, `pnpm example:build`,
  `pnpm example:smoke`를 포함한다.
- 완료된 T0-T44 기록은 별도 요구가 없으면 수정하지 않는다.
