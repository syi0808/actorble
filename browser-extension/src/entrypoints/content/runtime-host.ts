import {
  BrowserDiagnosticsTrace,
  type Actorble,
  type ActorbleError,
  type ActorbleErrorDetails,
  type ActorbleFacadeOptions,
  type ActorbleListener,
  type DebugEventName,
  type RunOptions,
  type Trace,
  type TraceCollector,
  type TraceEvent,
  type TraceSpanHandle,
} from '@actorble/browser'
import {
  createExtensionMessage,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type ActorbleExtensionMessageByKind,
  type ExtensionMessageKind,
  type RequiredRunCorrelation,
} from '../../messaging/index.js'
import { failure, ok, type ExtensionResult } from '../../shared/result.js'
import type { BrowserRuntimeRunOptions } from '../../scenario/compile-to-browser-runtime.js'
import type {
  RuntimeDebugSnapshot,
  RuntimeRunStatus,
  RuntimeTraceErrorSnapshot,
  RuntimeTraceSpanSnapshot,
  TraceDisplayEvent,
} from '../../trace/index.js'

export type ContentActorbleFacade = Pick<
  Actorble,
  | 'run'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'destroy'
  | 'getCapabilities'
  | 'getFidelity'
  | 'getTrace'
>

export type ContentRuntimeMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{
    kind: 'scenario:run' | 'scenario:pause' | 'scenario:resume' | 'scenario:stop'
  }>
>

export type ContentRuntimeReceipt = RequiredRunCorrelation &
  Readonly<{
    kind: ExtensionMessageKind
    status: RuntimeRunStatus
  }>

export type ContentRuntimeHost = Readonly<{
  handleMessage(message: unknown): Promise<ExtensionResult<ContentRuntimeReceipt>>
  dispose(): void
}>

export type ContentRuntimeHostOptions = Readonly<{
  createActorble(options: ActorbleFacadeOptions): ContentActorbleFacade
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
  now?: () => number
}>

type ScenarioRunMessage = ActorbleExtensionMessageByKind<'scenario:run'>
type ScenarioControlMessage = ActorbleExtensionMessageByKind<
  'scenario:pause' | 'scenario:resume' | 'scenario:stop'
>

type ActiveRun = {
  token: number
  correlation: RequiredRunCorrelation
  actorble: ContentActorbleFacade
  controller: AbortController
  stopped: boolean
  cleaned: boolean
}

export function createContentRuntimeHost(
  options: ContentRuntimeHostOptions,
): ContentRuntimeHost {
  const getNow = options.now ?? Date.now
  let activeRun: ActiveRun | null = null
  let nextRunToken = 1

  async function handleMessage(
    message: unknown,
  ): Promise<ExtensionResult<ContentRuntimeReceipt>> {
    if (!isActorbleExtensionMessage(message)) {
      return runtimeFailure('Content runtime received an unsupported message.', {
        kind: readMessageKind(message),
      })
    }

    switch (message.kind) {
      case 'scenario:run':
        return startRun(message)
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
        return controlRun(message)
      case 'scenario:validate':
      case 'scenario:compile':
      case 'record:start':
      case 'record:event':
      case 'record:stop':
      case 'record:draft:get':
      case 'inspector:start':
      case 'inspector:stop':
      case 'inspector:selected':
      case 'inspector:cancelled':
      case 'locator:preview':
      case 'trace:event':
      case 'runtime:status':
      case 'content:ready':
      case 'popup:get-state':
        return failure({
          code: 'unsupported_message',
          message: `${message.kind} is not handled by the content runtime host.`,
          details: { kind: message.kind },
        })
    }
  }

  async function startRun(
    message: ScenarioRunMessage,
  ): Promise<ExtensionResult<ContentRuntimeReceipt>> {
    if (activeRun !== null) {
      return runtimeFailure('An Actorble run is already active.', {
        activeRunId: activeRun.correlation.runId,
        requestedRunId: message.payload.runId,
      })
    }

    const correlation = correlationFrom(message.payload)
    const trace = new ForwardingDiagnosticsTrace({
      correlation,
      now: getNow,
      sendMessage: options.sendMessage,
    })
    let actorble: ContentActorbleFacade

    try {
      actorble = options.createActorble({
        trace,
        feedback: 'debug',
        motion: true,
      })
    } catch (error) {
      return runtimeFailure('Actorble runtime could not be created.', {
        error: describeUnknownError(error),
      })
    }

    const run = {
      token: nextRunToken++,
      correlation,
      actorble,
      controller: new AbortController(),
      stopped: false,
      cleaned: false,
    } satisfies ActiveRun

    activeRun = run

    try {
      await emitStatus(run, 'running')
    } catch (error) {
      cleanupRun(run)
      return runtimeFailure('Runtime status delivery failed.', {
        error: describeUnknownError(error),
      })
    }

    void executeRun(run, message.payload.compilation)

    return ok(receiptFor(message.kind, correlation, 'running'))
  }

  async function controlRun(
    message: ScenarioControlMessage,
  ): Promise<ExtensionResult<ContentRuntimeReceipt>> {
    if (activeRun === null || !matchesRun(activeRun.correlation, message.payload)) {
      return runtimeFailure('No active Actorble run matches the requested control message.', {
        kind: message.kind,
        runId: message.payload.runId,
      })
    }

    const run = activeRun

    try {
      switch (message.kind) {
        case 'scenario:pause':
          run.actorble.pause()
          await emitStatus(run, 'paused')
          return ok(receiptFor(message.kind, run.correlation, 'paused'))
        case 'scenario:resume':
          run.actorble.resume()
          await emitStatus(run, 'running')
          return ok(receiptFor(message.kind, run.correlation, 'running'))
        case 'scenario:stop':
          run.stopped = true
          run.controller.abort('Stopped by user.')
          run.actorble.stop()
          await emitStatus(run, 'stopped', 'Stopped by user.')
          cleanupRun(run)
          return ok(receiptFor(message.kind, run.correlation, 'stopped'))
      }
    } catch (error) {
      return runtimeFailure('Actorble run control failed.', {
        kind: message.kind,
        runId: message.payload.runId,
        error: describeUnknownError(error),
      })
    }
  }

  async function executeRun(
    run: ActiveRun,
    compilation: ScenarioRunMessage['payload']['compilation'],
  ): Promise<void> {
    try {
      await run.actorble.run(
        compilation.scenario,
        runOptionsWithSignal(compilation.runOptions, run.controller.signal),
      )

      if (isCurrentRun(run)) {
        await emitStatus(run, 'completed')
      }
    } catch (error) {
      if (isCurrentRun(run) && !run.stopped) {
        await emitStatus(run, 'failed', describeUnknownError(error))
      }
    } finally {
      cleanupRun(run)
    }
  }

  async function emitStatus(
    run: ActiveRun,
    status: RuntimeRunStatus,
    message?: string,
  ): Promise<void> {
    const debugSnapshot = runtimeDebugSnapshotFor(run.actorble)

    await options.sendMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          ...run.correlation,
          status,
          ...(message === undefined ? {} : { message }),
          ...(debugSnapshot === undefined ? {} : { debugSnapshot }),
        },
      }),
    )
  }

  function cleanupRun(run: ActiveRun): void {
    if (run.cleaned) {
      return
    }

    run.cleaned = true

    if (activeRun?.token === run.token) {
      activeRun = null
    }

    run.actorble.destroy()
  }

  function isCurrentRun(run: ActiveRun): boolean {
    return activeRun?.token === run.token && !run.cleaned
  }

  function dispose(): void {
    if (activeRun === null) {
      return
    }

    const run = activeRun

    run.stopped = true
    run.controller.abort('Content runtime disposed.')
    run.actorble.stop()
    cleanupRun(run)
  }

  return {
    handleMessage,
    dispose,
  }
}

function runtimeDebugSnapshotFor(
  actorble: ContentActorbleFacade,
): RuntimeDebugSnapshot | undefined {
  try {
    const trace = actorble.getTrace()

    return {
      capturedAt: Date.now(),
      capabilities: sanitizeRecord(actorble.getCapabilities()),
      fidelity: sanitizeRecord(actorble.getFidelity()),
      trace: {
        spans: trace.spans.map(runtimeTraceSpanSnapshotFrom),
        events: trace.events.map((event) => ({
          name: event.name,
          at: event.at,
          ...(event.spanId === undefined ? {} : { spanId: event.spanId }),
          ...(event.data === undefined ? {} : { data: sanitizeUnknown(event.data) }),
        })),
        snapshots: trace.snapshots.map((snapshot) => ({
          name: snapshot.name,
          at: snapshot.at,
          data: sanitizeUnknown(snapshot.data),
        })),
        warnings: trace.warnings.map((warning) => ({
          message: warning.message,
          at: warning.at,
          ...(warning.details === undefined ? {} : {
            details: sanitizeRecord(warning.details),
          }),
        })),
      },
    }
  } catch {
    return undefined
  }
}

function runtimeTraceSpanSnapshotFrom(
  span: Trace['spans'][number],
): RuntimeTraceSpanSnapshot {
  const error = runtimeTraceErrorSnapshotFrom(span.error)

  return {
    id: span.id,
    name: span.name,
    ...(span.parentId === undefined ? {} : { parentId: span.parentId }),
    status: span.status,
    startedAt: span.startedAt,
    ...(span.endedAt === undefined ? {} : { endedAt: span.endedAt }),
    ...(span.attributes === undefined ? {} : {
      attributes: sanitizeRecord(span.attributes),
    }),
    ...(error === undefined ? {} : { error }),
  }
}

function runtimeTraceErrorSnapshotFrom(
  error: Trace['spans'][number]['error'],
): RuntimeTraceErrorSnapshot | undefined {
  if (error === undefined) {
    return undefined
  }

  return {
    name: error.name,
    message: error.message,
    ...(error.code === undefined ? {} : { code: error.code }),
    ...(error.details === undefined ? {} : { details: sanitizeRecord(error.details) }),
  }
}

function sanitizeRecord(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const sanitized = sanitizeUnknown(value)
  return isRecord(sanitized) ? sanitized : {}
}

function sanitizeUnknown(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (value === undefined) {
    return undefined
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]'
    }

    seen.add(value)

    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
      }
    }

    const record: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value)) {
      const sanitized = sanitizeUnknown(nested, seen)
      if (sanitized !== undefined) {
        record[key] = sanitized
      }
    }

    return record
  }

  return String(value)
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type ForwardingDiagnosticsTraceOptions = Readonly<{
  correlation: RequiredRunCorrelation
  now: () => number
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

class ForwardingDiagnosticsTrace implements TraceCollector {
  readonly #correlation: RequiredRunCorrelation
  readonly #delegate: BrowserDiagnosticsTrace
  readonly #sendMessage: ContentRuntimeHostOptions['sendMessage']

  constructor(options: ForwardingDiagnosticsTraceOptions) {
    this.#correlation = options.correlation
    this.#sendMessage = options.sendMessage
    this.#delegate = new BrowserDiagnosticsTrace({
      clock: {
        now: options.now,
      },
    })
  }

  startSpan(name: string, attributes?: ActorbleErrorDetails): TraceSpanHandle {
    const span = this.#delegate.startSpan(name, attributes)

    return {
      id: span.id,
      end: (terminalAttributes?: ActorbleErrorDetails) => {
        span.end(terminalAttributes)
      },
      error: (error: ActorbleError, terminalAttributes?: ActorbleErrorDetails) => {
        span.error(error, terminalAttributes)
      },
      cancel: (reason?: unknown) => {
        span.cancel(reason)
      },
      event: (eventName: DebugEventName, data?: unknown) => {
        span.event(eventName, data)
        this.#forwardLatestEvent(eventName)
      },
    }
  }

  appendEvent(name: DebugEventName, data?: unknown): void {
    this.#delegate.appendEvent(name, data)
    this.#forwardLatestEvent(name)
  }

  attachSnapshot(name: string, data: unknown): void {
    this.#delegate.attachSnapshot(name, data)
  }

  warn(message: string, details?: ActorbleErrorDetails): void {
    this.#delegate.warn(message, details)
  }

  getTrace(): Trace {
    return this.#delegate.getTrace()
  }

  on(name: DebugEventName, listener: ActorbleListener<TraceEvent>): void {
    this.#delegate.on(name, listener)
  }

  off(name: DebugEventName, listener: ActorbleListener<TraceEvent>): void {
    this.#delegate.off(name, listener)
  }

  #forwardLatestEvent(expectedName: DebugEventName): void {
    const event = this.#delegate.getTrace().events.at(-1)

    if (event === undefined || event.name !== expectedName) {
      return
    }

    void this.#sendMessage(
      createExtensionMessage({
        kind: 'trace:event',
        payload: {
          ...this.#correlation,
          event: traceDisplayEventFrom(event, this.#correlation),
        },
      }),
    ).catch(() => undefined)
  }
}

function traceDisplayEventFrom(
  event: TraceEvent,
  correlation: RequiredRunCorrelation,
): TraceDisplayEvent {
  const details = traceEventDetails(event)

  return {
    runId: correlation.runId,
    scenarioId: correlation.scenarioId,
    timestamp: event.at,
    name: event.name,
    ...(details === undefined ? {} : { details }),
  }
}

function traceEventDetails(
  event: TraceEvent,
): Readonly<Record<string, unknown>> | undefined {
  const details: Record<string, unknown> = {}

  if (event.spanId !== undefined) {
    details.spanId = event.spanId
  }

  if (event.data !== undefined) {
    details.data = event.data
  }

  return Object.keys(details).length === 0 ? undefined : details
}

function runOptionsWithSignal(
  runOptions: BrowserRuntimeRunOptions | undefined,
  signal: AbortSignal,
): RunOptions {
  return {
    ...runOptions,
    signal,
  }
}

function correlationFrom(correlation: RequiredRunCorrelation): RequiredRunCorrelation {
  return {
    tabId: correlation.tabId,
    ...(correlation.frameId === undefined ? {} : { frameId: correlation.frameId }),
    scenarioId: correlation.scenarioId,
    runId: correlation.runId,
  }
}

function matchesRun(
  active: RequiredRunCorrelation,
  requested: RequiredRunCorrelation,
): boolean {
  return (
    active.tabId === requested.tabId &&
    active.frameId === requested.frameId &&
    active.scenarioId === requested.scenarioId &&
    active.runId === requested.runId
  )
}

function receiptFor(
  kind: ExtensionMessageKind,
  correlation: RequiredRunCorrelation,
  status: RuntimeRunStatus,
): ContentRuntimeReceipt {
  return {
    kind,
    ...correlation,
    status,
  }
}

function runtimeFailure(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ExtensionResult<never> {
  return failure({
    code: 'runtime_error',
    message,
    ...(details === undefined ? {} : { details }),
  })
}

function readMessageKind(message: unknown): unknown {
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return undefined
  }

  return (message as Readonly<{ kind?: unknown }>).kind
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
