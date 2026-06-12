import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Actorble, createActorble } from '../src/actorble-facade/index.js'
import { BrowserDiagnosticsTrace } from '../src/diagnostics-trace/index.js'
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
    moveTo: vi.fn(),
    click: vi.fn(async () => {}),
    clickCurrent: vi.fn(),
    doubleClick: vi.fn(),
    focus: vi.fn(),
    type: vi.fn(),
    typeInto: vi.fn(async () => {}),
    fill: vi.fn(),
    press: vi.fn(),
    scrollTo: vi.fn(),
    drag: vi.fn(),
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

  it('delegates initial public entrypoints to injected modules', async () => {
    const { condition, orchestrator, resolver, runner, target, trace } = createDependencies()
    const actorble = new Actorble({ orchestrator, resolver, runner, trace })
    const locator = css('#target-1')
    const scenario = { steps: [{ action: 'click', target: locator }] }

    await expect(actorble.resolve(locator, { strict: true })).resolves.toBe(target)
    await expect(actorble.click(locator, { timeout: 10 })).resolves.toBeUndefined()
    await expect(actorble.typeInto(locator, 'hello')).resolves.toBeUndefined()
    await expect(actorble.waitFor(condition, { timeout: 20 })).resolves.toBeUndefined()
    await expect(actorble.run(scenario, { timeout: 30 })).resolves.toBeUndefined()
    actorble.pause()
    actorble.resume()
    actorble.stop()

    expect(resolver.resolve).toHaveBeenCalledWith(locator, { strict: true })
    expect(orchestrator.click).toHaveBeenCalledWith(locator, { timeout: 10 })
    expect(orchestrator.typeInto).toHaveBeenCalledWith(locator, 'hello', undefined)
    expect(orchestrator.waitFor).toHaveBeenCalledWith(condition, { timeout: 20 })
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

  it('passes text visibility into opt-in keystroke feedback without forcing focus feedback', async () => {
    createTypeableInput('secret')
    const actorble = createActorble({
      visual: { focusOverlay: true, keystrokeOverlay: true, textVisibility: 'masked' },
    })

    await expect(actorble.typeInto(css('#secret'), 's')).resolves.toBeUndefined()

    const overlay = document.body.querySelector('[data-actorble-overlay-root]')
    expect(overlay).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-focus]')).toBeNull()
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
