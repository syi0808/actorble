import {
  createExtensionMessage,
  isInspectorTargetSlotCorrelation,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type InspectorSessionCorrelation,
  type InspectorTargetMetadata,
  type InspectorTargetSlotCorrelation,
  type RequiredTabCorrelation,
} from '../messaging/index.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../shared/result.js'

export type TargetPickerActiveTab = Readonly<{
  id?: number
  url?: string
}>

export type TargetPickerSession = RequiredTabCorrelation &
  Readonly<{
    sessionId: string
    scenarioId?: string
    runId?: string
    targetSlot?: InspectorTargetSlotCorrelation
    startedAt: number
  }>

export type PickedTarget = InspectorSessionCorrelation &
  Readonly<{
    target: InspectorTargetMetadata
    selectedAt: number
  }>

export type TargetPickerStatus =
  | 'idle'
  | 'starting'
  | 'inspecting'
  | 'stopping'
  | 'selected'
  | 'cancelled'
  | 'failed'

export type TargetPickerSnapshot = Readonly<{
  status: TargetPickerStatus
  session?: TargetPickerSession
  selected?: PickedTarget
  issues: readonly ExtensionIssue[]
  message?: string
}>

export type TargetPickerClient = Readonly<{
  getActiveTab(): Promise<TargetPickerActiveTab | null>
  getTab?(tabId: number): Promise<TargetPickerActiveTab | null>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

export type TargetPickerOptions = Readonly<{
  createSessionId?: () => string
  frameId?: number
  targetTabId?: number
  now?: () => number
}>

export type TargetPickerStartInput = Readonly<{
  scenarioId?: string
  targetSlot?: InspectorTargetSlotCorrelation
}>

export type TargetPickerButtonView = Readonly<{
  label: string
  disabled: boolean
  pending: boolean
}>

export type TargetPickerView = Readonly<{
  statusSummary: string
  selectedSummary: string
  issueSummary: string
  buttons: Readonly<{
    start: TargetPickerButtonView
    stop: TargetPickerButtonView
  }>
}>

export type TargetPicker = Readonly<{
  start(input?: string | TargetPickerStartInput): Promise<ExtensionResult<TargetPickerSession>>
  stop(): Promise<ExtensionResult<TargetPickerSession>>
  ingestMessage(message: unknown): boolean
  getSnapshot(): TargetPickerSnapshot
}>

const TEXT_SUMMARY_LIMIT = 80

let nextInspectionSequence = 1

export function createTargetPicker(
  client: TargetPickerClient,
  options: TargetPickerOptions = {},
): TargetPicker {
  const createSessionId = options.createSessionId ?? defaultSessionId
  const frameId = options.frameId
  const targetTabId = options.targetTabId
  const now = options.now ?? Date.now
  let snapshot = idleSnapshot()

  async function start(
    input?: string | TargetPickerStartInput,
  ): Promise<ExtensionResult<TargetPickerSession>> {
    const startInput = normalizeStartInput(input)
    if (snapshot.session !== undefined) {
      return setIssue({
        code: 'inspector_error',
        message: 'Target inspection is already active.',
      })
    }

    snapshot = {
      ...snapshot,
      status: 'starting',
      issues: [],
      message: undefined,
    }

    const target = await resolvePickerTargetTab(client, targetTabId)
    if (!target.ok) {
      snapshot = {
        ...snapshot,
        status: 'failed',
        issues: target.issues,
      }
      return target
    }

    const session = {
      tabId: target.value.id,
      ...(frameId === undefined ? {} : { frameId }),
      sessionId: createSessionId(),
      ...(startInput.scenarioId === undefined ? {} : { scenarioId: startInput.scenarioId }),
      ...(startInput.targetSlot === undefined ? {} : { targetSlot: startInput.targetSlot }),
      startedAt: now(),
    } satisfies TargetPickerSession

    const message = createExtensionMessage({
      kind: 'inspector:start',
      payload: sessionPayload(session),
    })

    const delivery = await sendPickerMessage(message)
    if (!delivery.ok) {
      snapshot = {
        ...snapshot,
        status: 'failed',
        issues: delivery.issues,
      }
      return failure(delivery.issues)
    }

    const resolvedSession = sessionFromReceipt(session, delivery.value)
    snapshot = {
      status: 'inspecting',
      session: resolvedSession,
      issues: [],
      message: undefined,
    }
    return ok(resolvedSession)
  }

  async function stop(): Promise<ExtensionResult<TargetPickerSession>> {
    const session = snapshot.session
    if (session === undefined) {
      return setIssue({
        code: 'inspector_error',
        message: 'No active target inspection is running.',
      })
    }

    snapshot = {
      ...snapshot,
      status: 'stopping',
      issues: [],
      message: undefined,
    }

    const message = createExtensionMessage({
      kind: 'inspector:stop',
      payload: sessionPayload(session),
    })
    const delivery = await sendPickerMessage(message)
    if (!delivery.ok) {
      snapshot = {
        status: 'cancelled',
        session: undefined,
        selected: snapshot.selected,
        issues: delivery.issues,
        message: 'Inspection ended because the content script was unavailable.',
      }
      return failure(delivery.issues)
    }

    const resolvedSession = sessionFromReceipt(session, delivery.value)
    snapshot = {
      status: 'cancelled',
      session: undefined,
      selected: snapshot.selected,
      issues: [],
      message: 'Inspection stopped.',
    }
    return ok(resolvedSession)
  }

  function ingestMessage(message: unknown): boolean {
    if (!isActorbleExtensionMessage(message)) {
      return false
    }

    if (message.kind === 'inspector:selected') {
      if (!matchesActiveSession(message.payload)) {
        return false
      }

      snapshot = {
        status: 'selected',
        session: undefined,
        selected: {
          tabId: message.payload.tabId,
          ...(message.payload.frameId === undefined ? {} : { frameId: message.payload.frameId }),
          sessionId: message.payload.sessionId,
          ...(message.payload.scenarioId === undefined ? {} : { scenarioId: message.payload.scenarioId }),
          ...(message.payload.runId === undefined ? {} : { runId: message.payload.runId }),
          ...(message.payload.targetSlot === undefined ? {} : { targetSlot: message.payload.targetSlot }),
          target: normalizePickedTargetMetadata(message.payload.target),
          selectedAt: now(),
        },
        issues: [],
        message: 'Target selected.',
      }
      return true
    }

    if (message.kind === 'inspector:cancelled') {
      if (!matchesActiveSession(message.payload)) {
        return false
      }

      snapshot = {
        status: 'cancelled',
        session: undefined,
        selected: snapshot.selected,
        issues: [],
        message: message.payload.message ?? cancellationSummary(message.payload.reason),
      }
      return true
    }

    return false
  }

  function getSnapshot(): TargetPickerSnapshot {
    return snapshot
  }

  async function sendPickerMessage(
    message: ActorbleExtensionMessage,
  ): Promise<ExtensionResult<unknown>> {
    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Inspector command could not be delivered: ${describeUnknownError(error)}`,
      })
    }

    const responseResult = readExtensionResult(response)
    if (responseResult !== null) {
      return responseResult.ok ? ok(responseResult.value) : failure(responseResult.issues)
    }

    return ok(response)
  }

  function matchesActiveSession(correlation: InspectorSessionCorrelation): boolean {
    const session = snapshot.session
    return (
      session !== undefined &&
      session.tabId === correlation.tabId &&
      session.frameId === correlation.frameId &&
      session.sessionId === correlation.sessionId
    )
  }

  function setIssue<TValue>(issue: ExtensionIssue): ExtensionResult<TValue> {
    snapshot = {
      ...snapshot,
      status: 'failed',
      issues: [issue],
      message: undefined,
    }
    return failure(issue)
  }

  return {
    start,
    stop,
    ingestMessage,
    getSnapshot,
  }
}

export function createTargetPickerView(
  snapshot: TargetPickerSnapshot,
): TargetPickerView {
  const isStarting = snapshot.status === 'starting'
  const isStopping = snapshot.status === 'stopping'
  const isInspecting = snapshot.status === 'inspecting'

  return {
    statusSummary: targetPickerStatusSummary(snapshot),
    selectedSummary: selectedTargetSummary(snapshot.selected?.target),
    issueSummary: issueSummary(snapshot.issues),
    buttons: {
      start: {
        label: 'Pick target',
        disabled: isStarting || isStopping || isInspecting,
        pending: isStarting,
      },
      stop: {
        label: 'Stop',
        disabled: !isInspecting || isStopping,
        pending: isStopping,
      },
    },
  }
}

export function normalizePickedTargetMetadata(
  target: InspectorTargetMetadata,
): InspectorTargetMetadata {
  return {
    tagName: target.tagName.toLowerCase(),
    rect: {
      x: target.rect.x,
      y: target.rect.y,
      width: target.rect.width,
      height: target.rect.height,
    },
    ...(target.documentOrderIndex === undefined ? {} : { documentOrderIndex: target.documentOrderIndex }),
    ...(target.frameUrl === undefined ? {} : { frameUrl: target.frameUrl }),
    ...(target.id === undefined ? {} : { id: target.id }),
    ...(target.classes === undefined ? {} : { classes: target.classes.slice(0, 8) }),
    ...(target.role === undefined ? {} : { role: target.role }),
    ...(target.ariaLabel === undefined ? {} : { ariaLabel: target.ariaLabel }),
    ...(target.labelText === undefined ? {} : { labelText: compactText(target.labelText, TEXT_SUMMARY_LIMIT) }),
    ...(target.testId === undefined ? {} : { testId: target.testId }),
    ...(target.inputType === undefined ? {} : { inputType: target.inputType }),
    ...(target.href === undefined ? {} : { href: target.href }),
    ...(target.text === undefined ? {} : { text: compactText(target.text, TEXT_SUMMARY_LIMIT) }),
  }
}

async function resolvePickerTargetTab(
  client: Pick<TargetPickerClient, 'getActiveTab' | 'getTab'>,
  targetTabId: number | undefined,
): Promise<ExtensionResult<TargetPickerActiveTab & Readonly<{ id: number }>>> {
  if (targetTabId === undefined) {
    return resolveActiveTab(client)
  }

  if (client.getTab === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} cannot be resolved from this panel.`,
      details: { tabId: targetTabId },
    })
  }

  let tab: TargetPickerActiveTab | null
  try {
    tab = await client.getTab(targetTabId)
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} lookup failed.`,
      details: {
        tabId: targetTabId,
        reason: describeUnknownError(error),
      },
    })
  }

  if (tab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} was not found.`,
      details: { tabId: targetTabId },
    })
  }

  return ok({
    ...tab,
    id: tab.id,
  })
}

async function resolveActiveTab(
  client: Pick<TargetPickerClient, 'getActiveTab'>,
): Promise<ExtensionResult<TargetPickerActiveTab & Readonly<{ id: number }>>> {
  let activeTab: TargetPickerActiveTab | null
  try {
    activeTab = await client.getActiveTab()
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: 'Active tab lookup failed.',
      details: {
        reason: describeUnknownError(error),
      },
    })
  }

  if (activeTab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: 'No active tab is available.',
    })
  }

  return ok({
    ...activeTab,
    id: activeTab.id,
  })
}

function sessionPayload(session: TargetPickerSession): InspectorSessionCorrelation {
  return {
    tabId: session.tabId,
    ...(session.frameId === undefined ? {} : { frameId: session.frameId }),
    sessionId: session.sessionId,
    ...(session.scenarioId === undefined ? {} : { scenarioId: session.scenarioId }),
    ...(session.runId === undefined ? {} : { runId: session.runId }),
    ...(session.targetSlot === undefined ? {} : { targetSlot: session.targetSlot }),
  }
}

function sessionFromReceipt(
  fallback: TargetPickerSession,
  value: unknown,
): TargetPickerSession {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    tabId: typeof value.tabId === 'number' ? value.tabId : fallback.tabId,
    ...(typeof value.frameId === 'number' ? { frameId: value.frameId } : optionalFrameId(fallback.frameId)),
    sessionId: typeof value.sessionId === 'string' ? value.sessionId : fallback.sessionId,
    ...(typeof value.scenarioId === 'string' ? { scenarioId: value.scenarioId } : optionalScenarioId(fallback.scenarioId)),
    ...(typeof value.runId === 'string' ? { runId: value.runId } : optionalRunId(fallback.runId)),
    ...(isInspectorTargetSlotCorrelation(value.targetSlot)
      ? { targetSlot: value.targetSlot }
      : optionalTargetSlot(fallback.targetSlot)),
    startedAt: fallback.startedAt,
  }
}

function normalizeStartInput(input: string | TargetPickerStartInput | undefined): TargetPickerStartInput {
  if (typeof input === 'string') {
    return { scenarioId: input }
  }

  return input ?? {}
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
}

function optionalScenarioId(scenarioId: string | undefined): Readonly<{ scenarioId?: string }> {
  return scenarioId === undefined ? {} : { scenarioId }
}

function optionalRunId(runId: string | undefined): Readonly<{ runId?: string }> {
  return runId === undefined ? {} : { runId }
}

function optionalTargetSlot(
  targetSlot: InspectorTargetSlotCorrelation | undefined,
): Readonly<{ targetSlot?: InspectorTargetSlotCorrelation }> {
  return targetSlot === undefined ? {} : { targetSlot }
}

function idleSnapshot(): TargetPickerSnapshot {
  return {
    status: 'idle',
    issues: [],
  }
}

function targetPickerStatusSummary(snapshot: TargetPickerSnapshot): string {
  switch (snapshot.status) {
    case 'idle':
      return 'Idle'
    case 'starting':
      return 'Starting inspection'
    case 'inspecting':
      return `Inspecting ${snapshot.session?.sessionId ?? 'target'}`
    case 'stopping':
      return 'Stopping inspection'
    case 'selected':
      return 'Target selected'
    case 'cancelled':
      return snapshot.message ?? 'Inspection cancelled'
    case 'failed':
      return issueSummary(snapshot.issues) || 'Inspection failed'
  }
}

function selectedTargetSummary(target: InspectorTargetMetadata | undefined): string {
  if (target === undefined) {
    return 'No target selected'
  }

  const id = target.id === undefined || target.id.length === 0 ? '' : `#${target.id}`
  const text = target.text ?? target.ariaLabel ?? target.labelText
  const textSummary = text === undefined || text.length === 0 ? '' : ` "${compactText(text, 42)}"`
  return `${target.tagName}${id}${textSummary}`
}

function issueSummary(issues: readonly ExtensionIssue[]): string {
  if (issues.length === 0) {
    return ''
  }

  if (issues.length === 1) {
    return issues[0]?.message ?? 'Inspection issue'
  }

  return `${issues.length} issues`
}

function cancellationSummary(reason: string): string {
  switch (reason) {
    case 'user':
      return 'Inspection cancelled.'
    case 'stopped':
      return 'Inspection stopped.'
    case 'navigation':
      return 'Page navigation ended inspection.'
    case 'content_lost':
      return 'Inspection ended because the content script was unavailable.'
    default:
      return 'Inspection cancelled.'
  }
}

function readExtensionResult(value: unknown): ExtensionResult<unknown> | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return null
  }

  if (value.ok === true && 'value' in value) {
    return value as ExtensionResult<unknown>
  }

  if (value.ok === false && Array.isArray(value.issues)) {
    return value as ExtensionResult<unknown>
  }

  return null
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function compactText(value: string, limit: number): string {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= limit) {
    return compact
  }

  return compact.slice(0, limit - 1).trimEnd()
}

function defaultSessionId(): string {
  return `inspect-${nextInspectionSequence++}`
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
