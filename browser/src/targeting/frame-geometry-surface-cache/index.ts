import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import type { LayoutInvalidationTracker } from '../layout-invalidation-tracker/index.js'
import type {
  Disposable,
  LayoutInvalidationReason,
  Rect,
  ScrollMetrics,
  TimestampMs,
} from '../../shared/index.js'

export type FrameGeometrySurfaceCacheTimeline = Readonly<{
  nextFrame(): Promise<TimestampMs>
}>

export type FrameGeometrySurfaceCacheOptions = Readonly<{
  layoutInvalidation?: Pick<LayoutInvalidationTracker, 'subscribe'>
  timeline?: FrameGeometrySurfaceCacheTimeline
}>

export class FrameGeometrySurfaceCache implements Disposable {
  readonly #timeline: FrameGeometrySurfaceCacheTimeline
  readonly #layoutInvalidationSubscription?: Disposable
  readonly #boundingRects = new Map<Element, Rect>()
  readonly #viewportRects = new Map<Document | ShadowRoot | Element, Rect>()
  readonly #scrollMetrics = new Map<object, ScrollMetrics>()
  readonly #computedStyles = new Map<Element, CSSStyleDeclaration>()
  readonly #scrollableAncestors = new Map<Element, readonly Element[]>()
  #framePending = false
  #frameToken = 0

  constructor(options: FrameGeometrySurfaceCacheOptions = {}) {
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#layoutInvalidationSubscription = options.layoutInvalidation?.subscribe((event) => {
      this.invalidate(event.reason)
    })
  }

  getBoundingRect(element: Element, read: () => Rect): Rect {
    const cached = this.#boundingRects.get(element)

    if (cached !== undefined) {
      return cloneRect(cached)
    }

    const rect = cloneRect(read())
    this.#boundingRects.set(element, rect)
    this.#scheduleFrameClear()
    return cloneRect(rect)
  }

  getViewportRect(root: Document | ShadowRoot | Element, read: () => Rect): Rect {
    const cached = this.#viewportRects.get(root)

    if (cached !== undefined) {
      return cloneRect(cached)
    }

    const rect = cloneRect(read())
    this.#viewportRects.set(root, rect)
    this.#scheduleFrameClear()
    return cloneRect(rect)
  }

  getScrollMetrics(target: Element | Window, read: () => ScrollMetrics): ScrollMetrics {
    const cached = this.#scrollMetrics.get(target)

    if (cached !== undefined) {
      return cloneScrollMetrics(cached)
    }

    const metrics = cloneScrollMetrics(read())
    this.#scrollMetrics.set(target, metrics)
    this.#scheduleFrameClear()
    return cloneScrollMetrics(metrics)
  }

  getComputedStyle(element: Element, read: () => CSSStyleDeclaration): CSSStyleDeclaration {
    const cached = this.#computedStyles.get(element)

    if (cached !== undefined) {
      return cached
    }

    const style = read()
    this.#computedStyles.set(element, style)
    this.#scheduleFrameClear()
    return style
  }

  getScrollableAncestors(
    target: Element,
    read: () => readonly Element[],
  ): readonly Element[] {
    const cached = this.#scrollableAncestors.get(target)

    if (cached !== undefined) {
      return [...cached]
    }

    const ancestors = [...read()]
    this.#scrollableAncestors.set(target, ancestors)
    this.#scheduleFrameClear()
    return [...ancestors]
  }

  invalidate(_reason: LayoutInvalidationReason | string = 'manual'): void {
    this.#clear()
  }

  dispose(): void {
    this.#layoutInvalidationSubscription?.dispose()
    this.#frameToken += 1
    this.#framePending = false
    this.#clear()
  }

  #scheduleFrameClear(): void {
    if (this.#framePending) {
      return
    }

    this.#framePending = true
    const token = this.#frameToken + 1
    this.#frameToken = token

    this.#timeline.nextFrame().then(
      () => {
        if (this.#frameToken !== token) {
          return
        }

        this.#framePending = false
        this.#clear()
      },
      () => {
        if (this.#frameToken !== token) {
          return
        }

        this.#framePending = false
        this.#clear()
      },
    )
  }

  #clear(): void {
    this.#boundingRects.clear()
    this.#viewportRects.clear()
    this.#scrollMetrics.clear()
    this.#computedStyles.clear()
    this.#scrollableAncestors.clear()
  }
}

export function createFrameGeometrySurfaceCache(
  options: FrameGeometrySurfaceCacheOptions = {},
): FrameGeometrySurfaceCache {
  return new FrameGeometrySurfaceCache(options)
}

function cloneRect(rect: Rect): Rect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

function cloneScrollMetrics(metrics: ScrollMetrics): ScrollMetrics {
  return {
    scrollLeft: metrics.scrollLeft,
    scrollTop: metrics.scrollTop,
    scrollWidth: metrics.scrollWidth,
    scrollHeight: metrics.scrollHeight,
    clientWidth: metrics.clientWidth,
    clientHeight: metrics.clientHeight,
  }
}
