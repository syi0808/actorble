import { actorbleError } from '../shared/index.js'
import { BrowserEventDispatcher } from '../platform-adapter/event-dispatcher/index.js'
import { BrowserFocusEngine } from '../focus-engine/index.js'
import { BrowserInteractionStateStore } from '../interaction-state-store/index.js'
import type { FillOptions, TargetHandle, TargetLike, TypeOptions } from '../shared/index.js'
import type { FocusEngine } from '../focus-engine/index.js'
import type {
  EventDispatcher,
  TextInputMutationPort,
} from '../platform-adapter/event-dispatcher/index.js'
import type { DomPort, EventDispatchPort } from '../shared/index.js'
import type { InteractionStateStore } from '../interaction-state-store/index.js'

export type TextInputStrategy = 'type' | 'typeInto' | 'fill'

export type TextInputResult = Readonly<{
  strategy: TextInputStrategy
  text: string
}>

export type TextInputEngineOptions = Readonly<{
  focus?: FocusEngine
  events?: EventDispatchPort & Partial<TextInputMutationPort>
  store?: InteractionStateStore
  dom?: DomPort
}>

export interface TextInputEngine {
  type(text: string, options?: TypeOptions): Promise<TextInputResult>
  typeInto(target: TargetLike, text: string, options?: TypeOptions): Promise<TextInputResult>
  fill(target: TargetLike, text: string, options?: FillOptions): Promise<TextInputResult>
}

export class BrowserTextInputEngine implements TextInputEngine {
  readonly #focus: FocusEngine
  readonly #events: EventDispatchPort
  readonly #mutations: TextInputMutationPort
  readonly #store: InteractionStateStore

  constructor(options: TextInputEngineOptions = {}) {
    const store = options.store ?? new BrowserInteractionStateStore()
    const eventDispatcher = options.events ?? new BrowserEventDispatcher()

    this.#focus = options.focus ?? new BrowserFocusEngine({ dom: options.dom, store })
    this.#events = eventDispatcher
    this.#mutations = textMutationPort(eventDispatcher)
    this.#store = store
  }

  async type(text: string, _options: TypeOptions = {}): Promise<TextInputResult> {
    const focused = await this.#focus.getFocused()

    if (!focused.active) {
      throw textInputError('type requires a focused editable target.', {
        strategy: 'type',
      })
    }

    await this.#typeTarget(focused.active, text)

    return { strategy: 'type', text }
  }

  async typeInto(
    target: TargetLike,
    text: string,
    _options: TypeOptions = {},
  ): Promise<TextInputResult> {
    const focused = await this.#focus.focus(target)

    if (!focused.active) {
      throw textInputError('typeInto could not focus an editable target.', {
        strategy: 'typeInto',
      })
    }

    await this.#typeTarget(focused.active, text)

    return { strategy: 'typeInto', text }
  }

  async fill(
    target: TargetLike,
    text: string,
    options: FillOptions = {},
  ): Promise<TextInputResult> {
    const focused = await this.#focus.focus(target)

    if (!focused.active) {
      throw textInputError('fill could not focus an editable target.', {
        strategy: 'fill',
      })
    }

    const targetHandle = focused.active

    await this.#withTyping(targetHandle, async () => {
      this.#assertEditable(targetHandle)
      const inputType = options.clear === false ? 'insertText' : 'insertReplacementText'

      if (
        !this.#events.dispatchTextInputEvent({
          type: 'beforeinput',
          target: targetHandle.element,
          text,
          inputType,
        })
      ) {
        return
      }

      this.#mutations.mutateTextInput(
        targetHandle.element,
        text,
        options.clear === false ? 'insert' : 'replace',
      )
      this.#events.dispatchTextInputEvent({
        type: 'input',
        target: targetHandle.element,
        text,
        inputType,
      })
      this.#events.dispatchTextInputEvent({ type: 'change', target: targetHandle.element })
    })

    return { strategy: 'fill', text }
  }

  async #typeTarget(target: TargetHandle, text: string): Promise<void> {
    await this.#withTyping(target, async () => {
      this.#assertEditable(target)

      for (const part of Array.from(text)) {
        if (
          !this.#events.dispatchTextInputEvent({
            type: 'beforeinput',
            target: target.element,
            text: part,
            inputType: 'insertText',
          })
        ) {
          continue
        }

        this.#mutations.mutateTextInput(target.element, part, 'insert')
        this.#events.dispatchTextInputEvent({
          type: 'input',
          target: target.element,
          text: part,
          inputType: 'insertText',
        })
      }

      if (text.length > 0) {
        this.#events.dispatchTextInputEvent({ type: 'change', target: target.element })
      }
    })
  }

  async #withTyping(target: TargetHandle, operation: () => Promise<void>): Promise<void> {
    this.#store.setTyping(target)

    try {
      await operation()
    } finally {
      this.#store.setTyping(null)
    }
  }

  #assertEditable(target: TargetHandle): void {
    if (!this.#mutations.isEditableTarget(target.element)) {
      throw textInputError('Text Input Engine target is not editable.', {
        targetId: target.id,
        description: target.debug.description,
      })
    }
  }
}

export function createTextInputEngine(
  options: TextInputEngineOptions = {},
): TextInputEngine {
  return new BrowserTextInputEngine(options)
}

function textMutationPort(
  events: EventDispatchPort & Partial<TextInputMutationPort>,
): TextInputMutationPort {
  if (
    typeof events.isEditableTarget === 'function' &&
    typeof events.mutateTextInput === 'function'
  ) {
    return events as EventDispatcher
  }

  throw actorbleError(
    'PLATFORM_UNSUPPORTED',
    'Text Input Engine requires a text mutation-capable event dispatcher.',
    {
      details: { boundary: 'text-input-engine' },
    },
  )
}

function textInputError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): Error {
  return actorbleError('INTERACTABILITY_FAILED', message, {
    details: {
      boundary: 'text-input-engine',
      ...details,
    },
  })
}
