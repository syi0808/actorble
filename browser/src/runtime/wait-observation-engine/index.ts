import {
  ActorbleError,
  actorbleError,
  cancellationError,
  element as elementLocator,
  timeoutError,
} from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js'
import { BrowserInteractabilityEngine } from '../../targeting/interactability-engine/index.js'
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type {
  LayoutInvalidationEvent,
  LayoutInvalidationTracker,
} from '../../targeting/layout-invalidation-tracker/index.js'
import type {
  ActorbleErrorDetails,
  DomPort,
  DurationMs,
  Locator,
  TargetHandle,
  TargetLike,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'
import type { GeometryEngine } from '../../targeting/geometry-engine/index.js'
import type { InteractabilityEngine, InteractabilityReport } from '../../targeting/interactability-engine/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type { TimelineEngine, WaitStrategy } from '../timeline-engine/index.js'

export type WaitResult = Readonly<{
  condition: WaitCondition
  satisfied: boolean
  strategy: WaitStrategy
}>

export interface WaitObservationEngine {
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>
  settle(strategy?: WaitStrategy, options?: WaitOptions): Promise<WaitResult | null>
  invalidateGeometry(reason: string): void
}

export type GeometryInvalidationHook = (reason: string) => void

export type WaitTraceSpan = Readonly<{
  id: string
  end(attributes?: ActorbleErrorDetails): void
  error(error: ActorbleError, attributes?: ActorbleErrorDetails): void
  cancel(reason?: unknown): void
  event(name: string, data?: unknown): void
}>

export type WaitTraceRecorder = Readonly<{
  startSpan(name: string, attributes?: ActorbleErrorDetails): WaitTraceSpan
  appendEvent?(name: string, data?: unknown): void
}>

export type WaitObservationEngineOptions = Readonly<{
  dom?: DomPort
  resolver?: TargetResolver
  geometry?: GeometryEngine
  interactability?: InteractabilityEngine
  layoutInvalidation?: LayoutInvalidationTracker
  timeline?: TimelineEngine
  trace?: WaitTraceRecorder
  onGeometryInvalidated?: GeometryInvalidationHook
}>

type TargetWaitObservation = Readonly<{
  state: 'visible' | 'hidden' | 'not-found' | 'detached' | 'stale'
  target?: unknown
  targetId?: string
  errorCode?: ActorbleError['code']
  errorDetails?: ActorbleErrorDetails
  visible?: boolean
  visibilityRatio?: number
  blockingReasons?: readonly string[]
}>

type WaitAttemptDiagnostics = {
  attempts: number
  lastObservation?: TargetWaitObservation
}

type WaitErrorDetailsProvider = ActorbleErrorDetails | (() => ActorbleErrorDetails)

export class BrowserWaitObservationEngine implements WaitObservationEngine {
  readonly #dom: DomPort
  readonly #resolver: TargetResolver
  readonly #geometry: GeometryEngine
  readonly #interactability: InteractabilityEngine
  readonly #timeline: TimelineEngine
  readonly #trace?: WaitTraceRecorder
  readonly #onGeometryInvalidated?: GeometryInvalidationHook
  readonly #layoutInvalidationSubscription?: { dispose(): void }

  constructor(options: WaitObservationEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#resolver =
      options.resolver ?? new BrowserTargetResolver({ dom: this.#dom, clock: this.#timeline })
    this.#geometry =
      options.geometry ?? new BrowserGeometryEngine({ dom: this.#dom, clock: this.#timeline })
    this.#interactability =
      options.interactability ??
      new BrowserInteractabilityEngine({ dom: this.#dom, geometry: this.#geometry })
    this.#trace = options.trace
    this.#onGeometryInvalidated = options.onGeometryInvalidated
    this.#layoutInvalidationSubscription = options.layoutInvalidation?.subscribe((event) => {
      this.#recordLayoutInvalidation(event)
    })
  }

  async waitFor(condition: WaitCondition, options: WaitOptions = {}): Promise<WaitResult> {
    const operation = 'wait.for'
    const span = this.#trace?.startSpan(operation, {
      condition: summarizeCondition(condition),
      timeout: options.timeout,
    })

    span?.event('wait:start', {
      condition: summarizeCondition(condition),
      timeout: options.timeout,
    })

    const diagnostics: WaitAttemptDiagnostics = { attempts: 0 }
    const details = () => conditionErrorDetails(condition, diagnostics)

    try {
      const result = await this.#withTimeout(
        operation,
        options,
        details,
        (signal) => this.#waitForCondition(condition, signal, diagnostics),
      )

      span?.event('wait:success', {
        condition: summarizeCondition(condition),
        strategy: result.strategy,
        attempts: diagnostics.attempts,
        lastObservation: diagnostics.lastObservation,
      })
      span?.end({
        conditionKind: condition.kind,
        satisfied: result.satisfied,
        strategy: result.strategy,
        attempts: diagnostics.attempts,
        ...(diagnostics.lastObservation === undefined
          ? {}
          : { lastObservation: diagnostics.lastObservation }),
      })

      return result
    } catch (error) {
      const normalized = normalizeWaitError(error, operation, options.timeout, details())

      if (normalized.code === 'ACTION_TIMEOUT') {
        span?.event('wait:timeout', normalized.details)
      }

      finishSpanWithError(span, normalized)
      throw normalized
    }
  }

  async settle(
    strategy: WaitStrategy = 'settled',
    options: WaitOptions = {},
  ): Promise<WaitResult | null> {
    const operation = 'wait.settle'
    const span = this.#trace?.startSpan(operation, {
      strategy,
      timeout: options.timeout,
    })

    span?.event('wait:start', {
      strategy,
      timeout: options.timeout,
    })

    try {
      await this.#withTimeout(operation, options, { strategy }, (signal) =>
        this.#timeline.settle(strategy, toCancellationOptions(signal)),
      )

      span?.event('wait:success', { strategy })
      span?.end({ strategy })
      return null
    } catch (error) {
      const normalized = normalizeWaitError(error, operation, options.timeout, { strategy })

      if (normalized.code === 'ACTION_TIMEOUT') {
        span?.event('wait:timeout', normalized.details)
      }

      finishSpanWithError(span, normalized)
      throw normalized
    }
  }

  invalidateGeometry(reason: string): void {
    this.#trace?.appendEvent?.('geometry:invalidate', {
      reason,
      root: rootKind(this.#dom.getRoot()),
    })
    this.#onGeometryInvalidated?.(reason)
  }

  #recordLayoutInvalidation(event: LayoutInvalidationEvent): void {
    this.#trace?.appendEvent?.('layout:invalidate', {
      reason: event.reason,
      reasons: [...event.reasons],
      coalesced: event.coalesced,
      invalidatedAt: event.at,
      root: rootKind(this.#dom.getRoot()),
    })
    this.#onGeometryInvalidated?.(event.reason)
  }

  async #waitForCondition(
    condition: WaitCondition,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    assertNotCancelled('wait.for', signal)

    if (condition.kind === 'visible' || condition.kind === 'hidden') {
      return await this.#waitForTargetCondition(condition, signal, diagnostics)
    }

    if (condition.kind !== 'custom') {
      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        `Wait condition "${condition.kind}" is not supported by the wait observation engine yet.`,
        {
          details: {
            conditionKind: condition.kind,
            condition: summarizeCondition(condition),
          },
        },
      )
    }

    let attempts = 0

    for (;;) {
      assertNotCancelled('wait.for', signal)
      attempts += 1
      diagnostics.attempts = attempts

      const satisfied = await condition.predicate()

      assertNotCancelled('wait.for', signal)

      if (satisfied) {
        return {
          condition,
          satisfied: true,
          strategy: 'settled',
        }
      }

      this.#trace?.appendEvent?.('wait:retry', {
        attempts,
        condition: summarizeCondition(condition),
      })
      await this.#timeline.settle('settled', toCancellationOptions(signal))
    }
  }

  async #waitForTargetCondition(
    condition: Extract<WaitCondition, { kind: 'visible' | 'hidden' }>,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    for (;;) {
      assertNotCancelled('wait.for', signal)
      diagnostics.attempts += 1

      const observation = await this.#observeTarget(condition.target)
      diagnostics.lastObservation = observation

      assertNotCancelled('wait.for', signal)

      if (isTargetConditionSatisfied(condition.kind, observation)) {
        return {
          condition,
          satisfied: true,
          strategy: 'settled',
        }
      }

      this.#trace?.appendEvent?.('wait:retry', {
        attempts: diagnostics.attempts,
        condition: summarizeCondition(condition),
        observation,
      })
      await this.#timeline.settle('settled', toCancellationOptions(signal))
    }
  }

  async #observeTarget(target: TargetLike): Promise<TargetWaitObservation> {
    try {
      const handle = await this.#resolveTarget(target)
      const snapshot = await this.#geometry.snapshot(handle)
      const report = await this.#interactability.inspect(handle, snapshot)

      return observationFromReport(report)
    } catch (error) {
      const observation = observationFromTargetError(error, target)

      if (observation !== null) {
        return observation
      }

      throw error
    }
  }

  async #resolveTarget(target: TargetLike): Promise<TargetHandle> {
    const handle = isTargetHandle(target)
      ? target
      : await this.#resolver.resolve(toLocator(target), {})

    return await this.#resolver.validate(handle)
  }

  #withTimeout<TValue>(
    operation: string,
    options: WaitOptions,
    details: WaitErrorDetailsProvider,
    run: (signal: WaitOptions['signal']) => Promise<TValue>,
  ): Promise<TValue> {
    if (options.timeout === undefined) {
      return run(options.signal)
    }

    const timeout = normalizeDuration(options.timeout)
    const signal = options.signal

    if (signal?.aborted) {
      return Promise.reject(cancellationError(operation, signal.reason))
    }

    const controller = new AbortController()

    return new Promise((resolve, reject) => {
      let timerId: ReturnType<typeof setTimeout> | null = null
      let finished = false

      const cleanup = () => {
        if (timerId !== null) {
          clearTimeout(timerId)
          timerId = null
        }

        signal?.removeEventListener('abort', onAbort)
      }

      const complete = (value: TValue) => {
        if (finished) {
          return
        }

        finished = true
        cleanup()
        resolve(value)
      }

      const fail = (error: ActorbleError) => {
        if (finished) {
          return
        }

        finished = true
        cleanup()
        reject(error)
      }

      const onAbort = () => {
        controller.abort(signal?.reason)
        fail(cancellationError(operation, signal?.reason))
      }

      timerId = setTimeout(() => {
        const timeoutFailure = timeoutError(operation, timeout, { details: readDetails(details) })
        controller.abort(timeoutFailure)
        fail(timeoutFailure)
      }, timeout)

      signal?.addEventListener('abort', onAbort, { once: true })
      run(controller.signal).then(complete, (error) => {
        fail(normalizeWaitError(error, operation, options.timeout, readDetails(details)))
      })
    })
  }
}

export function createWaitObservationEngine(
  options: WaitObservationEngineOptions = {},
): WaitObservationEngine {
  return new BrowserWaitObservationEngine(options)
}

function normalizeDuration(duration: DurationMs): DurationMs {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function assertNotCancelled(operation: string, signal: WaitOptions['signal']): void {
  if (signal?.aborted) {
    throw cancellationError(operation, signal.reason)
  }
}

function toCancellationOptions(signal: WaitOptions['signal']): Pick<WaitOptions, 'signal'> {
  return signal === undefined ? {} : { signal }
}

function readDetails(details: WaitErrorDetailsProvider): ActorbleErrorDetails {
  return typeof details === 'function' ? details() : details
}

function conditionErrorDetails(
  condition: WaitCondition,
  diagnostics: WaitAttemptDiagnostics,
): ActorbleErrorDetails {
  return {
    conditionKind: condition.kind,
    condition: summarizeCondition(condition),
    attempts: diagnostics.attempts,
    ...(diagnostics.lastObservation === undefined
      ? {}
      : { lastObservation: diagnostics.lastObservation }),
  }
}

function finishSpanWithError(span: WaitTraceSpan | undefined, error: ActorbleError): void {
  if (error.code === 'ACTION_CANCELLED') {
    span?.cancel(error.details?.reason)
    return
  }

  span?.error(error)
}

function normalizeWaitError(
  error: unknown,
  operation: string,
  timeout: DurationMs | undefined,
  details: ActorbleErrorDetails,
): ActorbleError {
  if (error instanceof ActorbleError) {
    if (error.code === 'ACTION_CANCELLED' && error.details?.operation !== operation) {
      return cancellationError(operation, error.details?.reason)
    }

    if (
      error.code === 'ACTION_TIMEOUT' &&
      error.details?.operation !== operation &&
      timeout !== undefined
    ) {
      return timeoutError(operation, normalizeDuration(timeout), {
        cause: error,
        details,
      })
    }

    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', `${operation} failed.`, {
    cause: error,
    details,
  })
}

function isTargetConditionSatisfied(
  kind: 'visible' | 'hidden',
  observation: TargetWaitObservation,
): boolean {
  if (kind === 'visible') {
    return observation.state === 'visible'
  }

  return observation.state !== 'visible'
}

function observationFromReport(report: InteractabilityReport): TargetWaitObservation {
  return {
    state: report.visible ? 'visible' : 'hidden',
    target: summarizeTarget(report.target),
    targetId: report.target.id,
    visible: report.visible,
    visibilityRatio: report.visibilityRatio,
    blockingReasons: report.blockingReasons,
  }
}

function observationFromTargetError(
  error: unknown,
  target: TargetLike,
): TargetWaitObservation | null {
  if (!(error instanceof ActorbleError)) {
    return null
  }

  switch (error.code) {
    case 'TARGET_NOT_FOUND':
      return observationFromError('not-found', error, target)
    case 'TARGET_DETACHED':
      return observationFromError('detached', error, target)
    case 'TARGET_STALE':
      return observationFromError('stale', error, target)
    default:
      return null
  }
}

function observationFromError(
  state: TargetWaitObservation['state'],
  error: ActorbleError,
  target: TargetLike,
): TargetWaitObservation {
  return {
    state,
    target: summarizeTarget(target),
    ...targetIdFromError(error, target),
    errorCode: error.code,
    ...(error.details === undefined ? {} : { errorDetails: error.details }),
  }
}

function targetIdFromError(
  error: ActorbleError,
  target: TargetLike,
): Readonly<{ targetId?: string }> {
  if (typeof error.details?.targetId === 'string') {
    return { targetId: error.details.targetId }
  }

  if (isTargetHandle(target)) {
    return { targetId: target.id }
  }

  return {}
}

function toLocator(target: TargetLike): Locator {
  if (isLocator(target)) {
    return target
  }

  if (isElementTarget(target)) {
    return elementLocator(target)
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', 'Target handle must be validated, not resolved.', {
    details: { target: summarizeTarget(target) },
  })
}

function summarizeCondition(condition: WaitCondition): Readonly<Record<string, unknown>> {
  switch (condition.kind) {
    case 'custom':
      return { kind: condition.kind }
    case 'visible':
    case 'hidden':
      return {
        kind: condition.kind,
        target: summarizeTarget(condition.target),
      }
    case 'text':
      return {
        kind: condition.kind,
        value: condition.value instanceof RegExp ? condition.value.toString() : condition.value,
      }
  }
}

function summarizeTarget(target: TargetLike): unknown {
  if (typeof Element !== 'undefined' && target instanceof Element) {
    return { kind: 'element' }
  }

  if (typeof target === 'object' && target !== null && 'kind' in target) {
    const locator = target as unknown as Readonly<Record<string, unknown>>
    return {
      kind: locator.kind,
      selector: locator.selector,
      role: locator.role,
      value: locator.value,
    }
  }

  if (typeof target === 'object' && target !== null && 'id' in target) {
    return { kind: 'handle', id: (target as Readonly<Record<string, unknown>>).id }
  }

  return { kind: typeof target }
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

function isElementTarget(target: TargetLike): target is Element {
  return typeof Element !== 'undefined' && target instanceof Element
}

function rootKind(root: Document | ShadowRoot): 'document' | 'shadow-root' {
  return root.nodeType === 9 ? 'document' : 'shadow-root'
}
