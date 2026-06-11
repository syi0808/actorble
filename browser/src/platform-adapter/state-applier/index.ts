import { notImplemented } from '../../shared/index.js'
import type { StateApplyPort } from '../../shared/index.js'
export type { StateEffect, StateEffectKind } from '../../shared/index.js'

export interface StateApplier extends StateApplyPort {}

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
