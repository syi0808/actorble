import { notImplemented } from '../shared/index.js'
import type { CoordinateSpace, MoveOptions, Point, PointerButtonName } from '../shared/index.js'

export type PointerMotionStatus = 'idle' | 'moving' | 'settling' | 'cancelled'

export type PointerPath = readonly Point[]

export type PointerState = Readonly<{
  id: string
  position: Point
  previousPosition: Point | null
  motion: Readonly<{
    status: PointerMotionStatus
    from?: Point
    to?: Point
    path?: PointerPath
  }>
  buttons: Readonly<{
    pressed: readonly PointerButtonName[]
    primary: PointerButtonName | null
  }>
  surface: Readonly<{
    id: string | null
    coordinateSpace: CoordinateSpace
  }>
}>

export interface PointerEngine {
  getState(): PointerState
  moveTo(point: Point, options?: MoveOptions): Promise<PointerState>
  down(button?: PointerButtonName): Promise<PointerState>
  up(button?: PointerButtonName): Promise<PointerState>
  cancel(): Promise<PointerState>
}

export class BrowserPointerEngine implements PointerEngine {
  getState(): PointerState {
    return notImplemented('Pointer Engine getState')
  }

  moveTo(): Promise<PointerState> {
    return notImplemented('Pointer Engine moveTo')
  }

  down(): Promise<PointerState> {
    return notImplemented('Pointer Engine down')
  }

  up(): Promise<PointerState> {
    return notImplemented('Pointer Engine up')
  }

  cancel(): Promise<PointerState> {
    return notImplemented('Pointer Engine cancel')
  }
}

export function createPointerEngine(): PointerEngine {
  return new BrowserPointerEngine()
}
