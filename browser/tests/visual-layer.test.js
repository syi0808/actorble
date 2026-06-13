import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/index.js'
import {
  BrowserVisualLayer,
  NoopVisualLayer,
  createVisualLayer,
} from '../src/visual/visual-layer/index.js'

function targetHandle(id = 'target-1') {
  const element = document.createElement('button')
  element.id = id
  document.body.append(element)

  return {
    id,
    element,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `button#${id}` },
  }
}

function getCursorElement() {
  const cursor = document.body.querySelector('[data-actorble-visual-cursor]')
  expect(cursor).not.toBeNull()

  return cursor
}

describe('BrowserVisualLayer', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    document.elementFromPoint = undefined
  })

  it('creates a non-interactive internal overlay for cursor, highlight, and click visuals', () => {
    const target = targetHandle()
    const layer = new BrowserVisualLayer({ root: document })

    layer.showCursor({ x: 10, y: 20 })
    layer.highlightTarget({
      target,
      rect: { x: 5, y: 6, width: 30, height: 20 },
    })
    layer.showClick({ x: 12, y: 24 })

    const root = document.body.querySelector('[data-actorble-overlay-root]')
    expect(root).not.toBeNull()
    expect(root.hasAttribute('data-actorble-internal')).toBe(true)
    expect(root.style.pointerEvents).toBe('none')
    expect(root.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(root.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(root.querySelector('[data-actorble-visual-click]')).not.toBeNull()

    layer.hide()
    expect(root.hidden).toBe(true)
    expect(root.querySelector('[data-actorble-visual-cursor]')).toBeNull()

    layer.destroy()
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
    expect(() => layer.destroy()).not.toThrow()
  })

  it('marks overlay content so browser hit-testing can ignore it', () => {
    const target = document.createElement('button')
    document.body.append(target)
    const layer = new BrowserVisualLayer({ root: document })
    layer.showCursor({ x: 1, y: 2 })
    const root = document.body.querySelector('[data-actorble-overlay-root]')
    const adapter = new BrowserDomAdapter(document)

    root.style.pointerEvents = 'auto'
    document.elementFromPoint = vi.fn(() =>
      root.style.pointerEvents === 'none' ? target : root,
    )

    expect(adapter.elementFromPoint({ x: 1, y: 2 }, { ignoreActorbleInternal: true })).toBe(
      target,
    )
    expect(root.style.pointerEvents).toBe('auto')
  })

  it('does not create overlay DOM when disabled', () => {
    const layer = new BrowserVisualLayer({ enabled: false, root: document })

    layer.showCursor({ x: 1, y: 2 })
    layer.highlightTarget({ target: targetHandle(), rect: { x: 0, y: 0, width: 1, height: 1 } })
    layer.showClick({ x: 3, y: 4 })
    layer.showFocus({ target: targetHandle('focus-target'), active: true })
    layer.showTyping({ target: targetHandle('typing-target'), active: true })
    layer.showKeystroke({
      target: targetHandle('keystroke-target'),
      text: 'secret',
      textVisibility: 'masked',
    })
    layer.clearFeedback()
    layer.hide()
    layer.destroy()

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('renders the default cursor from an embedded arrow SVG instead of a CSS polygon', () => {
    const layer = new BrowserVisualLayer({ root: document })

    layer.showCursor({ x: 14, y: 28 })

    const cursor = getCursorElement()
    const svg = cursor.querySelector('svg')
    const path = svg?.querySelector('path')

    expect(cursor.hasAttribute('data-actorble-internal')).toBe(true)
    expect(cursor.style.pointerEvents).toBe('none')
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('2')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('2')
    expect(cursor.style.left).toBe('12px')
    expect(cursor.style.top).toBe('26px')
    expect(cursor.style.width).toBe('20px')
    expect(cursor.style.height).toBe('30px')
    expect(cursor.style.filter).toContain('drop-shadow')
    expect(cursor.style.transform).toBe('none')
    expect(cursor.style.clipPath).toBe('')
    expect(cursor.style.borderRadius).not.toBe('999px')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 30')
    expect(path?.getAttribute('d')).toContain('M 2,2')
    expect(path?.getAttribute('fill')).toBe('CanvasText')
    expect(path?.getAttribute('stroke')).toBe('Canvas')
  })

  it('renders distinct browser cursor variants with stable hotspot offsets', () => {
    const layer = new BrowserVisualLayer({ root: document })
    const point = { x: 80, y: 90 }
    const variants = [
      ['pointer', 'pointer', '18px', '24px', '7', '2'],
      ['text', 'text', '10px', '26px', '5', '13'],
      ['not-allowed', 'not-allowed', '22px', '22px', '11', '11'],
      ['wait', 'wait', '22px', '22px', '11', '11'],
      ['progress', 'progress', '28px', '30px', '2', '2'],
      ['grab', 'grab', '20px', '22px', '10', '3'],
      ['grabbing', 'grabbing', '20px', '22px', '10', '4'],
      ['move', 'move', '22px', '22px', '11', '11'],
      ['crosshair', 'crosshair', '24px', '24px', '12', '12'],
    ]

    for (const [cssCursor, expectedKind, width, height, hotspotX, hotspotY] of variants) {
      layer.showCursor({ point, cursor: cssCursor })

      const cursor = getCursorElement()
      const svg = cursor.querySelector('svg')
      expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe(expectedKind)
      expect(cursor.getAttribute('data-actorble-css-cursor')).toBe(cssCursor)
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe(hotspotX)
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe(hotspotY)
      expect(cursor.style.left).toBe(`${point.x - Number(hotspotX)}px`)
      expect(cursor.style.top).toBe(`${point.y - Number(hotspotY)}px`)
      expect(cursor.style.width).toBe(width)
      expect(cursor.style.height).toBe(height)
      expect(cursor.style.background).toBe('')
      expect(cursor.style.clipPath).toBe('')
      expect(cursor.style.filter).toContain('drop-shadow')
      expect(cursor.style.transform).not.toBe('translate(-50%, -50%)')
      expect(svg).not.toBeNull()
      const paths = Array.from(svg.querySelectorAll('path'))
      expect(svg.getAttribute('data-actorble-cursor-svg')).toBe(expectedKind)
      expect(svg.getAttribute('viewBox')).toBe(
        `0 0 ${Number.parseFloat(width)} ${Number.parseFloat(height)}`,
      )
      expect(paths.some((path) => path.getAttribute('stroke') === 'Canvas')).toBe(true)
    }
  })

  it('scales cursor dimensions and hotspots while keeping the requested point anchored', () => {
    const layer = createVisualLayer({ root: document, cursorScale: 2 })

    layer.showCursor({ x: 14, y: 28 })

    const cursor = getCursorElement()
    const svg = cursor.querySelector('svg')

    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('4')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4')
    expect(cursor.style.left).toBe('10px')
    expect(cursor.style.top).toBe('24px')
    expect(cursor.style.width).toBe('40px')
    expect(cursor.style.height).toBe('60px')
    expect(svg.getAttribute('viewBox')).toBe('0 0 20 30')

    layer.showCursor({ point: { x: 80, y: 90 }, cursor: 'pointer' })

    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('pointer')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('14')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4')
    expect(cursor.style.left).toBe('66px')
    expect(cursor.style.top).toBe('86px')
    expect(cursor.style.width).toBe('36px')
    expect(cursor.style.height).toBe('48px')
  })

  it('uses scaled hotspot origins for pressed cursor feedback', () => {
    const layer = new BrowserVisualLayer({ root: document, cursorScale: 2 })

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: true,
    })

    const cursor = getCursorElement()
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true)
    expect(cursor.style.transform).toBe('scale(0.9)')
    expect(cursor.style.transformOrigin).toBe('14px 4px')
    expect(cursor.style.width).toBe('36px')
    expect(cursor.style.height).toBe('48px')
  })

  it('falls back to the default cursor scale for invalid scale values', () => {
    for (const cursorScale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      document.body.innerHTML = ''
      const layer = new BrowserVisualLayer({ root: document, cursorScale })

      layer.showCursor({ x: 14, y: 28 })

      const cursor = getCursorElement()
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('2')
      expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('2')
      expect(cursor.style.left).toBe('12px')
      expect(cursor.style.top).toBe('26px')
      expect(cursor.style.width).toBe('20px')
      expect(cursor.style.height).toBe('30px')
    }
  })

  it('degrades unsupported cursor values to the default visual while preserving metadata', () => {
    const layer = new BrowserVisualLayer({ root: document })

    layer.showCursor({
      point: { x: 30, y: 40 },
      cursor: 'url(cursor.svg), copy',
      pressed: true,
    })

    const cursor = getCursorElement()
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default')
    expect(cursor.getAttribute('data-actorble-css-cursor')).toBe('url(cursor.svg), copy')
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true)
    expect(cursor.style.transform).toBe('scale(0.9)')
    expect(cursor.style.transition).toBe('transform 80ms ease-out')
    expect(cursor.style.left).toBe('28px')
    expect(cursor.style.top).toBe('38px')
    expect(cursor.style.width).toBe('20px')
    expect(cursor.style.height).toBe('30px')

    layer.showCursor({
      point: { x: 31, y: 41 },
      kind: 'custom',
      pressed: false,
    })

    expect(cursor.style.left).toBe('29px')
    expect(cursor.style.top).toBe('39px')
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('default')
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false)
    expect(cursor.hasAttribute('data-actorble-css-cursor')).toBe(false)
    expect(cursor.style.transform).toBe('none')
  })

  it('shrinks pressed cursor variants and restores their base transform', () => {
    const layer = new BrowserVisualLayer({ root: document })

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: true,
    })

    const cursor = getCursorElement()
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(true)
    expect(cursor.style.transform).toBe('scale(0.9)')
    expect(cursor.style.transformOrigin).toBe('7px 2px')
    expect(cursor.style.transition).toBe('transform 80ms ease-out')

    layer.showCursor({
      point: { x: 50, y: 60 },
      cursor: 'pointer',
      pressed: false,
    })

    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false)
    expect(cursor.style.transform).toBe('none')
    expect(cursor.style.transformOrigin).toBe('7px 2px')
    expect(cursor.style.transition).toBe('transform 80ms ease-out')
  })

  it('accepts cursor visual request metadata without leaking stale variant state', () => {
    const layer = new BrowserVisualLayer({ root: document })

    layer.showCursor({
      point: { x: 14, y: 28 },
      cursor: 'pointer',
      pressed: true,
    })
    const cursor = getCursorElement()
    const pointerTransform = cursor.style.transform

    layer.showCursor({
      point: { x: 15, y: 29 },
      cursor: 'text',
      pressed: false,
    })

    expect(cursor.style.left).toBe('10px')
    expect(cursor.style.top).toBe('16px')
    expect(cursor.getAttribute('data-actorble-cursor-kind')).toBe('text')
    expect(cursor.hasAttribute('data-actorble-cursor-pressed')).toBe(false)
    expect(cursor.style.transform).not.toBe(pointerTransform)
    expect(cursor.style.borderRadius).toBe('')
  })

  it('renders focus, typing, and keystroke feedback with text visibility policy', () => {
    const target = targetHandle('field')
    const layer = new BrowserVisualLayer({ root: document })

    layer.showFocus({ target, active: true })
    layer.showTyping({ target, active: true })
    layer.showKeystroke({ target, text: 's', textVisibility: 'plain' })

    const root = document.body.querySelector('[data-actorble-overlay-root]')
    expect(root.querySelector('[data-actorble-visual-focus]')).not.toBeNull()
    expect(root.querySelector('[data-actorble-visual-typing]')).not.toBeNull()
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('s')

    layer.showKeystroke({ target, text: 'secret', textVisibility: 'masked' })
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('******')

    layer.showKeystroke({ target, text: 'secret', textVisibility: 'hidden' })
    expect(root.querySelector('[data-actorble-visual-keystroke]').textContent).toBe(
      'button#field',
    )

    layer.showTyping({ target, active: false })
    expect(root.querySelector('[data-actorble-visual-typing]')).toBeNull()

    layer.clearFeedback()
    expect(root.querySelector('[data-actorble-visual-keystroke]')).toBeNull()
    expect(root.querySelector('[data-actorble-visual-focus]')).toBeNull()
  })

  it('provides a no-op visual layer for compile-pass runtime hooks', () => {
    const target = targetHandle()
    const layer = new NoopVisualLayer()

    expect(() => {
      layer.showCursor({ x: 1, y: 2 })
      layer.highlightTarget({ target, rect: { x: 0, y: 0, width: 1, height: 1 } })
      layer.showClick({ x: 3, y: 4 })
      layer.showFocus({ target, active: true })
      layer.showTyping({ target, active: true })
      layer.showKeystroke({ target, text: 'secret', textVisibility: 'hidden' })
      layer.clearFeedback()
      layer.hide()
      layer.destroy()
    }).not.toThrow()

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })
})
