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
import type { RuntimeRunStatus, TraceDisplayEvent } from '../../trace/index.js'

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
  latestTrace?: TraceDisplayEvent
}>

export type ImportedScenarioRunnerClient = Readonly<{
  getActiveTab(): Promise<SidepanelActiveTab | null>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

export type ImportedScenarioRunnerOptions = Readonly<{
  createRunId?: () => string
  frameId?: number
}>

export type ImportedScenarioRunner = Readonly<{
  validate(jsonText: string): ExtensionResult<ImportedScenarioPreparation>
  run(jsonText: string): Promise<ExtensionResult<ImportedScenarioRunReceipt>>
  ingestMessage(message: unknown): boolean
  getSnapshot(): ImportedScenarioRunSnapshot
}>

const DEFAULT_FRAME_ID = 0

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
  const frameId = options.frameId ?? DEFAULT_FRAME_ID
  let currentRun: RequiredRunCorrelation | null = null
  let snapshot = idleSnapshot()

  function validate(jsonText: string): ExtensionResult<ImportedScenarioPreparation> {
    const preparation = validateImportedScenarioText(jsonText)

    if (!preparation.ok) {
      snapshot = {
        ...idleSnapshot(),
        issues: preparation.issues,
      }
      return preparation
    }

    snapshot = {
      ...idleSnapshot(),
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
      latestTrace: undefined,
    }

    const preparation = validateImportedScenarioText(jsonText)
    if (!preparation.ok) {
      snapshot = {
        ...idleSnapshot(),
        issues: preparation.issues,
      }
      return preparation
    }

    const activeTab = await resolveActiveTab(client)
    if (!activeTab.ok) {
      snapshot = {
        ...idleSnapshot(),
        document: preparation.value.document,
        issues: activeTab.issues,
      }
      return activeTab
    }

    const scenarioId = scenarioIdFor(preparation.value.document)
    const runId = createRunId()
    const correlation = {
      tabId: activeTab.value.id,
      frameId,
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
        ...idleSnapshot(),
        document: preparation.value.document,
        issues,
      }
      return result
    }

    const responseResult = readExtensionResult(response)
    if (responseResult !== null && !responseResult.ok) {
      snapshot = {
        ...idleSnapshot(),
        document: preparation.value.document,
        issues: responseResult.issues,
      }
      return failure(responseResult.issues)
    }

    currentRun = correlation
    snapshot = {
      pending: false,
      status: 'running',
      issues: [],
      document: preparation.value.document,
      scenarioId,
      runId,
      tabId: activeTab.value.id,
      frameId,
    }

    return ok({
      ...correlation,
      status: 'running',
    })
  }

  function ingestMessage(message: unknown): boolean {
    if (currentRun === null || !isActorbleExtensionMessage(message)) {
      return false
    }

    if (message.kind === 'runtime:status' && matchesCurrentRun(currentRun, message.payload)) {
      snapshot = {
        ...snapshot,
        pending: false,
        status: message.payload.status,
        message: message.payload.message,
      }
      return true
    }

    if (message.kind === 'trace:event' && matchesCurrentRun(currentRun, message.payload)) {
      snapshot = {
        ...snapshot,
        latestTrace: message.payload.event,
      }
      return true
    }

    return false
  }

  function getSnapshot(): ImportedScenarioRunSnapshot {
    return snapshot
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

function scenarioIdFor(document: ScenarioDocument): string {
  return document.id ?? 'imported-scenario'
}

function defaultRunId(): string {
  return `run-${Date.now()}-${nextRunSequence++}`
}

function idleSnapshot(): ImportedScenarioRunSnapshot {
  return {
    pending: false,
    status: 'idle',
    issues: [],
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
