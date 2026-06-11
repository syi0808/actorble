import type {
  EventDispatchPort,
  KeyboardEventDescriptor,
  PointerButtonName,
  PointerEventDescriptor,
  TextInputEventDescriptor,
} from '../../shared/index.js'
export type {
  KeyboardEventDescriptor,
  PointerEventDescriptor,
  TextInputEventDescriptor,
} from '../../shared/index.js'

export interface EventDispatcher extends EventDispatchPort {}

export class BrowserEventDispatcher implements EventDispatcher {
  dispatchPointerEvent(event: PointerEventDescriptor): boolean {
    const pointerResult = event.target.dispatchEvent(createPointerEvent(event))
    const mouseType = mouseEventTypeFor(event.type)

    if (!mouseType) {
      return pointerResult
    }

    return event.target.dispatchEvent(createMouseEvent(mouseType, event)) && pointerResult
  }

  dispatchKeyboardEvent(event: KeyboardEventDescriptor): boolean {
    return event.target.dispatchEvent(createKeyboardEvent(event))
  }

  dispatchTextInputEvent(event: TextInputEventDescriptor): boolean {
    return event.target.dispatchEvent(createTextInputEvent(event))
  }
}

export function createEventDispatcher(): EventDispatcher {
  return new BrowserEventDispatcher()
}

type PointerEventConstructorLike = new (
  type: string,
  eventInitDict?: PointerEventInit,
) => PointerEvent

type InputEventConstructorLike = new (
  type: string,
  eventInitDict?: InputEventInit,
) => InputEvent

const pointerButtonToMouseButton: Record<PointerButtonName, number> = {
  primary: 0,
  auxiliary: 1,
  secondary: 2,
  back: 3,
  forward: 4,
}

const pointerButtonToButtonsFlag: Record<PointerButtonName, number> = {
  primary: 1,
  secondary: 2,
  auxiliary: 4,
  back: 8,
  forward: 16,
}

function createPointerEvent(event: PointerEventDescriptor): Event {
  const view = ownerWindow(event.target)
  const init = pointerMouseEventInit(event)
  const PointerEventCtor = view.PointerEvent as PointerEventConstructorLike | undefined

  if (typeof PointerEventCtor === 'function') {
    return new PointerEventCtor(event.type, {
      ...init,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })
  }

  const fallback = new view.MouseEvent(event.type, init)
  defineReadonlyEventProperty(fallback, 'pointerId', 1)
  defineReadonlyEventProperty(fallback, 'pointerType', 'mouse')
  defineReadonlyEventProperty(fallback, 'isPrimary', true)

  return fallback
}

function createMouseEvent(type: string, event: PointerEventDescriptor): MouseEvent {
  return new (ownerWindow(event.target).MouseEvent)(type, pointerMouseEventInit(event))
}

function pointerMouseEventInit(event: PointerEventDescriptor): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: event.point.x,
    clientY: event.point.y,
    button: event.button === undefined ? defaultMouseButton(event.type) : toMouseButton(event.button),
    buttons: toButtons(event.buttons),
  }
}

function createKeyboardEvent(event: KeyboardEventDescriptor): KeyboardEvent {
  const modifiers = new Set((event.modifiers ?? []).map((modifier) => modifier.toLowerCase()))

  return new (ownerWindow(event.target).KeyboardEvent)(event.type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    key: event.key,
    code: event.code,
    altKey: modifiers.has('alt') || modifiers.has('option'),
    ctrlKey: modifiers.has('ctrl') || modifiers.has('control'),
    metaKey: modifiers.has('meta') || modifiers.has('cmd') || modifiers.has('command'),
    shiftKey: modifiers.has('shift'),
  })
}

function createTextInputEvent(event: TextInputEventDescriptor): Event {
  const view = ownerWindow(event.target)

  if (event.type === 'change') {
    return new view.Event(event.type, {
      bubbles: true,
      cancelable: false,
      composed: true,
    })
  }

  const InputEventCtor = view.InputEvent as InputEventConstructorLike | undefined
  const init: InputEventInit = {
    bubbles: true,
    cancelable: event.type === 'beforeinput',
    composed: true,
    data: event.text ?? null,
    inputType: event.inputType ?? 'insertText',
  }

  if (typeof InputEventCtor === 'function') {
    return new InputEventCtor(event.type, init)
  }

  const fallback = new view.Event(event.type, init)
  defineReadonlyEventProperty(fallback, 'data', init.data)
  defineReadonlyEventProperty(fallback, 'inputType', init.inputType)

  return fallback
}

function ownerWindow(element: Element): Window & typeof globalThis {
  return element.ownerDocument.defaultView ?? globalThis.window
}

function mouseEventTypeFor(type: PointerEventDescriptor['type']): string | undefined {
  switch (type) {
    case 'pointermove':
      return 'mousemove'
    case 'pointerdown':
      return 'mousedown'
    case 'pointerup':
      return 'mouseup'
    case 'pointercancel':
      return undefined
  }
}

function defaultMouseButton(type: PointerEventDescriptor['type']): number {
  return type === 'pointermove' ? -1 : 0
}

function toMouseButton(button: PointerButtonName): number {
  return pointerButtonToMouseButton[button]
}

function toButtons(buttons: readonly PointerButtonName[] | undefined): number {
  return buttons?.reduce((flags, button) => flags | pointerButtonToButtonsFlag[button], 0) ?? 0
}

function defineReadonlyEventProperty(event: Event, property: string, value: unknown): void {
  Object.defineProperty(event, property, {
    configurable: true,
    enumerable: true,
    value,
  })
}
