import {
  createExtensionMessage,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type ActorbleExtensionMessageByKind,
  type RequiredRunCorrelation,
} from '../../messaging/index.js'
import {
  compileToBrowserRuntime,
  type BrowserRuntimeCompilation,
} from '../../scenario/compile-to-browser-runtime.js'
import type { ScenarioDocument } from '../../scenario/types.js'
import { validateScenarioDocument } from '../../scenario/validate.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../../shared/result.js'
import {
  createTraceDisplayStore,
  type RuntimeRunStatus,
  type RuntimeStatusSnapshot,
  type TraceDisplayState,
  type TraceRunDisplayView,
} from '../../trace/index.js'

export type SidepanelActiveTab = Readonly<{
  id?: number
  url?: string
}>

export type ImportedScenarioPreparation = Readonly<{
  document: ScenarioDocument
  compilation: BrowserRuntimeCompilation
}>

export type ImportedScenarioRunReceipt = RequiredRunCorrelation &
  Readonly<{
    status: RuntimeRunStatus
  }>

export type ImportedScenarioRunSnapshot = Readonly<{
  pending: boolean
  status: RuntimeRunStatus
  issues: readonly ExtensionIssue[]
  document?: ScenarioDocument
  scenarioId?: string
  runId?: string
  tabId?: number
  frameId?: number
  message?: string
  trace: TraceDisplayState
  currentTrace: TraceRunDisplayView | undefined
}>

export type ImportedScenarioRunnerClient = Readonly<{
  getActiveTab(): Promise<SidepanelActiveTab | null>
  getTab?(tabId: number): Promise<SidepanelActiveTab | null>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

export type ImportedScenarioRunnerOptions = Readonly<{
  createRunId?: () => string
  frameId?: number
  targetTabId?: number
  now?: () => number
  traceHistoryLimit?: number
  traceRunLimit?: number
}>

export type ImportedScenarioRunner = Readonly<{
  validate(jsonText: string): ExtensionResult<ImportedScenarioPreparation>
  run(jsonText: string): Promise<ExtensionResult<ImportedScenarioRunReceipt>>
  ingestMessage(message: unknown): boolean
  getSnapshot(): ImportedScenarioRunSnapshot
}>

let nextRunSequence = 1

export function validateImportedScenarioText(
  jsonText: string,
): ExtensionResult<ImportedScenarioPreparation> {
  const parsed = parseScenarioJson(jsonText)
  if (!parsed.ok) {
    return parsed
  }

  const validation = validateScenarioDocument(parsed.value)
  if (!validation.ok) {
    return validation
  }

  const compilation = compileToBrowserRuntime(validation.value)
  if (!compilation.ok) {
    return compilation
  }

  return ok({
    document: validation.value,
    compilation: compilation.value,
  })
}

export function createImportedScenarioRunner(
  client: ImportedScenarioRunnerClient,
  options: ImportedScenarioRunnerOptions = {},
): ImportedScenarioRunner {
  const createRunId = options.createRunId ?? defaultRunId
  const frameId = options.frameId
  const targetTabId = options.targetTabId
  const now = options.now ?? Date.now
  const traceStore = createTraceDisplayStore({
    historyLimit: options.traceHistoryLimit,
    runLimit: options.traceRunLimit,
  })
  let currentRun: RequiredRunCorrelation | null = null
  let snapshot = idleSnapshot(traceStore.getState())

  function validate(jsonText: string): ExtensionResult<ImportedScenarioPreparation> {
    const preparation = validateImportedScenarioText(jsonText)

    if (!preparation.ok) {
      snapshot = {
        ...idleSnapshot(traceStore.getState()),
        issues: preparation.issues,
      }
      return preparation
    }

    snapshot = {
      ...idleSnapshot(traceStore.getState()),
      document: preparation.value.document,
    }
    return preparation
  }

  async function run(
    jsonText: string,
  ): Promise<ExtensionResult<ImportedScenarioRunReceipt>> {
    snapshot = {
      ...snapshot,
      pending: true,
      issues: [],
      message: undefined,
      currentTrace: undefined,
    }

    const preparation = validateImportedScenarioText(jsonText)
    if (!preparation.ok) {
      snapshot = {
        ...idleSnapshot(traceStore.getState()),
        issues: preparation.issues,
      }
      return preparation
    }

    const activeTab = await resolveRunTargetTab(client, targetTabId)
    if (!activeTab.ok) {
      snapshot = {
        ...idleSnapshot(traceStore.getState()),
        document: preparation.value.document,
        issues: activeTab.issues,
      }
      return activeTab
    }

    const scenarioId = scenarioIdFor(preparation.value.document)
    const runId = createRunId()
    const correlation = {
      tabId: activeTab.value.id,
      ...optionalFrameId(frameId),
      scenarioId,
      runId,
    } satisfies RequiredRunCorrelation
    const message = createExtensionMessage({
      kind: 'scenario:run',
      payload: {
        ...correlation,
        compilation: preparation.value.compilation,
      },
    })

    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      const issues: readonly ExtensionIssue[] = [
        {
          code: 'content_not_ready',
          message: `Run command could not be delivered: ${describeUnknownError(error)}`,
        },
      ]
      const result = failure<ImportedScenarioRunReceipt>({
        ...issues[0],
      })
      snapshot = {
        ...idleSnapshot(traceStore.getState()),
        document: preparation.value.document,
        issues,
      }
      return result
    }

    const responseResult = readExtensionResult(response)
    if (responseResult !== null && !responseResult.ok) {
      snapshot = {
        ...idleSnapshot(traceStore.getState()),
        document: preparation.value.document,
        issues: responseResult.issues,
      }
      return failure(responseResult.issues)
    }

    const resolvedCorrelation = correlationFromReceipt(correlation, responseResult?.value)
    currentRun = resolvedCorrelation
    traceStore.startRun(statusSnapshotFrom(resolvedCorrelation, 'running', now()))
    snapshot = {
      pending: false,
      status: 'running',
      issues: [],
      document: preparation.value.document,
      scenarioId,
      runId,
      tabId: resolvedCorrelation.tabId,
      ...optionalFrameId(resolvedCorrelation.frameId),
      ...traceFields(),
    }

    return ok({
      ...resolvedCorrelation,
      status: 'running',
    })
  }

  function ingestMessage(message: unknown): boolean {
    if (currentRun === null || !isActorbleExtensionMessage(message)) {
      return false
    }

    if (message.kind === 'runtime:status' && matchesCurrentRun(currentRun, message.payload)) {
      traceStore.ingestStatus(statusSnapshotFrom(
        message.payload,
        message.payload.status,
        now(),
        message.payload.message,
      ))
      snapshot = {
        ...snapshot,
        pending: false,
        status: message.payload.status,
        message: message.payload.message,
        ...traceFields(),
      }
      return true
    }

    if (message.kind === 'trace:event' && matchesCurrentRun(currentRun, message.payload)) {
      traceStore.ingestEvent(message.payload.event)
      snapshot = {
        ...snapshot,
        ...traceFields(),
      }
      return true
    }

    return false
  }

  function getSnapshot(): ImportedScenarioRunSnapshot {
    return snapshot
  }

  function traceFields(): Pick<ImportedScenarioRunSnapshot, 'trace' | 'currentTrace'> {
    return {
      trace: traceStore.getState(),
      currentTrace: traceStore.getCurrentView(),
    }
  }

  return {
    validate,
    run,
    ingestMessage,
    getSnapshot,
  }
}

export function formatIssue(issue: ExtensionIssue): string {
  const path = formatIssuePath(issue.path ?? [])
  return `${path}: ${issue.message}`
}

export function formatIssuePath(path: readonly (string | number)[]): string {
  if (path.length === 0) {
    return 'document'
  }

  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') {
      return `${formatted}[${segment}]`
    }

    return formatted.length === 0 ? segment : `${formatted}.${segment}`
  }, '')
}

function parseScenarioJson(input: string): ExtensionResult<unknown> {
  try {
    return ok(JSON.parse(input))
  } catch (error) {
    return failure({
      code: 'invalid_document',
      message: 'Scenario JSON is not valid JSON.',
      details: {
        reason: describeUnknownError(error),
      },
    })
  }
}

async function resolveActiveTab(
  client: ImportedScenarioRunnerClient,
): Promise<ExtensionResult<SidepanelActiveTab & Readonly<{ id: number }>>> {
  let activeTab: SidepanelActiveTab | null

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

async function resolveRunTargetTab(
  client: ImportedScenarioRunnerClient,
  targetTabId: number | undefined,
): Promise<ExtensionResult<SidepanelActiveTab & Readonly<{ id: number }>>> {
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

  let tab: SidepanelActiveTab | null
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

function scenarioIdFor(document: ScenarioDocument): string {
  return document.id ?? 'imported-scenario'
}

function defaultRunId(): string {
  return `run-${Date.now()}-${nextRunSequence++}`
}

function idleSnapshot(trace: TraceDisplayState): ImportedScenarioRunSnapshot {
  return {
    pending: false,
    status: 'idle',
    issues: [],
    trace,
    currentTrace: undefined,
  }
}

function statusSnapshotFrom(
  correlation: RequiredRunCorrelation,
  status: RuntimeRunStatus,
  updatedAt: number,
  message?: string,
): RuntimeStatusSnapshot {
  return {
    runId: correlation.runId,
    scenarioId: correlation.scenarioId,
    status,
    updatedAt,
    ...(message === undefined ? {} : { message }),
  }
}

function matchesCurrentRun(
  currentRun: RequiredRunCorrelation,
  payload:
    | ActorbleExtensionMessageByKind<'runtime:status'>['payload']
    | ActorbleExtensionMessageByKind<'trace:event'>['payload'],
): boolean {
  return (
    payload.tabId === currentRun.tabId &&
    payload.frameId === currentRun.frameId &&
    payload.scenarioId === currentRun.scenarioId &&
    payload.runId === currentRun.runId
  )
}

function correlationFromReceipt(
  fallback: RequiredRunCorrelation,
  value: unknown,
): RequiredRunCorrelation {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    tabId: typeof value.tabId === 'number' ? value.tabId : fallback.tabId,
    ...(typeof value.frameId === 'number' ? { frameId: value.frameId } : optionalFrameId(fallback.frameId)),
    scenarioId: typeof value.scenarioId === 'string' ? value.scenarioId : fallback.scenarioId,
    runId: typeof value.runId === 'string' ? value.runId : fallback.runId,
  }
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
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

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
