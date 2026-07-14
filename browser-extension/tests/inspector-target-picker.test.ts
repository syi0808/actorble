import { describe, expect, it } from 'vitest'
import {
  createTargetPicker,
  createTargetPickerView,
  type TargetPickerClient,
} from '../src/inspector/target-picker.js'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
} from '../src/messaging/index.js'
import { failure, ok, type ExtensionResult } from '../src/shared/result.js'

describe('inspector target picker', () => {
  it('starts inspection for the active tab with a correlation-friendly message', async () => {
    const { picker, sent } = createTestPicker()

    const result = await picker.start('scenario-1')

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        sessionId: 'inspect-1',
        scenarioId: 'scenario-1',
        startedAt: 1_800_000_000_000,
      },
    })
    expect(sent).toEqual([
      createExtensionMessage({
      kind: 'inspector:start',
      payload: {
        tabId: 7,
        sessionId: 'inspect-1',
        scenarioId: 'scenario-1',
      },
      }),
    ])
    expect(createTargetPickerView(picker.getSnapshot())).toMatchObject({
      statusSummary: 'Inspecting inspect-1',
      buttons: {
        start: { disabled: true, pending: false },
        stop: { disabled: false, pending: false },
      },
    })
  })

  it('starts inspection with the selected builder target slot correlation', async () => {
    const { picker, sent } = createTestPicker()

    const result = await picker.start({
      scenarioId: 'scenario-1',
      targetSlot: {
        kind: 'drag-to',
        stepId: 'drag-step',
      },
    })

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        sessionId: 'inspect-1',
        scenarioId: 'scenario-1',
        targetSlot: {
          kind: 'drag-to',
          stepId: 'drag-step',
        },
      },
    })
    expect(sent).toEqual([
      createExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
          targetSlot: {
            kind: 'drag-to',
            stepId: 'drag-step',
          },
        },
      }),
    ])
  })

  it('stops the active inspection session and clears the active state', async () => {
    const { picker, sent } = createTestPicker()
    await picker.start('scenario-1')

    const result = await picker.stop()

    expect(result).toMatchObject({
      ok: true,
      value: {
        sessionId: 'inspect-1',
      },
    })
    expect(sent.at(-1)).toEqual(
      createExtensionMessage({
        kind: 'inspector:stop',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
        },
      }),
    )
    expect(picker.getSnapshot()).toMatchObject({
      status: 'cancelled',
      session: undefined,
      message: 'Inspection stopped.',
    })
  })

  it('records selected targets and ignores stale selected messages', async () => {
    const { picker } = createTestPicker()
    await picker.start('scenario-1')

    const stale = picker.ingestMessage(
      selectedMessage({
        sessionId: 'stale-inspection',
      }),
    )
    const accepted = picker.ingestMessage(selectedMessage({
      targetSlot: {
        kind: 'step-target',
        stepId: 'submit',
      },
    }))

    expect(stale).toBe(false)
    expect(accepted).toBe(true)
    expect(picker.getSnapshot()).toMatchObject({
      status: 'selected',
      session: undefined,
      selected: {
        sessionId: 'inspect-1',
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
        target: {
          tagName: 'button',
          id: 'submit',
          text: 'Sign in',
        },
      },
    })
    expect(createTargetPickerView(picker.getSnapshot()).selectedSummary).toBe(
      'button#submit "Sign in"',
    )
  })

  it('handles cancellation and content delivery failures', async () => {
    const { picker } = createTestPicker({
      sendResponse: failure({
        code: 'content_not_ready',
        message: 'Content script is not ready for tab 7.',
      }),
    })

    const failedStart = await picker.start('scenario-1')

    expect(failedStart).toMatchObject({
      ok: false,
      issues: [{ code: 'content_not_ready' }],
    })
    expect(picker.getSnapshot()).toMatchObject({
      status: 'failed',
      issues: [{ code: 'content_not_ready' }],
    })

    const { picker: cancellable } = createTestPicker()
    await cancellable.start('scenario-1')
    const accepted = cancellable.ingestMessage(
      createExtensionMessage({
        kind: 'inspector:cancelled',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
          reason: 'navigation',
          message: 'Page navigation ended inspection.',
        },
      }),
    )

    expect(accepted).toBe(true)
    expect(cancellable.getSnapshot()).toMatchObject({
      status: 'cancelled',
      session: undefined,
      message: 'Page navigation ended inspection.',
    })
  })

  it('matches selected targets against frame correlation returned by background', async () => {
    const { picker, sent } = createTestPicker({
      sendResponse: ok({
        kind: 'inspector:start',
        tabId: 7,
        frameId: 0,
        sessionId: 'inspect-1',
        scenarioId: 'scenario-1',
        contentReady: true,
      }),
    })

    const started = await picker.start('scenario-1')
    const accepted = picker.ingestMessage(selectedMessage({ frameId: 0 }))

    expect(sent[0]).toEqual(
      createExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
        },
      }),
    )
    expect(started).toMatchObject({
      ok: true,
      value: {
        frameId: 0,
      },
    })
    expect(accepted).toBe(true)
  })
})

type TestPickerOptions = Readonly<{
  sendResponse?: ExtensionResult<unknown>
}>

function createTestPicker(options: TestPickerOptions = {}) {
  const sent: ActorbleExtensionMessage[] = []
  const client: TargetPickerClient = {
    async getActiveTab() {
      return { id: 7, url: 'http://localhost:3000/login' }
    },
    async sendMessage(message) {
      sent.push(message)
      return options.sendResponse ?? ok({ contentReady: true })
    },
  }
  const picker = createTargetPicker(client, {
    createSessionId: () => 'inspect-1',
    now: () => 1_800_000_000_000,
  })

  return { picker, sent }
}

function selectedMessage(
  overrides: Partial<{
    sessionId: string
    frameId: number
    targetSlot: Readonly<{
      kind: 'step-target' | 'drag-from' | 'drag-to' | 'waitFor-target' | 'reveal-target'
      stepId: string
    }>
  }> = {},
): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'inspector:selected',
    payload: {
      tabId: 7,
      ...(overrides.frameId === undefined ? {} : { frameId: overrides.frameId }),
      sessionId: overrides.sessionId ?? 'inspect-1',
      scenarioId: 'scenario-1',
      ...(overrides.targetSlot === undefined ? {} : { targetSlot: overrides.targetSlot }),
      target: {
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
      },
    },
  })
}
