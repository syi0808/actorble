import { notImplemented } from '../shared/index.js'
import type { ActorbleListener, Disposable, Point, PointerButtonName } from '../shared/index.js'

export type PointerSignal =
  | Readonly<{
      type: 'pointer:moved'
      point: Point
      previousPoint: Point | null
    }>
  | Readonly<{
      type: 'pointer:down'
      point: Point
      button: PointerButtonName
    }>
  | Readonly<{
      type: 'pointer:up'
      point: Point
      button: PointerButtonName
    }>
  | Readonly<{
      type: 'pointer:cancelled'
    }>

export interface PointerSignalBus {
  emit(signal: PointerSignal): void
  subscribe(listener: ActorbleListener<PointerSignal>): Disposable
}

export class BrowserPointerSignalBus implements PointerSignalBus {
  emit(): void {
    return notImplemented('Pointer Signals emit')
  }

  subscribe(): Disposable {
    return notImplemented('Pointer Signals subscribe')
  }
}

export function createPointerSignalBus(): PointerSignalBus {
  return new BrowserPointerSignalBus()
}
