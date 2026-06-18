import { failure, ok, type ExtensionResult } from '../shared/result.js'
import type { RequiredTabCorrelation } from '../messaging/index.js'

export type RecorderSensitiveInputPolicy = 'mask' | 'omit' | 'plain'

export type RecorderSensitiveInputReason = 'password_type' | 'secret_like_field'

export type RecorderTextEventSource = 'input' | 'change'

export const RECORDER_MASKED_VALUE = '[masked]'

export type RecorderTargetRect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type RecorderTargetSnapshot = Readonly<{
  tagName: string
  rect: RecorderTargetRect
  frameUrl?: string
  id?: string
  classes?: readonly string[]
  role?: string
  ariaLabel?: string
  labelText?: string
  testId?: string
  inputType?: string
  name?: string
  placeholder?: string
  href?: string
  text?: string
}>

export type RawRecordedClickEvent = Readonly<{
  kind: 'click'
  target: RecorderTargetSnapshot
  timestamp: number
  clientX: number
  clientY: number
  pageX?: number
  pageY?: number
  button: number
}>

export type RawRecordedTextEvent = Readonly<{
  kind: 'text'
  target: RecorderTargetSnapshot
  source: RecorderTextEventSource
  value: string
  sensitive: boolean
  sensitiveReason?: RecorderSensitiveInputReason
  timestamp: number
}>

export type RawRecordedEvent = RawRecordedClickEvent | RawRecordedTextEvent

export type RecorderSession = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    startedAt: number
    sensitiveInputPolicy: RecorderSensitiveInputPolicy
  }>

export type RecorderCaptureStartReceipt = RecorderSession &
  Readonly<{
    status: 'recording'
  }>

export type RecorderClickEvent<TElement = unknown> = Readonly<{
  clientX: number
  clientY: number
  pageX?: number
  pageY?: number
  button?: number
  target: TElement | null
}>

export type RecorderTextEvent<TElement = unknown> = Readonly<{
  target: TElement | null
}>

export type RecorderEventCaptureAdapter<TElement = unknown> = Readonly<{
  onClick(listener: (event: RecorderClickEvent<TElement>) => void): () => void
  onInput(listener: (event: RecorderTextEvent<TElement>) => void): () => void
  onChange(listener: (event: RecorderTextEvent<TElement>) => void): () => void
  onPagehide(listener: () => void): () => void
  describeElement(element: TElement): RecorderTargetSnapshot
  readElementValue(element: TElement): string
  sensitiveInputReason(element: TElement): RecorderSensitiveInputReason | null
}>

export interface RecorderEventCapturePort {
  start(session: RecorderSession): ExtensionResult<RecorderCaptureStartReceipt>
  stop(sessionId: string): ExtensionResult<readonly RawRecordedEvent[]>
  dispose(): void
}

export type RecorderEventCaptureOptions = Readonly<{
  now?: () => number
}>

type ActiveRecorderSession<TElement> = {
  session: RecorderSession
  events: RawRecordedEvent[]
  disposers: (() => void)[]
  cleaned: boolean
}

export function createRecorderEventCapturePort<TElement = unknown>(
  adapter: RecorderEventCaptureAdapter<TElement>,
  options: RecorderEventCaptureOptions = {},
): RecorderEventCapturePort {
  const getNow = options.now ?? Date.now
  let activeSession: ActiveRecorderSession<TElement> | null = null

  function start(
    session: RecorderSession,
  ): ExtensionResult<RecorderCaptureStartReceipt> {
    if (activeSession !== null) {
      return failure({
        code: 'recorder_error',
        message: 'A recorder session is already active.',
        details: {
          activeSessionId: activeSession.session.sessionId,
          requestedSessionId: session.sessionId,
        },
      })
    }

    const active: ActiveRecorderSession<TElement> = {
      session,
      events: [],
      disposers: [],
      cleaned: false,
    }

    active.disposers = [
      adapter.onClick((event) => captureClick(active, event)),
      adapter.onInput((event) => captureText(active, 'input', event)),
      adapter.onChange((event) => captureText(active, 'change', event)),
      adapter.onPagehide(() => cleanup(active)),
    ]
    activeSession = active

    return ok({
      ...session,
      status: 'recording',
    })
  }

  function stop(sessionId: string): ExtensionResult<readonly RawRecordedEvent[]> {
    if (activeSession === null) {
      return ok([])
    }

    if (activeSession.session.sessionId !== sessionId) {
      return failure({
        code: 'recorder_error',
        message: 'The stop message does not match the active recorder session.',
        details: {
          activeSessionId: activeSession.session.sessionId,
          requestedSessionId: sessionId,
        },
      })
    }

    const events = activeSession.events
    cleanup(activeSession)
    return ok(events)
  }

  function dispose(): void {
    if (activeSession !== null) {
      cleanup(activeSession)
    }
  }

  function captureClick(
    active: ActiveRecorderSession<TElement>,
    event: RecorderClickEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return
    }

    active.events.push({
      kind: 'click',
      target: adapter.describeElement(event.target),
      timestamp: getNow(),
      clientX: event.clientX,
      clientY: event.clientY,
      ...(event.pageX === undefined ? {} : { pageX: event.pageX }),
      ...(event.pageY === undefined ? {} : { pageY: event.pageY }),
      button: event.button ?? 0,
    })
  }

  function captureText(
    active: ActiveRecorderSession<TElement>,
    source: RecorderTextEventSource,
    event: RecorderTextEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return
    }

    const sensitiveReason = adapter.sensitiveInputReason(event.target)
    const sensitive = sensitiveReason !== null
    active.events.push({
      kind: 'text',
      target: adapter.describeElement(event.target),
      source,
      value: recordedValue(
        adapter.readElementValue(event.target),
        sensitive,
        active.session.sensitiveInputPolicy,
      ),
      sensitive,
      ...(sensitiveReason === null ? {} : { sensitiveReason }),
      timestamp: getNow(),
    })
  }

  function cleanup(active: ActiveRecorderSession<TElement>): void {
    if (active.cleaned) {
      return
    }

    active.cleaned = true
    for (const disposeListener of active.disposers) {
      disposeListener()
    }

    if (activeSession === active) {
      activeSession = null
    }
  }

  function isCurrent(active: ActiveRecorderSession<TElement>): boolean {
    return activeSession === active && !active.cleaned
  }

  return {
    start,
    stop,
    dispose,
  }
}

export type SensitiveInputMetadata = Readonly<{
  inputType?: string
  id?: string
  name?: string
  ariaLabel?: string
  labelText?: string
  placeholder?: string
  autocomplete?: string
}>

export function detectSensitiveInputReason(
  metadata: SensitiveInputMetadata,
): RecorderSensitiveInputReason | null {
  if (metadata.inputType?.toLowerCase() === 'password') {
    return 'password_type'
  }

  const haystack = [
    metadata.id,
    metadata.name,
    metadata.ariaLabel,
    metadata.labelText,
    metadata.placeholder,
    metadata.autocomplete,
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(' ')

  if (secretLikePattern.test(haystack)) {
    return 'secret_like_field'
  }

  return null
}

function recordedValue(
  value: string,
  sensitive: boolean,
  policy: RecorderSensitiveInputPolicy,
): string {
  if (!sensitive || policy === 'plain') {
    return value
  }

  return policy === 'omit' ? '' : RECORDER_MASKED_VALUE
}

const secretLikePattern =
  /(^|[^a-z0-9])(pass(word|code|phrase)?|passwd|secret|token|api[-_\s]?key|credential|private[-_\s]?key|otp|one[-_\s]?time)([^a-z0-9]|$)/i
