import type { Disposable, Point, TargetHandle } from '../shared/index.js'

export type PointerVisualAnchor =
  | Readonly<{ kind: 'clickablePoint' }>
  | Readonly<{ kind: 'relative'; xRatio: number; yRatio: number }>

export type PointerVisualMode =
  | Readonly<{
      kind: 'freePoint'
      point: Point
      pressed: boolean
    }>
  | Readonly<{
      kind: 'targetAnchor'
      target: TargetHandle
      anchor: PointerVisualAnchor
      commandId: number
      pressed: boolean
    }>

export type PointerVisualSnapshot = Readonly<{
  mode: PointerVisualMode | null
}>

export interface PointerVisualTracker extends Disposable {
  setMode(mode: PointerVisualMode): void
  refresh(reason?: string): void
  clear(): void
  getSnapshot(): PointerVisualSnapshot
}

export class NoopPointerVisualTracker implements PointerVisualTracker {
  #mode: PointerVisualMode | null = null

  setMode(mode: PointerVisualMode): void {
    this.#mode = mode
  }

  refresh(_reason?: string): void {}

  clear(): void {
    this.#mode = null
  }

  getSnapshot(): PointerVisualSnapshot {
    return { mode: this.#mode }
  }

  dispose(): void {
    this.clear()
  }
}

export function createPointerVisualTracker(): PointerVisualTracker {
  return new NoopPointerVisualTracker()
}
