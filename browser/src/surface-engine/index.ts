import { notImplemented } from '../shared/index.js'
import type {
  CoordinateSpace,
  OperationOptions,
  Point,
  ScrollOptions,
  ScrollPosition,
  TargetHandle,
  TargetLike,
} from '../shared/index.js'

export type SurfaceSnapshot = Readonly<{
  id: string
  root: Document | ShadowRoot | Element
  coordinateSpace: CoordinateSpace
  viewport: DOMRectReadOnly | null
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

export class BrowserSurfaceEngine implements SurfaceEngine {
  getSurfaceFor(): SurfaceSnapshot {
    return notImplemented('Surface Engine getSurfaceFor')
  }

  getScrollableAncestors(): readonly Element[] {
    return notImplemented('Surface Engine getScrollableAncestors')
  }

  ensureVisible(): Promise<void> {
    return notImplemented('Surface Engine ensureVisible')
  }

  scrollTo(): Promise<void> {
    return notImplemented('Surface Engine scrollTo')
  }

  mapPoint(): Point {
    return notImplemented('Surface Engine mapPoint')
  }
}

export function createSurfaceEngine(): SurfaceEngine {
  return new BrowserSurfaceEngine()
}
