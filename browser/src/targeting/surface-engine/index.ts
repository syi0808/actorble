import { actorbleError, notImplemented } from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { createFrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type { FrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type {
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
  dom?: DomPort
}>

export class BrowserSurfaceEngine implements SurfaceEngine {
  readonly #cache: FrameGeometrySurfaceCache
  readonly #dom: DomPort

  constructor(options: SurfaceEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#cache = options.cache ?? createFrameGeometrySurfaceCache()
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
    return this.#cache.getScrollableAncestors(target.element, () =>
      this.#findScrollableAncestors(target),
    )
  }

  #findScrollableAncestors(target: TargetHandle): readonly Element[] {
    const scrollableAncestors: Element[] = []
    let current = this.#dom.getParentElement(target.element)

    while (current) {
      if (this.#isScrollable(current)) {
        scrollableAncestors.push(current)
      }

      current = this.#dom.getParentElement(current)
    }

    return scrollableAncestors
  }

  async ensureVisible(target: TargetHandle, options: EnsureVisibleOptions = {}): Promise<void> {
    this.#dom.scrollIntoView(target.element, revealToScrollIntoViewOptions(options))
    this.#cache.invalidate('scroll')
  }

  async reveal(_target: TargetHandle, _options: RevealOptions = {}): Promise<RevealResult> {
    return notImplemented('SurfaceEngine.reveal')
  }

  async scrollTo(position: ScrollPosition, options: ScrollOptions = {}): Promise<ScrollResult> {
    assertSupportedExplicitScrollOptions(options)
    const before = this.#getViewportScrollOffset()
    this.#scrollViewportTo(position, options)
    this.#cache.invalidate('scroll')
    const after = this.#getViewportScrollOffset()
    return { changed: before.x !== after.x || before.y !== after.y, before, after }
  }

  async scrollBy(delta: ScrollDelta, options: ScrollOptions = {}): Promise<ScrollResult> {
    assertSupportedExplicitScrollOptions(options)
    const before = this.#getViewportScrollOffset()
    this.#scrollViewportTo({ x: before.x + delta.x, y: before.y + delta.y }, options)
    this.#cache.invalidate('scroll')
    const after = this.#getViewportScrollOffset()
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
    const metrics = this.#cache.getScrollMetrics(target, () =>
      this.#dom.getScrollMetrics(target),
    )

    return {
      x: metrics.scrollLeft,
      y: metrics.scrollTop,
    }
  }

  #isScrollable(element: Element): boolean {
    const style = this.#cache.getComputedStyle(element, () =>
      this.#dom.getComputedStyle(element),
    )
    const metrics = this.#cache.getScrollMetrics(element, () =>
      this.#dom.getScrollMetrics(element),
    )
    const overflowX = normalizeAxisOverflow(style.overflowX, style.overflow)
    const overflowY = normalizeAxisOverflow(style.overflowY, style.overflow)
    const canScrollX = allowsScrolling(overflowX) && metrics.scrollWidth > metrics.clientWidth
    const canScrollY =
      allowsScrolling(overflowY) && metrics.scrollHeight > metrics.clientHeight

    return canScrollX || canScrollY
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

function allowsScrolling(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
}

function normalizeAxisOverflow(axisOverflow: string, shorthandOverflow: string): string {
  if (axisOverflow === 'visible' && allowsScrolling(shorthandOverflow)) {
    return shorthandOverflow
  }

  return axisOverflow || shorthandOverflow
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
