import { actorbleError } from '../shared/index.js'
import { BrowserDomAdapter } from '../platform-adapter/dom-adapter/index.js'
import { BrowserEventDispatcher } from '../platform-adapter/event-dispatcher/index.js'
import { BrowserInteractionStateStore } from '../interaction-state-store/index.js'
import type { DomPort, EventDispatchPort, PressOptions } from '../shared/index.js'
import type { InteractionStateStore } from '../interaction-state-store/index.js'

export type KeyboardModifier = 'Alt' | 'Control' | 'Meta' | 'Shift'

export type KeyboardState = Readonly<{
  pressedKeys: readonly string[]
  modifiers: readonly KeyboardModifier[]
}>

export type KeyboardEngineOptions = Readonly<{
  dom?: DomPort
  events?: EventDispatchPort
  store?: InteractionStateStore
}>

export interface KeyboardEngine {
  getState(): KeyboardState
  keyDown(key: string, options?: PressOptions): Promise<KeyboardState>
  keyUp(key: string, options?: PressOptions): Promise<KeyboardState>
  press(keys: string, options?: PressOptions): Promise<KeyboardState>
}

export class BrowserKeyboardEngine implements KeyboardEngine {
  readonly #dom: DomPort
  readonly #events: EventDispatchPort
  readonly #store: InteractionStateStore
  readonly #pressedKeys: string[] = []

  constructor(options: KeyboardEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#events = options.events ?? new BrowserEventDispatcher()
    this.#store = options.store ?? new BrowserInteractionStateStore()
  }

  getState(): KeyboardState {
    return {
      pressedKeys: [...this.#pressedKeys],
      modifiers: this.#pressedKeys.filter(isKeyboardModifier) as KeyboardModifier[],
    }
  }

  async keyDown(key: string, _options: PressOptions = {}): Promise<KeyboardState> {
    const normalizedKey = normalizeKey(key)

    if (!this.#pressedKeys.includes(normalizedKey)) {
      this.#pressedKeys.push(normalizedKey)
    }

    this.#dispatch('keydown', normalizedKey)
    this.#syncKeyboardModality()

    return this.getState()
  }

  async keyUp(key: string, _options: PressOptions = {}): Promise<KeyboardState> {
    const normalizedKey = normalizeKey(key)
    const index = this.#pressedKeys.indexOf(normalizedKey)

    if (index >= 0) {
      this.#pressedKeys.splice(index, 1)
    }

    this.#dispatch('keyup', normalizedKey)

    return this.getState()
  }

  async press(keys: string, options: PressOptions = {}): Promise<KeyboardState> {
    const sequence = parseKeySequence(keys)
    const key = sequence[sequence.length - 1]
    const modifiers = sequence.slice(0, -1).filter(isKeyboardModifier) as KeyboardModifier[]
    const pressedByPress: KeyboardModifier[] = []

    for (const modifier of modifiers) {
      if (!this.#pressedKeys.includes(modifier)) {
        pressedByPress.push(modifier)
        await this.keyDown(modifier, options)
      }
    }

    await this.keyDown(key, options)
    await this.keyUp(key, options)

    for (const modifier of [...pressedByPress].reverse()) {
      await this.keyUp(modifier, options)
    }

    return this.getState()
  }

  #dispatch(type: 'keydown' | 'keyup', key: string): void {
    const target = this.#dom.getActiveElement()

    if (!target) {
      throw actorbleError('INTERACTABILITY_FAILED', 'Keyboard Engine requires an active target.', {
        details: { boundary: 'keyboard-engine', key },
      })
    }

    this.#events.dispatchKeyboardEvent({
      type,
      target,
      key,
      code: codeForKey(key),
      modifiers: this.getState().modifiers,
    })
  }

  #syncKeyboardModality(): void {
    const activeElement = this.#dom.getActiveElement()

    if (!activeElement) {
      return
    }

    this.#store.setFocused(
      {
        id: 'active-element',
        element: activeElement,
        resolvedAt: 0,
        root: this.#dom.getRoot(),
        validity: this.#dom.isConnected(activeElement) ? 'live' : 'detached',
        debug: this.#dom.describeElement(activeElement),
      },
      true,
    )
  }
}

export function createKeyboardEngine(options: KeyboardEngineOptions = {}): KeyboardEngine {
  return new BrowserKeyboardEngine(options)
}

function parseKeySequence(keys: string): readonly string[] {
  const sequence = keys
    .split('+')
    .map((part) => normalizeKey(part.trim()))
    .filter((part) => part.length > 0)

  if (sequence.length === 0) {
    throw actorbleError('INTERACTABILITY_FAILED', 'Keyboard Engine requires a key sequence.', {
      details: { boundary: 'keyboard-engine', keys },
    })
  }

  return sequence
}

function normalizeKey(key: string): string {
  const lower = key.toLowerCase()

  switch (lower) {
    case 'alt':
    case 'option':
      return 'Alt'
    case 'control':
    case 'ctrl':
      return 'Control'
    case 'command':
    case 'cmd':
    case 'meta':
      return 'Meta'
    case 'shift':
      return 'Shift'
    case 'esc':
      return 'Escape'
    case 'space':
      return ' '
    default:
      return key.length === 1 ? key.toUpperCase() : key
  }
}

function isKeyboardModifier(key: string): key is KeyboardModifier {
  return key === 'Alt' || key === 'Control' || key === 'Meta' || key === 'Shift'
}

function codeForKey(key: string): string | undefined {
  if (/^[A-Z]$/.test(key)) {
    return `Key${key}`
  }

  if (/^[0-9]$/.test(key)) {
    return `Digit${key}`
  }

  switch (key) {
    case 'Alt':
      return 'AltLeft'
    case 'Control':
      return 'ControlLeft'
    case 'Meta':
      return 'MetaLeft'
    case 'Shift':
      return 'ShiftLeft'
    case 'Escape':
      return 'Escape'
    case 'Enter':
      return 'Enter'
    case 'Tab':
      return 'Tab'
    case ' ':
      return 'Space'
    default:
      return undefined
  }
}
