import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserInteractabilityEngine } from '../src/targeting/interactability-engine/index.js'

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

function geometryFor(target, overrides = {}) {
  const rect = overrides.rect ?? { x: 10, y: 20, width: 100, height: 40 }
  const visibleRect = overrides.visibleRect === undefined ? rect : overrides.visibleRect

  return {
    target,
    rect,
    visibleRect,
    center: {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    },
    clickablePoint:
      overrides.clickablePoint ??
      (visibleRect
        ? {
            ok: true,
            point: {
              x: visibleRect.x + visibleRect.width / 2,
              y: visibleRect.y + visibleRect.height / 2,
            },
            strategy: 'center',
          }
        : { ok: false, reason: 'not-visible' }),
    coordinateSpace: 'viewport',
    computedAt: 1000,
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
    describeElement: vi.fn((element) => ({
      selector: element.id ? `#${element.id}` : undefined,
      description: element.tagName.toLowerCase(),
      attributes: Object.fromEntries(
        Array.from(element.attributes, (attribute) => [attribute.name, attribute.value]),
      ),
    })),
    getViewportRect: vi.fn(() => ({ x: 0, y: 0, width: 1024, height: 768 })),
    getParentElement: vi.fn((element) => element.parentElement),
    getScrollMetrics: vi.fn(() => ({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      clientWidth: 0,
      clientHeight: 0,
    })),
    getViewportScrollTarget: vi.fn(() => window),
    focus: vi.fn(),
    blur: vi.fn(),
    scrollIntoView: vi.fn(),
    scrollTo: vi.fn(),
    ...overrides,
  }
}

function createGeometry(snapshot) {
  return {
    snapshot: vi.fn(async () => snapshot),
    getBoundingRect: vi.fn(() => snapshot.rect),
    getVisibleRect: vi.fn(() => snapshot.visibleRect),
    getCenter: vi.fn(() => snapshot.center),
    getClickablePoint: vi.fn(() => snapshot.clickablePoint),
  }
}

describe('BrowserInteractabilityEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('separates click, focus, and type preflight for visible enabled controls', async () => {
    document.body.innerHTML = '<input id="name" />'
    const input = document.querySelector('#name')
    const handle = targetHandle('target-1', input)
    const geometry = geometryFor(handle)
    const engine = new BrowserInteractabilityEngine({
      dom: createDomPort({
        elementFromPoint: vi.fn(() => input),
      }),
      geometry: createGeometry(geometry),
    })

    await expect(engine.canClick(handle, geometry)).resolves.toMatchObject({
      target: handle,
      visible: true,
      enabled: true,
      editable: true,
      focusable: true,
      receivesPointerEvents: true,
      canClick: true,
      canFocus: true,
      canType: true,
      blockingReasons: [],
      forceBypassedReasons: [],
      unforceableReasons: [],
    })
    await expect(engine.canFocus(handle)).resolves.toMatchObject({
      canClick: true,
      canFocus: true,
      canType: true,
      blockingReasons: [],
    })
    await expect(engine.canType(handle)).resolves.toMatchObject({
      canFocus: true,
      canType: true,
      blockingReasons: [],
    })
  })

  it('keeps disabled controls blocked even when click force is enabled', async () => {
    document.body.innerHTML = '<button id="save" disabled>Save</button>'
    const button = document.querySelector('#save')
    const handle = targetHandle('target-1', button)
    const geometry = geometryFor(handle)
    const engine = new BrowserInteractabilityEngine({
      dom: createDomPort({ elementFromPoint: vi.fn(() => button) }),
      geometry: createGeometry(geometry),
    })

    await expect(engine.canClick(handle, geometry, { force: true })).resolves.toMatchObject({
      enabled: false,
      canClick: false,
      canFocus: false,
      blockingReasons: ['disabled'],
      forceBypassedReasons: [],
      unforceableReasons: ['disabled'],
    })
  })

  it('allows readonly inputs to focus but not type', async () => {
    document.body.innerHTML = '<input id="name" readonly />'
    const input = document.querySelector('#name')
    const handle = targetHandle('target-1', input)
    const geometry = geometryFor(handle)
    const engine = new BrowserInteractabilityEngine({
      dom: createDomPort({ elementFromPoint: vi.fn(() => input) }),
      geometry: createGeometry(geometry),
    })

    await expect(engine.canFocus(handle)).resolves.toMatchObject({
      enabled: true,
      editable: false,
      focusable: true,
      canFocus: true,
      canType: false,
      blockingReasons: [],
    })
    await expect(engine.canType(handle)).resolves.toMatchObject({
      canFocus: true,
      canType: false,
      blockingReasons: ['readonly'],
      unforceableReasons: ['readonly'],
    })
  })

  it('treats negative tabindex targets as programmatically focusable', async () => {
    document.body.innerHTML = '<div id="panel" tabindex="-1">Details</div>'
    const panel = document.querySelector('#panel')
    const handle = targetHandle('target-1', panel)
    const geometry = geometryFor(handle)
    const engine = new BrowserInteractabilityEngine({
      dom: createDomPort({ elementFromPoint: vi.fn(() => panel) }),
      geometry: createGeometry(geometry),
    })

    await expect(engine.canFocus(handle)).resolves.toMatchObject({
      enabled: true,
      editable: false,
      focusable: true,
      canFocus: true,
      blockingReasons: [],
      unforceableReasons: [],
    })
  })

  it('classifies pointer-events none as force-bypassable for click only', async () => {
    document.body.innerHTML = '<button id="save" style="pointer-events: none">Save</button>'
    const button = document.querySelector('#save')
    const handle = targetHandle('target-1', button)
    const geometry = geometryFor(handle)
    const engine = new BrowserInteractabilityEngine({
      dom: createDomPort({ elementFromPoint: vi.fn(() => null) }),
      geometry: createGeometry(geometry),
    })

    await expect(engine.canClick(handle, geometry)).resolves.toMatchObject({
      receivesPointerEvents: false,
      canClick: false,
      blockingReasons: ['pointer-events-none', 'occluded'],
      forceBypassedReasons: [],
      unforceableReasons: [],
    })
    await expect(engine.canClick(handle, geometry, { force: true })).resolves.toMatchObject({
      receivesPointerEvents: false,
      canClick: true,
      blockingReasons: ['pointer-events-none', 'occluded'],
      forceBypassedReasons: ['pointer-events-none', 'occluded'],
      unforceableReasons: [],
    })
  })

  it('reports occlusion and lets click force bypass the occluder', async () => {
    document.body.innerHTML = `
      <button id="save">Save</button>
      <div id="overlay"></div>
    `
    const button = document.querySelector('#save')
    const overlay = document.querySelector('#overlay')
    const handle = targetHandle('target-1', button)
    const geometry = geometryFor(handle)
    const dom = createDomPort({
      elementFromPoint: vi.fn(() => overlay),
    })
    const engine = new BrowserInteractabilityEngine({ dom, geometry: createGeometry(geometry) })

    await expect(engine.canClick(handle, geometry)).resolves.toMatchObject({
      canClick: false,
      occludedBy: { selector: '#overlay' },
      blockingReasons: ['occluded'],
      forceBypassedReasons: [],
      unforceableReasons: [],
    })
    await expect(engine.canClick(handle, geometry, { force: true })).resolves.toMatchObject({
      canClick: true,
      occludedBy: { selector: '#overlay' },
      blockingReasons: ['occluded'],
      forceBypassedReasons: ['occluded'],
      unforceableReasons: [],
    })
    expect(dom.elementFromPoint).toHaveBeenCalledWith(
      geometry.clickablePoint.point,
      { ignoreActorbleInternal: true },
    )
  })

  it('does not cache interactability judgment reads across repeated inspections', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const button = document.querySelector('#save')
    const handle = targetHandle('target-1', button)
    const geometry = geometryFor(handle)
    const dom = createDomPort({ elementFromPoint: vi.fn(() => button) })
    const engine = new BrowserInteractabilityEngine({ dom, geometry: createGeometry(geometry) })

    await engine.canClick(handle, geometry)
    await engine.canClick(handle, geometry)

    expect(dom.describeElement).toHaveBeenCalledTimes(2)
    expect(dom.getComputedStyle).toHaveBeenCalledTimes(2)
    expect(dom.elementFromPoint).toHaveBeenCalledTimes(2)
  })
})
