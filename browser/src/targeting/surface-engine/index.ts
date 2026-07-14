import {
  actorbleError,
  cancellationError,
  notImplemented,
  timeoutError,
} from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { createFrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type { FrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import {
  createScrollChainResolver,
  type ScrollChainResolver,
  type ScrollSurfaceSnapshot,
} from '../scroll-chain-resolver/index.js'
import { createRevealPlanner, type RevealPlanner } from '../reveal-planner/index.js'
import type {
  Clock,
  CoordinateSpace,
  DomPort,
  OperationOptions,
  Point,
  Rect,
  RevealOptions,
  RevealResult,
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

  constructor(options: SurfaceEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#cache = options.cache ?? createFrameGeometrySurfaceCache()
    this.#clock = options.clock ?? { now: () => Date.now() }
    this.#geometry =
      options.geometry === undefined
        ? undefined
        : typeof options.geometry === 'function'
          ? options.geometry
          : () => options.geometry as RevealGeometryReader
    this.#revealPlanner = options.revealPlanner ?? createRevealPlanner()
    this.#scrollChainResolver =
      options.scrollChainResolver ?? createScrollChainResolver({ dom: this.#dom, cache: this.#cache })
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
    assertSupportedRevealOptions(options)
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
    const steps: RevealResult['steps'][number][] = []
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
      this.#dom.scrollTo(freshSurface.scrollTarget, planned.intendedTo, { behavior: 'instant' })
      this.#cache.invalidate('scroll')
      const actual = this.#readScrollPosition(freshSurface.scrollTarget)

      steps.push(
        Object.freeze({
          surfaceId: planned.surfaceId,
          from: Object.freeze({ ...planned.from }),
          intendedTo: Object.freeze({ ...planned.intendedTo }),
          to: Object.freeze(actual),
          axes: Object.freeze([...planned.axes]),
        }),
      )
      assertOperationBoundary('surface.reveal', this.#clock, deadline, options.signal)
    }

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
    assertSupportedExplicitScrollOptions(options)
    const deadline = deadlineFor(this.#clock, options.timeout)
    assertOperationBoundary('surface.scrollTo', this.#clock, deadline, options.signal)
    const before = this.#getViewportScrollOffset()
    this.#scrollViewportTo(position, options)
    this.#cache.invalidate('scroll')
    const after = this.#getViewportScrollOffset()
    assertOperationBoundary('surface.scrollTo', this.#clock, deadline, options.signal)
    return { changed: before.x !== after.x || before.y !== after.y, before, after }
  }

  async scrollBy(delta: ScrollDelta, options: ScrollOptions = {}): Promise<ScrollResult> {
    assertSupportedExplicitScrollOptions(options)
    const deadline = deadlineFor(this.#clock, options.timeout)
    assertOperationBoundary('surface.scrollBy', this.#clock, deadline, options.signal)
    const before = this.#getViewportScrollOffset()
    this.#scrollViewportTo({ x: before.x + delta.x, y: before.y + delta.y }, options)
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

  #scrollViewportTo(position: ScrollPosition, options: ScrollOptions): void {
    this.#dom.scrollTo(
      this.#dom.getViewportScrollTarget(this.#dom.getRoot()),
      { x: position.x, y: position.y },
      options.motion?.kind === 'native-smooth'
        ? { behavior: 'smooth' }
        : { behavior: 'instant' },
    )
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

function assertSupportedExplicitScrollOptions(options: ScrollOptions): void {
  if (options.motion?.kind === 'timed') {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      'Timed scroll motion is not implemented by the surface engine yet.',
      { details: { boundary: 'surface-engine', motion: options.motion.kind } },
    )
  }

  if (options.settle !== undefined && options.settle !== 'none') {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      'Observed scroll settlement is not implemented by the surface engine yet.',
      {
        details: {
          boundary: 'surface-engine',
          settle: typeof options.settle === 'string' ? options.settle : options.settle.kind,
        },
      },
    )
  }
}

function assertSupportedRevealOptions(options: RevealOptions): void {
  if (options.motion !== undefined && options.motion.kind !== 'instant') {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      `${options.motion.kind} reveal motion is not implemented by the surface engine yet.`,
      { details: { boundary: 'surface-engine', motion: options.motion.kind } },
    )
  }

  if (options.settle !== undefined && options.settle !== 'none') {
    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      'Observed reveal settlement is not implemented by the surface engine yet.',
      {
        details: {
          boundary: 'surface-engine',
          settle: typeof options.settle === 'string' ? options.settle : options.settle.kind,
        },
      },
    )
  }
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
