import { notImplemented } from '../../shared/index.js'
import type { TargetHandle } from '../../shared/index.js'

export type StateEffectKind =
  | 'hover'
  | 'active'
  | 'focus'
  | 'focus-visible'
  | 'typing'
  | 'dragging'

export type StateEffect = Readonly<{
  kind: StateEffectKind
  target: TargetHandle | null
  active: boolean
}>

export interface StateApplier {
  applyStateEffects(effects: readonly StateEffect[]): void
  cleanup(): void
}

export class BrowserStateApplier implements StateApplier {
  applyStateEffects(): void {
    return notImplemented('State Applier applyStateEffects')
  }

  cleanup(): void {
    return notImplemented('State Applier cleanup')
  }
}

export function createStateApplier(): StateApplier {
  return new BrowserStateApplier()
}
