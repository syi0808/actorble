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
  'inspector:selected',
  'inspector:cancelled',
  'trace:event',
  'runtime:status',
  'popup:get-state',
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

export type InspectorSessionCorrelation = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    scenarioId?: string
    runId?: string
  }>

export type InspectorTargetRect = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

export type InspectorTargetMetadata = Readonly<{
  tagName: string
  rect: InspectorTargetRect
  frameUrl?: string
  id?: string
  classes?: readonly string[]
  role?: string
  ariaLabel?: string
  labelText?: string
  testId?: string
  inputType?: string
  href?: string
  text?: string
}>

export type InspectorCancellationReason =
  | 'user'
  | 'stopped'
  | 'navigation'
  | 'content_lost'

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
  InspectorSessionCorrelation
>

export type InspectorStopMessage = ExtensionMessage<
  'inspector:stop',
  InspectorSessionCorrelation
>

export type InspectorSelectedMessage = ExtensionMessage<
  'inspector:selected',
  InspectorSessionCorrelation &
    Readonly<{
      target: InspectorTargetMetadata
    }>
>

export type InspectorCancelledMessage = ExtensionMessage<
  'inspector:cancelled',
  InspectorSessionCorrelation &
    Readonly<{
      reason: InspectorCancellationReason
      message?: string
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

export type PopupGetStateMessage = ExtensionMessage<
  'popup:get-state',
  Readonly<{
    frameId?: number
    scenarioId?: string
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
  | InspectorSelectedMessage
  | InspectorCancelledMessage
  | TraceEventMessage
  | RuntimeStatusMessage
  | PopupGetStateMessage

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

const inspectorCancellationReasons = [
  'user',
  'stopped',
  'navigation',
  'content_lost',
] as const satisfies readonly InspectorCancellationReason[]

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
      return hasRequiredTabCorrelation(payload) && hasOptionalSessionCorrelation(payload)
    case 'inspector:start':
    case 'inspector:stop':
      return hasInspectorSessionCorrelation(payload)
    case 'inspector:selected':
      return hasInspectorSessionCorrelation(payload) && isInspectorTargetMetadata(payload.target)
    case 'inspector:cancelled':
      return (
        hasInspectorSessionCorrelation(payload) &&
        isInspectorCancellationReason(payload.reason) &&
        isOptionalString(payload.message)
      )
    case 'trace:event':
      return hasRequiredRunCorrelation(payload) && isTraceDisplayEvent(payload.event)
    case 'runtime:status':
      return (
        hasRequiredRunCorrelation(payload) &&
        isRuntimeRunStatus(payload.status) &&
        isOptionalString(payload.message)
      )
    case 'popup:get-state':
      return isOptionalFiniteNumber(payload.frameId) && isOptionalString(payload.scenarioId)
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

function hasInspectorSessionCorrelation(
  payload: UnknownRecord,
): payload is UnknownRecord & InspectorSessionCorrelation {
  return (
    hasRequiredTabCorrelation(payload) &&
    typeof payload.sessionId === 'string' &&
    payload.sessionId.length > 0 &&
    hasOptionalSessionCorrelation(payload)
  )
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

function isInspectorCancellationReason(
  value: unknown,
): value is InspectorCancellationReason {
  return (
    typeof value === 'string' &&
    inspectorCancellationReasons.includes(value as InspectorCancellationReason)
  )
}

function isInspectorTargetMetadata(value: unknown): value is InspectorTargetMetadata {
  if (!isRecord(value) || !isRecord(value.rect)) {
    return false
  }

  return (
    typeof value.tagName === 'string' &&
    isFiniteNumber(value.rect.x) &&
    isFiniteNumber(value.rect.y) &&
    isFiniteNumber(value.rect.width) &&
    isFiniteNumber(value.rect.height) &&
    isOptionalString(value.frameUrl) &&
    isOptionalString(value.id) &&
    isOptionalStringArray(value.classes) &&
    isOptionalString(value.role) &&
    isOptionalString(value.ariaLabel) &&
    isOptionalString(value.labelText) &&
    isOptionalString(value.testId) &&
    isOptionalString(value.inputType) &&
    isOptionalString(value.href) &&
    isOptionalString(value.text)
  )
}

function isOptionalStringArray(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.every((item) => typeof item === 'string'))
  )
}

function isOptionalTraceEventLevel(value: unknown): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      traceEventLevels.includes(value as NonNullable<TraceDisplayEvent['level']>))
  )
}
