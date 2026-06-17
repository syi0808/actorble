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
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Readonly<{ kind?: unknown; payload?: unknown }>

  return (
    isExtensionMessageKind(candidate.kind) &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  )
}
