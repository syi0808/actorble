import { BrowserDiagnosticsTrace } from '../../diagnostics/diagnostics-trace/index.js'
import { BrowserFocusEngine } from '../../input/focus-engine/index.js'
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js'
import { BrowserGestureEngine } from '../../input/gesture-engine/index.js'
import { BrowserInteractabilityEngine } from '../../targeting/interactability-engine/index.js'
import { BrowserInteractionStateStore } from '../../state/interaction-state-store/index.js'
import { BrowserPointerEngine } from '../../input/pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../../input/pointer-signals/index.js'
import {
  BrowserDomAdapter,
  BrowserEventDispatcher,
  BrowserStateApplier,
  BrowserStyleAdapter,
  type TextInputMutationPort,
} from '../../platform/platform-adapter/index.js'
import { BrowserPointerVisualTracker } from '../../visual/pointer-visual-tracker/index.js'
import { BrowserPseudoStateMirror } from '../../visual/pseudo-state-mirror/index.js'
import { BrowserSurfaceEngine } from '../../targeting/surface-engine/index.js'
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js'
import { BrowserTextInputEngine } from '../../input/text-input-engine/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import { NoopVisualLayer } from '../../visual/visual-layer/index.js'
import { BrowserWaitObservationEngine } from '../wait-observation-engine/index.js'
import {
  ActorbleError,
  actorbleError,
  element as elementLocator,
  resolveVisualFeedbackOptions,
} from '../../shared/index.js'
import type { SpanRecorder, TraceSpanHandle } from '../../diagnostics/diagnostics-trace/index.js'
import type { FocusEngine } from '../../input/focus-engine/index.js'
import type {
  CancellationOptions,
  ClickCurrentOptions,
  ClickOptions,
  DomPort,
  EventDispatchPort,
  ActorblePointerOptions,
  DragOptions,
  FillOptions,
  FocusOptions,
  Locator,
  MoveOptions,
  OperationOptions,
  PressOptions,
  Point,
  PointerMotionProfile,
  PointerButtonName,
  ScrollOptions,
  ScrollPosition,
  ResolvedVisualFeedbackOptions,
  StateApplyPort,
  StateEffect,
  TargetDebugInfo,
  TargetHandle,
  TargetLike,
  TypeOptions,
  VisualFeedbackOptions,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../../targeting/geometry-engine/index.js'
import type { GestureEngine } from '../../input/gesture-engine/index.js'
import type { InteractabilityEngine, InteractabilityReport } from '../../targeting/interactability-engine/index.js'
import type {
  InteractionStateDiff,
  InteractionStateStore,
} from '../../state/interaction-state-store/index.js'
import type { LayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import type { PointerVisualTracker } from '../../visual/pointer-visual-tracker/index.js'
import type { PointerSignal, PointerSignalBus } from '../../input/pointer-signals/index.js'
import type { SurfaceEngine } from '../../targeting/surface-engine/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type { TextInputEngine } from '../../input/text-input-engine/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'
import type { VisualLayer } from '../../visual/visual-layer/index.js'
import type { WaitObservationEngine, WaitResult } from '../wait-observation-engine/index.js'

export type ActionName =
  | 'moveTo'
  | 'click'
  | 'clickCurrent'
  | 'doubleClick'
  | 'focus'
  | 'type'
  | 'typeInto'
  | 'fill'
  | 'press'
  | 'scrollTo'
  | 'drag'
  | 'waitFor'

export type ActionTransaction = Readonly<{
  name: ActionName
  target?: TargetLike
  startedAt: number
}>

export interface ActionOrchestrator {
  moveTo(target: TargetLike, options?: MoveOptions): Promise<void>
  click(target: TargetLike, options?: ClickOptions): Promise<void>
  clickCurrent(options?: ClickCurrentOptions): Promise<void>
  doubleClick(target: TargetLike, options?: ClickOptions): Promise<void>
  focus(target: TargetLike, options?: FocusOptions): Promise<void>
  type(text: string, options?: TypeOptions): Promise<void>
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<void>
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<void>
  press(keys: string, options?: PressOptions): Promise<void>
  scrollTo(targetOrPosition: TargetLike | ScrollPosition, options?: ScrollOptions): Promise<void>
  drag(from: TargetLike, to: TargetLike, options?: DragOptions): Promise<void>
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>
  geometry(target: TargetLike): Promise<GeometrySnapshot>
}

export type ActionOrchestratorOptions = Readonly<{
  dom?: DomPort
  events?: EventDispatchPort & Partial<TextInputMutationPort>
  focus?: FocusEngine
  geometry?: GeometryEngine
  gesture?: GestureEngine
  interactability?: InteractabilityEngine
  resolver?: TargetResolver
  signals?: PointerSignalBus
  state?: StateApplyPort
  store?: InteractionStateStore
  surface?: SurfaceEngine
  text?: TextInputEngine
  layoutInvalidation?: LayoutInvalidationTracker
  timeline?: TimelineEngine
  trace?: SpanRecorder
  visual?: VisualLayer
  visualFeedback?: VisualFeedbackOptions
  pointer?: ActorblePointerOptions
  pointerVisual?: PointerVisualTracker
  wait?: WaitObservationEngine
}>

type ActionPhase =
  | 'resolve'
  | 'validate'
  | 'ensureVisible'
  | 'geometry'
  | 'preflight'
  | 'perform'
  | 'wait'
  | 'cleanup'

type ClickDispatchState = {
  button: PointerButtonName
  downAllowed: boolean
  upAllowed: boolean
  downSeen: boolean
  upSeen: boolean
}

type CursorVisualState = {
  target: TargetHandle
  point: Point
  cursor?: string
  pressed: boolean
}

type PointerHitSnapshot = {
  target: TargetHandle | null
  hoverChain: readonly TargetHandle[]
}

type PointerSignalContext = {
  target: TargetHandle
  commandId: number
}

type UnsupportedPublicAction =
  | 'clickCurrent'
  | 'doubleClick'
  | 'focus'
  | 'type'
  | 'fill'
  | 'press'
  | 'scrollTo'
  | 'drag'

const DEFAULT_PUBLIC_POINTER_MOTION: PointerMotionProfile = {
  kind: 'ease',
  easing: 'ease-in-out',
  duration: 250,
}
const DEFAULT_PUBLIC_TYPING_DELAY = 60
const emptyPointerHit: PointerHitSnapshot = {
  target: null,
  hoverChain: [],
}
const unsupportedPublicActionLimits = {
  clickCurrent: {
    capability: 'current-pointer-target',
    limit: 'clickCurrent requires a current pointer target policy that is not implemented yet.',
  },
  doubleClick: {
    capability: 'multi-click-gesture',
    limit: 'doubleClick requires a multi-click gesture sequence that is not implemented yet.',
  },
  focus: {
    capability: 'focus-action',
    limit: 'focus requires the public focus action lifecycle that is not implemented yet.',
  },
  type: {
    capability: 'current-focus-text-input',
    limit: 'type requires current focused editable target handling that is not implemented yet.',
  },
  fill: {
    capability: 'target-value-replacement',
    limit: 'fill requires target value replacement orchestration that is not implemented yet.',
  },
  press: {
    capability: 'keyboard-action',
    limit: 'press requires public keyboard action orchestration that is not implemented yet.',
  },
  scrollTo: {
    capability: 'public-scroll-action',
    limit: 'scrollTo requires public scroll target and position orchestration that is not implemented yet.',
  },
  drag: {
    capability: 'drag-and-drop',
    limit: 'drag requires synthetic pointer drag orchestration that is not implemented yet.',
  },
} satisfies Record<UnsupportedPublicAction, Readonly<{ capability: string; limit: string }>>

export class BrowserActionOrchestrator implements ActionOrchestrator {
  readonly #dom: DomPort
  readonly #events: EventDispatchPort
  readonly #focus: FocusEngine
  readonly #geometry: GeometryEngine
  readonly #gesture: GestureEngine
  readonly #interactability: InteractabilityEngine
  readonly #resolver: TargetResolver
  readonly #state: StateApplyPort
  readonly #store: InteractionStateStore
  readonly #surface: SurfaceEngine
  readonly #text: TextInputEngine
  readonly #timeline: TimelineEngine
  readonly #trace: SpanRecorder
  readonly #visual: VisualLayer
  readonly #visualFeedback: ResolvedVisualFeedbackOptions
  readonly #pointerVisual: PointerVisualTracker
  readonly #wait: WaitObservationEngine
  #signalContext: PointerSignalContext | null = null
  #clickDispatchState: ClickDispatchState | null = null
  readonly #cursorPressedButtons = new Set<PointerButtonName>()
  #cursorVisualState: CursorVisualState | null = null
  #nextPointerCommandId = 1
  #nextPointerHitTargetId = 1
  readonly #pointerHitTargets = new WeakMap<Element, TargetHandle>()

  constructor(options: ActionOrchestratorOptions = {}) {
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const dom = options.dom ?? new BrowserDomAdapter()
    const timeline = options.timeline ?? new BrowserTimelineEngine()
    const store = options.store ?? new BrowserInteractionStateStore()
    const events = options.events ?? new BrowserEventDispatcher()
    const state =
      options.state ??
      new BrowserPseudoStateMirror({
        state: new BrowserStateApplier(),
        style: new BrowserStyleAdapter(dom.getRoot()),
        trace,
      })
    const signals = options.signals ?? new BrowserPointerSignalBus()
    const surface = options.surface ?? new BrowserSurfaceEngine({ dom })
    const geometry =
      options.geometry ?? new BrowserGeometryEngine({ dom, surface, clock: timeline })
    const focus = options.focus ?? new BrowserFocusEngine({ dom, store })

    this.#dom = dom
    this.#trace = trace
    this.#events = events
    this.#focus = focus
    this.#geometry = geometry
    this.#gesture =
      options.gesture ??
      new BrowserGestureEngine({
        pointer: new BrowserPointerEngine({
          signals,
          timeline,
          initialPosition: options.pointer?.initialPosition,
        }),
        timeline,
      })
    this.#interactability =
      options.interactability ?? new BrowserInteractabilityEngine({ dom, geometry })
    this.#resolver = options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline })
    this.#state = state
    this.#store = store
    this.#surface = surface
    this.#timeline = timeline
    this.#visual = options.visual ?? new NoopVisualLayer()
    this.#visualFeedback =
      options.visualFeedback === undefined
        ? resolveVisualFeedbackOptions(undefined, { enabled: true, preset: 'debug' })
        : resolveVisualFeedbackOptions({
            enabled: true,
            preset: 'quiet',
            ...options.visualFeedback,
          })
    this.#pointerVisual =
      options.pointerVisual ??
      new BrowserPointerVisualTracker({
        geometry,
        layoutInvalidation: options.layoutInvalidation,
        trace,
        onUpdate: (update) => {
          this.#renderPointerCursor(update.point, update.target, update.pressed)
        },
        onStale: () => {
          this.#cursorPressedButtons.clear()
          this.#cursorVisualState = null
          if (this.#visualFeedback.enabled && this.#visualFeedback.cursor) {
            this.#tryVisual('hide', () => this.#visual.hide())
          }
        },
      })
    this.#text =
      options.text ??
      new BrowserTextInputEngine({
        focus,
        events,
        store,
        dom,
        timeline,
        onKeystroke: (event) => {
          if (!this.#visualFeedback.enabled || !this.#visualFeedback.keystrokeOverlay) {
            return
          }

          this.#tryVisual('showKeystroke', () =>
            this.#visual.showKeystroke({
              target: event.target,
              text: event.text,
              textVisibility: this.#visualFeedback.textVisibility,
            }),
          )
        },
      })
    this.#wait =
      options.wait ??
      new BrowserWaitObservationEngine({
        dom,
        layoutInvalidation: options.layoutInvalidation,
        timeline,
        trace,
      })

    signals.subscribe((signal) => {
      this.#applyPointerSignal(signal)
    })
    store.subscribe((diff) => {
      this.#applyInteractionStateEffects(diff.effects)
    })
  }

  async moveTo(target: TargetLike, options: MoveOptions = {}): Promise<void> {
    const span = this.#startActionSpan('moveTo', target, options)
    let phase: ActionPhase = 'resolve'
    let handle: TargetHandle | undefined

    try {
      handle = await this.#resolveTarget(target, options)
      phase = 'ensureVisible'
      await this.#surface.ensureVisible(handle, options)
      phase = 'geometry'
      const snapshot = await this.#geometry.snapshot(handle)
      const point = clickablePointOrThrow('moveTo', handle, snapshot)
      this.#showTargetHighlight(handle, snapshot)

      phase = 'perform'
      const commandId = this.#createPointerCommandId()
      await this.#withSignalTarget(handle, commandId, () =>
        this.#gesture.hover(point, publicPointerMovementOptions(options)),
      )
      phase = 'wait'
      await this.#wait.settle('settled', operationOptions(options))

      span.end({
        action: 'moveTo',
        completed: true,
        targetId: handle.id,
        output: { point },
      })
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action: 'moveTo',
        phase,
        targetId: handle?.id,
      })
    } finally {
      this.#clearPointerContext()
    }
  }

  async click(target: TargetLike, options: ClickOptions = {}): Promise<void> {
    const span = this.#startActionSpan('click', target, options)
    let phase: ActionPhase = 'resolve'
    let handle: TargetHandle | undefined
    let performStarted = false

    this.#clickDispatchState = createClickDispatchState(options)

    try {
      handle = await this.#resolveTarget(target, options)
      phase = 'ensureVisible'
      await this.#surface.ensureVisible(handle, options)
      phase = 'geometry'
      const snapshot = await this.#geometry.snapshot(handle)
      const point = clickablePointOrThrow('click', handle, snapshot)
      this.#showTargetHighlight(handle, snapshot)

      phase = 'preflight'
      const report = await this.#interactability.canClick(handle, snapshot, options)
      assertCanClick(handle, report)
      this.#warnForceBypass(handle, report)

      phase = 'perform'
      performStarted = true
      const clickTarget = handle
      let dispatchPoint = point
      const commandId = this.#createPointerCommandId()
      const result = await this.#withSignalTarget(clickTarget, commandId, () =>
        this.#gesture.click(clickTarget, point, {
          ...publicPointerMovementOptions(options),
          refreshPointBeforeDown: async () => {
            dispatchPoint = await this.#refreshClickPointBeforeDown(
              'click',
              clickTarget,
              point,
              options,
              span,
            )
            return dispatchPoint
          },
        }),
      )
      const activationDispatched = this.#dispatchActivationClick(clickTarget, dispatchPoint)
      this.#showClickFeedback(dispatchPoint)

      phase = 'wait'
      await this.#wait.settle('settled', operationOptions(options))

      span.end({
        action: 'click',
        completed: true,
        targetId: handle.id,
        output: {
          point: dispatchPoint,
          gestureCompleted: result.completed,
          activationDispatched,
        },
      })
    } catch (error) {
      const failurePhase = phase

      if (performStarted) {
        phase = 'cleanup'
        await this.#cleanupFailedPerform(span)
      } else {
        this.#clearVisualFeedback()
      }

      throw this.#finishActionFailure(span, error, {
        action: 'click',
        phase: failurePhase,
        targetId: handle?.id,
      })
    } finally {
      this.#clickDispatchState = null
      this.#clearPointerContext()
    }
  }

  async clickCurrent(): Promise<void> {
    throw unsupportedPublicAction('clickCurrent')
  }

  async doubleClick(): Promise<void> {
    throw unsupportedPublicAction('doubleClick')
  }

  async focus(): Promise<void> {
    throw unsupportedPublicAction('focus')
  }

  async type(): Promise<void> {
    throw unsupportedPublicAction('type')
  }

  async typeInto(
    target: TargetLike,
    text: string,
    options: TypeOptions = {},
  ): Promise<void> {
    const span = this.#startActionSpan('typeInto', target, {
      ...options,
      textLength: Array.from(text).length,
    })
    let phase: ActionPhase = 'resolve'
    let handle: TargetHandle | undefined
    let clickFocusNeedsCleanup = false

    try {
      handle = await this.#resolveTarget(target, options)
      phase = 'ensureVisible'
      await this.#surface.ensureVisible(handle, options)
      phase = 'geometry'
      const snapshot = await this.#geometry.snapshot(handle)
      this.#showTargetHighlight(handle, snapshot)
      phase = 'preflight'
      const report = await this.#interactability.canType(handle)
      assertCanType(handle, report)

      phase = 'perform'
      const typeTarget = handle
      const focusStrategy = typeFocusStrategy(options)
      let clickFocusOutput: object = {}

      if (focusStrategy === 'click') {
        const point = clickablePointOrThrow('typeInto', typeTarget, snapshot)
        const clickOptions = typeFocusClickOptions(options)
        let dispatchPoint = point

        this.#clickDispatchState = createClickDispatchState(clickOptions)
        clickFocusNeedsCleanup = true

        const commandId = this.#createPointerCommandId()
        const result = await this.#withSignalTarget(typeTarget, commandId, () =>
          this.#gesture.click(typeTarget, point, {
            ...publicPointerMovementOptions(clickOptions),
            refreshPointBeforeDown: async () => {
              dispatchPoint = await this.#refreshClickPointBeforeDown(
                'typeInto',
                typeTarget,
                point,
                clickOptions,
                span,
              )
              return dispatchPoint
            },
          }),
        )

        clickFocusNeedsCleanup = false

        const activationDispatched = this.#dispatchActivationClick(typeTarget, dispatchPoint)

        this.#showClickFeedback(dispatchPoint)

        const focused = await this.#focus.getFocused()
        const focusedTarget = this.#assertClickFocusAcquired(typeTarget, focused.active)

        await this.#delayAfterClickFocus(options)

        clickFocusOutput = {
          focusPoint: dispatchPoint,
          focusedTargetId: focusedTarget.id,
          gestureCompleted: result.completed,
          activationDispatched,
        }
      }

      this.#showTypingFeedback(typeTarget, true)
      try {
        await this.#text.typeInto(
          typeTarget,
          text,
          typeOptions(options, textFocusStrategyFor(focusStrategy)),
        )
      } finally {
        this.#showTypingFeedback(typeTarget, false)
      }
      phase = 'wait'
      await this.#wait.settle('settled', operationOptions(options))

      span.end({
        action: 'typeInto',
        completed: true,
        targetId: handle.id,
        output: {
          textLength: Array.from(text).length,
          focusStrategy,
          ...clickFocusOutput,
        },
      })
    } catch (error) {
      const failurePhase = phase

      if (clickFocusNeedsCleanup) {
        await this.#cleanupFailedPerform(span, 'typeInto')
      } else {
        this.#clearVisualFeedback()
      }
      throw this.#finishActionFailure(span, error, {
        action: 'typeInto',
        phase: failurePhase,
        targetId: handle?.id,
      })
    } finally {
      this.#clickDispatchState = null
      this.#clearPointerContext()
    }
  }

  async fill(): Promise<void> {
    throw unsupportedPublicAction('fill')
  }

  async press(): Promise<void> {
    throw unsupportedPublicAction('press')
  }

  async scrollTo(): Promise<void> {
    throw unsupportedPublicAction('scrollTo')
  }

  async drag(): Promise<void> {
    throw unsupportedPublicAction('drag')
  }

  async waitFor(
    condition: WaitCondition,
    options: WaitOptions = {},
  ): Promise<WaitResult> {
    const span = this.#startActionSpan('waitFor', undefined, {
      conditionKind: condition.kind,
      ...options,
    })
    const phase: ActionPhase = 'wait'

    try {
      const result = await this.#wait.waitFor(condition, operationOptions(options))

      span.end({
        action: 'waitFor',
        completed: true,
        output: {
          conditionKind: condition.kind,
          satisfied: result.satisfied,
          strategy: result.strategy,
        },
      })

      return result
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action: 'waitFor',
        phase,
      })
    }
  }

  geometry(target: TargetLike): Promise<GeometrySnapshot> {
    return this.#geometry.snapshot(target)
  }

  #startActionSpan(
    action: ActionName,
    target: TargetLike | undefined,
    input: object,
  ): TraceSpanHandle {
    return this.#trace.startSpan(`action.${action}`, {
      action,
      input: {
        target: target === undefined ? undefined : summarizeTarget(target),
        options: summarizeOptions(input),
      },
    })
  }

  async #resolveTarget(target: TargetLike, options: OperationOptions): Promise<TargetHandle> {
    const resolved = isTargetHandle(target)
      ? target
      : await this.#resolver.resolve(toLocator(target), operationOptions(options))

    return this.#resolver.validate(resolved)
  }

  #createPointerCommandId(): number {
    const commandId = this.#nextPointerCommandId

    this.#nextPointerCommandId += 1

    return commandId
  }

  async #withSignalTarget<TValue>(
    target: TargetHandle,
    commandId: number,
    operation: () => Promise<TValue>,
  ): Promise<TValue> {
    const previousContext = this.#signalContext

    this.#signalContext = { target, commandId }

    try {
      return await operation()
    } finally {
      this.#signalContext = previousContext
    }
  }

  async #refreshClickPointBeforeDown(
    action: Extract<ActionName, 'click' | 'typeInto'>,
    target: TargetHandle,
    initialPoint: Point,
    options: ClickOptions,
    span: TraceSpanHandle,
  ): Promise<Point> {
    const snapshot = await this.#geometry.snapshot(target)
    const freshPoint = clickablePointOrThrow(action, target, snapshot)

    span.event('pointer:fresh-geometry', {
      action,
      targetId: target.id,
      initialPoint,
      freshPoint,
      changed: !samePoint(initialPoint, freshPoint),
      computedAt: snapshot.computedAt,
    })

    const report = await this.#interactability.canClick(target, snapshot, options)
    assertCanClick(target, report)
    this.#warnForceBypass(target, report)

    return freshPoint
  }

  #applyPointerSignal(signal: PointerSignal): void {
    const context = this.#signalContext
    const target = context?.target ?? null
    const pointerHit =
      signal.type === 'pointer:cancelled'
        ? emptyPointerHit
        : this.#resolvePointerHit(signal.point, target)
    const diff = this.#dispatchPointerInteractionState(signal, target, pointerHit)

    this.#state.applyStateEffects(diff.effects)

    if (signal.type === 'pointer:cancelled') {
      this.#cursorPressedButtons.clear()
      this.#restorePressedCursorVisual()
      this.#clearPointerVisualMode()
      return
    }

    if (!context || !target) {
      return
    }

    switch (signal.type) {
      case 'pointer:moved':
        this.#showPointerCursor(
          signal.point,
          target,
          false,
          context.commandId,
          pointerHit.target ?? target,
        )
        this.#events.dispatchPointerEvent({
          type: 'pointermove',
          target: target.element,
          point: signal.point,
          buttons: [],
        })
        break
      case 'pointer:down': {
        this.#cursorPressedButtons.add(signal.button)
        this.#showPointerCursor(
          signal.point,
          target,
          this.#hasPressedCursorButtons(),
          context.commandId,
          pointerHit.target ?? target,
        )
        const allowed = this.#events.dispatchPointerEvent({
          type: 'pointerdown',
          target: target.element,
          point: signal.point,
          button: signal.button,
          buttons: [signal.button],
        })

        if (this.#clickDispatchState) {
          this.#clickDispatchState.button = signal.button
          this.#clickDispatchState.downSeen = true
          this.#clickDispatchState.downAllowed &&= allowed
        }

        break
      }
      case 'pointer:up': {
        this.#cursorPressedButtons.delete(signal.button)
        this.#showPointerCursor(
          signal.point,
          target,
          this.#hasPressedCursorButtons(),
          context.commandId,
          pointerHit.target ?? target,
        )
        const allowed = this.#events.dispatchPointerEvent({
          type: 'pointerup',
          target: target.element,
          point: signal.point,
          button: signal.button,
          buttons: [],
        })

        if (this.#clickDispatchState) {
          this.#clickDispatchState.button = signal.button
          this.#clickDispatchState.upSeen = true
          this.#clickDispatchState.upAllowed &&= allowed
        }

        break
      }
    }
  }

  #dispatchPointerInteractionState(
    signal: PointerSignal,
    target: TargetHandle | null,
    pointerHit: PointerHitSnapshot,
  ): InteractionStateDiff {
    if (signal.type === 'pointer:moved') {
      return this.#store.dispatch({ ...signal, hoverChain: pointerHit.hoverChain })
    }

    if (target && signal.type !== 'pointer:cancelled') {
      return this.#store.dispatch({ ...signal, hitTarget: target })
    }

    return this.#store.applyPointerSignal(signal)
  }

  #resolvePointerHit(point: Point, preferredTarget: TargetHandle | null): PointerHitSnapshot {
    try {
      const element = this.#dom.elementFromPoint(point, { ignoreActorbleInternal: true })

      if (!element || !this.#isPointerHitElementInScope(element)) {
        return emptyPointerHit
      }

      const hoverChain = this.#hoverChainFor(element, preferredTarget)

      return {
        target: hoverChain[0] ?? null,
        hoverChain,
      }
    } catch (error) {
      this.#trace.warn('Pointer hit-test failed.', {
        point,
        error: describeUnknownError(error),
      })

      return emptyPointerHit
    }
  }

  #hoverChainFor(
    element: Element,
    preferredTarget: TargetHandle | null,
  ): readonly TargetHandle[] {
    const hoverChain: TargetHandle[] = []
    const visited = new Set<Element>()
    let current: Element | null = element

    while (current && !visited.has(current)) {
      visited.add(current)

      if (!this.#isPointerHitElementInScope(current)) {
        break
      }

      if (current !== element && this.#isDocumentShellElement(current)) {
        break
      }

      hoverChain.push(this.#targetForPointerHitElement(current, preferredTarget))
      current = this.#dom.getParentElement(current)
    }

    return hoverChain
  }

  #targetForPointerHitElement(
    element: Element,
    preferredTarget: TargetHandle | null,
  ): TargetHandle {
    if (preferredTarget?.element === element) {
      return preferredTarget
    }

    const cached = this.#pointerHitTargets.get(element)

    if (cached) {
      return cached
    }

    const target: TargetHandle = {
      id: `pointer-hit-${this.#nextPointerHitTargetId++}`,
      element,
      locator: elementLocator(element),
      resolvedAt: this.#timeline.now(),
      root: this.#dom.getRoot(),
      validity: 'live',
      debug: this.#dom.describeElement(element),
    }

    this.#pointerHitTargets.set(element, target)

    return target
  }

  #isPointerHitElementInScope(element: Element): boolean {
    return this.#dom.isConnected(element) && this.#dom.contains(this.#dom.getRoot(), element)
  }

  #isDocumentShellElement(element: Element): boolean {
    const parent = this.#dom.getParentElement(element)

    if (!parent) {
      return false
    }

    return this.#dom.getParentElement(parent) === null
  }

  #dispatchActivationClick(target: TargetHandle, point: Point): boolean {
    const dispatchState = this.#clickDispatchState

    if (
      !dispatchState ||
      !dispatchState.downSeen ||
      !dispatchState.upSeen ||
      !dispatchState.downAllowed ||
      !dispatchState.upAllowed
    ) {
      return false
    }

    this.#events.dispatchMouseEvent({
      type: 'click',
      target: target.element,
      point,
      button: dispatchState.button,
      buttons: [],
      detail: 1,
    })

    return true
  }

  async #cleanupFailedPerform(
    span: TraceSpanHandle,
    action: ActionName = 'click',
  ): Promise<void> {
    try {
      await this.#gesture.cancel()
    } catch (error) {
      this.#trace.warn('Action gesture cleanup failed.', {
        action,
        error: describeUnknownError(error),
      })
    }

    try {
      const diff = this.#store.reset()
      this.#state.applyStateEffects(diff.effects)
      this.#state.cleanup()
    } catch (error) {
      span.event('action:cleanup-failed', { error: describeUnknownError(error) })
      this.#trace.warn('Action state cleanup failed.', {
        action,
        error: describeUnknownError(error),
      })
    }

    this.#cursorPressedButtons.clear()
    this.#restorePressedCursorVisual()
    this.#clearPointerVisualMode()
    this.#clearVisualFeedback()
  }

  #finishActionFailure(
    span: TraceSpanHandle,
    error: unknown,
    context: Readonly<{
      action: ActionName
      phase: ActionPhase
      targetId?: string
    }>,
  ): ActorbleError {
    const normalized = normalizeActionError(error, context)

    span.event('action:failure', {
      ...context,
      code: normalized.code,
      details: normalized.details,
    })

    if (normalized.code === 'ACTION_CANCELLED') {
      span.cancel(normalized.details?.reason)
      return normalized
    }

    span.error(normalized, context)
    return normalized
  }

  #warnForceBypass(target: TargetHandle, report: InteractabilityReport): void {
    if (report.forceBypassedReasons.length === 0) {
      return
    }

    this.#trace.warn('Click force bypassed interactability blockers.', {
      targetId: target.id,
      reasons: report.forceBypassedReasons,
    })
  }

  #assertClickFocusAcquired(
    target: TargetHandle,
    focusedTarget: TargetHandle | null,
  ): TargetHandle {
    if (focusedTarget && this.#isFocusedTargetForTyping(target, focusedTarget)) {
      return focusedTarget
    }

    throw actorbleError(
      'INTERACTABILITY_FAILED',
      'typeInto click focus did not focus the target.',
      {
        details: {
          action: 'typeInto',
          focusStrategy: 'click',
          targetId: target.id,
          focusedTargetId: focusedTarget?.id,
          focusedDescription: focusedTarget?.debug.description,
        },
      },
    )
  }

  #isFocusedTargetForTyping(target: TargetHandle, focusedTarget: TargetHandle): boolean {
    if (focusedTarget.element === target.element) {
      return true
    }

    try {
      return (
        this.#dom.contains(target.element, focusedTarget.element) ||
        this.#dom.contains(focusedTarget.element, target.element)
      )
    } catch (error) {
      this.#trace.warn('Focus target containment check failed.', {
        targetId: target.id,
        focusedTargetId: focusedTarget.id,
        error: describeUnknownError(error),
      })

      return false
    }
  }

  async #delayAfterClickFocus(options: TypeOptions): Promise<void> {
    const delay = options.afterFocusDelay

    if (delay === undefined || !Number.isFinite(delay) || delay <= 0) {
      return
    }

    await this.#timeline.delay(delay, cancellationOptions(options))
  }

  #showTargetHighlight(target: TargetHandle, geometry: GeometrySnapshot): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.targetHighlight) {
      return
    }

    this.#tryVisual('highlightTarget', () =>
      this.#visual.highlightTarget({
        target,
        rect: geometry.rect,
      }),
    )
  }

  #showPointerCursor(
    point: Point,
    target: TargetHandle,
    pressed = this.#hasPressedCursorButtons(),
    commandId?: number,
    cursorTarget: TargetHandle = target,
  ): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.cursor) {
      return
    }

    const visualPoint = this.#renderPointerCursor(point, cursorTarget, pressed)

    if (commandId === undefined) {
      this.#setPointerVisualMode({
        kind: 'freePoint',
        point: visualPoint,
        pressed,
      })
      return
    }

    this.#setPointerVisualMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId,
      pressed,
      lastPoint: visualPoint,
    })
  }

  #renderPointerCursor(
    point: Point,
    target: TargetHandle,
    pressed = this.#hasPressedCursorButtons(),
  ): Point {
    const cursor = this.#resolveCursor(target)
    const visualPoint = { x: point.x, y: point.y }

    this.#tryVisual('showCursor', () =>
      this.#visual.showCursor(
        cursor === undefined
          ? { point: visualPoint, pressed }
          : { point: visualPoint, cursor, pressed },
      ),
    )
    this.#cursorVisualState = {
      target,
      point: visualPoint,
      ...(cursor === undefined ? {} : { cursor }),
      pressed,
    }

    return visualPoint
  }

  #restorePressedCursorVisual(): void {
    const state = this.#cursorVisualState

    if (!state?.pressed) {
      return
    }

    this.#renderPointerCursor(state.point, state.target, false)
  }

  #hasPressedCursorButtons(): boolean {
    return this.#cursorPressedButtons.size > 0
  }

  #resolveCursor(target: TargetHandle): string | undefined {
    try {
      return resolveCursorForTarget(this.#dom, target.element)
    } catch (error) {
      this.#trace.warn('Cursor style resolution failed.', {
        targetId: target.id,
        error: describeUnknownError(error),
      })

      return undefined
    }
  }

  #applyInteractionStateEffects(effects: readonly StateEffect[]): void {
    const effectsToApply = effects.filter(isFocusOrTypingStateEffect)

    if (effectsToApply.length === 0) {
      return
    }

    this.#state.applyStateEffects(effectsToApply)
    this.#applyVisualStateEffects(effectsToApply)
  }

  #applyVisualStateEffects(effects: readonly StateEffect[]): void {
    if (!this.#visualFeedback.enabled) {
      return
    }

    const focusEffects = effects.filter((effect) => effect.kind === 'focus')

    for (const effect of effects) {
      switch (effect.kind) {
        case 'focus':
        case 'focus-visible':
          if (!this.#visualFeedback.focusOverlay) {
            break
          }

          if (
            effect.kind === 'focus-visible' &&
            focusEffects.some(
              (focusEffect) =>
                focusEffect.active === effect.active &&
                focusEffect.target?.id === effect.target?.id,
            )
          ) {
            break
          }

          this.#tryVisual('showFocus', () =>
            this.#visual.showFocus({
              target: effect.target,
              active: effect.active,
            }),
          )
          break
        case 'typing':
          {
            if (!this.#visualFeedback.typingIndicator) {
              break
            }

            const target = effect.target

            if (!target) {
              break
            }

            this.#tryVisual('showTyping', () =>
              this.#visual.showTyping({
                target,
                active: effect.active,
              }),
            )
          }
          break
      }
    }
  }

  #showClickFeedback(point: Point): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.clickFeedback) {
      return
    }

    this.#tryVisual('showClick', () => this.#visual.showClick(point))
  }

  #showTypingFeedback(target: TargetHandle, active: boolean): void {
    if (!this.#visualFeedback.enabled || !this.#visualFeedback.typingIndicator) {
      return
    }

    this.#tryVisual('showTyping', () =>
      this.#visual.showTyping({
        target,
        active,
      }),
    )
  }

  #clearVisualFeedback(): void {
    if (!this.#visualFeedback.enabled) {
      return
    }

    this.#tryVisual('clearFeedback', () => this.#visual.clearFeedback())
  }

  #tryVisual(effect: string, operation: () => void): void {
    try {
      operation()
    } catch (error) {
      this.#trace.warn('Visual layer update failed.', {
        effect,
        error: describeUnknownError(error),
      })
    }
  }

  #setPointerVisualMode(mode: Parameters<PointerVisualTracker['setMode']>[0]): void {
    try {
      this.#pointerVisual.setMode(mode)
    } catch (error) {
      this.#trace.warn('Pointer visual tracker update failed.', {
        mode: mode.kind,
        error: describeUnknownError(error),
      })
    }
  }

  #clearPointerVisualMode(): void {
    try {
      this.#pointerVisual.clear()
    } catch (error) {
      this.#trace.warn('Pointer visual tracker cleanup failed.', {
        error: describeUnknownError(error),
      })
    }
  }

  #clearPointerContext(): void {
    this.#signalContext = null
  }
}

export function createActionOrchestrator(
  options: ActionOrchestratorOptions = {},
): ActionOrchestrator {
  return new BrowserActionOrchestrator(options)
}

function createClickDispatchState(options: ClickOptions): ClickDispatchState {
  return {
    button: options.button ?? 'primary',
    downAllowed: true,
    upAllowed: true,
    downSeen: false,
    upSeen: false,
  }
}

function publicPointerMovementOptions<TOptions extends MoveOptions | ClickOptions>(
  options: TOptions,
): TOptions {
  if (options.duration !== undefined || options.motion !== undefined) {
    return options
  }

  return {
    ...options,
    motion: DEFAULT_PUBLIC_POINTER_MOTION,
  }
}

function resolveCursorForTarget(dom: DomPort, element: Element): string | undefined {
  return resolveCursorFromAncestors(dom, element) ?? semanticCursorFallback(dom, element)
}

function resolveCursorFromAncestors(dom: DomPort, element: Element): string | undefined {
  let current: Element | null = element
  const visited = new Set<Element>()

  while (current && !visited.has(current)) {
    visited.add(current)
    const cursor = normalizeCursorValue(dom.getComputedStyle(current).cursor)

    if (cursor && !isIndirectCursorValue(cursor)) {
      return cursor
    }

    current = dom.getParentElement(current)
  }

  return undefined
}

function semanticCursorFallback(dom: DomPort, element: Element): string | undefined {
  return isEditableTextTarget(dom.describeElement(element)) ? 'text' : undefined
}

function normalizeCursorValue(cursor: string): string | undefined {
  const normalized = cursor.trim()

  return normalized ? normalized : undefined
}

function isIndirectCursorValue(cursor: string): boolean {
  const normalized = cursor.toLowerCase()

  return indirectCursorValues.has(normalized)
}

const indirectCursorValues = new Set([
  'auto',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
])

type CursorAttributeMap = Readonly<Record<string, string>>

const textCursorEditableInputTypes = new Set([
  '',
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

function isEditableTextTarget(debug: TargetDebugInfo): boolean {
  const attributes = normalizeCursorAttributes(debug.attributes)

  if (
    hasCursorAttribute(attributes, 'disabled') ||
    attributes['aria-disabled'] === 'true' ||
    hasCursorAttribute(attributes, 'inert') ||
    hasCursorAttribute(attributes, 'readonly')
  ) {
    return false
  }

  if (hasCursorAttribute(attributes, 'contenteditable')) {
    return attributes.contenteditable !== 'false'
  }

  const tagName = cursorTagNameFor(debug)

  if (tagName === 'textarea') {
    return true
  }

  if (tagName !== 'input') {
    return false
  }

  return textCursorEditableInputTypes.has((attributes.type ?? '').toLowerCase())
}

function normalizeCursorAttributes(
  attributes: TargetDebugInfo['attributes'],
): CursorAttributeMap {
  if (!attributes) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [name.toLowerCase(), value]),
  )
}

function hasCursorAttribute(attributes: CursorAttributeMap, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(attributes, name)
}

function cursorTagNameFor(debug: TargetDebugInfo): string | undefined {
  return debug.description?.match(/^[a-z0-9-]+/i)?.[0]?.toLowerCase()
}

function clickablePointOrThrow(
  action: 'moveTo' | 'click' | 'typeInto',
  target: TargetHandle,
  geometry: GeometrySnapshot,
): Point {
  if (geometry.clickablePoint.ok) {
    return geometry.clickablePoint.point
  }

  throw actorbleError(
    'INTERACTABILITY_FAILED',
    `Action Orchestrator ${action} could not find a clickable point.`,
    {
      details: {
        action,
        targetId: target.id,
        reason: geometry.clickablePoint.reason,
      },
    },
  )
}

function assertCanClick(target: TargetHandle, report: InteractabilityReport): void {
  if (report.canClick) {
    return
  }

  throw actorbleError('INTERACTABILITY_FAILED', 'Target is not clickable.', {
    details: {
      action: 'click',
      targetId: target.id,
      blockingReasons: report.blockingReasons,
      forceBypassedReasons: report.forceBypassedReasons,
      unforceableReasons: report.unforceableReasons,
    },
  })
}

function assertCanType(target: TargetHandle, report: InteractabilityReport): void {
  if (report.canType === true) {
    return
  }

  throw actorbleError('INTERACTABILITY_FAILED', 'Target is not typeable.', {
    details: {
      action: 'typeInto',
      targetId: target.id,
      blockingReasons: report.blockingReasons,
      unforceableReasons: report.unforceableReasons,
    },
  })
}

function samePoint(first: Point, second: Point): boolean {
  return first.x === second.x && first.y === second.y
}

function normalizeActionError(
  error: unknown,
  context: Readonly<{
    action: ActionName
    phase: ActionPhase
    targetId?: string
  }>,
): ActorbleError {
  if (error instanceof ActorbleError) {
    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', `Action ${context.action} failed.`, {
    cause: error,
    details: context,
  })
}

function unsupportedPublicAction(action: UnsupportedPublicAction): ActorbleError {
  const unsupported = unsupportedPublicActionLimits[action]

  return actorbleError(
    'PLATFORM_UNSUPPORTED',
    `Action ${action} is not supported by the browser action orchestrator yet.`,
    {
      details: {
        boundary: 'action-orchestrator',
        action,
        capability: unsupported.capability,
        limit: unsupported.limit,
      },
    },
  )
}

function operationOptions(options: OperationOptions): WaitOptions {
  return {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
}

function cancellationOptions(options: OperationOptions): CancellationOptions {
  return options.signal === undefined ? {} : { signal: options.signal }
}

function typeOptions(
  options: TypeOptions,
  focusStrategy?: Extract<TypeOptions['focusStrategy'], 'none'>,
): TypeOptions {
  const normalized: TypeOptions = {
    ...operationOptions(options),
    delay: options.delay ?? DEFAULT_PUBLIC_TYPING_DELAY,
  }

  return focusStrategy === undefined ? normalized : { ...normalized, focusStrategy }
}

function typeFocusStrategy(options: TypeOptions): NonNullable<TypeOptions['focusStrategy']> {
  if (options.focusStrategy === 'click' || options.focusStrategy === 'none') {
    return options.focusStrategy
  }

  return 'programmatic'
}

function textFocusStrategyFor(
  focusStrategy: NonNullable<TypeOptions['focusStrategy']>,
): Extract<TypeOptions['focusStrategy'], 'none'> | undefined {
  return focusStrategy === 'click' || focusStrategy === 'none' ? 'none' : undefined
}

function typeFocusClickOptions(options: TypeOptions): ClickOptions {
  return {
    ...operationOptions(options),
    ...options.focusClick,
  }
}

function toLocator(target: TargetLike): Locator {
  if (isLocator(target)) {
    return target
  }

  return elementLocator(target as Element)
}

function isTargetHandle(target: TargetLike): target is TargetHandle {
  return (
    typeof target === 'object' &&
    target !== null &&
    'id' in target &&
    'element' in target &&
    'resolvedAt' in target &&
    'debug' in target
  )
}

function isLocator(target: TargetLike): target is Locator {
  return typeof target === 'object' && target !== null && 'kind' in target
}

function isFocusOrTypingStateEffect(effect: StateEffect): boolean {
  return (
    effect.kind === 'focus' ||
    effect.kind === 'focus-visible' ||
    effect.kind === 'typing'
  )
}

function summarizeTarget(target: TargetLike): Readonly<Record<string, unknown>> {
  if (isTargetHandle(target)) {
    return {
      kind: 'handle',
      targetId: target.id,
      debug: target.debug,
    }
  }

  if (isLocator(target)) {
    return {
      kind: 'locator',
      locatorKind: target.kind,
    }
  }

  return { kind: 'element' }
}

function summarizeOptions(
  options: object,
): Readonly<Record<string, unknown>> {
  const summary: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue
    }

    summary[key] = key === 'signal' ? '[AbortSignal]' : value
  }

  return summary
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
