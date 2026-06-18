import {
  createExtensionMessage,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type ExtensionMessageKind,
  type InspectorCancellationReason,
  type InspectorSessionCorrelation,
  type InspectorTargetMetadata,
  type InspectorTargetRect,
} from '../../messaging/index.js'
import { failure, ok, type ExtensionResult } from '../../shared/result.js'

export type ContentInspectorPointerEvent = Readonly<{
  clientX: number
  clientY: number
  preventDefault(): void
  stopPropagation(): void
}>

export type ContentInspectorKeyboardEvent = Readonly<{
  key: string
  preventDefault(): void
  stopPropagation(): void
}>

export type ContentInspectorAdapter<TElement = unknown> = Readonly<{
  onPointerMove(listener: (event: ContentInspectorPointerEvent) => void): () => void
  onClick(listener: (event: ContentInspectorPointerEvent) => void): () => void
  onKeydown(listener: (event: ContentInspectorKeyboardEvent) => void): () => void
  onPagehide(listener: () => void): () => void
  elementFromPoint(clientX: number, clientY: number): TElement | null
  describeElement(element: TElement): InspectorTargetMetadata
  highlight(rect: InspectorTargetRect): void
  clearHighlight(): void
}>

export type ContentInspectorReceipt = InspectorSessionCorrelation &
  Readonly<{
    kind: 'inspector:start' | 'inspector:stop'
    status: 'inspecting' | 'stopped'
  }>

export type ContentInspectorHost = Readonly<{
  handleMessage(message: unknown): Promise<ExtensionResult<ContentInspectorReceipt>>
  dispose(): void
}>

export type ContentInspectorHostOptions<TElement = unknown> = Readonly<{
  adapter: ContentInspectorAdapter<TElement>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

type ActiveInspection<TElement> = {
  correlation: InspectorSessionCorrelation
  disposers: (() => void)[]
  hoveredElement: TElement | null
  cleaned: boolean
}

export function createContentInspectorHost<TElement = unknown>(
  options: ContentInspectorHostOptions<TElement>,
): ContentInspectorHost {
  const { adapter, sendMessage } = options
  let activeInspection: ActiveInspection<TElement> | null = null

  async function handleMessage(
    message: unknown,
  ): Promise<ExtensionResult<ContentInspectorReceipt>> {
    if (!isActorbleExtensionMessage(message)) {
      return inspectorFailure('Content inspector received an unsupported message.', {
        kind: readMessageKind(message),
      })
    }

    switch (message.kind) {
      case 'inspector:start':
        return startInspection(message.payload)
      case 'inspector:stop':
        return stopInspection(message.payload)
      case 'scenario:validate':
      case 'scenario:compile':
      case 'scenario:run':
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
      case 'record:start':
      case 'record:stop':
      case 'record:draft:get':
      case 'inspector:selected':
      case 'inspector:cancelled':
      case 'locator:preview':
      case 'trace:event':
      case 'runtime:status':
      case 'content:ready':
      case 'popup:get-state':
        return failure({
          code: 'unsupported_message',
          message: `${message.kind} is not handled by the content inspector host.`,
          details: { kind: message.kind },
        })
    }
  }

  function startInspection(
    correlation: InspectorSessionCorrelation,
  ): ExtensionResult<ContentInspectorReceipt> {
    if (activeInspection !== null) {
      return inspectorFailure('A target inspection session is already active.', {
        activeSessionId: activeInspection.correlation.sessionId,
        requestedSessionId: correlation.sessionId,
      })
    }

    const inspection: ActiveInspection<TElement> = {
      correlation: normalizeCorrelation(correlation),
      disposers: [],
      hoveredElement: null,
      cleaned: false,
    }

    inspection.disposers = [
      adapter.onPointerMove((event) => handlePointerMove(inspection, event)),
      adapter.onClick((event) => handleClick(inspection, event)),
      adapter.onKeydown((event) => handleKeydown(inspection, event)),
      adapter.onPagehide(() => {
        void cancelInspection(inspection, 'navigation', 'Page navigation ended inspection.')
      }),
    ]

    activeInspection = inspection

    return ok({
      kind: 'inspector:start',
      ...inspection.correlation,
      status: 'inspecting',
    })
  }

  async function stopInspection(
    correlation: InspectorSessionCorrelation,
  ): Promise<ExtensionResult<ContentInspectorReceipt>> {
    if (activeInspection === null) {
      return ok({
        kind: 'inspector:stop',
        ...normalizeCorrelation(correlation),
        status: 'stopped',
      })
    }

    if (!matchesInspection(activeInspection.correlation, correlation)) {
      return inspectorFailure('The stop message does not match the active inspection session.', {
        activeSessionId: activeInspection.correlation.sessionId,
        requestedSessionId: correlation.sessionId,
      })
    }

    await cancelInspection(activeInspection, 'stopped', 'Inspection stopped.')

    return ok({
      kind: 'inspector:stop',
      ...normalizeCorrelation(correlation),
      status: 'stopped',
    })
  }

  function handlePointerMove(
    inspection: ActiveInspection<TElement>,
    event: ContentInspectorPointerEvent,
  ): void {
    if (!isCurrentInspection(inspection)) {
      return
    }

    const element = adapter.elementFromPoint(event.clientX, event.clientY)
    inspection.hoveredElement = element

    if (element === null) {
      adapter.clearHighlight()
      return
    }

    adapter.highlight(adapter.describeElement(element).rect)
  }

  function handleClick(
    inspection: ActiveInspection<TElement>,
    event: ContentInspectorPointerEvent,
  ): void {
    if (!isCurrentInspection(inspection)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const element = adapter.elementFromPoint(event.clientX, event.clientY)
      ?? inspection.hoveredElement

    if (element === null) {
      void cancelInspection(inspection, 'user', 'Inspection cancelled.')
      return
    }

    const target = adapter.describeElement(element)
    const correlation = inspection.correlation
    cleanupInspection(inspection)

    void sendMessage(
      createExtensionMessage({
        kind: 'inspector:selected',
        payload: {
          ...correlation,
          target,
        },
      }),
    ).catch(() => undefined)
  }

  function handleKeydown(
    inspection: ActiveInspection<TElement>,
    event: ContentInspectorKeyboardEvent,
  ): void {
    if (!isCurrentInspection(inspection) || event.key !== 'Escape') {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    void cancelInspection(inspection, 'user', 'Inspection cancelled.')
  }

  async function cancelInspection(
    inspection: ActiveInspection<TElement>,
    reason: InspectorCancellationReason,
    message: string,
  ): Promise<void> {
    if (!isCurrentInspection(inspection)) {
      return
    }

    const correlation = inspection.correlation
    cleanupInspection(inspection)

    await sendMessage(
      createExtensionMessage({
        kind: 'inspector:cancelled',
        payload: {
          ...correlation,
          reason,
          message,
        },
      }),
    ).catch(() => undefined)
  }

  function cleanupInspection(inspection: ActiveInspection<TElement>): void {
    if (inspection.cleaned) {
      return
    }

    inspection.cleaned = true
    for (const disposeListener of inspection.disposers) {
      disposeListener()
    }
    inspection.disposers = []
    inspection.hoveredElement = null
    adapter.clearHighlight()

    if (activeInspection === inspection) {
      activeInspection = null
    }
  }

  function isCurrentInspection(inspection: ActiveInspection<TElement>): boolean {
    return activeInspection === inspection && !inspection.cleaned
  }

  function dispose(): void {
    if (activeInspection !== null) {
      cleanupInspection(activeInspection)
    }
  }

  return {
    handleMessage,
    dispose,
  }
}

export function createDomInspectorAdapter(
  doc: Document = document,
  win: Window = window,
): ContentInspectorAdapter<Element> {
  let overlay: HTMLElement | null = null

  return {
    onPointerMove(listener) {
      const wrapped = (event: PointerEvent) => {
        listener(event)
      }
      doc.addEventListener('pointermove', wrapped, {
        capture: true,
        passive: true,
      })
      return () => {
        doc.removeEventListener('pointermove', wrapped, { capture: true })
      }
    },
    onClick(listener) {
      const wrapped = (event: MouseEvent) => {
        listener(event)
      }
      doc.addEventListener('click', wrapped, { capture: true })
      return () => {
        doc.removeEventListener('click', wrapped, { capture: true })
      }
    },
    onKeydown(listener) {
      const wrapped = (event: KeyboardEvent) => {
        listener(event)
      }
      doc.addEventListener('keydown', wrapped, { capture: true })
      return () => {
        doc.removeEventListener('keydown', wrapped, { capture: true })
      }
    },
    onPagehide(listener) {
      win.addEventListener('pagehide', listener)
      return () => {
        win.removeEventListener('pagehide', listener)
      }
    },
    elementFromPoint(clientX, clientY) {
      return doc.elementFromPoint(clientX, clientY)
    },
    describeElement(element) {
      return describeDomInspectorElement(element, win)
    },
    highlight(rect) {
      const targetOverlay = overlay ?? createOverlay(doc)
      overlay = targetOverlay
      Object.assign(targetOverlay.style, {
        display: 'block',
        transform: `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`,
        width: `${Math.max(0, Math.round(rect.width))}px`,
        height: `${Math.max(0, Math.round(rect.height))}px`,
      })
    },
    clearHighlight() {
      overlay?.remove()
      overlay = null
    },
  }
}

export function describeDomInspectorElement(
  element: Element,
  win: Window = window,
): InspectorTargetMetadata {
  const rect = element.getBoundingClientRect()
  const classes = Array.from(element.classList).slice(0, 8)
  const text = textForElement(element, win)

  return {
    tagName: element.tagName.toLowerCase(),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    ...(win.location?.href === undefined ? {} : { frameUrl: win.location.href }),
    ...optionalString('id', element.id),
    ...(classes.length === 0 ? {} : { classes }),
    ...optionalString('role', element.getAttribute('role')),
    ...optionalString('ariaLabel', element.getAttribute('aria-label')),
    ...optionalString('labelText', labelTextForElement(element)),
    ...optionalString('testId', element.getAttribute('data-testid') ?? element.getAttribute('data-test-id')),
    ...optionalString('inputType', inputTypeForElement(element, win)),
    ...optionalString('href', hrefForElement(element, win)),
    ...optionalString('text', text),
  }
}

function createOverlay(doc: Document): HTMLElement {
  const overlay = doc.createElement('div')
  overlay.setAttribute('data-actorble-inspector-overlay', 'true')
  Object.assign(overlay.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    boxSizing: 'border-box',
    border: '2px solid #126c5a',
    background: 'rgba(18, 108, 90, 0.14)',
    boxShadow: '0 0 0 99999px rgba(18, 108, 90, 0.08)',
    pointerEvents: 'none',
    zIndex: '2147483647',
    display: 'none',
  })
  ;(doc.body ?? doc.documentElement).append(overlay)
  return overlay
}

function textForElement(element: Element, _win: Window): string | undefined {
  if (
    isInputElement(element) ||
    isTextAreaElement(element) ||
    isSelectElement(element)
  ) {
    return undefined
  }

  return compactText(element.textContent ?? '', 120)
}

function labelTextForElement(element: Element): string | undefined {
  const labelled = element as Element & Readonly<{ labels?: NodeListOf<HTMLLabelElement> | null }>
  const labels = labelled.labels
  if (labels === undefined || labels === null || labels.length === 0) {
    return undefined
  }

  return compactText(
    Array.from(labels)
      .map((label) => label.textContent ?? '')
      .join(' '),
    120,
  )
}

function inputTypeForElement(element: Element, _win: Window): string | undefined {
  if (isInputElement(element)) {
    return element.type
  }

  return undefined
}

function hrefForElement(element: Element, _win: Window): string | undefined {
  if (isAnchorElement(element)) {
    return element.href
  }

  return undefined
}

function isInputElement(element: Element): element is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement
}

function isTextAreaElement(element: Element): element is HTMLTextAreaElement {
  return typeof HTMLTextAreaElement !== 'undefined' && element instanceof HTMLTextAreaElement
}

function isSelectElement(element: Element): element is HTMLSelectElement {
  return typeof HTMLSelectElement !== 'undefined' && element instanceof HTMLSelectElement
}

function isAnchorElement(element: Element): element is HTMLAnchorElement {
  return typeof HTMLAnchorElement !== 'undefined' && element instanceof HTMLAnchorElement
}

function optionalString<TKey extends string>(
  key: TKey,
  value: string | null | undefined,
): Readonly<Record<TKey, string>> | Readonly<Record<string, never>> {
  if (value === null || value === undefined || value.length === 0) {
    return {}
  }

  return { [key]: value } as Readonly<Record<TKey, string>>
}

function compactText(value: string, limit: number): string | undefined {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length === 0) {
    return undefined
  }

  if (compact.length <= limit) {
    return compact
  }

  return compact.slice(0, limit - 1).trimEnd()
}

function matchesInspection(
  active: InspectorSessionCorrelation,
  requested: InspectorSessionCorrelation,
): boolean {
  return (
    active.tabId === requested.tabId &&
    active.frameId === requested.frameId &&
    active.sessionId === requested.sessionId
  )
}

function normalizeCorrelation(
  correlation: InspectorSessionCorrelation,
): InspectorSessionCorrelation {
  return {
    tabId: correlation.tabId,
    ...(correlation.frameId === undefined ? {} : { frameId: correlation.frameId }),
    sessionId: correlation.sessionId,
    ...(correlation.scenarioId === undefined ? {} : { scenarioId: correlation.scenarioId }),
    ...(correlation.runId === undefined ? {} : { runId: correlation.runId }),
  }
}

function inspectorFailure(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ExtensionResult<never> {
  return failure({
    code: 'inspector_error',
    message,
    ...(details === undefined ? {} : { details }),
  })
}

function readMessageKind(message: unknown): ExtensionMessageKind | unknown {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined
  }

  return (message as Readonly<{ kind?: unknown }>).kind
}
