import {
  ActorbleError,
  actorbleError,
  cancellationError,
  timeoutError,
} from '../shared/index.js'
import { BrowserEventDispatcher } from '../platform-adapter/event-dispatcher/index.js'
import { BrowserFocusEngine } from '../focus-engine/index.js'
import { BrowserInteractionStateStore } from '../interaction-state-store/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import type {
  ActorbleErrorDetails,
  CancellationSignalLike,
  DurationMs,
  FillOptions,
  TargetHandle,
  TargetLike,
  TypeOptions,
} from '../shared/index.js'
import type { FocusEngine } from '../focus-engine/index.js'
import type {
  EventDispatcher,
  TextInputMutationPort,
} from '../platform-adapter/event-dispatcher/index.js'
import type { DomPort, EventDispatchPort } from '../shared/index.js'
import type { InteractionStateStore } from '../interaction-state-store/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

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
  timeline?: TimelineEngine
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
  readonly #timeline: TimelineEngine

  constructor(options: TextInputEngineOptions = {}) {
    const store = options.store ?? new BrowserInteractionStateStore()
    const eventDispatcher = options.events ?? new BrowserEventDispatcher()

    this.#focus = options.focus ?? new BrowserFocusEngine({ dom: options.dom, store })
    this.#events = eventDispatcher
    this.#mutations = textMutationPort(eventDispatcher)
    this.#store = store
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
  }

  async type(text: string, options: TypeOptions = {}): Promise<TextInputResult> {
    const focused = await this.#focus.getFocused()

    if (!focused.active) {
      throw textInputError('type requires a focused editable target.', {
        strategy: 'type',
      })
    }

    await this.#typeTarget('type', focused.active, text, options)

    return { strategy: 'type', text }
  }

  async typeInto(
    target: TargetLike,
    text: string,
    options: TypeOptions = {},
  ): Promise<TextInputResult> {
    const focused = await this.#focus.focus(target)

    if (!focused.active) {
      throw textInputError('typeInto could not focus an editable target.', {
        strategy: 'typeInto',
      })
    }

    await this.#typeTarget('typeInto', focused.active, text, options)

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

  async #typeTarget(
    strategy: Extract<TextInputStrategy, 'type' | 'typeInto'>,
    target: TargetHandle,
    text: string,
    options: TypeOptions,
  ): Promise<void> {
    const operation = textOperationName(strategy)

    await withTextOperationTimeout(operation, options, (signal) =>
      this.#withTyping(target, async () => {
        this.#assertEditable(target)

        const parts = splitGraphemes(text)
        let mutated = false

        for (const [index, part] of parts.entries()) {
          if (index > 0) {
            await delayBetweenInputs(this.#timeline, options.delay, signal)
          }

          assertNotCancelled(operation, signal)

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

          assertNotCancelled(operation, signal)
          this.#mutations.mutateTextInput(target.element, part, 'insert')
          mutated = true
          this.#events.dispatchTextInputEvent({
            type: 'input',
            target: target.element,
            text: part,
            inputType: 'insertText',
          })
        }

        if (mutated) {
          this.#events.dispatchTextInputEvent({ type: 'change', target: target.element })
        }
      }),
    )
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

type TextOperationName = 'text.type' | 'text.typeInto'

type GraphemeSegmenter = Readonly<{
  segment(text: string): Iterable<Readonly<{ segment: string }>>
}>

type IntlWithSegmenter = typeof Intl &
  Readonly<{
    Segmenter?: new (
      locales?: string | readonly string[],
      options?: Readonly<{ granularity?: 'grapheme' }>,
    ) => GraphemeSegmenter
  }>

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

function textOperationName(
  strategy: Extract<TextInputStrategy, 'type' | 'typeInto'>,
): TextOperationName {
  return strategy === 'type' ? 'text.type' : 'text.typeInto'
}

function splitGraphemes(text: string): readonly string[] {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter

  if (typeof Segmenter === 'function') {
    return Array.from(
      new Segmenter(undefined, { granularity: 'grapheme' }).segment(text),
      (part) => part.segment,
    )
  }

  return Array.from(text)
}

async function delayBetweenInputs(
  timeline: TimelineEngine,
  delay: DurationMs | undefined,
  signal: CancellationSignalLike | undefined,
): Promise<void> {
  if (delay === undefined || !Number.isFinite(delay) || delay <= 0) {
    return
  }

  await timeline.delay(delay, signal === undefined ? {} : { signal })
}

function withTextOperationTimeout<TValue>(
  operation: TextOperationName,
  options: TypeOptions,
  run: (signal: CancellationSignalLike | undefined) => Promise<TValue>,
): Promise<TValue> {
  if (options.timeout === undefined) {
    if (options.signal?.aborted) {
      return Promise.reject(cancellationError(operation, options.signal.reason))
    }

    return run(options.signal).catch((error: unknown) => {
      throw normalizeTextOperationError(error, operation, options.timeout)
    })
  }

  const timeout = normalizeDuration(options.timeout)
  const signal = options.signal

  if (signal?.aborted) {
    return Promise.reject(cancellationError(operation, signal.reason))
  }

  const controller = new AbortController()
  const timeoutFailure = timeoutError(operation, timeout, {
    details: textOperationDetails(),
  })

  return new Promise((resolve, reject) => {
    let timerId: ReturnType<typeof setTimeout> | null = null
    let finished = false

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }

      signal?.removeEventListener('abort', onAbort)
    }

    const complete = (value: TValue) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()
      resolve(value)
    }

    const fail = (error: ActorbleError) => {
      if (finished) {
        return
      }

      finished = true
      cleanup()
      reject(error)
    }

    const onAbort = () => {
      controller.abort(signal?.reason)
      fail(cancellationError(operation, signal?.reason))
    }

    timerId = setTimeout(() => {
      controller.abort(timeoutFailure)
      fail(timeoutFailure)
    }, timeout)

    signal?.addEventListener('abort', onAbort, { once: true })
    run(controller.signal).then(complete, (error) => {
      fail(normalizeTextOperationError(error, operation, timeout))
    })
  })
}

function normalizeDuration(duration: DurationMs): DurationMs {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function assertNotCancelled(
  operation: TextOperationName,
  signal: CancellationSignalLike | undefined,
): void {
  if (signal?.aborted) {
    throw cancellationError(operation, signal.reason)
  }
}

function normalizeTextOperationError(
  error: unknown,
  operation: TextOperationName,
  timeout: DurationMs | undefined,
): ActorbleError {
  if (error instanceof ActorbleError) {
    if (error.code === 'ACTION_CANCELLED' && error.details?.operation !== operation) {
      return cancellationError(operation, error.details?.reason)
    }

    if (
      error.code === 'ACTION_TIMEOUT' &&
      error.details?.operation !== operation &&
      timeout !== undefined
    ) {
      return timeoutError(operation, normalizeDuration(timeout), {
        cause: error,
        details: textOperationDetails(),
      })
    }

    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', `${operation} failed.`, {
    cause: error,
    details: textOperationDetails(),
  })
}

function textOperationDetails(): ActorbleErrorDetails {
  return { boundary: 'text-input-engine' }
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
