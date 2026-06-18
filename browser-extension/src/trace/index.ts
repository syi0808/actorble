export type RuntimeRunStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'stopped'
  | 'completed'
  | 'failed'

export type TraceDisplayEvent = Readonly<{
  runId: string
  scenarioId?: string
  stepId?: string
  timestamp: number
  name: string
  level?: 'debug' | 'info' | 'warning' | 'error'
  message?: string
  details?: Readonly<Record<string, unknown>>
}>

export type RuntimeStatusSnapshot = Readonly<{
  runId: string
  scenarioId?: string
  tabId?: number
  frameId?: number
  status: RuntimeRunStatus
  currentStepId?: string
  updatedAt: number
  message?: string
  debugSnapshot?: RuntimeDebugSnapshot
}>

export type RuntimeTraceSpanStatus = 'running' | 'ok' | 'error' | 'cancelled'

export type RuntimeTraceErrorSnapshot = Readonly<{
  name: string
  message: string
  code?: string
  details?: Readonly<Record<string, unknown>>
}>

export type RuntimeTraceSpanSnapshot = Readonly<{
  id: string
  name: string
  parentId?: string
  status: RuntimeTraceSpanStatus
  startedAt: number
  endedAt?: number
  attributes?: Readonly<Record<string, unknown>>
  error?: RuntimeTraceErrorSnapshot
}>

export type RuntimeTraceEventSnapshot = Readonly<{
  name: string
  at: number
  spanId?: string
  data?: unknown
}>

export type RuntimeTraceDataSnapshot = Readonly<{
  name: string
  at: number
  data: unknown
}>

export type RuntimeTraceWarningSnapshot = Readonly<{
  message: string
  at: number
  details?: Readonly<Record<string, unknown>>
}>

export type RuntimeTraceSnapshot = Readonly<{
  spans: readonly RuntimeTraceSpanSnapshot[]
  events: readonly RuntimeTraceEventSnapshot[]
  snapshots: readonly RuntimeTraceDataSnapshot[]
  warnings: readonly RuntimeTraceWarningSnapshot[]
}>

export type RuntimeDebugSnapshot = Readonly<{
  capturedAt: number
  capabilities?: Readonly<Record<string, unknown>>
  fidelity?: Readonly<Record<string, unknown>>
  trace: RuntimeTraceSnapshot
}>

export type TraceRunGroup = Readonly<{
  runId: string
  scenarioId?: string
  status: RuntimeStatusSnapshot
  events: readonly TraceDisplayEvent[]
}>

export type TraceFailureDisplay = Readonly<{
  message: string
  stepId?: string
  eventName?: string
  details?: Readonly<Record<string, unknown>>
}>

export type TraceRunDisplayView = TraceRunGroup &
  Readonly<{
    eventCount: number
    latestEvent?: TraceDisplayEvent
    failure?: TraceFailureDisplay
    summary: string
  }>

export type TraceDisplayState = Readonly<{
  currentRunId?: string
  runs: readonly TraceRunDisplayView[]
}>

export type TraceDisplayStoreOptions = Readonly<{
  historyLimit?: number
  runLimit?: number
}>

export type TraceDisplayStore = Readonly<{
  startRun(status: RuntimeStatusSnapshot): TraceRunDisplayView
  ingestStatus(status: RuntimeStatusSnapshot): TraceRunDisplayView
  ingestEvent(event: TraceDisplayEvent): TraceRunDisplayView
  getRun(runId: string): TraceRunDisplayView | undefined
  getCurrentView(): TraceRunDisplayView | undefined
  getState(): TraceDisplayState
}>

export type DevtoolsCapabilityRow = Readonly<{
  source: 'capability' | 'fidelity'
  label: string
  value: string
}>

export type DevtoolsLocatorDiagnosticView = Readonly<{
  name: string
  at: number
  ambiguity: string
  candidateCount: number
  locator?: string
}>

export type DevtoolsFrameSurfaceRow = Readonly<{
  label: string
  value: string
}>

export type DevtoolsTraceSummary = Readonly<{
  spans: number
  events: number
  snapshots: number
  warnings: number
}>

export type DevtoolsTracePanelRunView = TraceRunDisplayView &
  Readonly<{
    selected: boolean
    debugSnapshot?: RuntimeDebugSnapshot
    traceSummary: DevtoolsTraceSummary
    locatorDiagnostics: readonly DevtoolsLocatorDiagnosticView[]
    capabilityRows: readonly DevtoolsCapabilityRow[]
    frameSurfaceRows: readonly DevtoolsFrameSurfaceRow[]
  }>

export type DevtoolsTracePanelSnapshot = Readonly<{
  selectedRunId?: string
  runs: readonly DevtoolsTracePanelRunView[]
  selectedRun?: DevtoolsTracePanelRunView
  summary: string
}>

export type DevtoolsTracePanelStore = Readonly<{
  ingestStatus(status: RuntimeStatusSnapshot): DevtoolsTracePanelSnapshot
  ingestEvent(event: TraceDisplayEvent): DevtoolsTracePanelSnapshot
  selectRun(runId: string): boolean
  getSnapshot(): DevtoolsTracePanelSnapshot
}>

export const DEFAULT_TRACE_HISTORY_LIMIT = 200
export const DEFAULT_TRACE_RUN_LIMIT = 20

type MutableTraceRunGroup = {
  runId: string
  scenarioId?: string
  status: RuntimeStatusSnapshot
  events: TraceDisplayEvent[]
  eventCount: number
}

export function createTraceDisplayStore(
  options: TraceDisplayStoreOptions = {},
): TraceDisplayStore {
  const historyLimit = positiveIntegerOrDefault(
    options.historyLimit,
    DEFAULT_TRACE_HISTORY_LIMIT,
  )
  const runLimit = positiveIntegerOrDefault(options.runLimit, DEFAULT_TRACE_RUN_LIMIT)
  const runs: MutableTraceRunGroup[] = []
  let currentRunId: string | undefined

  function startRun(status: RuntimeStatusSnapshot): TraceRunDisplayView {
    removeRun(status.runId)
    const run = {
      runId: status.runId,
      scenarioId: status.scenarioId,
      status,
      events: [],
      eventCount: 0,
    } satisfies MutableTraceRunGroup

    runs.push(run)
    currentRunId = run.runId
    pruneRuns()

    return viewFor(run)
  }

  function ingestStatus(status: RuntimeStatusSnapshot): TraceRunDisplayView {
    const run = getOrCreateRun(status.runId, () => ({
      runId: status.runId,
      scenarioId: status.scenarioId,
      status,
      events: [],
      eventCount: 0,
    }))

    run.scenarioId = status.scenarioId ?? run.scenarioId
    run.status = {
      ...status,
      scenarioId: status.scenarioId ?? run.scenarioId,
    }
    currentRunId = run.runId

    return viewFor(run)
  }

  function ingestEvent(event: TraceDisplayEvent): TraceRunDisplayView {
    const run = getOrCreateRun(event.runId, () => ({
      runId: event.runId,
      scenarioId: event.scenarioId,
      status: {
        runId: event.runId,
        scenarioId: event.scenarioId,
        status: 'running',
        updatedAt: event.timestamp,
      },
      events: [],
      eventCount: 0,
    }))

    run.scenarioId = run.scenarioId ?? event.scenarioId
    if (run.status.scenarioId === undefined && run.scenarioId !== undefined) {
      run.status = {
        ...run.status,
        scenarioId: run.scenarioId,
      }
    }
    run.events.push(displayEventFor(event))
    run.eventCount += 1
    if (run.events.length > historyLimit) {
      run.events.splice(0, run.events.length - historyLimit)
    }
    currentRunId = run.runId

    return viewFor(run)
  }

  function getRun(runId: string): TraceRunDisplayView | undefined {
    const run = runs.find((candidate) => candidate.runId === runId)
    return run === undefined ? undefined : viewFor(run)
  }

  function getCurrentView(): TraceRunDisplayView | undefined {
    return currentRunId === undefined ? undefined : getRun(currentRunId)
  }

  function getState(): TraceDisplayState {
    return {
      ...(currentRunId === undefined ? {} : { currentRunId }),
      runs: runs.map(viewFor),
    }
  }

  function getOrCreateRun(
    runId: string,
    create: () => MutableTraceRunGroup,
  ): MutableTraceRunGroup {
    const existing = runs.find((run) => run.runId === runId)
    if (existing !== undefined) {
      return existing
    }

    const run = create()
    runs.push(run)
    pruneRuns()
    return run
  }

  function removeRun(runId: string): void {
    const index = runs.findIndex((run) => run.runId === runId)
    if (index >= 0) {
      runs.splice(index, 1)
    }
  }

  function pruneRuns(): void {
    if (runs.length <= runLimit) {
      return
    }

    runs.splice(0, runs.length - runLimit)
    if (currentRunId !== undefined && !runs.some((run) => run.runId === currentRunId)) {
      currentRunId = runs.at(-1)?.runId
    }
  }

  return {
    startRun,
    ingestStatus,
    ingestEvent,
    getRun,
    getCurrentView,
    getState,
  }
}

export function createDevtoolsTracePanelStore(
  options: TraceDisplayStoreOptions = {},
): DevtoolsTracePanelStore {
  const traceStore = createTraceDisplayStore(options)
  let selectedRunId: string | undefined

  function ingestStatus(status: RuntimeStatusSnapshot): DevtoolsTracePanelSnapshot {
    traceStore.ingestStatus(status)
    selectedRunId ??= status.runId
    return getSnapshot()
  }

  function ingestEvent(event: TraceDisplayEvent): DevtoolsTracePanelSnapshot {
    traceStore.ingestEvent(event)
    selectedRunId ??= event.runId
    return getSnapshot()
  }

  function selectRun(runId: string): boolean {
    if (traceStore.getRun(runId) === undefined) {
      return false
    }

    selectedRunId = runId
    return true
  }

  function getSnapshot(): DevtoolsTracePanelSnapshot {
    const state = traceStore.getState()
    const resolvedSelectedRunId =
      selectedRunId ?? state.currentRunId ?? state.runs.at(-1)?.runId
    const runs = state.runs.map((run) => devtoolsRunView(
      run,
      run.runId === resolvedSelectedRunId,
    ))
    const selectedRun = runs.find((run) => run.selected)

    return {
      ...(selectedRun === undefined ? {} : { selectedRunId: selectedRun.runId }),
      runs,
      ...(selectedRun === undefined ? {} : { selectedRun }),
      summary: selectedRun?.summary ?? 'No runtime trace data',
    }
  }

  return {
    ingestStatus,
    ingestEvent,
    selectRun,
    getSnapshot,
  }
}

function viewFor(run: MutableTraceRunGroup): TraceRunDisplayView {
  const latestEvent = run.events.at(-1)
  const scenarioId = run.status.scenarioId ?? run.scenarioId ?? latestEvent?.scenarioId
  const status = {
    ...run.status,
    ...(scenarioId === undefined ? {} : { scenarioId }),
  }
  const failure = failureFor(status, run.events)

  return {
    runId: run.runId,
    ...(scenarioId === undefined ? {} : { scenarioId }),
    status,
    events: [...run.events],
    eventCount: run.eventCount,
    ...(latestEvent === undefined ? {} : { latestEvent }),
    ...(failure === undefined ? {} : { failure }),
    summary: summaryFor(status, run.eventCount, latestEvent, failure),
  }
}

function devtoolsRunView(
  run: TraceRunDisplayView,
  selected: boolean,
): DevtoolsTracePanelRunView {
  const debugSnapshot = run.status.debugSnapshot

  return {
    ...run,
    selected,
    ...(debugSnapshot === undefined ? {} : { debugSnapshot }),
    traceSummary: traceSummaryFor(debugSnapshot),
    locatorDiagnostics: locatorDiagnosticsFor(debugSnapshot),
    capabilityRows: capabilityRowsFor(debugSnapshot),
    frameSurfaceRows: frameSurfaceRowsFor(run, debugSnapshot),
  }
}

function traceSummaryFor(
  debugSnapshot: RuntimeDebugSnapshot | undefined,
): DevtoolsTraceSummary {
  const trace = debugSnapshot?.trace

  return {
    spans: trace?.spans.length ?? 0,
    events: trace?.events.length ?? 0,
    snapshots: trace?.snapshots.length ?? 0,
    warnings: trace?.warnings.length ?? 0,
  }
}

function locatorDiagnosticsFor(
  debugSnapshot: RuntimeDebugSnapshot | undefined,
): readonly DevtoolsLocatorDiagnosticView[] {
  return (debugSnapshot?.trace.snapshots ?? [])
    .filter((snapshot) => snapshot.name === 'target.resolve.candidates')
    .map((snapshot) => {
      const data = recordValue(snapshot.data)
      const candidates = Array.isArray(data?.candidates) ? data.candidates : []
      const ambiguity = stringValue(data?.ambiguity) ?? 'unknown'
      const locator = data?.locator === undefined ? undefined : displayValue(data.locator)

      return {
        name: snapshot.name,
        at: snapshot.at,
        ambiguity,
        candidateCount: candidates.length,
        ...(locator === undefined ? {} : { locator }),
      }
    })
}

function capabilityRowsFor(
  debugSnapshot: RuntimeDebugSnapshot | undefined,
): readonly DevtoolsCapabilityRow[] {
  return [
    ...capabilityRowsFrom('capability', debugSnapshot?.capabilities),
    ...capabilityRowsFrom('fidelity', debugSnapshot?.fidelity),
  ]
}

function capabilityRowsFrom(
  source: DevtoolsCapabilityRow['source'],
  record: Readonly<Record<string, unknown>> | undefined,
): readonly DevtoolsCapabilityRow[] {
  if (record === undefined) {
    return []
  }

  return Object.entries(record).map(([label, value]) => ({
    source,
    label,
    value: displayValue(value),
  }))
}

function frameSurfaceRowsFor(
  run: TraceRunDisplayView,
  debugSnapshot: RuntimeDebugSnapshot | undefined,
): readonly DevtoolsFrameSurfaceRow[] {
  const rows: DevtoolsFrameSurfaceRow[] = []

  if (run.status.tabId !== undefined) {
    rows.push({ label: 'Tab', value: String(run.status.tabId) })
  }

  if (run.status.frameId !== undefined) {
    rows.push({ label: 'Frame', value: String(run.status.frameId) })
  }

  const surfaceRows = [
    ...run.events.map(surfaceRowFromDisplayEvent),
    ...(debugSnapshot?.trace.events.map(surfaceRowFromRuntimeEvent) ?? []),
  ].filter((row): row is DevtoolsFrameSurfaceRow => row !== undefined)

  for (const row of surfaceRows) {
    if (!rows.some((existing) => existing.label === row.label && existing.value === row.value)) {
      rows.push(row)
    }
  }

  return rows
}

function surfaceRowFromDisplayEvent(
  event: TraceDisplayEvent,
): DevtoolsFrameSurfaceRow | undefined {
  if (!event.name.startsWith('surface:')) {
    return undefined
  }

  return {
    label: event.name,
    value: surfaceEventValue(recordValue(event.details?.data)),
  }
}

function surfaceRowFromRuntimeEvent(
  event: RuntimeTraceEventSnapshot,
): DevtoolsFrameSurfaceRow | undefined {
  if (!event.name.startsWith('surface:')) {
    return undefined
  }

  return {
    label: event.name,
    value: surfaceEventValue(recordValue(event.data)),
  }
}

function surfaceEventValue(data: Readonly<Record<string, unknown>> | undefined): string {
  if (data === undefined) {
    return 'observed'
  }

  const parts = [
    stringValue(data.action),
    stringValue(data.inputKind),
    stringValue(data.targetId),
    data.position === undefined ? undefined : displayValue(data.position),
  ].filter((part): part is string => part !== undefined && part.length > 0)

  return parts.length === 0 ? displayValue(data) : parts.join(' ')
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function displayValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(displayValue).join(', ')
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }

  if (value === undefined) {
    return ''
  }

  return JSON.stringify(value)
}

function failureFor(
  status: RuntimeStatusSnapshot,
  events: readonly TraceDisplayEvent[],
): TraceFailureDisplay | undefined {
  if (status.status !== 'failed') {
    return undefined
  }

  const event = latestErrorEvent(events) ?? events.at(-1)
  const message = status.message ?? event?.message ?? 'Run failed.'
  const stepId = status.currentStepId ?? event?.stepId

  return {
    message,
    ...(stepId === undefined ? {} : { stepId }),
    ...(event === undefined ? {} : { eventName: event.name }),
    ...(event?.details === undefined ? {} : { details: event.details }),
  }
}

function latestErrorEvent(
  events: readonly TraceDisplayEvent[],
): TraceDisplayEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].level === 'error') {
      return events[index]
    }
  }

  return undefined
}

function summaryFor(
  status: RuntimeStatusSnapshot,
  eventCount: number,
  latestEvent: TraceDisplayEvent | undefined,
  failure: TraceFailureDisplay | undefined,
): string {
  switch (status.status) {
    case 'completed':
      return `Completed ${status.runId} with ${eventCount} ${plural('event', eventCount)}.`
    case 'failed':
      return `Failed ${status.runId} after ${eventCount} ${plural('event', eventCount)}: ${
        failure?.message ?? 'Run failed.'
      }`
    case 'idle':
      return 'No active run'
    default:
      return latestEvent === undefined
        ? `${capitalize(status.status)} ${status.runId}`
        : `${capitalize(status.status)} ${status.runId}: ${latestEvent.message ?? latestEvent.name}`
  }
}

function displayEventFor(event: TraceDisplayEvent): TraceDisplayEvent {
  const stepId = event.stepId ?? stepIdFromDetails(event.details)

  if (stepId === undefined || stepId === event.stepId) {
    return event
  }

  return {
    ...event,
    stepId,
  }
}

function stepIdFromDetails(details: Readonly<Record<string, unknown>> | undefined): string | undefined {
  return typeof details?.stepId === 'string' ? details.stepId : undefined
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback
}

function plural(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
