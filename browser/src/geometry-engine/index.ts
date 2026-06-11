import { notImplemented } from '../shared/index.js'
import type { CoordinateSpace, Point, Rect, TargetHandle, TargetLike } from '../shared/index.js'

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

export class BrowserGeometryEngine implements GeometryEngine {
  snapshot(): Promise<GeometrySnapshot> {
    return notImplemented('Geometry Engine snapshot')
  }

  getBoundingRect(): Rect {
    return notImplemented('Geometry Engine getBoundingRect')
  }

  getVisibleRect(): Rect | null {
    return notImplemented('Geometry Engine getVisibleRect')
  }

  getCenter(): Point {
    return notImplemented('Geometry Engine getCenter')
  }

  getClickablePoint(): ClickablePointResult {
    return notImplemented('Geometry Engine getClickablePoint')
  }
}

export function createGeometryEngine(): GeometryEngine {
  return new BrowserGeometryEngine()
}
