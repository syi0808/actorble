import { describe, expect, it, vi } from 'vitest'
import {
  createContentInspectorHost,
  type ContentInspectorAdapter,
  type ContentInspectorPointerEvent,
} from '../src/entrypoints/content/inspector-host.js'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
  type InspectorTargetMetadata,
} from '../src/messaging/index.js'

describe('content inspector host', () => {
  it('highlights hovered elements and returns a start receipt', async () => {
    const adapter = createFakeAdapter()
    const host = createContentInspectorHost({
      adapter,
      sendMessage: async () => {},
    })

    const result = await host.handleMessage(startMessage())
    adapter.dispatchPointerMove(12, 18)

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'inspector:start',
        tabId: 7,
        frameId: 0,
        sessionId: 'inspect-1',
        status: 'inspecting',
      },
    })
    expect(adapter.highlight).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 100,
      height: 32,
    })
  })

  it('selects a target on captured click and guarantees overlay cleanup', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const adapter = createFakeAdapter()
    const host = createContentInspectorHost({
      adapter,
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(startMessage())
    const clickEvent = adapter.dispatchClick(12, 18)

    expect(clickEvent.preventDefault).toHaveBeenCalledOnce()
    expect(clickEvent.stopPropagation).toHaveBeenCalledOnce()
    expect(adapter.clearHighlight).toHaveBeenCalledOnce()
    expect(adapter.removedListeners).toHaveLength(4)
    expect(sent).toEqual([
      createExtensionMessage({
        kind: 'inspector:selected',
        payload: {
          tabId: 7,
          frameId: 0,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
          target: targetMetadata,
        },
      }),
    ])
  })

  it('cancels on Escape, stop, and page navigation with cleanup', async () => {
    const sent: ActorbleExtensionMessage[] = []
    const adapter = createFakeAdapter()
    const host = createContentInspectorHost({
      adapter,
      sendMessage: async (message) => {
        sent.push(message)
      },
    })

    await host.handleMessage(startMessage())
    const keyEvent = adapter.dispatchKeydown('Escape')
    await Promise.resolve()

    expect(keyEvent.preventDefault).toHaveBeenCalledOnce()
    expect(adapter.clearHighlight).toHaveBeenCalledOnce()
    expect(sent.at(-1)).toMatchObject({
      kind: 'inspector:cancelled',
      payload: {
        sessionId: 'inspect-1',
        reason: 'user',
      },
    })

    const stopAdapter = createFakeAdapter()
    const stopSent: ActorbleExtensionMessage[] = []
    const stopHost = createContentInspectorHost({
      adapter: stopAdapter,
      sendMessage: async (message) => {
        stopSent.push(message)
      },
    })
    await stopHost.handleMessage(startMessage())
    const stopResult = await stopHost.handleMessage(stopMessage())

    expect(stopResult).toMatchObject({
      ok: true,
      value: {
        kind: 'inspector:stop',
        status: 'stopped',
      },
    })
    expect(stopAdapter.clearHighlight).toHaveBeenCalledOnce()
    expect(stopSent.at(-1)).toMatchObject({
      kind: 'inspector:cancelled',
      payload: {
        sessionId: 'inspect-1',
        reason: 'stopped',
      },
    })

    const navigationAdapter = createFakeAdapter()
    const navigationSent: ActorbleExtensionMessage[] = []
    const navigationHost = createContentInspectorHost({
      adapter: navigationAdapter,
      sendMessage: async (message) => {
        navigationSent.push(message)
      },
    })
    await navigationHost.handleMessage(startMessage())
    navigationAdapter.dispatchPagehide()
    await Promise.resolve()

    expect(navigationAdapter.clearHighlight).toHaveBeenCalledOnce()
    expect(navigationSent.at(-1)).toMatchObject({
      kind: 'inspector:cancelled',
      payload: {
        sessionId: 'inspect-1',
        reason: 'navigation',
      },
    })
  })
})

type FakeElement = Readonly<{ key: string }>

const targetMetadata = {
  tagName: 'button',
  id: 'submit',
  classes: ['primary'],
  role: 'button',
  ariaLabel: 'Sign in',
  text: 'Sign in',
  frameUrl: 'http://localhost:3000/login',
  rect: {
    x: 10,
    y: 20,
    width: 100,
    height: 32,
  },
} satisfies InspectorTargetMetadata

function createFakeAdapter() {
  const removedListeners: string[] = []
  const element = { key: 'submit' } satisfies FakeElement
  let pointerMove: ((event: ContentInspectorPointerEvent) => void) | undefined
  let click: ((event: ContentInspectorPointerEvent) => void) | undefined
  let keydown: ((event: KeyboardEventLike) => void) | undefined
  let pagehide: (() => void) | undefined

  const adapter = {
    removedListeners,
    highlight: vi.fn(),
    clearHighlight: vi.fn(),
    onPointerMove(listener) {
      pointerMove = listener
      return () => {
        removedListeners.push('pointermove')
      }
    },
    onClick(listener) {
      click = listener
      return () => {
        removedListeners.push('click')
      }
    },
    onKeydown(listener) {
      keydown = listener
      return () => {
        removedListeners.push('keydown')
      }
    },
    onPagehide(listener) {
      pagehide = listener
      return () => {
        removedListeners.push('pagehide')
      }
    },
    elementFromPoint() {
      return element
    },
    describeElement() {
      return targetMetadata
    },
    dispatchPointerMove(clientX: number, clientY: number) {
      pointerMove?.(pointerEvent(clientX, clientY))
    },
    dispatchClick(clientX: number, clientY: number) {
      const event = pointerEvent(clientX, clientY)
      click?.(event)
      return event
    },
    dispatchKeydown(key: string) {
      const event = {
        key,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } satisfies KeyboardEventLike
      keydown?.(event)
      return event
    },
    dispatchPagehide() {
      pagehide?.()
    },
  } satisfies ContentInspectorAdapter<FakeElement> & {
    removedListeners: string[]
    dispatchPointerMove(clientX: number, clientY: number): void
    dispatchClick(clientX: number, clientY: number): ContentInspectorPointerEvent
    dispatchKeydown(key: string): KeyboardEventLike
    dispatchPagehide(): void
  }

  return adapter
}

type KeyboardEventLike = Readonly<{
  key: string
  preventDefault(): void
  stopPropagation(): void
}>

function pointerEvent(clientX: number, clientY: number): ContentInspectorPointerEvent {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

function startMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'inspector:start',
    payload: {
      tabId: 7,
      frameId: 0,
      sessionId: 'inspect-1',
      scenarioId: 'scenario-1',
    },
  })
}

function stopMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'inspector:stop',
    payload: {
      tabId: 7,
      frameId: 0,
      sessionId: 'inspect-1',
      scenarioId: 'scenario-1',
    },
  })
}
