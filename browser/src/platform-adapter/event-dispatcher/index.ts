import { notImplemented } from '../../shared/index.js'
import type { EventDispatchPort } from '../../shared/index.js'
export type {
  KeyboardEventDescriptor,
  PointerEventDescriptor,
  TextInputEventDescriptor,
} from '../../shared/index.js'

export interface EventDispatcher extends EventDispatchPort {}

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
