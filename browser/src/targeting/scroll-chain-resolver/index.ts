import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { createFrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type { FrameGeometrySurfaceCache } from '../frame-geometry-surface-cache/index.js'
import type {
  ComputedCssInsets,
  ComputedScrollStyleSnapshot,
  DomPort,
  Rect,
  ScrollMetrics,
  TargetHandle,
} from '../../shared/index.js'

export type ScrollOverflowAxis = 'x' | 'y'

export type ScrollSurfaceSnapshot = Readonly<{
  id: string
  kind: 'element' | 'viewport'
  scrollTarget: Element | Window
  viewportRect: Rect
  metrics: ScrollMetrics
  overflowAxes: readonly ScrollOverflowAxis[]
  scrollPadding: ComputedCssInsets
  parentId: string | null
}>

export interface ScrollChainResolver {
  resolve(target: TargetHandle): readonly ScrollSurfaceSnapshot[]
}

export type ScrollChainResolverOptions = Readonly<{
  cache?: FrameGeometrySurfaceCache
  dom?: DomPort
  idPrefix?: string
}>

type PendingSurface = Omit<ScrollSurfaceSnapshot, 'parentId'>

export class BrowserScrollChainResolver implements ScrollChainResolver {
  readonly #cache: FrameGeometrySurfaceCache
  readonly #dom: DomPort
  readonly #idPrefix: string
  readonly #ids = new WeakMap<object, string>()
  #nextId = 1
  #nextViewportId = 1

  constructor(options: ScrollChainResolverOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#cache = options.cache ?? createFrameGeometrySurfaceCache()
    this.#idPrefix = options.idPrefix ?? 'scroll-surface'
  }

  resolve(target: TargetHandle): readonly ScrollSurfaceSnapshot[] {
    const viewportElement = this.#dom.getViewportScrollElement(target.root)
    const surfaces: PendingSurface[] = []
    const visited = new Set<Element | Window>()
    let current = this.#dom.getParentElement(target.element)
    let reachedViewport = false

    while (current !== null && !visited.has(current)) {
      visited.add(current)

      if (current === viewportElement) {
        reachedViewport = true
        break
      }

      const surface = this.#elementSurface(current)
      if (surface !== null) {
        surfaces.push(surface)
      }

      current = this.#dom.getParentElement(current)
    }

    if (reachedViewport) {
      const viewport = this.#viewportSurface(target.root, viewportElement)
      if (viewport !== null && !visited.has(viewport.scrollTarget)) {
        surfaces.push(viewport)
      }
    }

    return freezeChain(surfaces)
  }

  #elementSurface(element: Element): PendingSurface | null {
    const metrics = this.#readMetrics(element)
    const style = this.#readScrollStyle(element)
    const overflowAxes = elementOverflowAxes(style, metrics)

    if (overflowAxes.length === 0) {
      return null
    }

    const bounds = this.#cache.getBoundingRect(element, () =>
      this.#dom.getBoundingClientRect(element),
    )

    return {
      id: this.#idFor(element),
      kind: 'element',
      scrollTarget: element,
      viewportRect: {
        x: bounds.x + metrics.clientLeft,
        y: bounds.y + metrics.clientTop,
        width: metrics.clientWidth,
        height: metrics.clientHeight,
      },
      metrics,
      overflowAxes,
      scrollPadding: style.scrollPadding,
    }
  }

  #viewportSurface(
    root: Document | ShadowRoot,
    viewportElement: Element,
  ): PendingSurface | null {
    const scrollTarget = this.#dom.getViewportScrollTarget(root)
    const metrics = this.#readMetrics(scrollTarget)
    const overflowAxes = rangeAxes(metrics)

    if (overflowAxes.length === 0) {
      return null
    }

    return {
      id: this.#viewportId(scrollTarget),
      kind: 'viewport',
      scrollTarget,
      viewportRect: this.#cache.getViewportRect(root, () => this.#dom.getViewportRect(root)),
      metrics,
      overflowAxes,
      scrollPadding: this.#readScrollStyle(viewportElement).scrollPadding,
    }
  }

  #readMetrics(target: Element | Window): ScrollMetrics {
    return this.#cache.getScrollMetrics(target, () => this.#dom.getScrollMetrics(target))
  }

  #readScrollStyle(element: Element): ComputedScrollStyleSnapshot {
    return this.#cache.getComputedScrollStyle(element, () =>
      this.#dom.getComputedScrollStyle(element),
    )
  }

  #idFor(surface: Element | Window): string {
    const existing = this.#ids.get(surface)
    if (existing !== undefined) {
      return existing
    }

    const id = `${this.#idPrefix}-${this.#nextId++}`
    this.#ids.set(surface, id)
    return id
  }

  #viewportId(viewport: Window): string {
    const existing = this.#ids.get(viewport)
    if (existing !== undefined) {
      return existing
    }

    const ordinal = this.#nextViewportId++
    const id = ordinal === 1 ? 'viewport' : `viewport-${ordinal}`
    this.#ids.set(viewport, id)
    return id
  }
}

export function createScrollChainResolver(
  options: ScrollChainResolverOptions = {},
): ScrollChainResolver {
  return new BrowserScrollChainResolver(options)
}

function elementOverflowAxes(
  style: ComputedScrollStyleSnapshot,
  metrics: ScrollMetrics,
): readonly ScrollOverflowAxis[] {
  const axes: ScrollOverflowAxis[] = []

  if (allowsScrolling(style.overflowX) && hasHorizontalRange(metrics)) {
    axes.push('x')
  }
  if (allowsScrolling(style.overflowY) && hasVerticalRange(metrics)) {
    axes.push('y')
  }

  return axes
}

function rangeAxes(metrics: ScrollMetrics): readonly ScrollOverflowAxis[] {
  const axes: ScrollOverflowAxis[] = []

  if (hasHorizontalRange(metrics)) {
    axes.push('x')
  }
  if (hasVerticalRange(metrics)) {
    axes.push('y')
  }

  return axes
}

function allowsScrolling(overflow: string): boolean {
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay'
}

function hasHorizontalRange(metrics: ScrollMetrics): boolean {
  return metrics.scrollWidth > metrics.clientWidth
}

function hasVerticalRange(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight > metrics.clientHeight
}

function freezeChain(surfaces: readonly PendingSurface[]): readonly ScrollSurfaceSnapshot[] {
  const snapshots = surfaces.map((surface, index) =>
    Object.freeze({
      ...surface,
      viewportRect: Object.freeze({ ...surface.viewportRect }),
      metrics: Object.freeze({ ...surface.metrics }),
      overflowAxes: Object.freeze([...surface.overflowAxes]),
      scrollPadding: Object.freeze({ ...surface.scrollPadding }),
      parentId: surfaces[index + 1]?.id ?? null,
    }),
  )

  return Object.freeze(snapshots)
}
