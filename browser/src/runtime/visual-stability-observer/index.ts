import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import { BrowserScrollChainResolver } from '../../targeting/scroll-chain-resolver/index.js'
import { cancellationError, timeoutError } from '../../shared/index.js'
import type {
  CancellationSignalLike,
  Disposable,
  DomReadPort,
  DurationMs,
  Rect,
  ScrollMetrics,
  TargetHandle,
} from '../../shared/index.js'
import type { GeometryEngine } from '../../targeting/geometry-engine/index.js'
import type {
  LayoutInvalidationDirtyEvent,
  LayoutInvalidationTracker,
} from '../../targeting/layout-invalidation-tracker/index.js'
import type { TargetResolver } from '../../targeting/target-resolver/index.js'
import type { ScrollChainResolver } from '../../targeting/scroll-chain-resolver/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

export const DEFAULT_VISUAL_STABILITY_POLICY = Object.freeze({
  quietMs: 80,
  stableFrames: 2,
  threshold: 0.5,
})

export type VisualStabilityOptions = Readonly<{
  quietMs?: DurationMs
  stableFrames?: number
  threshold?: number
  timeout?: DurationMs
  signal?: CancellationSignalLike
  onObservation?: (observation: VisualStabilityResult) => void
}>

export type VisualStabilityResult = Readonly<{
  requiredStableFrames: number
  observedStableFrames: number
  previousRect?: Rect
  lastRect?: Rect
  lastMutationAt: number
  lastScrollAt: number
}>

export interface VisualStabilityObserver {
  observe(target?: TargetHandle, options?: VisualStabilityOptions): Promise<VisualStabilityResult>
}

export type VisualStabilityObserverOptions = Readonly<{
  dom?: Pick<
    DomReadPort,
    'getRoot' | 'getViewportScrollTarget' | 'getScrollMetrics' | 'getActiveAnimationCount'
  >
  geometry: Pick<GeometryEngine, 'getBoundingRect'>
  layoutInvalidation: LayoutInvalidationTracker
  resolver: Pick<TargetResolver, 'validate'>
  scrollChain?: ScrollChainResolver
  timeline?: Pick<TimelineEngine, 'nextFrame' | 'now'>
  trace?: VisualStabilityTraceRecorder
}>

export type VisualStabilityTraceRecorder = Readonly<{
  appendEvent?(name: string, data?: unknown): void
  attachSnapshot?(name: string, data: unknown): void
}>

type ScrollState = {
  target: Element | Window
  previous?: ScrollMetrics
  stableFrames: number
}

export class BrowserVisualStabilityObserver implements VisualStabilityObserver {
  readonly #dom: Pick<
    DomReadPort,
    'getRoot' | 'getViewportScrollTarget' | 'getScrollMetrics' | 'getActiveAnimationCount'
  >
  readonly #geometry: Pick<GeometryEngine, 'getBoundingRect'>
  readonly #layoutInvalidation: LayoutInvalidationTracker
  readonly #resolver: Pick<TargetResolver, 'validate'>
  readonly #scrollChain: ScrollChainResolver
  readonly #timeline: Pick<TimelineEngine, 'nextFrame' | 'now'>
  readonly #trace?: VisualStabilityTraceRecorder

  constructor(options: VisualStabilityObserverOptions) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#geometry = options.geometry
    this.#layoutInvalidation = options.layoutInvalidation
    this.#resolver = options.resolver
    this.#scrollChain = options.scrollChain ?? new BrowserScrollChainResolver()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#trace = options.trace
  }

  async observe(
    target?: TargetHandle,
    options: VisualStabilityOptions = {},
  ): Promise<VisualStabilityResult> {
    const operation = 'wait.visual-stable'
    const policy = normalizePolicy(options)
    const startedAt = this.#timeline.now()
    const deadline = options.timeout === undefined
      ? undefined
      : startedAt + normalizeNonNegative(options.timeout, 0)
    const wasRunning = this.#layoutInvalidation.isRunning()
    const controller = new AbortController()
    const scrollStates = this.#scrollStates(target)
    let mutationGeneration = 0
    let scrollGeneration = 0
    let lastMutationAt = startedAt
    let lastScrollAt = startedAt
    let previousRect: Rect | undefined
    let lastRect: Rect | undefined
    let geometryStableFrames = 0
    let cleanedUp = false
    let lastDetails: VisualStabilityResult = {
      requiredStableFrames: policy.stableFrames,
      observedStableFrames: 0,
      lastMutationAt,
      lastScrollAt,
    }

    this.#trace?.appendEvent?.('stability:start', {
      scope: target === undefined ? 'root' : 'target',
      policy,
      surfaceCount: scrollStates.length,
    })

    const onDirty = (event: LayoutInvalidationDirtyEvent) => {
      if (event.reason === 'mutation') {
        mutationGeneration += 1
        lastMutationAt = event.at
        this.#trace?.appendEvent?.('stability:mutation', { at: event.at })
      }
      if (event.reason === 'scroll') {
        scrollGeneration += 1
        lastScrollAt = event.at
        for (const state of scrollStates) state.stableFrames = 0
        this.#trace?.appendEvent?.('stability:scroll-dirty', { at: event.at })
      }
    }
    let dirtySubscription: Disposable | undefined
    const onAbort = () => controller.abort(options.signal?.reason)
    const cleanup = () => {
      if (cleanedUp) return
      cleanedUp = true
      options.signal?.removeEventListener('abort', onAbort)
      dirtySubscription?.dispose()
      controller.abort('visual stability complete')
      if (!wasRunning) this.#layoutInvalidation.stop()
    }

    try {
      if (!wasRunning) this.#layoutInvalidation.start()
      dirtySubscription = this.#layoutInvalidation.subscribeDirty(onDirty)
      options.signal?.addEventListener('abort', onAbort, { once: true })
      assertNotCancelled(options.signal, operation)

      for (;;) {
        await this.#timeline.nextFrame({ signal: controller.signal })
        assertNotCancelled(options.signal, operation)
        const sampledAt = this.#timeline.now()
        const mutationBefore = mutationGeneration
        const scrollBefore = scrollGeneration

        if (target !== undefined) {
          await this.#resolver.validate(target)
          const sampledRect = cloneRect(this.#geometry.getBoundingRect(target))
          const activeAnimationCount = this.#dom.getActiveAnimationCount?.(target.element) ?? 0
          previousRect = lastRect
          lastRect = sampledRect

          if (
            activeAnimationCount > 0 ||
            previousRect === undefined ||
            rectChanged(previousRect, sampledRect, policy.threshold)
          ) {
            geometryStableFrames = 0
          } else {
            geometryStableFrames += 1
          }

          if (activeAnimationCount > 0) {
            this.#trace?.appendEvent?.('stability:reset', {
              observedStableFrames: 0,
              reason: 'active-animation',
              activeAnimationCount,
            })
          }
        }

        for (const state of scrollStates) {
          const current = this.#dom.getScrollMetrics(state.target)
          if (state.previous === undefined || scrollChanged(state.previous, current, policy.threshold)) {
            state.stableFrames = 0
            if (state.previous !== undefined) lastScrollAt = sampledAt
          } else {
            state.stableFrames += 1
          }
          state.previous = current
        }

        const sampleRaced =
          mutationBefore !== mutationGeneration || scrollBefore !== scrollGeneration
        if (sampleRaced) {
          geometryStableFrames = 0
          for (const state of scrollStates) state.stableFrames = 0
        }

        const observedStableFrames = target === undefined
          ? minimumScrollStableFrames(scrollStates)
          : geometryStableFrames
        const details = (): VisualStabilityResult => ({
          requiredStableFrames: policy.stableFrames,
          observedStableFrames,
          ...(previousRect === undefined ? {} : { previousRect: cloneRect(previousRect) }),
          ...(lastRect === undefined ? {} : { lastRect: cloneRect(lastRect) }),
          lastMutationAt,
          lastScrollAt,
        })
        lastDetails = details()
        options.onObservation?.(lastDetails)
        this.#trace?.appendEvent?.('stability:layout-sample', lastDetails)

        if (sampleRaced || observedStableFrames === 0) {
          this.#trace?.appendEvent?.('stability:reset', {
            observedStableFrames,
            reason: sampleRaced ? 'dirty-during-sample' : 'geometry-or-scroll-changed',
          })
        } else {
          this.#trace?.appendEvent?.('stability:stable-frame', {
            observedStableFrames,
            requiredStableFrames: policy.stableFrames,
          })
        }

        if (deadline !== undefined && sampledAt >= deadline) {
          throw timeoutError(operation, normalizeNonNegative(options.timeout ?? 0, 0), {
            details: details(),
          })
        }

        const geometryStable =
          target === undefined || geometryStableFrames >= policy.stableFrames
        const scrollStable = scrollStates.every(
          (state) => state.stableFrames >= policy.stableFrames,
        )
        const mutationQuiet = sampledAt - lastMutationAt >= policy.quietMs
        const scrollQuiet = sampledAt - lastScrollAt >= policy.quietMs

        if (!sampleRaced && geometryStable && scrollStable && mutationQuiet && scrollQuiet) {
          this.#trace?.appendEvent?.('stability:complete', { outcome: 'success' })
          return lastDetails
        }
      }
    } catch (error) {
      if (options.signal?.aborted) {
        this.#trace?.appendEvent?.('stability:complete', {
          outcome: 'cancelled',
          code: 'ACTION_CANCELLED',
        })
        throw cancellationError(operation, options.signal.reason)
      }
      const code = diagnosticErrorCode(error)
      if (code === 'ACTION_TIMEOUT') {
        this.#trace?.attachSnapshot?.('stability:timeout', lastDetails)
      }
      this.#trace?.appendEvent?.('stability:complete', {
        outcome: code === 'ACTION_TIMEOUT' ? 'timed-out' : 'failed',
        ...(code === undefined ? {} : { code }),
      })
      throw error
    } finally {
      cleanup()
    }
  }

  #scrollStates(target: TargetHandle | undefined): ScrollState[] {
    const surfaces = target === undefined
      ? [this.#dom.getViewportScrollTarget(this.#dom.getRoot())]
      : this.#scrollChain.resolve(target).map((surface) => surface.scrollTarget)

    return [...new Set(surfaces)].map((surface) => ({
      target: surface,
      stableFrames: 0,
    }))
  }
}

function diagnosticErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function normalizePolicy(options: VisualStabilityOptions) {
  return {
    quietMs: normalizeNonNegative(options.quietMs, DEFAULT_VISUAL_STABILITY_POLICY.quietMs),
    stableFrames: normalizeStableFrames(options.stableFrames),
    threshold: normalizeNonNegative(options.threshold, DEFAULT_VISUAL_STABILITY_POLICY.threshold),
  }
}

function normalizeStableFrames(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_VISUAL_STABILITY_POLICY.stableFrames
  }
  return Math.max(1, Math.floor(value))
}

function normalizeNonNegative(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value)
}

function rectChanged(previous: Rect, current: Rect, threshold: number): boolean {
  return Math.abs(previous.x - current.x) > threshold ||
    Math.abs(previous.y - current.y) > threshold ||
    Math.abs(previous.width - current.width) > threshold ||
    Math.abs(previous.height - current.height) > threshold
}

function scrollChanged(previous: ScrollMetrics, current: ScrollMetrics, threshold: number): boolean {
  return Math.abs(previous.scrollLeft - current.scrollLeft) > threshold ||
    Math.abs(previous.scrollTop - current.scrollTop) > threshold
}

function minimumScrollStableFrames(states: readonly ScrollState[]): number {
  return states.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...states.map((state) => state.stableFrames))
}

function cloneRect(value: Rect): Rect {
  return { x: value.x, y: value.y, width: value.width, height: value.height }
}

function assertNotCancelled(signal: CancellationSignalLike | undefined, operation: string): void {
  if (signal?.aborted) throw cancellationError(operation, signal.reason)
}
