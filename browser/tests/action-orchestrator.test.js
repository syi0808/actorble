import { describe, expect, it, vi } from 'vitest'
import { BrowserActionOrchestrator } from '../src/action-orchestrator/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics-trace/index.js'
import { BrowserInteractionStateStore } from '../src/interaction-state-store/index.js'
import { BrowserPointerSignalBus } from '../src/pointer-signals/index.js'
import { BrowserDomAdapter } from '../src/platform-adapter/index.js'
import { BrowserPseudoStateMirror } from '../src/pseudo-state-mirror/index.js'
import { actorbleError, cancellationError, css } from '../src/shared/index.js'

function targetHandle(id = 'target-1') {
  const target = document.createElement('button')
  target.id = id
  document.body.append(target)

  return {
    id,
    element: target,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `button#${id}` },
  }
}

function inputTargetHandle(id = 'target-1') {
  const target = document.createElement('input')
  target.id = id
  document.body.append(target)

  return {
    id,
    element: target,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `input#${id}` },
  }
}

function geometryFor(target, point = { x: 20, y: 30 }) {
  return {
    target,
    rect: { x: 10, y: 20, width: 20, height: 20 },
    visibleRect: { x: 10, y: 20, width: 20, height: 20 },
    center: point,
    clickablePoint: {
      ok: true,
      point,
      strategy: 'center',
    },
    coordinateSpace: 'viewport',
    computedAt: 2000,
  }
}

function createTrace() {
  let now = 5000

  return new BrowserDiagnosticsTrace({
    idPrefix: 'action',
    clock: {
      now() {
        return now++
      },
    },
  })
}

function createFrameTimeline(frameInterval = 125) {
  let now = 0

  return {
    now: vi.fn(() => now),
    delay: vi.fn(async (duration) => {
      now += duration
    }),
    nextFrame: vi.fn(async () => {
      now += frameInterval
      return now
    }),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  }
}

function createBlockingTimeline() {
  let now = 0
  const pendingDelays = []

  return {
    timeline: {
      now: vi.fn(() => now),
      delay: vi.fn(
        (duration, options = {}) =>
          new Promise((resolve, reject) => {
            if (options.signal?.aborted) {
              reject(cancellationError('timeline.delay', options.signal.reason))
              return
            }

            const onAbort = () => {
              reject(cancellationError('timeline.delay', options.signal?.reason))
            }

            options.signal?.addEventListener('abort', onAbort, { once: true })
            pendingDelays.push({
              duration,
              resolve: () => {
                options.signal?.removeEventListener('abort', onAbort)
                now += duration
                resolve()
              },
            })
          }),
      ),
      nextFrame: vi.fn(async () => now),
      settle: vi.fn(async () => {}),
      withTimeout: vi.fn(async (operation) => operation),
    },
    get pendingDelayCount() {
      return pendingDelays.length
    },
    resolveNextDelay() {
      const pending = pendingDelays.shift()

      if (!pending) {
        throw new Error('No pending delay to resolve.')
      }

      pending.resolve()
    },
  }
}

function cursorFromStyle(style) {
  return { cursor: style }
}

function createHarness(options = {}) {
  const calls = []
  const target = options.target ?? targetHandle()
  const geometry = options.geometry ?? geometryFor(target)
  const signals = new BrowserPointerSignalBus()
  const trace = options.trace ?? createTrace()
  const resolver = {
    resolve: vi.fn(async () => {
      calls.push('resolver.resolve')
      return target
    }),
    resolveAll: vi.fn(async () => [target]),
    exists: vi.fn(async () => true),
    inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
    validate: vi.fn(async () => {
      calls.push('resolver.validate')
      return target
    }),
  }
  const surface = {
    getSurfaceFor: vi.fn(() => ({
      id: 'viewport',
      root: document,
      coordinateSpace: 'viewport',
      viewport: null,
      clippingChain: [],
    })),
    getScrollableAncestors: vi.fn(() => []),
    ensureVisible: vi.fn(async () => {
      calls.push('surface.ensureVisible')
    }),
    scrollTo: vi.fn(),
    mapPoint: vi.fn((point) => point),
  }
  const geometryEngine = {
    snapshot: vi.fn(async () => {
      calls.push('geometry.snapshot')
      return geometry
    }),
    getBoundingRect: vi.fn(() => geometry.rect),
    getVisibleRect: vi.fn(() => geometry.visibleRect),
    getCenter: vi.fn(() => geometry.center),
    getClickablePoint: vi.fn(() => geometry.clickablePoint),
  }
  const interactability = {
    inspect: vi.fn(async () => ({ target, canClick: true, blockingReasons: [] })),
    canClick: vi.fn(async () => {
      calls.push('interactability.canClick')
      return (
        options.clickReport ?? {
          target,
          visible: true,
          enabled: true,
          receivesPointerEvents: true,
          canClick: true,
          canFocus: true,
          canType: true,
          blockingReasons: [],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      )
    }),
    canFocus: vi.fn(async () => ({ target, canFocus: true, blockingReasons: [] })),
    canType: vi.fn(async () => {
      calls.push('interactability.canType')
      return (
        options.typeReport ?? {
          target,
          visible: true,
          enabled: true,
          receivesPointerEvents: true,
          canClick: true,
          canFocus: true,
          canType: true,
          blockingReasons: [],
          forceBypassedReasons: [],
          unforceableReasons: [],
        }
      )
    }),
  }
  const fakeGesture = {
    click: vi.fn(async () => {
      calls.push('gesture.click')
      signals.emit({ type: 'pointer:moved', point: geometry.clickablePoint.point, previousPoint: null })
      signals.emit({ type: 'pointer:down', point: geometry.clickablePoint.point, button: 'primary' })

      if (options.clickFailure) {
        throw options.clickFailure
      }

      signals.emit({ type: 'pointer:up', point: geometry.clickablePoint.point, button: 'primary' })
      return { completed: true }
    }),
    hover: vi.fn(async (point) => {
      calls.push('gesture.hover')
      signals.emit({ type: 'pointer:moved', point, previousPoint: null })
      return { completed: true }
    }),
    doubleClick: vi.fn(),
    drag: vi.fn(),
    cancel: vi.fn(async () => {
      calls.push('gesture.cancel')
      if (options.cancelFailure) {
        throw options.cancelFailure
      }

      signals.emit({ type: 'pointer:cancelled' })
      return { completed: false }
    }),
  }
  const gesture = options.gesture ?? (options.useRealGesture ? undefined : fakeGesture)
  const focus = {
    focus: vi.fn(),
    blur: vi.fn(),
    getFocused: vi.fn(),
    tab: vi.fn(),
  }
  const text = {
    type: vi.fn(),
    typeInto: vi.fn(async () => {
      calls.push('text.typeInto')
      return { strategy: 'typeInto', text: 'hello' }
    }),
    fill: vi.fn(),
  }
  const wait = {
    waitFor: vi.fn(),
    settle: vi.fn(async () => {
      calls.push('wait.settle')
      return null
    }),
    invalidateGeometry: vi.fn(),
  }
  const events = {
    dispatchPointerEvent: vi.fn((event) => {
      calls.push(`event.${event.type}`)
      return options.pointerDispatchResult?.[event.type] ?? true
    }),
    dispatchMouseEvent: vi.fn((event) => {
      calls.push(`event.${event.type}`)
      return options.mouseDispatchResult?.[event.type] ?? true
    }),
    dispatchKeyboardEvent: vi.fn(() => true),
    dispatchTextInputEvent: vi.fn(() => true),
  }
  const state = options.state ?? {
    applyStateEffects: vi.fn((effects) => {
      if (effects.length > 0) {
        calls.push(`state.${effects.map((effect) => `${effect.kind}:${effect.active}`).join(',')}`)
      }
    }),
    cleanup: vi.fn(() => {
      calls.push('state.cleanup')
    }),
  }
  const dom = options.dom ?? {
    getComputedStyle: vi.fn((element) => {
      if (options.trackCursorReads) {
        calls.push(`dom.cursor:${element.id}`)
      }

      const cursor =
        typeof options.cursorStyle === 'function'
          ? options.cursorStyle(element)
          : (options.cursorStyles?.get(element) ?? 'default')

      return cursorFromStyle(cursor)
    }),
    getParentElement: vi.fn((element) => element.parentElement),
  }
  const visual =
    options.visual ??
    (options.enableVisual
      ? {
          showCursor: vi.fn((request) => {
            const point = 'point' in request ? request.point : request
            const cursor = 'point' in request ? (request.cursor ?? 'default') : 'default'

            calls.push(`visual.cursor:${point.x},${point.y}:${cursor}`)
          }),
          highlightTarget: vi.fn(() => {
            calls.push('visual.highlight')
          }),
          showClick: vi.fn(() => {
            calls.push('visual.click')
          }),
          showFocus: vi.fn((request) => {
            calls.push(`visual.focus:${request.active}`)
          }),
          showTyping: vi.fn((request) => {
            calls.push(`visual.typing:${request.active}`)
          }),
          showKeystroke: vi.fn((request) => {
            calls.push(`visual.keystroke:${request.text}`)
          }),
          clearFeedback: vi.fn(() => {
            calls.push('visual.clearFeedback')
          }),
          hide: vi.fn(),
          destroy: vi.fn(),
        }
      : undefined)
  const store = new BrowserInteractionStateStore()
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry: geometryEngine,
    interactability,
    ...(gesture === undefined ? {} : { gesture }),
    focus,
    text,
    wait,
    trace,
    timeline: options.timeline,
    store,
    events,
    state,
    dom,
    signals,
    visual,
  })

  return {
    calls,
    dom,
    events,
    gesture,
    geometry,
    interactability,
    orchestrator,
    resolver,
    state,
    store,
    target,
    text,
    trace,
    visual,
    wait,
  }
}

function createRealTextHarness(options = {}) {
  const target = options.target ?? inputTargetHandle()
  const geometry = options.geometry ?? geometryFor(target)
  const trace = options.trace ?? createTrace()
  const timeline = options.timeline ?? createFrameTimeline()
  const store = options.store ?? new BrowserInteractionStateStore()
  const calls = []
  const resolver = {
    resolve: vi.fn(async () => {
      calls.push('resolver.resolve')
      return target
    }),
    resolveAll: vi.fn(async () => [target]),
    exists: vi.fn(async () => true),
    inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
    validate: vi.fn(async () => {
      calls.push('resolver.validate')
      return target
    }),
  }
  const surface = {
    getSurfaceFor: vi.fn(() => ({
      id: 'viewport',
      root: document,
      coordinateSpace: 'viewport',
      viewport: null,
      clippingChain: [],
    })),
    getScrollableAncestors: vi.fn(() => []),
    ensureVisible: vi.fn(async () => {
      calls.push('surface.ensureVisible')
    }),
    scrollTo: vi.fn(),
    mapPoint: vi.fn((point) => point),
  }
  const geometryEngine = {
    snapshot: vi.fn(async () => {
      calls.push('geometry.snapshot')
      return geometry
    }),
    getBoundingRect: vi.fn(() => geometry.rect),
    getVisibleRect: vi.fn(() => geometry.visibleRect),
    getCenter: vi.fn(() => geometry.center),
    getClickablePoint: vi.fn(() => geometry.clickablePoint),
  }
  const interactability = {
    inspect: vi.fn(async () => ({ target, canClick: true, blockingReasons: [] })),
    canClick: vi.fn(async () => ({
      target,
      visible: true,
      enabled: true,
      receivesPointerEvents: true,
      canClick: true,
      canFocus: true,
      canType: true,
      blockingReasons: [],
      forceBypassedReasons: [],
      unforceableReasons: [],
    })),
    canFocus: vi.fn(async () => ({ target, canFocus: true, blockingReasons: [] })),
    canType: vi.fn(async () => {
      calls.push('interactability.canType')
      return {
        target,
        visible: true,
        enabled: true,
        receivesPointerEvents: true,
        canClick: true,
        canFocus: true,
        canType: true,
        blockingReasons: [],
        forceBypassedReasons: [],
        unforceableReasons: [],
      }
    }),
  }
  const wait = {
    waitFor: vi.fn(),
    settle: vi.fn(async () => {
      calls.push('wait.settle')
      return null
    }),
    invalidateGeometry: vi.fn(),
  }
  const state = {
    applyStateEffects: vi.fn(),
    cleanup: vi.fn(),
  }
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry: geometryEngine,
    interactability,
    wait,
    trace,
    timeline,
    store,
    state,
    dom: new BrowserDomAdapter(document),
  })

  return {
    calls,
    input: target.element,
    orchestrator,
    store,
    target,
    timeline,
    trace,
    wait,
  }
}

describe('BrowserActionOrchestrator', () => {
  it('click resolves and validates the target before dispatching pointer and activation events', async () => {
    const { calls, events, orchestrator, target, trace, wait } = createHarness()

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'event.pointermove',
      'state.active:true',
      'event.pointerdown',
      'state.active:false',
      'event.pointerup',
      'event.click',
      'wait.settle',
    ])
    expect(events.dispatchMouseEvent).toHaveBeenCalledWith({
      type: 'click',
      target: target.element,
      point: { x: 20, y: 30 },
      button: 'primary',
      buttons: [],
      detail: 1,
    })
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans).toEqual([
      expect.objectContaining({
        name: 'action.click',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'click',
          completed: true,
          targetId: 'target-1',
          output: expect.objectContaining({
            activationDispatched: true,
          }),
        }),
      }),
    ])
  })

  it('skips activation but still settles when pointer down or up is canceled by the page', async () => {
    const { events, orchestrator, trace, wait } = createHarness({
      pointerDispatchResult: { pointerdown: false },
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(wait.settle).toHaveBeenCalledWith('settled', {})
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        status: 'ok',
        attributes: expect.objectContaining({
          output: expect.objectContaining({
            activationDispatched: false,
          }),
        }),
      }),
    )
  })

  it('cancels pointer state and cleans up active effects when click fails after pointer down', async () => {
    const { events, gesture, orchestrator, state, trace } = createHarness({
      clickFailure: cancellationError('click', 'scenario stopped'),
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { reason: 'scenario stopped' },
    })

    expect(gesture.cancel).toHaveBeenCalledOnce()
    expect(events.dispatchMouseEvent).not.toHaveBeenCalled()
    expect(state.cleanup).toHaveBeenCalledOnce()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.click',
        status: 'cancelled',
      }),
    )
  })

  it('does not fail click when pseudo state mirror application only records a warning', async () => {
    const trace = createTrace()
    const failingMirrorState = {
      applyStateEffects: vi.fn(() => {
        throw new Error('mirror blocked by runtime style policy')
      }),
      cleanup: vi.fn(),
    }
    const mirror = new BrowserPseudoStateMirror({
      state: failingMirrorState,
      trace,
    })
    const { orchestrator } = createHarness({ state: mirror, trace })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        name: 'action.click',
        status: 'ok',
      }),
    )
    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Pseudo state mirror apply failed.',
          details: expect.objectContaining({
            error: 'mirror blocked by runtime style policy',
          }),
        }),
      ]),
    )
  })

  it('records visual hook failures as warnings without failing the action', async () => {
    const visual = {
      showCursor: vi.fn(() => {
        throw new Error('overlay blocked')
      }),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    const { orchestrator, trace } = createHarness({ visual })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Visual layer update failed.',
          details: expect.objectContaining({
            effect: 'showCursor',
            error: 'overlay blocked',
          }),
        }),
      ]),
    )
  })

  it('fails preflight without performing a gesture when click is not interactable', async () => {
    const { events, gesture, orchestrator, trace } = createHarness({
      clickReport: {
        target: targetHandle('blocked'),
        visible: true,
        enabled: false,
        receivesPointerEvents: true,
        canClick: false,
        canFocus: false,
        canType: false,
        blockingReasons: ['disabled'],
        forceBypassedReasons: [],
        unforceableReasons: ['disabled'],
      },
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
      details: expect.objectContaining({
        action: 'click',
        blockingReasons: ['disabled'],
      }),
    })

    expect(gesture.click).not.toHaveBeenCalled()
    expect(events.dispatchPointerEvent).not.toHaveBeenCalled()
    expect(trace.getTrace().spans[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        attributes: expect.objectContaining({ phase: 'preflight' }),
      }),
    )
  })

  it('moveTo resolves, reveals, moves to the clickable point, and waits for settlement', async () => {
    const { calls, orchestrator } = createHarness()

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'gesture.hover',
      'state.hover:true',
      'event.pointermove',
      'wait.settle',
    ])
  })

  it('applies the public ease movement default when moveTo omits movement options', async () => {
    const { gesture, orchestrator } = createHarness()

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(gesture.hover).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      { motion: { kind: 'ease', easing: 'ease-in-out', duration: 250 } },
    )
  })

  it('preserves explicit zero-duration public movement', async () => {
    const { gesture, orchestrator } = createHarness()

    await expect(
      orchestrator.moveTo(css('#target-1'), { duration: 0, timeout: 100 }),
    ).resolves.toBeUndefined()

    expect(gesture.hover).toHaveBeenCalledWith(
      { x: 20, y: 30 },
      { duration: 0, timeout: 100 },
    )
  })

  it('routes the public click movement default before pointer down', async () => {
    const timeline = createFrameTimeline()
    const { calls, events, orchestrator } = createHarness({
      timeline,
      useRealGesture: true,
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(timeline.nextFrame).toHaveBeenCalledTimes(2)
    expect(calls.filter((call) => call.startsWith('event.'))).toEqual([
      'event.pointermove',
      'event.pointermove',
      'event.pointerdown',
      'event.pointerup',
      'event.click',
    ])
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(1, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 10, y: 15 },
      buttons: [],
    })
    expect(events.dispatchPointerEvent).toHaveBeenNthCalledWith(2, {
      type: 'pointermove',
      target: expect.any(HTMLButtonElement),
      point: { x: 20, y: 30 },
      buttons: [],
    })
  })

  it('preserves explicit spring movement as click opt-in behavior', async () => {
    const { gesture, orchestrator, target } = createHarness()
    const motion = { kind: 'spring', duration: 260 }

    await expect(
      orchestrator.click(css('#target-1'), { motion, timeout: 1500 }),
    ).resolves.toBeUndefined()

    expect(gesture.click).toHaveBeenCalledWith(
      target,
      { x: 20, y: 30 },
      { motion, timeout: 1500 },
    )
  })

  it('routes pointer and click visual hooks without changing core dispatch order', async () => {
    const { calls, orchestrator, visual } = createHarness({ enableVisual: true })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'visual.cursor:20,30:default',
      'event.pointermove',
      'state.active:true',
      'visual.cursor:20,30:default',
      'event.pointerdown',
      'state.active:false',
      'visual.cursor:20,30:default',
      'event.pointerup',
      'event.click',
      'visual.click',
      'wait.settle',
    ])
    expect(visual.highlightTarget).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: 'target-1' }),
      rect: { x: 10, y: 20, width: 20, height: 20 },
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(3, {
      point: { x: 20, y: 30 },
      cursor: 'default',
      pressed: false,
    })
    expect(visual.showClick).toHaveBeenCalledTimes(1)
  })

  it('routes computed cursor after hover state effects on pointer move', async () => {
    const target = targetHandle()
    const cursorStyles = new Map([[target.element, 'pointer']])
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
      trackCursorReads: true,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'gesture.hover',
      'state.hover:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointermove',
      'wait.settle',
    ])
    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('refreshes cursor visuals after active state effects on pointer down and up', async () => {
    const target = targetHandle()
    const cursors = ['pointer', 'grabbing', 'pointer']
    const { calls, orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyle: () => cursors.shift() ?? 'pointer',
      trackCursorReads: true,
    })

    await expect(orchestrator.click(css('#target-1'))).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canClick',
      'gesture.click',
      'state.hover:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointermove',
      'state.active:true',
      'dom.cursor:target-1',
      'visual.cursor:20,30:grabbing',
      'event.pointerdown',
      'state.active:false',
      'dom.cursor:target-1',
      'visual.cursor:20,30:pointer',
      'event.pointerup',
      'event.click',
      'visual.click',
      'wait.settle',
    ])
    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'grabbing',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(3, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('restores pressed cursor visual when click cancellation emits pointer cancelled', async () => {
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      clickFailure: cancellationError('click', 'scenario stopped'),
      cursorStyle: () => 'pointer',
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })

    expect(visual.showCursor).toHaveBeenNthCalledWith(1, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('restores pressed cursor visual during failed perform cleanup without a cancellation signal', async () => {
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      clickFailure: new Error('perform failed after pointer down'),
      cancelFailure: new Error('cancel failed before signal'),
      cursorStyle: () => 'pointer',
    })

    await expect(orchestrator.click(css('#target-1'))).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
    })

    expect(visual.showCursor).toHaveBeenNthCalledWith(2, {
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: true,
    })
    expect(visual.showCursor).toHaveBeenLastCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'pointer',
      pressed: false,
    })
  })

  it('falls back through indirect cursor values and lets unsupported cursors reach the visual layer', async () => {
    const parent = document.createElement('section')
    parent.id = 'parent'
    const target = targetHandle()
    parent.append(target.element)
    document.body.append(parent)
    const cursorStyles = new Map([
      [target.element, 'inherit'],
      [parent, 'url(cursor.svg), copy'],
    ])
    const { orchestrator, visual } = createHarness({
      enableVisual: true,
      target,
      cursorStyles,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      cursor: 'url(cursor.svg), copy',
      pressed: false,
    })
  })

  it('records cursor resolution failures as warnings without failing the action', async () => {
    const dom = {
      getComputedStyle: vi.fn(() => {
        throw new Error('style read blocked')
      }),
      getParentElement: vi.fn((element) => element.parentElement),
    }
    const { orchestrator, trace, visual } = createHarness({
      enableVisual: true,
      dom,
    })

    await expect(orchestrator.moveTo(css('#target-1'))).resolves.toBeUndefined()

    expect(visual.showCursor).toHaveBeenCalledWith({
      point: { x: 20, y: 30 },
      pressed: false,
    })
    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Cursor style resolution failed.',
          details: expect.objectContaining({
            error: 'style read blocked',
            targetId: 'target-1',
          }),
        }),
      ]),
    )
  })

  it('typeInto resolves and checks type interactability before delegating text input', async () => {
    const { calls, orchestrator, target, text } = createHarness()
    const controller = new AbortController()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'hello', {
        delay: 8,
        timeout: 100,
        signal: controller.signal,
      }),
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canType',
      'text.typeInto',
      'wait.settle',
    ])
    expect(text.typeInto).toHaveBeenCalledWith(target, 'hello', {
      delay: 8,
      timeout: 100,
      signal: controller.signal,
    })
  })

  it('applies the default public typeInto cadence when delay is omitted', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(orchestrator.typeInto(css('#target-1'), 'abc')).resolves.toBeUndefined()

    expect(text.typeInto).toHaveBeenCalledWith(target, 'abc', {
      delay: 60,
    })
  })

  it('preserves explicit zero delay as public typeInto cadence opt-out', async () => {
    const { orchestrator, target, text } = createHarness()

    await expect(
      orchestrator.typeInto(css('#target-1'), 'abc', { delay: 0 }),
    ).resolves.toBeUndefined()

    expect(text.typeInto).toHaveBeenCalledWith(target, 'abc', {
      delay: 0,
    })
  })

  it('uses the default public typeInto cadence between grapheme inputs', async () => {
    const { input, orchestrator, timeline } = createRealTextHarness()

    await expect(orchestrator.typeInto(css('#target-1'), 'abc')).resolves.toBeUndefined()

    expect(timeline.delay).toHaveBeenCalledTimes(2)
    expect(timeline.delay).toHaveBeenNthCalledWith(1, 60, {})
    expect(timeline.delay).toHaveBeenNthCalledWith(2, 60, {})
    expect(input.value).toBe('abc')
  })

  it('clears typing state when public typeInto is cancelled during default cadence', async () => {
    const controlledTimeline = createBlockingTimeline()
    const controller = new AbortController()
    const { input, orchestrator, store } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
    })

    const result = orchestrator.typeInto(css('#target-1'), 'ab', {
      signal: controller.signal,
    })

    await vi.waitFor(() => {
      expect(controlledTimeline.pendingDelayCount).toBe(1)
    })
    expect(input.value).toBe('a')
    expect(store.snapshot().typing).toMatchObject({ id: 'target-1' })

    controller.abort('user stopped')

    await expect(result).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
    })
    expect(store.snapshot().typing).toBeNull()
  })

  it('clears typing state when public typeInto times out during default cadence', async () => {
    vi.useFakeTimers()
    const controlledTimeline = createBlockingTimeline()
    const { input, orchestrator, store } = createRealTextHarness({
      timeline: controlledTimeline.timeline,
    })

    try {
      const result = orchestrator.typeInto(css('#target-1'), 'ab', {
        timeout: 25,
      })

      await vi.waitFor(() => {
        expect(controlledTimeline.pendingDelayCount).toBe(1)
      })
      expect(input.value).toBe('a')
      expect(store.snapshot().typing).toMatchObject({ id: 'target-1' })

      const expectation = expect(result).rejects.toMatchObject({
        code: 'ACTION_TIMEOUT',
        details: { operation: 'text.typeInto', timeout: 25 },
      })

      await vi.advanceTimersByTimeAsync(25)
      await expectation
      expect(store.snapshot().typing).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('surrounds typeInto with visual highlight and typing hooks', async () => {
    const { calls, orchestrator } = createHarness({ enableVisual: true })

    await expect(orchestrator.typeInto(css('#target-1'), 'hello')).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'visual.highlight',
      'interactability.canType',
      'visual.typing:true',
      'text.typeInto',
      'visual.typing:false',
      'wait.settle',
    ])
  })

  it('routes focus and typing state effects to DOM state and visual feedback independently', () => {
    const { state, store, target, visual } = createHarness({ enableVisual: true })

    store.setFocused(target, true)
    store.setTyping(target)
    store.setTyping(null)

    expect(state.applyStateEffects).toHaveBeenNthCalledWith(1, [
      { kind: 'focus', target: expect.objectContaining({ id: target.id }), active: true },
      {
        kind: 'focus-visible',
        target: expect.objectContaining({ id: target.id }),
        active: true,
      },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(2, [
      { kind: 'typing', target: expect.objectContaining({ id: target.id }), active: true },
    ])
    expect(state.applyStateEffects).toHaveBeenNthCalledWith(3, [
      { kind: 'typing', target: expect.objectContaining({ id: target.id }), active: false },
    ])
    expect(visual.showFocus).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.showTyping).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: true,
    })
    expect(visual.showTyping).toHaveBeenCalledWith({
      target: expect.objectContaining({ id: target.id }),
      active: false,
    })
  })

  it('records focus visual failures as warnings without failing state updates', () => {
    const visual = {
      showCursor: vi.fn(),
      highlightTarget: vi.fn(),
      showClick: vi.fn(),
      showFocus: vi.fn(() => {
        throw new Error('focus overlay blocked')
      }),
      showTyping: vi.fn(),
      showKeystroke: vi.fn(),
      clearFeedback: vi.fn(),
      hide: vi.fn(),
      destroy: vi.fn(),
    }
    const { store, target, trace } = createHarness({ visual })

    expect(() => store.setFocused(target, true)).not.toThrow()

    expect(trace.getTrace().warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: 'Visual layer update failed.',
          details: expect.objectContaining({
            effect: 'showFocus',
            error: 'focus overlay blocked',
          }),
        }),
      ]),
    )
  })

  it('waitFor delegates to the wait observation engine and records an action span', async () => {
    const { orchestrator, trace, wait } = createHarness()
    const condition = { kind: 'custom', predicate: () => true }
    const result = { condition, satisfied: true, strategy: 'settled' }
    wait.waitFor.mockResolvedValue(result)

    await expect(orchestrator.waitFor(condition, { timeout: 10 })).resolves.toBe(result)

    expect(wait.waitFor).toHaveBeenCalledWith(condition, { timeout: 10 })
    expect(trace.getTrace().spans.at(-1)).toEqual(
      expect.objectContaining({
        name: 'action.waitFor',
        status: 'ok',
        attributes: expect.objectContaining({
          action: 'waitFor',
          completed: true,
          output: {
            conditionKind: 'custom',
            satisfied: true,
            strategy: 'settled',
          },
        }),
      }),
    )
  })
})
