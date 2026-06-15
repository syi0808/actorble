import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserActionOrchestrator } from '../src/runtime/action-orchestrator/index.js'
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
      focus: vi.fn(async (target, options) => {
        calls.push(['focus', target, options])
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
    const focusTarget = css('#name')
    const inputTarget = css('#name')
    const condition = { kind: 'custom', predicate: () => true }

    await expect(
      runner.run({
        id: 'create-project',
        steps: [
          { action: 'click', target: clickTarget, options: { timeout: 10 } },
          { action: 'focus', target: focusTarget, options: { timeout: 15, focusVisible: true } },
          { action: 'typeInto', target: inputTarget, input: 'actorble' },
          { action: 'waitFor', input: condition, options: { timeout: 20 } },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      ['click', clickTarget, expect.objectContaining({ timeout: 10, signal: expect.any(AbortSignal) })],
      [
        'focus',
        focusTarget,
        expect.objectContaining({
          timeout: 15,
          focusVisible: true,
          signal: expect.any(AbortSignal),
        }),
      ],
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
          steps: 4,
          completed: true,
        }),
      }),
    ])
  })

  it('runs type, fill, and press scenario steps in order through the action orchestrator', async () => {
    const calls = []
    const fillTarget = css('#name')
    const orchestrator = createOrchestrator({
      type: vi.fn(async (input, options) => {
        calls.push(['type', input, options])
      }),
      fill: vi.fn(async (target, input, options) => {
        calls.push(['fill', target, input, options])
      }),
      press: vi.fn(async (input, options) => {
        calls.push(['press', input, options])
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })

    await expect(
      runner.run({
        steps: [
          { action: 'type', input: 'alpha', options: { timeout: 10, delay: 1 } },
          { action: 'fill', target: fillTarget, input: 'bravo', options: { timeout: 20, clear: false } },
          { action: 'press', input: 'Shift+K', options: { timeout: 30, delay: 2 } },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      [
        'type',
        'alpha',
        expect.objectContaining({
          timeout: 10,
          delay: 1,
          signal: expect.any(AbortSignal),
        }),
      ],
      [
        'fill',
        fillTarget,
        'bravo',
        expect.objectContaining({
          timeout: 20,
          clear: false,
          signal: expect.any(AbortSignal),
        }),
      ],
      [
        'press',
        'Shift+K',
        expect.objectContaining({
          timeout: 30,
          delay: 2,
          signal: expect.any(AbortSignal),
        }),
      ],
    ])
  })

  it('runs target and position scrollTo scenario steps through the action orchestrator', async () => {
    const calls = []
    const target = css('#panel')
    const position = { x: 10, y: 20, coordinateSpace: 'document' }
    const orchestrator = createOrchestrator({
      scrollTo: vi.fn(async (targetOrPosition, options) => {
        calls.push(['scrollTo', targetOrPosition, options])
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })

    await expect(
      runner.run({
        steps: [
          { action: 'scrollTo', target, options: { timeout: 10, behavior: 'instant' } },
          { action: 'scrollTo', input: position, options: { timeout: 20, behavior: 'smooth' } },
        ],
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      [
        'scrollTo',
        target,
        expect.objectContaining({
          timeout: 10,
          behavior: 'instant',
          signal: expect.any(AbortSignal),
        }),
      ],
      [
        'scrollTo',
        position,
        expect.objectContaining({
          timeout: 20,
          behavior: 'smooth',
          signal: expect.any(AbortSignal),
        }),
      ],
    ])
  })

  it('adds scenario step context to unsupported scrollTo coordinate failures', async () => {
    const position = { x: 10, y: 20, coordinateSpace: 'screen' }
    const orchestrator = createOrchestrator({
      scrollTo: vi.fn(async () => {
        throw actorbleError(
          'PLATFORM_UNSUPPORTED',
          'Scroll position coordinate space screen is not supported.',
          {
            details: {
              action: 'scrollTo',
              coordinateSpace: 'screen',
              supportedCoordinateSpaces: ['viewport', 'document'],
            },
          },
        )
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })

    await expect(
      runner.run({
        steps: [{ action: 'scrollTo', input: position }],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        action: 'scrollTo',
        stepIndex: 0,
        coordinateSpace: 'screen',
      },
    })
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

  it('stops an in-flight focus step through the scenario abort signal', async () => {
    let focusSignal
    const orchestrator = createOrchestrator({
      focus: vi.fn((_target, options) => {
        focusSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'focus cancelled', {
                details: { operation: 'focus', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run({ steps: [{ action: 'focus', target: css('#name') }] })
    run.catch(() => {})

    await vi.waitFor(() => expect(focusSignal).toBeDefined())
    runner.stop()

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'scenario stopped' },
    })
    expect(focusSignal.aborted).toBe(true)
    expect(orchestrator.focus).toHaveBeenCalledWith(
      css('#name'),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('stops an in-flight scrollTo step through the scenario abort signal', async () => {
    let scrollSignal
    const target = css('#panel')
    const orchestrator = createOrchestrator({
      scrollTo: vi.fn((_targetOrPosition, options) => {
        scrollSignal = options.signal
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => {
              reject(actorbleError('ACTION_CANCELLED', 'scroll cancelled', {
                details: { operation: 'scrollTo', reason: options.signal.reason },
              }))
            },
            { once: true },
          )
        })
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run({ steps: [{ action: 'scrollTo', target }] })
    run.catch(() => {})

    await vi.waitFor(() => expect(scrollSignal).toBeDefined())
    runner.stop()

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'scenario stopped' },
    })
    expect(scrollSignal.aborted).toBe(true)
    expect(orchestrator.scrollTo).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('cancels an in-flight scrollTo step when the external run signal aborts', async () => {
    const controller = new AbortController()
    let scrollSignal
    const position = { x: 10, y: 20 }
    const orchestrator = createOrchestrator({
      scrollTo: vi.fn((_targetOrPosition, options) => {
        scrollSignal = options.signal
        return new Promise(() => {})
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run(
      { steps: [{ action: 'scrollTo', input: position }] },
      { signal: controller.signal },
    )
    run.catch(() => {})

    await vi.waitFor(() => expect(scrollSignal).toBeDefined())
    controller.abort('external stop')

    await expect(run).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'scenario.run', reason: 'external stop' },
    })
    expect(scrollSignal.aborted).toBe(true)
  })

  it('times out an in-flight scrollTo step through the scenario abort signal', async () => {
    vi.useFakeTimers()

    let scrollSignal
    const orchestrator = createOrchestrator({
      scrollTo: vi.fn((_targetOrPosition, options) => {
        scrollSignal = options.signal
        return new Promise(() => {})
      }),
    })
    const runner = new BrowserScenarioRunner({ orchestrator })
    const run = runner.run(
      { id: 'scrollTo-timeout', steps: [{ action: 'scrollTo', input: { x: 10, y: 20 } }] },
      { timeout: 25 },
    )
    run.catch(() => {})

    await Promise.resolve()
    expect(scrollSignal).toBeDefined()
    const expectation = expect(run).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'scenario.run',
        timeout: 25,
        scenarioId: 'scrollTo-timeout',
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation
    expect(scrollSignal.aborted).toBe(true)
  })

  it('stops in-flight type, fill, and press steps through the scenario abort signal', async () => {
    const cases = [
      {
        action: 'type',
        step: { action: 'type', input: 'alpha' },
        override(signalRef) {
          return {
            type: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise((_resolve, reject) => {
                options.signal.addEventListener(
                  'abort',
                  () => {
                    reject(actorbleError('ACTION_CANCELLED', 'type cancelled', {
                      details: { operation: 'type', reason: options.signal.reason },
                    }))
                  },
                  { once: true },
                )
              })
            }),
          }
        },
      },
      {
        action: 'fill',
        step: { action: 'fill', target: css('#name'), input: 'bravo' },
        override(signalRef) {
          return {
            fill: vi.fn((_target, _input, options) => {
              signalRef.current = options.signal
              return new Promise((_resolve, reject) => {
                options.signal.addEventListener(
                  'abort',
                  () => {
                    reject(actorbleError('ACTION_CANCELLED', 'fill cancelled', {
                      details: { operation: 'fill', reason: options.signal.reason },
                    }))
                  },
                  { once: true },
                )
              })
            }),
          }
        },
      },
      {
        action: 'press',
        step: { action: 'press', input: 'Enter' },
        override(signalRef) {
          return {
            press: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise((_resolve, reject) => {
                options.signal.addEventListener(
                  'abort',
                  () => {
                    reject(actorbleError('ACTION_CANCELLED', 'press cancelled', {
                      details: { operation: 'press', reason: options.signal.reason },
                    }))
                  },
                  { once: true },
                )
              })
            }),
          }
        },
      },
    ]

    for (const testCase of cases) {
      const signalRef = { current: undefined }
      const orchestrator = createOrchestrator(testCase.override(signalRef))
      const runner = new BrowserScenarioRunner({ orchestrator })
      const run = runner.run({ steps: [testCase.step] })
      run.catch(() => {})

      await vi.waitFor(() => expect(signalRef.current).toBeDefined())
      runner.stop()

      await expect(run).rejects.toMatchObject({
        code: 'ACTION_CANCELLED',
        details: { operation: 'scenario.run', reason: 'scenario stopped' },
      })
      expect(signalRef.current.aborted).toBe(true)
      expect(orchestrator[testCase.action]).toHaveBeenCalledOnce()
    }
  })

  it('cancels in-flight type, fill, and press steps when the external run signal aborts', async () => {
    const cases = [
      {
        action: 'type',
        step: { action: 'type', input: 'alpha' },
        override(signalRef) {
          return {
            type: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
      {
        action: 'fill',
        step: { action: 'fill', target: css('#name'), input: 'bravo' },
        override(signalRef) {
          return {
            fill: vi.fn((_target, _input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
      {
        action: 'press',
        step: { action: 'press', input: 'Enter' },
        override(signalRef) {
          return {
            press: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
    ]

    for (const testCase of cases) {
      const signalRef = { current: undefined }
      const controller = new AbortController()
      const orchestrator = createOrchestrator(testCase.override(signalRef))
      const runner = new BrowserScenarioRunner({ orchestrator })
      const run = runner.run({ steps: [testCase.step] }, { signal: controller.signal })
      run.catch(() => {})

      await vi.waitFor(() => expect(signalRef.current).toBeDefined())
      controller.abort('external stop')

      await expect(run).rejects.toMatchObject({
        code: 'ACTION_CANCELLED',
        details: { operation: 'scenario.run', reason: 'external stop' },
      })
      expect(signalRef.current.aborted).toBe(true)
      expect(orchestrator[testCase.action]).toHaveBeenCalledOnce()
    }
  })

  it('times out in-flight type, fill, and press steps through the scenario abort signal', async () => {
    vi.useFakeTimers()

    const cases = [
      {
        action: 'type',
        step: { action: 'type', input: 'alpha' },
        override(signalRef) {
          return {
            type: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
      {
        action: 'fill',
        step: { action: 'fill', target: css('#name'), input: 'bravo' },
        override(signalRef) {
          return {
            fill: vi.fn((_target, _input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
      {
        action: 'press',
        step: { action: 'press', input: 'Enter' },
        override(signalRef) {
          return {
            press: vi.fn((_input, options) => {
              signalRef.current = options.signal
              return new Promise(() => {})
            }),
          }
        },
      },
    ]

    for (const testCase of cases) {
      const signalRef = { current: undefined }
      const orchestrator = createOrchestrator(testCase.override(signalRef))
      const runner = new BrowserScenarioRunner({ orchestrator })
      const run = runner.run(
        { id: `${testCase.action}-timeout`, steps: [testCase.step] },
        { timeout: 25 },
      )
      run.catch(() => {})

      await Promise.resolve()
      expect(signalRef.current).toBeDefined()
      const expectation = expect(run).rejects.toMatchObject({
        code: 'ACTION_TIMEOUT',
        details: {
          operation: 'scenario.run',
          timeout: 25,
          scenarioId: `${testCase.action}-timeout`,
        },
      })

      await vi.advanceTimersByTimeAsync(25)
      await expectation
      expect(signalRef.current.aborted).toBe(true)
      expect(orchestrator[testCase.action]).toHaveBeenCalledOnce()
    }
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

  it('rejects focus steps without a target', async () => {
    const runner = new BrowserScenarioRunner({ orchestrator: createOrchestrator() })

    await expect(
      runner.run({
        steps: [{ action: 'focus' }],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { action: 'focus', stepIndex: 0, field: 'target' },
    })
    expect(runner.getSnapshot()).toMatchObject({
      status: 'failed',
      currentStepIndex: null,
    })
  })

  it('rejects type, fill, and press steps with missing required input or target', async () => {
    const cases = [
      {
        step: { action: 'type' },
        details: { action: 'type', stepIndex: 0, field: 'input' },
      },
      {
        step: { action: 'fill', input: 'bravo' },
        details: { action: 'fill', stepIndex: 0, field: 'target' },
      },
      {
        step: { action: 'fill', target: css('#name'), input: 42 },
        details: { action: 'fill', stepIndex: 0, field: 'input' },
      },
      {
        step: { action: 'press', input: ['Enter'] },
        details: { action: 'press', stepIndex: 0, field: 'input' },
      },
    ]

    for (const testCase of cases) {
      const runner = new BrowserScenarioRunner({ orchestrator: createOrchestrator() })

      await expect(
        runner.run({ steps: [testCase.step] }),
      ).rejects.toMatchObject({
        code: 'PLATFORM_UNSUPPORTED',
        details: testCase.details,
      })
      expect(runner.getSnapshot()).toMatchObject({
        status: 'failed',
        currentStepIndex: null,
      })
    }
  })

  it('rejects malformed scrollTo steps with action and step details', async () => {
    const cases = [
      {
        step: { action: 'scrollTo' },
        details: { action: 'scrollTo', stepIndex: 0, field: 'targetOrPosition' },
      },
      {
        step: { action: 'scrollTo', target: css('#panel'), input: { x: 1, y: 2 } },
        details: { action: 'scrollTo', stepIndex: 0, field: 'targetOrPosition' },
      },
      {
        step: { action: 'scrollTo', input: { x: '1', y: 2 } },
        details: { action: 'scrollTo', stepIndex: 0, field: 'input.x' },
      },
      {
        step: { action: 'scrollTo', input: { x: 1, y: Number.POSITIVE_INFINITY } },
        details: { action: 'scrollTo', stepIndex: 0, field: 'input.y' },
      },
    ]

    for (const testCase of cases) {
      const runner = new BrowserScenarioRunner({ orchestrator: createOrchestrator() })

      await expect(
        runner.run({ steps: [testCase.step] }),
      ).rejects.toMatchObject({
        code: 'PLATFORM_UNSUPPORTED',
        details: testCase.details,
      })
      expect(runner.getSnapshot()).toMatchObject({
        status: 'failed',
        currentStepIndex: null,
      })
    }
  })

  it('records action spans with input summaries for real scenario text and keyboard steps', async () => {
    document.body.innerHTML = ''

    const input = document.createElement('input')
    input.id = 'scenario-name'
    input.scrollIntoView = vi.fn()
    input.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 160,
      height: 24,
      top: 20,
      left: 10,
      right: 170,
      bottom: 44,
      toJSON: () => {},
    }))
    document.body.append(input)
    document.elementFromPoint = vi.fn(() => input)
    input.focus()

    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const runner = new BrowserScenarioRunner({ trace })

    await expect(
      runner.run({
        steps: [
          { action: 'type', input: 'A', options: { delay: 0 } },
          { action: 'fill', target: css('#scenario-name'), input: 'Actorble' },
          { action: 'press', input: 'Enter', options: { delay: 0 } },
        ],
      }),
    ).resolves.toBeUndefined()

    const spans = trace.getTrace().spans

    expect(input.value).toBe('Actorble')
    expect(spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'action.type',
          status: 'ok',
          attributes: expect.objectContaining({
            action: 'type',
            input: expect.objectContaining({
              options: expect.objectContaining({
                delay: 0,
                textLength: 1,
              }),
            }),
          }),
        }),
        expect.objectContaining({
          name: 'action.fill',
          status: 'ok',
          attributes: expect.objectContaining({
            action: 'fill',
            input: expect.objectContaining({
              target: expect.objectContaining({
                kind: 'locator',
                locatorKind: 'css',
              }),
              options: expect.objectContaining({
                textLength: 8,
              }),
            }),
          }),
        }),
        expect.objectContaining({
          name: 'action.press',
          status: 'ok',
          attributes: expect.objectContaining({
            action: 'press',
            input: expect.objectContaining({
              options: expect.objectContaining({
                delay: 0,
                keys: 'Enter',
              }),
            }),
          }),
        }),
      ]),
    )
  })

  it('records the action failure phase when a scenario press step fails', async () => {
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'scenario' })
    const keyboard = {
      getState: vi.fn(() => ({ pressedKeys: [], modifiers: [] })),
      keyDown: vi.fn(),
      keyUp: vi.fn(async () => ({ pressedKeys: [], modifiers: [] })),
      press: vi.fn(async () => {
        throw new Error('keyboard failed')
      }),
    }
    const orchestrator = new BrowserActionOrchestrator({ keyboard, trace })
    const runner = new BrowserScenarioRunner({ orchestrator, trace })

    await expect(
      runner.run({
        steps: [{ action: 'press', input: 'Enter' }],
      }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        action: 'press',
        phase: 'perform',
      },
    })

    expect(trace.getTrace().spans).toContainEqual(
      expect.objectContaining({
        name: 'action.press',
        status: 'error',
        attributes: expect.objectContaining({
          action: 'press',
          phase: 'perform',
          input: expect.objectContaining({
            options: expect.objectContaining({
              keys: 'Enter',
            }),
          }),
        }),
      }),
    )
    expect(trace.getTrace().events).toContainEqual(
      expect.objectContaining({
        name: 'action:failure',
        data: expect.objectContaining({
          action: 'press',
          phase: 'perform',
        }),
      }),
    )
  })
})
