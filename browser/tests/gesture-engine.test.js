import { describe, expect, it, vi } from 'vitest'
import { BrowserGestureEngine, createGestureEngine } from '../src/input/gesture-engine/index.js'
import { BrowserPointerEngine } from '../src/input/pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'
import { cancellationError } from '../src/shared/index.js'

function createTimeline(calls) {
  return {
    now: vi.fn(() => 0),
    delay: vi.fn(async (duration, options) => {
      if (calls) {
        const hasOptions = options !== undefined && Object.keys(options).length > 0

        calls.push(hasOptions ? ['delay', duration, options] : ['delay', duration])
      }
    }),
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
  const timeline = createTimeline(calls)
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
    timeline,
  }
}

describe('BrowserGestureEngine', () => {
  it('click composes move, down, press dwell, and up pointer operations in order', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(engine.click(createTarget(), { x: 40, y: 24 })).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 40, y: 24 }],
      ['down', 'primary'],
      ['delay', 80],
      ['up', 'primary'],
    ])
  })

  it('refreshes the click point after movement and before pointer down', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(
      engine.click(createTarget(), { x: 40, y: 24 }, {
        refreshPointBeforeDown: vi.fn(async (point) => {
          calls.push(['refreshPointBeforeDown', point])
          return { x: 45, y: 29 }
        }),
      }),
    ).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 40, y: 24 }],
      ['refreshPointBeforeDown', { x: 40, y: 24 }],
      ['moveTo', { x: 45, y: 29 }, { duration: 0 }],
      ['down', 'primary'],
      ['delay', 80],
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
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await engine.click(createTarget(), { x: 5, y: 9 }, { button: 'secondary' })

    expect(calls).toEqual([
      ['moveTo', { x: 5, y: 9 }],
      ['down', 'secondary'],
      ['delay', 80],
      ['up', 'secondary'],
    ])
  })

  it('click supports a multi-click sequence without moving between clicks', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(
      engine.click(createTarget(), { x: 5, y: 9 }, { clickCount: 2, pressDwell: 0 }),
    ).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 5, y: 9 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
  })

  it('doubleClick composes two pointer down/up sequences after one move', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(
      engine.doubleClick(createTarget(), { x: 6, y: 10 }, { pressDwell: 0 }),
    ).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 6, y: 10 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
  })

  it('refreshes the pointer point before each click in a multi-click sequence', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(
      engine.click(createTarget(), { x: 10, y: 20 }, {
        clickCount: 2,
        pressDwell: 0,
        refreshPointBeforeDown: vi
          .fn()
          .mockImplementationOnce(async (point) => {
            calls.push(['refreshPointBeforeDown', point])
            return { x: 11, y: 21 }
          })
          .mockImplementationOnce(async (point) => {
            calls.push(['refreshPointBeforeDown', point])
            return { x: 12, y: 22 }
          }),
      }),
    ).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 10, y: 20 }],
      ['refreshPointBeforeDown', { x: 10, y: 20 }],
      ['moveTo', { x: 11, y: 21 }, { duration: 0 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['refreshPointBeforeDown', { x: 11, y: 21 }],
      ['moveTo', { x: 12, y: 22 }, { duration: 0 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
  })

  it('routes explicit click movement options into pointer movement before pressing', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

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
      ['delay', 80],
      ['up', 'primary'],
    ])
  })

  it('lets callers disable or customize click press dwell', async () => {
    const first = createFakePointer()
    const firstEngine = new BrowserGestureEngine({
      pointer: first.pointer,
      timeline: first.timeline,
    })

    await firstEngine.click(createTarget(), { x: 1, y: 2 }, { pressDwell: 0 })

    expect(first.calls).toEqual([
      ['moveTo', { x: 1, y: 2 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ])
    expect(first.timeline.delay).not.toHaveBeenCalled()

    const second = createFakePointer()
    const secondEngine = new BrowserGestureEngine({
      pointer: second.pointer,
      timeline: second.timeline,
    })
    const controller = new AbortController()

    await secondEngine.click(createTarget(), { x: 3, y: 4 }, {
      pressDwell: 24,
      signal: controller.signal,
    })

    expect(second.calls).toEqual([
      ['moveTo', { x: 3, y: 4 }, { signal: controller.signal }],
      ['down', 'primary'],
      ['delay', 24, { signal: controller.signal }],
      ['up', 'primary'],
    ])
  })

  it('cancels pointer state when click dwell is cancelled after pointer down', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    timeline.delay.mockImplementationOnce(async (duration, options) => {
      const hasOptions = options !== undefined && Object.keys(options).length > 0

      calls.push(hasOptions ? ['delay', duration, options] : ['delay', duration])
      throw cancellationError('timeline.delay', 'scenario stopped')
    })

    await expect(engine.click(createTarget(), { x: 3, y: 4 })).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'timeline.delay',
        reason: 'scenario stopped',
      },
    })

    expect(calls).toEqual([
      ['moveTo', { x: 3, y: 4 }],
      ['down', 'primary'],
      ['delay', 80],
      ['cancel'],
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

  it('drag composes move, down, move, and up pointer operations in order', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })

    await expect(engine.drag({ x: 1, y: 1 }, { x: 10, y: 10 })).resolves.toEqual({
      completed: true,
    })

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 1 }],
      ['down', 'primary'],
      ['moveTo', { x: 10, y: 10 }],
      ['up', 'primary'],
    ])
  })

  it('routes drag cancellation options into pointer movement without force', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })
    const controller = new AbortController()

    await engine.drag(
      { x: 2, y: 3 },
      { x: 20, y: 30 },
      {
        timeout: 1200,
        signal: controller.signal,
        duration: 420,
        motion: { kind: 'ease', easing: 'ease-in-out', duration: 420 },
        force: true,
      },
    )

    expect(calls).toEqual([
      [
        'moveTo',
        { x: 2, y: 3 },
        {
          timeout: 1200,
          signal: controller.signal,
          duration: 420,
          motion: { kind: 'ease', easing: 'ease-in-out', duration: 420 },
        },
      ],
      ['down', 'primary'],
      [
        'moveTo',
        { x: 20, y: 30 },
        {
          timeout: 1200,
          signal: controller.signal,
          duration: 420,
          motion: { kind: 'ease', easing: 'ease-in-out', duration: 420 },
        },
      ],
      ['up', 'primary'],
    ])
  })

  it('drag emits the expected synthetic pointer signal sequence', async () => {
    const signals = new BrowserPointerSignalBus()
    const timeline = createTimeline()
    const events = []

    signals.subscribe((signal) => events.push(signal))

    const engine = createGestureEngine({
      pointer: new BrowserPointerEngine({ signals, timeline }),
    })

    await engine.drag({ x: 4, y: 8 }, { x: 40, y: 80 })

    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 4, y: 8 },
        previousPoint: { x: 0, y: 0 },
      },
      {
        type: 'pointer:down',
        point: { x: 4, y: 8 },
        button: 'primary',
      },
      {
        type: 'pointer:moved',
        point: { x: 40, y: 80 },
        previousPoint: { x: 4, y: 8 },
      },
      {
        type: 'pointer:up',
        point: { x: 40, y: 80 },
        button: 'primary',
      },
    ])
  })

  it('drag cancels pressed pointer state when movement fails after down', async () => {
    const { calls, pointer, timeline } = createFakePointer()
    const engine = new BrowserGestureEngine({ pointer, timeline })
    const failure = new Error('drag move failed')

    pointer.moveTo
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point])
        return pointer.getState()
      })
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point])
        throw failure
      })

    await expect(engine.drag({ x: 1, y: 1 }, { x: 10, y: 10 })).rejects.toBe(failure)

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 1 }],
      ['down', 'primary'],
      ['moveTo', { x: 10, y: 10 }],
      ['cancel'],
    ])
  })
})
