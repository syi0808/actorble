import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserScenarioRunner } from '../src/runtime/scenario-runner/index.js'
import { actorbleError, css } from '../src/shared/index.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

function createOrchestrator(overrides = {}) {
  return {
    moveTo: vi.fn(),
    click: vi.fn(async () => {}),
    clickCurrent: vi.fn(),
    doubleClick: vi.fn(),
    focus: vi.fn(),
    type: vi.fn(),
    typeInto: vi.fn(async () => {}),
    fill: vi.fn(),
    press: vi.fn(),
    scrollTo: vi.fn(),
    drag: vi.fn(),
    waitFor: vi.fn(async (condition) => ({ condition, satisfied: true, strategy: 'settled' })),
    geometry: vi.fn(),
    ...overrides,
  }
}

function createTimeline(overrides = {}) {
  return {
    now: vi.fn(() => 0),
    delay: vi.fn(async () => {}),
    nextFrame: vi.fn(async () => 0),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn((operation) => operation),
    ...overrides,
  }
}

function createLayoutInvalidationTracker(overrides = {}) {
  let running = false

  return {
    start: vi.fn(() => {
      running = true
    }),
    stop: vi.fn(() => {
      running = false
    }),
    isRunning: vi.fn(() => running),
    markDirty: vi.fn(),
    subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    dispose: vi.fn(),
    ...overrides,
  }
}

describe('BrowserScenarioRunner', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs typed scenario steps in order through the action orchestrator', async () => {
    const calls = []
    const orchestrator = createOrchestrator({
      click: vi.fn(async (target, options) => {
        calls.push(['click', target, options])
      }),
      typeInto: vi.fn(async (target, text, options) => {
        calls.push(['typeInto', target, text, options])
      }),
      waitFor: vi.fn(async (condition, options) => {
        calls.push(['waitFor', condition, options])
        return { condition, satisfied: true, strategy: 'settled' }
      }),
    })
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({ orchestrator, trace })
    const clickTarget = css('#save')
    const inputTarget = css('#name')
    const condition = { kind: 'custom', predicate: () => true }

    await expect(
      runner.run({
        id: 'create-project',
        steps: [
          { action: 'click', target: clickTarget, options: { timeout: 10 } },
          { action: 'typeInto', target: inputTarget, input: 'actorble' },
          { action: 'waitFor', input: condition, options: { timeout: 20 } },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      ['click', clickTarget, expect.objectContaining({ timeout: 10, signal: expect.any(AbortSignal) })],
      ['typeInto', inputTarget, 'actorble', expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['waitFor', condition, expect.objectContaining({ timeout: 20, signal: expect.any(AbortSignal) })],
    ])
    expect(runner.getSnapshot()).toEqual({
      scenario: null,
      status: 'completed',
      currentStepIndex: null,
    })
    expect(trace.getTrace().spans).toEqual([
      expect.objectContaining({
        name: 'scenario.run',
        status: 'ok',
        attributes: expect.objectContaining({
          scenarioId: 'create-project',
          steps: 3,
          completed: true,
        }),
      }),
    ])
  })

  it('starts layout invalidation only while a scenario run is active', async () => {
    const calls = []
    const layoutInvalidation = createLayoutInvalidationTracker({
      start: vi.fn(() => {
        calls.push('layout:start')
      }),
      stop: vi.fn(() => {
        calls.push('layout:stop')
      }),
    })
    const orchestrator = createOrchestrator({
      click: vi.fn(async () => {
        calls.push('click')
      }),
      waitFor: vi.fn(async () => {
        calls.push('waitFor')
        throw actorbleError('PLATFORM_UNSUPPORTED', 'wait failed')
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator, layoutInvalidation })

    await expect(
      runner.run({ steps: [{ action: 'click', target: css('#save') }] }),
    ).resolves.toBeUndefined()
    await expect(
      runner.run({ steps: [{ action: 'waitFor', input: { kind: 'custom', predicate: () => true } }] }),
    ).rejects.toMatchObject({ code: 'PLATFORM_UNSUPPORTED' })

    expect(calls).toEqual([
      'layout:start',
      'click',
      'layout:stop',
      'layout:start',
      'waitFor',
      'layout:stop',
    ])
    expect(layoutInvalidation.start).toHaveBeenCalledTimes(2)
    expect(layoutInvalidation.stop).toHaveBeenCalledTimes(2)
  })

  it('pauses at step boundaries and resumes before starting the next step', async () => {
    const firstStep = deferred()
    const calls = []
    const orchestrator = createOrchestrator({
      click: vi.fn(async () => {
        calls.push('click')
        runner.pause()
        firstStep.resolve()
      }),
      waitFor: vi.fn(async () => {
        calls.push('waitFor')
        return { condition: { kind: 'custom', predicate: () => true }, satisfied: true, strategy: 'settled' }
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run({
      steps: [
        { action: 'click', target: css('#save') },
        { action: 'waitFor', input: { kind: 'custom', predicate: () => true } },
      ],
    })

    await firstStep.promise

    expect(calls).toEqual(['click'])
    await vi.waitFor(() => {
      expect(runner.getSnapshot()).toMatchObject({
        status: 'paused',
        currentStepIndex: 1,
      })
    })

    runner.resume()

    await expect(run).resolves.toBeUndefined()
    expect(calls).toEqual(['click', 'waitFor'])
  })

  it('runs delay steps on the timeline between orchestrated actions and traces completion', async () => {
    const calls = []
    const clickTarget = css('#save')
    const condition = { kind: 'custom', predicate: () => true }
    const orchestrator = createOrchestrator({
      click: vi.fn(async (target, options) => {
        calls.push(['click', target, options])
      }),
      waitFor: vi.fn(async (input, options) => {
        calls.push(['waitFor', input, options])
        return { condition: input, satisfied: true, strategy: 'settled' }
      }),
    })
    const timeline = createTimeline({
      delay: vi.fn(async (duration, options) => {
        calls.push(['delay', duration, options])
      }),
    })
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({ orchestrator, timeline, trace })

    await expect(
      runner.run({
        id: 'delay-flow',
        steps: [
          { action: 'click', target: clickTarget },
          { id: 'settle-ui', action: 'delay', duration: 35, reason: 'let UI settle' },
          { action: 'waitFor', input: condition },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      ['click', clickTarget, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['delay', 35, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['waitFor', condition, expect.objectContaining({ signal: expect.any(AbortSignal) })],
    ])
    expect(orchestrator.click).toHaveBeenCalledOnce()
    expect(orchestrator.waitFor).toHaveBeenCalledOnce()

    const spans = trace.getTrace().spans
    const runSpan = spans.find((span) => span.name === 'scenario.run')
    const delaySpan = spans.find((span) => span.name === 'scenario.step.delay')

    expect(delaySpan).toEqual(
      expect.objectContaining({
        parentId: runSpan?.id,
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'delay',
          stepIndex: 1,
          stepId: 'settle-ui',
          duration: 35,
          reason: 'let UI settle',
          completed: true,
        }),
      }),
    )
  })

  it('applies run-level pacing between successful steps and skips the final step', async () => {
    const calls = []
    const clickTarget = css('#save')
    const inputTarget = css('#name')
    const condition = { kind: 'custom', predicate: () => true }
    const orchestrator = createOrchestrator({
      click: vi.fn(async (target, options) => {
        calls.push(['click', target, options])
      }),
      typeInto: vi.fn(async (target, input, options) => {
        calls.push(['typeInto', target, input, options])
      }),
      waitFor: vi.fn(async (input, options) => {
        calls.push(['waitFor', input, options])
        return { condition: input, satisfied: true, strategy: 'settled' }
      }),
    })
    const timeline = createTimeline({
      delay: vi.fn(async (duration, options) => {
        calls.push(['delay', duration, options])
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator, timeline })

    await expect(
      runner.run(
        {
          steps: [
            { action: 'click', target: clickTarget },
            { action: 'typeInto', target: inputTarget, input: 'actorble' },
            { action: 'waitFor', input: condition },
          ],
        },
        { pacing: { betweenSteps: 12 } },
      ),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      ['click', clickTarget, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['delay', 12, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      [
        'typeInto',
        inputTarget,
        'actorble',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ],
      ['delay', 12, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['waitFor', condition, expect.objectContaining({ signal: expect.any(AbortSignal) })],
    ])
    expect(timeline.delay).toHaveBeenCalledTimes(2)
  })

  it('treats missing or non-positive run-level pacing as no pacing', async () => {
    const values = [undefined, 0, -1, Number.POSITIVE_INFINITY, Number.NaN]

    for (const betweenSteps of values) {
      const timeline = createTimeline()
      const runner = new BrowserScenarioRunner({
        orchestrator: createOrchestrator(),
        timeline,
      })
      const options =
        betweenSteps === undefined ? undefined : { pacing: { betweenSteps } }

      await expect(
        runner.run(
          {
            steps: [
              { action: 'click', target: css('#save') },
              { action: 'waitFor', input: { kind: 'custom', predicate: () => true } },
            ],
          },
          options,
        ),
      ).resolves.toBeUndefined()
      expect(timeline.delay).not.toHaveBeenCalled()
    }
  })

  it('keeps explicit delay steps separate from run-level pacing in order and trace', async () => {
    const calls = []
    const clickTarget = css('#save')
    const condition = { kind: 'custom', predicate: () => true }
    const orchestrator = createOrchestrator({
      click: vi.fn(async (target, options) => {
        calls.push(['click', target, options])
      }),
      waitFor: vi.fn(async (input, options) => {
        calls.push(['waitFor', input, options])
        return { condition: input, satisfied: true, strategy: 'settled' }
      }),
    })
    const timeline = createTimeline({
      delay: vi.fn(async (duration, options) => {
        calls.push(['delay', duration, options])
      }),
    })
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({ orchestrator, timeline, trace })

    await expect(
      runner.run(
        {
          id: 'pacing-and-delay-flow',
          steps: [
            { action: 'click', target: clickTarget },
            { id: 'settle-ui', action: 'delay', duration: 35, reason: 'let UI settle' },
            { action: 'waitFor', input: condition },
          ],
        },
        { pacing: { betweenSteps: 7 } },
      ),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      ['click', clickTarget, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['delay', 7, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['delay', 35, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['delay', 7, expect.objectContaining({ signal: expect.any(AbortSignal) })],
      ['waitFor', condition, expect.objectContaining({ signal: expect.any(AbortSignal) })],
    ])

    const spans = trace.getTrace().spans
    const explicitDelaySpan = spans.find((span) => span.name === 'scenario.step.delay')
    const pacingSpans = spans.filter((span) => span.name === 'scenario.pacing.delay')

    expect(explicitDelaySpan).toEqual(
      expect.objectContaining({
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'delay',
          stepIndex: 1,
          duration: 35,
          completed: true,
        }),
      }),
    )
    expect(pacingSpans).toEqual([
      expect.objectContaining({
        status: 'ok',
        attributes: expect.objectContaining({
          kind: 'run-pacing',
          stepIndex: 0,
          nextStepIndex: 1,
          duration: 7,
          completed: true,
        }),
      }),
      expect.objectContaining({
        status: 'ok',
        attributes: expect.objectContaining({
          kind: 'run-pacing',
          stepIndex: 1,
          nextStepIndex: 2,
          duration: 7,
          completed: true,
        }),
      }),
    ])
  })

  it('rejects delay steps without a positive finite duration', async () => {
    const runner = new BrowserScenarioRunner({ orchestrator: createOrchestrator() })

    await expect(
      runner.run({
        steps: [{ action: 'delay', duration: 0 }],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { action: 'delay', stepIndex: 0, field: 'duration' },
    })
    expect(runner.getSnapshot()).toMatchObject({
      status: 'failed',
      currentStepIndex: null,
    })
  })

  it('pauses before a delay step and starts the timeline delay only after resume', async () => {
    const firstStep = deferred()
    const orchestrator = createOrchestrator({
      click: vi.fn(async () => {
        runner.pause()
        firstStep.resolve()
      }),
    })
    const timeline = createTimeline()
    const runner = new BrowserScenarioRunner({ orchestrator, timeline })
    const run = runner.run({
      steps: [
        { action: 'click', target: css('#save') },
        { action: 'delay', duration: 20 },
      ],
    })

    await firstStep.promise

    await vi.waitFor(() => {
      expect(runner.getSnapshot()).toMatchObject({
        status: 'paused',
        currentStepIndex: 1,
      })
    })
    expect(timeline.delay).not.toHaveBeenCalled()

    runner.resume()

    await expect(run).resolves.toBeUndefined()
    expect(timeline.delay).toHaveBeenCalledWith(20, {
      signal: expect.any(AbortSignal),
    })
  })

  it('stops an in-flight delay through the scenario abort signal', async () => {
    let delaySignal
    const timeline = createTimeline({
      delay: vi.fn((_duration, options) => {
        delaySignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'delay cancelled', {
                details: { operation: 'timeline.delay', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({
      orchestrator: createOrchestrator(),
      timeline,
      trace,
    })
    const run = runner.run({ steps: [{ action: 'delay', duration: 50 }] })

    await vi.waitFor(() => expect(delaySignal).toBeDefined())
    runner.stop()

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'scenario stopped' },
    })
    expect(delaySignal.aborted).toBe(true)
    expect(trace.getTrace().spans).toContainEqual(
      expect.objectContaining({
        name: 'scenario.step.delay',
        status: 'cancelled',
        attributes: expect.objectContaining({
          reason: 'scenario stopped',
        }),
      }),
    )
  })

  it('stops an in-flight pacing delay through the scenario abort signal', async () => {
    let pacingSignal
    const orchestrator = createOrchestrator({
      waitFor: vi.fn(async (condition) => ({ condition, satisfied: true, strategy: 'settled' })),
    })
    const timeline = createTimeline({
      delay: vi.fn((_duration, options) => {
        pacingSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'pacing cancelled', {
                details: { operation: 'timeline.delay', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({ orchestrator, timeline, trace })
    const run = runner.run(
      {
        steps: [
          { action: 'click', target: css('#save') },
          { action: 'waitFor', input: { kind: 'custom', predicate: () => true } },
        ],
      },
      { pacing: { betweenSteps: 50 } },
    )

    await vi.waitFor(() => expect(pacingSignal).toBeDefined())
    runner.stop()

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'scenario stopped' },
    })
    expect(pacingSignal.aborted).toBe(true)
    expect(trace.getTrace().spans).toContainEqual(
      expect.objectContaining({
        name: 'scenario.pacing.delay',
        status: 'cancelled',
        attributes: expect.objectContaining({
          kind: 'run-pacing',
          reason: 'scenario stopped',
        }),
      }),
    )
  })

  it('times out the scenario while a delay is in flight', async () => {
    vi.useFakeTimers()
    let delaySignal
    const timeline = createTimeline({
      delay: vi.fn((_duration, options) => {
        delaySignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'delay cancelled', {
                details: { operation: 'timeline.delay', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const runner = new BrowserScenarioRunner({
      orchestrator: createOrchestrator(),
      timeline,
    })
    const run = runner.run(
      { id: 'delay-timeout', steps: [{ action: 'delay', duration: 100 }] },
      { timeout: 25 },
    )
    await Promise.resolve()

    expect(delaySignal).toBeDefined()
    const expectation = expect(run).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'scenario.run',
        timeout: 25,
        scenarioId: 'delay-timeout',
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation
    expect(delaySignal.aborted).toBe(true)
  })

  it('times out the scenario while a pacing delay is in flight', async () => {
    let pacingSignal
    const timeline = createTimeline({
      delay: vi.fn((_duration, options) => {
        pacingSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'pacing cancelled', {
                details: { operation: 'timeline.delay', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const runner = new BrowserScenarioRunner({
      orchestrator: createOrchestrator(),
      timeline,
    })
    const run = runner.run(
      {
        id: 'pacing-timeout',
        steps: [
          { action: 'click', target: css('#save') },
          { action: 'waitFor', input: { kind: 'custom', predicate: () => true } },
        ],
      },
      { timeout: 25, pacing: { betweenSteps: 100 } },
    )
    const expectation = expect(run).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'scenario.run',
        timeout: 25,
        scenarioId: 'pacing-timeout',
      },
    })

    await vi.waitFor(() => expect(pacingSignal).toBeDefined())
    await expectation
    expect(pacingSignal.aborted).toBe(true)
  })

  it('cancels an in-flight delay when the external run signal aborts', async () => {
    const controller = new AbortController()
    let delaySignal
    const timeline = createTimeline({
      delay: vi.fn((_duration, options) => {
        delaySignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'delay cancelled', {
                details: { operation: 'timeline.delay', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const runner = new BrowserScenarioRunner({
      orchestrator: createOrchestrator(),
      timeline,
    })
    const run = runner.run(
      { steps: [{ action: 'delay', duration: 50 }] },
      { signal: controller.signal },
    )

    await vi.waitFor(() => expect(delaySignal).toBeDefined())
    controller.abort('external stop')

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'external stop' },
    })
    expect(delaySignal.aborted).toBe(true)
  })

  it('stops an in-flight scenario by aborting the current action signal', async () => {
    let actionSignal
    const orchestrator = createOrchestrator({
      click: vi.fn((_target, options) => {
        actionSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'click cancelled', {
                details: { operation: 'click', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const layoutInvalidation = createLayoutInvalidationTracker()
    const runner = new BrowserScenarioRunner({ orchestrator, layoutInvalidation })
    const run = runner.run({ steps: [{ action: 'click', target: css('#save') }] })

    await vi.waitFor(() => expect(actionSignal).toBeDefined())
    runner.stop()

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'scenario stopped' },
    })
    expect(actionSignal.aborted).toBe(true)
    expect(runner.getSnapshot()).toMatchObject({
      status: 'stopped',
      currentStepIndex: null,
    })
    expect(layoutInvalidation.stop).toHaveBeenCalledOnce()
  })

  it('times out the scenario and aborts the current action signal even when the action does not settle', async () => {
    vi.useFakeTimers()
    let actionSignal
    const orchestrator = createOrchestrator({
      click: vi.fn((_target, options) => {
        actionSignal = options.signal
        return new Promise(() => {})
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run(
      { id: 'timeout-case', steps: [{ action: 'click', target: css('#save') }] },
      { timeout: 25 },
    )
    await Promise.resolve()

    expect(actionSignal).toBeDefined()
    const expectation = expect(run).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'scenario.run',
        timeout: 25,
        scenarioId: 'timeout-case',
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    expect(actionSignal.aborted).toBe(true)
    expect(actionSignal.reason).toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: { operation: 'scenario.run', timeout: 25 },
    })
    expect(runner.getSnapshot()).toMatchObject({
      status: 'failed',
      currentStepIndex: null,
    })
  })

  it('fails unsupported runtime step shapes with an Actorble error', async () => {
    const runner = new BrowserScenarioRunner({ orchestrator: createOrchestrator() })

    await expect(
      runner.run({
        steps: [{ action: 'resolve', target: css('#save') }],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { action: 'resolve', stepIndex: 0 },
    })
    expect(runner.getSnapshot()).toMatchObject({
      status: 'failed',
      currentStepIndex: null,
    })
  })
})
