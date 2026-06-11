import { notImplemented } from '../shared/index.js'
import type {
  ActorbleError,
  ActorbleErrorDetails,
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
  getTrace(): Trace
}

export class BrowserDiagnosticsTrace implements SpanRecorder {
  startSpan(): TraceSpanHandle {
    return notImplemented('Diagnostics / Trace startSpan')
  }

  appendEvent(): void {
    return notImplemented('Diagnostics / Trace appendEvent')
  }

  attachSnapshot(): void {
    return notImplemented('Diagnostics / Trace attachSnapshot')
  }

  warn(): void {
    return notImplemented('Diagnostics / Trace warn')
  }

  getTrace(): Trace {
    return notImplemented('Diagnostics / Trace getTrace')
  }
}

export function createDiagnosticsTrace(): SpanRecorder {
  return new BrowserDiagnosticsTrace()
}
