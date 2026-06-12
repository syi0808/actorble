import { describe, expect, it, vi } from 'vitest'
import {
  BrowserLayoutInvalidationTracker,
  NoopLayoutInvalidationTracker,
} from '../src/layout-invalidation-tracker/index.js'
import {
  NoopPointerVisualTracker,
} from '../src/pointer-visual-tracker/index.js'

function targetHandle(id = 'target-1') {
  const element = document.createElement('button')
  document.body.append(element)

  return {
    id,
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: { description: `button#${id}` },
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

describe('runner tracking scaffold', () => {
  it('provides a no-op layout invalidation tracker lifecycle', () => {
    const tracker = new NoopLayoutInvalidationTracker()

    expect(tracker.isRunning()).toBe(false)

    tracker.start()
    tracker.markDirty('manual')

    expect(tracker.isRunning()).toBe(true)

    tracker.stop()
    expect(tracker.isRunning()).toBe(false)

    expect(() => tracker.dispose()).not.toThrow()
  })

  it('coalesces multiple layout dirty signals into one frame invalidation event', async () => {
    const frame = deferred()
    const timeline = {
      now: vi.fn(() => 0),
      nextFrame: vi.fn(() => frame.promise),
    }
    const tracker = new BrowserLayoutInvalidationTracker({ timeline })
    const events = []

    tracker.subscribe((event) => {
      events.push(event)
    })
    tracker.start()
    tracker.markDirty('scroll')
    tracker.markDirty('resize')
    tracker.markDirty('mutation')

    expect(timeline.nextFrame).toHaveBeenCalledTimes(1)
    expect(events).toEqual([])

    frame.resolve(42)
    await frame.promise
    await Promise.resolve()

    expect(events).toEqual([
      {
        reason: 'scroll',
        reasons: ['scroll', 'resize', 'mutation'],
        at: 42,
        coalesced: 3,
      },
    ])
  })

  it('ignores dirty signals while stopped and clears pending invalidations on stop', async () => {
    const frame = deferred()
    const observation = { dispose: vi.fn() }
    let observed
    const dom = {
      observeLayoutInvalidations: vi.fn((listener) => {
        observed = listener
        return observation
      }),
    }
    const timeline = {
      now: vi.fn(() => 0),
      nextFrame: vi.fn(() => frame.promise),
    }
    const tracker = new BrowserLayoutInvalidationTracker({ dom, timeline })
    const events = []

    tracker.subscribe((event) => {
      events.push(event)
    })
    tracker.markDirty('manual')

    expect(timeline.nextFrame).not.toHaveBeenCalled()

    tracker.start()
    observed('scroll')
    tracker.stop()

    frame.resolve(7)
    await frame.promise
    await Promise.resolve()

    expect(observation.dispose).toHaveBeenCalledOnce()
    expect(events).toEqual([])
    expect(tracker.isRunning()).toBe(false)
  })

  it('stores pointer visual scaffold mode without applying runtime visuals', () => {
    const tracker = new NoopPointerVisualTracker()
    const target = targetHandle()

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
    })

    expect(tracker.getSnapshot()).toEqual({
      mode: {
        kind: 'targetAnchor',
        target,
        anchor: { kind: 'clickablePoint' },
        commandId: 1,
        pressed: false,
      },
    })

    tracker.clear()
    expect(tracker.getSnapshot()).toEqual({ mode: null })
  })
})
