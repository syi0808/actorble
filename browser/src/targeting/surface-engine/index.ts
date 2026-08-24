import {
  ScrollAbortError,
  createScrollEngine,
  discoverScrollChain,
  easeIn,
  easeInOut,
  easeOut,
  linear,
} from 'scroller2'
import type {
  ExecutedScrollStep,
  MotionOptions,
  RevealOptions as ScrollerRevealOptions,
  RevealResult as ScrollerRevealResult,
  ScrollEngine,
  ScrollOptions as ScrollerScrollOptions,
  ScrollSurface,
  SettlementOptions,
  VisibilitySnapshot as ScrollerVisibilitySnapshot,
} from 'scroller2'
import { actorbleError, cancellationError, timeoutError } from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { createFrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import { ActorbleScrollerPlatform } from '../scroller2-platform-adapter/index.js'
import type { FrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type {
  Clock,
  CancellationSignalLike,
  CoordinateSpace,
  DomPort,
  OperationOptions,
  Point,
  PointerMotionTiming,
  Rect,
  RevealOptions,
  RevealResult,
  ScrollDelta,
  ScrollMotion,
  ScrollOptions,
  ScrollPosition,
  ScrollResult,
  TargetHandle,
  VisibilitySnapshot,
} from '../../shared/index.js'

export type EnsureVisibleOptions = OperationOptions &
  Readonly<{
    block?: ScrollLogicalPosition
    inline?: ScrollLogicalPosition
  }>

export type SurfaceSnapshot = Readonly<{
  id: string
  root: Document | ShadowRoot | Element
  coordinateSpace: CoordinateSpace
  viewport: Rect | null
  clippingChain: readonly Element[]
}>

export interface SurfaceEngine {
  getSurfaceFor(target: TargetHandle): SurfaceSnapshot
  getScrollableAncestors(target: TargetHandle): readonly Element[]
  ensureVisible(target: TargetHandle, options?: EnsureVisibleOptions): Promise<void>
  reveal(target: TargetHandle, options?: RevealOptions): Promise<RevealResult>
  scrollTo(position: ScrollPosition, options?: ScrollOptions): Promise<ScrollResult>
  scrollBy(delta: ScrollDelta, options?: ScrollOptions): Promise<ScrollResult>
  mapPoint(point: Point, from: CoordinateSpace, to: CoordinateSpace): Point
  dispose?(): void
}

export type SurfaceEngineOptions = Readonly<{
  cache?: FrameGeometrySurfaceCache
  clock?: Clock
  dom?: DomPort
  scrollEngine?: unknown
  trace?: SurfaceTraceRecorder
}>

export type SurfaceTraceRecorder = Readonly<{
  appendEvent(name: string, data?: unknown): void
  attachSnapshot(name: string, data: unknown): void
}>

export class BrowserSurfaceEngine implements SurfaceEngine {
  readonly #cache: FrameGeometrySurfaceCache
  readonly #clock: Clock
  readonly #dom: DomPort
  readonly #ownsScrollEngine: boolean
  readonly #platform: ActorbleScrollerPlatform
  #scrollEngine?: ScrollEngine
  readonly #surfaceIds = new WeakMap<object, string>()
  readonly #trace?: SurfaceTraceRecorder
  #nextSurfaceId = 1

  constructor(options: SurfaceEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#cache = options.cache ?? createFrameGeometrySurfaceCache()
    this.#clock = options.clock ?? { now: () => performance.now() }
    this.#platform = new ActorbleScrollerPlatform(this.#dom)
    this.#ownsScrollEngine = options.scrollEngine === undefined
    this.#scrollEngine = options.scrollEngine as ScrollEngine | undefined
    this.#trace = options.trace
  }

  dispose(): void {
    if (this.#ownsScrollEngine) this.#scrollEngine?.destroy()
    this.#scrollEngine = undefined
  }

  getSurfaceFor(target: TargetHandle): SurfaceSnapshot {
    return {
      id: target.surfaceId ?? 'viewport',
      root: target.root,
      coordinateSpace: 'viewport',
      viewport: this.#cache.getViewportRect(target.root, () =>
        this.#dom.getViewportRect(target.root),
      ),
      clippingChain: this.getScrollableAncestors(target),
    }
  }

  getScrollableAncestors(target: TargetHandle): readonly Element[] {
    return this.#cache.getScrollableAncestors(
      target.element,
      () => discoverScrollChain(target.element, this.#platform).filter(
        (surface): surface is Element => !isWindow(surface),
      ),
    )
  }

  async ensureVisible(target: TargetHandle, options: EnsureVisibleOptions = {}): Promise<void> {
    this.#dom.scrollIntoView(target.element, revealToScrollIntoViewOptions(options))
    this.#cache.invalidate('scroll')
  }

  async reveal(target: TargetHandle, options: RevealOptions = {}): Promise<RevealResult> {
    const startedAt = this.#clock.now()
    const policy = summarizeRevealPolicy(options)
    this.#trace?.appendEvent('reveal:start', { policy })

    try {
      const result = await this.#runOperation(
        'surface.reveal',
        options.timeout,
        options.signal,
        async (signal) => {
          const mapped = mapRevealOptions(options, signal)
          this.#trace?.appendEvent('reveal:visibility-before', {
            visibility: mapVisibility(this.#scroller().planReveal(target.element, mapped).before),
          })
          const scrollerResult = requiresManualReveal(options)
            ? await this.#executeAdjustedReveal(target.element, options, mapped)
            : await this.#scroller().reveal(target.element, mapped)
          return this.#mapRevealResult(target, scrollerResult)
        },
      )

      this.#cache.invalidate('scroll')
      this.#traceRevealResult(result)
      this.#trace?.appendEvent('reveal:complete', {
        outcome: 'success',
        changed: result.changed,
        fullyVisible: result.fullyVisible,
        visibilityRatio: result.visibilityRatio,
        frameCount: result.steps.length,
      })
      return result
    } catch (error) {
      const code = diagnosticErrorCode(error)
      if (code === 'ACTION_TIMEOUT') {
        this.#trace?.attachSnapshot('reveal:timeout', {
          phase: 'scroller2',
          elapsed: this.#clock.now() - startedAt,
          policy,
        })
      }
      this.#trace?.appendEvent('reveal:complete', {
        outcome: code === 'ACTION_TIMEOUT'
          ? 'timed-out'
          : code === 'ACTION_CANCELLED'
            ? 'cancelled'
            : 'failed',
        ...(code === undefined ? {} : { code }),
      })
      throw error
    }
  }

  async scrollTo(position: ScrollPosition, options: ScrollOptions = {}): Promise<ScrollResult> {
    return this.#explicitScroll('surface.scrollTo', position, options, false)
  }

  async scrollBy(delta: ScrollDelta, options: ScrollOptions = {}): Promise<ScrollResult> {
    return this.#explicitScroll('surface.scrollBy', delta, options, true)
  }

  mapPoint(point: Point, from: CoordinateSpace, to: CoordinateSpace): Point {
    if (from === to) return point

    const offset = this.#readViewportScroll()
    if (from === 'viewport' && to === 'document') {
      return { x: point.x + offset.x, y: point.y + offset.y }
    }
    if (from === 'document' && to === 'viewport') {
      return { x: point.x - offset.x, y: point.y - offset.y }
    }

    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      `Coordinate conversion from ${from} to ${to} is not supported by the surface engine yet.`,
      {
        details: {
          boundary: 'surface-engine',
          from,
          to,
          point,
          supportedConversions: ['viewport:document', 'document:viewport'],
        },
      },
    )
  }

  async #explicitScroll(
    operation: 'surface.scrollTo' | 'surface.scrollBy',
    vector: ScrollPosition | ScrollDelta,
    options: ScrollOptions,
    relative: boolean,
  ): Promise<ScrollResult> {
    const surface = this.#dom.getViewportScrollTarget(this.#dom.getRoot())
    const before = this.#platform.readScroll(surface)
    const step = await this.#runOperation(operation, options.timeout, options.signal, (signal) => {
      const mapped = mapScrollOptions(options, signal)
      return relative
        ? this.#scroller().by(surface, vector, mapped)
        : this.#scroller().to(surface, vector, mapped)
    })
    this.#cache.invalidate('scroll')
    const after = { ...step.actualTo }
    return Object.freeze({
      changed: before.x !== after.x || before.y !== after.y,
      before: Object.freeze({ ...before }),
      after: Object.freeze(after),
    })
  }

  async #executeAdjustedReveal(
    target: Element,
    options: RevealOptions,
    mapped: ScrollerRevealOptions,
  ): Promise<ScrollerRevealResult> {
    const startedAt = this.#clock.now()
    const initial = this.#scroller().planReveal(target, mapped)
    const selected = (options.container ?? 'all') === 'nearest'
      ? initial.steps.slice(0, 1)
      : initial.steps
    const offset = options.offset ?? { x: 0, y: 0 }
    const executed: ExecutedScrollStep[] = []

    for (const step of selected) {
      executed.push(await this.#scroller().to(
        step.surface,
        { x: step.to.x - offset.x, y: step.to.y - offset.y },
        {
          motion: mapped.motion,
          settle: mapped.settle,
          signal: mapped.signal,
        },
      ))
    }

    const after = this.#scroller().planReveal(target, mapped).before
    return {
      changed: executed.some((step) => !samePoint(step.from, step.actualTo)),
      before: initial.before,
      after,
      fullyVisible: after.fullyVisible,
      visibilityRatio: after.visibilityRatio,
      steps: Object.freeze(executed),
      elapsed: this.#clock.now() - startedAt,
    }
  }

  #mapRevealResult(target: TargetHandle, result: ScrollerRevealResult): RevealResult {
    return Object.freeze({
      target,
      changed: result.changed,
      before: Object.freeze(mapVisibility(result.before)),
      after: Object.freeze(mapVisibility(result.after)),
      fullyVisible: result.fullyVisible,
      visibilityRatio: result.visibilityRatio,
      steps: Object.freeze(result.steps.map((step) => Object.freeze({
        surfaceId: this.#surfaceId(step.surface),
        from: Object.freeze({ ...step.from }),
        intendedTo: Object.freeze({ ...step.plannedTo }),
        to: Object.freeze({ ...step.actualTo }),
        axes: Object.freeze([...step.axes]),
      }))),
    })
  }

  #traceRevealResult(result: RevealResult): void {
    this.#trace?.appendEvent('reveal:scroll-chain', {
      surfaces: result.steps.map((step) => ({ surfaceId: step.surfaceId })),
    })
    for (const step of result.steps) {
      const data = {
        surfaceId: step.surfaceId,
        from: { ...step.from },
        intendedTo: { ...step.intendedTo },
        to: { ...step.to },
        axes: [...step.axes],
      }
      this.#trace?.appendEvent('reveal:plan', { ...data, planned: true })
      this.#trace?.appendEvent('reveal:step-start', data)
      this.#trace?.appendEvent('reveal:step-end', data)
    }
    this.#trace?.appendEvent('reveal:visibility-after', { visibility: result.after })
  }

  #surfaceId(surface: ScrollSurface): string {
    if (isWindow(surface)) return 'viewport'
    const existing = this.#surfaceIds.get(surface)
    if (existing !== undefined) return existing
    const id = `scroll-surface-${this.#nextSurfaceId++}`
    this.#surfaceIds.set(surface, id)
    return id
  }

  #readViewportScroll(): Point {
    return this.#platform.readScroll(
      this.#dom.getViewportScrollTarget(this.#dom.getRoot()),
    )
  }

  #scroller(): ScrollEngine {
    this.#scrollEngine ??= createScrollEngine({
      platform: this.#platform,
      now: () => this.#clock.now(),
    })
    return this.#scrollEngine
  }

  async #runOperation<T>(
    operation: string,
    timeout: number | undefined,
    signal: CancellationSignalLike | undefined,
    run: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) throw cancellationError(operation, signal.reason)
    const normalizedTimeout = normalizeTimeout(timeout)
    if (normalizedTimeout === 0) throw timeoutError(operation, 0)

    const controller = new AbortController()
    let timedOut = false
    const abort = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', abort, { once: true })
    const timer = normalizedTimeout === undefined
      ? undefined
      : setTimeout(() => {
          timedOut = true
          controller.abort()
        }, normalizedTimeout)

    try {
      return await run(controller.signal)
    } catch (error) {
      if (timedOut) throw timeoutError(operation, normalizedTimeout ?? 0)
      if (signal?.aborted || error instanceof ScrollAbortError) {
        throw cancellationError(operation, signal?.reason)
      }
      throw error
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
}

export function createSurfaceEngine(options: SurfaceEngineOptions = {}): SurfaceEngine {
  return new BrowserSurfaceEngine(options)
}

function mapRevealOptions(options: RevealOptions, signal: AbortSignal): ScrollerRevealOptions {
  return {
    visibility: options.visibility ?? 'any',
    block: options.block ?? 'nearest',
    inline: options.inline ?? 'nearest',
    safeArea: options.safeArea,
    motion: mapMotion(options.motion),
    settle: mapSettlement(options.settle, options.timeout),
    signal,
  }
}

function mapScrollOptions(options: ScrollOptions, signal: AbortSignal): ScrollerScrollOptions {
  return {
    motion: mapMotion(options.motion),
    settle: mapSettlement(options.settle, options.timeout),
    signal,
  }
}

function mapMotion(motion: ScrollMotion | undefined): MotionOptions | 'instant' | 'smooth' {
  if (motion === undefined || motion.kind === 'instant') return 'instant'
  if (motion.kind === 'native-smooth') return 'smooth'
  return {
    type: 'tween',
    duration: Math.max(0, motion.duration),
    easing: easingFor(motion.timing),
  }
}

function easingFor(timing: PointerMotionTiming | undefined) {
  switch (timing ?? 'ease-in-out') {
    case 'linear': return linear
    case 'ease-in': return easeIn
    case 'ease-out': return easeOut
    case 'ease-in-out': return easeInOut
  }
}

function mapSettlement(
  policy: RevealOptions['settle'],
  timeout: number | undefined,
): SettlementOptions | false {
  if (policy === undefined || policy === 'none') return false
  if (policy === 'next-frame') {
    return { stableFrames: 1, quietMs: 0, ...(timeout === undefined ? {} : { timeout }) }
  }
  if (policy === 'scroll-stable') {
    return { ...(timeout === undefined ? {} : { timeout }) }
  }
  return {
    quietMs: policy.quietMs,
    stableFrames: policy.stableFrames,
    threshold: policy.threshold,
    ...(timeout === undefined ? {} : { timeout }),
  }
}

function mapVisibility(snapshot: ScrollerVisibilitySnapshot): VisibilitySnapshot {
  return {
    visibilityRatio: snapshot.visibilityRatio,
    fullyVisible: snapshot.fullyVisible,
  }
}

function requiresManualReveal(options: RevealOptions): boolean {
  return options.container === 'nearest' || options.offset !== undefined
}

function summarizeRevealPolicy(options: RevealOptions): Record<string, unknown> {
  return {
    visibility: options.visibility ?? 'any',
    block: options.block ?? 'nearest',
    inline: options.inline ?? 'nearest',
    container: options.container ?? 'all',
    motion: options.motion?.kind ?? 'instant',
    settle: typeof options.settle === 'object' ? { ...options.settle } : options.settle ?? 'none',
    ...(options.safeArea === undefined ? {} : { safeArea: { ...options.safeArea } }),
    ...(options.offset === undefined ? {} : { offset: { ...options.offset } }),
  }
}

function revealToScrollIntoViewOptions(
  options: EnsureVisibleOptions,
): ScrollIntoViewOptions | undefined {
  const scrollOptions: ScrollIntoViewOptions = {}
  if (options.block !== undefined) scrollOptions.block = options.block
  if (options.inline !== undefined) scrollOptions.inline = options.inline
  return Object.keys(scrollOptions).length === 0 ? undefined : scrollOptions
}

function normalizeTimeout(timeout: number | undefined): number | undefined {
  if (timeout === undefined) return undefined
  return Number.isFinite(timeout) && timeout > 0 ? timeout : 0
}

function diagnosticErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}

function isWindow(surface: ScrollSurface): surface is Window {
  return 'window' in surface && surface.window === surface
}
