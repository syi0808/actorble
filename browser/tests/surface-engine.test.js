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
    getViewportScrollElement: vi.fn(() => document.documentElement),
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
    getComputedScrollStyle: vi.fn((element) => {
      const style = getComputedStyle(element)
      const overflowX =
        style.overflowX === 'visible' && ['auto', 'scroll', 'overlay'].includes(style.overflow)
          ? style.overflow
          : style.overflowX || style.overflow
      const overflowY =
        style.overflowY === 'visible' && ['auto', 'scroll', 'overlay'].includes(style.overflow)
          ? style.overflow
          : style.overflowY || style.overflow
      return {
        overflowX,
        overflowY,
        scrollPadding: {
          top: style.scrollPaddingTop,
          right: style.scrollPaddingRight,
          bottom: style.scrollPaddingBottom,
          left: style.scrollPaddingLeft,
        },
        scrollMargin: {
          top: style.scrollMarginTop,
          right: style.scrollMarginRight,
          bottom: style.scrollMarginBottom,
          left: style.scrollMarginLeft,
        },
      }
    }),
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
      now: vi.fn(() => 0),
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

  it('routes next-frame and observed settlement after explicit scroll writes', async () => {
    let offset = { x: 0, y: 0 }
    const dom = createDomPort({
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: offset.x,
        scrollTop: offset.y,
        scrollWidth: 1000,
        scrollHeight: 1000,
        clientWidth: 100,
        clientHeight: 100,
      })),
      scrollTo: vi.fn((_target, position) => {
        offset = { ...position }
      }),
    })
    const controlled = createFrameTimeline()
    const settlementObserver = { settle: vi.fn(async () => {}) }
    const engine = new BrowserSurfaceEngine({
      dom,
      timeline: controlled.timeline,
      settlementObserver,
    })

    const nextFrame = engine.scrollTo({ x: 10, y: 20 }, { settle: 'next-frame' })
    expect(controlled.timeline.nextFrame).toHaveBeenCalledOnce()
    await controlled.resolveFrame()
    await expect(nextFrame).resolves.toEqual({
      changed: true,
      before: { x: 0, y: 0 },
      after: { x: 10, y: 20 },
    })

    await expect(
      engine.scrollTo(
        { x: 30, y: 40 },
        {
          motion: { kind: 'native-smooth' },
          settle: { kind: 'scroll-stable', quietMs: 12, stableFrames: 3, threshold: 0.25 },
          timeout: 100,
        },
      ),
    ).resolves.toEqual({
      changed: true,
      before: { x: 10, y: 20 },
      after: { x: 30, y: 40 },
    })
    expect(dom.scrollTo).toHaveBeenLastCalledWith(
      window,
      { x: 30, y: 40 },
      { behavior: 'smooth' },
    )
    expect(settlementObserver.settle).toHaveBeenCalledWith(
      [window],
      expect.objectContaining({
        quietMs: 12,
        stableFrames: 3,
        threshold: 0.25,
        timeout: 100,
        operation: 'surface.scrollTo',
      }),
    )
  })

  it('preserves the applied offset when observed settlement is cancelled', async () => {
    let offset = { x: 0, y: 0 }
    const dom = createDomPort({
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: offset.x,
        scrollTop: offset.y,
        scrollWidth: 1000,
        scrollHeight: 1000,
        clientWidth: 100,
        clientHeight: 100,
      })),
      scrollTo: vi.fn((_target, position) => {
        offset = { ...position }
      }),
    })
    const cancellation = Object.assign(new Error('cancelled'), { code: 'ACTION_CANCELLED' })
    const settlementObserver = { settle: vi.fn(async () => Promise.reject(cancellation)) }
    const engine = new BrowserSurfaceEngine({ dom, settlementObserver })

    await expect(
      engine.scrollBy({ x: 5, y: 6 }, { settle: 'scroll-stable' }),
    ).rejects.toMatchObject({ code: 'ACTION_CANCELLED' })
    expect(offset).toEqual({ x: 5, y: 6 })
    expect(dom.scrollTo).toHaveBeenCalledOnce()
  })

  it('returns a no-op reveal result when visibility is already satisfied', async () => {
    const target = document.createElement('button')
    const handle = targetHandle('target-1', target)
    const geometry = {
      snapshot: vi.fn(async () => ({
        target: handle,
        rect: { x: 10, y: 10, width: 20, height: 20 },
        visibleRect: { x: 10, y: 10, width: 20, height: 20 },
        coordinateSpace: 'viewport',
      })),
    }
    const engine = createSurfaceEngine({ dom: createDomPort(), geometry })

    await expect(engine.reveal(handle, { settle: 'none' })).resolves.toEqual({
      target: handle,
      changed: false,
      before: { visibilityRatio: 1, fullyVisible: true },
      after: { visibilityRatio: 1, fullyVisible: true },
      fullyVisible: true,
      visibilityRatio: 1,
      steps: [],
    })
    expect(geometry.snapshot).toHaveBeenCalledTimes(2)
  })

  it('executes native-smooth nested reveal inner-to-outer and settles all changed surfaces', async () => {
    const target = document.createElement('button')
    const inner = document.createElement('section')
    const handle = targetHandle('target-1', target)
    const offsets = new Map([
      [inner, { x: 0, y: 0 }],
      [window, { x: 0, y: 0 }],
    ])
    const snapshots = [
      { rect: { x: 0, y: 240, width: 20, height: 20 }, visibleRect: null },
      { rect: { x: 0, y: 140, width: 20, height: 20 }, visibleRect: null },
      {
        rect: { x: 0, y: 40, width: 20, height: 20 },
        visibleRect: { x: 0, y: 40, width: 20, height: 20 },
      },
    ]
    const geometry = {
      snapshot: vi.fn(async () => ({
        target: handle,
        coordinateSpace: 'viewport',
        ...(snapshots.shift() ?? {
          rect: { x: 0, y: 40, width: 20, height: 20 },
          visibleRect: { x: 0, y: 40, width: 20, height: 20 },
        }),
      })),
    }
    const surfaceSnapshot = (id, kind, scrollTarget, parentId) => {
      const offset = offsets.get(scrollTarget)
      return {
        id,
        kind,
        scrollTarget,
        viewportRect: { x: 0, y: 0, width: 100, height: 100 },
        metrics: {
          scrollLeft: offset.x,
          scrollTop: offset.y,
          scrollWidth: 100,
          scrollHeight: 400,
          clientWidth: 100,
          clientHeight: 100,
          clientLeft: 0,
          clientTop: 0,
        },
        overflowAxes: ['y'],
        scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        parentId,
      }
    }
    const resolver = {
      resolve: vi.fn(() => [
        surfaceSnapshot('inner', 'element', inner, 'viewport'),
        surfaceSnapshot('viewport', 'viewport', window, null),
      ]),
    }
    const dom = createDomPort({
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: 'visible',
        scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        scrollMargin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      })),
      getScrollMetrics: vi.fn((scrollTarget) => {
        const offset = offsets.get(scrollTarget)
        return {
          scrollLeft: offset.x,
          scrollTop: offset.y,
          scrollWidth: 100,
          scrollHeight: 400,
          clientWidth: 100,
          clientHeight: 100,
          clientLeft: 0,
          clientTop: 0,
        }
      }),
      scrollTo: vi.fn((scrollTarget, position) => {
        offsets.set(scrollTarget, { x: position.x, y: position.y })
      }),
    })
    const settlementObserver = { settle: vi.fn(async () => {}) }
    const engine = new BrowserSurfaceEngine({
      dom,
      geometry,
      scrollChainResolver: resolver,
      settlementObserver,
    })

    const result = await engine.reveal(handle, {
      visibility: 'full',
      block: 'end',
      inline: 'nearest',
      motion: { kind: 'native-smooth' },
      settle: 'scroll-stable',
    })

    expect(dom.scrollTo.mock.calls.map(([scrollTarget]) => scrollTarget)).toEqual([inner, window])
    expect(dom.scrollTo.mock.calls.map(([, , options]) => options)).toEqual([
      { behavior: 'smooth' },
      { behavior: 'smooth' },
    ])
    expect(settlementObserver.settle).toHaveBeenCalledWith(
      [inner, window],
      expect.objectContaining({ operation: 'surface.reveal' }),
    )
    expect(result).toMatchObject({
      changed: true,
      before: { visibilityRatio: 0, fullyVisible: false },
      after: { visibilityRatio: 1, fullyVisible: true },
      fullyVisible: true,
      visibilityRatio: 1,
    })
    expect(result.steps).toEqual([
      {
        surfaceId: 'inner',
        from: { x: 0, y: 0 },
        intendedTo: { x: 0, y: 160 },
        to: { x: 0, y: 160 },
        axes: ['y'],
      },
      {
        surfaceId: 'viewport',
        from: { x: 0, y: 0 },
        intendedTo: { x: 0, y: 60 },
        to: { x: 0, y: 60 },
        axes: ['y'],
      },
    ])
    expect(geometry.snapshot).toHaveBeenCalledTimes(3)
  })

  it('returns best-effort partial visibility from final geometry', async () => {
    const target = document.createElement('button')
    const handle = targetHandle('target-1', target)
    const geometry = {
      snapshot: vi
        .fn()
        .mockResolvedValueOnce({
          target: handle,
          rect: { x: 0, y: 200, width: 100, height: 200 },
          visibleRect: null,
          coordinateSpace: 'viewport',
        })
        .mockResolvedValueOnce({
          target: handle,
          rect: { x: 0, y: -50, width: 100, height: 200 },
          visibleRect: { x: 0, y: 0, width: 100, height: 100 },
          coordinateSpace: 'viewport',
        }),
    }
    const viewport = {
      id: 'viewport',
      kind: 'viewport',
      scrollTarget: window,
      viewportRect: { x: 0, y: 0, width: 100, height: 100 },
      metrics: {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 100,
        scrollHeight: 300,
        clientWidth: 100,
        clientHeight: 100,
        clientLeft: 0,
        clientTop: 0,
      },
      overflowAxes: ['y'],
      scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      parentId: null,
    }
    let actualTop = 0
    const dom = createDomPort({
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: 'visible',
        scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        scrollMargin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      })),
      scrollTo: vi.fn((_target, position) => {
        actualTop = Math.min(200, position.y)
      }),
      getScrollMetrics: vi.fn(() => ({ ...viewport.metrics, scrollTop: actualTop })),
    })
    const engine = new BrowserSurfaceEngine({
      dom,
      geometry,
      scrollChainResolver: { resolve: vi.fn(() => [{ ...viewport, metrics: { ...viewport.metrics, scrollTop: actualTop } }]) },
    })

    await expect(
      engine.reveal(handle, { visibility: 'full', block: 'nearest', settle: 'none' }),
    ).resolves.toMatchObject({
      changed: true,
      after: { visibilityRatio: 0.5, fullyVisible: false },
      visibilityRatio: 0.5,
      fullyVisible: false,
    })
  })

  it('stops nested reveal at timeout and abort step boundaries', async () => {
    const target = document.createElement('button')
    const inner = document.createElement('section')
    const handle = targetHandle('target-1', target)
    const controller = new AbortController()
    let controllerToAbort = controller
    let now = 0
    const geometry = {
      snapshot: vi.fn(async () => ({
        target: handle,
        rect: { x: 0, y: 200, width: 20, height: 20 },
        visibleRect: null,
        coordinateSpace: 'viewport',
      })),
    }
    const surfaces = [inner, window].map((scrollTarget, index) => ({
      id: index === 0 ? 'inner' : 'viewport',
      kind: index === 0 ? 'element' : 'viewport',
      scrollTarget,
      viewportRect: { x: 0, y: 0, width: 100, height: 100 },
      metrics: {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 100,
        scrollHeight: 400,
        clientWidth: 100,
        clientHeight: 100,
        clientLeft: 0,
        clientTop: 0,
      },
      overflowAxes: ['y'],
      scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      parentId: index === 0 ? 'viewport' : null,
    }))
    const dom = createDomPort({
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: 'visible',
        scrollPadding: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
        scrollMargin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      })),
      scrollTo: vi.fn(() => {
        now = 10
        controllerToAbort.abort('stop after inner')
      }),
    })
    const engine = new BrowserSurfaceEngine({
      clock: { now: () => now },
      dom,
      geometry,
      scrollChainResolver: { resolve: vi.fn(() => surfaces) },
    })

    await expect(
      engine.reveal(handle, { visibility: 'full', settle: 'none', timeout: 5 }),
    ).rejects.toMatchObject({ code: 'ACTION_TIMEOUT', details: { operation: 'surface.reveal' } })
    expect(dom.scrollTo).toHaveBeenCalledOnce()

    now = 0
    dom.scrollTo.mockClear()
    await expect(
      engine.reveal(handle, { visibility: 'full', settle: 'none', signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'ACTION_CANCELLED', details: { operation: 'surface.reveal' } })
    expect(dom.scrollTo).not.toHaveBeenCalled()

    const betweenStepsController = new AbortController()
    controllerToAbort = betweenStepsController
    await expect(
      engine.reveal(handle, {
        visibility: 'full',
        settle: 'none',
        signal: betweenStepsController.signal,
      }),
    ).rejects.toMatchObject({ code: 'ACTION_CANCELLED', details: { operation: 'surface.reveal' } })
    expect(dom.scrollTo).toHaveBeenCalledOnce()
  })

  it('keeps timed motion deferred after observed settlement lands', async () => {
    const settlementObserver = { settle: vi.fn(async () => {}) }
    const engine = createSurfaceEngine({ dom: createDomPort(), settlementObserver })

    await expect(
      engine.scrollTo({ x: 10, y: 20 }, { motion: { kind: 'timed', duration: 100 } }),
    ).rejects.toMatchObject({ code: 'PLATFORM_UNSUPPORTED' })
    await expect(
      engine.scrollBy({ x: 1, y: 2 }, { settle: 'scroll-stable' }),
    ).resolves.toMatchObject({ changed: false })
    expect(settlementObserver.settle).toHaveBeenCalledWith(
      [window],
      expect.objectContaining({ operation: 'surface.scrollBy' }),
    )
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
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: scrollable ? 'scroll' : 'visible',
        scrollPadding: { top: '', right: '', bottom: '', left: '' },
        scrollMargin: { top: '', right: '', bottom: '', left: '' },
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
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(1)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(1)
    expect(dom.getViewportRect).toHaveBeenCalledTimes(1)
    expect(timeline.nextFrame).toHaveBeenCalledTimes(1)

    scrollable = false
    invalidation.emit('resize')

    expect(engine.getSurfaceFor(handle).clippingChain).toEqual([])
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(2)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(2)
    expect(dom.getViewportRect).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached surface reads after scroll writes', async () => {
    const clip = document.createElement('section')
    const save = document.createElement('button')
    let scrollable = true
    const dom = createDomPort({
      getParentElement: vi.fn((element) => (element === save ? clip : null)),
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: scrollable ? 'scroll' : 'visible',
        scrollPadding: { top: '', right: '', bottom: '', left: '' },
        scrollMargin: { top: '', right: '', bottom: '', left: '' },
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
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(2)
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(2)
  })
})
