import { notImplemented } from '../shared/index.js'
import type { FocusOptions, TargetHandle, TargetLike } from '../shared/index.js'

export type FocusSnapshot = Readonly<{
  active: TargetHandle | null
  previous: TargetHandle | null
  focusVisible: boolean
}>

export interface FocusEngine {
  focus(target: TargetLike, options?: FocusOptions): Promise<FocusSnapshot>
  blur(target?: TargetLike): Promise<FocusSnapshot>
  getFocused(): Promise<FocusSnapshot>
  tab(options?: FocusOptions): Promise<FocusSnapshot>
}

export class BrowserFocusEngine implements FocusEngine {
  focus(): Promise<FocusSnapshot> {
    return notImplemented('Focus Engine focus')
  }

  blur(): Promise<FocusSnapshot> {
    return notImplemented('Focus Engine blur')
  }

  getFocused(): Promise<FocusSnapshot> {
    return notImplemented('Focus Engine getFocused')
  }

  tab(): Promise<FocusSnapshot> {
    return notImplemented('Focus Engine tab')
  }
}

export function createFocusEngine(): FocusEngine {
  return new BrowserFocusEngine()
}
