import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserLayoutInvalidationTracker } from '../src/targeting/layout-invalidation-tracker/index.js'
import { css } from '../src/shared/index.js'
import {
  BrowserWaitObservationEngine,
  createWaitObservationEngine,
} from '../src/runtime/wait-observation-engine/index.js'

function createTimeline(overrides = {}) {
  return {
    now: vi.fn(() => Date.now()),
    delay: vi.fn(async () => {}),
    nextFrame: vi.fn(async () => Date.now()),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn((operation) => operation),
    ...overrides,
  }
}

function traceClock() {
  return {
    now() {
      return Date.now()
    },
  }
}

describe('BrowserWaitObservationEngine', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('settles through the injected timeline strategies', async () => {
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.settle('none')).resolves.toBeNull()
    await expect(engine.settle('next-frame')).resolves.toBeNull()
    await expect(engine.settle()).resolves.toBeNull()

    expect(timeline.settle).toHaveBeenNthCalledWith(1, 'none', {})
    expect(timeline.settle).toHaveBeenNthCalledWith(2, 'next-frame', {})
    expect(timeline.settle).toHaveBeenNthCalledWith(3, 'settled', {})
  })

  it('resolves custom wait predicates immediately when already satisfied', async () => {
    const condition = { kind: 'custom', predicate: vi.fn(() => true) }
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'settled',
    })
    expect(condition.predicate).toHaveBeenCalledOnce()
    expect(timeline.settle).not.toHaveBeenCalled()
  })

  it('retries custom wait predicates after settled frames until satisfied', async () => {
    let ready = false
    const condition = { kind: 'custom', predicate: vi.fn(() => ready) }
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        ready = true
      }),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(condition.predicate).toHaveBeenCalledTimes(2)
    expect(timeline.settle).toHaveBeenCalledWith('settled', {})
  })

  it('records diagnostics context when a custom wait predicate times out', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const condition = { kind: 'custom', predicate: vi.fn(() => false) }
    const timeline = createTimeline({
      settle: vi.fn(() => new Promise(() => {})),
    })
    const trace = new BrowserDiagnosticsTrace({
      clock: traceClock(),
      idPrefix: 'trace',
    })
    const engine = new BrowserWaitObservationEngine({ timeline, trace })
    const promise = engine.waitFor(condition, { timeout: 25 })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'wait.for',
        timeout: 25,
        conditionKind: 'custom',
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    const snapshot = trace.getTrace()
    expect(snapshot.spans).toEqual([
      expect.objectContaining({
        name: 'wait.for',
        status: 'error',
        error: expect.objectContaining({ code: 'ACTION_TIMEOUT' }),
      }),
    ])
    expect(snapshot.events).toEqual([
      expect.objectContaining({ name: 'wait:start' }),
      expect.objectContaining({ name: 'wait:retry' }),
      expect.objectContaining({ name: 'wait:timeout' }),
    ])
  })

  it('cancels wait predicates before evaluating when the signal is aborted', async () => {
    const controller = new AbortController()
    const condition = { kind: 'custom', predicate: vi.fn(() => true) }
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    controller.abort('scenario stopped')

    await expect(engine.waitFor(condition, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'wait.for',
        reason: 'scenario stopped',
      },
    })
    expect(condition.predicate).not.toHaveBeenCalled()
  })

  it('reports unsupported declarative wait conditions explicitly', async () => {
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    await expect(engine.waitFor({ kind: 'visible', target: css('#save') })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        conditionKind: 'visible',
      },
    })
  })

  it('connects geometry invalidation reasons to the injected hook and diagnostics', () => {
    const onGeometryInvalidated = vi.fn()
    const trace = new BrowserDiagnosticsTrace({
      clock: traceClock(),
      idPrefix: 'trace',
    })
    const engine = new BrowserWaitObservationEngine({
      onGeometryInvalidated,
      timeline: createTimeline(),
      trace,
    })

    engine.invalidateGeometry('mutation')
    engine.invalidateGeometry('resize')
    engine.invalidateGeometry('scroll')

    expect(onGeometryInvalidated).toHaveBeenCalledTimes(3)
    expect(onGeometryInvalidated).toHaveBeenNthCalledWith(1, 'mutation')
    expect(onGeometryInvalidated).toHaveBeenNthCalledWith(2, 'resize')
    expect(onGeometryInvalidated).toHaveBeenNthCalledWith(3, 'scroll')
    expect(trace.getTrace().events).toEqual([
      expect.objectContaining({
        name: 'geometry:invalidate',
        data: expect.objectContaining({ reason: 'mutation' }),
      }),
      expect.objectContaining({
        name: 'geometry:invalidate',
        data: expect.objectContaining({ reason: 'resize' }),
      }),
      expect.objectContaining({
        name: 'geometry:invalidate',
        data: expect.objectContaining({ reason: 'scroll' }),
      }),
    ])
  })

  it('records coalesced runner layout invalidations during settle without failing', async () => {
    const onGeometryInvalidated = vi.fn()
    const trace = new BrowserDiagnosticsTrace({
      clock: traceClock(),
      idPrefix: 'trace',
    })
    let tracker
    const timeline = createTimeline({
      nextFrame: vi.fn(async () => 125),
      settle: vi.fn(async () => {
        tracker.markDirty('scroll')
        tracker.markDirty('resize')
        await Promise.resolve()
      }),
    })

    tracker = new BrowserLayoutInvalidationTracker({ timeline })
    const engine = new BrowserWaitObservationEngine({
      layoutInvalidation: tracker,
      onGeometryInvalidated,
      timeline,
      trace,
    })

    tracker.start()

    await expect(engine.settle('settled')).resolves.toBeNull()

    expect(onGeometryInvalidated).toHaveBeenCalledOnce()
    expect(onGeometryInvalidated).toHaveBeenCalledWith('scroll')
    expect(trace.getTrace().events).toContainEqual(
      expect.objectContaining({
        name: 'layout:invalidate',
        data: expect.objectContaining({
          reason: 'scroll',
          reasons: ['scroll', 'resize'],
          coalesced: 2,
        }),
      }),
    )
  })
})

describe('createWaitObservationEngine', () => {
  it('creates an injectable browser wait observation engine', async () => {
    const timeline = createTimeline()
    const engine = createWaitObservationEngine({ timeline })

    await expect(engine.settle('none')).resolves.toBeNull()
    expect(timeline.settle).toHaveBeenCalledWith('none', {})
  })
})
