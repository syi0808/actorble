import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDomAdapter } from '../src/platform-adapter/index.js'
import { BrowserVisualLayer } from '../src/visual-layer/index.js'

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
    layer.hide()
    layer.destroy()

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })
})
