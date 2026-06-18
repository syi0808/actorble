import { describe, expect, it, vi } from 'vitest'
import { BrowserPointerEngine } from '../src/input/pointer-engine/index.js'
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js'

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

function trackPointArrayIterations() {
  const originalIterator = Array.prototype[Symbol.iterator]
  let pointArrayIterations = 0

  Object.defineProperty(Array.prototype, Symbol.iterator, {
    configurable: true,
    writable: true,
    value: function trackedIterator() {
      if (this.length > 0 && this.every(isPointLike)) {
        pointArrayIterations += 1
      }

      return originalIterator.call(this)
    },
  })

  return {
    get pointArrayIterations() {
      return pointArrayIterations
    },
    restore() {
      Object.defineProperty(Array.prototype, Symbol.iterator, {
        configurable: true,
        writable: true,
        value: originalIterator,
      })
    },
  }
}

function isPointLike(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.x === 'number' &&
    typeof value.y === 'number'
  )
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

  it('returns immutable snapshots of recorded movement paths', async () => {
    const timeline = createTimeline(25)
    const { engine } = createEngine({ timeline })

    const result = await engine.moveTo({ x: 100, y: 0 }, { duration: 100 })

    result.motion.path.push({ x: 999, y: 999 })
    result.motion.path[0].x = -1

    expect(engine.getState().motion.path).toEqual([
      { x: 25, y: 0 },
      { x: 50, y: 0 },
      { x: 75, y: 0 },
      { x: 100, y: 0 },
    ])
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

  it('retargets in-flight motion to a dynamic endpoint without extending duration', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })
    const resolveEndpoint = vi.fn(async () => ({ x: 200, y: 0 }))

    await engine.moveTo({ x: 100, y: 0 }, { duration: 100, resolveEndpoint })

    expect(timeline.nextFrame).toHaveBeenCalledTimes(4)
    expect(resolveEndpoint).toHaveBeenCalledTimes(3)
    expect(events.map((event) => event.point.x)).toEqual([
      25,
      83.33333333333333,
      141.66666666666666,
      200,
    ])
    expect(engine.getState()).toMatchObject({
      position: { x: 200, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 200, y: 0 },
      },
    })
  })

  it('appends movement path frames without iterating the accumulated path', async () => {
    const frameCount = 64
    const timeline = createTimeline(1)
    const { engine } = createEngine({ timeline })
    const tracker = trackPointArrayIterations()

    try {
      await engine.moveTo(
        { x: frameCount, y: 0 },
        { motion: { kind: 'ease', timing: 'linear', duration: frameCount } },
      )
    } finally {
      tracker.restore()
    }

    expect(engine.getState().motion.path).toHaveLength(frameCount)
    expect(tracker.pointArrayIterations).toBe(0)
  })

  it('emits deterministic frame positions for an explicit linear timing profile', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'ease', timing: 'linear', duration: 100 } },
    )

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

  it('emits deterministic eased frame positions for an explicit timing profile', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'ease', timing: 'ease-in-out', duration: 100 } },
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

  it('emits deterministic ease-in and ease-out frame positions', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'ease', timing: 'ease-in', duration: 100 } },
    )
    await engine.moveTo(
      { x: 200, y: 0 },
      { motion: { kind: 'ease', timing: 'ease-out', duration: 100 } },
    )

    expect(timeline.nextFrame).toHaveBeenCalledTimes(8)
    expect(events.map((event) => event.point)).toEqual([
      { x: 6.25, y: 0 },
      { x: 25, y: 0 },
      { x: 56.25, y: 0 },
      { x: 100, y: 0 },
      { x: 143.75, y: 0 },
      { x: 175, y: 0 },
      { x: 193.75, y: 0 },
      { x: 200, y: 0 },
    ])
  })

  it('rejects the removed linear motion profile kind', async () => {
    const timeline = createTimeline(25)
    const { engine } = createEngine({ timeline })

    await expect(
      engine.moveTo({ x: 100, y: 0 }, { motion: { kind: 'linear', duration: 100 } }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'pointer-engine',
        profileKind: 'linear',
        supportedKinds: ['ease', 'inertia', 'spring'],
      },
    })

    expect(timeline.nextFrame).not.toHaveBeenCalled()
  })

  it('emits deterministic inertia frame positions and settles at the endpoint', async () => {
    const timeline = createTimeline(25)
    const { engine, events } = createEngine({ timeline })

    await expect(
      engine.moveTo(
        { x: 100, y: 0 },
        { motion: { kind: 'inertia', initialVelocity: 1200, deceleration: 4800 } },
      ),
    ).resolves.toMatchObject({
      position: { x: 100, y: 0 },
      previousPosition: { x: 99, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
        path: [
          { x: 19, y: 0 },
          { x: 36, y: 0 },
          { x: 51, y: 0 },
          { x: 64, y: 0 },
          { x: 75, y: 0 },
          { x: 84, y: 0 },
          { x: 91, y: 0 },
          { x: 96, y: 0 },
          { x: 99, y: 0 },
          { x: 100, y: 0 },
        ],
      },
    })

    expect(timeline.nextFrame).toHaveBeenCalledTimes(10)
    expect(events.map((event) => event.point)).toEqual([
      { x: 19, y: 0 },
      { x: 36, y: 0 },
      { x: 51, y: 0 },
      { x: 64, y: 0 },
      { x: 75, y: 0 },
      { x: 84, y: 0 },
      { x: 91, y: 0 },
      { x: 96, y: 0 },
      { x: 99, y: 0 },
      { x: 100, y: 0 },
    ])
  })

  it('cancels inertia motion and emits no later movement frames', async () => {
    const controlledTimeline = createControlledTimeline()
    const { engine, events } = createEngine({ timeline: controlledTimeline.timeline })

    await engine.down('primary')
    const movement = engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'inertia', initialVelocity: 1200, deceleration: 4800 } },
    )

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

  it('emits deterministic spring overshoot frames and settles at the endpoint', async () => {
    const timeline = createTimeline(16)
    const { engine, events } = createEngine({ timeline })

    await expect(
      engine.moveTo(
        { x: 100, y: 0 },
        { motion: { kind: 'spring', stiffness: 170, damping: 8, mass: 1 } },
      ),
    ).resolves.toMatchObject({
      position: { x: 100, y: 0 },
      motion: {
        status: 'idle',
        from: { x: 0, y: 0 },
        to: { x: 100, y: 0 },
      },
    })

    const path = engine.getState().motion.path

    expect(path.at(-1)).toEqual({ x: 100, y: 0 })
    expect(path.some((point) => point.x > 100)).toBe(true)
    expect(path).toHaveLength(events.filter((event) => event.type === 'pointer:moved').length)
    expect(events.map((event) => event.point)).toEqual(path)
    expect(timeline.nextFrame).toHaveBeenCalledTimes(path.length - 1)
    expect(path.length).toBeLessThan(120)
  })

  it('cancels spring motion and emits no later movement frames', async () => {
    const controlledTimeline = createControlledTimeline()
    const { engine, events } = createEngine({ timeline: controlledTimeline.timeline })

    await engine.down('primary')
    const movement = engine.moveTo(
      { x: 100, y: 0 },
      { motion: { kind: 'spring', stiffness: 170, damping: 8, mass: 1 } },
    )

    await Promise.resolve()
    expect(controlledTimeline.pendingFrameCount).toBe(1)

    await flushResolvedFrame(controlledTimeline, 16)
    expect(events.filter((event) => event.type === 'pointer:moved')).toHaveLength(1)
    expect(controlledTimeline.pendingFrameCount).toBe(1)

    await engine.cancel()
    const eventsAtCancellation = [...events]

    expect(engine.getState()).toMatchObject({
      motion: { status: 'cancelled' },
      buttons: { pressed: [], primary: null },
    })
    expect(eventsAtCancellation.at(-1)).toEqual({ type: 'pointer:cancelled' })

    await flushResolvedFrame(controlledTimeline, 16)

    await expect(movement).resolves.toMatchObject({
      motion: { status: 'cancelled' },
      buttons: { pressed: [], primary: null },
    })
    expect(events).toEqual(eventsAtCancellation)
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
