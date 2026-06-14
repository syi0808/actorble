import {
  ActorbleError,
  actorbleError,
  cancellationError,
  timeoutError,
} from '../../shared/index.js'
import { BrowserDomAdapter } from '../../platform/platform-adapter/dom-adapter/index.js'
import { BrowserEventDispatcher } from '../../platform/platform-adapter/event-dispatcher/index.js'
import { BrowserInteractionStateStore } from '../../state/interaction-state-store/index.js'
import { BrowserTimelineEngine } from '../../runtime/timeline-engine/index.js'
import type {
  CancellationSignalLike,
  DomPort,
  DurationMs,
  EventDispatchPort,
  PressOptions,
} from '../../shared/index.js'
import type { InteractionStateStore } from '../../state/interaction-state-store/index.js'
import type { TimelineEngine } from '../../runtime/timeline-engine/index.js'

export type KeyboardModifier = 'Alt' | 'Control' | 'Meta' | 'Shift'

export type KeyboardState = Readonly<{
  pressedKeys: readonly string[]
  modifiers: readonly KeyboardModifier[]
}>

export type KeyboardEngineOptions = Readonly<{
  dom?: DomPort
  events?: EventDispatchPort
  store?: InteractionStateStore
  timeline?: TimelineEngine
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
  readonly #timeline: TimelineEngine
  readonly #pressedKeys: string[] = []

  constructor(options: KeyboardEngineOptions = {}) {
    this.#dom = options.dom ?? new BrowserDomAdapter()
    this.#events = options.events ?? new BrowserEventDispatcher()
    this.#store = options.store ?? new BrowserInteractionStateStore()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
  }

  getState(): KeyboardState {
    return {
      pressedKeys: [...this.#pressedKeys],
      modifiers: this.#pressedKeys.filter(isKeyboardModifier) as KeyboardModifier[],
    }
  }

  async keyDown(key: string, _options: PressOptions = {}): Promise<KeyboardState> {
    const normalizedKey = normalizeKey(key)
    const target = this.#activeKeyboardTargetOrThrow(normalizedKey)
    const pressed = !this.#pressedKeys.includes(normalizedKey)

    if (pressed) {
      this.#pressedKeys.push(normalizedKey)
    }

    try {
      this.#dispatch('keydown', normalizedKey, target)
    } catch (error) {
      if (pressed) {
        this.#removePressedKey(normalizedKey)
      }

      throw error
    }

    this.#syncKeyboardModality()

    return this.getState()
  }

  async keyUp(key: string, _options: PressOptions = {}): Promise<KeyboardState> {
    const normalizedKey = normalizeKey(key)

    this.#removePressedKey(normalizedKey)

    this.#dispatch('keyup', normalizedKey)

    return this.getState()
  }

  async press(keys: string, options: PressOptions = {}): Promise<KeyboardState> {
    return withKeyboardOperationTimeout('keyboard.press', options, async (signal) => {
      await this.#pressSequence(keys, options, signal)

      return this.getState()
    })
  }

  async #pressSequence(
    keys: string,
    options: PressOptions,
    signal: CancellationSignalLike | undefined,
  ): Promise<void> {
    const sequence = parseKeySequence(keys)
    const key = sequence[sequence.length - 1]
    const modifiers = sequence.slice(0, -1).filter(isKeyboardModifier) as KeyboardModifier[]
    const pressedByPress: string[] = []

    try {
      for (const modifier of modifiers) {
        assertKeyboardNotCancelled('keyboard.press', signal)

        if (!this.#pressedKeys.includes(modifier)) {
          pressedByPress.push(modifier)
        }

        await this.keyDown(modifier, signal === undefined ? options : { ...options, signal })
      }

      assertKeyboardNotCancelled('keyboard.press', signal)

      if (!this.#pressedKeys.includes(key)) {
        pressedByPress.push(key)
      }

      await this.keyDown(key, signal === undefined ? options : { ...options, signal })
      await delayKeyHold(this.#timeline, options.delay, signal)
      assertKeyboardNotCancelled('keyboard.press', signal)
    } finally {
      await this.#releasePressedByPress(pressedByPress)
    }
  }

  async #releasePressedByPress(pressedByPress: readonly string[]): Promise<void> {
    let cleanupError: unknown

    for (const key of [...pressedByPress].reverse()) {
      if (this.#pressedKeys.includes(key)) {
        try {
          await this.keyUp(key)
        } catch (error) {
          cleanupError ??= error
        }
      }
    }

    if (cleanupError !== undefined) {
      throw cleanupError
    }
  }

  #dispatch(
    type: 'keydown' | 'keyup',
    key: string,
    target = this.#activeKeyboardTargetOrThrow(key),
  ): void {
    this.#events.dispatchKeyboardEvent({
      type,
      target,
      key,
      code: codeForKey(key),
      modifiers: this.getState().modifiers,
    })
  }

  #activeKeyboardTargetOrThrow(key: string): Element {
    const target = this.#dom.getActiveElement()

    if (!target) {
      throw actorbleError('INTERACTABILITY_FAILED', 'Keyboard Engine requires an active target.', {
        details: { boundary: 'keyboard-engine', key },
      })
    }

    return target
  }

  #removePressedKey(key: string): void {
    const index = this.#pressedKeys.indexOf(key)

    if (index >= 0) {
      this.#pressedKeys.splice(index, 1)
    }
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

type KeyboardOperationName = 'keyboard.press'

async function delayKeyHold(
  timeline: TimelineEngine,
  delay: DurationMs | undefined,
  signal: CancellationSignalLike | undefined,
): Promise<void> {
  if (delay === undefined || !Number.isFinite(delay) || delay <= 0) {
    return
  }

  await timeline.delay(delay, signal === undefined ? {} : { signal })
}

async function withKeyboardOperationTimeout<TValue>(
  operation: KeyboardOperationName,
  options: PressOptions,
  run: (signal: CancellationSignalLike | undefined) => Promise<TValue>,
): Promise<TValue> {
  if (options.timeout === undefined) {
    if (options.signal?.aborted) {
      throw cancellationError(operation, options.signal.reason)
    }

    try {
      return await run(options.signal)
    } catch (error) {
      throw normalizeKeyboardOperationError(error, operation, options.timeout)
    }
  }

  const timeout = normalizeDuration(options.timeout)
  const timeoutFailure = timeoutError(operation, timeout, {
    details: keyboardOperationDetails(),
  })
  const controller = new AbortController()
  let timerId: ReturnType<typeof setTimeout> | null = null

  if (options.signal?.aborted) {
    throw cancellationError(operation, options.signal.reason)
  }

  const abortFromExternalSignal = () => {
    controller.abort(options.signal?.reason)
  }

  options.signal?.addEventListener('abort', abortFromExternalSignal, { once: true })

  timerId = setTimeout(() => {
    controller.abort(timeoutFailure)
  }, timeout)

  try {
    return await run(controller.signal)
  } catch (error) {
    throw normalizeKeyboardOperationError(
      error,
      operation,
      options.timeout,
      controller.signal.reason,
    )
  } finally {
    if (timerId !== null) {
      clearTimeout(timerId)
    }

    options.signal?.removeEventListener('abort', abortFromExternalSignal)
  }
}

function normalizeDuration(duration: DurationMs): DurationMs {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function assertKeyboardNotCancelled(
  operation: KeyboardOperationName,
  signal: CancellationSignalLike | undefined,
): void {
  if (signal?.aborted) {
    throw cancellationError(operation, signal.reason)
  }
}

function normalizeKeyboardOperationError(
  error: unknown,
  operation: KeyboardOperationName,
  timeout: DurationMs | undefined,
  abortReason?: unknown,
): ActorbleError {
  if (abortReason instanceof ActorbleError && abortReason.code === 'ACTION_TIMEOUT') {
    return abortReason
  }

  if (error instanceof ActorbleError) {
    if (error.code === 'ACTION_CANCELLED' && error.details?.operation !== operation) {
      const reason = abortReason ?? error.details?.reason

      if (reason instanceof ActorbleError && reason.code === 'ACTION_TIMEOUT') {
        return reason
      }

      return cancellationError(operation, reason)
    }

    if (
      error.code === 'ACTION_TIMEOUT' &&
      error.details?.operation !== operation &&
      timeout !== undefined
    ) {
      return timeoutError(operation, normalizeDuration(timeout), {
        cause: error,
        details: keyboardOperationDetails(),
      })
    }

    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', `${operation} failed.`, {
    cause: error,
    details: keyboardOperationDetails(),
  })
}

function keyboardOperationDetails(): Readonly<Record<string, unknown>> {
  return { boundary: 'keyboard-engine' }
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
