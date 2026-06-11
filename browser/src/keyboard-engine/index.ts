import { notImplemented } from '../shared/index.js'
import type { PressOptions } from '../shared/index.js'

export type KeyboardModifier = 'Alt' | 'Control' | 'Meta' | 'Shift'

export type KeyboardState = Readonly<{
  pressedKeys: readonly string[]
  modifiers: readonly KeyboardModifier[]
}>

export interface KeyboardEngine {
  getState(): KeyboardState
  keyDown(key: string, options?: PressOptions): Promise<KeyboardState>
  keyUp(key: string, options?: PressOptions): Promise<KeyboardState>
  press(keys: string, options?: PressOptions): Promise<KeyboardState>
}

export class BrowserKeyboardEngine implements KeyboardEngine {
  getState(): KeyboardState {
    return notImplemented('Keyboard Engine getState')
  }

  keyDown(): Promise<KeyboardState> {
    return notImplemented('Keyboard Engine keyDown')
  }

  keyUp(): Promise<KeyboardState> {
    return notImplemented('Keyboard Engine keyUp')
  }

  press(): Promise<KeyboardState> {
    return notImplemented('Keyboard Engine press')
  }
}

export function createKeyboardEngine(): KeyboardEngine {
  return new BrowserKeyboardEngine()
}
