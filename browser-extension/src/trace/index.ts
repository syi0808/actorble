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

export const DEFAULT_TRACE_HISTORY_LIMIT = 200
