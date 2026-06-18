import { describe, expect, it } from 'vitest'
import {
  RECORDER_MASKED_VALUE,
  createRecorderEventCapturePort,
  detectSensitiveInputReason,
  type RecorderClickEvent,
  type RecorderEventCaptureAdapter,
  type RecorderEventFlush,
  type RecorderSession,
  type RecorderTextEvent,
} from '../src/recorder/event-capture.js'

describe('recorder event capture', () => {
  it('flushes click events with locator-useful target context and cleans listeners on stop', async () => {
    const adapter = createFakeAdapter()
    const flushes: RecorderEventFlush[] = []
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(1000),
      flushEvents(flush) {
        flushes.push(flush)
      },
    })

    const start = capture.start(session())
    adapter.dispatchClick(targets.button, {
      clientX: 12,
      clientY: 18,
      pageX: 112,
      pageY: 218,
      button: 0,
    })
    const stop = await capture.stop('record-1')

    expect(start).toMatchObject({
      ok: true,
      value: {
        sessionId: 'record-1',
        tabId: 7,
        frameId: 0,
      },
    })
    expect(stop).toEqual({
      ok: true,
      value: undefined,
    })
    expect(flushes).toMatchObject([
      {
        tabId: 7,
        frameId: 0,
        sessionId: 'record-1',
        reason: 'incremental',
        events: [
          {
            kind: 'click',
            timestamp: 1000,
            clientX: 12,
            clientY: 18,
            pageX: 112,
            pageY: 218,
            button: 0,
            target: {
              tagName: 'button',
              id: 'submit',
              role: 'button',
              text: 'Sign in',
            },
          },
        ],
      },
    ])
    expect(adapter.removedListeners).toEqual(['click', 'input', 'change', 'pagehide'])
  })

  it('captures text input and masks sensitive values before flushing raw events', async () => {
    const adapter = createFakeAdapter()
    const flushes: RecorderEventFlush[] = []
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(2000),
      flushEvents(flush) {
        flushes.push(flush)
      },
    })

    capture.start(session())
    adapter.dispatchInput(targets.password)
    const stop = await capture.stop('record-1')

    expect(stop).toMatchObject({ ok: true })
    expect(flushes).toMatchObject([
      {
        reason: 'incremental',
        events: [
          {
            kind: 'text',
            timestamp: 2000,
            source: 'input',
            value: RECORDER_MASKED_VALUE,
            sensitive: true,
            sensitiveReason: 'password_type',
            target: {
              tagName: 'input',
              id: 'password',
              inputType: 'password',
              name: 'password',
            },
          },
        ],
      },
    ])
    expect(JSON.stringify(flushes)).not.toContain('correct horse battery staple')
  })

  it('flushes pending events on page navigation and ignores later events', async () => {
    const adapter = createFakeAdapter()
    const flushes: RecorderEventFlush[] = []
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(3000),
      autoFlush: false,
      flushEvents(flush) {
        flushes.push(flush)
      },
    })

    capture.start(session())
    adapter.dispatchClick(targets.button)
    adapter.dispatchPagehide()
    adapter.dispatchClick(targets.button)
    const stop = await capture.stop('record-1')

    expect(adapter.removedListeners).toEqual(['click', 'input', 'change', 'pagehide'])
    expect(stop).toEqual({
      ok: true,
      value: undefined,
    })
    expect(flushes).toMatchObject([
      {
        reason: 'pagehide',
        events: [
          {
            kind: 'click',
            timestamp: 3000,
          },
        ],
      },
    ])
  })

  it('reports flush failures on stop', async () => {
    const adapter = createFakeAdapter()
    const capture = createRecorderEventCapturePort(adapter, {
      flushEvents() {
        throw new Error('background unavailable')
      },
    })

    capture.start(session())
    adapter.dispatchClick(targets.button)
    const stop = await capture.stop('record-1')

    expect(stop).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'Recorder events could not be flushed.',
        },
      ],
    })
  })

  it('marks secret-like fields as sensitive even when the input type is not password', () => {
    expect(
      detectSensitiveInputReason({
        inputType: 'text',
        name: 'api_token',
      }),
    ).toBe('secret_like_field')

    expect(
      detectSensitiveInputReason({
        inputType: 'password',
        name: 'login',
      }),
    ).toBe('password_type')
  })

  it('rejects overlapping sessions and mismatched stops', async () => {
    const adapter = createFakeAdapter()
    const capture = createRecorderEventCapturePort(adapter)

    expect(capture.start(session())).toMatchObject({ ok: true })
    expect(capture.start({ ...session(), sessionId: 'record-2' })).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'A recorder session is already active.',
        },
      ],
    })
    await expect(capture.stop('record-2')).resolves.toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'The stop message does not match the active recorder session.',
        },
      ],
    })
  })
})

type FakeElement = Readonly<{
  key: string
  value?: string
  sensitiveReason?: 'password_type' | 'secret_like_field'
}>

const targets = {
  button: {
    key: 'button',
  },
  password: {
    key: 'password',
    value: 'correct horse battery staple',
    sensitiveReason: 'password_type',
  },
} satisfies Record<string, FakeElement>

function createFakeAdapter() {
  const removedListeners: string[] = []
  let click: ((event: RecorderClickEvent<FakeElement>) => void) | undefined
  let input: ((event: RecorderTextEvent<FakeElement>) => void) | undefined
  let change: ((event: RecorderTextEvent<FakeElement>) => void) | undefined
  let pagehide: (() => void) | undefined

  const adapter = {
    removedListeners,
    onClick(listener) {
      click = listener
      return () => {
        removedListeners.push('click')
      }
    },
    onInput(listener) {
      input = listener
      return () => {
        removedListeners.push('input')
      }
    },
    onChange(listener) {
      change = listener
      return () => {
        removedListeners.push('change')
      }
    },
    onPagehide(listener) {
      pagehide = listener
      return () => {
        removedListeners.push('pagehide')
      }
    },
    describeElement(element) {
      if (element.key === 'password') {
        return {
          tagName: 'input',
          id: 'password',
          name: 'password',
          inputType: 'password',
          rect: { x: 10, y: 20, width: 200, height: 32 },
          frameUrl: 'http://localhost:3000/login',
        }
      }

      return {
        tagName: 'button',
        id: 'submit',
        role: 'button',
        text: 'Sign in',
        rect: { x: 10, y: 20, width: 100, height: 32 },
        frameUrl: 'http://localhost:3000/login',
      }
    },
    readElementValue(element) {
      return element.value ?? ''
    },
    sensitiveInputReason(element) {
      return element.sensitiveReason ?? null
    },
    dispatchClick(target, event = {}) {
      click?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        target,
        ...event,
      })
    },
    dispatchInput(target) {
      input?.({ target })
    },
    dispatchChange(target) {
      change?.({ target })
    },
    dispatchPagehide() {
      pagehide?.()
    },
  } satisfies RecorderEventCaptureAdapter<FakeElement> & {
    removedListeners: string[]
    dispatchClick(
      target: FakeElement,
      event?: Partial<RecorderClickEvent<FakeElement>>,
    ): void
    dispatchInput(target: FakeElement): void
    dispatchChange(target: FakeElement): void
    dispatchPagehide(): void
  }
  return adapter
}

function session(): RecorderSession {
  return {
    tabId: 7,
    frameId: 0,
    sessionId: 'record-1',
    startedAt: 100,
    sensitiveInputPolicy: 'mask',
  }
}

function createClock(start: number): () => number {
  let now = start
  return () => now++
}
