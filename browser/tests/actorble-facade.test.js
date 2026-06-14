import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Actorble, createActorble } from '../src/api/actorble-facade/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js'
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
    await expect(actorble.waitFor(condition, waitOptions)).resolves.toBeUndefined()
    await expect(actorble.run(scenario, { timeout: 30 })).resolves.toBeUndefined()
    actorble.pause()
    actorble.resume()
    actorble.stop()

    expect(resolver.resolve).toHaveBeenCalledWith(locator, { strict: true })
    expect(orchestrator.moveTo).toHaveBeenCalledWith(locator, moveOptions)
    expect(orchestrator.click).toHaveBeenCalledWith(locator, clickOptions)
    expect(orchestrator.clickCurrent).toHaveBeenCalledWith(clickCurrentOptions)
    expect(orchestrator.doubleClick).toHaveBeenCalledWith(locator, doubleClickOptions)
    expect(orchestrator.focus).toHaveBeenCalledWith(locator, focusOptions)
    expect(orchestrator.type).toHaveBeenCalledWith('hello', typeOptions)
    expect(orchestrator.typeInto).toHaveBeenCalledWith(locator, 'hello', typeIntoOptions)
    expect(orchestrator.fill).toHaveBeenCalledWith(locator, 'filled', fillOptions)
    expect(orchestrator.press).toHaveBeenCalledWith('Shift+K', pressOptions)
    expect(orchestrator.scrollTo).toHaveBeenCalledWith(scrollPosition, scrollOptions)
    expect(orchestrator.drag).toHaveBeenCalledWith(locator, otherLocator, dragOptions)
    expect(orchestrator.waitFor).toHaveBeenCalledWith(condition, waitOptions)
    expect(runner.run).toHaveBeenCalledWith(scenario, { timeout: 30 })
    expect(runner.pause).toHaveBeenCalledOnce()
    expect(runner.resume).toHaveBeenCalledOnce()
    expect(runner.stop).toHaveBeenCalledOnce()
    expect(actorble.getTrace()).toEqual(trace.getTrace())
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
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
    expect(actorble.getTrace().spans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'action.click', status: 'ok' }),
      ]),
    )
  })

  it('reports unsupported default public action paths with explicit platform limits', async () => {
    const actorble = createActorble()
    const locator = css('#missing')

    await expect(actorble.clickCurrent({ button: 'primary' })).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'clickCurrent',
        capability: 'current-pointer-target',
        limit: expect.any(String),
      },
    })
    await expect(actorble.doubleClick(locator)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'doubleClick',
        capability: 'multi-click-gesture',
        limit: expect.any(String),
      },
    })
    await expect(actorble.focus(locator)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'focus',
        capability: 'focus-action',
        limit: expect.any(String),
      },
    })
    await expect(actorble.type('hello')).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'type',
        capability: 'current-focus-text-input',
        limit: expect.any(String),
      },
    })
    await expect(actorble.fill(locator, 'value')).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'fill',
        capability: 'target-value-replacement',
        limit: expect.any(String),
      },
    })
    await expect(actorble.press('Enter')).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'press',
        capability: 'keyboard-action',
        limit: expect.any(String),
      },
    })
    await expect(actorble.scrollTo(locator)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'scrollTo',
        capability: 'public-scroll-action',
        limit: expect.any(String),
      },
    })
    await expect(actorble.drag(locator, locator)).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'action-orchestrator',
        action: 'drag',
        capability: 'drag-and-drop',
        limit: expect.any(String),
      },
    })
  })

  it('reports unsupported debug event subscriptions with the trace fallback', () => {
    const actorble = createActorble()
    const listener = vi.fn()

    expect(() => actorble.on('action:failure', listener)).toThrowError(
      expect.objectContaining({
        code: 'PLATFORM_UNSUPPORTED',
        details: {
          boundary: 'actorble-facade',
          action: 'on',
          capability: 'debug-event-subscription',
          limit: 'Debug event subscriptions are not implemented yet; use getTrace() for diagnostics snapshots.',
        },
      }),
    )
    expect(() => actorble.off('action:failure', listener)).toThrowError(
      expect.objectContaining({
        code: 'PLATFORM_UNSUPPORTED',
        details: {
          boundary: 'actorble-facade',
          action: 'off',
          capability: 'debug-event-subscription',
          limit: 'Debug event subscriptions are not implemented yet; use getTrace() for diagnostics snapshots.',
        },
      }),
    )
  })

  it('uses quiet cursor-only feedback for visual true without changing click behavior', async () => {
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
    const actorble = createActorble({ visual: true })

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

  it('restores legacy extra feedback through the debug visual preset', async () => {
    const { seen } = createClickableButton('debug-visual')
    const actorble = createActorble({ visual: { preset: 'debug' } })

    await expect(actorble.click(css('#debug-visual'))).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-cursor]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).not.toBeNull()
  })

  it('passes public cursor scale options into the default visual layer', async () => {
    const { seen } = createClickableButton('scaled-cursor')
    const actorble = createActorble({ visual: { cursorScale: 2 } })

    await expect(actorble.click(css('#scaled-cursor'))).resolves.toBeUndefined()

    const cursor = document.body.querySelector('[data-actorble-visual-cursor]')
    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(cursor).not.toBeNull()
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-x')).toBe('4')
    expect(cursor.getAttribute('data-actorble-cursor-hotspot-y')).toBe('4')
    expect(cursor.style.left).toBe('36px')
    expect(cursor.style.top).toBe('31px')
    expect(cursor.style.width).toBe('40px')
    expect(cursor.style.height).toBe('60px')
  })

  it('does not create overlay DOM when visual feedback is disabled', async () => {
    const { seen } = createClickableButton('disabled-visual')
    const actorble = createActorble({ visual: { enabled: false } })

    await expect(actorble.click(css('#disabled-visual'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('does not create the default visual layer in headless mode', async () => {
    const { seen } = createClickableButton('headless-visual')
    const actorble = createActorble({ mode: 'headless', visual: true })

    await expect(actorble.click(css('#headless-visual'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('honors an injected visual layer in headless mode without creating default overlay DOM', async () => {
    const { button, seen } = createClickableButton('injected-visual')
    const visual = createFakeVisualLayer()
    const actorble = createActorble({ mode: 'headless', visual })

    await expect(actorble.click(css('#injected-visual'))).resolves.toBeUndefined()

    expect(seen).toEqual(['pointerdown', 'pointerup', 'click'])
    expect(visual.highlightTarget).toHaveBeenCalledWith({
      target: expect.objectContaining({ element: button }),
      rect: { x: 15, y: 25, width: 50, height: 20 },
    })
    const cursorRequests = visual.showCursor.mock.calls.map(([request]) => request)

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
    expect(visual.showClick).toHaveBeenCalledWith({ x: 40, y: 35 })
    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('passes text visibility into opt-in keystroke feedback with focus feedback', async () => {
    createTypeableInput('secret')
    const actorble = createActorble({
      visual: { focusOverlay: true, keystrokeOverlay: true, textVisibility: 'masked' },
    })

    await expect(actorble.typeInto(css('#secret'), 's')).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-focus]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-keystroke]').textContent).toBe('*')

    actorble.destroy()

    expect(document.body.querySelector('[data-actorble-overlay-root]')).toBeNull()
  })

  it('creates only explicitly requested granular visual feedback parts', async () => {
    const { seen } = createClickableButton('granular-visual')
    const actorble = createActorble({
      visual: {
        cursor: false,
        targetHighlight: true,
        clickFeedback: true,
      },
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
    const actorble = createActorble({ visual: { targetHighlight: true } })

    await expect(actorble.click(css('#blocked-action'))).rejects.toMatchObject({
      code: 'INTERACTABILITY_FAILED',
    })

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay?.querySelector('[data-actorble-visual-highlight]')).toBeNull()
  })

  it('runs a public API visual flow without letting the overlay block target hit-testing', async () => {
    const input = createTypeableInput('project-name')
    const { button, seen } = createClickableButton('create-project')
    const actorble = createActorble({ visual: { preset: 'debug' } })

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
