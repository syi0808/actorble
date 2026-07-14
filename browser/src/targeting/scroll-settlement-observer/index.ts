import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { cancellationError, timeoutError } from '../../shared/index.js'
import type {
  CancellationSignalLike,
  Disposable,
  DomReadPort,
  DurationMs,
  ScrollSettlePolicy,
} from '../../shared/index.js'
import type { TimelineEngine } from '../../runtime/timeline-engine/index.js'

export const DEFAULT_SCROLL_SETTLEMENT_POLICY = Object.freeze({
  quietMs: 80,
  stableFrames: 2,
  threshold: 0.5,
})

export type ScrollSettlementTimeline = Pick<TimelineEngine, 'nextFrame' | 'now'>

export type ScrollSettlementDomPort = Pick<
  DomReadPort,
  'getScrollMetrics' | 'observeScrollActivity' | 'observeScrollEnd'
>

export type ScrollSettlementOptions = Readonly<{
  quietMs?: DurationMs
  stableFrames?: number
  threshold?: number
  timeout?: DurationMs
  signal?: CancellationSignalLike
  operation?: string
}>

export interface ScrollSettlementObserver {
  settle(
    surfaces: readonly (Element | Window)[],
    options?: ScrollSettlementOptions,
  ): Promise<void>
}

export type ScrollSettlementObserverOptions = Readonly<{
  dom?: ScrollSettlementDomPort
  timeline?: ScrollSettlementTimeline
}>

type SurfaceState = {
  target: Element | Window
  previousX: number
  previousY: number
  stableFrames: number
  lastActivityAt: number
  nativeHinted: boolean
}

export class BrowserScrollSettlementObserver implements ScrollSettlementObserver {
  readonly #dom: ScrollSettlementDomPort
  readonly #timeline: ScrollSettlementTimeline

  constructor(options: ScrollSettlementObserverOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
  }

  async settle(
    surfaces: readonly (Element | Window)[],
    options: ScrollSettlementOptions = {},
  ): Promise<void> {
    const operation = options.operation ?? 'scroll.settle'
    assertNotCancelled(options.signal, operation)

    const targets = [...new Set(surfaces)]

    if (targets.length === 0) {
      return
    }

    const policy = normalizePolicy(options)
    const startedAt = this.#timeline.now()
    const deadline =
      options.timeout === undefined
        ? undefined
        : startedAt + normalizeNonNegative(options.timeout, 0)
    const disposables: Disposable[] = []
    let cleanedUp = false

    const cleanup = () => {
      if (cleanedUp) {
        return
      }

      cleanedUp = true

      for (const disposable of disposables.splice(0).reverse()) {
        disposable.dispose()
      }
    }

    try {
      const states = targets.map((target): SurfaceState => {
        const current = this.#dom.getScrollMetrics(target)

        return {
          target,
          previousX: current.scrollLeft,
          previousY: current.scrollTop,
          stableFrames: 0,
          lastActivityAt: startedAt,
          nativeHinted: false,
        }
      })

      for (const state of states) {
        disposables.push(
          this.#dom.observeScrollActivity(state.target, () => {
            state.lastActivityAt = this.#timeline.now()
          }),
        )

        const nativeSubscription = this.#dom.observeScrollEnd(state.target, () => {
          state.nativeHinted = true
        })

        if (nativeSubscription !== null) {
          disposables.push(nativeSubscription)
        }
      }

      while (true) {
        await this.#timeline.nextFrame({ signal: options.signal })
        assertNotCancelled(options.signal, operation)

        const sampledAt = this.#timeline.now()

        if (deadline !== undefined && sampledAt >= deadline) {
          throw timeoutError(operation, normalizeNonNegative(options.timeout ?? 0, 0))
        }

        let allStable = true

        for (const state of states) {
          const current = this.#dom.getScrollMetrics(state.target)
          const changed =
            Math.abs(current.scrollLeft - state.previousX) > policy.threshold ||
            Math.abs(current.scrollTop - state.previousY) > policy.threshold

          state.previousX = current.scrollLeft
          state.previousY = current.scrollTop

          if (changed) {
            state.stableFrames = 0
            state.lastActivityAt = sampledAt
          } else {
            state.stableFrames += 1
          }

          state.nativeHinted = false

          if (
            state.stableFrames < policy.stableFrames ||
            sampledAt - state.lastActivityAt < policy.quietMs
          ) {
            allStable = false
          }
        }

        if (allStable) {
          return
        }
      }
    } finally {
      cleanup()
    }
  }
}

export function createScrollSettlementObserver(
  options: ScrollSettlementObserverOptions = {},
): ScrollSettlementObserver {
  return new BrowserScrollSettlementObserver(options)
}

export function scrollSettlementOptionsFor(
  policy: Exclude<ScrollSettlePolicy, 'none' | 'next-frame'>,
): Pick<ScrollSettlementOptions, 'quietMs' | 'stableFrames' | 'threshold'> {
  if (policy === 'scroll-stable') {
    return { ...DEFAULT_SCROLL_SETTLEMENT_POLICY }
  }

  return normalizePolicy(policy)
}

function normalizePolicy(
  options: Pick<ScrollSettlementOptions, 'quietMs' | 'stableFrames' | 'threshold'>,
) {
  return {
    quietMs: normalizeNonNegative(
      options.quietMs,
      DEFAULT_SCROLL_SETTLEMENT_POLICY.quietMs,
    ),
    stableFrames: normalizeStableFrames(options.stableFrames),
    threshold: normalizeNonNegative(
      options.threshold,
      DEFAULT_SCROLL_SETTLEMENT_POLICY.threshold,
    ),
  }
}

function normalizeNonNegative(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : Math.max(0, value)
}

function normalizeStableFrames(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return DEFAULT_SCROLL_SETTLEMENT_POLICY.stableFrames
  }

  return Math.max(1, Math.floor(value))
}

function assertNotCancelled(
  signal: CancellationSignalLike | undefined,
  operation: string,
): void {
  if (signal?.aborted) {
    throw cancellationError(operation, signal.reason)
  }
}
