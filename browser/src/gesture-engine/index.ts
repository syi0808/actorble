import { notImplemented } from '../shared/index.js'
import type { ClickOptions, DragOptions, Point, TargetHandle } from '../shared/index.js'

export type DragCapability =
  | 'none'
  | 'pointer-gesture'
  | 'html5-dnd'
  | 'editor-selection'
  | 'custom-adapter'

export type GestureResult = Readonly<{
  completed: boolean
}>

export interface GestureEngine {
  click(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  doubleClick(target: TargetHandle, point: Point, options?: ClickOptions): Promise<GestureResult>
  hover(point: Point): Promise<GestureResult>
  drag(from: Point, to: Point, options?: DragOptions): Promise<GestureResult>
}

export class BrowserGestureEngine implements GestureEngine {
  click(): Promise<GestureResult> {
    return notImplemented('Gesture Engine click')
  }

  doubleClick(): Promise<GestureResult> {
    return notImplemented('Gesture Engine doubleClick')
  }

  hover(): Promise<GestureResult> {
    return notImplemented('Gesture Engine hover')
  }

  drag(): Promise<GestureResult> {
    return notImplemented('Gesture Engine drag')
  }
}

export function createGestureEngine(): GestureEngine {
  return new BrowserGestureEngine()
}
