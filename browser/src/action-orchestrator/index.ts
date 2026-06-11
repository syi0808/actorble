import { BrowserDiagnosticsTrace } from '../diagnostics-trace/index.js'
import { BrowserFocusEngine } from '../focus-engine/index.js'
import { BrowserGeometryEngine } from '../geometry-engine/index.js'
import { BrowserGestureEngine } from '../gesture-engine/index.js'
import { BrowserInteractabilityEngine } from '../interactability-engine/index.js'
import { BrowserInteractionStateStore } from '../interaction-state-store/index.js'
import { BrowserPointerEngine } from '../pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../pointer-signals/index.js'
import {
  BrowserDomAdapter,
  BrowserEventDispatcher,
  BrowserStateApplier,
  type TextInputMutationPort,
} from '../platform-adapter/index.js'
import { BrowserSurfaceEngine } from '../surface-engine/index.js'
import { BrowserTargetResolver } from '../target-resolver/index.js'
import { BrowserTextInputEngine } from '../text-input-engine/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import { BrowserWaitObservationEngine } from '../wait-observation-engine/index.js'
import {
  ActorbleError,
  actorbleError,
  element as elementLocator,
  notImplemented,
} from '../shared/index.js'
import type { SpanRecorder, TraceSpanHandle } from '../diagnostics-trace/index.js'
import type { FocusEngine } from '../focus-engine/index.js'
import type {
  ClickCurrentOptions,
  ClickOptions,
  DomPort,
  EventDispatchPort,
  DragOptions,
  FillOptions,
  FocusOptions,
  Locator,
  MoveOptions,
  OperationOptions,
  PressOptions,
  Point,
  PointerButtonName,
  ScrollOptions,
  ScrollPosition,
  StateApplyPort,
  TargetHandle,
  TargetLike,
  TypeOptions,
  WaitCondition,
  WaitOptions,
} from '../shared/index.js'
import type { GeometryEngine, GeometrySnapshot } from '../geometry-engine/index.js'
import type { GestureEngine } from '../gesture-engine/index.js'
import type { InteractabilityEngine, InteractabilityReport } from '../interactability-engine/index.js'
import type { InteractionStateStore } from '../interaction-state-store/index.js'
import type { PointerSignal, PointerSignalBus } from '../pointer-signals/index.js'
import type { SurfaceEngine } from '../surface-engine/index.js'
import type { TargetResolver } from '../target-resolver/index.js'
import type { TextInputEngine } from '../text-input-engine/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'
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
  timeline?: TimelineEngine
  trace?: SpanRecorder
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

export class BrowserActionOrchestrator implements ActionOrchestrator {
  readonly #events: EventDispatchPort
  readonly #geometry: GeometryEngine
  readonly #gesture: GestureEngine
  readonly #interactability: InteractabilityEngine
  readonly #resolver: TargetResolver
  readonly #state: StateApplyPort
  readonly #store: InteractionStateStore
  readonly #surface: SurfaceEngine
  readonly #text: TextInputEngine
  readonly #trace: SpanRecorder
  readonly #wait: WaitObservationEngine
  #signalTarget: TargetHandle | null = null
  #clickDispatchState: ClickDispatchState | null = null

  constructor(options: ActionOrchestratorOptions = {}) {
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const dom = options.dom ?? new BrowserDomAdapter()
    const timeline = options.timeline ?? new BrowserTimelineEngine()
    const store = options.store ?? new BrowserInteractionStateStore()
    const events = options.events ?? new BrowserEventDispatcher()
    const state = options.state ?? new BrowserStateApplier()
    const signals = options.signals ?? new BrowserPointerSignalBus()
    const surface = options.surface ?? new BrowserSurfaceEngine({ dom })
    const geometry =
      options.geometry ?? new BrowserGeometryEngine({ dom, surface, clock: timeline })
    const focus = options.focus ?? new BrowserFocusEngine({ dom, store })

    this.#trace = trace
    this.#events = events
    this.#geometry = geometry
    this.#gesture =
      options.gesture ??
      new BrowserGestureEngine({
        pointer: new BrowserPointerEngine({ signals, timeline }),
        timeline,
      })
    this.#interactability =
      options.interactability ?? new BrowserInteractabilityEngine({ dom, geometry })
    this.#resolver = options.resolver ?? new BrowserTargetResolver({ dom, trace, clock: timeline })
    this.#state = state
    this.#store = store
    this.#surface = surface
    this.#text =
      options.text ??
      new BrowserTextInputEngine({
        focus,
        events,
        store,
        dom,
      })
    this.#wait = options.wait ?? new BrowserWaitObservationEngine({ dom, timeline, trace })

    signals.subscribe((signal) => {
      this.#applyPointerSignal(signal)
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

      phase = 'perform'
      await this.#withSignalTarget(handle, () => this.#gesture.hover(point, options))
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

      phase = 'preflight'
      const report = await this.#interactability.canClick(handle, snapshot, options)
      assertCanClick(handle, report)
      this.#warnForceBypass(handle, report)

      phase = 'perform'
      performStarted = true
      const clickTarget = handle
      const result = await this.#withSignalTarget(clickTarget, () =>
        this.#gesture.click(clickTarget, point, options),
      )
      const activationDispatched = this.#dispatchActivationClick(clickTarget, point)

      phase = 'wait'
      await this.#wait.settle('settled', operationOptions(options))

      span.end({
        action: 'click',
        completed: true,
        targetId: handle.id,
        output: {
          point,
          gestureCompleted: result.completed,
          activationDispatched,
        },
      })
    } catch (error) {
      const failurePhase = phase

      if (performStarted) {
        phase = 'cleanup'
        await this.#cleanupFailedPerform(span)
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

  clickCurrent(): Promise<void> {
    return notImplemented('Action Orchestrator clickCurrent')
  }

  doubleClick(): Promise<void> {
    return notImplemented('Action Orchestrator doubleClick')
  }

  focus(): Promise<void> {
    return notImplemented('Action Orchestrator focus')
  }

  type(): Promise<void> {
    return notImplemented('Action Orchestrator type')
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

    try {
      handle = await this.#resolveTarget(target, options)
      phase = 'ensureVisible'
      await this.#surface.ensureVisible(handle, options)
      phase = 'geometry'
      await this.#geometry.snapshot(handle)
      phase = 'preflight'
      const report = await this.#interactability.canType(handle)
      assertCanType(handle, report)

      phase = 'perform'
      await this.#text.typeInto(handle, text, typeOptions(options))
      phase = 'wait'
      await this.#wait.settle('settled', operationOptions(options))

      span.end({
        action: 'typeInto',
        completed: true,
        targetId: handle.id,
        output: { textLength: Array.from(text).length },
      })
    } catch (error) {
      throw this.#finishActionFailure(span, error, {
        action: 'typeInto',
        phase,
        targetId: handle?.id,
      })
    }
  }

  fill(): Promise<void> {
    return notImplemented('Action Orchestrator fill')
  }

  press(): Promise<void> {
    return notImplemented('Action Orchestrator press')
  }

  scrollTo(): Promise<void> {
    return notImplemented('Action Orchestrator scrollTo')
  }

  drag(): Promise<void> {
    return notImplemented('Action Orchestrator drag')
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

  geometry(): Promise<GeometrySnapshot> {
    return notImplemented('Action Orchestrator geometry')
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

  async #withSignalTarget<TValue>(
    target: TargetHandle,
    operation: () => Promise<TValue>,
  ): Promise<TValue> {
    const previousTarget = this.#signalTarget

    this.#signalTarget = target

    try {
      return await operation()
    } finally {
      this.#signalTarget = previousTarget
    }
  }

  #applyPointerSignal(signal: PointerSignal): void {
    const target = this.#signalTarget
    const diff =
      target && signal.type !== 'pointer:cancelled'
        ? this.#store.dispatch({ ...signal, hitTarget: target })
        : this.#store.applyPointerSignal(signal)

    this.#state.applyStateEffects(diff.effects)

    if (signal.type === 'pointer:cancelled') {
      return
    }

    if (!target) {
      return
    }

    switch (signal.type) {
      case 'pointer:moved':
        this.#events.dispatchPointerEvent({
          type: 'pointermove',
          target: target.element,
          point: signal.point,
          buttons: [],
        })
        break
      case 'pointer:down': {
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

  async #cleanupFailedPerform(span: TraceSpanHandle): Promise<void> {
    try {
      await this.#gesture.cancel()
    } catch (error) {
      this.#trace.warn('Action gesture cleanup failed.', {
        action: 'click',
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
        action: 'click',
        error: describeUnknownError(error),
      })
    }
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

  #clearPointerContext(): void {
    this.#signalTarget = null
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

function clickablePointOrThrow(
  action: 'moveTo' | 'click',
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

function operationOptions(options: OperationOptions): WaitOptions {
  return {
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
  }
}

function typeOptions(options: TypeOptions): TypeOptions {
  return {
    ...operationOptions(options),
    ...(options.delay === undefined ? {} : { delay: options.delay }),
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
