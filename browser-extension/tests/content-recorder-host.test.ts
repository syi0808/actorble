import { describe, expect, it } from 'vitest'
import { createContentRecorderHost } from '../src/entrypoints/content/recorder-host.js'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
} from '../src/messaging/index.js'
import {
  createRecorderEventCapturePort,
  type RecorderClickEvent,
  type RecorderEventCaptureAdapter,
} from '../src/recorder/event-capture.js'

describe('content recorder host', () => {
  it('starts and stops a correlated recorder session with captured events', async () => {
    const adapter = createFakeAdapter()
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter, { now: () => 5000 }),
      now: () => 1000,
    })

    const start = await host.handleMessage(startMessage())
    adapter.dispatchClick()
    const stop = await host.handleMessage(stopMessage())

    expect(start).toMatchObject({
      ok: true,
      value: {
        kind: 'record:start',
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'record-1',
        sessionId: 'record-1',
        status: 'recording',
      },
    })
    expect(stop).toMatchObject({
      ok: true,
      value: {
        kind: 'record:stop',
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'record-1',
        sessionId: 'record-1',
        status: 'stopped',
        events: [
          {
            kind: 'click',
            timestamp: 5000,
            target: {
              tagName: 'button',
              id: 'submit',
            },
          },
        ],
      },
    })
  })

  it('rejects overlapping recorder sessions and mismatched stops', async () => {
    const adapter = createFakeAdapter()
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter),
    })

    await host.handleMessage(startMessage())
    const overlapping = await host.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: 7,
          frameId: 0,
          runId: 'record-2',
        },
      }),
    )
    const mismatch = await host.handleMessage(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: 7,
          frameId: 0,
          runId: 'record-2',
        },
      }),
    )

    expect(overlapping).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'A recorder session is already active.',
        },
      ],
    })
    expect(mismatch).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'The stop message does not match the active recorder session.',
        },
      ],
    })
  })

  it('rejects unsupported messages at the recorder boundary', async () => {
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(createFakeAdapter()),
    })

    const result = await host.handleMessage({
      kind: 'scenario:validate',
      payload: {
        document: {},
      },
    } satisfies ActorbleExtensionMessage)

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_message',
          message: 'scenario:validate is not handled by the content recorder host.',
        },
      ],
    })
  })
})

type FakeElement = Readonly<{ key: string }>

function createFakeAdapter() {
  const target = { key: 'button' } satisfies FakeElement
  let click: ((event: RecorderClickEvent<FakeElement>) => void) | undefined

  const adapter = {
    onClick(listener) {
      click = listener
      return () => {}
    },
    onInput() {
      return () => {}
    },
    onChange() {
      return () => {}
    },
    onPagehide() {
      return () => {}
    },
    describeElement() {
      return {
        tagName: 'button',
        id: 'submit',
        role: 'button',
        text: 'Sign in',
        rect: { x: 10, y: 20, width: 100, height: 32 },
        frameUrl: 'http://localhost:3000/login',
      }
    },
    readElementValue() {
      return ''
    },
    sensitiveInputReason() {
      return null
    },
    dispatchClick() {
      click?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        target,
      })
    },
  } satisfies RecorderEventCaptureAdapter<FakeElement> & {
    dispatchClick(): void
  }

  return adapter
}

function startMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'record:start',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  })
}

function stopMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'record:stop',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  })
}
