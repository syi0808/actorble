import { describe, expect, it, vi } from 'vitest'
import {
  createContentInspectorHost,
  describeDomInspectorElement,
  type ContentInspectorAdapter,
  type ContentInspectorPointerEvent,
} from '../src/entrypoints/content/inspector-host.js'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
  type InspectorTargetMetadata,
} from '../src/messaging/index.js'

describe('content inspector host', () => {
  it('describes selected elements with a document-order index', () => {
    const dom = createFakeDocumentOrder([
      { tagName: 'main', id: '', textContent: 'First Second' },
      { tagName: 'button', id: 'first', textContent: 'First' },
      { tagName: 'button', id: 'second', textContent: 'Second' },
    ])
    const second = dom.elements[2]

    const metadata = describeDomInspectorElement(
      second as unknown as Element,
      fakeWindow() as unknown as Window,
    )

    expect(metadata.documentOrderIndex).toBe(2)
  })

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
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
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
          targetSlot: {
            kind: 'step-target',
            stepId: 'submit',
          },
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
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
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
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
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
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
      },
    })
  })
})

type FakeElement = Readonly<{ key: string }>

type FakeDomElement = Readonly<{
  tagName: string
  id: string
  classList: readonly string[]
  textContent: string
  ownerDocument: Readonly<{
    querySelectorAll(selector: string): readonly FakeDomElement[]
  }>
  getBoundingClientRect(): Readonly<{
    x: number
    y: number
    width: number
    height: number
  }>
  getAttribute(name: string): string | null
}>

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

function createFakeDocumentOrder(
  inputs: readonly Readonly<{ tagName: string; id: string; textContent: string }>[],
): Readonly<{ elements: readonly FakeDomElement[] }> {
  const elements: FakeDomElement[] = []
  const ownerDocument = {
    querySelectorAll() {
      return elements
    },
  }

  for (const input of inputs) {
    elements.push({
      tagName: input.tagName.toUpperCase(),
      id: input.id,
      classList: [],
      textContent: input.textContent,
      ownerDocument,
      getBoundingClientRect() {
        return {
          x: 0,
          y: 0,
          width: 100,
          height: 24,
        }
      },
      getAttribute() {
        return null
      },
    })
  }

  return { elements }
}

function fakeWindow(): Readonly<{ location: Readonly<{ href: string }> }> {
  return {
    location: {
      href: 'http://localhost.test/page',
    },
  }
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
      targetSlot: {
        kind: 'step-target',
        stepId: 'submit',
      },
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
      targetSlot: {
        kind: 'step-target',
        stepId: 'submit',
      },
    },
  })
}
