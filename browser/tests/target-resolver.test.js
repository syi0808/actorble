import { beforeEach, describe, expect, it } from 'vitest'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js'
import { css, element, label, point, role, testId, text } from '../src/shared/index.js'
import { BrowserTargetResolver, createTargetResolver } from '../src/targeting/target-resolver/index.js'

function createClock(start = 1000) {
  let current = start

  return {
    now() {
      return current++
    },
  }
}

function createResolver(options = {}) {
  return new BrowserTargetResolver({
    dom: new BrowserDomAdapter(document),
    clock: createClock(),
    idPrefix: 'target',
    ...options,
  })
}

describe('BrowserTargetResolver', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves css locators into live snapshot handles in DOM order', async () => {
    document.body.innerHTML = `
      <main>
        <button id="save" class="primary" aria-label="Save changes">Save</button>
        <button id="cancel" class="primary">Cancel</button>
      </main>
    `
    const save = document.querySelector('#save')
    const cancel = document.querySelector('#cancel')
    const resolver = createResolver()

    const all = await resolver.resolveAll(css('button.primary'))
    expect(all.map((handle) => handle.element)).toEqual([save, cancel])
    expect(all.map((handle) => handle.id)).toEqual(['target-1', 'target-2'])
    expect(all[0]).toMatchObject({
      root: document,
      locator: { kind: 'css', selector: 'button.primary' },
      resolvedAt: 1000,
      validity: 'live',
      debug: {
        selector: '#save',
        role: 'button',
        name: 'Save changes',
      },
    })

    const first = await resolver.resolve(css('button.primary'))
    expect(first.element).toBe(save)
    expect(first.id).toBe('target-3')
    expect(await resolver.exists(css('button.primary'))).toBe(true)
    expect(await resolver.exists(css('.missing'))).toBe(false)
  })

  it('uses strict mode to distinguish missing and ambiguous css locators', async () => {
    document.body.innerHTML = `
      <button class="choice">One</button>
      <button class="choice">Two</button>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(css('.missing'), { strict: true })).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
    })
    await expect(resolver.resolve(css('.choice'), { strict: true })).rejects.toMatchObject({
      code: 'TARGET_AMBIGUOUS',
      details: { count: 2 },
    })

    const first = await resolver.resolve(css('.choice'))
    expect(first.element.textContent).toBe('One')
  })

  it('resolves element locators and reports detached elements', async () => {
    const button = document.createElement('button')
    button.id = 'save'
    document.body.append(button)
    const resolver = createResolver()

    const handle = await resolver.resolve(element(button))
    expect(handle.element).toBe(button)
    expect(handle.locator).toEqual({ kind: 'element', element: button })
    expect(await resolver.resolveAll(element(button))).toHaveLength(1)

    button.remove()

    await expect(resolver.resolve(element(button))).rejects.toMatchObject({
      code: 'TARGET_DETACHED',
    })
    await expect(resolver.resolveAll(element(button))).resolves.toEqual([])
    await expect(resolver.exists(element(button))).resolves.toBe(false)
  })

  it('inspects target-like values without changing handle identity', async () => {
    document.body.innerHTML = '<button id="save" aria-label="Save changes">Save</button>'
    const button = document.querySelector('#save')
    const resolver = createResolver()
    const handle = await resolver.resolve(css('#save'))

    const byLocator = await resolver.inspect(css('#save'))
    expect(byLocator).toMatchObject({
      validity: 'live',
      debug: { selector: '#save', role: 'button', name: 'Save changes' },
    })
    expect(byLocator.target.element).toBe(button)

    button.setAttribute('aria-label', 'Save now')
    const byHandle = await resolver.inspect(handle)
    expect(byHandle.target.id).toBe(handle.id)
    expect(byHandle.debug.name).toBe('Save now')

    button.remove()
    const detached = await resolver.inspect(handle)
    expect(detached).toMatchObject({
      validity: 'stale',
      target: { id: handle.id },
    })
  })

  it('validates live handles and re-resolves stale css handles', async () => {
    document.body.innerHTML = '<button id="save">Old</button>'
    const oldButton = document.querySelector('#save')
    const resolver = createResolver()
    const handle = await resolver.resolve(css('#save'))

    await expect(resolver.validate(handle)).resolves.toBe(handle)

    oldButton.remove()
    document.body.innerHTML = '<button id="save">New</button>'
    const newButton = document.querySelector('#save')
    const recovered = await resolver.validate(handle)

    expect(recovered).not.toBe(handle)
    expect(recovered.element).toBe(newButton)
    expect(recovered.validity).toBe('live')

    newButton.remove()
    await expect(resolver.validate(recovered)).rejects.toMatchObject({
      code: 'TARGET_STALE',
    })
  })

  it('rejects unrecoverable detached handles during validation', async () => {
    const button = document.createElement('button')
    document.body.append(button)
    const resolver = createResolver()
    const handle = await resolver.resolve(element(button))

    button.remove()

    await expect(resolver.validate(handle)).rejects.toMatchObject({
      code: 'TARGET_DETACHED',
    })
  })

  it('records target resolution diagnostics when a trace is provided', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const trace = new BrowserDiagnosticsTrace({ clock: createClock(5000), idPrefix: 'trace' })
    const resolver = createResolver({ trace })

    await resolver.resolve(css('#save'))
    await expect(resolver.resolve(css('.missing'))).rejects.toMatchObject({
      code: 'TARGET_NOT_FOUND',
    })

    const snapshot = trace.getTrace()
    expect(snapshot.spans).toEqual([
      expect.objectContaining({ name: 'target.resolve', status: 'ok' }),
      expect.objectContaining({
        name: 'target.resolve',
        status: 'error',
        error: expect.objectContaining({ code: 'TARGET_NOT_FOUND' }),
      }),
    ])
    expect(snapshot.snapshots).toEqual([
      expect.objectContaining({
        name: 'target.resolve.candidates',
        data: expect.objectContaining({
          rankingPolicy: 'score-desc-dom-order',
          ambiguity: 'single-best',
        }),
      }),
      expect.objectContaining({
        name: 'target.resolve.candidates',
        data: expect.objectContaining({
          rankingPolicy: 'score-desc-dom-order',
          ambiguity: 'no-candidates',
        }),
      }),
    ])
  })

  it('resolves role locators by accessible name ranking and strict ambiguity', async () => {
    document.body.innerHTML = `
      <button id="create" aria-label="Create Project">Create</button>
      <button id="cancel">Create Draft</button>
      <button id="hidden" hidden>Create Project</button>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(role('button', { name: 'Create Project' }))).resolves.toMatchObject({
      element: document.querySelector('#create'),
    })
    await expect(
      resolver.resolveAll(role('button', { name: /create/i })),
    ).resolves.toMatchObject([
      { element: document.querySelector('#create') },
      { element: document.querySelector('#cancel') },
    ])

    document.querySelector('#hidden').hidden = false

    await expect(
      resolver.resolve(role('button', { name: 'Create Project' }), { strict: true }),
    ).rejects.toMatchObject({
      code: 'TARGET_AMBIGUOUS',
      details: { count: 2, ambiguity: 'strict-multiple-candidates' },
    })
  })

  it('treats any multiple strict role candidates as ambiguous even when scores differ', async () => {
    document.body.innerHTML = `
      <button id="exact" aria-label="Create">Create</button>
      <button id="partial" aria-label="Create Project">Create project</button>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(role('button', { name: 'Create' }))).resolves.toMatchObject({
      element: document.querySelector('#exact'),
    })

    await expect(
      resolver.resolve(role('button', { name: 'Create' }), { strict: true }),
    ).rejects.toMatchObject({
      code: 'TARGET_AMBIGUOUS',
      details: {
        locator: { kind: 'role', role: 'button', name: 'Create' },
        count: 2,
        ambiguity: 'strict-multiple-candidates',
      },
    })
  })

  it('resolves text locators with exact, partial, and regular expression matching', async () => {
    document.body.innerHTML = `
      <main>
        <p id="partial">Project created successfully</p>
        <p id="exact">Project created</p>
        <p id="hidden" hidden>Project created</p>
      </main>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(text('Project created', { exact: true }))).resolves.toMatchObject({
      element: document.querySelector('#exact'),
    })
    await expect(resolver.resolve(text('success'))).resolves.toMatchObject({
      element: document.querySelector('#partial'),
    })
    await expect(resolver.resolve(text(/created$/))).resolves.toMatchObject({
      element: document.querySelector('#exact'),
    })
  })

  it('resolves label locators to their associated controls', async () => {
    document.body.innerHTML = `
      <form>
        <label for="email">Email address</label>
        <input id="email" />
        <label>Display name <input id="name" /></label>
        <button id="aria" aria-label="Email address">Not a label target</button>
      </form>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(label('Email address'))).resolves.toMatchObject({
      element: document.querySelector('#email'),
    })
    await expect(resolver.resolve(label('Display name'))).resolves.toMatchObject({
      element: document.querySelector('#name'),
    })
  })

  it('resolves test id locators with default and custom attributes', async () => {
    document.body.innerHTML = `
      <button id="default" data-testid="save">Save</button>
      <button id="custom" data-qa="save">Save QA</button>
    `
    const resolver = createResolver()

    await expect(resolver.resolve(testId('save'))).resolves.toMatchObject({
      element: document.querySelector('#default'),
    })
    await expect(resolver.resolve(testId('save', { attribute: 'data-qa' }))).resolves.toMatchObject({
      element: document.querySelector('#custom'),
    })
  })

  it('resolves point locators through platform hit testing', async () => {
    const target = document.createElement('button')
    target.id = 'hit'
    document.body.append(target)
    const dom = new BrowserDomAdapter(document)
    dom.elementFromPoint = () => target
    const resolver = createResolver({ dom })

    await expect(resolver.resolve(point(10, 20))).resolves.toMatchObject({
      element: target,
    })
  })

  it('resolves queryable locators inside open shadow roots', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadowRoot = host.attachShadow({ mode: 'open' })
    shadowRoot.innerHTML = '<button id="shadow-save" aria-label="Save shadow">Save</button>'
    const resolver = createResolver()

    await expect(resolver.resolve(css('#shadow-save'))).resolves.toMatchObject({
      element: shadowRoot.querySelector('#shadow-save'),
    })
    await expect(resolver.resolve(role('button', { name: 'Save shadow' }))).resolves.toMatchObject({
      element: shadowRoot.querySelector('#shadow-save'),
    })
  })

  it('records locator ranking and hard browser fidelity limits in diagnostics', async () => {
    document.body.innerHTML = `
      <button id="first" aria-label="Save">One</button>
      <button id="second" aria-label="Save">Two</button>
    `
    const trace = new BrowserDiagnosticsTrace({ clock: createClock(6000), idPrefix: 'trace' })
    const resolver = createResolver({ trace })

    await expect(resolver.resolve(role('button', { name: 'Save' }), { strict: true })).rejects.toMatchObject({
      code: 'TARGET_AMBIGUOUS',
    })

    const snapshot = trace.getTrace()
    expect(snapshot.snapshots).toContainEqual(
      expect.objectContaining({
        name: 'target.resolve.candidates',
        data: expect.objectContaining({
          locator: { kind: 'role', role: 'button', name: 'Save' },
          rankingPolicy: 'score-desc-dom-order',
          ambiguity: 'strict-multiple-candidates',
          candidates: [
            expect.objectContaining({ index: 0, score: 100, reasons: ['role', 'name:exact'] }),
            expect.objectContaining({ index: 1, score: 100, reasons: ['role', 'name:exact'] }),
          ],
        }),
      }),
    )
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        message: 'Browser resolver cannot inspect cross-origin frames or closed shadow roots.',
      }),
      expect.objectContaining({
        message: 'Browser actions dispatch synthetic events; native drag/drop fidelity is unavailable.',
        details: expect.objectContaining({
          trustedEvents: false,
          dragAndDrop: 'pointer-gesture',
          nativeDnD: false,
          unsupported: expect.arrayContaining([
            'html5-dnd',
            'native-dnd',
            'editor-selection-drag',
            'custom-dnd-adapter',
          ]),
        }),
      }),
    ])
  })
})

describe('createTargetResolver', () => {
  it('creates a browser target resolver with injectable dependencies', async () => {
    document.body.innerHTML = '<button id="save">Save</button>'
    const resolver = createTargetResolver({
      dom: new BrowserDomAdapter(document),
      clock: createClock(2000),
      idPrefix: 'factory',
    })

    await expect(resolver.resolve(css('#save'))).resolves.toMatchObject({
      id: 'factory-1',
      resolvedAt: 2000,
    })
  })
})
