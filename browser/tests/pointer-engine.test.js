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

function createControlledTimeline() {
  let now = 0
  const pendingFrames = []

  return {
    timeline: {
      now: vi.fn(() => now),
      delay: vi.fn(async (duration) => {
        now += duration
      }),
      nextFrame: vi.fn(
        () =>
          new Promise((resolve) => {
            pendingFrames.push(resolve)
          }),
      ),
      settle: vi.fn(async () => {}),
      withTimeout: vi.fn(async (operation) => operation),
    },
    get pendingFrameCount() {
      return pendingFrames.length
    },
    step(frameInterval = 16) {
      const resolve = pendingFrames.shift()

      if (!resolve) {
        throw new Error('No pending frame to resolve.')
      }

      now += frameInterval
      resolve(now)
    },
  }
}

async function flushResolvedFrame(controlledTimeline, frameInterval = 16) {
  controlledTimeline.step(frameInterval)
  await Promise.resolve()
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

  it('accepts a linear motion profile as a skeleton hook for duration movement', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo({ x: 100, y: 0 }, { motion: { kind: 'linear', duration: 100 } })

    expect(timeline.nextFrame).toHaveBeenCalledTimes(4)
    expect(events.map((event) => event.point)).toEqual([
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(engine.getState().motion).toMatchObject({
      status: 'idle',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
    })
  })

  it('emits deterministic eased frame positions for an explicit easing profile', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'ease', easing: 'ease-in-out', duration: 100 } },
    )

    expect(timeline.nextFrame).toHaveBeenCalledTimes(4)
    expect(events.map((event) => event.point)).toEqual([
      { x: 12.5, y: 0 },
      { x: 50, y: 0 },
      { x: 87.5, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(engine.getState().motion).toMatchObject({
      status: 'idle',
      from: { x: 0, y: 0 },
      to: { x: 100, y: 0 },
    })
  })

  it('emits deterministic inertia frame positions that decelerate onto the target', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo({ x: 100, y: 0 }, { motion: { kind: 'inertia', duration: 100 } })

    expect(timeline.nextFrame).toHaveBeenCalledTimes(4)
    expect(events.map((event) => event.point)).toEqual([
      { x: 57.8125, y: 0 },
      { x: 87.5, y: 0 },
      { x: 98.4375, y: 0 },
      { x: 100, y: 0 },
    ])
    expect(engine.getState()).toMatchObject({
      position: { x: 100, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
      },
    })
  })

  it('settles spring-like motion on the exact target after deterministic overshoot', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo({ x: 100, y: 0 }, { motion: { kind: 'spring', duration: 100 } })

    const path = engine.getState().motion.path

    expect(path).toHaveLength(4)
    expect(path[0].x).toBeCloseTo(136.7879, 4)
    expect(path[1].x).toBeCloseTo(86.4665, 4)
    expect(path[2].x).toBeCloseTo(104.9787, 4)
    expect(path[3]).toEqual({ x: 100, y: 0 })
    expect(events.map((event) => event.point).at(-1)).toEqual({ x: 100, y: 0 })
    expect(engine.getState()).toMatchObject({
      position: { x: 100, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
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

  it('cancels in-flight motion, clears buttons, and emits no later movement frames', async () => {
    const controlledTimeline = createControlledTimeline()
    const { engine, events } = createEngine({ timeline: controlledTimeline.timeline })

    await engine.down('primary')
    const movement = engine.moveTo({ x: 100, y: 0 }, { motion: { kind: 'ease', duration: 100 } })

    await Promise.resolve()
    expect(controlledTimeline.pendingFrameCount).toBe(1)

    await flushResolvedFrame(controlledTimeline, 25)
    expect(events.filter((event) => event.type === 'pointer:moved')).toHaveLength(1)
    expect(controlledTimeline.pendingFrameCount).toBe(1)

    await engine.cancel()
    const eventsAtCancellation = [...events]

    expect(engine.getState()).toMatchObject({
      motion: { status: 'cancelled' },
      buttons: { pressed: [], primary: null },
    })
    expect(eventsAtCancellation.at(-1)).toEqual({ type: 'pointer:cancelled' })

    await flushResolvedFrame(controlledTimeline, 25)

    await expect(movement).resolves.toMatchObject({
      motion: { status: 'cancelled' },
      buttons: { pressed: [], primary: null },
    })
    expect(events).toEqual(eventsAtCancellation)
  })
})
