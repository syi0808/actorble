---
title: API Surface
description: User-facing API reference for @actorble/browser.
sidebar:
  order: 4
---

The package entrypoint is `@actorble/browser`. Start with `createActorble()`, locator helpers, and facade methods.

```ts
import { createActorble, css } from '@actorble/browser'
```

Low-level target types, engine interfaces, platform adapters, and custom composition hooks are documented in [Advanced API](../advanced-api/).

## createActorble

```ts
function createActorble(options?: ActorbleFacadeOptions): Actorble
```

Creates the browser facade and wires the default browser modules for target resolution, geometry, action orchestration, scenario execution, diagnostics, visual feedback, and fidelity reports.

```ts
import { createActorble, css } from '@actorble/browser'

const actorble = createActorble({ feedback: 'cursor' })

await actorble.click(css('#save'))
actorble.destroy()
```

### Options

`createActorble()` and `new Actorble()` accept the same options object. Most users only need `root` and `feedback`.

```ts
type CommonActorbleOptions = Pick<
  ActorbleFacadeOptions,
  'root' | 'debug' | 'feedback' | 'motion' | 'actionDefaults'
>

type CommonActorbleOptionsShape = {
  root?: Document | ShadowRoot | Element
  debug?: boolean
  feedback?: ActorbleFeedback
  motion?: boolean
  actionDefaults?: BrowserActionDefaults
}
```

### root

- Type: `Document | ShadowRoot | Element`

Limits DOM access to a document or shadow root. Passing an element uses its owner document.

```ts
const actorble = createActorble({ root: document })
```

### debug

- Type: `boolean`

Reserved on the shared options shape. It is not wired to facade behavior yet.

### feedback

- Type: `ActorbleFeedback`

`feedback: 'cursor'` creates the built-in non-interactive browser overlay with cursor feedback only. `feedback: 'debug'` enables target, click, focus, typing, and keystroke feedback. `feedback: 'off'` disables the overlay runtime. Object feedback enables only the channels you set.

```ts
const actorble = createActorble({
  feedback: 'debug',
})
```

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
```

Custom visual layer injection is an advanced composition hook exposed as `visualLayer`; it is separate from the public feedback preset.

Dependency injection options such as `resolver`, `orchestrator`, `trace`, and `dom` are advanced composition hooks. See [Advanced API](../advanced-api/) for the interfaces those injected modules must satisfy.

## Actorble

```ts
class Actorble {
  constructor(options?: ActorbleFacadeOptions)
}
```

`Actorble` is the facade for resolving targets, running actions, waiting, executing scenarios, reading reports, and cleaning up runtime state.

```ts
import { Actorble, testId } from '@actorble/browser'

const actorble = new Actorble()
await actorble.typeInto(testId('project-name'), 'Orbit')
```

### actorble.resolve

```ts
resolve(locator: Locator, options?: ResolveOptions): Promise<TargetHandle>
```

Resolves one locator into a target handle. Use `strict: true` when ambiguous matches should reject instead of returning the highest-ranked match.

```ts
const save = await actorble.resolve(css('#save'), { strict: true })
```

`TargetHandle` is usually passed back into Actorble methods. Its full shape is documented in [Advanced API](../advanced-api/#targethandle).

### actorble.resolveAll

```ts
resolveAll(locator: Locator, options?: ResolveOptions): Promise<readonly TargetHandle[]>
```

Returns every target that matches a locator.

```ts
const rows = await actorble.resolveAll(css('[data-row]'))
```

### actorble.exists

```ts
exists(locator: Locator, options?: ResolveOptions): Promise<boolean>
```

Returns whether at least one target matches the locator.

```ts
if (await actorble.exists(text('Saved'))) {
  // ...
}
```

### actorble.inspect

```ts
inspect(target: TargetLike): Promise<TargetInspection>
```

Returns the current target handle, debug information, and validity.

```ts
const info = await actorble.inspect(css('#save'))
console.log(info.validity)
```

### actorble.geometry

```ts
geometry(target: TargetLike): Promise<GeometrySnapshot>
```

Computes the target rectangle, visible rectangle, center point, and clickable-point result.

```ts
const snapshot = await actorble.geometry(css('#save'))
console.log(snapshot.center)
```

### actorble.moveTo

```ts
moveTo(target: TargetLike, options?: MoveOptions): Promise<void>
```

Resolves and reveals a target, computes geometry, moves the synthetic pointer, and waits for settlement.

```ts
await actorble.moveTo(css('#save'), { duration: 200 })
```

### actorble.click

```ts
click(target: TargetLike, options?: ClickOptions): Promise<void>
```

Runs the full click transaction: resolve, validate, reveal, geometry, interactability preflight, pointer gesture, wait, cleanup, and trace recording.

```ts
await actorble.click(css('#create-project'), {
  timeout: 2_000,
  force: false,
  pressDwell: 80,
})
```

### actorble.typeInto

```ts
typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void>
```

Resolves and reveals a target, focuses it, types text through synthetic browser input events, and records typing visual feedback when enabled.

```ts
await actorble.typeInto(label('Project name'), 'Orbit', {
  focusStrategy: 'programmatic',
  delay: 40,
})
```

### actorble.waitFor

```ts
waitFor(condition: WaitCondition, options?: WaitOptions): Promise<void>
```

Waits for a browser condition to be satisfied.

```ts
await actorble.waitFor({
  kind: 'custom',
  predicate: () => document.body.textContent?.includes('Saved') ?? false,
})
```

### actorble.run

```ts
run(scenario: Scenario, options?: RunOptions): Promise<void>
```

Runs ordered scenario steps with cancellation, timeout, pacing, pause, resume, stop, trace, and layout-invalidation handling.

```ts
await actorble.run({
  name: 'create project',
  steps: [
    { action: 'click', target: css('#project-name') },
    { action: 'typeInto', target: css('#project-name'), input: 'Orbit' },
    { action: 'click', target: css('#create-project') },
  ],
})
```

### actorble.pause

```ts
pause(): void
```

Requests a running scenario to pause between steps.

### actorble.resume

```ts
resume(): void
```

Resumes a paused scenario.

### actorble.stop

```ts
stop(): void
```

Stops the active scenario and aborts the current action signal when one is active.

### actorble.getCapabilities

```ts
getCapabilities(): CapabilityReport
```

Returns the browser implementation capability report, including synthetic input limits.

### actorble.getFidelity

```ts
getFidelity(): FidelityReport
```

Returns the current input and visual overlay fidelity report.

### actorble.getTrace

```ts
getTrace(): Trace
```

Returns trace spans, events, snapshots, and warnings recorded by the facade modules.

### actorble.on

```ts
on(event: DebugEventName, listener: ActorbleListener<TraceEvent>): void
```

Subscribes to future diagnostics trace events by exact event name. Existing events in `getTrace().events` are not replayed.

```ts
actorble.on('action:failure', (event) => {
  console.log(event.name, event.at, event.spanId, event.data)
})
```

`TraceEvent` has a stable top-level shape:

```ts
type TraceEvent = {
  name: DebugEventName
  at: TimestampMs
  spanId?: string
  data?: unknown
}
```

Supported event names currently emitted by the browser runtime are:

- `action:cleanup-failed`
- `action:failure`
- `current-target:resolved`
- `current-target:validate`
- `geometry:invalidate`
- `layout:invalidate`
- `pointer:fresh-geometry`
- `pointer:synthetic-drag`
- `pseudo:mirror:apply`
- `pseudo:mirror:clear`
- `pseudo:mirror:stylesheet-scan`
- `pseudo:mirror:warning`
- `scenario:pause`
- `scenario:resume`
- `reveal:start` / `reveal:visibility-before` / `reveal:scroll-chain` / `reveal:plan`
- `reveal:step-start` / `reveal:step-update` / `reveal:step-end` / `reveal:replan`
- `reveal:settle-start` / `reveal:settle-end` / `reveal:visibility-after` / `reveal:complete`
- `stability:start` / `stability:mutation` / `stability:layout-sample`
- `stability:scroll-dirty` / `stability:stable-frame` / `stability:reset` / `stability:complete`
- `surface:scrolled`
- `wait:retry`
- `wait:start`
- `wait:success`
- `wait:timeout`

Event-specific `data` objects may gain additive fields, but existing fields for these events are kept stable.

### actorble.off

```ts
off(event: DebugEventName, listener: ActorbleListener<TraceEvent>): void
```

Removes a previously registered exact-name listener. Calling `off()` for an unknown listener is a no-op. `destroy()` removes facade-registered listeners so they are not called after teardown.

### actorble.destroy

```ts
destroy(): void
```

Stops scenario execution, disposes layout invalidation tracking, clears visual feedback, and destroys the visual layer.

## Locator helpers

Locator helpers create typed locator objects consumed by the facade, resolver, orchestrator, and scenario runner.

```ts
type Locator =
  | CssLocator
  | ElementLocator
  | RoleLocator
  | TextLocator
  | LabelLocator
  | TestIdLocator
  | PointLocator
```

### css

```ts
function css(selector: string, options?: { root?: ParentNode }): CssLocator
```

Creates a CSS selector locator. Use `root` to limit lookup to a parent node.

```ts
await actorble.click(css('button.primary'))
```

### element

```ts
function element(target: Element): ElementLocator
```

Wraps an existing DOM element as a locator.

### role

```ts
function role(
  roleName: string,
  options?: {
    name?: string | RegExp
    exact?: boolean
    includeHidden?: boolean
  },
): RoleLocator
```

Creates an accessibility role locator.

### text

```ts
function text(
  value: string | RegExp,
  options?: { exact?: boolean },
): TextLocator
```

Creates a text-content locator.

### label

```ts
function label(
  value: string | RegExp,
  options?: { exact?: boolean },
): LabelLocator
```

Creates a form-label locator.

### testId

```ts
function testId(
  value: string,
  options?: { attribute?: string },
): TestIdLocator
```

Creates a test id locator. The default attribute is resolved by the target resolver.

### point

```ts
function point(
  xOrPoint: number | Point,
  y?: number,
  options?: { coordinateSpace?: CoordinateSpace },
): PointLocator
```

Creates a point locator.

## Operation options

Most public methods accept operation options.

```ts
type OperationOptions = {
  timeout?: DurationMs
  signal?: CancellationSignalLike
}
```

### ResolveOptions

```ts
type ResolveOptions = OperationOptions & {
  strict?: boolean
}
```

### Pointer movement options

```ts
type PointerMovementOptions = {
  duration?: DurationMs
  motion?: PointerMotionProfile
}
```

```ts
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

### ClickOptions

```ts
type ClickOptions = OperationOptions & PointerMovementOptions & {
  button?: PointerButtonName
  clickCount?: number
  force?: boolean
  pressDwell?: DurationMs
}
```

`force` bypasses forceable interactability blockers but does not bypass unforceable blockers.

### TypeOptions

```ts
type TypeOptions = OperationOptions & {
  delay?: DurationMs
  focusStrategy?: 'programmatic' | 'click' | 'none'
  focusClick?: TypeFocusClickOptions
  afterFocusDelay?: DurationMs
}
```

Use `focusStrategy: 'none'` only when the target is already focused.

### Text selection contracts

```ts
type TextSelectionEndpoint = {
  target: TargetLike
  offset?: number
  point?: Point
}

type TextSelectionTarget =
  | TargetLike
  | {
      anchor: TextSelectionEndpoint
      focus: TextSelectionEndpoint
    }

type SelectTextOptions = OperationOptions & PointerMovementOptions
```

With default motion enabled, `selectText` dispatches a synthetic pointer/mouse
drag selection stream, moves the text cursor visual along the selected focus
caret, and progressively applies the selected range. Use `duration` or `motion`
to tune the gesture, or `duration: 0` / run-level `motion: false` for immediate
selection. Independent `pointerDown` and `pointerUp` scenario steps are not part
of the public scenario contract.

### Pointer sequence contracts

```ts
type PointerSequenceStep =
  | { type: 'move'; to: Point; duration?: DurationMs }
  | { type: 'down'; button?: PointerButtonName }
  | { type: 'up'; button?: PointerButtonName }
  | { type: 'pause'; duration: DurationMs }

type PointerSequence = readonly PointerSequenceStep[]

type PointerSequenceOptions = OperationOptions
```

## WaitCondition

```ts
type WaitCondition =
  | { kind: 'visible'; target: TargetLike }
  | { kind: 'hidden'; target: TargetLike }
  | { kind: 'attached'; target: TargetLike }
  | { kind: 'detached'; target: TargetLike }
  | { kind: 'enabled'; target: TargetLike }
  | { kind: 'disabled'; target: TargetLike }
  | { kind: 'focused'; target: TargetLike }
  | { kind: 'text'; value: string | RegExp; target?: TargetLike }
  | { kind: 'value'; target: TargetLike; value: string | RegExp }
  | { kind: 'attribute'; target: TargetLike; name: string; value: string | RegExp | null }
  | { kind: 'url'; value: string | RegExp }
  | { kind: 'stable'; target?: TargetLike; options?: StableWaitOptions }
  | { kind: 'all'; conditions: readonly WaitCondition[] }
  | { kind: 'any'; conditions: readonly WaitCondition[] }
  | { kind: 'custom'; predicate: () => boolean | Promise<boolean> }
```

`waitFor()` resolves when the condition is satisfied or rejects on timeout/cancellation.
Target-state helpers are exported for direct and scenario use:

```ts
await actorble.waitFor(attached(css('#save')))
await actorble.waitFor(enabled(css('#save')))
await actorble.waitFor(focused(css('#project-name')))
await actorble.waitFor(text('Saved'))
await actorble.waitFor(text('Saved', { target: css('#status') }))
await actorble.waitFor(value(css('#project-name'), 'Actorble'))
await actorble.waitFor(attribute(css('#panel'), 'data-state', 'ready'))
await actorble.waitFor(attribute(css('#panel'), 'aria-busy', null))
await actorble.waitFor(url('/projects/actorble'))
await actorble.waitFor(stable(css('#panel'), { quietMs: 80, stableFrames: 2, threshold: 0.5 }))
await actorble.waitFor(all(attached(css('#save')), enabled(css('#save'))))
await actorble.waitFor(any(text('Saved'), url('/projects/actorble')))
```

`detached` succeeds when the watched target leaves the configured root or its locator no longer
resolves. `enabled` and `disabled` follow the Interactability Engine's HTML, ARIA, and inert-state
semantics. `focused` reads the actual active element through supported open shadow roots.

Root-scoped `text()` preserves normalized substring matching. Target-scoped text strings match the
target's normalized text exactly. `value()` supports input, textarea, and select controls.
`attribute()` uses `null` for absence, so a missing attribute remains distinct from an empty value.
Value and attribute strings match exactly; all three conditions also accept `RegExp`.

URL strings must be root-relative paths or absolute URLs. Root-relative strings match
`pathname + search + hash`, absolute strings match normalized `location.href`, and regular
expressions test the full URL. Wait diagnostics expose structural match and length information only;
they do not retain matcher sources, observed content, locator text, or raw URL components.

`stable()` observes root mutation and scroll stability; when passed a target it also requires stable
target geometry and validity. It reuses the visual-stability observer and remains opt-in.
`all()` latches successful children and completes after every child succeeds. `any()` completes on
the first successful child and cancels all remaining branches. Nested composites share the outer
`waitFor()` timeout and cancellation signal. Timeout diagnostics report redacted summaries and index
paths for unfinished children. `all()` with no children succeeds immediately; `any()` with no children
waits until timeout or cancellation.

## Scenario

```ts
type Scenario = {
  id?: string
  name?: string
  steps: readonly ScenarioStep[]
}
```

```ts
type ScenarioStep =
  | { id?: string; action: 'click'; target: TargetLike; options?: Omit<ClickOptions, 'signal'> }
  | { id?: string; action: 'typeInto'; target: TargetLike; input: string; options?: Omit<TypeOptions, 'signal'> }
  | { id?: string; action: 'waitFor'; input: WaitCondition; options?: Omit<WaitOptions, 'signal'> }
  | { id?: string; action: 'delay'; duration: DurationMs; reason?: string }
```

Scenario step options omit `signal` because the runner owns cancellation for the active run.

## Reports

### CapabilityReport

```ts
type CapabilityReport = {
  pointerInput: 'none' | 'visual' | 'synthetic' | 'native'
  keyboardInput: 'none' | 'synthetic' | 'native'
  textInput: 'none' | 'set-value' | 'insert-text' | 'composition' | 'native'
  pseudoState: 'none' | 'mirror' | 'native'
  trustedEvents: boolean
  crossOriginFrame: boolean
  closedShadowRoot: boolean
  dragAndDrop: DragAndDropCapability
  textSelection: TextSelectionCapability
  pointerSequence: PointerSequenceCapability
  scrolling: 'none' | 'viewport' | 'nested-dom'
  reveal: 'none' | 'scroll-into-view' | 'planned'
  stability: 'none' | 'frame' | 'observed'
}
```

The in-page browser runtime reports `scrolling: 'nested-dom'`, `reveal: 'planned'`, and
`stability: 'observed'`. It cannot produce native trusted wheel input.

### FidelityReport

```ts
type FidelityReport = {
  pointerInput: InputFidelity
  keyboardInput: InputFidelity
  textInput: InputFidelity
  pseudoState: PseudoStateCapability
  visualOverlay: VisualOverlayFidelity
  trustedEvents: boolean
  limits: readonly string[]
}
```

## Error helpers

```ts
class ActorbleError extends Error {
  readonly code: ActorbleErrorCode
  readonly details?: ActorbleErrorDetails
}

function actorbleError(
  code: ActorbleErrorCode,
  message: string,
  options?: ActorbleErrorOptions,
): ActorbleError
```

`ActorbleErrorCode` currently includes `NOT_IMPLEMENTED`, `TARGET_NOT_FOUND`, `TARGET_AMBIGUOUS`, `TARGET_STALE`, `TARGET_DETACHED`, `ACTION_TIMEOUT`, `ACTION_CANCELLED`, `INTERACTABILITY_FAILED`, `TEXT_SELECTION_UNSUPPORTED`, `POINTER_SEQUENCE_INCOMPLETE`, and `PLATFORM_UNSUPPORTED`.
