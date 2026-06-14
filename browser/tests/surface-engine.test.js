import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserSurfaceEngine, createSurfaceEngine } from '../src/targeting/surface-engine/index.js'
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

  it('reveals targets and scrolls supported positions through the DOM adapter only', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const dom = createDomPort()
    const engine = new BrowserSurfaceEngine({ dom })
    const handle = targetHandle('target-1', save)

    await engine.ensureVisible(handle, { block: 'center', inline: 'nearest' })
    await engine.scrollTo(handle, { behavior: 'instant' })
    await engine.scrollTo(element(save), { behavior: 'smooth' })
    await engine.scrollTo({ x: 10, y: 20 })
    await engine.scrollTo({ x: 30, y: 40, coordinateSpace: 'document' })

    expect(dom.scrollIntoView).toHaveBeenCalledWith(save, { block: 'center', inline: 'nearest' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(1, save, { x: 0, y: 0 }, { behavior: 'instant' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(2, save, { x: 0, y: 0 }, { behavior: 'smooth' })
    expect(dom.scrollTo).toHaveBeenNthCalledWith(3, window, { x: 10, y: 20 }, {})
    expect(dom.scrollTo).toHaveBeenNthCalledWith(4, window, { x: 30, y: 40 }, {})
    expect(dom.getViewportScrollTarget).toHaveBeenCalledWith(document)
  })

  it('rejects unresolved locators and unsupported scroll position coordinate spaces', async () => {
    const engine = createSurfaceEngine({ dom: createDomPort() })

    await expect(engine.scrollTo(css('#save'))).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
    })
    await expect(engine.scrollTo({ x: 1, y: 2, coordinateSpace: 'surface' })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: expect.objectContaining({
        action: 'scrollTo',
        coordinateSpace: 'surface',
        supportedCoordinateSpaces: ['viewport', 'document'],
      }),
    })
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
})
