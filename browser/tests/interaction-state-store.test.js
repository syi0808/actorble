import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BrowserInteractionStateStore } from '../src/interaction-state-store/index.js'

function targetHandle(id) {
  const element = document.createElement('button')
  element.id = id
  document.body.append(element)

  return {
    id,
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: { description: `button#${id}` },
  }
}

function effect(kind, target, active) {
  return { kind, target, active }
}

describe('BrowserInteractionStateStore', () => {
  it('starts with a deterministic immutable state snapshot', () => {
    const store = new BrowserInteractionStateStore()
    const snapshot = store.snapshot()

    expect(snapshot).toEqual({
      hovered: [],
      active: null,
      focused: null,
      focusVisible: false,
      typing: null,
      dragging: {
        source: null,
        target: null,
      },
    })

    snapshot.hovered.push(targetHandle('mutated'))
    snapshot.dragging.source = targetHandle('drag-source')

    expect(store.snapshot()).toEqual({
      hovered: [],
      active: null,
      focused: null,
      focusVisible: false,
      typing: null,
      dragging: {
        source: null,
        target: null,
      },
    })
  })

  it('turns pointer hover context into state diff and effects', () => {
    const store = new BrowserInteractionStateStore()
    const parent = targetHandle('parent')
    const child = targetHandle('child')
    const next = targetHandle('next')

    expect(
      store.dispatch({
        type: 'pointer:moved',
        point: { x: 10, y: 20 },
        previousPoint: null,
        hoverChain: [child, parent],
      }),
    ).toMatchObject({
      previous: { hovered: [] },
      next: { hovered: [child, parent] },
      effects: [effect('hover', child, true), effect('hover', parent, true)],
    })

    expect(
      store.dispatch({
        type: 'pointer:moved',
        point: { x: 30, y: 40 },
        previousPoint: { x: 10, y: 20 },
        hitTarget: next,
      }),
    ).toMatchObject({
      previous: { hovered: [child, parent] },
      next: { hovered: [next] },
      effects: [
        effect('hover', child, false),
        effect('hover', parent, false),
        effect('hover', next, true),
      ],
    })
  })

  it('keeps active state separate from pointer buttons and clears it on release or cancellation', () => {
    const store = new BrowserInteractionStateStore()
    const button = targetHandle('button')
    const listener = vi.fn()

    store.subscribe(listener)

    store.dispatch({
      type: 'pointer:moved',
      point: { x: 1, y: 2 },
      previousPoint: null,
      hitTarget: button,
    })

    const down = store.applyPointerSignal({
      type: 'pointer:down',
      point: { x: 1, y: 2 },
      button: 'primary',
    })

    expect(down.next.active).toBe(button)
    expect(down.effects).toEqual([effect('active', button, true)])

    const up = store.dispatch({
      type: 'pointer:up',
      point: { x: 1, y: 2 },
      button: 'primary',
    })

    expect(up.next.active).toBeNull()
    expect(up.effects).toEqual([effect('active', button, false)])

    store.dispatch({
      type: 'pointer:down',
      point: { x: 1, y: 2 },
      button: 'primary',
      hitTarget: button,
    })

    const cancelled = store.dispatch({ type: 'pointer:cancelled' })

    expect(cancelled.next.active).toBeNull()
    expect(cancelled.effects).toEqual([effect('active', button, false)])
    expect(listener).toHaveBeenCalledTimes(5)
  })

  it('updates focus and focus-visible with separate effects', () => {
    const store = new BrowserInteractionStateStore()
    const input = targetHandle('input')
    const button = targetHandle('button')

    expect(store.setFocused(input, true)).toMatchObject({
      previous: { focused: null, focusVisible: false },
      next: { focused: input, focusVisible: true },
      effects: [effect('focus', input, true), effect('focus-visible', input, true)],
    })

    expect(store.setFocused(button, false)).toMatchObject({
      previous: { focused: input, focusVisible: true },
      next: { focused: button, focusVisible: false },
      effects: [
        effect('focus', input, false),
        effect('focus-visible', input, false),
        effect('focus', button, true),
      ],
    })
  })

  it('updates typing state independently from focus', () => {
    const store = new BrowserInteractionStateStore()
    const input = targetHandle('input')

    store.setFocused(input, true)

    expect(store.dispatch({ type: 'typing:started', target: input })).toMatchObject({
      previous: { focused: input, typing: null },
      next: { focused: input, typing: input },
      effects: [effect('typing', input, true)],
    })

    expect(store.dispatch({ type: 'typing:ended' })).toMatchObject({
      previous: { focused: input, typing: input },
      next: { focused: input, typing: null },
      effects: [effect('typing', input, false)],
    })
  })

  it('tracks dragging source and drop target through effect descriptors', () => {
    const store = new BrowserInteractionStateStore()
    const source = targetHandle('source')
    const firstDropTarget = targetHandle('first-drop-target')
    const nextDropTarget = targetHandle('next-drop-target')

    expect(store.dispatch({ type: 'dragging:started', source })).toMatchObject({
      next: { dragging: { source, target: null } },
      effects: [effect('dragging', source, true)],
    })

    expect(store.dispatch({ type: 'dragging:moved', target: firstDropTarget })).toMatchObject({
      previous: { dragging: { source, target: null } },
      next: { dragging: { source, target: firstDropTarget } },
      effects: [effect('dragging', firstDropTarget, true)],
    })

    expect(store.dispatch({ type: 'dragging:moved', target: nextDropTarget })).toMatchObject({
      previous: { dragging: { source, target: firstDropTarget } },
      next: { dragging: { source, target: nextDropTarget } },
      effects: [
        effect('dragging', firstDropTarget, false),
        effect('dragging', nextDropTarget, true),
      ],
    })

    expect(store.dispatch({ type: 'dragging:ended' })).toMatchObject({
      previous: { dragging: { source, target: nextDropTarget } },
      next: { dragging: { source: null, target: null } },
      effects: [
        effect('dragging', source, false),
        effect('dragging', nextDropTarget, false),
      ],
    })
  })

  it('notifies subscribers with immutable diffs until disposed', () => {
    const store = new BrowserInteractionStateStore()
    const target = targetHandle('target')
    const listener = vi.fn()
    const subscription = store.subscribe(listener)

    const diff = store.setTyping(target)

    expect(listener).toHaveBeenCalledWith(diff)

    diff.next.hovered.push(target)
    expect(store.snapshot().hovered).toEqual([])

    subscription.dispose()
    store.setTyping(null)

    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('interaction state store boundary', () => {
  it('does not import platform adapter or visual layer concrete modules', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/interaction-state-store/index.ts'),
      'utf8',
    )

    expect(source).not.toMatch(/from\s+['"]\.\.\/platform-adapter/)
    expect(source).not.toMatch(/from\s+['"]\.\.\/visual-layer/)
  })
})
