import {
  isActorbleExtensionMessage,
  type ActorbleExtensionMessageByKind,
  type ExtensionMessageKind,
  type RequiredTabCorrelation,
} from '../../messaging/index.js'
import {
  createRecorderEventCapturePort,
  detectSensitiveInputReason,
  type RawRecordedEvent,
  type RecorderClickEvent,
  type RecorderEventCaptureAdapter,
  type RecorderEventCapturePort,
  type RecorderTargetSnapshot,
  type RecorderTextEvent,
} from '../../recorder/event-capture.js'
import { failure, ok, type ExtensionResult } from '../../shared/result.js'

export type ContentRecorderMessage = ActorbleExtensionMessageByKind<
  'record:start' | 'record:stop'
>

export type ContentRecorderReceipt = RequiredTabCorrelation &
  Readonly<{
    kind: 'record:start' | 'record:stop'
    sessionId: string
    scenarioId?: string
    runId?: string
    status: 'recording' | 'stopped'
    events?: readonly RawRecordedEvent[]
  }>

export type ContentRecorderHost = Readonly<{
  handleMessage(message: unknown): Promise<ExtensionResult<ContentRecorderReceipt>>
  dispose(): void
}>

export type ContentRecorderHostOptions = Readonly<{
  capture: RecorderEventCapturePort
  now?: () => number
}>

type RecordStartMessage = ActorbleExtensionMessageByKind<'record:start'>
type RecordStopMessage = ActorbleExtensionMessageByKind<'record:stop'>

export function createContentRecorderHost(
  options: ContentRecorderHostOptions,
): ContentRecorderHost {
  const getNow = options.now ?? Date.now

  async function handleMessage(
    message: unknown,
  ): Promise<ExtensionResult<ContentRecorderReceipt>> {
    if (!isActorbleExtensionMessage(message)) {
      return failure({
        code: 'unsupported_message',
        message: 'Content recorder received an unsupported message.',
        details: { kind: readMessageKind(message) },
      })
    }

    switch (message.kind) {
      case 'record:start':
        return startRecording(message)
      case 'record:stop':
        return stopRecording(message)
      case 'scenario:validate':
      case 'scenario:compile':
      case 'scenario:run':
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
      case 'record:draft:get':
      case 'inspector:start':
      case 'inspector:stop':
      case 'inspector:selected':
      case 'inspector:cancelled':
      case 'locator:preview':
      case 'trace:event':
      case 'runtime:status':
      case 'popup:get-state':
        return failure({
          code: 'unsupported_message',
          message: `${message.kind} is not handled by the content recorder host.`,
          details: { kind: message.kind },
        })
    }
  }

  function startRecording(
    message: RecordStartMessage,
  ): ExtensionResult<ContentRecorderReceipt> {
    const sessionId = recordSessionId(message.payload)
    const result = options.capture.start({
      tabId: message.payload.tabId,
      ...(message.payload.frameId === undefined ? {} : { frameId: message.payload.frameId }),
      sessionId,
      startedAt: getNow(),
      sensitiveInputPolicy: 'mask',
    })

    if (!result.ok) {
      return result
    }

    return ok({
      kind: 'record:start',
      tabId: message.payload.tabId,
      ...(message.payload.frameId === undefined ? {} : { frameId: message.payload.frameId }),
      ...(message.payload.scenarioId === undefined ? {} : { scenarioId: message.payload.scenarioId }),
      ...(message.payload.runId === undefined ? {} : { runId: message.payload.runId }),
      sessionId,
      status: 'recording',
    })
  }

  function stopRecording(
    message: RecordStopMessage,
  ): ExtensionResult<ContentRecorderReceipt> {
    const sessionId = recordSessionId(message.payload)
    const result = options.capture.stop(sessionId)

    if (!result.ok) {
      return result
    }

    return ok({
      kind: 'record:stop',
      tabId: message.payload.tabId,
      ...(message.payload.frameId === undefined ? {} : { frameId: message.payload.frameId }),
      ...(message.payload.scenarioId === undefined ? {} : { scenarioId: message.payload.scenarioId }),
      ...(message.payload.runId === undefined ? {} : { runId: message.payload.runId }),
      sessionId,
      status: 'stopped',
      events: result.value,
    })
  }

  return {
    handleMessage,
    dispose() {
      options.capture.dispose()
    },
  }
}

export function createDomRecorderEventCapturePort(): RecorderEventCapturePort {
  return createRecorderEventCapturePort(createDomRecorderAdapter())
}

export function createDomRecorderAdapter(
  documentRef: Document = document,
): RecorderEventCaptureAdapter<Element> {
  return {
    onClick(listener) {
      return addDocumentListener(documentRef, 'click', (event) => {
        listener(toRecorderClickEvent(event))
      })
    },
    onInput(listener) {
      return addDocumentListener(documentRef, 'input', (event) => {
        listener(toRecorderTextEvent(event))
      })
    },
    onChange(listener) {
      return addDocumentListener(documentRef, 'change', (event) => {
        listener(toRecorderTextEvent(event))
      })
    },
    onPagehide(listener) {
      const view = documentRef.defaultView
      if (view === null) {
        return () => {}
      }

      view.addEventListener('pagehide', listener, true)
      return () => {
        view.removeEventListener('pagehide', listener, true)
      }
    },
    describeElement(element) {
      return describeElement(element, documentRef)
    },
    readElementValue,
    sensitiveInputReason(element) {
      const target = describeElement(element, documentRef)
      return detectSensitiveInputReason({
        inputType: target.inputType,
        id: target.id,
        name: target.name,
        ariaLabel: target.ariaLabel,
        labelText: target.labelText,
        placeholder: target.placeholder,
        autocomplete: element.getAttribute('autocomplete') ?? undefined,
      })
    },
  }
}

function recordSessionId(
  correlation: RequiredTabCorrelation & Readonly<{ runId?: string }>,
): string {
  return correlation.runId ?? `${correlation.tabId}:${correlation.frameId ?? 0}`
}

function addDocumentListener<K extends keyof DocumentEventMap>(
  documentRef: Document,
  type: K,
  listener: (event: DocumentEventMap[K]) => void,
): () => void {
  documentRef.addEventListener(type, listener as EventListener, true)
  return () => {
    documentRef.removeEventListener(type, listener as EventListener, true)
  }
}

function toRecorderClickEvent(event: MouseEvent): RecorderClickEvent<Element> {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    button: event.button,
    target: elementFromEventTarget(event.target),
  }
}

function toRecorderTextEvent(event: Event): RecorderTextEvent<Element> {
  return {
    target: elementFromEventTarget(event.target),
  }
}

function elementFromEventTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target
  }

  if (target instanceof Node) {
    return target.parentElement
  }

  return null
}

function describeElement(
  element: Element,
  documentRef: Document,
): RecorderTargetSnapshot {
  const rect = element.getBoundingClientRect()
  const classes = Array.from(element.classList)
  const id = element.id
  const role = element.getAttribute('role') ?? undefined
  const ariaLabel = element.getAttribute('aria-label') ?? undefined
  const labelText = labelTextFor(element, documentRef)
  const testId = testIdFor(element)
  const inputType = inputTypeFor(element)
  const name = nameFor(element)
  const placeholder = placeholderFor(element)
  const href = hrefFor(element)
  const text = normalizedText(element.textContent)

  return {
    tagName: element.tagName.toLowerCase(),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    frameUrl: documentRef.location.href,
    ...(id.length === 0 ? {} : { id }),
    ...(classes.length === 0 ? {} : { classes }),
    ...(role === undefined || role.length === 0 ? {} : { role }),
    ...(ariaLabel === undefined || ariaLabel.length === 0 ? {} : { ariaLabel }),
    ...(labelText === undefined ? {} : { labelText }),
    ...(testId === undefined ? {} : { testId }),
    ...(inputType === undefined ? {} : { inputType }),
    ...(name === undefined ? {} : { name }),
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(href === undefined ? {} : { href }),
    ...(text === undefined ? {} : { text }),
  }
}

function readElementValue(element: Element): string {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value
  }

  if (element instanceof HTMLElement && element.isContentEditable) {
    return element.innerText
  }

  return ''
}

function inputTypeFor(element: Element): string | undefined {
  if (element instanceof HTMLInputElement) {
    return element.type
  }

  if (element instanceof HTMLTextAreaElement) {
    return 'textarea'
  }

  if (element instanceof HTMLSelectElement) {
    return 'select'
  }

  return emptyToUndefined(element.getAttribute('type'))
}

function nameFor(element: Element): string | undefined {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return emptyToUndefined(element.name)
  }

  return emptyToUndefined(element.getAttribute('name'))
}

function placeholderFor(element: Element): string | undefined {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    return emptyToUndefined(element.placeholder)
  }

  return emptyToUndefined(element.getAttribute('placeholder'))
}

function hrefFor(element: Element): string | undefined {
  if (element instanceof HTMLAnchorElement) {
    return emptyToUndefined(element.href)
  }

  return emptyToUndefined(element.getAttribute('href'))
}

function testIdFor(element: Element): string | undefined {
  return (
    emptyToUndefined(element.getAttribute('data-testid')) ??
    emptyToUndefined(element.getAttribute('data-test-id')) ??
    emptyToUndefined(element.getAttribute('data-test'))
  )
}

function labelTextFor(element: Element, documentRef: Document): string | undefined {
  const id = element.id
  if (id.length > 0) {
    const label = Array.from(documentRef.querySelectorAll('label')).find(
      (candidate) => candidate.htmlFor === id,
    )
    const text = normalizedText(label?.textContent ?? null)
    if (text !== undefined) {
      return text
    }
  }

  const wrappingLabel = element.closest('label')
  return normalizedText(wrappingLabel?.textContent ?? null)
}

function normalizedText(text: string | null): string | undefined {
  const normalized = text?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length === 0) {
    return undefined
  }

  return normalized.length > 160 ? `${normalized.slice(0, 157)}...` : normalized
}

function emptyToUndefined(value: string | null): string | undefined {
  if (value === null || value.length === 0) {
    return undefined
  }

  return value
}

function readMessageKind(message: unknown): ExtensionMessageKind | string | undefined {
  if (typeof message !== 'object' || message === null || !('kind' in message)) {
    return undefined
  }

  const kind = (message as Readonly<{ kind?: unknown }>).kind
  return typeof kind === 'string' ? kind : undefined
}
