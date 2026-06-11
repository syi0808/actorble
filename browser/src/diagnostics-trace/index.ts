import type {
  ActorbleError,
  ActorbleErrorDetails,
  Clock,
  DebugEventName,
  TimestampMs,
} from '../shared/index.js'

export type TraceSpanStatus = 'running' | 'ok' | 'error' | 'cancelled'

export type TraceSpan = Readonly<{
  id: string
  name: string
  parentId?: string
  status: TraceSpanStatus
  startedAt: TimestampMs
  endedAt?: TimestampMs
  attributes?: ActorbleErrorDetails
  error?: ActorbleError
}>

export type TraceEvent = Readonly<{
  name: DebugEventName
  at: TimestampMs
  spanId?: string
  data?: unknown
}>

export type TraceSnapshot = Readonly<{
  name: string
  at: TimestampMs
  data: unknown
}>

export type TraceWarning = Readonly<{
  message: string
  at: TimestampMs
  details?: ActorbleErrorDetails
}>

export type Trace = Readonly<{
  spans: readonly TraceSpan[]
  events: readonly TraceEvent[]
  snapshots: readonly TraceSnapshot[]
  warnings: readonly TraceWarning[]
}>

export interface TraceSpanHandle {
  readonly id: string
  end(attributes?: ActorbleErrorDetails): void
  error(error: ActorbleError, attributes?: ActorbleErrorDetails): void
  cancel(reason?: unknown): void
  event(name: DebugEventName, data?: unknown): void
}

export interface SpanRecorder {
  startSpan(name: string, attributes?: ActorbleErrorDetails): TraceSpanHandle
  appendEvent(name: DebugEventName, data?: unknown): void
  attachSnapshot(name: string, data: unknown): void
  warn(message: string, details?: ActorbleErrorDetails): void
}

export interface TraceReader {
  getTrace(): Trace
}

export interface TraceCollector extends SpanRecorder, TraceReader {}

export type DiagnosticsTraceOptions = Readonly<{
  clock?: Clock
  idPrefix?: string
}>

type MutableTraceSpan = {
  id: string
  name: string
  parentId?: string
  status: TraceSpanStatus
  startedAt: TimestampMs
  endedAt?: TimestampMs
  attributes?: ActorbleErrorDetails
  error?: ActorbleError
}

const defaultClock: Clock = {
  now() {
    return Date.now()
  },
}

function mergeAttributes(
  current: ActorbleErrorDetails | undefined,
  next: ActorbleErrorDetails | undefined,
): ActorbleErrorDetails | undefined {
  if (current === undefined && next === undefined) {
    return undefined
  }

  return { ...current, ...next }
}

function cloneSpan(span: MutableTraceSpan): TraceSpan {
  return { ...span }
}

export class BrowserDiagnosticsTrace implements TraceCollector {
  readonly #clock: Clock
  readonly #idPrefix: string
  #nextSpanId = 1
  readonly #spans: MutableTraceSpan[] = []
  readonly #events: TraceEvent[] = []
  readonly #snapshots: TraceSnapshot[] = []
  readonly #warnings: TraceWarning[] = []
  readonly #openSpanIds: string[] = []

  constructor(options: DiagnosticsTraceOptions = {}) {
    this.#clock = options.clock ?? defaultClock
    this.#idPrefix = options.idPrefix ?? 'span'
  }

  startSpan(name: string, attributes?: ActorbleErrorDetails): TraceSpanHandle {
    const id = `${this.#idPrefix}-${this.#nextSpanId++}`
    const parentId = this.#openSpanIds.at(-1)
    const span: MutableTraceSpan = {
      id,
      name,
      ...(parentId === undefined ? {} : { parentId }),
      status: 'running',
      startedAt: this.#clock.now(),
      ...(attributes === undefined ? {} : { attributes: { ...attributes } }),
    }

    this.#spans.push(span)
    this.#openSpanIds.push(id)

    return {
      id,
      end: (terminalAttributes?: ActorbleErrorDetails) => {
        this.#finishSpan(id, 'ok', terminalAttributes)
      },
      error: (error: ActorbleError, terminalAttributes?: ActorbleErrorDetails) => {
        this.#finishSpan(id, 'error', terminalAttributes, error)
      },
      cancel: (reason?: unknown) => {
        const terminalAttributes =
          reason === undefined ? undefined : ({ reason } satisfies ActorbleErrorDetails)
        this.#finishSpan(id, 'cancelled', terminalAttributes)
      },
      event: (eventName: DebugEventName, data?: unknown) => {
        this.#appendEvent(eventName, data, id)
      },
    }
  }

  appendEvent(name: DebugEventName, data?: unknown): void {
    this.#appendEvent(name, data)
  }

  attachSnapshot(name: string, data: unknown): void {
    this.#snapshots.push({
      name,
      at: this.#clock.now(),
      data,
    })
  }

  warn(message: string, details?: ActorbleErrorDetails): void {
    this.#warnings.push({
      message,
      at: this.#clock.now(),
      ...(details === undefined ? {} : { details: { ...details } }),
    })
  }

  getTrace(): Trace {
    return {
      spans: this.#spans.map(cloneSpan),
      events: this.#events.map((event) => ({ ...event })),
      snapshots: this.#snapshots.map((snapshot) => ({ ...snapshot })),
      warnings: this.#warnings.map((warning) => ({ ...warning })),
    }
  }

  #appendEvent(name: DebugEventName, data?: unknown, spanId?: string): void {
    this.#events.push({
      name,
      at: this.#clock.now(),
      ...(spanId === undefined ? {} : { spanId }),
      ...(data === undefined ? {} : { data }),
    })
  }

  #finishSpan(
    id: string,
    status: Exclude<TraceSpanStatus, 'running'>,
    terminalAttributes?: ActorbleErrorDetails,
    error?: ActorbleError,
  ): void {
    const span = this.#spans.find((candidate) => candidate.id === id)

    if (span === undefined || span.status !== 'running') {
      return
    }

    span.status = status
    span.endedAt = this.#clock.now()
    span.attributes = mergeAttributes(span.attributes, terminalAttributes)

    if (error !== undefined) {
      span.error = error
    }

    const stackIndex = this.#openSpanIds.lastIndexOf(id)
    if (stackIndex >= 0) {
      this.#openSpanIds.splice(stackIndex, 1)
    }
  }
}

export function createDiagnosticsTrace(options: DiagnosticsTraceOptions = {}): TraceCollector {
  return new BrowserDiagnosticsTrace(options)
}
