import { notImplemented } from '../../shared/index.js'
import type { Point, PointerButtonName } from '../../shared/index.js'

export type PointerEventDescriptor = Readonly<{
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'pointercancel'
  target: Element
  point: Point
  button?: PointerButtonName
  buttons?: readonly PointerButtonName[]
}>

export type KeyboardEventDescriptor = Readonly<{
  type: 'keydown' | 'keyup'
  target: Element
  key: string
  code?: string
  modifiers?: readonly string[]
}>

export type TextInputEventDescriptor = Readonly<{
  type: 'beforeinput' | 'input' | 'change'
  target: Element
  text?: string
  inputType?: string
}>

export interface EventDispatcher {
  dispatchPointerEvent(event: PointerEventDescriptor): boolean
  dispatchKeyboardEvent(event: KeyboardEventDescriptor): boolean
  dispatchTextInputEvent(event: TextInputEventDescriptor): boolean
}

export class BrowserEventDispatcher implements EventDispatcher {
  dispatchPointerEvent(): boolean {
    return notImplemented('Event Dispatcher dispatchPointerEvent')
  }

  dispatchKeyboardEvent(): boolean {
    return notImplemented('Event Dispatcher dispatchKeyboardEvent')
  }

  dispatchTextInputEvent(): boolean {
    return notImplemented('Event Dispatcher dispatchTextInputEvent')
  }
}

export function createEventDispatcher(): EventDispatcher {
  return new BrowserEventDispatcher()
}
