import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserLayoutInvalidationTracker } from '../src/targeting/layout-invalidation-tracker/index.js'
import { actorbleError, css } from '../src/shared/index.js'
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

function targetHandle(element, overrides = {}) {
  return {
    id: 'target-1',
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {
      selector: element.id ? `#${element.id}` : undefined,
      description: element.tagName.toLowerCase(),
    },
    ...overrides,
  }
}

function geometryFor(target) {
  return {
    target,
    rect: { x: 10, y: 20, width: 100, height: 40 },
    visibleRect: { x: 10, y: 20, width: 100, height: 40 },
    center: { x: 60, y: 40 },
    clickablePoint: {
      ok: true,
      point: { x: 60, y: 40 },
      strategy: 'center',
    },
    coordinateSpace: 'viewport',
    computedAt: 1000,
  }
}

function interactabilityReportFor(target, overrides = {}) {
  return {
    target,
    visible: true,
    visibilityRatio: 1,
    enabled: true,
    editable: false,
    focusable: false,
    receivesPointerEvents: true,
    canClick: true,
    canFocus: false,
    canType: false,
    blockingReasons: [],
    forceBypassedReasons: [],
    unforceableReasons: [],
    ...overrides,
  }
}

function createObservationPorts(target, options = {}) {
  const geometry = geometryFor(target)
  const reports = [...(options.reports ?? [interactabilityReportFor(target)])]

  return {
    resolver: {
      resolve: vi.fn(async () => target),
      resolveAll: vi.fn(async () => [target]),
      exists: vi.fn(async () => true),
      inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
      validate: vi.fn(async () => target),
      ...options.resolver,
    },
    geometry: {
      snapshot: vi.fn(async () => geometry),
      getBoundingRect: vi.fn(() => geometry.rect),
      getVisibleRect: vi.fn(() => geometry.visibleRect),
      getCenter: vi.fn(() => geometry.center),
      getClickablePoint: vi.fn(() => geometry.clickablePoint),
      ...options.geometry,
    },
    interactability: {
      inspect: vi.fn(async () => reports.shift() ?? reports.at(-1) ?? interactabilityReportFor(target)),
      canClick: vi.fn(),
      canFocus: vi.fn(),
      canType: vi.fn(),
      ...options.interactability,
    },
  }
}

function createManualLayoutInvalidationTracker({ running = true } = {}) {
  const listeners = []

  return {
    tracker: {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn(() => running),
      markDirty: vi.fn(),
      subscribe: vi.fn((listener) => {
        listeners.push(listener)

        return {
          dispose() {
            const index = listeners.indexOf(listener)

            if (index >= 0) {
              listeners.splice(index, 1)
            }
          },
        }
      }),
      dispose: vi.fn(),
    },
    emit(reason = 'mutation') {
      for (const listener of [...listeners]) {
        listener({
          reason,
          reasons: [reason],
          at: Date.now(),
          coalesced: 1,
        })
      }
    },
  }
}

describe('BrowserWaitObservationEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

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

  it('resolves text waits immediately when root text already matches', async () => {
    document.body.innerHTML = '<main>Project   created</main>'
    const condition = { kind: 'text', value: 'Project created' }
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'settled',
    })
    expect(timeline.settle).not.toHaveBeenCalled()
  })

  it('retries text waits until root text appears', async () => {
    document.body.innerHTML = '<main>Loading</main>'
    const condition = { kind: 'text', value: 'Project created' }
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        document.body.innerHTML = '<main>Project created</main>'
      }),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(timeline.settle).toHaveBeenCalledOnce()
  })

  it('matches text waits with stateful regular expressions from the beginning each attempt', async () => {
    document.body.innerHTML = '<main>Project created</main>'
    const value = /Project created/g
    value.lastIndex = 100
    const condition = { kind: 'text', value }
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(timeline.settle).not.toHaveBeenCalled()
  })

  it('records timeout diagnostics for text waits with the last root observation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    document.body.innerHTML = '<main>Loading</main>'
    const condition = { kind: 'text', value: 'Project created' }
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
        conditionKind: 'text',
        attempts: 1,
        condition: {
          kind: 'text',
          value: 'Project created',
        },
        lastObservation: expect.objectContaining({
          scope: 'root',
          root: 'document',
          matched: false,
          textLength: 'Loading'.length,
        }),
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    expect(trace.getTrace().events).toEqual([
      expect.objectContaining({ name: 'wait:start' }),
      expect.objectContaining({
        name: 'wait:retry',
        data: expect.objectContaining({
          attempts: 1,
          observation: expect.objectContaining({ scope: 'root', matched: false }),
        }),
      }),
      expect.objectContaining({
        name: 'wait:timeout',
        data: expect.objectContaining({
          conditionKind: 'text',
          attempts: 1,
          lastObservation: expect.objectContaining({ scope: 'root', matched: false }),
        }),
      }),
    ])
  })

  it('cancels in-progress text waits with attempt diagnostics', async () => {
    document.body.innerHTML = '<main>Loading</main>'
    const controller = new AbortController()
    let settleSignal
    const timeline = createTimeline({
      settle: vi.fn(
        (_strategy, options) =>
          new Promise((_, reject) => {
            settleSignal = options.signal
            options.signal?.addEventListener(
              'abort',
              () => {
                reject(
                  actorbleError('ACTION_CANCELLED', 'wait settle was cancelled.', {
                    details: { operation: 'wait.settle', reason: options.signal.reason },
                  }),
                )
              },
              { once: true },
            )
          }),
      ),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })
    const promise = engine.waitFor(
      { kind: 'text', value: 'Project created' },
      { signal: controller.signal },
    )

    await vi.waitFor(() => expect(settleSignal).toBeDefined())
    controller.abort('scenario stopped')

    await expect(promise).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'wait.for',
        reason: 'scenario stopped',
        conditionKind: 'text',
        attempts: 1,
        lastObservation: expect.objectContaining({
          scope: 'root',
          matched: false,
        }),
      },
    })
    expect(timeline.settle).toHaveBeenCalledOnce()
  })

  it('reports target-scoped text waits as an explicit extension point', async () => {
    const condition = { kind: 'text', value: 'Saved', target: css('#status') }
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    await expect(engine.waitFor(condition)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        conditionKind: 'text',
        capability: 'target-scoped-text-wait',
        supportedScope: 'root',
        extensionPoint: 'wait-observation-engine.target-text',
        condition: expect.objectContaining({
          kind: 'text',
          scope: 'target',
          target: expect.objectContaining({ kind: 'css', selector: '#status' }),
        }),
      },
    })
  })

  it('resolves and validates visible targets before inspecting visual visibility', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    const timeline = createTimeline()
    const ports = createObservationPorts(target)
    const engine = new BrowserWaitObservationEngine({ timeline, ...ports })
    const condition = { kind: 'visible', target: css('#save') }

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'settled',
    })

    expect(ports.resolver.resolve).toHaveBeenCalledWith(css('#save'), {})
    expect(ports.resolver.validate).toHaveBeenCalledWith(target)
    expect(ports.geometry.snapshot).toHaveBeenCalledWith(target)
    expect(ports.interactability.inspect).toHaveBeenCalledWith(target, geometryFor(target))
    expect(timeline.settle).not.toHaveBeenCalled()
  })

  it('retries visible waits across not-found and hidden observations until visible', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    let resolveAttempts = 0
    const hiddenReport = interactabilityReportFor(target, {
      visible: false,
      visibilityRatio: 0,
      blockingReasons: ['not-visible'],
    })
    const visibleReport = interactabilityReportFor(target)
    const ports = createObservationPorts(target, {
      reports: [hiddenReport, visibleReport],
      resolver: {
        resolve: vi.fn(async () => {
          resolveAttempts += 1

          if (resolveAttempts === 1) {
            throw actorbleError('TARGET_NOT_FOUND', 'No target matched css("#save").')
          }

          return target
        }),
      },
    })
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline, ...ports })

    await expect(engine.waitFor({ kind: 'visible', target: css('#save') })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(ports.resolver.resolve).toHaveBeenCalledTimes(3)
    expect(ports.geometry.snapshot).toHaveBeenCalledTimes(2)
    expect(ports.interactability.inspect).toHaveBeenCalledTimes(2)
    expect(timeline.settle).toHaveBeenCalledTimes(2)
  })

  it('reuses target observations across unchanged retries while the layout tracker is running', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    const layoutInvalidation = createManualLayoutInvalidationTracker()
    let settleAttempts = 0
    const ports = createObservationPorts(target, {
      reports: [
        interactabilityReportFor(target, {
          visible: false,
          visibilityRatio: 0,
          blockingReasons: ['not-visible'],
        }),
        interactabilityReportFor(target),
      ],
    })
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        settleAttempts += 1

        if (settleAttempts === 2) {
          layoutInvalidation.emit('mutation')
        }
      }),
    })
    const engine = new BrowserWaitObservationEngine({
      layoutInvalidation: layoutInvalidation.tracker,
      timeline,
      ...ports,
    })

    await expect(engine.waitFor({ kind: 'visible', target: css('#save') })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(timeline.settle).toHaveBeenCalledTimes(2)
    expect(ports.resolver.resolve).toHaveBeenCalledOnce()
    expect(ports.resolver.validate).toHaveBeenCalledTimes(2)
    expect(ports.geometry.snapshot).toHaveBeenCalledTimes(2)
    expect(ports.interactability.inspect).toHaveBeenCalledTimes(2)
  })

  it('keeps eager target retries when the layout tracker is not running', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    const layoutInvalidation = createManualLayoutInvalidationTracker({ running: false })
    const ports = createObservationPorts(target, {
      reports: [
        interactabilityReportFor(target, {
          visible: false,
          visibilityRatio: 0,
          blockingReasons: ['not-visible'],
        }),
        interactabilityReportFor(target),
      ],
    })
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({
      layoutInvalidation: layoutInvalidation.tracker,
      timeline,
      ...ports,
    })

    await expect(engine.waitFor({ kind: 'visible', target: css('#save') })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(timeline.settle).toHaveBeenCalledOnce()
    expect(ports.resolver.resolve).toHaveBeenCalledTimes(2)
    expect(ports.geometry.snapshot).toHaveBeenCalledTimes(2)
    expect(ports.interactability.inspect).toHaveBeenCalledTimes(2)
  })

  it('records timeout diagnostics for visible waits with the last observed target state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    const ports = createObservationPorts(target, {
      reports: [
        interactabilityReportFor(target, {
          visible: false,
          visibilityRatio: 0,
          blockingReasons: ['not-visible'],
        }),
      ],
    })
    const timeline = createTimeline({
      settle: vi.fn(() => new Promise(() => {})),
    })
    const trace = new BrowserDiagnosticsTrace({
      clock: traceClock(),
      idPrefix: 'trace',
    })
    const engine = new BrowserWaitObservationEngine({ timeline, trace, ...ports })
    const promise = engine.waitFor({ kind: 'visible', target: css('#save') }, { timeout: 25 })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'wait.for',
        timeout: 25,
        conditionKind: 'visible',
        attempts: 1,
        lastObservation: expect.objectContaining({
          state: 'hidden',
          targetId: 'target-1',
          visible: false,
        }),
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    expect(trace.getTrace().events).toEqual([
      expect.objectContaining({ name: 'wait:start' }),
      expect.objectContaining({
        name: 'wait:retry',
        data: expect.objectContaining({
          attempts: 1,
          observation: expect.objectContaining({ state: 'hidden' }),
        }),
      }),
      expect.objectContaining({
        name: 'wait:timeout',
        data: expect.objectContaining({
          lastObservation: expect.objectContaining({ state: 'hidden' }),
        }),
      }),
    ])
  })

  it('cancels visible waits before resolving when the signal is aborted', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    const ports = createObservationPorts(target)
    const controller = new AbortController()
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    controller.abort('scenario stopped')

    await expect(
      engine.waitFor({ kind: 'visible', target: css('#save') }, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'wait.for',
        reason: 'scenario stopped',
      },
    })
    expect(ports.resolver.resolve).not.toHaveBeenCalled()
  })

  it('resolves hidden waits when a locator is not found without geometry reads', async () => {
    document.body.innerHTML = '<main></main>'
    const placeholder = targetHandle(document.body)
    const ports = createObservationPorts(placeholder, {
      resolver: {
        resolve: vi.fn(async () => {
          throw actorbleError('TARGET_NOT_FOUND', 'No target matched css("#toast").')
        }),
      },
    })
    const condition = { kind: 'hidden', target: css('#toast') }
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'settled',
    })

    expect(ports.geometry.snapshot).not.toHaveBeenCalled()
    expect(ports.interactability.inspect).not.toHaveBeenCalled()
  })

  it('resolves hidden waits when a handle is detached without geometry reads', async () => {
    document.body.innerHTML = '<button id="toast">Toast</button>'
    const toast = document.querySelector('#toast')
    const target = targetHandle(toast)
    const ports = createObservationPorts(target, {
      resolver: {
        validate: vi.fn(async () => {
          throw actorbleError('TARGET_DETACHED', 'Target target-1 is detached.')
        }),
      },
    })
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    await expect(engine.waitFor({ kind: 'hidden', target })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(ports.resolver.resolve).not.toHaveBeenCalled()
    expect(ports.geometry.snapshot).not.toHaveBeenCalled()
    expect(ports.interactability.inspect).not.toHaveBeenCalled()
  })

  it('retries hidden waits while the target is visible and completes when it becomes hidden', async () => {
    document.body.innerHTML = '<button id="toast">Toast</button>'
    const toast = document.querySelector('#toast')
    const target = targetHandle(toast)
    const ports = createObservationPorts(target, {
      reports: [
        interactabilityReportFor(target),
        interactabilityReportFor(target, {
          visible: false,
          visibilityRatio: 0,
          blockingReasons: ['not-visible'],
        }),
      ],
    })
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline, ...ports })

    await expect(engine.waitFor({ kind: 'hidden', target: css('#toast') })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(ports.geometry.snapshot).toHaveBeenCalledTimes(2)
    expect(ports.interactability.inspect).toHaveBeenCalledTimes(2)
    expect(timeline.settle).toHaveBeenCalledOnce()
  })

  it('reuses root text observations across unchanged retries and refreshes after mutation', async () => {
    const layoutInvalidation = createManualLayoutInvalidationTracker()
    const rootTexts = ['Loading', 'Project created']
    const dom = {
      getRoot: vi.fn(() => document),
      getRootTextContent: vi.fn(() => rootTexts.shift() ?? 'Project created'),
    }
    let settleAttempts = 0
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        settleAttempts += 1

        if (settleAttempts === 2) {
          layoutInvalidation.emit('mutation')
        }
      }),
    })
    const engine = new BrowserWaitObservationEngine({
      dom,
      layoutInvalidation: layoutInvalidation.tracker,
      timeline,
    })

    await expect(
      engine.waitFor({ kind: 'text', value: 'Project created' }),
    ).resolves.toMatchObject({
      satisfied: true,
      strategy: 'settled',
    })

    expect(timeline.settle).toHaveBeenCalledTimes(2)
    expect(dom.getRootTextContent).toHaveBeenCalledTimes(2)
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
