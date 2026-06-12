import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics-trace/index.js'
import { BrowserStateApplier, BrowserStyleAdapter } from '../src/platform-adapter/index.js'
import { BrowserPseudoStateMirror } from '../src/pseudo-state-mirror/index.js'

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

function createTrace() {
  let now = 1

  return new BrowserDiagnosticsTrace({
    idPrefix: 'pseudo',
    clock: {
      now() {
        return now++
      },
    },
  })
}

describe('BrowserPseudoStateMirror', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
  })

  it('applies and clears pseudo state attributes with mirror styles', () => {
    const target = targetHandle()
    const source = document.createElement('style')
    source.textContent = '.button:hover { color: red; }'
    document.head.append(source)
    target.element.className = 'button'
    const trace = createTrace()
    const mirror = new BrowserPseudoStateMirror({
      state: new BrowserStateApplier(),
      style: new BrowserStyleAdapter(document),
      trace,
    })

    mirror.apply({ target, states: ['hover', 'active', 'focus-visible'] })

    expect(target.element.hasAttribute('data-actorble-hover')).toBe(true)
    expect(target.element.hasAttribute('data-actorble-active')).toBe(true)
    expect(target.element.hasAttribute('data-actorble-focus-visible')).toBe(true)
    const mirrorStyle = document.head.querySelector(
      'style[data-actorble-style-id="actorble-pseudo-state-mirror"]',
    )
    expect(mirrorStyle).not.toBeNull()
    expect(mirrorStyle?.textContent).toContain(
      '.button[data-actorble-hover] { color: red; }',
    )
    expect(mirrorStyle?.textContent).not.toMatch(
      /\b(?:outline|outline-offset|border|background|background-color)\s*:/,
    )
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pseudo:mirror:apply' })]),
    )

    mirror.clear(target)

    expect(target.element.hasAttribute('data-actorble-hover')).toBe(false)
    expect(target.element.hasAttribute('data-actorble-active')).toBe(false)
    expect(target.element.hasAttribute('data-actorble-focus-visible')).toBe(false)

    mirror.cleanup()

    expect(
      document.head.querySelector('style[data-actorble-style-id="actorble-pseudo-state-mirror"]'),
    ).toBeNull()
  })

  it('injects stylesheet-driven mirror rules for supported pseudo-state selectors', () => {
    const target = targetHandle('save')
    target.element.className = 'button primary'
    const source = document.createElement('style')
    source.textContent = `
      .button:hover, .button:disabled { color: red; }
      #save.primary:active > span { transform: scale(0.98); }
      @media (min-width: 1px) { .button:focus-visible { outline: 1px solid blue; } }
    `
    document.head.append(source)
    const mirror = new BrowserPseudoStateMirror({
      state: new BrowserStateApplier(),
      style: new BrowserStyleAdapter(document),
    })

    mirror.apply({ target, states: ['hover', 'active', 'focus-visible'] })

    const mirrorCss = document.head.querySelector(
      'style[data-actorble-style-id="actorble-pseudo-state-mirror"]',
    )?.textContent
    expect(mirrorCss).toContain('.button[data-actorble-hover] { color: red; }')
    expect(mirrorCss).toContain(
      '#save.primary[data-actorble-active] > span { transform: scale(0.98); }',
    )
    expect(mirrorCss).toContain('@media (min-width: 1px) {')
    expect(mirrorCss).toContain(
      '.button[data-actorble-focus-visible] { outline: 1px solid blue; }',
    )
    expect(mirrorCss).not.toContain('.button:disabled')
  })

  it('records warning trace entries instead of throwing when mirror application fails', () => {
    const target = targetHandle()
    const trace = createTrace()
    const failingState = {
      applyStateEffects: vi.fn(() => {
        throw new Error('state applier unavailable')
      }),
      cleanup: vi.fn(),
    }
    const mirror = new BrowserPseudoStateMirror({
      state: failingState,
      style: new BrowserStyleAdapter(document),
      trace,
    })

    expect(() =>
      mirror.applyStateEffects([{ kind: 'hover', target, active: true }]),
    ).not.toThrow()

    expect(trace.getTrace().warnings).toEqual([
      expect.objectContaining({
        message: 'Pseudo state mirror apply failed.',
        details: expect.objectContaining({
          phase: 'apply',
          error: 'state applier unavailable',
        }),
      }),
    ])
    expect(trace.getTrace().events).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'pseudo:mirror:warning' })]),
    )
  })

  it('keeps state attributes without injecting fallback styles when mirror style injection fails', () => {
    const target = targetHandle()
    const trace = createTrace()
    const failingStyle = {
      injectStyle: vi.fn(() => {
        throw new Error('style injection blocked')
      }),
      removeStyle: vi.fn(),
    }
    const mirror = new BrowserPseudoStateMirror({
      state: new BrowserStateApplier(),
      style: failingStyle,
      mirrorCssText: '[data-actorble-hover] {}',
      trace,
    })

    expect(() => mirror.apply({ target, states: ['hover', 'focus-visible'] })).not.toThrow()

    expect(target.element.hasAttribute('data-actorble-hover')).toBe(true)
    expect(target.element.hasAttribute('data-actorble-focus-visible')).toBe(true)
    expect(failingStyle.injectStyle).toHaveBeenCalledTimes(1)
    expect(
      document.head.querySelector('style[data-actorble-style-id="actorble-pseudo-state-mirror"]'),
    ).toBeNull()
    expect(trace.getTrace().warnings).toEqual([
      expect.objectContaining({
        message: 'Pseudo state mirror style failed.',
        details: expect.objectContaining({
          phase: 'style',
          error: 'style injection blocked',
        }),
      }),
    ])
  })

  it('records stylesheet scan warnings without failing state application', () => {
    const target = targetHandle()
    const trace = createTrace()
    const scanner = {
      scanStyleSheets: vi.fn(() => ({
        rules: [],
        warnings: [
          {
            phase: 'scan',
            message: 'Stylesheet is not accessible.',
            details: { href: 'https://cdn.example/app.css' },
          },
        ],
      })),
    }
    const style = new BrowserStyleAdapter(document)
    const mirror = new BrowserPseudoStateMirror({
      state: new BrowserStateApplier(),
      style,
      styleScanner: scanner,
      trace,
    })

    expect(() => mirror.apply({ target, states: ['hover'] })).not.toThrow()

    expect(target.element.hasAttribute('data-actorble-hover')).toBe(true)
    expect(scanner.scanStyleSheets).toHaveBeenCalledOnce()
    expect(
      document.head.querySelector('style[data-actorble-style-id="actorble-pseudo-state-mirror"]'),
    ).toBeNull()
    expect(trace.getTrace().warnings).toEqual([
      expect.objectContaining({
        message: 'Pseudo state mirror scan failed.',
        details: expect.objectContaining({
          phase: 'scan',
          error: 'Stylesheet is not accessible.',
        }),
      }),
    ])
  })
})
