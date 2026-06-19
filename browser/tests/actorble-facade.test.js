import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Actorble, createActorble } from '../src/api/actorble-facade/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
import { BROWSER_OPTION_DEFAULTS } from '../src/options/index.js'
import { css } from '../src/shared/index.js'

function targetHandle(id = 'target-1') {
  const target = document.createElement('button')
  target.id = id
  document.body.append(target)

  return {
    id,
    element: target,
    root: document,
    resolvedAt: 1000,
    validity: 'live',
    debug: { selector: `#${id}`, description: `button#${id}` },
  }
}

function createDependencies() {
  const target = targetHandle()
  const trace = new BrowserDiagnosticsTrace({ idPrefix: 'facade' })
  const condition = { kind: 'custom', predicate: () => true }
  const resolver = {
    resolve: vi.fn(async () => target),
    resolveAll: vi.fn(async () => [target]),
    exists: vi.fn(async () => true),
    inspect: vi.fn(async () => ({ target, debug: target.debug, validity: 'live' })),
    validate: vi.fn(async () => target),
  }
  const orchestrator = {
    moveTo: vi.fn(async () => {}),
    click: vi.fn(async () => {}),
    clickCurrent: vi.fn(async () => {}),
    doubleClick: vi.fn(async () => {}),
    focus: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    typeInto: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
    scrollTo: vi.fn(async () => {}),
    drag: vi.fn(async () => {}),
    selectText: vi.fn(async () => {}),
    pointerSequence: vi.fn(async () => {}),
    waitFor: vi.fn(async () => ({ condition, satisfied: true, strategy: 'settled' })),
    geometry: vi.fn(),
  }
  const runner = {
    run: vi.fn(async () => {}),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    getSnapshot: vi.fn(() => ({ scenario: null, status: 'idle', currentStepIndex: null })),
  }

  return { condition, orchestrator, resolver, runner, target, trace }
}

function createClickableButton(id = 'create') {
  const button = document.createElement('button')
  button.id = id
  button.textContent = id
  button.scrollIntoView = vi.fn()
  button.getBoundingClientRect = vi.fn(() => ({
    x: 15,
    y: 25,
    width: 50,
    height: 20,
    top: 25,
    left: 15,
    right: 65,
    bottom: 45,
    toJSON: () => {},
  }))
  document.body.append(button)
  document.elementFromPoint = vi.fn(() => button)

  const seen = []
  button.addEventListener('pointerdown', () => seen.push('pointerdown'))
  button.addEventListener('pointerup', () => seen.push('pointerup'))
  button.addEventListener('click', () => seen.push('click'))

  return { button, seen }
}

function createTypeableInput(id = 'message') {
  const input = document.createElement('input')
  input.id = id
  input.scrollIntoView = vi.fn()
  input.getBoundingClientRect = vi.fn(() => ({
    x: 20,
    y: 30,
    width: 160,
    height: 24,
    top: 30,
    left: 20,
    right: 180,
    bottom: 54,
    toJSON: () => {},
  }))
  document.body.append(input)
  document.elementFromPoint = vi.fn(() => input)

  return input
}

function createFakeVisualLayer() {
  return {
    showCursor: vi.fn(),
    highlightTarget: vi.fn(),
    showClick: vi.fn(),
    showFocus: vi.fn(),
    showTyping: vi.fn(),
    showKeystroke: vi.fn(),
    clearFeedback: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
  }
}

describe('Actorble facade', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('delegates public entrypoints to injected modules', async () => {
    const { condition, orchestrator, resolver, runner, target, trace } = createDependencies()
    const actorble = new Actorble({ orchestrator, resolver, runner, trace })
    const locator = css('#target-1')
    const otherLocator = css('#target-2')
    const scrollPosition = { x: 10, y: 20 }
    const scenario = { steps: [{ action: 'click', target: locator }] }
    const moveOptions = { timeout: 5, duration: 6 }
    const clickOptions = { timeout: 10, force: true }
    const clickCurrentOptions = { timeout: 11, button: 'primary' }
    const doubleClickOptions = { timeout: 12, clickCount: 2 }
    const focusOptions = { timeout: 13, focusVisible: true }
    const typeOptions = { timeout: 14, delay: 1, focusStrategy: 'none' }
    const typeIntoOptions = { timeout: 15, delay: 2 }
    const fillOptions = { timeout: 16, clear: true }
    const pressOptions = { timeout: 17, delay: 3 }
    const scrollOptions = { timeout: 18, behavior: 'instant' }
    const dragOptions = { timeout: 19, force: true }
    const selectTextOptions = { timeout: 21 }
    const pointerSequence = [
      { type: 'move', to: { x: 1, y: 2 }, duration: 10 },
      { type: 'down', button: 'primary' },
      { type: 'up', button: 'primary' },
    ]
    const pointerSequenceOptions = { timeout: 22 }
    const waitOptions = { timeout: 20 }

    await expect(actorble.resolve(locator, { strict: true })).resolves.toBe(target)
    await expect(actorble.moveTo(locator, moveOptions)).resolves.toBeUndefined()
    await expect(actorble.click(locator, clickOptions)).resolves.toBeUndefined()
    await expect(actorble.clickCurrent(clickCurrentOptions)).resolves.toBeUndefined()
    await expect(actorble.doubleClick(locator, doubleClickOptions)).resolves.toBeUndefined()
    await expect(actorble.focus(locator, focusOptions)).resolves.toBeUndefined()
    await expect(actorble.type('hello', typeOptions)).resolves.toBeUndefined()
    await expect(actorble.typeInto(locator, 'hello', typeIntoOptions)).resolves.toBeUndefined()
    await expect(actorble.fill(locator, 'filled', fillOptions)).resolves.toBeUndefined()
    await expect(actorble.press('Shift+K', pressOptions)).resolves.toBeUndefined()
    await expect(actorble.scrollTo(scrollPosition, scrollOptions)).resolves.toBeUndefined()
    await expect(actorble.drag(locator, otherLocator, dragOptions)).resolves.toBeUndefined()
    await expect(actorble.selectText(locator, selectTextOptions)).resolves.toBeUndefined()
    await expect(
      actorble.pointerSequence(pointerSequence, pointerSequenceOptions),
    ).resolves.toBeUndefined()
    await expect(actorble.waitFor(condition, waitOptions)).resolves.toBeUndefined()
    await expect(actorble.run(scenario, { timeout: 30 })).resolves.toBeUndefined()
    actorble.pause()
    actorble.resume()
    actorble.stop()

    expect(resolver.resolve).toHaveBeenCalledWith(locator, { strict: true })
    expect(orchestrator.moveTo).toHaveBeenCalledWith(locator, moveOptions)
    expect(orchestrator.click).toHaveBeenCalledWith(locator, {
      ...clickOptions,
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
    expect(orchestrator.clickCurrent).toHaveBeenCalledWith({
      ...clickCurrentOptions,
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
    expect(orchestrator.doubleClick).toHaveBeenCalledWith(locator, {
      ...doubleClickOptions,
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
    expect(orchestrator.focus).toHaveBeenCalledWith(locator, focusOptions)
    expect(orchestrator.type).toHaveBeenCalledWith('hello', typeOptions)
    expect(orchestrator.typeInto).toHaveBeenCalledWith(locator, 'hello', typeIntoOptions)
    expect(orchestrator.fill).toHaveBeenCalledWith(locator, 'filled', fillOptions)
    expect(orchestrator.press).toHaveBeenCalledWith('Shift+K', pressOptions)
    expect(orchestrator.scrollTo).toHaveBeenCalledWith(scrollPosition, scrollOptions)
    expect(orchestrator.drag).toHaveBeenCalledWith(locator, otherLocator, {
      ...dragOptions,
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
    })
    expect(orchestrator.selectText).toHaveBeenCalledWith(locator, selectTextOptions)
    expect(orchestrator.pointerSequence).toHaveBeenCalledWith(
      pointerSequence,
      pointerSequenceOptions,
    )
    expect(orchestrator.waitFor).toHaveBeenCalledWith(condition, waitOptions)
    expect(runner.run).toHaveBeenCalledWith(scenario, { timeout: 30 })
    expect(runner.pause).toHaveBeenCalledOnce()
    expect(runner.resume).toHaveBeenCalledOnce()
    expect(runner.stop).toHaveBeenCalledOnce()
    expect(actorble.getTrace()).toEqual(trace.getTrace())
  })

  it('applies actorble-level action defaults to direct public calls', async () => {
    const { orchestrator, resolver, runner, trace } = createDependencies()
    const actorble = new Actorble({
      orchestrator,
      resolver,
      runner,
      trace,
      actionDefaults: {
        click: { timeout: 100, pressDwell: 0 },
        moveTo: { duration: 25 },
        typeInto: { delay: 5 },
        selectText: { timeout: 30 },
        pointerSequence: { timeout: 40 },
      },
    })
    const locator = css('#target-1')
    const pointerSequence = [{ type: 'move', to: { x: 1, y: 2 } }]

    await expect(actorble.click(locator, { timeout: 10, pressDwell: 12 })).resolves.toBeUndefined()
    await expect(actorble.moveTo(locator)).resolves.toBeUndefined()
    await expect(actorble.typeInto(locator, 'hello')).resolves.toBeUndefined()
    await expect(actorble.selectText(locator)).resolves.toBeUndefined()
    await expect(actorble.pointerSequence(pointerSequence)).resolves.toBeUndefined()

    expect(orchestrator.click).toHaveBeenCalledWith(locator, {
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      timeout: 10,
      pressDwell: 12,
    })
    expect(orchestrator.moveTo).toHaveBeenCalledWith(locator, { duration: 25 })
    expect(orchestrator.typeInto).toHaveBeenCalledWith(locator, 'hello', { delay: 5 })
    expect(orchestrator.selectText).toHaveBeenCalledWith(locator, { timeout: 30 })
    expect(orchestrator.pointerSequence).toHaveBeenCalledWith(pointerSequence, { timeout: 40 })
  })

  it('applies actorble-level defaults to the default scenario runner', async () => {
    const { orchestrator, resolver, trace } = createDependencies()
    const actorble = new Actorble({
      orchestrator,
      resolver,
      trace,
      actionDefaults: {
        click: { timeout: 100, pressDwell: 0 },
      },
    })
    const locator = css('#target-1')

    await expect(
      actorble.run(
        {
          steps: [{ action: 'click', target: locator }],
        },
        {
          actionDefaults: {
            click: { timeout: 50 },
          },
        },
      ),
    ).resolves.toBeUndefined()

    expect(orchestrator.click).toHaveBeenCalledWith(locator, {
      motion: BROWSER_OPTION_DEFAULTS.pointerMotion,
      timeout: 50,
      pressDwell: 0,
      signal: expect.any(AbortSignal),
    })
  })

  it('applies actorble-level motion policy to direct pointer calls without overriding call movement', async () => {
    const { orchestrator, resolver, runner, trace } = createDependencies()
    const motion = { kind: 'ease', timing: 'ease-out', duration: 40 }
    const actorble = new Actorble({
      orchestrator,
      resolver,
      runner,
      trace,
      motion: false,
    })
    const locator = css('#target-1')

    await expect(actorble.click(locator)).resolves.toBeUndefined()
    await expect(actorble.moveTo(locator, { motion })).resolves.toBeUndefined()

    expect(orchestrator.click).toHaveBeenCalledWith(locator, {
      duration: 0,
      pressDwell: BROWSER_OPTION_DEFAULTS.clickPressDwell,
    })
    expect(orchestrator.moveTo).toHaveBeenCalledWith(locator, { motion })
  })

  it('creates a default module graph that can resolve and click through the facade', async () => {
    const button = document.createElement('button')
    button.id = 'save'
    button.textContent = 'Save'
    button.scrollIntoView = vi.fn()
    button.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      top: 20,
      left: 10,
      right: 50,
      bottom: 40,
      toJSON: () => {},
    }))
    document.body.append(button)
    document.elementFromPoint = vi.fn(() => button)
    const seen = []
    button.addEventListener('pointerdown', () => seen.push('pointerdown'))
    button.addEventListener('pointerup', () => seen.push('pointerup'))
    button.addEventListener('click', () => seen.push('click'))
    const actorble = createActorble()

    await expect(actorble.click(css('#save'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).toBeNull()
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.click', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can double-click through the facade', async () => {
    const button = document.createElement('button')
    button.id = 'open'
    button.textContent = 'Open'
    button.scrollIntoView = vi.fn()
    button.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      top: 20,
      left: 10,
      right: 50,
      bottom: 40,
      toJSON: () => {},
    }))
    document.body.append(button)
    document.elementFromPoint = vi.fn(() => button)
    const seen = []

    for (const eventName of ['pointerdown', 'pointerup', 'click']) {
      button.addEventListener(eventName, (event) => {
        seen.push({ type: event.type, detail: event.detail })
      })
    }

    const actorble = createActorble()

    await expect(actorble.doubleClick(css('#open'), { pressDwell: 0 })).resolves.toBeUndefined()

    expect(seen).toEqual([
      { type: 'pointerdown', detail: 0 },
      { type: 'pointerup', detail: 0 },
      { type: 'click', detail: 1 },
      { type: 'pointerdown', detail: 0 },
      { type: 'pointerup', detail: 0 },
      { type: 'click', detail: 2 },
    ])
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.doubleClick', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can click the current pointer target', async () => {
    const { seen } = createClickableButton('current')
    const actorble = createActorble()

    await expect(actorble.moveTo(css('#current'), { duration: 0 })).resolves.toBeUndefined()
    await expect(
      actorble.clickCurrent({ duration: 0, pressDwell: 0 }),
    ).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.moveTo', status: 'ok' }),
        expect.objectContaining({ name: 'action.clickCurrent', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can focus through the facade', async () => {
    const input = document.createElement('input')
    input.id = 'name'
    input.scrollIntoView = vi.fn()
    input.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 120,
      height: 24,
      top: 20,
      left: 10,
      right: 130,
      bottom: 44,
      toJSON: () => {},
    }))
    document.body.append(input)
    document.elementFromPoint = vi.fn(() => input)
    const actorble = createActorble()

    await expect(actorble.focus(css('#name'), { focusVisible: true })).resolves.toBeUndefined()

    expect(document.activeElement).toBe(input)
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.focus', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can programmatically focus negative tabindex targets', async () => {
    const panel = document.createElement('div')
    panel.id = 'panel'
    panel.setAttribute('tabindex', '-1')
    panel.scrollIntoView = vi.fn()
    panel.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 120,
      height: 24,
      top: 20,
      left: 10,
      right: 130,
      bottom: 44,
      toJSON: () => {},
    }))
    document.body.append(panel)
    document.elementFromPoint = vi.fn(() => panel)
    const actorble = createActorble()

    await expect(actorble.focus(css('#panel'), { focusVisible: true })).resolves.toBeUndefined()

    expect(document.activeElement).toBe(panel)
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.focus', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can type into the current focus', async () => {
    const input = document.createElement('input')
    input.id = 'message'
    input.value = 'A'
    document.body.append(input)
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
    const actorble = createActorble()

    await expect(actorble.type('BC', { delay: 0 })).resolves.toBeUndefined()

    expect(input.value).toBe('ABC')
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.type', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can press keys on the current focus', async () => {
    const input = document.createElement('input')
    input.id = 'shortcut'
    document.body.append(input)
    input.focus()
    const seen = []

    for (const eventName of ['keydown', 'keyup']) {
      input.addEventListener(eventName, (event) => {
        seen.push({
          type: event.type,
          key: event.key,
          shiftKey: event.shiftKey,
        })
      })
    }

    const actorble = createActorble()

    await expect(actorble.press('Shift+K', { delay: 0 })).resolves.toBeUndefined()

    expect(seen).toEqual([
      { type: 'keydown', key: 'Shift', shiftKey: true },
      { type: 'keydown', key: 'K', shiftKey: true },
      { type: 'keyup', key: 'K', shiftKey: true },
      { type: 'keyup', key: 'Shift', shiftKey: false },
    ])
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.press', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can fill a target value', async () => {
    const input = document.createElement('input')
    input.id = 'message'
    input.value = 'old value'
    input.scrollIntoView = vi.fn()
    input.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 120,
      height: 24,
      top: 20,
      left: 10,
      right: 130,
      bottom: 44,
      toJSON: () => {},
    }))
    document.body.append(input)
    document.elementFromPoint = vi.fn(() => input)
    const actorble = createActorble()

    await expect(actorble.fill(css('#message'), 'new value')).resolves.toBeUndefined()

    expect(input.value).toBe('new value')
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.fill', status: 'ok' }),
      ]),
    )
  })

  it('creates a default module graph that can scroll to a resolved target', async () => {
    const panel = document.createElement('div')
    panel.id = 'panel'
    panel.scrollTo = vi.fn()
    document.body.append(panel)
    const actorble = createActorble()

    await expect(actorble.scrollTo(css('#panel'), { behavior: 'instant' })).resolves.toBeUndefined()

    expect(panel.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'instant' })
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.scrollTo', status: 'ok' }),
      ]),
    )
    expect(actorble.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'surface:scrolled',
          data: expect.objectContaining({
            action: 'scrollTo',
            inputKind: 'target',
          }),
        }),
      ]),
    )
  })

  it('creates a default module graph that can drag through the facade', async () => {
    const source = document.createElement('button')
    source.id = 'drag-source'
    source.textContent = 'Drag'
    source.scrollIntoView = vi.fn()
    source.getBoundingClientRect = vi.fn(() => ({
      x: 10,
      y: 20,
      width: 40,
      height: 20,
      top: 20,
      left: 10,
      right: 50,
      bottom: 40,
      toJSON: () => {},
    }))
    const destination = document.createElement('button')
    destination.id = 'drop-target'
    destination.textContent = 'Drop'
    destination.scrollIntoView = vi.fn()
    destination.getBoundingClientRect = vi.fn(() => ({
      x: 110,
      y: 20,
      width: 40,
      height: 20,
      top: 20,
      left: 110,
      right: 150,
      bottom: 40,
      toJSON: () => {},
    }))
    document.body.append(source, destination)
    document.elementFromPoint = vi.fn((x) => (x < 80 ? source : destination))
    const seen = []
    source.addEventListener('pointerdown', () => seen.push('source:pointerdown'))
    destination.addEventListener('pointerup', () => seen.push('destination:pointerup'))
    const actorble = createActorble()

    await expect(actorble.drag(css('#drag-source'), css('#drop-target'))).resolves.toBeUndefined()

    expect(seen).toEqual(['source:pointerdown', 'destination:pointerup'])
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.drag', status: 'ok' }),
      ]),
    )
    expect(actorble.getTrace().events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'pointer:synthetic-drag',
          data: expect.objectContaining({
            capability: 'pointer-gesture',
            nativeDnD: false,
          }),
        }),
      ]),
    )
  })

  it('subscribes external listeners to runtime trace events until removed', async () => {
    const button = document.createElement('button')
    button.id = 'blocked-subscription'
    button.disabled = true
    button.scrollIntoView = vi.fn()
    button.getBoundingClientRect = vi.fn(() => ({
      x: 15,
      y: 25,
      width: 50,
      height: 20,
      top: 25,
      left: 15,
      right: 65,
      bottom: 45,
      toJSON: () => {},
    }))
    document.body.append(button)
    document.elementFromPoint = vi.fn(() => button)
    const actorble = createActorble()
    const listener = vi.fn()

    actorble.on('action:failure', listener)

    await expect(actorble.click(css('#blocked-subscription'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
    })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'action:failure',
        spanId: expect.any(String),
        data: expect.objectContaining({
          action: 'click',
          phase: 'preflight',
          code: 'INTERACTABILITY_FAILED',
        }),
      }),
    )

    actorble.off('action:failure', listener)

    await expect(actorble.click(css('#blocked-subscription'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
    })

    expect(listener).toHaveBeenCalledOnce()
  })

  it('detaches facade listener registrations during destroy', () => {
    const trace = new BrowserDiagnosticsTrace({ idPrefix: 'facade' })
    const actorble = createActorble({ trace })
    const listener = vi.fn()

    actorble.on('scenario:pause', listener)
    trace.appendEvent('scenario:pause', { currentStepIndex: 0 })
    actorble.destroy()
    trace.appendEvent('scenario:pause', { currentStepIndex: 1 })

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      name: 'scenario:pause',
      at: expect.any(Number),
      data: { currentStepIndex: 0 },
    })
  })

  it('uses cursor feedback by default without changing click behavior', async () => {
    const button = document.createElement('button')
    button.id = 'create'
    button.textContent = 'Create'
    button.scrollIntoView = vi.fn()
    button.getBoundingClientRect = vi.fn(() => ({
      x: 15,
      y: 25,
      width: 50,
      height: 20,
      top: 25,
      left: 15,
      right: 65,
      bottom: 45,
      toJSON: () => {},
    }))
    document.body.append(button)
    document.elementFromPoint = vi.fn(() => button)
    const seen = []
    button.addEventListener('pointerdown', () => seen.push('pointerdown'))
    button.addEventListener('pointerup', () => seen.push('pointerup'))
    button.addEventListener('click', () => seen.push('click'))
    const actorble = createActorble()

    await expect(actorble.click(css('#create'))).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-focus]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-typing]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-keystroke]')).toBeNull()
  })

  it('enables debug feedback channels', async () => {
    const { seen } = createClickableButton('debug-visual')
    const actorble = createActorble({ feedback: 'debug' })

    await expect(actorble.click(css('#debug-visual'))).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).not.toBeNull()
  })

  it('does not create overlay DOM when feedback is off', async () => {
    const { seen } = createClickableButton('disabled-visual')
    const actorble = createActorble({ feedback: 'off' })

    await expect(actorble.click(css('#disabled-visual'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('honors an injected visual layer without creating default overlay DOM', async () => {
    const { button, seen } = createClickableButton('injected-visual')
    const visualLayer = createFakeVisualLayer()
    const actorble = createActorble({ feedback: 'debug', visualLayer })

    await expect(actorble.click(css('#injected-visual'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(visualLayer.highlightTarget).toHaveBeenCalledWith({
      target: expect.objectContaining({ element: button }),
      rect: { x: 15, y: 25, width: 50, height: 20 },
    })
    const cursorRequests = visualLayer.showCursor.mock.calls.map(([request]) => request)

    expect(cursorRequests.length).toBeGreaterThanOrEqual(3)
    expect(cursorRequests).toEqual(
      expect.arrayContaining([
        { point: { x: 40, y: 35 }, pressed: false },
        { point: { x: 40, y: 35 }, pressed: true },
      ]),
    )
    expect(cursorRequests.at(-1)).toEqual({
      point: { x: 40, y: 35 },
      pressed: false,
    })
    expect(visualLayer.showClick).toHaveBeenCalledWith({ x: 40, y: 35 })
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('passes text visibility into opt-in keystroke feedback with focus feedback', async () => {
    createTypeableInput('secret')
    const actorble = createActorble({
      feedback: { focus: true, keystroke: true, text: 'masked' },
    })

    await expect(actorble.typeInto(css('#secret'), 's')).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-focus]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('*')

    actorble.destroy()

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('creates only explicitly requested feedback parts', async () => {
    const { seen } = createClickableButton('granular-visual')
    const actorble = createActorble({
      feedback: { target: true, click: true },
    })

    await expect(actorble.click(css('#granular-visual'))).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-focus]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-typing]')).toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-keystroke]')).toBeNull()
  })

  it('clears opt-in overlay parts after a failed action', async () => {
    const button = document.createElement('button')
    button.id = 'blocked-action'
    button.disabled = true
    button.scrollIntoView = vi.fn()
    button.getBoundingClientRect = vi.fn(() => ({
      x: 15,
      y: 25,
      width: 50,
      height: 20,
      top: 25,
      left: 15,
      right: 65,
      bottom: 45,
      toJSON: () => {},
    }))
    document.body.append(button)
    document.elementFromPoint = vi.fn(() => button)
    const actorble = createActorble({ feedback: { target: true } })

    await expect(actorble.click(css('#blocked-action'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
    })

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay?.querySelector('[data-actorble-visual-highlight]')).toBeNull()
  })

  it('runs a public API feedback flow without letting the overlay block target hit-testing', async () => {
    const input = createTypeableInput('project-name')
    const { button, seen } = createClickableButton('create-project')
    const actorble = createActorble({ feedback: 'debug' })

    await expect(actorble.moveTo(css('#project-name'))).resolves.toBeUndefined()
    await expect(
      actorble.typeInto(css('#project-name'), 'Atlas', { delay: 1 }),
    ).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('s')

    overlay.style.pointerEvents = 'auto'
    document.elementFromPoint = vi.fn(() =>
      overlay.style.pointerEvents === 'none' ? button : overlay,
    )

    await expect(actorble.click(css('#create-project'))).resolves.toBeUndefined()

    expect(input.value).toBe('Atlas')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(overlay.style.pointerEvents).toBe('auto')
    expect(overlay.querySelector('[data-actorble-visual-click]')).not.toBeNull()
  })
})
