import {
  ActorbleError,
  actorbleError,
  cancellationError,
  element as elementLocator,
  timeoutError,
} from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserGeometryEngine } from '../../targeting/geometry-engine/index.js'
import { createFrameGeometrySurfaceCache } from '../../targeting/frame-geometry-surface-cache/index.js'
import { BrowserInteractabilityEngine } from '../../targeting/interactability-engine/index.js'
import { BrowserTargetResolver } from '../../targeting/target-resolver/index.js'
import { BrowserTimelineEngine, normalizeWaitStrategy } from '../timeline-engine/index.js'
import { BrowserVisualStabilityObserver } from '../visual-stability-observer/index.js'
import { BrowserLayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import { BrowserScrollChainResolver } from '../../targeting/scroll-chain-resolver/index.js'
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
  TargetWaitCondition,
  StabilityPolicy,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'
import type { GeometryEngine } from '../../targeting/geometry-engine/index.js'
import type { FrameGeometrySurfaceCache } from '../../targeting/frame-geometry-surface-cache/index.js'
import type { InteractabilityEngine, InteractabilityReport } from '../../targeting/interactability-engine/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type {
  ResolvedWaitStrategy,
  TimelineEngine,
  WaitStrategy,
} from '../timeline-engine/index.js'
import type { VisualStabilityObserver } from '../visual-stability-observer/index.js'

export type WaitResult = Readonly<{
  condition: WaitCondition
  satisfied: boolean
  strategy: ResolvedWaitStrategy
}>

export interface WaitObservationEngine {
  waitFor(condition: WaitCondition, options?: WaitOptions): Promise<WaitResult>
  settle(
    strategy?: StabilityPolicy,
    options?: WaitOptions,
    target?: TargetHandle,
  ): Promise<WaitResult | null>
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
  visualStability?: VisualStabilityObserver
  onGeometryInvalidated?: GeometryInvalidationHook
}>

type TargetWaitObservation = Readonly<{
  state:
    | 'visible'
    | 'hidden'
    | 'attached'
    | 'enabled'
    | 'disabled'
    | 'focused'
    | 'unfocused'
    | 'not-found'
    | 'detached'
    | 'stale'
  target?: unknown
  targetId?: string
  errorCode?: ActorbleError['code']
  errorDetails?: ActorbleErrorDetails
  visible?: boolean
  visibilityRatio?: number
  blockingReasons?: readonly string[]
  enabled?: boolean
  focused?: boolean
}>

type TextWaitObservation = Readonly<{
  state: 'matched' | 'unmatched'
  scope: 'root' | 'target'
  root: 'document' | 'shadow-root'
  matched: boolean
  matcher: MatcherSummary
  textLength: number
  target?: unknown
  targetId?: string
}>

type MatcherSummary = Readonly<{
  kind: 'string' | 'regexp' | 'absent'
  length: number
  flags?: string
}>

type ValueWaitObservation = Readonly<{
  state: 'matched' | 'unmatched' | 'not-found' | 'detached' | 'stale'
  matched: boolean
  matcher: MatcherSummary
  control?: 'input' | 'textarea' | 'select'
  valueLength?: number
  target?: unknown
  targetId?: string
  errorCode?: ActorbleError['code']
}>

type AttributeWaitObservation = Readonly<{
  state: 'matched' | 'unmatched' | 'not-found' | 'detached' | 'stale'
  matched: boolean
  matcher: MatcherSummary
  name: string
  present?: boolean
  valueLength?: number
  target?: unknown
  targetId?: string
  errorCode?: ActorbleError['code']
}>

type UrlWaitObservation = Readonly<{
  state: 'matched' | 'unmatched'
  matched: boolean
  matcher: MatcherSummary
  pathLength: number
  hasQuery: boolean
  hasFragment: boolean
}>

type WaitObservation =
  | TargetWaitObservation
  | TextWaitObservation
  | ValueWaitObservation
  | AttributeWaitObservation
  | UrlWaitObservation

type WaitAttemptDiagnostics = {
  attempts: number
  lastObservation?: WaitObservation
}

type WaitErrorDetailsProvider = ActorbleErrorDetails | (() => ActorbleErrorDetails)

type TargetWaitObservationCache = {
  handle?: TargetHandle
  observation?: TargetWaitObservation
  observedLayoutRevision: number
}

type TargetWaitObservationResult = Readonly<{
  observation: TargetWaitObservation
  handle?: TargetHandle
}>

type TextWaitObservationCache = {
  observation?: TextWaitObservation
  observedTextRevision: number
}

export class BrowserWaitObservationEngine implements WaitObservationEngine {
  readonly #dom: DomPort
  readonly #resolver: TargetResolver
  readonly #geometry: GeometryEngine
  readonly #interactability: InteractabilityEngine
  readonly #timeline: TimelineEngine
  readonly #trace?: WaitTraceRecorder
  readonly #onGeometryInvalidated?: GeometryInvalidationHook
  readonly #geometrySurfaceCache?: FrameGeometrySurfaceCache
  readonly #layoutInvalidation?: LayoutInvalidationTracker
  readonly #layoutInvalidationSubscription?: { dispose(): void }
  readonly #visualStability: VisualStabilityObserver
  #layoutRevision = 0
  #textRevision = 0

  constructor(options: WaitObservationEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#resolver =
      options.resolver ?? new BrowserTargetResolver({ dom: this.#dom, clock: this.#timeline })
    const layoutInvalidation =
      options.layoutInvalidation ?? new BrowserLayoutInvalidationTracker({
        dom: this.#dom,
        timeline: this.#timeline,
      })
    const geometrySurfaceCache =
      options.geometry === undefined
        ? createFrameGeometrySurfaceCache({
            layoutInvalidation,
            timeline: this.#timeline,
          })
        : undefined
    this.#geometrySurfaceCache = geometrySurfaceCache
    this.#geometry =
      options.geometry ??
      new BrowserGeometryEngine({
        dom: this.#dom,
        cache: geometrySurfaceCache,
        clock: this.#timeline,
      })
    this.#interactability =
      options.interactability ??
      new BrowserInteractabilityEngine({ dom: this.#dom, geometry: this.#geometry })
    this.#trace = options.trace
    this.#visualStability =
      options.visualStability ??
      new BrowserVisualStabilityObserver({
        dom: this.#dom,
        geometry: this.#geometry,
        layoutInvalidation,
        resolver: this.#resolver,
        scrollChain: new BrowserScrollChainResolver({ dom: this.#dom }),
        timeline: this.#timeline,
      })
    this.#onGeometryInvalidated = options.onGeometryInvalidated
    this.#layoutInvalidation = layoutInvalidation
    this.#layoutInvalidationSubscription = layoutInvalidation.subscribe((event) => {
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
    strategy: StabilityPolicy = 'interaction-stable',
    options: WaitOptions = {},
    target?: TargetHandle,
  ): Promise<WaitResult | null> {
    const operation = 'wait.settle'
    const resolvedStrategy = strategy === 'settled' ? 'interaction-stable' : strategy
    const span = this.#trace?.startSpan(operation, {
      strategy: resolvedStrategy,
      timeout: options.timeout,
    })

    span?.event('wait:start', {
      strategy: resolvedStrategy,
      timeout: options.timeout,
    })

    try {
      if (resolvedStrategy === 'visual-stable') {
        await this.#visualStability.observe(target, options)
        span?.event('wait:success', { strategy: resolvedStrategy })
        span?.end({ strategy: resolvedStrategy })
        return null
      }

      await this.#withTimeout(operation, options, { strategy: resolvedStrategy }, (signal) =>
        this.#timeline.settle(
          normalizeWaitStrategy(resolvedStrategy as WaitStrategy),
          toCancellationOptions(signal),
        ),
      )

      span?.event('wait:success', { strategy: resolvedStrategy })
      span?.end({ strategy: resolvedStrategy })
      return null
    } catch (error) {
      const normalized = normalizeWaitError(error, operation, options.timeout, {
        strategy: resolvedStrategy,
      })

      if (normalized.code === 'ACTION_TIMEOUT') {
        span?.event('wait:timeout', normalized.details)
      }

      finishSpanWithError(span, normalized)
      throw normalized
    }
  }

  invalidateGeometry(reason: string): void {
    this.#recordDirtyReason(reason)
    this.#geometrySurfaceCache?.invalidate(reason)
    this.#trace?.appendEvent?.('geometry:invalidate', {
      reason,
      root: rootKind(this.#dom.getRoot()),
    })
    this.#onGeometryInvalidated?.(reason)
  }

  #recordLayoutInvalidation(event: LayoutInvalidationEvent): void {
    this.#recordDirtyReason(event.reason)
    for (const reason of event.reasons) {
      if (reason !== event.reason) {
        this.#recordDirtyReason(reason)
      }
    }
    this.#geometrySurfaceCache?.invalidate(event.reason)
    this.#trace?.appendEvent?.('layout:invalidate', {
      reason: event.reason,
      reasons: [...event.reasons],
      coalesced: event.coalesced,
      invalidatedAt: event.at,
      root: rootKind(this.#dom.getRoot()),
    })
    this.#onGeometryInvalidated?.(event.reason)
  }

  #recordDirtyReason(reason: string): void {
    this.#layoutRevision += 1

    if (reason === 'mutation') {
      this.#textRevision += 1
    }
  }

  async #waitForCondition(
    condition: WaitCondition,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    assertNotCancelled('wait.for', signal)
    const conditionKind = (condition as Readonly<{ kind: string }>).kind

    if (isTargetWaitCondition(condition)) {
      return await this.#waitForTargetCondition(condition, signal, diagnostics)
    }

    if (condition.kind === 'text') {
      return await this.#waitForTextCondition(condition, signal, diagnostics)
    }

    if (condition.kind === 'value' || condition.kind === 'attribute') {
      return await this.#waitForContentCondition(condition, signal, diagnostics)
    }

    if (condition.kind === 'url') {
      return await this.#waitForUrlCondition(condition, signal, diagnostics)
    }

    if (conditionKind !== 'custom') {
      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        `Wait condition "${conditionKind}" is not supported by the wait observation engine yet.`,
        {
          details: {
            conditionKind,
            condition: { kind: conditionKind },
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
          strategy: 'interaction-stable',
        }
      }

      this.#trace?.appendEvent?.('wait:retry', {
        attempts,
        condition: summarizeCondition(condition),
      })
      await this.#timeline.settle('interaction-stable', toCancellationOptions(signal))
    }
  }

  async #waitForTextCondition(
    condition: Extract<WaitCondition, { kind: 'text' }>,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    const target = textConditionTarget(condition)

    if (target !== undefined) {
      return await this.#waitForTargetTextCondition(condition, target, signal, diagnostics)
    }

    const cache: TextWaitObservationCache = {
      observedTextRevision: -1,
    }

    for (;;) {
      assertNotCancelled('wait.for', signal)
      diagnostics.attempts += 1

      const observation = this.#observeRootTextForWait(condition.value, cache)
      diagnostics.lastObservation = observation

      assertNotCancelled('wait.for', signal)

      if (observation.matched) {
        return {
          condition,
          satisfied: true,
          strategy: 'interaction-stable',
        }
      }

      this.#trace?.appendEvent?.('wait:retry', {
        attempts: diagnostics.attempts,
        condition: summarizeCondition(condition),
        observation,
      })
      await this.#timeline.settle('interaction-stable', toCancellationOptions(signal))
    }
  }

  async #waitForTargetTextCondition(
    condition: Extract<WaitCondition, { kind: 'text' }>,
    target: TargetLike,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    let handle: TargetHandle | undefined

    for (;;) {
      assertNotCancelled('wait.for', signal)
      diagnostics.attempts += 1

      try {
        handle = await this.#resolveTarget(target, handle)
        const text = normalizeWhitespace(this.#dom.getTextContent(handle.element))
        const matched = targetTextMatches(text, condition.value)
        diagnostics.lastObservation = {
          state: matched ? 'matched' : 'unmatched',
          scope: 'target',
          root: rootKind(handle.root),
          matched,
          matcher: summarizeMatcher(condition.value),
          textLength: text.length,
          target: summarizeTarget(handle),
          targetId: handle.id,
        }

        if (matched) return satisfiedResult(condition)
      } catch (error) {
        const observation = observationFromContentTargetError(error, target, summarizeMatcher(condition.value))
        if (observation === null) throw error
        diagnostics.lastObservation = {
          state: observation.state === 'not-found' ? 'unmatched' : observation.state,
          scope: 'target',
          root: rootKind(this.#dom.getRoot()),
          matched: false,
          matcher: summarizeMatcher(condition.value),
          textLength: 0,
          target: observation.target,
          targetId: observation.targetId,
        }
        handle = undefined
      }

      await this.#retryCondition(condition, diagnostics, signal)
    }
  }

  async #waitForContentCondition(
    condition: Extract<WaitCondition, { kind: 'value' | 'attribute' }>,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    let handle: TargetHandle | undefined

    for (;;) {
      assertNotCancelled('wait.for', signal)
      diagnostics.attempts += 1

      try {
        handle = await this.#resolveTarget(condition.target, handle)

        if (condition.kind === 'value') {
          const actual = this.#dom.getElementValue(handle.element)
          if (actual === null) throw unsupportedValueTarget(handle)
          const matched = exactMatches(actual, condition.value)
          diagnostics.lastObservation = {
            state: matched ? 'matched' : 'unmatched',
            matched,
            matcher: summarizeMatcher(condition.value),
            control: valueControlKind(handle.element),
            valueLength: actual.length,
            target: summarizeTarget(handle),
            targetId: handle.id,
          }
          if (matched) return satisfiedResult(condition)
        } else {
          const actual = this.#dom.getAttribute(handle.element, condition.name)
          const matched = condition.value === null
            ? actual === null
            : actual !== null && exactMatches(actual, condition.value)
          diagnostics.lastObservation = {
            state: matched ? 'matched' : 'unmatched',
            matched,
            matcher: summarizeMatcher(condition.value),
            name: condition.name,
            present: actual !== null,
            valueLength: actual?.length ?? 0,
            target: summarizeTarget(handle),
            targetId: handle.id,
          }
          if (matched) return satisfiedResult(condition)
        }
      } catch (error) {
        if (error instanceof ActorbleError && error.code === 'PLATFORM_UNSUPPORTED') throw error
        const observation = observationFromContentTargetError(error, condition.target, summarizeMatcher(condition.value))
        if (observation === null) throw error
        diagnostics.lastObservation = condition.kind === 'attribute'
          ? { ...observation, matched: false, name: condition.name }
          : { ...observation, matched: false }
        handle = undefined
      }

      await this.#retryCondition(condition, diagnostics, signal)
    }
  }

  async #waitForUrlCondition(
    condition: Extract<WaitCondition, { kind: 'url' }>,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    const subscription = this.#dom.observeUrlChanges(() => {})

    try {
      for (;;) {
        assertNotCancelled('wait.for', signal)
        diagnostics.attempts += 1
        const actual = this.#dom.getCurrentUrl()
        const parsed = new URL(actual)
        const matched = urlMatches(actual, condition.value)
        diagnostics.lastObservation = {
          state: matched ? 'matched' : 'unmatched',
          matched,
          matcher: summarizeMatcher(condition.value),
          pathLength: parsed.pathname.length,
          hasQuery: parsed.search.length > 0,
          hasFragment: parsed.hash.length > 0,
        }
        if (matched) return satisfiedResult(condition)
        await this.#retryCondition(condition, diagnostics, signal)
      }
    } finally {
      subscription.dispose()
    }
  }

  async #retryCondition(
    condition: WaitCondition,
    diagnostics: WaitAttemptDiagnostics,
    signal: WaitOptions['signal'],
  ): Promise<void> {
    this.#trace?.appendEvent?.('wait:retry', {
      attempts: diagnostics.attempts,
      condition: summarizeCondition(condition),
      observation: diagnostics.lastObservation,
    })
    await this.#timeline.settle('interaction-stable', toCancellationOptions(signal))
  }

  async #waitForTargetCondition(
    condition: TargetWaitCondition,
    signal: WaitOptions['signal'],
    diagnostics: WaitAttemptDiagnostics,
  ): Promise<WaitResult> {
    const cache: TargetWaitObservationCache = {
      observedLayoutRevision: -1,
    }

    for (;;) {
      assertNotCancelled('wait.for', signal)
      diagnostics.attempts += 1

      const observation = await this.#observeTargetForWait(condition, cache)
      diagnostics.lastObservation = observation

      assertNotCancelled('wait.for', signal)

      if (isTargetConditionSatisfied(condition.kind, observation)) {
        return {
          condition,
          satisfied: true,
          strategy: 'interaction-stable',
        }
      }

      this.#trace?.appendEvent?.('wait:retry', {
        attempts: diagnostics.attempts,
        condition: summarizeCondition(condition),
        observation,
      })
      await this.#timeline.settle('interaction-stable', toCancellationOptions(signal))
    }
  }

  async #observeTargetForWait(
    condition: TargetWaitCondition,
    cache: TargetWaitObservationCache,
  ): Promise<TargetWaitObservation> {
    const reuseEnabled = this.#canReuseWaitObservations() && condition.kind !== 'focused'

    if (
      reuseEnabled &&
      cache.observation !== undefined &&
      cache.observedLayoutRevision === this.#layoutRevision &&
      canReuseTargetObservation(cache.observation)
    ) {
      return cache.observation
    }

    const result = await this.#readTargetObservation(
      condition,
      reuseEnabled ? cache.handle : undefined,
    )

    if (!reuseEnabled) {
      return result.observation
    }

    cache.observation = result.observation
    cache.observedLayoutRevision = this.#layoutRevision

    if (result.handle === undefined) {
      delete cache.handle
    } else {
      cache.handle = result.handle
    }

    return result.observation
  }

  async #readTargetObservation(
    condition: TargetWaitCondition,
    cachedHandle: TargetHandle | undefined,
  ): Promise<TargetWaitObservationResult> {
    try {
      const handle = await this.#resolveTarget(condition.target, cachedHandle)

      if (condition.kind === 'attached' || condition.kind === 'detached') {
        return {
          observation: {
            state: 'attached',
            target: summarizeTarget(handle),
            targetId: handle.id,
          },
          handle,
        }
      }

      if (condition.kind === 'focused') {
        const focused = this.#dom.getActiveElement() === handle.element
        return {
          observation: {
            state: focused ? 'focused' : 'unfocused',
            target: summarizeTarget(handle),
            targetId: handle.id,
            focused,
          },
          handle,
        }
      }

      const snapshot = await this.#geometry.snapshot(handle)
      const report = await this.#interactability.inspect(handle, snapshot)

      return {
        observation: observationFromReport(report, condition.kind),
        handle,
      }
    } catch (error) {
      const observation = observationFromTargetError(error, condition.target, condition.kind)

      if (observation !== null) {
        return { observation }
      }

      throw error
    }
  }

  #observeRootTextForWait(
    value: string | RegExp,
    cache: TextWaitObservationCache,
  ): TextWaitObservation {
    if (
      this.#canReuseWaitObservations() &&
      cache.observation !== undefined &&
      cache.observedTextRevision === this.#textRevision
    ) {
      return cache.observation
    }

    const observation = this.#observeRootText(value)

    cache.observation = observation
    cache.observedTextRevision = this.#textRevision

    return observation
  }

  #observeRootText(value: string | RegExp): TextWaitObservation {
    const text = normalizeWhitespace(this.#dom.getRootTextContent())
    const matched = textMatches(text, value)

    return {
      state: matched ? 'matched' : 'unmatched',
      scope: 'root',
      root: rootKind(this.#dom.getRoot()),
      matched,
      matcher: summarizeMatcher(value),
      textLength: text.length,
    }
  }

  async #resolveTarget(
    target: TargetLike,
    cachedHandle: TargetHandle | undefined,
  ): Promise<TargetHandle> {
    const handle = cachedHandle ?? (isTargetHandle(target)
      ? target
      : await this.#resolver.resolve(toLocator(target), {}))

    return await this.#resolver.validate(handle)
  }

  #canReuseWaitObservations(): boolean {
    return this.#layoutInvalidation?.isRunning() === true
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
    if (error.code === 'ACTION_CANCELLED') {
      return actorbleError('ACTION_CANCELLED', `${operation} was cancelled.`, {
        cause: error,
        details: {
          ...details,
          operation,
          reason: error.details?.reason,
        },
      })
    }

    if (
      error.code === 'ACTION_TIMEOUT' &&
      error.details?.operation !== operation &&
      timeout !== undefined
    ) {
      return timeoutError(operation, normalizeDuration(timeout), {
        cause: error,
        details: {
          ...error.details,
          ...details,
        },
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
  kind: TargetWaitCondition['kind'],
  observation: TargetWaitObservation,
): boolean {
  switch (kind) {
    case 'visible':
      return observation.state === 'visible'
    case 'hidden':
      return observation.state !== 'visible'
    case 'attached':
      return observation.state === 'attached' ||
        observation.state === 'visible' ||
        observation.state === 'hidden' ||
        observation.state === 'enabled' ||
        observation.state === 'disabled' ||
        observation.state === 'focused' ||
        observation.state === 'unfocused'
    case 'detached':
      return observation.state === 'detached' || observation.state === 'not-found'
    case 'enabled':
      return observation.enabled === true
    case 'disabled':
      return observation.enabled === false
    case 'focused':
      return observation.focused === true
  }
}

function canReuseTargetObservation(observation: TargetWaitObservation): boolean {
  return observation.state !== 'detached' && observation.state !== 'stale'
}

function textMatches(actualValue: string, expectedValue: string | RegExp): boolean {
  if (expectedValue instanceof RegExp) {
    expectedValue.lastIndex = 0
    return expectedValue.test(actualValue)
  }

  return actualValue.includes(normalizeWhitespace(expectedValue))
}

function exactMatches(actualValue: string, expectedValue: string | RegExp): boolean {
  if (expectedValue instanceof RegExp) {
    expectedValue.lastIndex = 0
    return expectedValue.test(actualValue)
  }

  return actualValue === expectedValue
}

function targetTextMatches(actualValue: string, expectedValue: string | RegExp): boolean {
  return expectedValue instanceof RegExp
    ? exactMatches(actualValue, expectedValue)
    : actualValue === normalizeWhitespace(expectedValue)
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function summarizeMatcher(value: string | RegExp | null): MatcherSummary {
  if (value === null) return { kind: 'absent', length: 0 }
  if (value instanceof RegExp) {
    return { kind: 'regexp', length: value.source.length, flags: value.flags }
  }

  return { kind: 'string', length: value.length }
}

function satisfiedResult(condition: WaitCondition): WaitResult {
  return { condition, satisfied: true, strategy: 'interaction-stable' }
}

function unsupportedValueTarget(handle: TargetHandle): ActorbleError {
  return actorbleError(
    'PLATFORM_UNSUPPORTED',
    'Value waits support input, textarea, and select elements only.',
    {
      details: {
        conditionKind: 'value',
        target: summarizeTarget(handle),
        supportedElements: ['input', 'textarea', 'select'],
      },
    },
  )
}

function valueControlKind(element: Element): 'input' | 'textarea' | 'select' {
  const tagName = element.tagName.toLowerCase()
  return tagName === 'textarea' ? 'textarea' : tagName === 'select' ? 'select' : 'input'
}

function observationFromContentTargetError(
  error: unknown,
  target: TargetLike,
  matcher: MatcherSummary,
): ValueWaitObservation | null {
  if (!(error instanceof ActorbleError)) return null

  const state = error.code === 'TARGET_NOT_FOUND'
    ? 'not-found'
    : error.code === 'TARGET_DETACHED'
      ? 'detached'
      : error.code === 'TARGET_STALE'
        ? 'stale'
        : null
  if (state === null) return null

  return {
    state,
    matched: false,
    matcher,
    target: summarizeTarget(target),
    ...targetIdFromError(error, target),
    errorCode: error.code,
  }
}

function urlMatches(actualHref: string, expected: string | RegExp): boolean {
  if (expected instanceof RegExp) {
    expected.lastIndex = 0
    return expected.test(actualHref)
  }

  const actual = new URL(actualHref)
  if (expected.startsWith('/')) {
    return `${actual.pathname}${actual.search}${actual.hash}` === expected
  }

  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(expected)) {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      'URL string waits require a root-relative path or an absolute URL.',
      { details: { conditionKind: 'url', matcher: summarizeMatcher(expected) } },
    )
  }

  try {
    return actualHref === new URL(expected).href
  } catch {
    throw actorbleError('PLATFORM_UNSUPPORTED', 'URL wait matcher is not a valid absolute URL.', {
      details: { conditionKind: 'url', matcher: summarizeMatcher(expected) },
    })
  }
}

function observationFromReport(
  report: InteractabilityReport,
  kind: 'visible' | 'hidden' | 'enabled' | 'disabled',
): TargetWaitObservation {
  const state = kind === 'enabled' || kind === 'disabled'
    ? (report.enabled ? 'enabled' : 'disabled')
    : (report.visible ? 'visible' : 'hidden')

  return {
    state,
    target: summarizeTarget(report.target),
    targetId: report.target.id,
    visible: report.visible,
    visibilityRatio: report.visibilityRatio,
    blockingReasons: report.blockingReasons,
    enabled: report.enabled,
  }
}

function observationFromTargetError(
  error: unknown,
  target: TargetLike,
  conditionKind: TargetWaitCondition['kind'],
): TargetWaitObservation | null {
  if (!(error instanceof ActorbleError)) {
    return null
  }

  switch (error.code) {
    case 'TARGET_NOT_FOUND':
      return observationFromError('not-found', error, target)
    case 'TARGET_DETACHED':
      return observationFromError('detached', error, target)
    case 'TARGET_STALE': {
      if (isTargetHandle(target) && target.locator === undefined) {
        return null
      }

      if (!staleTargetNoLongerResolves(error)) {
        return null
      }

      if (conditionKind === 'detached') {
        return observationFromError('detached', error, target)
      }

      return observationFromError('stale', error, target)
    }
    default:
      return null
  }
}

function staleTargetNoLongerResolves(error: ActorbleError): boolean {
  const cause = error.cause

  return cause instanceof ActorbleError &&
    (cause.code === 'TARGET_NOT_FOUND' || cause.code === 'TARGET_DETACHED')
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
    case 'attached':
    case 'detached':
    case 'enabled':
    case 'disabled':
    case 'focused':
      return {
        kind: condition.kind,
        target: summarizeTarget(condition.target),
      }
    case 'text': {
      const target = textConditionTarget(condition)

      return {
        kind: condition.kind,
        matcher: summarizeMatcher(condition.value),
        scope: target === undefined ? 'root' : 'target',
        ...(target === undefined ? {} : { target: summarizeTarget(target) }),
      }
    }
    case 'value':
      return {
        kind: condition.kind,
        matcher: summarizeMatcher(condition.value),
        target: summarizeTarget(condition.target),
      }
    case 'attribute':
      return {
        kind: condition.kind,
        name: condition.name,
        matcher: summarizeMatcher(condition.value),
        target: summarizeTarget(condition.target),
      }
    case 'url':
      return { kind: condition.kind, matcher: summarizeMatcher(condition.value) }
  }

  return { kind: (condition as Readonly<{ kind: string }>).kind }
}

function isTargetWaitCondition(
  condition: WaitCondition,
): condition is TargetWaitCondition {
  return condition.kind === 'visible' ||
    condition.kind === 'hidden' ||
    condition.kind === 'attached' ||
    condition.kind === 'detached' ||
    condition.kind === 'enabled' ||
    condition.kind === 'disabled' ||
    condition.kind === 'focused'
}

function textConditionTarget(
  condition: Extract<WaitCondition, { kind: 'text' }>,
): TargetLike | undefined {
  const candidate = condition as unknown as Readonly<Record<string, unknown>>

  return 'target' in candidate ? (candidate.target as TargetLike | undefined) : undefined
}

function summarizeTarget(target: TargetLike): unknown {
  if (typeof Element !== 'undefined' && target instanceof Element) {
    return { kind: 'element' }
  }

  if (typeof target === 'object' && target !== null && 'kind' in target) {
    const locator = target as unknown as Readonly<Record<string, unknown>>
    return { kind: locator.kind }
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
