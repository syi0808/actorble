import { describe, expect, it, vi } from 'vitest'
import { BrowserPointerEngine } from '../src/pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../src/pointer-signals/index.js'

function createTimeline(frameInterval = 16) {
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

function createEngine(options = {}) {
  const signals = options.signals ?? new BrowserPointerSignalBus()
  const timeline = options.timeline ?? createTimeline()
  const events = []

  signals.subscribe((signal) => events.push(signal))

  return {
    engine: new BrowserPointerEngine({
      signals,
      timeline,
      ...options.engineOptions,
    }),
    events,
    timeline,
  }
}

describe('BrowserPointerEngine', () => {
  it('starts with deterministic immutable pointer state', () => {
    const { engine } = createEngine()
    const state = engine.getState()

    expect(state).toMatchObject({
      id: 'pointer-1',
      position: { x: 0, y: 0 },
      previousPosition: null,
      motion: { status: 'idle' },
      buttons: { pressed: [], primary: null },
      surface: { id: null, coordinateSpace: 'viewport' },
    })

    state.buttons.pressed.push('primary')
    state.motion.path?.push({ x: 10, y: 10 })

    expect(engine.getState().buttons.pressed).toEqual([])
    expect(engine.getState().motion.path).toBeUndefined()
  })

  it('moves immediately and emits one moved signal', async () => {
    const { engine, events } = createEngine()

    await expect(engine.moveTo({ x: 100, y: 50 })).resolves.toMatchObject({
      position: { x: 100, y: 50 },
      previousPosition: { x: 0, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 50 },
        path: [{ x: 100, y: 50 }],
      },
    })

    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 100, y: 50 },
        previousPoint: { x: 0, y: 0 },
      },
    ])
  })

  it('moves over duration with ordered intermediate and final moved signals', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo({ x: 100, y: 0 }, { duration: 100 })

    expect(timeline.nextFrame).toHaveBeenCalledTimes(4)
    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 25, y: 0 },
        previousPoint: { x: 0, y: 0 },
      },
      {
        type: 'pointer:moved',
        point: { x: 50, y: 0 },
        previousPoint: { x: 25, y: 0 },
      },
      {
        type: 'pointer:moved',
        point: { x: 75, y: 0 },
        previousPoint: { x: 50, y: 0 },
      },
      {
        type: 'pointer:moved',
        point: { x: 100, y: 0 },
        previousPoint: { x: 75, y: 0 },
      },
    ])
    expect(engine.getState()).toMatchObject({
      position: { x: 100, y: 0 },
      previousPosition: { x: 75, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        path: [
          { x: 25, y: 0 },
          { x: 50, y: 0 },
          { x: 75, y: 0 },
          { x: 100, y: 0 },
        ],
      },
    })
  })

  it('updates pressed buttons and primary button while emitting down and up signals', async () => {
    const { engine, events } = createEngine()

    await engine.down('primary')
    await engine.down('secondary')
    await engine.down('primary')
    await engine.up('primary')

    expect(engine.getState().buttons).toEqual({
      pressed: ['secondary'],
      primary: 'secondary',
    })
    expect(events).toEqual([
      {
        type: 'pointer:down',
        point: { x: 0, y: 0 },
        button: 'primary',
      },
      {
        type: 'pointer:down',
        point: { x: 0, y: 0 },
        button: 'secondary',
      },
      {
        type: 'pointer:down',
        point: { x: 0, y: 0 },
        button: 'primary',
      },
      {
        type: 'pointer:up',
        point: { x: 0, y: 0 },
        button: 'primary',
      },
    ])
  })

  it('cancels movement, clears buttons, and emits cancellation', async () => {
    const { engine, events } = createEngine()

    await engine.down('primary')
    await engine.cancel()

    expect(engine.getState()).toMatchObject({
      motion: { status: 'cancelled' },
      buttons: { pressed: [], primary: null },
    })
    expect(events.at(-1)).toEqual({ type: 'pointer:cancelled' })
  })
})
