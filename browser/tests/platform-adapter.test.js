import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserDomAdapter,
  BrowserEventDispatcher,
  BrowserStateApplier,
  BrowserStyleAdapter,
} from '../src/platform/platform-adapter/index.js'

function targetHandle(id, element) {
  return {
    id,
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
  }
}

async function flushDomObservers() {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('BrowserDomAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    document.head.innerHTML = ''
    document.elementFromPoint = undefined
  })

  it('reads DOM details and performs focus and scroll writes', () => {
    document.body.innerHTML = `
      <main id="app">
        <button id="save" class="primary" type="button" aria-label="Save changes" style="display: inline-block">Save</button>
        <div id="scrollbox"></div>
      </main>
    `

    const root = document.querySelector('#app')
    const button = document.querySelector('#save')
    const scrollbox = document.querySelector('#scrollbox')
    const scrollIntoView = vi.fn()

    button.getBoundingClientRect = () => ({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      left: 10,
      top: 20,
      right: 40,
      bottom: 60,
      toJSON: () => ({}),
    })
    button.scrollIntoView = scrollIntoView

    const adapter = new BrowserDomAdapter(document)

    expect(adapter.getRoot()).toBe(document)
    expect(adapter.querySelectorAll('button', root)).toEqual([button])
    expect(adapter.getBoundingClientRect(button)).toEqual({
      x: 10,
      y: 20,
      width: 30,
      height: 40,
    })
    expect(adapter.getComputedStyle(button).display).toBe('inline-block')
    expect(adapter.getTextContent(button)).toBe('Save')
    expect(adapter.contains(root, button)).toBe(true)
    expect(adapter.isConnected(button)).toBe(true)

    adapter.focus(button)
    expect(adapter.getActiveElement()).toBe(button)
    adapter.blur(button)
    expect(adapter.getActiveElement()).not.toBe(button)

    adapter.scrollIntoView(button, { block: 'center' })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

    adapter.scrollTo(scrollbox, { x: 11, y: 12 }, { behavior: 'instant' })
    expect(scrollbox.scrollLeft).toBe(11)
    expect(scrollbox.scrollTop).toBe(12)

    expect(adapter.describeElement(button)).toMatchObject({
      description: 'button#save.primary',
      selector: '#save',
      role: 'button',
      name: 'Save changes',
      attributes: {
        id: 'save',
        class: 'primary',
        type: 'button',
        'aria-label': 'Save changes',
      },
    })
  })

  it('describes native label accessible names after ARIA names', () => {
    document.body.innerHTML = `
      <form>
        <label for="email">Email</label>
        <input id="email" />
        <label>Name <input id="name" /></label>
        <label for="alias">Native Alias</label>
        <input id="alias" aria-label="ARIA Alias" />
        <span id="preferred">ARIA Labelled</span>
        <label for="labelled">Native Labelled</label>
        <input id="labelled" aria-labelledby="preferred" />
      </form>
    `
    const adapter = new BrowserDomAdapter(document)

    expect(adapter.describeElement(document.querySelector('#email')).name).toBe('Email')
    expect(adapter.describeElement(document.querySelector('#name')).name).toBe('Name')
    expect(adapter.describeElement(document.querySelector('#alias')).name).toBe('ARIA Alias')
    expect(adapter.describeElement(document.querySelector('#labelled')).name).toBe('ARIA Labelled')
  })

  it('reads text content from the configured document or shadow root', () => {
    document.body.innerHTML = '<main>Saved <span>Project</span></main>'
    const documentAdapter = new BrowserDomAdapter(document)

    expect(documentAdapter.getRootTextContent()).toBe('Saved Project')

    const host = document.createElement('section')
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<p>Shadow <strong>Complete</strong></p>'
    const shadowAdapter = new BrowserDomAdapter(shadowRoot)

    expect(shadowAdapter.getRootTextContent()).toBe('Shadow Complete')
  })

  it('hit-tests points and skips actorble internal elements when requested', () => {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-actorble-internal', '')
    const target = document.createElement('button')
    document.body.append(overlay, target)

    document.elementFromPoint = vi.fn(() => {
      return overlay.style.pointerEvents === 'none' ? target : overlay
    })

    const adapter = new BrowserDomAdapter(document)

    expect(adapter.elementFromPoint({ x: 4, y: 5 })).toBe(overlay)
    expect(adapter.elementFromPoint({ x: 4, y: 5 }, { ignoreActorbleInternal: true })).toBe(target)
    expect(overlay.style.pointerEvents).toBe('')
  })

  it('observes layout invalidation sources and cleans up listeners', () => {
    document.body.innerHTML = `
      <main id="app">
        <div id="scrollbox"></div>
      </main>
    `
    const adapter = new BrowserDomAdapter(document)
    const listener = vi.fn()
    const subscription = adapter.observeLayoutInvalidations(listener)
    const scrollbox = document.querySelector('#scrollbox')

    window.dispatchEvent(new Event('resize'))
    scrollbox.dispatchEvent(new Event('scroll', { bubbles: true }))

    expect(listener).toHaveBeenNthCalledWith(1, 'resize')
    expect(listener).toHaveBeenNthCalledWith(2, 'scroll')

    subscription.dispose()
    window.dispatchEvent(new Event('resize'))
    scrollbox.dispatchEvent(new Event('scroll', { bubbles: true }))

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores actorble internal visual invalidations while preserving app invalidations', async () => {
    document.body.innerHTML = `
      <main id="app">
        <div id="target"></div>
      </main>
    `
    const adapter = new BrowserDomAdapter(document)
    const listener = vi.fn()
    const subscription = adapter.observeLayoutInvalidations(listener)
    const overlay = document.createElement('div')
    const cursor = document.createElement('div')
    const target = document.querySelector('#target')

    overlay.setAttribute('data-actorble-overlay-root', '')
    overlay.setAttribute('data-actorble-internal', '')
    cursor.setAttribute('data-actorble-internal', '')

    document.body.append(overlay)
    overlay.append(cursor)
    cursor.setAttribute('data-actorble-visual-cursor', '')
    cursor.style.left = '10px'
    cursor.dispatchEvent(new Event('transitionrun', { bubbles: true }))
    await flushDomObservers()

    expect(listener).not.toHaveBeenCalled()

    target.setAttribute('data-state', 'ready')
    await flushDomObservers()
    expect(listener).toHaveBeenCalledWith('mutation')

    listener.mockClear()
    target.dispatchEvent(new Event('transitionrun', { bubbles: true }))
    expect(listener).toHaveBeenCalledWith('animation-frame')

    subscription.dispose()
  })
})

describe('BrowserEventDispatcher', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('dispatches pointer descriptors as pointer and mouse events with cancel results', () => {
    const button = document.createElement('button')
    document.body.append(button)
    const events = []

    button.addEventListener('pointerdown', (event) => {
      events.push({
        type: event.type,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
      })
    })
    button.addEventListener('mousedown', (event) => {
      events.push({
        type: event.type,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
      })
    })

    const dispatcher = new BrowserEventDispatcher()

    expect(
      dispatcher.dispatchPointerEvent({
        type: 'pointerdown',
        target: button,
        point: { x: 7, y: 8 },
        button: 'primary',
        buttons: ['primary'],
      }),
    ).toBe(true)

    expect(events).toEqual([
      {
        type: 'pointerdown',
        clientX: 7,
        clientY: 8,
        button: 0,
        buttons: 1,
        bubbles: true,
        cancelable: true,
      },
      {
        type: 'mousedown',
        clientX: 7,
        clientY: 8,
        button: 0,
        buttons: 1,
      },
    ])

    button.addEventListener('pointerup', (event) => event.preventDefault(), { once: true })
    expect(
      dispatcher.dispatchPointerEvent({
        type: 'pointerup',
        target: button,
        point: { x: 7, y: 8 },
        button: 'primary',
        buttons: [],
      }),
    ).toBe(false)
  })

  it('dispatches mouse activation descriptors with click coordinates and cancel results', () => {
    const button = document.createElement('button')
    document.body.append(button)
    const events = []
    const dispatcher = new BrowserEventDispatcher()

    button.addEventListener('click', (event) => {
      events.push({
        type: event.type,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        detail: event.detail,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
      })
    })

    expect(
      dispatcher.dispatchMouseEvent({
        type: 'click',
        target: button,
        point: { x: 9, y: 10 },
        button: 'primary',
        buttons: [],
        detail: 1,
      }),
    ).toBe(true)

    expect(events).toEqual([
      {
        type: 'click',
        clientX: 9,
        clientY: 10,
        button: 0,
        buttons: 0,
        detail: 1,
        bubbles: true,
        cancelable: true,
      },
    ])

    button.addEventListener('click', (event) => event.preventDefault(), { once: true })
    expect(
      dispatcher.dispatchMouseEvent({
        type: 'click',
        target: button,
        point: { x: 9, y: 10 },
        button: 'primary',
        buttons: [],
      }),
    ).toBe(false)
  })

  it('dispatches keyboard and text input descriptors', () => {
    const input = document.createElement('input')
    document.body.append(input)
    const seen = []
    const dispatcher = new BrowserEventDispatcher()

    input.addEventListener('keydown', (event) => {
      seen.push({
        type: event.type,
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
      })
      event.preventDefault()
    })

    expect(
      dispatcher.dispatchKeyboardEvent({
        type: 'keydown',
        target: input,
        key: 'A',
        code: 'KeyA',
        modifiers: ['shift', 'ctrl'],
      }),
    ).toBe(false)

    expect(seen).toEqual([
      {
        type: 'keydown',
        key: 'A',
        code: 'KeyA',
        shiftKey: true,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      },
    ])

    input.addEventListener(
      'beforeinput',
      (event) => {
        seen.push({
          type: event.type,
          data: event.data,
          inputType: event.inputType,
          bubbles: event.bubbles,
          cancelable: event.cancelable,
        })
        event.preventDefault()
      },
      { once: true },
    )

    expect(
      dispatcher.dispatchTextInputEvent({
        type: 'beforeinput',
        target: input,
        text: 'x',
        inputType: 'insertText',
      }),
    ).toBe(false)

    input.addEventListener('input', (event) => {
      seen.push({
        type: event.type,
        data: event.data,
        inputType: event.inputType,
        bubbles: event.bubbles,
        cancelable: event.cancelable,
      })
    })

    expect(
      dispatcher.dispatchTextInputEvent({
        type: 'input',
        target: input,
        text: 'x',
        inputType: 'insertText',
      }),
    ).toBe(true)

    input.addEventListener('change', (event) => {
      seen.push({ type: event.type, bubbles: event.bubbles, cancelable: event.cancelable })
    })

    expect(dispatcher.dispatchTextInputEvent({ type: 'change', target: input })).toBe(true)

    expect(seen.slice(1)).toEqual([
      {
        type: 'beforeinput',
        data: 'x',
        inputType: 'insertText',
        bubbles: true,
        cancelable: true,
      },
      {
        type: 'input',
        data: 'x',
        inputType: 'insertText',
        bubbles: true,
        cancelable: false,
      },
      {
        type: 'change',
        bubbles: true,
        cancelable: false,
      },
    ])
  })
})

describe('BrowserStateApplier', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('applies and cleans up actorble state attributes', () => {
    const target = document.createElement('button')
    document.body.append(target)
    const handle = targetHandle('target-1', target)
    const applier = new BrowserStateApplier()

    applier.applyStateEffects([
      { kind: 'hover', target: handle, active: true },
      { kind: 'active', target: handle, active: true },
      { kind: 'focus', target: handle, active: true },
      { kind: 'focus-visible', target: handle, active: true },
      { kind: 'dragging', target: handle, active: true },
    ])

    expect(target.hasAttribute('data-actorble-hover')).toBe(true)
    expect(target.hasAttribute('data-actorble-active')).toBe(true)
    expect(target.hasAttribute('data-actorble-focus')).toBe(true)
    expect(target.hasAttribute('data-actorble-focus-visible')).toBe(true)
    expect(target.hasAttribute('data-actorble-dragging')).toBe(true)

    applier.applyStateEffects([
      { kind: 'active', target: handle, active: false },
      { kind: 'focus-visible', target: null, active: false },
    ])

    expect(target.hasAttribute('data-actorble-hover')).toBe(true)
    expect(target.hasAttribute('data-actorble-active')).toBe(false)
    expect(target.hasAttribute('data-actorble-focus-visible')).toBe(false)

    applier.cleanup()

    for (const attribute of [
      'data-actorble-hover',
      'data-actorble-focus',
      'data-actorble-dragging',
    ]) {
      expect(target.hasAttribute(attribute)).toBe(false)
    }
  })
})

describe('BrowserStyleAdapter', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('injects runtime styles and removes them by disposable or id', () => {
    const adapter = new BrowserStyleAdapter(document)
    const disposable = adapter.injectStyle({
      id: 'mirror',
      cssText: '[data-actorble-hover] { outline: 1px solid red; }',
    })

    const injected = document.head.querySelector('style[data-actorble-style-id="mirror"]')
    expect(injected?.textContent).toBe('[data-actorble-hover] { outline: 1px solid red; }')

    disposable.dispose()
    expect(document.head.querySelector('style[data-actorble-style-id="mirror"]')).toBeNull()

    adapter.injectStyle({ id: 'cursor', cssText: '[data-actorble-cursor] { display: block; }' })
    expect(document.head.querySelector('style[data-actorble-style-id="cursor"]')).not.toBeNull()

    adapter.removeStyle('cursor')
    expect(document.head.querySelector('style[data-actorble-style-id="cursor"]')).toBeNull()
  })

  it('scans accessible stylesheets and skips actorble runtime styles', () => {
    const source = document.createElement('style')
    source.textContent = `
      .button:hover { color: red; }
      @media (min-width: 1px) { .field:focus-visible { outline: 1px solid blue; } }
    `
    document.head.append(source)

    const adapter = new BrowserStyleAdapter(document)
    adapter.injectStyle({
      id: 'actorble-pseudo-state-mirror',
      cssText: '.button[data-actorble-hover] { color: red; }',
    })

    expect(adapter.scanStyleSheets()).toEqual({
      rules: [
        {
          kind: 'style',
          selectorText: '.button:hover',
          styleText: 'color: red;',
        },
        {
          kind: 'group',
          prelude: '@media (min-width: 1px)',
          rules: [
            {
              kind: 'style',
              selectorText: '.field:focus-visible',
              styleText: 'outline: 1px solid blue;',
            },
          ],
        },
      ],
      warnings: [],
    })
  })
})
