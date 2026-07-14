import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js'
import {
  BrowserScrollChainResolver,
  createScrollChainResolver,
} from '../src/targeting/scroll-chain-resolver/index.js'

function targetHandle(element, root = document) {
  return {
    id: 'target-1',
    element,
    root,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
  }
}

function defineMetrics(target, metrics) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(target, key, { configurable: true, value })
  }
}

function defineRect(element, rect) {
  element.getBoundingClientRect = vi.fn(() => ({
    ...rect,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    left: rect.x,
    toJSON() {},
  }))
}

function setWindowMetrics(metrics) {
  Object.defineProperties(window, {
    scrollX: { configurable: true, value: metrics.scrollLeft },
    scrollY: { configurable: true, value: metrics.scrollTop },
    innerWidth: { configurable: true, value: metrics.clientWidth },
    innerHeight: { configurable: true, value: metrics.clientHeight },
  })
  Object.defineProperties(document.documentElement, {
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
  })
}

describe('BrowserScrollChainResolver', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.documentElement.style.cssText = ''
    vi.restoreAllMocks()
    setWindowMetrics({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 1024,
      scrollHeight: 768,
      clientWidth: 1024,
      clientHeight: 768,
    })
  })

  it('returns immutable nested snapshots in inner-to-outer order with parent relations', () => {
    document.body.innerHTML = `
      <main id="outer" style="overflow: auto; scroll-padding-top: 1px; scroll-padding-right: 2px; scroll-padding-bottom: 3px; scroll-padding-left: 4px">
        <section id="plain">
          <div id="inner" style="overflow-x: auto; overflow-y: scroll; scroll-padding-top: 5px; scroll-padding-right: 6px; scroll-padding-bottom: 7px; scroll-padding-left: 8px">
            <button id="save">Save</button>
          </div>
        </section>
      </main>
    `
    const outer = document.querySelector('#outer')
    const inner = document.querySelector('#inner')
    const save = document.querySelector('#save')
    defineMetrics(inner, {
      scrollLeft: 10,
      scrollTop: 20,
      scrollWidth: 320,
      scrollHeight: 440,
      clientWidth: 120,
      clientHeight: 140,
      clientLeft: 2,
      clientTop: 3,
    })
    defineMetrics(outer, {
      scrollLeft: 0,
      scrollTop: 40,
      scrollWidth: 700,
      scrollHeight: 800,
      clientWidth: 300,
      clientHeight: 400,
    })
    defineRect(inner, { x: 15, y: 25, width: 130, height: 150 })
    defineRect(outer, { x: 5, y: 10, width: 320, height: 420 })
    setWindowMetrics({
      scrollLeft: 0,
      scrollTop: 100,
      scrollWidth: 1024,
      scrollHeight: 1400,
      clientWidth: 1024,
      clientHeight: 768,
    })
    document.documentElement.style.scrollPaddingTop = '9px'
    const resolver = createScrollChainResolver({ dom: new BrowserDomAdapter(document) })

    const chain = resolver.resolve(targetHandle(save))

    expect(chain.map(({ kind, overflowAxes }) => ({ kind, overflowAxes }))).toEqual([
      { kind: 'element', overflowAxes: ['x', 'y'] },
      { kind: 'element', overflowAxes: ['x', 'y'] },
      { kind: 'viewport', overflowAxes: ['y'] },
    ])
    expect(chain[0]).toMatchObject({
      scrollTarget: inner,
      viewportRect: { x: 17, y: 28, width: 120, height: 140 },
      metrics: { scrollLeft: 10, scrollTop: 20 },
      scrollPadding: { top: '5px', right: '6px', bottom: '7px', left: '8px' },
      parentId: chain[1].id,
    })
    expect(chain[1]).toMatchObject({ scrollTarget: outer, parentId: chain[2].id })
    expect(chain[2]).toMatchObject({
      id: 'viewport',
      scrollTarget: window,
      viewportRect: { x: 0, y: 0, width: 1024, height: 768 },
      scrollPadding: { top: '9px' },
      parentId: null,
    })
    expect(Object.isFrozen(chain)).toBe(true)
    expect(Object.isFrozen(chain[0])).toBe(true)
    expect(Object.isFrozen(chain[0].metrics)).toBe(true)
    expect(Object.isFrozen(chain[0].viewportRect)).toBe(true)
    expect(Object.isFrozen(chain[0].overflowAxes)).toBe(true)
    expect(Object.isFrozen(chain[0].scrollPadding)).toBe(true)
    expect(resolver.resolve(targetHandle(save)).map((surface) => surface.id)).toEqual(
      chain.map((surface) => surface.id),
    )
  })

  it('skips non-scrollable ancestors and retains only axes with allowed overflow and range', () => {
    document.body.innerHTML = `
      <div id="outer" style="overflow-x: auto; overflow-y: visible">
        <div id="hidden" style="overflow: hidden">
          <div id="inner" style="overflow-x: visible; overflow-y: scroll">
            <button id="save">Save</button>
          </div>
        </div>
      </div>
    `
    const outer = document.querySelector('#outer')
    const hidden = document.querySelector('#hidden')
    const inner = document.querySelector('#inner')
    const save = document.querySelector('#save')
    for (const element of [outer, hidden, inner]) {
      defineRect(element, { x: 0, y: 0, width: 100, height: 100 })
      defineMetrics(element, {
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 200,
        scrollHeight: 200,
        clientWidth: 100,
        clientHeight: 100,
      })
    }

    const chain = createScrollChainResolver({ dom: new BrowserDomAdapter(document) }).resolve(
      targetHandle(save),
    )

    expect(chain).toHaveLength(2)
    expect(chain.map((surface) => surface.scrollTarget)).toEqual([inner, outer])
    expect(chain.map((surface) => surface.overflowAxes)).toEqual([['y'], ['x']])
  })

  it('retains a scrollable axis at its current range boundary', () => {
    document.body.innerHTML = `
      <div id="panel" style="overflow-y: auto"><button id="save">Save</button></div>
    `
    const panel = document.querySelector('#panel')
    const save = document.querySelector('#save')
    defineRect(panel, { x: 0, y: 0, width: 100, height: 100 })
    defineMetrics(panel, {
      scrollLeft: 0,
      scrollTop: 300,
      scrollWidth: 100,
      scrollHeight: 400,
      clientWidth: 100,
      clientHeight: 100,
    })

    const chain = createScrollChainResolver({ dom: new BrowserDomAdapter(document) }).resolve(
      targetHandle(save),
    )

    expect(chain).toHaveLength(1)
    expect(chain[0]).toMatchObject({ scrollTarget: panel, overflowAxes: ['y'] })
  })

  it('deduplicates repeated surface identities during traversal', () => {
    document.body.innerHTML = `
      <div id="panel" style="overflow-y: auto"><button id="save">Save</button></div>
    `
    const panel = document.querySelector('#panel')
    const save = document.querySelector('#save')
    defineRect(panel, { x: 0, y: 0, width: 100, height: 100 })
    defineMetrics(panel, {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 100,
      scrollHeight: 200,
      clientWidth: 100,
      clientHeight: 100,
    })
    const dom = new BrowserDomAdapter(document)
    vi.spyOn(dom, 'getParentElement').mockImplementation((element) =>
      element === save || element === panel ? panel : null,
    )

    const chain = createScrollChainResolver({ dom }).resolve(targetHandle(save))

    expect(chain.map((surface) => surface.scrollTarget)).toEqual([panel])
  })

  it('includes the viewport only when it is reached and has an available range', () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const save = document.querySelector('#save')
    const resolver = createScrollChainResolver({ dom: new BrowserDomAdapter(document) })

    expect(resolver.resolve(targetHandle(save))).toEqual([])

    setWindowMetrics({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 1300,
      scrollHeight: 768,
      clientWidth: 1024,
      clientHeight: 768,
    })
    const rangedResolver = createScrollChainResolver({ dom: new BrowserDomAdapter(document) })
    expect(rangedResolver.resolve(targetHandle(save))).toMatchObject([
      { id: 'viewport', kind: 'viewport', overflowAxes: ['x'] },
    ])

    const detached = document.createElement('button')
    expect(resolver.resolve(targetHandle(detached))).toEqual([])
  })

  it('traverses open-shadow hosts but stops at closed roots', () => {
    const openHost = document.createElement('section')
    openHost.style.overflowY = 'auto'
    const openRoot = openHost.attachShadow({ mode: 'open' })
    const openTarget = document.createElement('button')
    openRoot.append(openTarget)
    document.body.append(openHost)
    defineRect(openHost, { x: 0, y: 0, width: 100, height: 100 })
    defineMetrics(openHost, {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 100,
      scrollHeight: 200,
      clientWidth: 100,
      clientHeight: 100,
    })

    const closedHost = document.createElement('section')
    closedHost.style.overflowY = 'auto'
    const closedRoot = closedHost.attachShadow({ mode: 'closed' })
    const closedTarget = document.createElement('button')
    closedRoot.append(closedTarget)
    document.body.append(closedHost)
    defineRect(closedHost, { x: 0, y: 0, width: 100, height: 100 })
    defineMetrics(closedHost, {
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 100,
      scrollHeight: 200,
      clientWidth: 100,
      clientHeight: 100,
    })
    const resolver = new BrowserScrollChainResolver({ dom: new BrowserDomAdapter(document) })

    expect(resolver.resolve(targetHandle(openTarget)).map((surface) => surface.scrollTarget)).toEqual([
      openHost,
    ])
    expect(resolver.resolve(targetHandle(closedTarget))).toEqual([])
  })
})
