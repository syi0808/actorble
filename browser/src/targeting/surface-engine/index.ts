import {
  actorbleError,
  cancellationError,
  notImplemented,
  timeoutError,
} from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import { createFrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type { FrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import {
  createScrollChainResolver,
  type ScrollChainResolver,
  type ScrollSurfaceSnapshot,
} from '../scroll-chain-resolver/index.js'
import { createRevealPlanner, type RevealPlanner } from '../reveal-planner/index.js'
import {
  createScrollSettlementObserver,
  scrollSettlementOptionsFor,
  type ScrollSettlementObserver,
  type ScrollSettlementTimeline,
} from '../scroll-settlement-observer/index.js'
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
  ScrollMotion,
  ScrollSettlePolicy,
  ScrollDelta,
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
}

export type SurfaceEngineOptions = Readonly<{
  cache?: FrameGeometrySurfaceCache
  clock?: Clock
  dom?: DomPort
  geometry?: RevealGeometryReader | (() => RevealGeometryReader)
  revealPlanner?: RevealPlanner
  scrollChainResolver?: ScrollChainResolver
  settlementObserver?: ScrollSettlementObserver
  timeline?: ScrollSettlementTimeline
}>

export type RevealGeometrySnapshot = Readonly<{
  rect: Rect
  visibleRect: Rect | null
  coordinateSpace: CoordinateSpace
}>

export interface RevealGeometryReader {
  snapshot(target: TargetHandle): Promise<RevealGeometrySnapshot>
}

export class BrowserSurfaceEngine implements SurfaceEngine {
  readonly #cache: FrameGeometrySurfaceCache
  readonly #clock: Clock
  readonly #dom: DomPort
  readonly #geometry?: () => RevealGeometryReader
  readonly #revealPlanner: RevealPlanner
  readonly #scrollChainResolver: ScrollChainResolver
  readonly #settlementObserver: ScrollSettlementObserver
  readonly #timeline: ScrollSettlementTimeline

  constructor(options: SurfaceEngineOptions = {}) {
    const timeline = options.timeline ?? new BrowserTimelineEngine()

    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#cache = options.cache ?? createFrameGeometrySurfaceCache()
    this.#clock = options.clock ?? timeline
    this.#timeline = timeline
    this.#geometry =
      options.geometry === undefined
        ? undefined
        : typeof options.geometry === 'function'
          ? options.geometry
          : () => options.geometry as RevealGeometryReader
    this.#revealPlanner = options.revealPlanner ?? createRevealPlanner()
    this.#scrollChainResolver =
      options.scrollChainResolver ?? createScrollChainResolver({ dom: this.#dom, cache: this.#cache })
    this.#settlementObserver =
      options.settlementObserver ??
      createScrollSettlementObserver({ dom: this.#dom, timeline: this.#timeline })
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
    return this.#scrollChainResolver
      .resolve(target)
      .filter((surface) => surface.kind === 'element')
      .map((surface) => surface.scrollTarget as Element)
  }

  async ensureVisible(target: TargetHandle, options: EnsureVisibleOptions = {}): Promise<void> {
    this.#dom.scrollIntoView(target.element, revealToScrollIntoViewOptions(options))
    this.#cache.invalidate('scroll')
  }

  async reveal(target: TargetHandle, options: RevealOptions = {}): Promise<RevealResult> {
    const deadline = deadlineFor(this.#clock, options.timeout)
    assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)

    const geometry = this.#geometry?.()
    if (geometry === undefined) {
      return notImplemented('SurfaceEngine.reveal.geometry')
    }

    const initialGeometry = await geometry.snapshot(target)
    assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)
    assertViewportRevealGeometry(initialGeometry)
    const before = visibilitySnapshot(initialGeometry.rect, initialGeometry.visibleRect)
    const canonicalChain = this.#selectedRevealChain(
      this.#scrollChainResolver.resolve(target),
      options,
    )
    const executedSteps: Array<
      Omit<RevealResult['steps'][number], 'to'> & { scrollTarget: Element | Window }
    > = []
    const changedSurfaces = new Set<Element | Window>()
    let currentGeometry = initialGeometry

    for (let index = 0; index < canonicalChain.length; index += 1) {
      assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)

      if (index > 0) {
        currentGeometry = await geometry.snapshot(target)
        assertViewportRevealGeometry(currentGeometry)
      }

      const canonicalSurface = canonicalChain[index]
      const freshSurface = this.#scrollChainResolver
        .resolve(target)
        .find((surface) => surface.id === canonicalSurface.id)

      if (freshSurface === undefined) {
        continue
      }

      const [planned] = this.#revealPlanner.plan({
        target: {
          rect: currentGeometry.rect,
          visibleRect: currentGeometry.visibleRect,
          coordinateSpace: 'viewport',
          scrollMargin: this.#readScrollStyle(target.element).scrollMargin,
        },
        surfaces: [freshSurface],
        options,
      })

      if (planned === undefined) {
        continue
      }

      assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)
      const execution = this.#executeScroll(
        freshSurface.scrollTarget,
        planned.intendedTo,
        options.motion,
        'surface.reveal',
        deadline,
        options.signal,
      )
      if (execution !== undefined) {
        await execution
      }
      executedSteps.push({
        surfaceId: planned.surfaceId,
        from: Object.freeze({ ...planned.from }),
        intendedTo: Object.freeze({ ...planned.intendedTo }),
        axes: Object.freeze([...planned.axes]),
        scrollTarget: freshSurface.scrollTarget,
      })

      if (!samePoint(planned.from, planned.intendedTo)) {
        changedSurfaces.add(freshSurface.scrollTarget)
      }
      assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)
    }

    await this.#settleSurfaces(
      [...changedSurfaces],
      options.settle,
      'surface.reveal',
      deadline,
      options.signal,
    )
    this.#cache.invalidate('scroll')
    const steps: RevealResult['steps'][number][] = executedSteps.map(
      ({ scrollTarget, ...step }) =>
        Object.freeze({
          ...step,
          to: Object.freeze(this.#readScrollPosition(scrollTarget)),
        }),
    )

    const finalGeometry = await geometry.snapshot(target)
    assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)
    assertViewportRevealGeometry(finalGeometry)
    const after = visibilitySnapshot(finalGeometry.rect, finalGeometry.visibleRect)

    return Object.freeze({
      target,
      changed: steps.some(
        (step) => step.from.x !== step.to.x || step.from.y !== step.to.y,
      ),
      before: Object.freeze(before),
      after: Object.freeze(after),
      fullyVisible: after.fullyVisible,
      visibilityRatio: after.visibilityRatio,
      steps: Object.freeze(steps),
    })
  }

  async scrollTo(position: ScrollPosition, options: ScrollOptions = {}): Promise<ScrollResult> {
    const deadline = deadlineFor(this.#clock, options.timeout)
    assertOperationBoundary('surface.scrollTo', this.#clock, deadline, options.signal)
    const before = this.#getViewportScrollOffset()
    const target = this.#dom.getViewportScrollTarget(this.#dom.getRoot())
    const execution = this.#executeScroll(
      target,
      position,
      options.motion,
      'surface.scrollTo',
      deadline,
      options.signal,
    )
    if (execution !== undefined) {
      await execution
    }
    await this.#settleSurfaces(
      samePoint(before, position) ? [] : [target],
      options.settle,
      'surface.scrollTo',
      deadline,
      options.signal,
    )
    this.#cache.invalidate('scroll')
    const after = this.#getViewportScrollOffset()
    assertOperationBoundary('surface.scrollTo', this.#clock, deadline, options.signal)
    return { changed: before.x !== after.x || before.y !== after.y, before, after }
  }

  async scrollBy(delta: ScrollDelta, options: ScrollOptions = {}): Promise<ScrollResult> {
    const deadline = deadlineFor(this.#clock, options.timeout)
    assertOperationBoundary('surface.scrollBy', this.#clock, deadline, options.signal)
    const before = this.#getViewportScrollOffset()
    const target = this.#dom.getViewportScrollTarget(this.#dom.getRoot())
    const intended = { x: before.x + delta.x, y: before.y + delta.y }
    const execution = this.#executeScroll(
      target,
      intended,
      options.motion,
      'surface.scrollBy',
      deadline,
      options.signal,
    )
    if (execution !== undefined) {
      await execution
    }
    await this.#settleSurfaces(
      samePoint(before, intended) ? [] : [target],
      options.settle,
      'surface.scrollBy',
      deadline,
      options.signal,
    )
    this.#cache.invalidate('scroll')
    const after = this.#getViewportScrollOffset()
    assertOperationBoundary('surface.scrollBy', this.#clock, deadline, options.signal)
    return { changed: before.x !== after.x || before.y !== after.y, before, after }
  }

  mapPoint(point: Point, from: CoordinateSpace, to: CoordinateSpace): Point {
    if (from === to) {
      return point
    }

    if (from === 'viewport' && to === 'document') {
      const scrollOffset = this.#getViewportScrollOffset()

      return {
        x: point.x + scrollOffset.x,
        y: point.y + scrollOffset.y,
      }
    }

    if (from === 'document' && to === 'viewport') {
      const scrollOffset = this.#getViewportScrollOffset()

      return {
        x: point.x - scrollOffset.x,
        y: point.y - scrollOffset.y,
      }
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

  #executeScroll(
    target: Element | Window,
    position: ScrollPosition,
    motion: ScrollMotion | undefined,
    operation: string,
    deadline: OperationDeadline | undefined,
    signal: CancellationSignalLike | undefined,
  ): Promise<void> | undefined {
    if (motion?.kind !== 'timed') {
      this.#dom.scrollTo(target, position, {
        behavior: motion?.kind === 'native-smooth' ? 'smooth' : 'instant',
      })
      this.#cache.invalidate('scroll')
      return
    }

    return this.#executeTimedScroll(target, position, motion, operation, deadline, signal)
  }

  async #executeTimedScroll(
    target: Element | Window,
    position: ScrollPosition,
    motion: Extract<ScrollMotion, { kind: 'timed' }>,
    operation: string,
    deadline: OperationDeadline | undefined,
    signal: CancellationSignalLike | undefined,
  ): Promise<void> {
    const from = this.#readScrollPosition(target)
    const duration = normalizeDuration(motion.duration)

    if (duration === 0 || samePoint(from, position)) {
      this.#writeTimedScrollFrame(target, position)
      assertOperationBoundary(operation, this.#clock, deadline, signal)
      return
    }

    const startedAt = this.#timeline.now()

    while (true) {
      try {
        await this.#timeline.nextFrame({ signal })
      } catch (error) {
        if (signal?.aborted) {
          throw cancellationError(operation, signal.reason)
        }

        throw error
      }

      assertOperationBoundary(operation, this.#clock, deadline, signal)
      const progress = Math.min(1, Math.max(0, (this.#timeline.now() - startedAt) / duration))
      const easedProgress = sampleTimingProgress(motion.timing ?? 'ease-in-out', progress)
      const framePosition =
        progress >= 1 ? position : interpolatePoint(from, position, easedProgress)

      this.#writeTimedScrollFrame(target, framePosition)
      assertOperationBoundary(operation, this.#clock, deadline, signal)

      if (progress >= 1) {
        return
      }
    }
  }

  #writeTimedScrollFrame(target: Element | Window, position: ScrollPosition): void {
    const metrics = this.#cache.getScrollMetrics(target, () => this.#dom.getScrollMetrics(target))
    const clamped = {
      x: clamp(position.x, 0, Math.max(0, metrics.scrollWidth - metrics.clientWidth)),
      y: clamp(position.y, 0, Math.max(0, metrics.scrollHeight - metrics.clientHeight)),
    }

    this.#dom.scrollTo(target, clamped, { behavior: 'instant' })
    this.#cache.invalidate('scroll')
  }

  #getViewportScrollOffset(): Point {
    const target = this.#dom.getViewportScrollTarget(this.#dom.getRoot())
    return this.#readScrollPosition(target)
  }

  #readScrollPosition(target: Element | Window): Point {
    const metrics = this.#cache.getScrollMetrics(target, () => this.#dom.getScrollMetrics(target))

    return {
      x: metrics.scrollLeft,
      y: metrics.scrollTop,
    }
  }

  #readScrollStyle(element: Element) {
    return this.#cache.getComputedScrollStyle(element, () =>
      this.#dom.getComputedScrollStyle(element),
    )
  }

  #selectedRevealChain(
    chain: readonly ScrollSurfaceSnapshot[],
    options: RevealOptions,
  ): readonly ScrollSurfaceSnapshot[] {
    return (options.container ?? 'all') === 'nearest' ? chain.slice(0, 1) : chain
  }

  async #settleSurfaces(
    surfaces: readonly (Element | Window)[],
    policy: ScrollSettlePolicy | undefined,
    operation: string,
    deadline: OperationDeadline | undefined,
    signal: CancellationSignalLike | undefined,
  ): Promise<void> {
    if (surfaces.length === 0 || policy === undefined || policy === 'none') {
      return
    }

    if (policy === 'next-frame') {
      await this.#timeline.nextFrame({ signal })
      assertOperationBoundary(operation, this.#clock, deadline, signal)
      return
    }

    await this.#settlementObserver.settle(surfaces, {
      ...scrollSettlementOptionsFor(policy),
      ...(deadline === undefined
        ? {}
        : { timeout: Math.max(0, deadline.at - this.#clock.now()) }),
      ...(signal === undefined ? {} : { signal }),
      operation,
    })
    assertOperationBoundary(operation, this.#clock, deadline, signal)
  }
}

export function createSurfaceEngine(options: SurfaceEngineOptions = {}): SurfaceEngine {
  return new BrowserSurfaceEngine(options)
}

function revealToScrollIntoViewOptions(
  options: EnsureVisibleOptions,
): ScrollIntoViewOptions | undefined {
  const scrollOptions: ScrollIntoViewOptions = {}

  if (options.block !== undefined) {
    scrollOptions.block = options.block
  }

  if (options.inline !== undefined) {
    scrollOptions.inline = options.inline
  }

  return Object.keys(scrollOptions).length === 0 ? undefined : scrollOptions
}

function samePoint(left: Point, right: Point): boolean {
  return left.x === right.x && left.y === right.y
}

function normalizeDuration(duration: number): number {
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

function interpolatePoint(from: Point, to: Point, progress: number): Point {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  }
}

function sampleTimingProgress(timing: PointerMotionTiming, progress: number): number {
  switch (timing) {
    case 'linear':
      return progress
    case 'ease-in':
      return progress * progress
    case 'ease-out':
      return 1 - (1 - progress) * (1 - progress)
    case 'ease-in-out':
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function assertViewportRevealGeometry(snapshot: RevealGeometrySnapshot): void {
  if (snapshot.coordinateSpace !== 'viewport') {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      'Reveal geometry must use viewport coordinates.',
      {
        details: {
          boundary: 'surface-engine',
          coordinateSpace: snapshot.coordinateSpace,
        },
      },
    )
  }
}

function visibilitySnapshot(rect: Rect, visibleRect: Rect | null): VisibilitySnapshot {
  if (rect.width <= 0 || rect.height <= 0 || visibleRect === null) {
    return { visibilityRatio: 0, fullyVisible: false }
  }

  const visibleArea = Math.max(0, visibleRect.width) * Math.max(0, visibleRect.height)
  const ratio = Math.min(1, Math.max(0, visibleArea / (rect.width * rect.height)))
  return { visibilityRatio: ratio, fullyVisible: ratio >= 1 }
}

type OperationDeadline = Readonly<{ at: number; timeout: number }>

function deadlineFor(clock: Clock, timeout: number | undefined): OperationDeadline | undefined {
  if (timeout === undefined) {
    return undefined
  }

  const normalized = Number.isFinite(timeout) && timeout > 0 ? timeout : 0
  return { at: clock.now() + normalized, timeout: normalized }
}

function assertOperationBoundary(
  operation: string,
  clock: Clock,
  deadline: OperationDeadline | undefined,
  signal: RevealOptions['signal'],
): void {
  if (signal?.aborted) {
    throw cancellationError(operation, signal.reason)
  }

  if (deadline !== undefined && clock.now() >= deadline.at) {
    throw timeoutError(operation, deadline.timeout, {
      details: { deadline: deadline.at },
    })
  }
}
