import { notImplemented } from '../shared/index.js'
import type { Point, Rect, TargetHandle } from '../shared/index.js'

export type VisualLayerOptions = Readonly<{
  enabled?: boolean
}>

export type HighlightRequest = Readonly<{
  target: TargetHandle
  rect?: Rect
}>

export interface VisualLayer {
  showCursor(point: Point): void
  highlightTarget(request: HighlightRequest): void
  showClick(point: Point): void
  hide(): void
  destroy(): void
}

export class BrowserVisualLayer implements VisualLayer {
  constructor(readonly options: VisualLayerOptions = {}) {}

  showCursor(): void {
    return notImplemented('Visual Layer showCursor')
  }

  highlightTarget(): void {
    return notImplemented('Visual Layer highlightTarget')
  }

  showClick(): void {
    return notImplemented('Visual Layer showClick')
  }

  hide(): void {
    return notImplemented('Visual Layer hide')
  }

  destroy(): void {
    return notImplemented('Visual Layer destroy')
  }
}

export function createVisualLayer(options: VisualLayerOptions = {}): VisualLayer {
  return new BrowserVisualLayer(options)
}
