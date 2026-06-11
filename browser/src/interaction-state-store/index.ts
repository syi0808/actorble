import { notImplemented } from '../shared/index.js'
import type { ActorbleListener, Disposable, StateEffect, TargetHandle } from '../shared/index.js'
import type { PointerSignal } from '../pointer-signals/index.js'

export type InteractionStateSnapshot = Readonly<{
  hovered: readonly TargetHandle[]
  active: TargetHandle | null
  focused: TargetHandle | null
  focusVisible: boolean
  typing: TargetHandle | null
  dragging: Readonly<{
    source: TargetHandle | null
    target: TargetHandle | null
  }>
}>

export type InteractionStateDiff = Readonly<{
  previous: InteractionStateSnapshot
  next: InteractionStateSnapshot
  effects: readonly StateEffect[]
}>

export interface InteractionStateStore {
  snapshot(): InteractionStateSnapshot
  applyPointerSignal(signal: PointerSignal): InteractionStateDiff
  setFocused(target: TargetHandle | null, focusVisible?: boolean): InteractionStateDiff
  setTyping(target: TargetHandle | null): InteractionStateDiff
  reset(): InteractionStateDiff
  subscribe(listener: ActorbleListener<InteractionStateDiff>): Disposable
}

export class BrowserInteractionStateStore implements InteractionStateStore {
  snapshot(): InteractionStateSnapshot {
    return notImplemented('Interaction State Store snapshot')
  }

  applyPointerSignal(): InteractionStateDiff {
    return notImplemented('Interaction State Store applyPointerSignal')
  }

  setFocused(): InteractionStateDiff {
    return notImplemented('Interaction State Store setFocused')
  }

  setTyping(): InteractionStateDiff {
    return notImplemented('Interaction State Store setTyping')
  }

  reset(): InteractionStateDiff {
    return notImplemented('Interaction State Store reset')
  }

  subscribe(): Disposable {
    return notImplemented('Interaction State Store subscribe')
  }
}

export function createInteractionStateStore(): InteractionStateStore {
  return new BrowserInteractionStateStore()
}
