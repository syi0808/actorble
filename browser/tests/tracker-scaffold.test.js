import { describe, expect, it, vi } from 'vitest'
import {
  BrowserLayoutInvalidationTracker,
  NoopLayoutInvalidationTracker,
} from '../src/targeting/layout-invalidation-tracker/index.js'
import {
  BrowserPointerVisualTracker,
  NoopPointerVisualTracker,
} from '../src/visual/pointer-visual-tracker/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { actorbleError } from '../src/shared/index.js'

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

function geometryFor(target, point = { x: 20, y: 30 }) {
  return {
    target,
    rect: { x: point.x - 10, y: point.y - 10, width: 20, height: 20 },
    visibleRect: { x: point.x - 10, y: point.y - 10, width: 20, height: 20 },
    center: point,
    clickablePoint: {
      ok: true,
      point,
      strategy: 'center',
    },
    coordinateSpace: 'viewport',
    computedAt: 1000,
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

function createManualLayoutInvalidationTracker() {
  const listeners = []

  return {
    tracker: {
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn(() => true),
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
    emit(reason = 'scroll') {
      for (const listener of [...listeners]) {
        listener({
          reason,
          reasons: [reason],
          at: 123,
          coalesced: 1,
        })
      }
    },
  }
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

  it('publishes read-free dirty signals synchronously before the coalesced frame event', () => {
    const timeline = {
      now: vi.fn(() => 37),
      nextFrame: vi.fn(() => new Promise(() => {})),
    }
    const tracker = new BrowserLayoutInvalidationTracker({ timeline })
    const dirty = []
    const coalesced = []

    tracker.subscribeDirty((event) => dirty.push(event))
    tracker.subscribe((event) => coalesced.push(event))
    tracker.start()
    tracker.markDirty('mutation')
    tracker.markDirty('scroll')

    expect(dirty).toEqual([
      { reason: 'mutation', at: 37 },
      { reason: 'scroll', at: 37 },
    ])
    expect(coalesced).toEqual([])
    expect(timeline.nextFrame).toHaveBeenCalledOnce()
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

  it('refreshes a target-anchor cursor when runner layout invalidation moves the target', async () => {
    const target = targetHandle()
    const layoutInvalidation = createManualLayoutInvalidationTracker()
    const updates = []
    const geometry = {
      snapshot: vi.fn(async () => geometryFor(target, { x: 44, y: 55 })),
    }
    const tracker = new BrowserPointerVisualTracker({
      geometry,
      layoutInvalidation: layoutInvalidation.tracker,
      onUpdate: (update) => updates.push(update),
    })

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
      lastPoint: { x: 20, y: 30 },
    })

    layoutInvalidation.emit('scroll')
    await vi.waitFor(() => expect(updates).toHaveLength(1))

    expect(updates[0]).toMatchObject({
      target,
      point: { x: 44, y: 55 },
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
      reason: 'scroll',
    })
    expect(tracker.getSnapshot().mode).toMatchObject({
      kind: 'targetAnchor',
      commandId: 1,
      lastPoint: { x: 44, y: 55 },
    })
  })

  it('skips target-anchor visual updates when the projected point has not meaningfully changed', async () => {
    const target = targetHandle()
    const updates = []
    const tracker = new BrowserPointerVisualTracker({
      geometry: {
        snapshot: vi.fn(async () => geometryFor(target, { x: 20, y: 30 })),
      },
      onUpdate: (update) => updates.push(update),
    })

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
      lastPoint: { x: 20, y: 30 },
    })

    await tracker.refresh('resize')

    expect(updates).toEqual([])
    expect(tracker.getSnapshot().mode).toMatchObject({
      kind: 'targetAnchor',
      commandId: 1,
      lastPoint: { x: 20, y: 30 },
    })
  })

  it('ignores stale async target-anchor refreshes after a newer command takes ownership', async () => {
    const target = targetHandle()
    const nextTarget = targetHandle('target-2')
    const firstSnapshot = deferred()
    const updates = []
    const geometry = {
      snapshot: vi.fn(() => firstSnapshot.promise),
    }
    const tracker = new BrowserPointerVisualTracker({
      geometry,
      onUpdate: (update) => updates.push(update),
    })

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: false,
      lastPoint: { x: 20, y: 30 },
    })

    const refresh = tracker.refresh('scroll')

    tracker.setMode({
      kind: 'targetAnchor',
      target: nextTarget,
      anchor: { kind: 'clickablePoint' },
      commandId: 2,
      pressed: false,
      lastPoint: { x: 70, y: 80 },
    })

    firstSnapshot.resolve(geometryFor(target, { x: 99, y: 100 }))
    await refresh

    expect(updates).toEqual([])
    expect(tracker.getSnapshot().mode).toMatchObject({
      kind: 'targetAnchor',
      target: nextTarget,
      commandId: 2,
      lastPoint: { x: 70, y: 80 },
    })
  })

  it('warns and clears target-anchor follow state when the target is detached', async () => {
    const target = targetHandle()
    const staleEvents = []
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'trace' })
    const tracker = new BrowserPointerVisualTracker({
      geometry: {
        snapshot: vi.fn(async () => {
          throw actorbleError('TARGET_DETACHED', 'target detached')
        }),
      },
      trace,
      onStale: (event) => staleEvents.push(event),
    })

    tracker.setMode({
      kind: 'targetAnchor',
      target,
      anchor: { kind: 'clickablePoint' },
      commandId: 1,
      pressed: true,
      lastPoint: { x: 20, y: 30 },
    })

    await tracker.refresh('mutation')

    expect(tracker.getSnapshot()).toEqual({ mode: null })
    expect(staleEvents).toEqual([
      expect.objectContaining({
        target,
        commandId: 1,
        reason: 'mutation',
      }),
    ])
    expect(trace.getTrace().warnings).toEqual([
      expect.objectContaining({
        message: 'Pointer visual target-anchor refresh failed.',
        details: expect.objectContaining({
          targetId: target.id,
          commandId: 1,
          reason: 'mutation',
          error: 'target detached',
        }),
      }),
    ])
  })
})
