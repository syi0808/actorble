import { actorbleError } from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserSurfaceEngine } from '../surface-engine/index.js'
import type { SurfaceEngine, SurfaceSnapshot } from '../surface-engine/index.js'
import type {
  Clock,
  CoordinateSpace,
  DomPort,
  Locator,
  Point,
  Rect,
  TargetHandle,
  TargetLike,
} from '../../shared/index.js'

export type PointSample = Readonly<{
  point: Point
  hitElement?: Element | null
  accepted: boolean
  reason?: string
}>

export type ClickablePointResult =
  | Readonly<{
      ok: true
      point: Point
      strategy: 'center' | 'visible-center' | 'grid-sampling' | 'label-control' | 'custom'
      hitElement?: Element
    }>
  | Readonly<{
      ok: false
      reason:
        | 'not-visible'
        | 'fully-occluded'
        | 'pointer-events-none'
        | 'disabled'
        | 'outside-surface'
        | 'no-sample-hit'
      samples?: readonly PointSample[]
    }>

export type GeometrySnapshot = Readonly<{
  target: TargetHandle
  rect: Rect
  visibleRect: Rect | null
  center: Point
  clickablePoint: ClickablePointResult
  coordinateSpace: CoordinateSpace
  computedAt: number
}>

export interface GeometryEngine {
  snapshot(target: TargetLike): Promise<GeometrySnapshot>
  getBoundingRect(target: TargetHandle): Rect
  getVisibleRect(target: TargetHandle): Rect | null
  getCenter(target: TargetHandle): Point
  getClickablePoint(target: TargetHandle): ClickablePointResult
}

export type GeometryEngineOptions = Readonly<{
  dom?: DomPort
  surface?: SurfaceEngine
  clock?: Clock
}>

const defaultClock: Clock = {
  now() {
    return Date.now()
  },
}

export class BrowserGeometryEngine implements GeometryEngine {
  readonly #dom: DomPort
  readonly #surface: SurfaceEngine
  readonly #clock: Clock

  constructor(options: GeometryEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#surface = options.surface ?? new BrowserSurfaceEngine({ dom: this.#dom })
    this.#clock = options.clock ?? defaultClock
  }

  async snapshot(target: TargetLike): Promise<GeometrySnapshot> {
    const handle = this.#toHandle(target)
    const rect = this.getBoundingRect(handle)
    const surface = this.#surface.getSurfaceFor(handle)
    const visibleRect = this.#getVisibleRect(rect, surface)

    return {
      target: handle,
      rect,
      visibleRect,
      center: centerOf(rect),
      clickablePoint: clickablePointFor(rect, visibleRect),
      coordinateSpace: surface.coordinateSpace,
      computedAt: this.#clock.now(),
    }
  }

  getBoundingRect(target: TargetHandle): Rect {
    return this.#dom.getBoundingClientRect(target.element)
  }

  getVisibleRect(target: TargetHandle): Rect | null {
    return this.#getVisibleRect(
      this.getBoundingRect(target),
      this.#surface.getSurfaceFor(target),
    )
  }

  getCenter(target: TargetHandle): Point {
    return centerOf(this.getBoundingRect(target))
  }

  getClickablePoint(target: TargetHandle): ClickablePointResult {
    const rect = this.getBoundingRect(target)
    return clickablePointFor(rect, this.#getVisibleRect(rect, this.#surface.getSurfaceFor(target)))
  }

  #getVisibleRect(rect: Rect, surface: SurfaceSnapshot): Rect | null {
    if (!hasArea(rect)) {
      return null
    }

    let visibleRect: Rect | null = rect

    if (surface.viewport) {
      visibleRect = intersectRects(visibleRect, surface.viewport)
    }

    for (const clippingElement of surface.clippingChain) {
      if (!visibleRect) {
        return null
      }

      visibleRect = intersectRects(
        visibleRect,
        this.#dom.getBoundingClientRect(clippingElement),
      )
    }

    return visibleRect
  }

  #toHandle(target: TargetLike): TargetHandle {
    if (isTargetHandle(target)) {
      return target
    }

    if (isLocator(target)) {
      if (target.kind === 'element') {
        return this.#createElementHandle(target.element, target)
      }

      throw actorbleError(
        'PLATFORM_UNSUPPORTED',
        `Locator kind "${target.kind}" must be resolved before geometry calculation.`,
        {
          details: { locatorKind: target.kind },
        },
      )
    }

    return this.#createElementHandle(target)
  }

  #createElementHandle(element: Element, locator?: Locator): TargetHandle {
    const root = this.#dom.getRoot()

    if (!this.#dom.isConnected(element) || !this.#dom.contains(root, element)) {
      throw actorbleError(
        'TARGET_DETACHED',
        'Element target is detached or outside the geometry engine root.',
        {
          details: { locatorKind: locator?.kind },
        },
      )
    }

    return {
      id: 'geometry-target',
      element,
      ...(locator === undefined ? {} : { locator }),
      resolvedAt: this.#clock.now(),
      root,
      validity: 'live',
      debug: this.#dom.describeElement(element),
    }
  }
}

export function createGeometryEngine(options: GeometryEngineOptions = {}): GeometryEngine {
  return new BrowserGeometryEngine(options)
}

function clickablePointFor(
  rect: Rect,
  visibleRect: Rect | null,
): ClickablePointResult {
  if (!hasArea(rect)) {
    return { ok: false, reason: 'not-visible' }
  }

  if (!visibleRect) {
    return { ok: false, reason: 'outside-surface' }
  }

  const center = centerOf(rect)

  if (containsPoint(visibleRect, center)) {
    return {
      ok: true,
      point: center,
      strategy: 'center',
    }
  }

  return {
    ok: true,
    point: centerOf(visibleRect),
    strategy: 'visible-center',
  }
}

function centerOf(rect: Rect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

function intersectRects(a: Rect, b: Rect): Rect | null {
  if (!hasArea(a) || !hasArea(b)) {
    return null
  }

  const left = Math.max(a.x, b.x)
  const top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)

  if (right <= left || bottom <= top) {
    return null
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  }
}

function hasArea(rect: Rect): boolean {
  return rect.width > 0 && rect.height > 0
}

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.y >= rect.y &&
    point.x <= rect.x + rect.width &&
    point.y <= rect.y + rect.height
  )
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
