import { describe, expect, it, vi } from 'vitest'
import { BrowserActionOrchestrator } from '../src/action-orchestrator/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics-trace/index.js'
import { BrowserInteractionStateStore } from '../src/interaction-state-store/index.js'
import { BrowserPointerSignalBus } from '../src/pointer-signals/index.js'
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

function createHarness(options = {}) {
  const calls = []
  const target = options.target ?? targetHandle()
  const geometry = options.geometry ?? geometryFor(target)
  const signals = new BrowserPointerSignalBus()
  const trace = createTrace()
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
  const gesture = {
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
      signals.emit({ type: 'pointer:cancelled' })
      return { completed: false }
    }),
  }
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
  const state = {
    applyStateEffects: vi.fn((effects) => {
      if (effects.length > 0) {
        calls.push(`state.${effects.map((effect) => `${effect.kind}:${effect.active}`).join(',')}`)
      }
    }),
    cleanup: vi.fn(() => {
      calls.push('state.cleanup')
    }),
  }
  const store = new BrowserInteractionStateStore()
  const orchestrator = new BrowserActionOrchestrator({
    resolver,
    surface,
    geometry: geometryEngine,
    interactability,
    gesture,
    focus,
    text,
    wait,
    trace,
    store,
    events,
    state,
    signals,
  })

  return {
    calls,
    events,
    gesture,
    geometry,
    interactability,
    orchestrator,
    resolver,
    state,
    target,
    text,
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

  it('typeInto resolves and checks type interactability before delegating text input', async () => {
    const { calls, orchestrator, target, text } = createHarness()

    await expect(orchestrator.typeInto(css('#target-1'), 'hello')).resolves.toBeUndefined()

    expect(calls).toEqual([
      'resolver.resolve',
      'resolver.validate',
      'surface.ensureVisible',
      'geometry.snapshot',
      'interactability.canType',
      'text.typeInto',
      'wait.settle',
    ])
    expect(text.typeInto).toHaveBeenCalledWith(target, 'hello', {})
  })
})
