import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js'
import { BrowserLayoutInvalidationTracker } from '../src/targeting/layout-invalidation-tracker/index.js'
import {
  actorbleError,
  all,
  any,
  attribute,
  attached,
  css,
  detached,
  disabled,
  enabled,
  focused,
  stable,
  text,
  timeoutError,
  url,
  value,
} from '../src/shared/index.js'
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
    expect(timeline.settle).toHaveBeenNthCalledWith(3, 'interaction-stable', {})
  })

  it('normalizes the deprecated settled alias before delegation and tracing', async () => {
    const timeline = createTimeline()
    const trace = new BrowserDiagnosticsTrace({ clock: traceClock(), idPrefix: 'trace' })
    const engine = new BrowserWaitObservationEngine({ timeline, trace })

    await expect(engine.settle('settled')).resolves.toBeNull()

    expect(timeline.settle).toHaveBeenCalledWith('interaction-stable', {})
    expect(trace.getTrace().events).toEqual([
      expect.objectContaining({
        name: 'wait:start',
        data: expect.objectContaining({ strategy: 'interaction-stable' }),
      }),
      expect.objectContaining({
        name: 'wait:success',
        data: expect.objectContaining({ strategy: 'interaction-stable' }),
      }),
    ])
  })

  it('delegates visual-stable settlement to the observed stability engine', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const target = targetHandle(document.querySelector('#save'))
    const visualStability = {
      observe: vi.fn(async () => ({
        requiredStableFrames: 2,
        observedStableFrames: 2,
        lastMutationAt: 0,
        lastScrollAt: 0,
      })),
    }
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline, visualStability })

    await expect(engine.settle('visual-stable', { timeout: 250 }, target)).resolves.toBeNull()

    expect(visualStability.observe).toHaveBeenCalledWith(target, { timeout: 250 })
    expect(timeline.settle).not.toHaveBeenCalled()
  })

  it('preserves visual-stability samples when normalizing settle timeouts', async () => {
    const visualStability = {
      observe: vi.fn(async () => {
        throw timeoutError('wait.visual-stable', 25, {
          details: {
            requiredStableFrames: 2,
            observedStableFrames: 0,
            lastMutationAt: 7,
            lastScrollAt: 8,
          },
        })
      }),
    }
    const engine = new BrowserWaitObservationEngine({
      timeline: createTimeline(),
      visualStability,
    })

    await expect(engine.settle('visual-stable', { timeout: 25 })).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'wait.settle',
        timeout: 25,
        strategy: 'visual-stable',
        requiredStableFrames: 2,
        observedStableFrames: 0,
        lastMutationAt: 7,
        lastScrollAt: 8,
      },
    })
  })

  it('delegates root and target stable conditions to the visual-stability observer', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const target = targetHandle(document.querySelector('#save'))
    const ports = createObservationPorts(target)
    const visualStability = {
      observe: vi.fn(async () => ({
        requiredStableFrames: 3,
        observedStableFrames: 3,
        lastMutationAt: 0,
        lastScrollAt: 0,
      })),
    }
    const engine = new BrowserWaitObservationEngine({
      timeline: createTimeline(),
      visualStability,
      ...ports,
    })

    await expect(engine.waitFor(stable())).resolves.toMatchObject({ satisfied: true })
    await expect(
      engine.waitFor(stable(css('#save'), { quietMs: 40, stableFrames: 3, threshold: 0.25 })),
    ).resolves.toMatchObject({ satisfied: true })

    expect(visualStability.observe).toHaveBeenNthCalledWith(1, undefined, {})
    expect(visualStability.observe).toHaveBeenNthCalledWith(2, target, {
      quietMs: 40,
      stableFrames: 3,
      threshold: 0.25,
    })
  })

  it('supports nested all and any conditions with latched child success', async () => {
    let secondReady = false
    const first = { kind: 'custom', predicate: vi.fn(() => true) }
    const second = { kind: 'custom', predicate: vi.fn(() => secondReady) }
    const third = { kind: 'custom', predicate: vi.fn(() => false) }
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        secondReady = true
      }),
    })
    const condition = all(first, any(second, third))
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'interaction-stable',
    })
    expect(first.predicate).toHaveBeenCalledOnce()
    expect(second.predicate).toHaveBeenCalledTimes(2)
  })

  it('cancels and disposes losing any branches after the first success', async () => {
    let losingSignal
    const timeline = createTimeline({
      settle: vi.fn((_strategy, options) => new Promise((_, reject) => {
        losingSignal = options.signal
        options.signal.addEventListener('abort', () => reject(actorbleError('ACTION_CANCELLED', 'cancelled')), { once: true })
      })),
    })
    const condition = any(
      { kind: 'custom', predicate: () => false },
      { kind: 'custom', predicate: () => true },
    )
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toMatchObject({ satisfied: true })
    expect(losingSignal).toBeDefined()
    expect(losingSignal.aborted).toBe(true)
  })

  it('uses one outer timeout and reports redacted unfinished composite children', async () => {
    vi.useFakeTimers()
    const timeline = createTimeline({ settle: vi.fn(() => new Promise(() => {})) })
    const condition = all(
      { kind: 'custom', predicate: () => true },
      any(value(css('#locator-secret'), 'matcher-secret'), url('/url-secret')),
    )
    const engine = new BrowserWaitObservationEngine({ timeline })
    const promise = engine.waitFor(condition, { timeout: 25 })
    const failurePromise = promise.catch((error) => error)

    await vi.advanceTimersByTimeAsync(25)
    const failure = await failurePromise

    expect(failure).toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'wait.for',
        timeout: 25,
        unfinishedChildren: [
          { path: [1, 0], condition: expect.objectContaining({ kind: 'value' }) },
          { path: [1, 1], condition: expect.objectContaining({ kind: 'url' }) },
        ],
      },
    })
    expect(JSON.stringify(failure.details)).not.toMatch(/locator-secret|matcher-secret|url-secret/)
  })

  it('cascades external abort through composite children', async () => {
    let childSignal
    const timeline = createTimeline({
      settle: vi.fn((_strategy, options) => new Promise((_, reject) => {
        childSignal = options.signal
        options.signal.addEventListener('abort', () => reject(actorbleError('ACTION_CANCELLED', 'cancelled')), { once: true })
      })),
    })
    const controller = new AbortController()
    const engine = new BrowserWaitObservationEngine({ timeline })
    const promise = engine.waitFor(all({ kind: 'custom', predicate: () => false }), {
      signal: controller.signal,
    })

    await vi.waitFor(() => expect(childSignal).toBeDefined())
    controller.abort('scenario stopped')

    await expect(promise).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })
    expect(childSignal.aborted).toBe(true)
  })

  it('fails on the first structural child error and cancels sibling work', async () => {
    let siblingSignal
    const structural = actorbleError('PLATFORM_UNSUPPORTED', 'unsupported child')
    const timeline = createTimeline({
      settle: vi.fn((_strategy, options) => new Promise((_, reject) => {
        siblingSignal = options.signal
        options.signal.addEventListener('abort', () => reject(actorbleError('ACTION_CANCELLED', 'cancelled')), { once: true })
      })),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(all(
      { kind: 'custom', predicate: () => false },
      { kind: 'custom', predicate: () => { throw structural } },
    ))).rejects.toBe(structural)
    expect(siblingSignal.aborted).toBe(true)
  })

  it('defines empty composite semantics', async () => {
    vi.useFakeTimers()
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    await expect(engine.waitFor(all())).resolves.toMatchObject({ satisfied: true })
    const promise = engine.waitFor(any(), { timeout: 10 })
    const expectation = expect(promise).rejects.toMatchObject({ code: 'ACTION_TIMEOUT' })
    await vi.advanceTimersByTimeAsync(10)
    await expectation
  })

  it('resolves custom wait predicates immediately when already satisfied', async () => {
    const condition = { kind: 'custom', predicate: vi.fn(() => true) }
    const timeline = createTimeline()
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(condition)).resolves.toEqual({
      condition,
      satisfied: true,
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
    })

    expect(condition.predicate).toHaveBeenCalledTimes(2)
    expect(timeline.settle).toHaveBeenCalledWith('interaction-stable', {})
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
          matcher: { kind: 'string', length: 'Project created'.length },
          scope: 'root',
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
    document.body.innerHTML = '<p id="status">Saving</p>'
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        document.querySelector('#status').textContent = ' Saved  successfully '
      }),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(text('Saved successfully', { target: css('#status') })))
      .resolves.toMatchObject({ satisfied: true })
    await expect(engine.waitFor(text(/^Saved successfully$/g, { target: css('#status') })))
      .resolves.toMatchObject({ satisfied: true })
    expect(timeline.settle).toHaveBeenCalledOnce()
  })

  it('matches target text exactly while preserving root text containment', async () => {
    document.body.innerHTML = '<p id="status">Project created successfully</p>'
    const rootEngine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    await expect(rootEngine.waitFor(text('Project created'))).resolves.toMatchObject({ satisfied: true })

    const timeline = createTimeline({
      settle: vi.fn(async () => {
        document.querySelector('#status').textContent = 'Project created'
      }),
    })
    const targetEngine = new BrowserWaitObservationEngine({ timeline })
    await expect(targetEngine.waitFor(text('Project created', { target: css('#status') })))
      .resolves.toMatchObject({ satisfied: true })
    expect(timeline.settle).toHaveBeenCalledOnce()
  })

  it('waits for input and select values and rejects unsupported value targets', async () => {
    document.body.innerHTML = `
      <input id="name" value="loading">
      <textarea id="notes">draft</textarea>
      <select id="state"><option value="loading">Loading</option><option value="ready">Ready</option></select>
      <div id="editor" contenteditable="true">draft</div>
    `
    let attempts = 0
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        attempts += 1
        if (attempts === 1) document.querySelector('#name').value = 'ready'
      }),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(value(css('#name'), /^ready$/g))).resolves.toMatchObject({ satisfied: true })
    document.querySelector('#state').value = 'ready'
    await expect(engine.waitFor(value(css('#state'), 'ready'))).resolves.toMatchObject({ satisfied: true })
    await expect(engine.waitFor(value(css('#notes'), 'draft'))).resolves.toMatchObject({ satisfied: true })
    await expect(engine.waitFor(value(css('#editor'), 'draft'))).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: expect.objectContaining({ conditionKind: 'value', supportedElements: ['input', 'textarea', 'select'] }),
    })
  })

  it('distinguishes absent attributes from empty values and supports regular expressions', async () => {
    document.body.innerHTML = '<div id="panel"></div>'
    const panel = document.querySelector('#panel')
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline() })

    await expect(engine.waitFor(attribute(css('#panel'), 'data-state', null))).resolves.toMatchObject({ satisfied: true })
    panel.setAttribute('data-state', '')
    await expect(engine.waitFor(attribute(css('#panel'), 'data-state', ''))).resolves.toMatchObject({ satisfied: true })
    panel.setAttribute('data-state', 'ready')
    await expect(engine.waitFor(attribute(css('#panel'), 'data-state', /^ready$/g))).resolves.toMatchObject({ satisfied: true })

    panel.setAttribute('data-state', 'loading')
    const transitionTimeline = createTimeline({
      settle: vi.fn(async () => panel.setAttribute('data-state', 'ready')),
    })
    const transitionEngine = new BrowserWaitObservationEngine({ timeline: transitionTimeline })
    await expect(transitionEngine.waitFor(attribute(css('#panel'), 'data-state', 'ready')))
      .resolves.toMatchObject({ satisfied: true })
    expect(transitionTimeline.settle).toHaveBeenCalledOnce()
  })

  it('matches root-relative, absolute, and RegExp URLs across SPA transitions', async () => {
    history.replaceState({}, '', '/loading')
    const timeline = createTimeline({
      settle: vi.fn(async () => {
        history.pushState({}, '', '/projects/1?tab=summary#details')
      }),
    })
    const engine = new BrowserWaitObservationEngine({ timeline })

    await expect(engine.waitFor(url('/projects/1?tab=summary#details'))).resolves.toMatchObject({ satisfied: true })
    await expect(engine.waitFor(url(new URL('/projects/1?tab=summary#details', location.href).href))).resolves.toMatchObject({ satisfied: true })
    await expect(engine.waitFor(url(/\/projects\/1\?tab=summary#details$/g))).resolves.toMatchObject({ satisfied: true })
  })

  it('disposes URL observation when an in-progress wait is aborted', async () => {
    history.replaceState({}, '', '/loading')
    const dom = new BrowserDomAdapter(document)
    const dispose = vi.fn()
    const observe = dom.observeUrlChanges.bind(dom)
    vi.spyOn(dom, 'observeUrlChanges').mockImplementation((listener) => {
      const subscription = observe(listener)
      return { dispose: () => { dispose(); subscription.dispose() } }
    })
    const timeline = createTimeline({
      settle: vi.fn((_strategy, options) => new Promise((_, reject) => {
        options.signal.addEventListener('abort', () => reject(actorbleError('ACTION_CANCELLED', 'cancelled')), { once: true })
      })),
    })
    const controller = new AbortController()
    const engine = new BrowserWaitObservationEngine({ dom, timeline })
    const promise = engine.waitFor(url('/ready'), { signal: controller.signal })

    await vi.waitFor(() => expect(timeline.settle).toHaveBeenCalledOnce())
    controller.abort('stopped')

    await expect(promise).rejects.toMatchObject({ code: 'ACTION_CANCELLED' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('redacts matcher, observed content, locator text, and URL components from diagnostics', async () => {
    vi.useFakeTimers()
    history.replaceState({}, '', '/path-secret?query-secret=yes#fragment-secret')
    document.body.innerHTML = '<input id="locator-secret" value="observed-secret">'
    const trace = new BrowserDiagnosticsTrace({ clock: traceClock(), idPrefix: 'trace' })
    const timeline = createTimeline({ settle: vi.fn(() => new Promise(() => {})) })
    const engine = new BrowserWaitObservationEngine({ timeline, trace })
    const promise = engine.waitFor(value(css('#locator-secret'), 'matcher-secret'), { timeout: 25 })
    const failurePromise = promise.catch((error) => error)
    await vi.advanceTimersByTimeAsync(25)
    const failure = await failurePromise
    expect(failure).toMatchObject({ code: 'ACTION_TIMEOUT' })

    const urlTrace = new BrowserDiagnosticsTrace({ clock: traceClock(), idPrefix: 'url-trace' })
    const urlEngine = new BrowserWaitObservationEngine({ timeline, trace: urlTrace })
    const urlPromise = urlEngine.waitFor(url(/url-matcher-secret/), { timeout: 25 })
    const urlFailurePromise = urlPromise.catch((error) => error)
    await vi.advanceTimersByTimeAsync(25)
    const urlFailure = await urlFailurePromise
    expect(urlFailure).toMatchObject({ code: 'ACTION_TIMEOUT' })

    const serialized = JSON.stringify({
      trace: trace.getTrace(),
      failure: failure.details,
      urlTrace: urlTrace.getTrace(),
      urlFailure: urlFailure.details,
    })
    for (const secret of [
      'locator-secret',
      'observed-secret',
      'matcher-secret',
      'url-matcher-secret',
      'path-secret',
      'query-secret',
      'fragment-secret',
    ]) {
      expect(serialized).not.toContain(secret)
    }
    expect(serialized).toContain('valueLength')
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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

  it('retains limited wait events while preserving timeout context on the span error', async () => {
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
      retention: { maxEvents: 2 },
    })
    const engine = new BrowserWaitObservationEngine({ timeline, trace, ...ports })
    const promise = engine.waitFor({ kind: 'visible', target: css('#save') }, { timeout: 25 })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    const snapshot = trace.getTrace()
    expect(snapshot.events).toEqual([
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
          attempts: 1,
          lastObservation: expect.objectContaining({ state: 'hidden' }),
        }),
      }),
    ])
    expect(snapshot.spans).toEqual([
      expect.objectContaining({
        name: 'wait.for',
        status: 'error',
        error: expect.objectContaining({
          code: 'ACTION_TIMEOUT',
          details: expect.objectContaining({
            attempts: 1,
            lastObservation: expect.objectContaining({ state: 'hidden' }),
          }),
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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
      strategy: 'interaction-stable',
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

  it.each([
    ['attached', attached, true],
    ['enabled', enabled, true],
    ['disabled', disabled, false],
  ])('resolves %s after its target observation transitions', async (_kind, createCondition, reportEnabled) => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const target = targetHandle(document.querySelector('#save'))
    let attempt = 0
    const ports = createObservationPorts(target, {
      resolver: {
        resolve: vi.fn(async () => {
          attempt += 1
          if (attempt === 1) throw actorbleError('TARGET_NOT_FOUND', 'not yet')
          return target
        }),
      },
      reports: [interactabilityReportFor(target, { enabled: reportEnabled })],
    })
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    await expect(engine.waitFor(createCondition(css('#save')), { timeout: 100 })).resolves.toMatchObject({
      satisfied: true,
      strategy: 'interaction-stable',
    })
  })

  it('resolves detached when a locator no longer resolves without geometry reads', async () => {
    const target = targetHandle(document.body)
    const ports = createObservationPorts(target, {
      resolver: { resolve: vi.fn(async () => { throw actorbleError('TARGET_NOT_FOUND', 'gone') }) },
    })
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    await expect(engine.waitFor(detached(css('#toast')))).resolves.toMatchObject({ satisfied: true })
    expect(ports.geometry.snapshot).not.toHaveBeenCalled()
    expect(ports.interactability.inspect).not.toHaveBeenCalled()
  })

  it('resolves focused from the platform active element and rechecks it every attempt', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const target = targetHandle(save)
    let active = null
    const dom = { getActiveElement: vi.fn(() => active) }
    const ports = createObservationPorts(target)
    const timeline = createTimeline({ settle: vi.fn(async () => { active = save }) })
    const engine = new BrowserWaitObservationEngine({ dom, timeline, ...ports })

    await expect(engine.waitFor(focused(css('#save')))).resolves.toMatchObject({ satisfied: true })
    expect(dom.getActiveElement).toHaveBeenCalledTimes(2)
  })

  it('surfaces a locator-less stale handle instead of treating it as detached', async () => {
    const stale = targetHandle(document.body, { validity: 'stale' })
    const failure = actorbleError('TARGET_STALE', 'cannot recover')
    const ports = createObservationPorts(stale, {
      resolver: { validate: vi.fn(async () => { throw failure }) },
    })
    const engine = new BrowserWaitObservationEngine({ timeline: createTimeline(), ...ports })

    await expect(engine.waitFor(detached(stale))).rejects.toBe(failure)
  })

  it('treats failed locator-backed stale recovery as detached but preserves structural errors', async () => {
    const locator = css('#save')
    const stale = targetHandle(document.body, { validity: 'stale', locator })
    const notFound = actorbleError('TARGET_NOT_FOUND', 'gone')
    const staleFailure = actorbleError('TARGET_STALE', 'cannot recover', { cause: notFound })
    const detachedPorts = createObservationPorts(stale, {
      resolver: { validate: vi.fn(async () => { throw staleFailure }) },
    })

    await expect(
      new BrowserWaitObservationEngine({ timeline: createTimeline(), ...detachedPorts })
        .waitFor(detached(stale)),
    ).resolves.toMatchObject({ satisfied: true })

    const ambiguous = actorbleError('TARGET_AMBIGUOUS', 'too many')
    const structuralFailure = actorbleError('TARGET_STALE', 'cannot recover', { cause: ambiguous })
    const structuralPorts = createObservationPorts(stale, {
      resolver: { validate: vi.fn(async () => { throw structuralFailure }) },
    })

    await expect(
      new BrowserWaitObservationEngine({ timeline: createTimeline(), ...structuralPorts })
        .waitFor(detached(stale)),
    ).rejects.toBe(structuralFailure)
  })

  it('records condition-specific timeout context and cancels target waits cleanly', async () => {
    vi.useFakeTimers()
    const target = targetHandle(document.body)
    const ports = createObservationPorts(target, {
      reports: [interactabilityReportFor(target, { enabled: false })],
    })
    const timeline = createTimeline({ settle: vi.fn(() => new Promise(() => {})) })
    const engine = new BrowserWaitObservationEngine({ timeline, ...ports })
    const promise = engine.waitFor(enabled(css('#save')), { timeout: 25 })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        conditionKind: 'enabled',
        attempts: 1,
        lastObservation: expect.objectContaining({ enabled: false }),
      },
    })

    await vi.advanceTimersByTimeAsync(25)
    await expectation

    const controller = new AbortController()
    controller.abort('stopped')
    await expect(engine.waitFor(attached(css('#save')), { signal: controller.signal })).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'stopped' },
    })
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
