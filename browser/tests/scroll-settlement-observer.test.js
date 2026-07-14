import { describe, expect, it, vi } from 'vitest'
import { createScrollSettlementObserver } from '../src/targeting/scroll-settlement-observer/index.js'

function metrics(x = 0, y = 0) {
  return {
    scrollLeft: x,
    scrollTop: y,
    scrollWidth: 1000,
    scrollHeight: 1000,
    clientWidth: 100,
    clientHeight: 100,
    clientLeft: 0,
    clientTop: 0,
  }
}

function createControlledTimeline() {
  let now = 0
  const frames = []

  return {
    timeline: {
      now: vi.fn(() => now),
      nextFrame: vi.fn(
        ({ signal } = {}) =>
          new Promise((resolve, reject) => {
            const entry = { resolve, reject, signal, onAbort: null }

            entry.onAbort = () => {
              const index = frames.indexOf(entry)

              if (index >= 0) {
                frames.splice(index, 1)
              }

              reject(Object.assign(new Error('cancelled'), { code: 'ACTION_CANCELLED' }))
            }
            signal?.addEventListener('abort', entry.onAbort, { once: true })
            frames.push(entry)
          }),
      ),
    },
    async frame(at) {
      now = at
      const entry = frames.shift()

      if (!entry) {
        throw new Error(`No frame scheduled at ${at}`)
      }

      entry.signal?.removeEventListener('abort', entry.onAbort)
      entry.resolve(at)
      await Promise.resolve()
    },
    get pendingFrames() {
      return frames.length
    },
  }
}

function createDom(initialOffsets) {
  const offsets = new Map(initialOffsets)
  const scrollListeners = new Map()
  const scrollEndListeners = new Map()
  const scrollDispose = vi.fn()
  const scrollEndDispose = vi.fn()

  const subscribe = (listeners, target, listener, disposeSpy) => {
    listeners.set(target, listener)
    let disposed = false

    return {
      dispose() {
        if (disposed) return
        disposed = true
        listeners.delete(target)
        disposeSpy(target)
      },
    }
  }

  return {
    dom: {
      getScrollMetrics: vi.fn((target) => {
        const offset = offsets.get(target) ?? { x: 0, y: 0 }
        return metrics(offset.x, offset.y)
      }),
      observeScrollActivity: vi.fn((target, listener) =>
        subscribe(scrollListeners, target, listener, scrollDispose),
      ),
      observeScrollEnd: vi.fn((target, listener) =>
        subscribe(scrollEndListeners, target, listener, scrollEndDispose),
      ),
    },
    set(target, x, y) {
      offsets.set(target, { x, y })
    },
    emitScroll(target) {
      scrollListeners.get(target)?.(metrics(offsets.get(target)?.x, offsets.get(target)?.y))
    },
    emitScrollEnd(target) {
      scrollEndListeners.get(target)?.(metrics(offsets.get(target)?.x, offsets.get(target)?.y))
    },
    scrollDispose,
    scrollEndDispose,
  }
}

describe('scroll settlement observer', () => {
  it('uses stable frames plus the default quiet window before completing', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 0, y: 0 }]])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const settled = vi.fn()
    const promise = observer.settle([surface]).then(settled)

    await controlled.frame(16)
    await controlled.frame(32)
    expect(settled).not.toHaveBeenCalled()

    await controlled.frame(80)
    await expect(promise).resolves.toBeUndefined()
    expect(port.scrollDispose).toHaveBeenCalledOnce()
    expect(port.scrollEndDispose).toHaveBeenCalledOnce()
    expect(controlled.pendingFrames).toBe(0)
  })

  it('keeps threshold jitter stable but resets the quiet window on scroll activity', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 0, y: 0 }]])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const settled = vi.fn()
    const promise = observer
      .settle([surface], { quietMs: 20, stableFrames: 2, threshold: 0.5 })
      .then(settled)

    port.set(surface, 0.4, 0.4)
    await controlled.frame(10)
    port.set(surface, 0.7, 0.7)
    port.emitScroll(surface)
    await controlled.frame(20)
    expect(settled).not.toHaveBeenCalled()

    await controlled.frame(30)
    await expect(promise).resolves.toBeUndefined()
  })

  it('resets stable-frame counting after a late offset change', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 0, y: 0 }]])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const settled = vi.fn()
    const promise = observer
      .settle([surface], { quietMs: 0, stableFrames: 2, threshold: 0.5 })
      .then(settled)

    await controlled.frame(10)
    port.set(surface, 0, 8)
    port.emitScroll(surface)
    await controlled.frame(20)
    await controlled.frame(30)
    expect(settled).not.toHaveBeenCalled()

    await controlled.frame(40)
    await expect(promise).resolves.toBeUndefined()
  })

  it('waits for every changed surface to become stable', async () => {
    const inner = document.createElement('div')
    const viewport = window
    const controlled = createControlledTimeline()
    const port = createDom([
      [inner, { x: 0, y: 0 }],
      [viewport, { x: 0, y: 0 }],
    ])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const settled = vi.fn()
    const promise = observer
      .settle([inner, viewport], { quietMs: 0, stableFrames: 2 })
      .then(settled)

    await controlled.frame(10)
    port.set(viewport, 0, 20)
    port.emitScroll(viewport)
    await controlled.frame(20)
    await controlled.frame(30)
    expect(settled).not.toHaveBeenCalled()

    await controlled.frame(40)
    await expect(promise).resolves.toBeUndefined()
    expect(port.scrollDispose).toHaveBeenCalledTimes(2)
    expect(port.scrollEndDispose).toHaveBeenCalledTimes(2)
  })

  it('treats native scrollend only as a hint', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 0, y: 0 }]])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const settled = vi.fn()
    const promise = observer
      .settle([surface], { quietMs: 20, stableFrames: 2 })
      .then(settled)

    port.emitScrollEnd(surface)
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    await controlled.frame(10)
    await controlled.frame(20)
    await expect(promise).resolves.toBeUndefined()
  })

  it('supports missing native scrollend while retaining the fallback', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 0, y: 0 }]])
    port.dom.observeScrollEnd.mockReturnValue(null)
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const promise = observer.settle([surface], { quietMs: 0, stableFrames: 1 })

    await controlled.frame(10)
    await expect(promise).resolves.toBeUndefined()
    expect(port.scrollDispose).toHaveBeenCalledOnce()
    expect(port.scrollEndDispose).not.toHaveBeenCalled()
  })

  it('rejects timeout and cancellation without changing current offsets', async () => {
    const surface = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([[surface, { x: 3, y: 4 }]])
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })
    const timedOut = observer.settle([surface], { quietMs: 100, timeout: 20 })

    await controlled.frame(20)
    await expect(timedOut).rejects.toMatchObject({ code: 'ACTION_TIMEOUT' })
    expect(port.dom.getScrollMetrics(surface)).toMatchObject({ scrollLeft: 3, scrollTop: 4 })

    const controller = new AbortController()
    const cancelled = observer.settle([surface], { signal: controller.signal })
    controller.abort('stop')
    await expect(cancelled).rejects.toMatchObject({ code: 'ACTION_CANCELLED' })
    expect(port.scrollDispose).toHaveBeenCalledTimes(2)
    expect(port.scrollEndDispose).toHaveBeenCalledTimes(2)
  })

  it('disposes completed subscriptions once when setup fails partway', async () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const controlled = createControlledTimeline()
    const port = createDom([
      [first, { x: 0, y: 0 }],
      [second, { x: 0, y: 0 }],
    ])
    port.dom.observeScrollActivity.mockImplementationOnce((target, listener) => {
      const subscription = createDom([[target, { x: 0, y: 0 }]])
      const disposable = subscription.dom.observeScrollActivity(target, listener)

      return {
        dispose() {
          disposable.dispose()
          port.scrollDispose(target)
        },
      }
    }).mockImplementationOnce(() => {
      throw new Error('subscription failed')
    })
    const observer = createScrollSettlementObserver({ dom: port.dom, timeline: controlled.timeline })

    await expect(observer.settle([first, second])).rejects.toThrow('subscription failed')
    expect(port.scrollDispose).toHaveBeenCalledOnce()
    expect(controlled.pendingFrames).toBe(0)
  })
})
