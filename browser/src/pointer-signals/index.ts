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
  readonly #listeners: ActorbleListener<PointerSignal>[] = []

  emit(signal: PointerSignal): void {
    for (const listener of [...this.#listeners]) {
      listener(signal)
    }
  }

  subscribe(listener: ActorbleListener<PointerSignal>): Disposable {
    this.#listeners.push(listener)
    let disposed = false

    return {
      dispose: () => {
        if (disposed) {
          return
        }

        disposed = true
        const index = this.#listeners.indexOf(listener)

        if (index >= 0) {
          this.#listeners.splice(index, 1)
        }
      },
    }
  }
}

export function createPointerSignalBus(): PointerSignalBus {
  return new BrowserPointerSignalBus()
}
