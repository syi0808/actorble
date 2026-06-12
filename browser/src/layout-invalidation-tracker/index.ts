import type { Disposable, TimestampMs } from '../shared/index.js'

export type LayoutInvalidationReason =
  | 'scroll'
  | 'resize'
  | 'mutation'
  | 'animation-frame'
  | 'manual'

export type LayoutInvalidationEvent = Readonly<{
  reason: LayoutInvalidationReason
  at: TimestampMs
  coalesced: number
}>

export type LayoutInvalidationListener = (event: LayoutInvalidationEvent) => void

export interface LayoutInvalidationTracker extends Disposable {
  start(): void
  stop(): void
  isRunning(): boolean
  markDirty(reason: LayoutInvalidationReason): void
  subscribe(listener: LayoutInvalidationListener): Disposable
}

export class NoopLayoutInvalidationTracker implements LayoutInvalidationTracker {
  #running = false

  start(): void {
    this.#running = true
  }

  stop(): void {
    this.#running = false
  }

  isRunning(): boolean {
    return this.#running
  }

  markDirty(_reason: LayoutInvalidationReason): void {}

  subscribe(_listener: LayoutInvalidationListener): Disposable {
    return { dispose() {} }
  }

  dispose(): void {
    this.stop()
  }
}

export function createLayoutInvalidationTracker(): LayoutInvalidationTracker {
  return new NoopLayoutInvalidationTracker()
}
