import type { BrowserRuntimeCompilation } from '../scenario/compile-to-browser-runtime.js'
import type { ScenarioDocument, ScenarioLocator } from '../scenario/types.js'
import type { RawRecordedEvent } from '../recorder/event-capture.js'
import type {
  RuntimeDebugSnapshot,
  TraceDisplayEvent,
  RuntimeRunStatus,
} from '../trace/index.js'

export const extensionMessageKinds = [
  'scenario:validate',
  'scenario:compile',
  'scenario:run',
  'scenario:pause',
  'scenario:resume',
  'scenario:stop',
  'record:start',
  'record:event',
  'record:stop',
  'record:draft:get',
  'inspector:start',
  'inspector:stop',
  'inspector:selected',
  'inspector:cancelled',
  'locator:preview',
  'trace:event',
  'runtime:status',
  'content:ready',
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

export type ContentReadyCapabilities = Readonly<{
  runtime: boolean
  recorder: boolean
  inspector: boolean
  locatorPreview: boolean
  frameCorrelation: boolean
}>

export type InspectorSessionCorrelation = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    scenarioId?: string
    runId?: string
    targetSlot?: InspectorTargetSlotCorrelation
  }>

export type InspectorTargetSlotKind =
  | 'step-target'
  | 'drag-from'
  | 'drag-to'
  | 'waitFor-target'
  | 'scrollTo-target'

export type InspectorTargetSlotCorrelation = Readonly<{
  kind: InspectorTargetSlotKind
  stepId: string
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

export type RecordEventFlushReason = 'incremental' | 'pagehide' | 'stop'

export type RecordEventMessage = ExtensionMessage<
  'record:event',
  RequiredTabCorrelation &
    Readonly<{
      sessionId: string
      scenarioId?: string
      runId?: string
      reason: RecordEventFlushReason
      events: readonly RawRecordedEvent[]
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

export type RecordDraftGetMessage = ExtensionMessage<
  'record:draft:get',
  Readonly<{
    draftId?: string
    tabId?: number
    frameId?: number
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

export type LocatorPreviewCandidateMessage = Readonly<{
  id: string
  rank: number
  strategy: ScenarioLocator['strategy']
  label: string
  locator: ScenarioLocator
}>

export type LocatorPreviewMessage = ExtensionMessage<
  'locator:preview',
  RequiredTabCorrelation &
    Readonly<{
      scenarioId?: string
      targetSlot?: InspectorTargetSlotCorrelation
      candidates: readonly LocatorPreviewCandidateMessage[]
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
      debugSnapshot?: RuntimeDebugSnapshot
    }>
>

export type ContentReadyMessage = ExtensionMessage<
  'content:ready',
  Readonly<{
    tabId?: number
    frameId?: number
    url?: string
    topFrame?: boolean
    capabilities?: ContentReadyCapabilities
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
  | RecordEventMessage
  | RecordStopMessage
  | RecordDraftGetMessage
  | InspectorStartMessage
  | InspectorStopMessage
  | InspectorSelectedMessage
  | InspectorCancelledMessage
  | LocatorPreviewMessage
  | TraceEventMessage
  | RuntimeStatusMessage
  | ContentReadyMessage
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

const runtimeTraceSpanStatuses = [
  'running',
  'ok',
  'error',
  'cancelled',
] as const

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
    case 'record:event':
      return (
        hasRequiredTabCorrelation(payload) &&
        typeof payload.sessionId === 'string' &&
        payload.sessionId.length > 0 &&
        hasOptionalSessionCorrelation(payload) &&
        isRecordEventFlushReason(payload.reason) &&
        Array.isArray(payload.events) &&
        payload.events.length > 0 &&
        payload.events.every(isRawRecordedEvent)
      )
    case 'record:draft:get':
      return (
        isOptionalString(payload.draftId) &&
        isOptionalFiniteNumber(payload.tabId) &&
        isOptionalFiniteNumber(payload.frameId) &&
        hasOptionalSessionCorrelation(payload)
      )
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
    case 'locator:preview':
      return (
        hasRequiredTabCorrelation(payload) &&
        isOptionalString(payload.scenarioId) &&
        isOptionalInspectorTargetSlotCorrelation(payload.targetSlot) &&
        Array.isArray(payload.candidates) &&
        payload.candidates.length > 0 &&
        payload.candidates.every(isLocatorPreviewCandidate)
      )
    case 'trace:event':
      return hasRequiredRunCorrelation(payload) && isTraceDisplayEvent(payload.event)
    case 'runtime:status':
      return (
        hasRequiredRunCorrelation(payload) &&
        isRuntimeRunStatus(payload.status) &&
        isOptionalString(payload.message) &&
        isOptionalRuntimeDebugSnapshot(payload.debugSnapshot)
      )
    case 'content:ready':
      return (
        isOptionalFiniteNumber(payload.tabId) &&
        isOptionalFiniteNumber(payload.frameId) &&
        isOptionalString(payload.url) &&
        isOptionalBoolean(payload.topFrame) &&
        isOptionalContentReadyCapabilities(payload.capabilities)
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
    hasOptionalSessionCorrelation(payload) &&
    isOptionalInspectorTargetSlotCorrelation(payload.targetSlot)
  )
}

export function isInspectorTargetSlotCorrelation(
  value: unknown,
): value is InspectorTargetSlotCorrelation {
  return (
    isRecord(value) &&
    isInspectorTargetSlotKind(value.kind) &&
    typeof value.stepId === 'string' &&
    value.stepId.length > 0
  )
}

function isOptionalInspectorTargetSlotCorrelation(
  value: unknown,
): value is InspectorTargetSlotCorrelation | undefined {
  return value === undefined || isInspectorTargetSlotCorrelation(value)
}

function isInspectorTargetSlotKind(value: unknown): value is InspectorTargetSlotKind {
  return (
    typeof value === 'string' &&
    (
      value === 'step-target' ||
      value === 'drag-from' ||
      value === 'drag-to' ||
      value === 'waitFor-target' ||
      value === 'scrollTo-target'
    )
  )
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalRecord(value: unknown): boolean {
  return value === undefined || isRecord(value)
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

function isOptionalContentReadyCapabilities(
  value: unknown,
): value is ContentReadyCapabilities | undefined {
  if (value === undefined) {
    return true
  }

  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.runtime === 'boolean' &&
    typeof value.recorder === 'boolean' &&
    typeof value.inspector === 'boolean' &&
    typeof value.locatorPreview === 'boolean' &&
    typeof value.frameCorrelation === 'boolean'
  )
}

function isRuntimeRunStatus(value: unknown): value is RuntimeRunStatus {
  return (
    typeof value === 'string' &&
    runtimeRunStatuses.includes(value as RuntimeRunStatus)
  )
}

function isRecordEventFlushReason(value: unknown): value is RecordEventFlushReason {
  return value === 'incremental' || value === 'pagehide' || value === 'stop'
}

function isRawRecordedEvent(value: unknown): value is RawRecordedEvent {
  if (!isRecord(value) || !isRecorderTargetSnapshot(value.target) || !isFiniteNumber(value.timestamp)) {
    return false
  }

  if (value.kind === 'click') {
    return (
      isFiniteNumber(value.clientX) &&
      isFiniteNumber(value.clientY) &&
      isOptionalFiniteNumber(value.pageX) &&
      isOptionalFiniteNumber(value.pageY) &&
      isFiniteNumber(value.button)
    )
  }

  if (value.kind === 'text') {
    return (
      (value.source === 'input' || value.source === 'change') &&
      typeof value.value === 'string' &&
      typeof value.sensitive === 'boolean' &&
      (
        value.sensitiveReason === undefined ||
        value.sensitiveReason === 'password_type' ||
        value.sensitiveReason === 'secret_like_field'
      )
    )
  }

  return false
}

function isRecorderTargetSnapshot(value: unknown): boolean {
  if (!isRecord(value) || typeof value.tagName !== 'string' || !isRecorderTargetRect(value.rect)) {
    return false
  }

  return (
    isOptionalString(value.frameUrl) &&
    isOptionalString(value.id) &&
    (
      value.classes === undefined ||
      (Array.isArray(value.classes) && value.classes.every((className) => typeof className === 'string'))
    ) &&
    isOptionalString(value.role) &&
    isOptionalString(value.ariaLabel) &&
    isOptionalString(value.labelText) &&
    isOptionalString(value.testId) &&
    isOptionalString(value.inputType) &&
    isOptionalString(value.name) &&
    isOptionalString(value.placeholder) &&
    isOptionalString(value.href) &&
    isOptionalString(value.text)
  )
}

function isRecorderTargetRect(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumber(value.x) &&
    isNumber(value.y) &&
    isNumber(value.width) &&
    isNumber(value.height)
  )
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number'
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

function isOptionalRuntimeDebugSnapshot(value: unknown): value is RuntimeDebugSnapshot | undefined {
  return value === undefined || isRuntimeDebugSnapshot(value)
}

function isRuntimeDebugSnapshot(value: unknown): value is RuntimeDebugSnapshot {
  if (!isRecord(value)) {
    return false
  }

  return (
    isFiniteNumber(value.capturedAt) &&
    isOptionalRecord(value.capabilities) &&
    isOptionalRecord(value.fidelity) &&
    isRuntimeTraceSnapshot(value.trace)
  )
}

function isRuntimeTraceSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.spans) &&
    value.spans.every(isRuntimeTraceSpanSnapshot) &&
    Array.isArray(value.events) &&
    value.events.every(isRuntimeTraceEventSnapshot) &&
    Array.isArray(value.snapshots) &&
    value.snapshots.every(isRuntimeTraceDataSnapshot) &&
    Array.isArray(value.warnings) &&
    value.warnings.every(isRuntimeTraceWarningSnapshot)
  )
}

function isRuntimeTraceSpanSnapshot(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isOptionalString(value.parentId) &&
    isRuntimeTraceSpanStatus(value.status) &&
    isFiniteNumber(value.startedAt) &&
    isOptionalFiniteNumber(value.endedAt) &&
    isOptionalRecord(value.attributes) &&
    isOptionalRuntimeTraceErrorSnapshot(value.error)
  )
}

function isRuntimeTraceEventSnapshot(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.name === 'string' &&
    isFiniteNumber(value.at) &&
    isOptionalString(value.spanId)
  )
}

function isRuntimeTraceDataSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    isFiniteNumber(value.at) &&
    hasOwn(value, 'data')
  )
}

function isRuntimeTraceWarningSnapshot(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.message === 'string' &&
    isFiniteNumber(value.at) &&
    isOptionalRecord(value.details)
  )
}

function isOptionalRuntimeTraceErrorSnapshot(value: unknown): boolean {
  return value === undefined || (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.message === 'string' &&
    isOptionalString(value.code) &&
    isOptionalRecord(value.details)
  )
}

function isRuntimeTraceSpanStatus(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    runtimeTraceSpanStatuses.includes(
      value as (typeof runtimeTraceSpanStatuses)[number],
    )
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

function isLocatorPreviewCandidate(value: unknown): value is LocatorPreviewCandidateMessage {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    isFiniteNumber(value.rank) &&
    typeof value.strategy === 'string' &&
    isScenarioLocatorStrategy(value.strategy) &&
    typeof value.label === 'string' &&
    value.label.length > 0 &&
    isScenarioLocator(value.locator) &&
    value.locator.strategy === value.strategy
  )
}

function isScenarioLocator(value: unknown): value is ScenarioLocator {
  if (!isRecord(value)) {
    return false
  }

  switch (value.strategy) {
    case 'css':
      return typeof value.selector === 'string' && value.selector.length > 0
    case 'role':
      return (
        typeof value.role === 'string' &&
        value.role.length > 0 &&
        isOptionalScenarioTextMatcher(value.name) &&
        isOptionalBoolean(value.includeHidden)
      )
    case 'text':
      return isScenarioTextMatcher(value.text)
    case 'label':
      return isScenarioTextMatcher(value.label)
    case 'testId':
      return (
        typeof value.value === 'string' &&
        value.value.length > 0 &&
        (value.attribute === undefined ||
          (typeof value.attribute === 'string' && value.attribute.length > 0))
      )
    case 'point':
      return isScenarioPoint(value.point)
    default:
      return false
  }
}

function isScenarioLocatorStrategy(value: string): value is ScenarioLocator['strategy'] {
  return value === 'css' ||
    value === 'role' ||
    value === 'text' ||
    value === 'label' ||
    value === 'testId' ||
    value === 'point'
}

function isOptionalScenarioTextMatcher(value: unknown): boolean {
  return value === undefined || isScenarioTextMatcher(value)
}

function isScenarioTextMatcher(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.length > 0
  }

  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.value === 'string' &&
    value.value.length > 0 &&
    (value.match === undefined ||
      value.match === 'exact' ||
      value.match === 'contains' ||
      value.match === 'regex') &&
    isOptionalBoolean(value.caseSensitive)
  )
}

function isScenarioPoint(value: unknown): boolean {
  if (!isRecord(value)) {
    return false
  }

  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    (value.coordinateSpace === undefined ||
      value.coordinateSpace === 'viewport' ||
      value.coordinateSpace === 'document' ||
      value.coordinateSpace === 'screen' ||
      value.coordinateSpace === 'surface' ||
      value.coordinateSpace === 'element')
  )
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
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
