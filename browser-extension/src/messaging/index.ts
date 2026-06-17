import type { BrowserRuntimeCompilation } from '../scenario/compile-to-browser-runtime.js'
import type { ScenarioDocument } from '../scenario/types.js'
import type { TraceDisplayEvent, RuntimeRunStatus } from '../trace/index.js'

export const extensionMessageKinds = [
  'scenario:validate',
  'scenario:compile',
  'scenario:run',
  'scenario:pause',
  'scenario:resume',
  'scenario:stop',
  'record:start',
  'record:stop',
  'inspector:start',
  'inspector:stop',
  'trace:event',
  'runtime:status',
] as const

export type ExtensionMessageKind = (typeof extensionMessageKinds)[number]

export type CorrelationMetadata = Readonly<{
  tabId?: number
  frameId?: number
  scenarioId?: string
  runId?: string
}>

export type RequiredTabCorrelation = Readonly<{
  tabId: number
  frameId?: number
}>

export type RequiredRunCorrelation = RequiredTabCorrelation &
  Readonly<{
    scenarioId: string
    runId: string
  }>

export type ExtensionMessage<
  TKind extends ExtensionMessageKind,
  TPayload extends Readonly<Record<string, unknown>>,
> = Readonly<{
  kind: TKind
  payload: TPayload
}>

export type ScenarioValidateMessage = ExtensionMessage<
  'scenario:validate',
  Readonly<{ document: unknown }>
>

export type ScenarioCompileMessage = ExtensionMessage<
  'scenario:compile',
  Readonly<{ document: ScenarioDocument }>
>

export type ScenarioRunMessage = ExtensionMessage<
  'scenario:run',
  RequiredRunCorrelation &
    Readonly<{
      compilation: BrowserRuntimeCompilation
    }>
>

export type ScenarioControlMessage = ExtensionMessage<
  'scenario:pause' | 'scenario:resume' | 'scenario:stop',
  RequiredRunCorrelation
>

export type RecordStartMessage = ExtensionMessage<
  'record:start',
  RequiredTabCorrelation &
    Readonly<{
      scenarioId?: string
      runId?: string
    }>
>

export type RecordStopMessage = ExtensionMessage<
  'record:stop',
  RequiredTabCorrelation &
    Readonly<{
      scenarioId?: string
      runId?: string
    }>
>

export type InspectorStartMessage = ExtensionMessage<
  'inspector:start',
  RequiredTabCorrelation &
    Readonly<{
      scenarioId?: string
      runId?: string
    }>
>

export type InspectorStopMessage = ExtensionMessage<
  'inspector:stop',
  RequiredTabCorrelation &
    Readonly<{
      scenarioId?: string
      runId?: string
    }>
>

export type TraceEventMessage = ExtensionMessage<
  'trace:event',
  RequiredRunCorrelation &
    Readonly<{
      event: TraceDisplayEvent
    }>
>

export type RuntimeStatusMessage = ExtensionMessage<
  'runtime:status',
  RequiredRunCorrelation &
    Readonly<{
      status: RuntimeRunStatus
      message?: string
    }>
>

export type ActorbleExtensionMessage =
  | ScenarioValidateMessage
  | ScenarioCompileMessage
  | ScenarioRunMessage
  | ScenarioControlMessage
  | RecordStartMessage
  | RecordStopMessage
  | InspectorStartMessage
  | InspectorStopMessage
  | TraceEventMessage
  | RuntimeStatusMessage

export type ActorbleExtensionMessageByKind<TKind extends ExtensionMessageKind> =
  Extract<ActorbleExtensionMessage, Readonly<{ kind: TKind }>>

export function createExtensionMessage<TMessage extends ActorbleExtensionMessage>(
  message: TMessage,
): TMessage {
  return message
}

export function isExtensionMessageKind(value: unknown): value is ExtensionMessageKind {
  return (
    typeof value === 'string' &&
    extensionMessageKinds.includes(value as ExtensionMessageKind)
  )
}

export function isActorbleExtensionMessage(value: unknown): value is ActorbleExtensionMessage {
  if (!isRecord(value)) {
    return false
  }

  const candidate = value as Readonly<{ kind?: unknown; payload?: unknown }>

  return (
    isExtensionMessageKind(candidate.kind) &&
    isPayloadForKind(candidate.kind, candidate.payload)
  )
}

export function isExtensionMessageOfKind<TKind extends ExtensionMessageKind>(
  value: unknown,
  kind: TKind,
): value is ActorbleExtensionMessageByKind<TKind> {
  return isActorbleExtensionMessage(value) && value.kind === kind
}

type UnknownRecord = Readonly<Record<string, unknown>>

const runtimeRunStatuses = [
  'idle',
  'running',
  'paused',
  'stopped',
  'completed',
  'failed',
] as const satisfies readonly RuntimeRunStatus[]

const traceEventLevels = [
  'debug',
  'info',
  'warning',
  'error',
] as const satisfies readonly NonNullable<TraceDisplayEvent['level']>[]

function isPayloadForKind(
  kind: ExtensionMessageKind,
  payload: unknown,
): payload is ActorbleExtensionMessage['payload'] {
  if (!isRecord(payload)) {
    return false
  }

  switch (kind) {
    case 'scenario:validate':
      return hasOwn(payload, 'document')
    case 'scenario:compile':
      return isRecord(payload.document)
    case 'scenario:run':
      return hasRequiredRunCorrelation(payload) && isCompilation(payload.compilation)
    case 'scenario:pause':
    case 'scenario:resume':
    case 'scenario:stop':
      return hasRequiredRunCorrelation(payload)
    case 'record:start':
    case 'record:stop':
    case 'inspector:start':
    case 'inspector:stop':
      return hasRequiredTabCorrelation(payload) && hasOptionalSessionCorrelation(payload)
    case 'trace:event':
      return hasRequiredRunCorrelation(payload) && isTraceDisplayEvent(payload.event)
    case 'runtime:status':
      return (
        hasRequiredRunCorrelation(payload) &&
        isRuntimeRunStatus(payload.status) &&
        isOptionalString(payload.message)
      )
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function hasRequiredTabCorrelation(
  payload: UnknownRecord,
): payload is UnknownRecord & RequiredTabCorrelation {
  return isFiniteNumber(payload.tabId) && isOptionalFiniteNumber(payload.frameId)
}

function hasRequiredRunCorrelation(
  payload: UnknownRecord,
): payload is UnknownRecord & RequiredRunCorrelation {
  return (
    hasRequiredTabCorrelation(payload) &&
    typeof payload.scenarioId === 'string' &&
    typeof payload.runId === 'string'
  )
}

function hasOptionalSessionCorrelation(payload: UnknownRecord): boolean {
  return isOptionalString(payload.scenarioId) && isOptionalString(payload.runId)
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isCompilation(value: unknown): value is BrowserRuntimeCompilation {
  return isRecord(value) && isRecord(value.scenario)
}

function isRuntimeRunStatus(value: unknown): value is RuntimeRunStatus {
  return (
    typeof value === 'string' &&
    runtimeRunStatuses.includes(value as RuntimeRunStatus)
  )
}

function isTraceDisplayEvent(value: unknown): value is TraceDisplayEvent {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.runId === 'string' &&
    isOptionalString(value.scenarioId) &&
    isOptionalString(value.stepId) &&
    isFiniteNumber(value.timestamp) &&
    typeof value.name === 'string' &&
    isOptionalTraceEventLevel(value.level) &&
    isOptionalString(value.message) &&
    (value.details === undefined || isRecord(value.details))
  )
}

function isOptionalTraceEventLevel(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      traceEventLevels.includes(value as NonNullable<TraceDisplayEvent['level']>))
  )
}
