import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserSurfaceEngine, createSurfaceEngine } from '../src/targeting/surface-engine/index.js'
import { createFrameGeometrySurfaceCache } from '../src/targeting/frame-geometry-surface-cache/index.js'
import { css, element } from '../src/shared/index.js'

function targetHandle(id, target, options = {}) {
  return {
    id,
    element: target,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
    ...options,
  }
}

function createDomPort(overrides = {}) {
  const root = document

  return {
    getRoot: vi.fn(() => root),
    querySelectorAll: vi.fn(() => []),
    getBoundingClientRect: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    getComputedStyle: vi.fn((element) => getComputedStyle(element)),
    elementFromPoint: vi.fn(() => null),
    contains: vi.fn((parent, child) => parent.contains(child)),
    isConnected: vi.fn((element) => element.isConnected),
    getActiveElement: vi.fn(() => document.activeElement),
    describeElement: vi.fn(() => ({})),
    getViewportRect: vi.fn(() => ({ x: 0, y: 0, width: 1024, height: 768 })),
    getParentElement: vi.fn((element) => element.parentElement),
    getScrollMetrics: vi.fn((target) => {
      if ('scrollWidth' in target) {
        return {
          scrollLeft: target.scrollLeft,
          scrollTop: target.scrollTop,
          scrollWidth: target.scrollWidth,
          scrollHeight: target.scrollHeight,
          clientWidth: target.clientWidth,
          clientHeight: target.clientHeight,
        }
      }

      return {
        scrollLeft: target.scrollX,
        scrollTop: target.scrollY,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: target.innerWidth,
        clientHeight: target.innerHeight,
      }
    }),
    getViewportScrollTarget: vi.fn(() => window),
    focus: vi.fn(),
    blur: vi.fn(),
    scrollIntoView: vi.fn(),
    scrollTo: vi.fn(),
    ...overrides,
  }
}

function defineScrollMetrics(element, metrics) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
    })
  }
}

function createFrameTimeline() {
  const frameResolvers = []

  return {
    timeline: {
      nextFrame: vi.fn(
        () =>
          new Promise((resolve) => {
            frameResolvers.push(resolve)
          }),
      ),
    },
    async resolveFrame(timestamp = 16) {
      frameResolvers.shift()?.(timestamp)
      await Promise.resolve()
    },
  }
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

describe('BrowserSurfaceEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('calculates the viewport surface snapshot for a target', () => {
    document.body.innerHTML = `
      <main id="app" style="overflow: auto">
        <section id="panel" style="overflow-y: scroll">
          <button id="save">Save</button>
        </section>
      </main>
    `
    const app = document.querySelector('#app')
    const panel = document.querySelector('#panel')
    const save = document.querySelector('#save')
    defineScrollMetrics(app, {
      scrollWidth: 600,
      scrollHeight: 600,
      clientWidth: 300,
      clientHeight: 300,
      scrollLeft: 0,
      scrollTop: 0,
    })
    defineScrollMetrics(panel, {
      scrollWidth: 200,
      scrollHeight: 500,
      clientWidth: 200,
      clientHeight: 150,
      scrollLeft: 0,
      scrollTop: 0,
    })
    const dom = createDomPort({
      getViewportRect: vi.fn(() => ({ x: 0, y: 0, width: 1280, height: 720 })),
    })
    const engine = new BrowserSurfaceEngine({ dom })

    const snapshot = engine.getSurfaceFor(targetHandle('target-1', save, { surfaceId: 'primary' }))

    expect(snapshot).toEqual({
      id: 'primary',
      root: document,
      coordinateSpace: 'viewport',
      viewport: { x: 0, y: 0, width: 1280, height: 720 },
      clippingChain: [panel, app],
    })
    expect(dom.getViewportRect).toHaveBeenCalledWith(document)
  })

  it('finds scrollable ancestors from nearest container to viewport', () => {
    document.body.innerHTML = `
      <div id="outer" style="overflow: auto">
        <div id="hidden" style="overflow: hidden">
          <div id="plain" style="overflow: visible">
            <div id="inner" style="overflow-y: scroll">
              <button id="save">Save</button>
            </div>
          </div>
        </div>
      </div>
    `
    const outer = document.querySelector('#outer')
    const hidden = document.querySelector('#hidden')
    const plain = document.querySelector('#plain')
    const inner = document.querySelector('#inner')
    const save = document.querySelector('#save')
    defineScrollMetrics(outer, {
      scrollWidth: 700,
      scrollHeight: 700,
      clientWidth: 300,
      clientHeight: 300,
      scrollLeft: 0,
      scrollTop: 0,
    })
    defineScrollMetrics(hidden, {
      scrollWidth: 500,
      scrollHeight: 500,
      clientWidth: 200,
      clientHeight: 200,
      scrollLeft: 0,
      scrollTop: 0,
    })
    defineScrollMetrics(plain, {
      scrollWidth: 100,
      scrollHeight: 100,
      clientWidth: 100,
      clientHeight: 100,
      scrollLeft: 0,
      scrollTop: 0,
    })
    defineScrollMetrics(inner, {
      scrollWidth: 120,
      scrollHeight: 400,
      clientWidth: 120,
      clientHeight: 120,
      scrollLeft: 0,
      scrollTop: 0,
    })
    const engine = new BrowserSurfaceEngine({ dom: createDomPort() })

    expect(engine.getScrollableAncestors(targetHandle('target-1', save))).toEqual([inner, outer])
  })

  it('keeps legacy ensureVisible internal and scrolls explicit vectors through the DOM adapter', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const dom = createDomPort()
    const engine = new BrowserSurfaceEngine({ dom })
    const handle = targetHandle('target-1', save)

    await engine.ensureVisible(handle, { block: 'center', inline: 'nearest' })
    await expect(engine.scrollTo({ x: 10, y: 20 })).resolves.toMatchObject({ changed: false })
    await expect(
      engine.scrollTo({ x: 30, y: 40 }, { motion: { kind: 'native-smooth' } }),
    ).resolves.toMatchObject({ changed: false })
    await expect(engine.scrollBy({ x: 5, y: -2 })).resolves.toMatchObject({ changed: false })

    expect(dom.scrollIntoView).toHaveBeenCalledWith(save, { block: 'center', inline: 'nearest' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(1, window, { x: 10, y: 20 }, { behavior: 'instant' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(2, window, { x: 30, y: 40 }, { behavior: 'smooth' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(3, window, { x: 5, y: -2 }, { behavior: 'instant' })
    expect(dom.getViewportScrollTarget).toHaveBeenCalledWith(document)
  })

  it('reports the public reveal engine as intentionally deferred to T49', async () => {
    const engine = createSurfaceEngine({ dom: createDomPort() })

    await expect(engine.reveal(targetHandle('target-1'))).rejects.toMatchObject({
      code: 'NOT_IMPLEMENTED',
      details: { boundary: 'SurfaceEngine.reveal' },
    })
  })

  it('rejects timed motion and observed settlement until their engine tasks land', async () => {
    const engine = createSurfaceEngine({ dom: createDomPort() })

    await expect(
      engine.scrollTo({ x: 10, y: 20 }, { motion: { kind: 'timed', duration: 100 } }),
    ).rejects.toMatchObject({ code: 'PLATFORM_UNSUPPORTED' })
    await expect(
      engine.scrollBy({ x: 1, y: 2 }, { settle: 'scroll-stable' }),
    ).rejects.toMatchObject({ code: 'PLATFORM_UNSUPPORTED' })
  })

  it('maps viewport and document points with the viewport scroll offset only', () => {
    const dom = createDomPort({
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: 100,
        scrollTop: 50,
        scrollWidth: 1000,
        scrollHeight: 800,
        clientWidth: 500,
        clientHeight: 300,
      })),
    })
    const engine = createSurfaceEngine({ dom })

    expect(engine.mapPoint({ x: 1, y: 2 }, 'viewport', 'viewport')).toEqual({ x: 1, y: 2 })
    expect(engine.mapPoint({ x: 1, y: 2 }, 'viewport', 'document')).toEqual({ x: 101, y: 52 })
    expect(engine.mapPoint({ x: 101, y: 52 }, 'document', 'viewport')).toEqual({ x: 1, y: 2 })
    expect(() => engine.mapPoint({ x: 1, y: 2 }, 'viewport', 'surface')).toThrowError(
      expect.objectContaining({
        code: 'PLATFORM_UNSUPPORTED',
        details: expect.objectContaining({
          from: 'viewport',
          to: 'surface',
          point: { x: 1, y: 2 },
        }),
      }),
    )
  })

  it('reuses scrollable ancestor discovery within a frame and refreshes after layout invalidation', () => {
    const clip = document.createElement('section')
    const save = document.createElement('button')
    let scrollable = true
    const dom = createDomPort({
      getParentElement: vi.fn((element) => (element === save ? clip : null)),
      getComputedStyle: vi.fn(() => ({
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: scrollable ? 'scroll' : 'visible',
      })),
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 100,
        scrollHeight: scrollable ? 200 : 100,
        clientWidth: 100,
        clientHeight: 100,
      })),
    })
    const { timeline } = createFrameTimeline()
    const invalidation = createManualLayoutInvalidationTracker()
    const cache = createFrameGeometrySurfaceCache({
      timeline,
      layoutInvalidation: invalidation.tracker,
    })
    const engine = new BrowserSurfaceEngine({ dom, cache })
    const handle = targetHandle('target-1', save)

    expect(engine.getSurfaceFor(handle).clippingChain).toEqual([clip])
    expect(engine.getSurfaceFor(handle).clippingChain).toEqual([clip])
    expect(engine.getScrollableAncestors(handle)).toEqual([clip])
    expect(dom.getComputedStyle).toHaveBeenCalledTimes(1)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(1)
    expect(dom.getViewportRect).toHaveBeenCalledTimes(1)
    expect(timeline.nextFrame).toHaveBeenCalledTimes(1)

    scrollable = false
    invalidation.emit('resize')

    expect(engine.getSurfaceFor(handle).clippingChain).toEqual([])
    expect(dom.getComputedStyle).toHaveBeenCalledTimes(2)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(2)
    expect(dom.getViewportRect).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached surface reads after scroll writes', async () => {
    const clip = document.createElement('section')
    const save = document.createElement('button')
    let scrollable = true
    const dom = createDomPort({
      getParentElement: vi.fn((element) => (element === save ? clip : null)),
      getComputedStyle: vi.fn(() => ({
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: scrollable ? 'scroll' : 'visible',
      })),
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 100,
        scrollHeight: scrollable ? 200 : 100,
        clientWidth: 100,
        clientHeight: 100,
      })),
    })
    const cache = createFrameGeometrySurfaceCache({ timeline: createFrameTimeline().timeline })
    const engine = new BrowserSurfaceEngine({ dom, cache })
    const handle = targetHandle('target-1', save)

    expect(engine.getScrollableAncestors(handle)).toEqual([clip])
    scrollable = false
    await engine.ensureVisible(handle)
    expect(engine.getScrollableAncestors(handle)).toEqual([])

    expect(dom.scrollIntoView).toHaveBeenCalledWith(save, undefined)
    expect(dom.getComputedStyle).toHaveBeenCalledTimes(2)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(2)
  })
})
