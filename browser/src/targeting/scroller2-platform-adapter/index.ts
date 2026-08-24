import type {
  Insets as ScrollerInsets,
  Point as ScrollerPoint,
  Rect as ScrollerRect,
  ScrollMetrics as ScrollerMetrics,
  ScrollPlatform,
  ScrollStyle,
  ScrollSurface,
} from 'scroller2'
import { discoverScrollChain } from 'scroller2'
import type { ComputedCssInsets, DomPort, Rect, TargetHandle } from '../../shared/index.js'

export interface Scroller2ScrollChainResolver {
  resolve(target: TargetHandle): readonly Readonly<{ scrollTarget: ScrollSurface }>[]
}

export class ActorbleScroller2ScrollChainResolver implements Scroller2ScrollChainResolver {
  readonly #platform: ActorbleScrollerPlatform

  constructor(dom: DomPort) {
    this.#platform = new ActorbleScrollerPlatform(dom)
  }

  resolve(target: TargetHandle): readonly Readonly<{ scrollTarget: ScrollSurface }>[] {
    return discoverScrollChain(target.element, this.#platform).map((scrollTarget) =>
      Object.freeze({ scrollTarget }),
    )
  }
}

export class ActorbleScrollerPlatform implements ScrollPlatform {
  readonly #dom: DomPort

  constructor(dom: DomPort) {
    this.#dom = dom
  }

  getRect(element: Element): ScrollerRect {
    return toScrollerRect(this.#dom.getBoundingClientRect(element))
  }

  getViewportRect(): ScrollerRect {
    return toScrollerRect(this.#dom.getViewportRect(this.#dom.getRoot()))
  }

  getScrollMetrics(surface: ScrollSurface): ScrollerMetrics {
    const metrics = this.#dom.getScrollMetrics(surface)
    const viewport = isWindow(surface)
      ? this.#dom.getViewportRect(this.#dom.getRoot())
      : elementViewport(surface, metrics, this.#dom)

    return {
      viewport: toScrollerRect(viewport),
      scroll: { x: metrics.scrollLeft, y: metrics.scrollTop },
      min: { x: 0, y: 0 },
      max: {
        x: Math.max(0, metrics.scrollWidth - metrics.clientWidth),
        y: Math.max(0, metrics.scrollHeight - metrics.clientHeight),
      },
      axes: {
        x: metrics.scrollWidth > metrics.clientWidth,
        y: metrics.scrollHeight > metrics.clientHeight,
      },
      padding: numericInsets(
        this.#dom.getComputedScrollStyle(
          isWindow(surface)
            ? this.#dom.getViewportScrollElement(this.#dom.getRoot())
            : surface,
        ).scrollPadding,
      ),
    }
  }

  getComputedScrollStyle(element: Element): ScrollStyle {
    const style = this.#dom.getComputedScrollStyle(element)
    return {
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      scrollPadding: numericInsets(style.scrollPadding),
      scrollMargin: numericInsets(style.scrollMargin),
    }
  }

  getParent(element: Element): Element | null {
    return this.#dom.getParentElement(element)
  }

  getShadowHost(): Element | null {
    return null
  }

  readScroll(surface: ScrollSurface): ScrollerPoint {
    const metrics = this.#dom.getScrollMetrics(surface)
    return { x: metrics.scrollLeft, y: metrics.scrollTop }
  }

  writeScroll(surface: ScrollSurface, position: ScrollerPoint): void {
    this.#dom.scrollTo(surface, position, { behavior: 'instant' })
  }
}

function elementViewport(
  element: Element,
  metrics: ReturnType<DomPort['getScrollMetrics']>,
  dom: DomPort,
): Rect {
  const bounds = dom.getBoundingClientRect(element)
  return {
    x: bounds.x + metrics.clientLeft,
    y: bounds.y + metrics.clientTop,
    width: metrics.clientWidth,
    height: metrics.clientHeight,
  }
}

function toScrollerRect(value: Rect): ScrollerRect {
  return {
    top: value.y,
    right: value.x + value.width,
    bottom: value.y + value.height,
    left: value.x,
    width: value.width,
    height: value.height,
  }
}

function numericInsets(insets: ComputedCssInsets): ScrollerInsets {
  return {
    top: cssPixels(insets.top),
    right: cssPixels(insets.right),
    bottom: cssPixels(insets.bottom),
    left: cssPixels(insets.left),
  }
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isWindow(surface: ScrollSurface): surface is Window {
  return 'window' in surface && surface.window === surface
}
