import { describe, expect, it, vi } from 'vitest'
import type { ActorbleFacadeOptions, TraceCollector } from '@actorble/browser'
import {
  createContentRuntimeHost,
  type ContentActorbleFacade,
} from '../src/entrypoints/content/runtime-host.js'
import { createExtensionMessage } from '../src/messaging/index.js'
import type {
  ActorbleExtensionMessage,
  RequiredRunCorrelation,
} from '../src/messaging/index.js'

const runCorrelation: RequiredRunCorrelation = {
  tabId: 7,
  frameId: 0,
  scenarioId: 'scenario-1',
  runId: 'run-1',
}

const compilation = {
  scenario: {
    id: 'scenario-1',
    steps: [{ action: 'delay', duration: 1 }],
  },
  runOptions: {
    timeout: 1_000,
    pacing: {
      betweenSteps: 5,
    },
  },
} as const

describe('content runtime host', () => {
  it('runs compiled scenarios through Actorble and emits terminal success status', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const actorble = createMockActorble()
    const host = createContentRuntimeHost({
      createActorble: vi.fn(() => actorble as unknown as ContentActorbleFacade),
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    const result = await host.handleMessage(createRunMessage())
    await flushAsyncRun()

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'scenario:run',
        ...runCorrelation,
        status: 'running',
      },
    })
    expect(actorble.run).toHaveBeenCalledWith(
      compilation.scenario,
      expect.objectContaining({
        timeout: 1_000,
        pacing: { betweenSteps: 5 },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      runtimeStatusMessage('completed'),
    ])
    expect(actorble.destroy).toHaveBeenCalledOnce()
  })

  it('creates page runtimes with debug feedback enabled', async () => {
    const actorble = createMockActorble()
    const createActorble = vi.fn(() => actorble as unknown as ContentActorbleFacade)
    const host = createContentRuntimeHost({
      createActorble,
      sendMessage: async () => {},
    })

    await host.handleMessage(createRunMessage())
    await flushAsyncRun()

    expect(createActorble).toHaveBeenCalledWith(
      expect.objectContaining({
        feedback: 'debug',
        motion: true,
        trace: expect.any(Object),
      }),
    )
  })

  it('emits failed status and cleans up when Actorble rejects a run', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const actorble = createMockActorble({
      run: vi.fn(async () => {
        throw new Error('Target not found')
      }),
    })
    const host = createContentRuntimeHost({
      createActorble: vi.fn(() => actorble as unknown as ContentActorbleFacade),
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    await flushAsyncRun()

    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      runtimeStatusMessage('failed', 'Target not found'),
    ])
    expect(actorble.destroy).toHaveBeenCalledOnce()
  })

  it('delegates pause, resume, and stop to the active Actorble run', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const run = deferred<void>()
    const actorble = createMockActorble({
      run: vi.fn(() => run.promise),
    })
    const host = createContentRuntimeHost({
      createActorble: vi.fn(() => actorble as unknown as ContentActorbleFacade),
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    await host.handleMessage(controlMessage('scenario:pause'))
    await host.handleMessage(controlMessage('scenario:resume'))
    await host.handleMessage(controlMessage('scenario:stop'))
    run.reject(new Error('scenario stopped'))
    await flushAsyncRun()

    expect(actorble.pause).toHaveBeenCalledOnce()
    expect(actorble.resume).toHaveBeenCalledOnce()
    expect(actorble.stop).toHaveBeenCalledOnce()
    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      runtimeStatusMessage('paused'),
      runtimeStatusMessage('running'),
      runtimeStatusMessage('stopped', 'Stopped by user.'),
    ])
    expect(actorble.destroy).toHaveBeenCalledOnce()
  })

  it('forwards runtime debug events as correlated trace events', async () => {
    const sent: ActorbleExtensionMessage[] = []
    let trace: TraceCollector | undefined
    const actorble = createMockActorble({
      run: vi.fn(async () => {
        trace?.appendEvent('scenario:start', { scenarioId: 'scenario-1' })
        const span = trace?.startSpan('action.click')
        span?.event('pointer:down', { button: 'primary' })
        span?.end({ completed: true })
      }),
    })
    const host = createContentRuntimeHost({
      createActorble: vi.fn((options) => {
        trace = options.trace
        return actorble as unknown as ContentActorbleFacade
      }),
      now: (() => {
        let current = 100
        return () => current++
      })(),
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    await flushAsyncRun()

    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      traceEventMessage('scenario:start', 100, {
        data: { scenarioId: 'scenario-1' },
      }),
      traceEventMessage('pointer:down', 102, {
        spanId: 'span-1',
        data: { button: 'primary' },
      }),
      runtimeStatusMessage('completed'),
    ])
  })

  it('rejects concurrent and stale run messages without touching the active Actorble run', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const run = deferred<void>()
    const actorble = createMockActorble({
      run: vi.fn(() => run.promise),
    })
    const host = createContentRuntimeHost({
      createActorble: vi.fn(() => actorble as unknown as ContentActorbleFacade),
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    const concurrent = await host.handleMessage(
      createRunMessage({ runId: 'run-2' }),
    )
    const staleControl = await host.handleMessage(
      controlMessage('scenario:pause', { runId: 'run-2' }),
    )
    run.resolve()
    await flushAsyncRun()

    expect(concurrent).toMatchObject({
      ok: false,
      issues: [{ code: 'runtime_error' }],
    })
    expect(staleControl).toMatchObject({
      ok: false,
      issues: [{ code: 'runtime_error' }],
    })
    expect(actorble.run).toHaveBeenCalledOnce()
    expect(actorble.pause).not.toHaveBeenCalled()
    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      runtimeStatusMessage('completed'),
    ])
  })

  it('uses a fresh Actorble instance after cleanup', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const firstActorble = createMockActorble()
    const secondActorble = createMockActorble()
    const createActorble = vi.fn(
      (_options: ActorbleFacadeOptions) =>
        firstActorble as unknown as ContentActorbleFacade,
    )

    createActorble
      .mockReturnValueOnce(firstActorble as unknown as ContentActorbleFacade)
      .mockReturnValueOnce(secondActorble as unknown as ContentActorbleFacade)
    const host = createContentRuntimeHost({
      createActorble,
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    await flushAsyncRun()
    await host.handleMessage(createRunMessage({ runId: 'run-2' }))
    await flushAsyncRun()

    expect(createActorble).toHaveBeenCalledTimes(2)
    expect(firstActorble.destroy).toHaveBeenCalledOnce()
    expect(secondActorble.destroy).toHaveBeenCalledOnce()
    expect(sent).toMatchObject([
      runtimeStatusMessage('running'),
      runtimeStatusMessage('completed'),
      runtimeStatusMessage('running', undefined, { runId: 'run-2' }),
      runtimeStatusMessage('completed', undefined, { runId: 'run-2' }),
    ])
  })

  it('attaches capabilities, fidelity, and full trace snapshots to runtime statuses', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const actorble = createMockActorble({
      getCapabilities: vi.fn(() => ({
        pointerInput: 'synthetic',
        trustedEvents: false,
      })),
      getFidelity: vi.fn(() => ({
        pointerInput: 'synthetic-dom-events',
        limits: ['Synthetic events are not browser-trusted user input.'],
      })),
      getTrace: vi.fn(() => ({
        spans: [
          {
            id: 'span-1',
            name: 'target.resolve',
            status: 'error',
            startedAt: 100,
            endedAt: 110,
            error: new Error('Target not found'),
          },
        ],
        events: [
          {
            name: 'surface:scrolled',
            at: 105,
            spanId: 'span-1',
            data: {
              action: 'scrollTo',
            },
          },
        ],
        snapshots: [
          {
            name: 'target.resolve.candidates',
            at: 104,
            data: {
              candidates: [],
            },
          },
        ],
        warnings: [],
      })),
    })
    const host = createContentRuntimeHost({
      createActorble: vi.fn(() => actorble as unknown as ContentActorbleFacade),
      now: () => 150,
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(createRunMessage())
    await flushAsyncRun()

    expect(sent[0]).toMatchObject({
      kind: 'runtime:status',
      payload: {
        status: 'running',
        debugSnapshot: {
          capturedAt: expect.any(Number),
          capabilities: {
            pointerInput: 'synthetic',
          },
          fidelity: {
            pointerInput: 'synthetic-dom-events',
          },
          trace: {
            spans: [
              {
                id: 'span-1',
                error: {
                  name: 'Error',
                  message: 'Target not found',
                },
              },
            ],
            snapshots: [
              {
                name: 'target.resolve.candidates',
              },
            ],
          },
        },
      },
    })
    expect(sent.at(-1)).toMatchObject({
      kind: 'runtime:status',
      payload: {
        status: 'completed',
        debugSnapshot: {
          trace: {
            events: [
              {
                name: 'surface:scrolled',
              },
            ],
          },
        },
      },
    })
  })
})

type MockActorble = Readonly<{
  run: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  resume: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  getCapabilities: ReturnType<typeof vi.fn>
  getFidelity: ReturnType<typeof vi.fn>
  getTrace: ReturnType<typeof vi.fn>
}>

function createMockActorble(overrides: Partial<MockActorble> = {}) {
  return {
    run: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    getCapabilities: vi.fn(() => ({})),
    getFidelity: vi.fn(() => ({})),
    getTrace: vi.fn(() => ({
      spans: [],
      events: [],
      snapshots: [],
      warnings: [],
    })),
    ...overrides,
  } as MockActorble
}

function createRunMessage(overrides: Partial<RequiredRunCorrelation> = {}) {
  return createExtensionMessage({
    kind: 'scenario:run',
    payload: {
      ...runCorrelation,
      ...overrides,
      compilation,
    },
  })
}

function controlMessage(
  kind: 'scenario:pause' | 'scenario:resume' | 'scenario:stop',
  overrides: Partial<RequiredRunCorrelation> = {},
) {
  return createExtensionMessage({
    kind,
    payload: {
      ...runCorrelation,
      ...overrides,
    },
  })
}

function runtimeStatusMessage(
  status: 'running' | 'paused' | 'stopped' | 'completed' | 'failed',
  message?: string,
  overrides: Partial<RequiredRunCorrelation> = {},
): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'runtime:status',
    payload: {
      ...runCorrelation,
      ...overrides,
      status,
      ...(message === undefined ? {} : { message }),
    },
  })
}

function traceEventMessage(
  name: string,
  timestamp: number,
  details: Readonly<Record<string, unknown>>,
): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'trace:event',
    payload: {
      ...runCorrelation,
      event: {
        runId: runCorrelation.runId,
        scenarioId: runCorrelation.scenarioId,
        timestamp,
        name,
        details,
      },
    },
  })
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

async function flushAsyncRun() {
  await Promise.resolve()
  await Promise.resolve()
}
