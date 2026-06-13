import { BrowserActionOrchestrator } from '../action-orchestrator/index.js'
import { BrowserDiagnosticsTrace } from '../../diagnostics/diagnostics-trace/index.js'
import { BrowserTimelineEngine } from '../timeline-engine/index.js'
import {
  ActorbleError,
  actorbleError,
  cancellationError,
  timeoutError,
} from '../../shared/index.js'
import { BrowserLayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import type { ActionOrchestrator } from '../action-orchestrator/index.js'
import type { LayoutInvalidationTracker } from '../../targeting/layout-invalidation-tracker/index.js'
import type { SpanRecorder, TraceSpanHandle } from '../../diagnostics/diagnostics-trace/index.js'
import type {
  ClickOptions,
  RunOptions,
  Scenario,
  ScenarioDelayStep,
  ScenarioStep,
  TargetLike,
  TypeOptions,
  WaitCondition,
  WaitOptions,
} from '../../shared/index.js'
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
    const trace = options.trace ?? new BrowserDiagnosticsTrace()
    const timeline = options.timeline ?? new BrowserTimelineEngine()
    const layoutInvalidation =
      options.layoutInvalidation ?? new BrowserLayoutInvalidationTracker({ timeline })

    this.#layoutInvalidation = layoutInvalidation
    this.#orchestrator =
      options.orchestrator ??
      new BrowserActionOrchestrator({ layoutInvalidation, timeline, trace })
    this.#timeline = timeline
    this.#trace = trace
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
        await this.#executePacingDelay(
          options.pacing?.betweenSteps,
          index,
          scenario.steps.length,
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
        return this.#executeDelayStep(step, stepIndex, signal)
      default:
        throw unsupportedStepError((step as Readonly<{ action?: unknown }>).action, stepIndex)
    }
  }

  async #executeDelayStep(
    step: ScenarioDelayStep,
    stepIndex: number,
    signal: AbortSignal,
  ): Promise<void> {
    const span = this.#trace.startSpan(
      'scenario.step.delay',
      delayStepTraceAttributes(step, stepIndex),
    )

    try {
      assertPositiveDuration(step.duration, step.action, stepIndex)
      await raceWithScenarioSignal(this.#timeline.delay(step.duration, { signal }), signal)
      span.end({ completed: true })
    } catch (error) {
      const normalized = normalizeScenarioError(error, signal)

      finishStepSpan(span, normalized)
      throw normalized
    }
  }

  async #executePacingDelay(
    duration: number | undefined,
    stepIndex: number,
    stepCount: number,
    signal: AbortSignal,
  ): Promise<void> {
    if (stepIndex >= stepCount - 1 || !isPositiveFiniteDuration(duration)) {
      return
    }

    const span = this.#trace.startSpan(
      'scenario.pacing.delay',
      pacingDelayTraceAttributes(duration, stepIndex),
    )

    try {
      await raceWithScenarioSignal(this.#timeline.delay(duration, { signal }), signal)
      span.end({ completed: true })
    } catch (error) {
      const normalized = normalizeScenarioError(error, signal)

      finishStepSpan(span, normalized)
      throw normalized
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

function finishStepSpan(span: TraceSpanHandle, error: ActorbleError): void {
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

function assertPositiveDuration(
  duration: unknown,
  action: string,
  stepIndex: number,
): asserts duration is number {
  if (isPositiveFiniteDuration(duration)) {
    return
  }

  throw actorbleError(
    'PLATFORM_UNSUPPORTED',
    `Scenario step "${action}" requires a positive duration.`,
    {
      details: { action, stepIndex, field: 'duration' },
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

function isPositiveFiniteDuration(duration: unknown): duration is number {
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
}

function delayStepTraceAttributes(
  step: ScenarioDelayStep,
  stepIndex: number,
): Record<string, unknown> {
  return {
    action: step.action,
    stepIndex,
    ...(step.id === undefined ? {} : { stepId: step.id }),
    duration: step.duration,
    ...(step.reason === undefined ? {} : { reason: step.reason }),
  }
}

function pacingDelayTraceAttributes(
  duration: number,
  stepIndex: number,
): Record<string, unknown> {
  return {
    kind: 'run-pacing',
    stepIndex,
    nextStepIndex: stepIndex + 1,
    duration,
  }
}
