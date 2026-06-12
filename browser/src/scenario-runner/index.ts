import { BrowserActionOrchestrator } from '../action-orchestrator/index.js'
import { BrowserDiagnosticsTrace } from '../diagnostics-trace/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import {
  ActorbleError,
  actorbleError,
  cancellationError,
  notImplemented,
  timeoutError,
} from '../shared/index.js'
import { NoopLayoutInvalidationTracker } from '../layout-invalidation-tracker/index.js'
import type { ActionOrchestrator } from '../action-orchestrator/index.js'
import type { LayoutInvalidationTracker } from '../layout-invalidation-tracker/index.js'
import type { SpanRecorder, TraceSpanHandle } from '../diagnostics-trace/index.js'
import type {
  ClickOptions,
  RunOptions,
  Scenario,
  ScenarioStep,
  TargetLike,
  TypeOptions,
  WaitCondition,
  WaitOptions,
} from '../shared/index.js'
import type { TimelineEngine } from '../timeline-engine/index.js'

export type ScenarioRunStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'failed'

export type ScenarioRunSnapshot = Readonly<{
  scenario: Scenario | null
  status: ScenarioRunStatus
  currentStepIndex: number | null
}>

export interface ScenarioRunner {
  run(scenario: Scenario, options?: RunOptions): Promise<void>
  pause(): void
  resume(): void
  stop(): void
  getSnapshot(): ScenarioRunSnapshot
}

export type ScenarioRunnerOptions = Readonly<{
  layoutInvalidation?: LayoutInvalidationTracker
  orchestrator?: ActionOrchestrator
  timeline?: TimelineEngine
  trace?: SpanRecorder
}>

export class BrowserScenarioRunner implements ScenarioRunner {
  readonly #layoutInvalidation: LayoutInvalidationTracker
  readonly #orchestrator: ActionOrchestrator
  readonly #timeline: TimelineEngine
  readonly #trace: SpanRecorder
  #scenario: Scenario | null = null
  #status: ScenarioRunStatus = 'idle'
  #currentStepIndex: number | null = null
  #controller: AbortController | null = null
  #pauseRequested = false
  #resumePausedRun: (() => void) | null = null

  constructor(options: ScenarioRunnerOptions = {}) {
    this.#layoutInvalidation =
      options.layoutInvalidation ?? new NoopLayoutInvalidationTracker()
    this.#orchestrator = options.orchestrator ?? new BrowserActionOrchestrator()
    this.#timeline = options.timeline ?? new BrowserTimelineEngine()
    this.#trace = options.trace ?? new BrowserDiagnosticsTrace()
  }

  async run(scenario: Scenario, options: RunOptions = {}): Promise<void> {
    if (this.#controller !== null) {
      throw actorbleError('PLATFORM_UNSUPPORTED', 'A scenario is already running.', {
        details: { status: this.#status },
      })
    }

    const span = this.#trace.startSpan('scenario.run', {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      steps: scenario.steps.length,
      timeout: options.timeout,
      startedAt: this.#timeline.now(),
    })
    const controller = new AbortController()
    const cleanupExternalAbort = linkExternalAbort(options.signal, controller)
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    this.#scenario = scenario
    this.#status = 'running'
    this.#currentStepIndex = null
    this.#controller = controller
    this.#pauseRequested = false
    this.#layoutInvalidation.start()

    if (options.timeout !== undefined) {
      const timeout = normalizeDuration(options.timeout)
      const timeoutFailure = timeoutError('scenario.run', timeout, {
        details: {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          steps: scenario.steps.length,
        },
      })

      timeoutId = setTimeout(() => {
        controller.abort(timeoutFailure)
        this.#resolvePausedRun()
      }, timeout)
    }

    try {
      assertScenarioNotCancelled(controller.signal)

      for (const [index, step] of scenario.steps.entries()) {
        this.#currentStepIndex = index
        await this.#waitIfPaused(controller.signal)
        assertScenarioNotCancelled(controller.signal)
        await raceWithScenarioSignal(
          this.#executeStep(step, index, controller.signal),
          controller.signal,
        )
      }

      this.#status = 'completed'
      this.#currentStepIndex = null
      span.end({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        steps: scenario.steps.length,
        completed: true,
      })
    } catch (error) {
      const normalized = normalizeScenarioError(error, controller.signal)

      this.#status = normalized.code === 'ACTION_CANCELLED' ? 'stopped' : 'failed'
      this.#currentStepIndex = null
      finishScenarioSpan(span, normalized)
      throw normalized
    } finally {
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      cleanupExternalAbort()
      this.#layoutInvalidation.stop()
      this.#controller = null
      this.#scenario = null
      this.#pauseRequested = false
      this.#resolvePausedRun()
    }
  }

  pause(): void {
    if (this.#controller === null || this.#status !== 'running') {
      return
    }

    this.#pauseRequested = true
  }

  resume(): void {
    this.#pauseRequested = false
    this.#resolvePausedRun()
  }

  stop(): void {
    if (this.#controller === null) {
      return
    }

    this.#status = 'stopped'
    this.#controller.abort('scenario stopped')
    this.#resolvePausedRun()
  }

  getSnapshot(): ScenarioRunSnapshot {
    return {
      scenario: this.#scenario,
      status: this.#status,
      currentStepIndex: this.#currentStepIndex,
    }
  }

  async #waitIfPaused(signal: AbortSignal): Promise<void> {
    if (!this.#pauseRequested) {
      return
    }

    this.#status = 'paused'
    this.#trace.appendEvent('scenario:pause', {
      currentStepIndex: this.#currentStepIndex,
    })

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        cleanup()
        reject(normalizeScenarioAbortReason(signal.reason))
      }
      const resume = () => {
        cleanup()
        resolve()
      }
      const cleanup = () => {
        signal.removeEventListener('abort', onAbort)

        if (this.#resumePausedRun === resume) {
          this.#resumePausedRun = null
        }
      }

      this.#resumePausedRun = resume
      signal.addEventListener('abort', onAbort, { once: true })

      if (!this.#pauseRequested) {
        resume()
      }
    })

    assertScenarioNotCancelled(signal)
    this.#status = 'running'
    this.#trace.appendEvent('scenario:resume', {
      currentStepIndex: this.#currentStepIndex,
    })
  }

  #executeStep(step: ScenarioStep, stepIndex: number, signal: AbortSignal): Promise<void> {
    if (!isScenarioStepRecord(step)) {
      throw unsupportedStepError(undefined, stepIndex)
    }

    switch (step.action) {
      case 'click':
        assertTarget(step.target, step.action, stepIndex)
        return this.#orchestrator.click(step.target, withSignal(step.options, signal))
      case 'typeInto':
        assertTarget(step.target, step.action, stepIndex)
        assertStringInput(step.input, step.action, stepIndex)
        return this.#orchestrator.typeInto(
          step.target,
          step.input,
          withSignal(step.options, signal),
        )
      case 'waitFor':
        assertWaitCondition(step.input, step.action, stepIndex)
        return this.#orchestrator
          .waitFor(step.input, withSignal(step.options, signal))
          .then(() => undefined)
      case 'delay':
        return notImplemented('Scenario Runner delay step')
      default:
        throw unsupportedStepError((step as Readonly<{ action?: unknown }>).action, stepIndex)
    }
  }

  #resolvePausedRun(): void {
    const resume = this.#resumePausedRun
    this.#resumePausedRun = null
    resume?.()
  }
}

export function createScenarioRunner(options: ScenarioRunnerOptions = {}): ScenarioRunner {
  return new BrowserScenarioRunner(options)
}

function normalizeDuration(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0
  }

  return duration
}

function linkExternalAbort(
  signal: RunOptions['signal'],
  controller: AbortController,
): () => void {
  if (signal === undefined) {
    return () => {}
  }

  const onAbort = () => {
    controller.abort(signal.reason)
  }

  if (signal.aborted) {
    onAbort()
    return () => {}
  }

  signal.addEventListener('abort', onAbort, { once: true })
  return () => {
    signal.removeEventListener('abort', onAbort)
  }
}

function assertScenarioNotCancelled(signal: AbortSignal): void {
  if (!signal.aborted) {
    return
  }

  throw normalizeScenarioAbortReason(signal.reason)
}

function normalizeScenarioAbortReason(reason: unknown): ActorbleError {
  if (reason instanceof ActorbleError && reason.code === 'ACTION_TIMEOUT') {
    return reason
  }

  return cancellationError('scenario.run', reason)
}

function normalizeScenarioError(error: unknown, signal: AbortSignal): ActorbleError {
  if (signal.aborted) {
    const reason = normalizeScenarioAbortReason(signal.reason)

    if (reason.code === 'ACTION_TIMEOUT') {
      return reason
    }

    if (error instanceof ActorbleError && error.code === 'ACTION_CANCELLED') {
      return reason
    }
  }

  if (error instanceof ActorbleError) {
    return error
  }

  return actorbleError('PLATFORM_UNSUPPORTED', 'Scenario run failed.', {
    cause: error,
  })
}

function raceWithScenarioSignal<TValue>(
  operation: Promise<TValue>,
  signal: AbortSignal,
): Promise<TValue> {
  if (signal.aborted) {
    return Promise.reject(normalizeScenarioAbortReason(signal.reason))
  }

  return new Promise<TValue>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(normalizeScenarioAbortReason(signal.reason))
    }
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
    }

    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        cleanup()
        resolve(value)
      },
      (error) => {
        cleanup()
        reject(error)
      },
    )
  })
}

function finishScenarioSpan(span: TraceSpanHandle, error: ActorbleError): void {
  if (error.code === 'ACTION_CANCELLED') {
    span.cancel(error.details?.reason)
    return
  }

  span.error(error)
}

function unsupportedStepError(action: unknown, stepIndex: number): ActorbleError {
  return actorbleError(
    'PLATFORM_UNSUPPORTED',
    `Scenario step action "${String(action)}" is not supported.`,
    {
      details: { action, stepIndex },
    },
  )
}

function assertTarget(
  target: TargetLike | undefined,
  action: string,
  stepIndex: number,
): asserts target is TargetLike {
  if (target !== undefined) {
    return
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', `Scenario step "${action}" requires a target.`, {
    details: { action, stepIndex, field: 'target' },
  })
}

function assertStringInput(
  input: unknown,
  action: string,
  stepIndex: number,
): asserts input is string {
  if (typeof input === 'string') {
    return
  }

  throw actorbleError('PLATFORM_UNSUPPORTED', `Scenario step "${action}" requires text input.`, {
    details: { action, stepIndex, field: 'input' },
  })
}

function assertWaitCondition(
  input: unknown,
  action: string,
  stepIndex: number,
): asserts input is WaitCondition {
  if (typeof input === 'object' && input !== null && 'kind' in input) {
    return
  }

  throw actorbleError(
    'PLATFORM_UNSUPPORTED',
    `Scenario step "${action}" requires a wait condition input.`,
    {
      details: { action, stepIndex, field: 'input' },
    },
  )
}

function withSignal<TOptions extends ClickOptions | TypeOptions | WaitOptions>(
  options: Omit<TOptions, 'signal'> | undefined,
  signal: AbortSignal,
): TOptions {
  return {
    ...(options ?? {}),
    signal,
  } as unknown as TOptions
}

function isScenarioStepRecord(step: unknown): step is ScenarioStep & { action?: unknown } {
  return typeof step === 'object' && step !== null && 'action' in step
}
