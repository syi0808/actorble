import { actorbleError } from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import type {
  CoordinateSpace,
  DomPort,
  OperationOptions,
  Point,
  Rect,
  ScrollOptions,
  ScrollPosition,
  TargetHandle,
  TargetLike,
} from '../../shared/index.js'

export type SurfaceSnapshot = Readonly<{
  id: string
  root: Document | ShadowRoot | Element
  coordinateSpace: CoordinateSpace
  viewport: Rect | null
  clippingChain: readonly Element[]
}>

export type RevealOptions = OperationOptions &
  Readonly<{
    block?: ScrollLogicalPosition
    inline?: ScrollLogicalPosition
  }>

export interface SurfaceEngine {
  getSurfaceFor(target: TargetHandle): SurfaceSnapshot
  getScrollableAncestors(target: TargetHandle): readonly Element[]
  ensureVisible(target: TargetHandle, options?: RevealOptions): Promise<void>
  scrollTo(targetOrPosition: TargetLike | ScrollPosition, options?: ScrollOptions): Promise<void>
  mapPoint(point: Point, from: CoordinateSpace, to: CoordinateSpace): Point
}

export type SurfaceEngineOptions = Readonly<{
  dom?: DomPort
}>

const supportedScrollPositionCoordinateSpaces = ['viewport', 'document'] as const

export class BrowserSurfaceEngine implements SurfaceEngine {
  readonly #dom: DomPort

  constructor(options: SurfaceEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
  }

  getSurfaceFor(target: TargetHandle): SurfaceSnapshot {
    return {
      id: target.surfaceId ?? 'viewport',
      root: target.root,
      coordinateSpace: 'viewport',
      viewport: this.#dom.getViewportRect(target.root),
      clippingChain: this.getScrollableAncestors(target),
    }
  }

  getScrollableAncestors(target: TargetHandle): readonly Element[] {
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

  async ensureVisible(target: TargetHandle, options: RevealOptions = {}): Promise<void> {
    this.#dom.scrollIntoView(target.element, revealToScrollIntoViewOptions(options))
  }

  async scrollTo(
    targetOrPosition: TargetLike | ScrollPosition,
    options: ScrollOptions = {},
  ): Promise<void> {
    if (isScrollPosition(targetOrPosition)) {
      this.#scrollViewportTo(targetOrPosition, options)
      return
    }

    this.#dom.scrollTo(targetElementForScroll(targetOrPosition), { x: 0, y: 0 }, options)
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
    const coordinateSpace = position.coordinateSpace ?? 'viewport'

    if (!isSupportedScrollPositionCoordinateSpace(coordinateSpace)) {
      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        `Scroll position coordinate space ${coordinateSpace} is not supported by the surface engine yet.`,
        {
          details: {
            boundary: 'surface-engine',
            action: 'scrollTo',
            coordinateSpace,
            supportedCoordinateSpaces: supportedScrollPositionCoordinateSpaces,
            position,
          },
        },
      )
    }

    this.#dom.scrollTo(
      this.#dom.getViewportScrollTarget(this.#dom.getRoot()),
      { x: position.x, y: position.y },
      options,
    )
  }

  #getViewportScrollOffset(): Point {
    const metrics = this.#dom.getScrollMetrics(
      this.#dom.getViewportScrollTarget(this.#dom.getRoot()),
    )

    return {
      x: metrics.scrollLeft,
      y: metrics.scrollTop,
    }
  }

  #isScrollable(element: Element): boolean {
    const style = this.#dom.getComputedStyle(element)
    const metrics = this.#dom.getScrollMetrics(element)
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

function revealToScrollIntoViewOptions(options: RevealOptions): ScrollIntoViewOptions | undefined {
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

function isSupportedScrollPositionCoordinateSpace(space: CoordinateSpace): boolean {
  return supportedScrollPositionCoordinateSpaces.includes(
    space as (typeof supportedScrollPositionCoordinateSpaces)[number],
  )
}

function isScrollPosition(targetOrPosition: TargetLike | ScrollPosition): targetOrPosition is ScrollPosition {
  return (
    typeof targetOrPosition === 'object' &&
    targetOrPosition !== null &&
    'x' in targetOrPosition &&
    'y' in targetOrPosition
  )
}

function targetElementForScroll(target: TargetLike): Element {
  if (isTargetHandle(target)) {
    return target.element
  }

  if (isLocator(target)) {
    if (target.kind === 'element') {
      return target.element
    }

    throw actorbleError(
      'PLATFORM_UNSUPPORTED',
      `Locator kind "${target.kind}" must be resolved before surface scrolling.`,
      {
        details: { locatorKind: target.kind },
      },
    )
  }

  return target
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

function isLocator(target: TargetLike): target is Exclude<TargetLike, TargetHandle | Element> {
  return typeof target === 'object' && target !== null && 'kind' in target
}
