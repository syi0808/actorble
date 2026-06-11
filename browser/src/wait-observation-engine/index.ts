import {
  ActorbleError,
  actorbleError,
  cancellationError,
  timeoutError,
} from '../shared/index.js'
import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type {
  ActorbleErrorDetails,
  DomPort,
  DurationMs,
  TargetLike,
  WaitCondition,
  WaitOptions,
} from '../shared/index.js'
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
  timeline?: TimelineEngine
  trace?: WaitTraceRecorder
  onGeometryInvalidated?: GeometryInvalidationHook
}>

export class BrowserWaitObservationEngine implements WaitObservationEngine {
  readonly #dom: DomPort
  readonly #timeline: TimelineEngine
  readonly #trace?: WaitTraceRecorder
  readonly #onGeometryInvalidated?: GeometryInvalidationHook

  constructor(options: WaitObservationEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#trace = options.trace
    this.#onGeometryInvalidated = options.onGeometryInvalidated
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

    try {
      const result = await this.#withTimeout(
        operation,
        options,
        { conditionKind: condition.kind },
        (signal) => this.#waitForCondition(condition, signal),
      )

      span?.event('wait:success', {
        condition: summarizeCondition(condition),
        strategy: result.strategy,
      })
      span?.end({
        conditionKind: condition.kind,
        satisfied: result.satisfied,
        strategy: result.strategy,
      })

      return result
    } catch (error) {
      const normalized = normalizeWaitError(error, operation, options.timeout, {
        conditionKind: condition.kind,
      })

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

  async #waitForCondition(
    condition: WaitCondition,
    signal: WaitOptions['signal'],
  ): Promise<WaitResult> {
    assertNotCancelled('wait.for', signal)

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

  #withTimeout<TValue>(
    operation: string,
    options: WaitOptions,
    details: ActorbleErrorDetails,
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
    const timeoutFailure = timeoutError(operation, timeout, { details })

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
        controller.abort(timeoutFailure)
        fail(timeoutFailure)
      }, timeout)

      signal?.addEventListener('abort', onAbort, { once: true })
      run(controller.signal).then(complete, (error) => {
        fail(normalizeWaitError(error, operation, options.timeout, details))
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

function rootKind(root: Document | ShadowRoot): 'document' | 'shadow-root' {
  return root.nodeType === 9 ? 'document' : 'shadow-root'
}
