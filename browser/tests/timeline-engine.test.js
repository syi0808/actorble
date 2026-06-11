import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserTimelineEngine } from '../src/timeline-engine/index.js'

describe('timeline engine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses a controllable clock and resolves delay after the requested duration', async () => {
    const timeline = new BrowserTimelineEngine()
    const settled = vi.fn()
    const promise = timeline.delay(25).then(settled)

    expect(timeline.now()).toBe(0)

    await vi.advanceTimersByTimeAsync(24)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(promise).resolves.toBeUndefined()
    expect(settled).toHaveBeenCalledOnce()
    expect(timeline.now()).toBe(25)
  })

  it('rejects delay with an Actorble cancellation error when pre-aborted', async () => {
    const timeline = new BrowserTimelineEngine()
    const controller = new AbortController()

    controller.abort('already stopped')

    await expect(timeline.delay(10, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'timeline.delay',
        reason: 'already stopped',
      },
    })
  })

  it('rejects delay with an Actorble cancellation error when cancelled in flight', async () => {
    const timeline = new BrowserTimelineEngine()
    const controller = new AbortController()
    const promise = timeline.delay(50, { signal: controller.signal })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'timeline.delay',
        reason: 'user stopped',
      },
    })

    await vi.advanceTimersByTimeAsync(10)
    controller.abort('user stopped')

    await expectation
  })

  it('resolves nextFrame on the fallback frame timer', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)

    const timeline = new BrowserTimelineEngine()
    const settled = vi.fn()
    const promise = timeline.nextFrame()

    promise.then(settled)

    await vi.advanceTimersByTimeAsync(15)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(promise).resolves.toBe(16)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('returns the operation value when withTimeout completes before the deadline', async () => {
    const timeline = new BrowserTimelineEngine()
    const operation = new Promise((resolve) => {
      setTimeout(() => resolve('done'), 10)
    })
    const promise = timeline.withTimeout(operation, 25)

    await vi.advanceTimersByTimeAsync(10)

    await expect(promise).resolves.toBe('done')
  })

  it('rejects with an Actorble timeout error when withTimeout reaches the deadline', async () => {
    const timeline = new BrowserTimelineEngine()
    const promise = timeline.withTimeout(new Promise(() => {}), 20)
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        operation: 'timeline.withTimeout',
        timeout: 20,
      },
    })

    await vi.advanceTimersByTimeAsync(20)

    await expectation
  })

  it('preserves operation rejection from withTimeout', async () => {
    const timeline = new BrowserTimelineEngine()
    const error = new Error('operation failed')

    await expect(timeline.withTimeout(Promise.reject(error), 20)).rejects.toBe(error)
  })

  it('rejects with an Actorble cancellation error when withTimeout is cancelled', async () => {
    const timeline = new BrowserTimelineEngine()
    const controller = new AbortController()
    const promise = timeline.withTimeout(new Promise(() => {}), 50, {
      signal: controller.signal,
    })
    const expectation = expect(promise).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'timeline.withTimeout',
        reason: 'scenario stopped',
      },
    })

    controller.abort('scenario stopped')

    await expectation
  })

  it('settles immediately for the none strategy', async () => {
    const timeline = new BrowserTimelineEngine()

    await expect(timeline.settle('none')).resolves.toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('settles after one frame for the next-frame strategy', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)

    const timeline = new BrowserTimelineEngine()
    const settled = vi.fn()
    const promise = timeline.settle('next-frame').then(settled)

    await vi.advanceTimersByTimeAsync(15)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    await expect(promise).resolves.toBeUndefined()
    expect(settled).toHaveBeenCalledOnce()
  })

  it('settles after a microtask and frame for the settled strategy', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)

    const timeline = new BrowserTimelineEngine()
    const settled = vi.fn()
    const promise = timeline.settle('settled').then(settled)

    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(16)

    await expect(promise).resolves.toBeUndefined()
    expect(settled).toHaveBeenCalledOnce()
  })
})
