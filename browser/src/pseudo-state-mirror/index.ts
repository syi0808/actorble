import { notImplemented } from '../shared/index.js'
import type { TargetHandle } from '../shared/index.js'

export type PseudoStateName = 'hover' | 'active' | 'focus-visible'

export type PseudoStateMirrorRequest = Readonly<{
  target: TargetHandle
  states: readonly PseudoStateName[]
}>

export interface PseudoStateMirror {
  apply(request: PseudoStateMirrorRequest): void
  clear(target?: TargetHandle): void
}

export class BrowserPseudoStateMirror implements PseudoStateMirror {
  apply(): void {
    return notImplemented('Pseudo State Mirror apply')
  }

  clear(): void {
    return notImplemented('Pseudo State Mirror clear')
  }
}

export function createPseudoStateMirror(): PseudoStateMirror {
  return new BrowserPseudoStateMirror()
}
