import { describe, expect, it, vi } from 'vitest'
import { BrowserGestureEngine, createGestureEngine } from '../src/gesture-engine/index.js'
import { BrowserPointerEngine } from '../src/pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../src/pointer-signals/index.js'

function createTimeline() {
  return {
    now: vi.fn(() => 0),
    delay: vi.fn(async () => {}),
    nextFrame: vi.fn(async () => 0),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  }
}

function createTarget(id = 'target-1') {
  const element = document.createElement('button')

  return {
    id,
    element,
    resolvedAt: 0,
    root: document,
    validity: 'live',
    debug: { description: `button#${id}` },
  }
}

function createFakePointer() {
  const calls = []
  const state = {
    id: 'pointer-1',
    position: { x: 0, y: 0 },
    previousPosition: null,
    motion: { status: 'idle' },
    buttons: { pressed: [], primary: null },
    surface: { id: null, coordinateSpace: 'viewport' },
  }

  return {
    calls,
    pointer: {
      getState: vi.fn(() => state),
      moveTo: vi.fn(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point])
        return state
      }),
      down: vi.fn(async (button) => {
        calls.push(['down', button])
        return state
      }),
      up: vi.fn(async (button) => {
        calls.push(['up', button])
        return state
      }),
      cancel: vi.fn(async () => {
        calls.push(['cancel'])
        return state
      }),
    },
  }
}

describe('BrowserGestureEngine', () => {
  it('click composes move, down, and up pointer operations in order', async () => {
    const { calls, pointer } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer })

    await expect(engine.click(createTarget(), { x: 40, y: 24 })).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 40, y: 24 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
  })

  it('click emits the expected pointer signal sequence through the pointer boundary', async () => {
    const signals = new BrowserPointerSignalBus()
    const timeline = createTimeline()
    const events = []

    signals.subscribe((signal) => events.push(signal))

    const engine = new BrowserGestureEngine({
      pointer: new BrowserPointerEngine({ signals, timeline }),
    })

    await engine.click(createTarget(), { x: 12, y: 18 })

    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 12, y: 18 },
        previousPoint: { x: 0, y: 0 },
      },
      {
        type: 'pointer:down',
        point: { x: 12, y: 18 },
        button: 'primary',
      },
      {
        type: 'pointer:up',
        point: { x: 12, y: 18 },
        button: 'primary',
      },
    ])
  })

  it('click passes the requested pointer button through down and up', async () => {
    const { calls, pointer } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer })

    await engine.click(createTarget(), { x: 5, y: 9 }, { button: 'secondary' })

    expect(calls).toEqual([
      ['moveTo', { x: 5, y: 9 }],
      ['down', 'secondary'],
      ['up', 'secondary'],
    ])
  })

  it('routes explicit click movement options into pointer movement before pressing', async () => {
    const { calls, pointer } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer })

    await engine.click(createTarget(), { x: 12, y: 18 }, {
      motion: { kind: 'spring', duration: 260 },
      timeout: 1500,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 12, y: 18 }, {
        motion: { kind: 'spring', duration: 260 },
        timeout: 1500,
      }],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
  })

  it('hover only moves the pointer', async () => {
    const { calls, pointer } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer })

    await expect(engine.hover({ x: 3, y: 4 })).resolves.toEqual({ completed: true })

    expect(calls).toEqual([['moveTo', { x: 3, y: 4 }]])
  })

  it('cancel delegates to pointer cancellation for orchestrator cleanup', async () => {
    const { calls, pointer } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer })

    await expect(engine.cancel()).resolves.toEqual({ completed: false })

    expect(calls).toEqual([['cancel']])
  })

  it('keeps multi-click, double-click, and drag as explicit capability extension points', async () => {
    const engine = createGestureEngine({ pointer: createFakePointer().pointer })
    const target = createTarget()

    await expect(engine.click(target, { x: 1, y: 1 }, { clickCount: 2 })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { gesture: 'click', extensionPoint: 'multi-click' },
    })
    await expect(engine.doubleClick(target, { x: 1, y: 1 })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { gesture: 'doubleClick' },
    })
    await expect(engine.drag({ x: 1, y: 1 }, { x: 10, y: 10 })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { gesture: 'drag', capability: 'pointer-gesture' },
    })
  })
})
