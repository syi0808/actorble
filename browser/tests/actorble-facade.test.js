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

  it('can opt into the default visual layer without changing click behavior', async () => {
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
    expect(overlay.querySelector('[data-actorble-visual-highlight]')).not.toBeNull()
    expect(overlay.querySelector('[data-actorble-visual-click]')).not.toBeNull()
  })
})
