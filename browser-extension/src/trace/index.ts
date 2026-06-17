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
  status: RuntimeRunStatus
  currentStepId?: string
  updatedAt: number
  message?: string
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
