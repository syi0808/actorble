import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserGeometryEngine,
  createGeometryEngine,
} from '../src/targeting/geometry-engine/index.js';
import { createFrameGeometrySurfaceCache } from '../src/targeting/frame-geometry-surface-cache/index.js';
import { BrowserSurfaceEngine } from '../src/targeting/surface-engine/index.js';
import { css, element } from '../src/shared/index.js';

function targetHandle(id, target, options = {}) {
  return {
    id,
    element: target,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
    ...options,
  };
}

function createDomPort(rects, overrides = {}) {
  const root = document;

  return {
    getRoot: vi.fn(() => root),
    querySelectorAll: vi.fn(() => []),
    getBoundingClientRect: vi.fn((element) => rects.get(element) ?? zeroRect()),
    getComputedStyle: vi.fn((element) => getComputedStyle(element)),
    elementFromPoint: vi.fn(() => null),
    contains: vi.fn((parent, child) => parent.contains(child)),
    isConnected: vi.fn((element) => element.isConnected),
    getActiveElement: vi.fn(() => document.activeElement),
    describeElement: vi.fn((element) => ({ selector: element.id ? `#${element.id}` : undefined })),
    getViewportRect: vi.fn(() => ({ x: 0, y: 0, width: 1024, height: 768 })),
    getParentElement: vi.fn((element) => element.parentElement),
    getScrollMetrics: vi.fn(() => ({
      scrollLeft: 0,
      scrollTop: 0,
      scrollWidth: 0,
      scrollHeight: 0,
      clientWidth: 0,
      clientHeight: 0,
      clientLeft: 0,
      clientTop: 0,
    })),
    getComputedScrollStyle: vi.fn((element) => {
      const style = getComputedStyle(element);
      return {
        overflowX: style.overflowX || style.overflow,
        overflowY: style.overflowY || style.overflow,
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
      };
    }),
    getViewportScrollElement: vi.fn(() => document.documentElement),
    getViewportScrollTarget: vi.fn(() => window),
    focus: vi.fn(),
    blur: vi.fn(),
    scrollIntoView: vi.fn(),
    scrollTo: vi.fn(),
    ...overrides,
  };
}

function createSurface(options = {}) {
  const snapshot = {
    id: 'viewport',
    root: document,
    coordinateSpace: 'viewport',
    viewport: { x: 0, y: 0, width: 1024, height: 768 },
    clippingChain: [],
    ...options,
  };

  return {
    getSurfaceFor: vi.fn(() => snapshot),
    getScrollableAncestors: vi.fn(() => snapshot.clippingChain),
    ensureVisible: vi.fn(),
    scrollTo: vi.fn(),
    mapPoint: vi.fn((point) => point),
  };
}

function fixedClock(now) {
  return {
    now: vi.fn(() => now),
  };
}

function createFrameTimeline() {
  const frameResolvers = [];

  return {
    timeline: {
      nextFrame: vi.fn(
        () =>
          new Promise((resolve) => {
            frameResolvers.push(resolve);
          }),
      ),
    },
    async resolveFrame(timestamp = 16) {
      frameResolvers.shift()?.(timestamp);
      await Promise.resolve();
    },
  };
}

function zeroRect() {
  return { x: 0, y: 0, width: 0, height: 0 };
}

describe('BrowserGeometryEngine', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('creates deterministic geometry snapshots with bounding, visible, center, and clickable point data', async () => {
    document.body.innerHTML = `
      <section id="clip">
        <button id="save">Save</button>
      </section>
    `;
    const clip = document.querySelector('#clip');
    const save = document.querySelector('#save');
    const handle = targetHandle('target-1', save);
    const rects = new Map([
      [save, { x: 10, y: 20, width: 100, height: 50 }],
      [clip, { x: 0, y: 10, width: 80, height: 60 }],
    ]);
    const dom = createDomPort(rects);
    const surface = createSurface({
      viewport: { x: 0, y: 0, width: 200, height: 100 },
      clippingChain: [clip],
    });
    const clock = fixedClock(5000);
    const engine = new BrowserGeometryEngine({ dom, surface, clock });

    await expect(engine.snapshot(handle)).resolves.toEqual({
      target: handle,
      rect: { x: 10, y: 20, width: 100, height: 50 },
      visibleRect: { x: 10, y: 20, width: 70, height: 50 },
      center: { x: 60, y: 45 },
      clickablePoint: {
        ok: true,
        point: { x: 60, y: 45 },
        strategy: 'center',
      },
      coordinateSpace: 'viewport',
      computedAt: 5000,
    });
    expect(surface.getSurfaceFor).toHaveBeenCalledWith(handle);
  });

  it('uses the visible rect center when the bounding center is clipped away', () => {
    document.body.innerHTML = `
      <section id="clip">
        <button id="save">Save</button>
      </section>
    `;
    const clip = document.querySelector('#clip');
    const save = document.querySelector('#save');
    const handle = targetHandle('target-1', save);
    const rects = new Map([
      [save, { x: 0, y: 0, width: 100, height: 100 }],
      [clip, { x: 0, y: 0, width: 40, height: 40 }],
    ]);
    const engine = new BrowserGeometryEngine({
      dom: createDomPort(rects),
      surface: createSurface({ clippingChain: [clip] }),
      clock: fixedClock(5000),
    });

    expect(engine.getCenter(handle)).toEqual({ x: 50, y: 50 });
    expect(engine.getVisibleRect(handle)).toEqual({ x: 0, y: 0, width: 40, height: 40 });
    expect(engine.getClickablePoint(handle)).toEqual({
      ok: true,
      point: { x: 20, y: 20 },
      strategy: 'visible-center',
    });
  });

  it('returns reasoned clickable point failures for zero-size and outside-surface targets', () => {
    document.body.innerHTML = `
      <button id="zero">Zero</button>
      <button id="outside">Outside</button>
    `;
    const zero = document.querySelector('#zero');
    const outside = document.querySelector('#outside');
    const zeroHandle = targetHandle('zero-target', zero);
    const outsideHandle = targetHandle('outside-target', outside);
    const rects = new Map([
      [zero, { x: 10, y: 10, width: 0, height: 20 }],
      [outside, { x: 300, y: 300, width: 20, height: 20 }],
    ]);
    const engine = new BrowserGeometryEngine({
      dom: createDomPort(rects),
      surface: createSurface({ viewport: { x: 0, y: 0, width: 100, height: 100 } }),
      clock: fixedClock(5000),
    });

    expect(engine.getVisibleRect(zeroHandle)).toBeNull();
    expect(engine.getClickablePoint(zeroHandle)).toEqual({
      ok: false,
      reason: 'not-visible',
    });
    expect(engine.getVisibleRect(outsideHandle)).toBeNull();
    expect(engine.getClickablePoint(outsideHandle)).toEqual({
      ok: false,
      reason: 'outside-surface',
    });
  });

  it('accepts element targets and rejects locator kinds that must be resolved first', async () => {
    document.body.innerHTML = '<button id="save">Save</button>';
    const save = document.querySelector('#save');
    const rects = new Map([[save, { x: 5, y: 10, width: 20, height: 10 }]]);
    const engine = createGeometryEngine({
      dom: createDomPort(rects),
      surface: createSurface(),
      clock: fixedClock(7000),
    });

    await expect(engine.snapshot(save)).resolves.toMatchObject({
      target: {
        element: save,
        root: document,
        resolvedAt: 7000,
        validity: 'live',
      },
      computedAt: 7000,
    });
    await expect(engine.snapshot(element(save))).resolves.toMatchObject({
      target: {
        element: save,
        locator: { kind: 'element', element: save },
      },
    });
    await expect(engine.snapshot(css('#save'))).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: { locatorKind: 'css' },
    });
  });

  it('reuses same-frame geometry and surface reads until frame or manual invalidation', async () => {
    const clip = document.createElement('section');
    const save = document.createElement('button');
    const handle = targetHandle('target-1', save);
    const rects = new Map([
      [save, { x: 10, y: 20, width: 100, height: 50 }],
      [clip, { x: 0, y: 10, width: 80, height: 60 }],
    ]);
    const dom = createDomPort(rects, {
      getParentElement: vi.fn((element) => (element === save ? clip : null)),
      getComputedStyle: vi.fn(() => ({
        overflow: 'visible',
        overflowX: 'visible',
        overflowY: 'scroll',
      })),
      getComputedScrollStyle: vi.fn(() => ({
        overflowX: 'visible',
        overflowY: 'scroll',
        scrollPadding: { top: '', right: '', bottom: '', left: '' },
        scrollMargin: { top: '', right: '', bottom: '', left: '' },
      })),
      getScrollMetrics: vi.fn(() => ({
        scrollLeft: 0,
        scrollTop: 0,
        scrollWidth: 80,
        scrollHeight: 160,
        clientWidth: 80,
        clientHeight: 60,
        clientLeft: 0,
        clientTop: 0,
      })),
    });
    const { timeline, resolveFrame } = createFrameTimeline();
    const cache = createFrameGeometrySurfaceCache({ timeline });
    const surface = new BrowserSurfaceEngine({ dom, cache });
    const engine = new BrowserGeometryEngine({
      dom,
      surface,
      cache,
      clock: fixedClock(5000),
    });

    const first = await engine.snapshot(handle);
    const second = await engine.snapshot(handle);

    expect(second).toEqual(first);
    expect(dom.getBoundingClientRect).toHaveBeenCalledTimes(3);
    expect(dom.getViewportRect).toHaveBeenCalledTimes(1);
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(2);
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(1);
    expect(timeline.nextFrame).toHaveBeenCalledTimes(1);

    rects.set(save, { x: 20, y: 30, width: 100, height: 50 });
    await resolveFrame();

    await expect(engine.snapshot(handle)).resolves.toMatchObject({
      rect: { x: 20, y: 30, width: 100, height: 50 },
      visibleRect: { x: 20, y: 30, width: 60, height: 40 },
    });
    expect(dom.getBoundingClientRect).toHaveBeenCalledTimes(6);
    expect(dom.getViewportRect).toHaveBeenCalledTimes(2);
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(4);
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(2);
    expect(timeline.nextFrame).toHaveBeenCalledTimes(2);

    rects.set(save, { x: 40, y: 50, width: 120, height: 50 });
    cache.invalidate('manual');

    await expect(engine.snapshot(handle)).resolves.toMatchObject({
      rect: { x: 40, y: 50, width: 120, height: 50 },
      visibleRect: { x: 40, y: 50, width: 40, height: 20 },
    });
    expect(dom.getBoundingClientRect).toHaveBeenCalledTimes(9);
    expect(dom.getViewportRect).toHaveBeenCalledTimes(3);
    expect(dom.getComputedScrollStyle).toHaveBeenCalledTimes(6);
    expect(dom.getScrollMetrics).toHaveBeenCalledTimes(3);
  });
});
