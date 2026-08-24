import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserDomAdapter } from '../src/platform/platform-adapter/index.js';
import {
  BrowserVisualLayer,
  NoopVisualLayer,
  createVisualLayer,
} from '../src/visual/visual-layer/index.js';

function targetHandle(id = 'target-1') {
  const element = document.createElement('button');
  element.id = id;
  document.body.append(element);

  return {
    id,
    element,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `button#${id}` },
  };
}

function getCursorElement() {
  const cursor = document.body.querySelector('[data-actorble-visual-cursor]');
  expect(cursor).not.toBeNull();

  return cursor;
}

function getCursorSvg(cursor = getCursorElement()) {
  const svg = cursor.querySelector('svg');
  expect(svg).not.toBeNull();

  return svg;
}

function getCursorHotspotShift(cursor = getCursorElement()) {
  const shift = getCursorSvg(cursor).querySelector('[data-actorble-cursor-hotspot-shift]');
  expect(shift).not.toBeNull();

  return shift;
}

function expectCursorAtPoint(cursor, point) {
  expect(cursor.style.left).toBe('0px');
  expect(cursor.style.top).toBe('0px');
  expect(cursor.style.transform).toBe(`translate3d(${point.x}px, ${point.y}px, 0)`);
  expect(cursor.style.transition).toBe('none');
}

function expectCursorSvgShift(cursor, hotspotX, hotspotY) {
  expect(getCursorHotspotShift(cursor).getAttribute('transform')).toBe(
    `translate(${-hotspotX} ${-hotspotY})`,
  );
}

describe('BrowserVisualLayer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    document.elementFromPoint = undefined;
  });

  it('creates a non-interactive internal overlay for cursor, highlight, and click visuals', () => {
    const target = targetHandle();
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({ x: 10, y: 20 });
    layer.highlightTarget({
      target,
      rect: { x: 5, y: 6, width: 30, height: 20 },
    });
    layer.showClick({ x: 12, y: 24 });

    const root = document.body.querySelector('[data-actorble-overlay-root]');
    expect(root).not.toBeNull();
    expect(root.hasAttribute('data-actorble-internal')).toBe(true);
    expect(root.style.pointerEvents).toBe('none');
    expect(root.querySelector('[data-actorble-visual-cursor]')).not.toBeNull();
    expect(root.querySelector('[data-actorble-visual-highlight]')).not.toBeNull();
    expect(root.querySelector('[data-actorble-visual-click]')).not.toBeNull();

    layer.hide();
    expect(root.hidden).toBe(true);
    expect(root.querySelector('[data-actorble-visual-cursor]')).toBeNull();

    layer.destroy();
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull();
    expect(() => layer.destroy()).not.toThrow();
  });

  it('marks overlay content so browser hit-testing can ignore it', () => {
    const target = document.createElement('button');
    document.body.append(target);
    const layer = new BrowserVisualLayer({ root: document });
    layer.showCursor({ x: 1, y: 2 });
    const root = document.body.querySelector('[data-actorble-overlay-root]');
    const adapter = new BrowserDomAdapter(document);

    root.style.pointerEvents = 'auto';
    document.elementFromPoint = vi.fn(() => (root.style.pointerEvents === 'none' ? target : root));

    expect(adapter.elementFromPoint({ x: 1, y: 2 }, { ignoreActorbleInternal: true })).toBe(target);
    expect(root.style.pointerEvents).toBe('auto');
  });

  it('does not create overlay DOM when disabled', () => {
    const layer = new BrowserVisualLayer({ enabled: false, root: document });

    layer.showCursor({ x: 1, y: 2 });
    layer.highlightTarget({ target: targetHandle(), rect: { x: 0, y: 0, width: 1, height: 1 } });
    layer.showClick({ x: 3, y: 4 });
    layer.showFocus({ target: targetHandle('focus-target'), active: true });
    layer.showTyping({ target: targetHandle('typing-target'), active: true });
    layer.showKeystroke({
      target: targetHandle('keystroke-target'),
      text: 'secret',
      textVisibility: 'masked',
    });
    layer.clearFeedback();
    layer.hide();
    layer.destroy();

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull();
  });

  it('renders the default cursor from an embedded arrow SVG instead of a CSS polygon', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({ x: 14, y: 28 });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);
    const path = svg?.querySelector('path');

    expect(cursor.hasAttribute('data-actorble-internal')).toBe(true);
    expect(cursor.style.pointerEvents).toBe('none');
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('2');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('2');
    expectCursorAtPoint(cursor, { x: 14, y: 28 });
    expect(cursor.style.width).toBe('20px');
    expect(cursor.style.height).toBe('30px');
    expect(cursor.style.filter).toContain('drop-shadow');
    expectCursorSvgShift(cursor, 2, 2);
    expect(svg.style.transform).toBe('none');
    expect(svg.style.transition).toBe('transform 80ms ease-out');
    expect(cursor.style.clipPath).toBe('');
    expect(cursor.style.borderRadius).not.toBe('999px');
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 30');
    expect(path?.getAttribute('d')).toContain('M 2,2');
    expect(path?.getAttribute('fill')).toBe('CanvasText');
    expect(path?.getAttribute('stroke')).toBe('Canvas');
  });

  it('renders distinct browser cursor variants with stable hotspot offsets', () => {
    const layer = new BrowserVisualLayer({ root: document });
    const point = { x: 80, y: 90 };
    const variants = [
      ['pointer', 'pointer', '18px', '24px', '7', '2', 7, 2],
      ['text', 'text', '14px', '30px', '7', '15', 7, 15],
      ['not-allowed', 'not-allowed', '22px', '22px', '11', '11', 11, 11],
      ['wait', 'wait', '22px', '22px', '11', '11', 11, 11],
      ['progress', 'progress', '28px', '30px', '2', '2', 2, 2],
      ['grab', 'grab', '20px', '22px', '10', '3', 10, 3],
      ['grabbing', 'grabbing', '20px', '22px', '10', '4', 10, 4],
      ['move', 'move', '22px', '22px', '11', '11', 11, 11],
      ['crosshair', 'crosshair', '24px', '24px', '12', '12', 12, 12],
    ];

    for (const [
      cssCursor,
      expectedKind,
      width,
      height,
      hotspotX,
      hotspotY,
      svgHotspotX,
      svgHotspotY,
    ] of variants) {
      layer.showCursor({ point, cursor: cssCursor });

      const cursor = getCursorElement();
      const svg = getCursorSvg(cursor);
      expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe(expectedKind);
      expect(cursor.getAttribute('data-actorble-css-cursor')).toBe(cssCursor);
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe(hotspotX);
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe(hotspotY);
      expectCursorAtPoint(cursor, point);
      expect(cursor.style.width).toBe(width);
      expect(cursor.style.height).toBe(height);
      expectCursorSvgShift(cursor, svgHotspotX, svgHotspotY);
      expect(cursor.style.background).toBe('');
      expect(cursor.style.clipPath).toBe('');
      expect(cursor.style.filter).toContain('drop-shadow');
      expect(cursor.style.transform).not.toBe('translate(-50%, -50%)');
      expect(svg.style.transform).toBe('none');
      expect(svg).not.toBeNull();
      const paths = Array.from(svg.querySelectorAll('path'));
      expect(svg.getAttribute('data-actorble-cursor-svg')).toBe(expectedKind);
      expect(svg.getAttribute('viewBox')).toBe(
        `0 0 ${Number.parseFloat(width)} ${Number.parseFloat(height)}`,
      );
      expect(paths.some((path) => path.getAttribute('stroke') === 'Canvas')).toBe(true);
    }
  });

  it('renders text cursor feedback with a visible halo over selected text', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({ point: { x: 100, y: 120 }, cursor: 'text', pressed: true });

    const cursor = getCursorElement();
    const paths = Array.from(getCursorSvg(cursor).querySelectorAll('path'));

    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('text');
    expect(cursor.style.width).toBe('14px');
    expect(cursor.style.height).toBe('30px');
    expect(paths).toHaveLength(2);
    expect(paths[0].getAttribute('stroke')).toBe('Canvas');
    expect(paths[0].getAttribute('stroke-width')).toBe('5.2');
    expect(paths[0].getAttribute('stroke-linecap')).toBe('square');
    expect(paths[1].getAttribute('stroke')).toBe('CanvasText');
    expect(paths[1].getAttribute('stroke-width')).toBe('2.4');
    expect(paths[1].getAttribute('stroke-linecap')).toBe('square');
  });

  it('scales cursor dimensions and hotspots while keeping the requested point anchored', () => {
    const layer = createVisualLayer({ root: document, cursorScale: 2 });

    layer.showCursor({ x: 14, y: 28 });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);

    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('4');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4');
    expectCursorAtPoint(cursor, { x: 14, y: 28 });
    expect(cursor.style.width).toBe('40px');
    expect(cursor.style.height).toBe('60px');
    expectCursorSvgShift(cursor, 2, 2);
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 30');

    layer.showCursor({ point: { x: 80, y: 90 }, cursor: 'pointer' });

    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('pointer');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('14');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4');
    expectCursorAtPoint(cursor, { x: 80, y: 90 });
    expect(cursor.style.width).toBe('36px');
    expect(cursor.style.height).toBe('48px');
    expectCursorSvgShift(cursor, 7, 2);
  });

  it('uses scaled hotspot origins for pressed cursor feedback', () => {
    const layer = new BrowserVisualLayer({ root: document, cursorScale: 2 });

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: true,
    });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true);
    expectCursorAtPoint(cursor, { x: 50, y: 60 });
    expect(svg.style.transform).toBe('scale(0.9)');
    expect(svg.style.transformOrigin).toBe('0px 0px');
    expect(cursor.style.width).toBe('36px');
    expect(cursor.style.height).toBe('48px');
    expectCursorSvgShift(cursor, 7, 2);
  });

  it('falls back to the default cursor scale for invalid scale values', () => {
    for (const cursorScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      document.body.innerHTML = '';
      const layer = new BrowserVisualLayer({ root: document, cursorScale });

      layer.showCursor({ x: 14, y: 28 });

      const cursor = getCursorElement();
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('2');
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('2');
      expectCursorAtPoint(cursor, { x: 14, y: 28 });
      expect(cursor.style.width).toBe('20px');
      expect(cursor.style.height).toBe('30px');
      expectCursorSvgShift(cursor, 2, 2);
    }
  });

  it('degrades unsupported cursor values to the default visual while preserving metadata', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({
      point: { x: 30, y: 40 },
      cursor: 'url(cursor.svg), copy',
      pressed: true,
    });

    const cursor = getCursorElement();
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default');
    expect(cursor.getAttribute('data-actorble-css-cursor')).toBe('url(cursor.svg), copy');
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true);
    expectCursorAtPoint(cursor, { x: 30, y: 40 });
    expect(getCursorSvg(cursor).style.transform).toBe('scale(0.9)');
    expect(getCursorSvg(cursor).style.transition).toBe('transform 80ms ease-out');
    expect(cursor.style.width).toBe('20px');
    expect(cursor.style.height).toBe('30px');
    expectCursorSvgShift(cursor, 2, 2);

    layer.showCursor({
      point: { x: 31, y: 41 },
      kind: 'custom',
      pressed: false,
    });

    expectCursorAtPoint(cursor, { x: 31, y: 41 });
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default');
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false);
    expect(cursor.hasAttribute('data-actorble-css-cursor')).toBe(false);
    expect(getCursorSvg(cursor).style.transform).toBe('none');
  });

  it('shrinks pressed cursor variants and restores their base transform', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: true,
    });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true);
    expectCursorAtPoint(cursor, { x: 50, y: 60 });
    expect(svg.style.transform).toBe('scale(0.9)');
    expect(svg.style.transformOrigin).toBe('0px 0px');
    expect(svg.style.transition).toBe('transform 80ms ease-out');
    expectCursorSvgShift(cursor, 7, 2);

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: false,
    });

    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false);
    expectCursorAtPoint(cursor, { x: 50, y: 60 });
    expect(getCursorSvg(cursor).style.transform).toBe('none');
    expect(getCursorSvg(cursor).style.transformOrigin).toBe('0px 0px');
    expect(getCursorSvg(cursor).style.transition).toBe('transform 80ms ease-out');
  });

  it('clears cancelled transaction feedback while preserving the released cursor point', () => {
    const target = targetHandle('cancel-target');
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({ point: { x: 32, y: 48 }, cursor: 'pointer', pressed: true });
    layer.highlightTarget({ target, rect: { x: 20, y: 30, width: 40, height: 20 } });
    layer.showClick({ x: 32, y: 48 });
    layer.showCursor({ point: { x: 32, y: 48 }, cursor: 'pointer', pressed: false });
    layer.clearFeedback();

    const cursor = getCursorElement();
    expectCursorAtPoint(cursor, { x: 32, y: 48 });
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false);
    expect(document.querySelector('[data-actorble-visual-highlight]')).toBeNull();
    expect(document.querySelector('[data-actorble-visual-click]')).toBeNull();
  });

  it('reuses the SVG subtree for repeated same-kind cursor updates', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: false,
    });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);
    const hotspotShift = getCursorHotspotShift(cursor);
    const path = svg.querySelector('path');
    expect(path).not.toBeNull();

    layer.showCursor({
      point: { x: 70, y: 80 },
      cursor: 'pointer',
      pressed: true,
    });

    expectCursorAtPoint(cursor, { x: 70, y: 80 });
    expect(getCursorSvg(cursor)).toBe(svg);
    expect(getCursorHotspotShift(cursor)).toBe(hotspotShift);
    expect(getCursorSvg(cursor).querySelector('path')).toBe(path);
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true);
    expect(svg.style.transform).toBe('scale(0.9)');

    layer.showCursor({
      point: { x: 90, y: 100 },
      cursor: 'pointer',
      pressed: false,
    });

    expectCursorAtPoint(cursor, { x: 90, y: 100 });
    expect(getCursorSvg(cursor)).toBe(svg);
    expect(getCursorHotspotShift(cursor)).toBe(hotspotShift);
    expect(getCursorSvg(cursor).querySelector('path')).toBe(path);
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false);
    expect(svg.style.transform).toBe('none');
  });

  it('updates same-kind cursor scale without replacing the SVG subtree', () => {
    const options = { root: document, cursorScale: 1 };
    const layer = new BrowserVisualLayer(options);

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
    });

    const cursor = getCursorElement();
    const svg = getCursorSvg(cursor);
    const path = svg.querySelector('path');
    expect(path).not.toBeNull();

    options.cursorScale = 2;
    layer.showCursor({
      point: { x: 70, y: 80 },
      cursor: 'pointer',
    });

    expect(getCursorSvg(cursor)).toBe(svg);
    expect(getCursorSvg(cursor).querySelector('path')).toBe(path);
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('pointer');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('14');
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4');
    expect(cursor.style.width).toBe('36px');
    expect(cursor.style.height).toBe('48px');
    expectCursorAtPoint(cursor, { x: 70, y: 80 });
    expectCursorSvgShift(cursor, 7, 2);
  });

  it('accepts cursor visual request metadata without leaking stale variant state', () => {
    const layer = new BrowserVisualLayer({ root: document });

    layer.showCursor({
      point: { x: 14, y: 28 },
      cursor: 'pointer',
      pressed: true,
    });
    const cursor = getCursorElement();
    const pointerGraphicTransform = getCursorSvg(cursor).style.transform;

    layer.showCursor({
      point: { x: 15, y: 29 },
      cursor: 'text',
      pressed: false,
    });

    expectCursorAtPoint(cursor, { x: 15, y: 29 });
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('text');
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false);
    expect(getCursorSvg(cursor).style.transform).not.toBe(pointerGraphicTransform);
    expectCursorSvgShift(cursor, 7, 15);
    expect(cursor.style.borderRadius).toBe('');
  });

  it('renders focus, typing, and keystroke feedback with text visibility policy', () => {
    const target = targetHandle('field');
    const layer = new BrowserVisualLayer({ root: document });

    layer.showFocus({ target, active: true });
    layer.showTyping({ target, active: true });
    layer.showKeystroke({ target, text: 's', textVisibility: 'plain' });

    const root = document.body.querySelector('[data-actorble-overlay-root]');
    expect(root.querySelector('[data-actorble-visual-focus]')).not.toBeNull();
    expect(root.querySelector('[data-actorble-visual-typing]')).not.toBeNull();
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('s');

    layer.showKeystroke({ target, text: 'secret', textVisibility: 'masked' });
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('******');

    layer.showKeystroke({ target, text: 'secret', textVisibility: 'hidden' });
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('button#field');

    layer.showTyping({ target, active: false });
    expect(root.querySelector('[data-actorble-visual-typing]')).toBeNull();

    layer.clearFeedback();
    expect(root.querySelector('[data-actorble-visual-keystroke]')).toBeNull();
    expect(root.querySelector('[data-actorble-visual-focus]')).toBeNull();
  });

  it('provides a no-op visual layer for compile-pass runtime hooks', () => {
    const target = targetHandle();
    const layer = new NoopVisualLayer();

    expect(() => {
      layer.showCursor({ x: 1, y: 2 });
      layer.highlightTarget({ target, rect: { x: 0, y: 0, width: 1, height: 1 } });
      layer.showClick({ x: 3, y: 4 });
      layer.showFocus({ target, active: true });
      layer.showTyping({ target, active: true });
      layer.showKeystroke({ target, text: 'secret', textVisibility: 'hidden' });
      layer.clearFeedback();
      layer.hide();
      layer.destroy();
    }).not.toThrow();

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull();
  });
});
