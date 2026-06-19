import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  createBackgroundOrchestrator,
  createWxtBackgroundBrowserHost,
} from '../src/entrypoints/background/orchestration.js'
import { createLocatorCandidates } from '../src/inspector/locator-preview.js'
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js'
import type { RawRecordedEvent, RawRecordedTextEvent } from '../src/recorder/event-capture.js'

const compilation = {
  scenario: {
    id: 'scenario-1',
    steps: [],
  },
} as const

let now = 1_700_000_000_000

beforeEach(() => {
  vi.restoreAllMocks()
  fakeBrowser.reset()
  now = 1_700_000_000_000
})

describe('background orchestration', () => {
  it('resolves the active tab as a routable target', async () => {
    const activeTab = await createActiveTab('http://localhost:3000/login')
    mockReadyContentScript()
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.resolveActiveTarget()

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: activeTab.id,
        frameId: 0,
        url: 'http://localhost:3000/login',
      },
    })
  })

  it('correlates emitted content readiness by sender tab and frame metadata', async () => {
    const activeTab = await createActiveTab('http://localhost:3000/login')
    const sendMessage = mockReadyContentScript()
    const orchestrator = createTestOrchestrator()

    const ready = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'content:ready',
        payload: {
          url: 'http://localhost:3000/login',
        },
      }),
      {
        tab: activeTab,
        frameId: 0,
        url: 'http://localhost:3000/login',
      },
    )
    const target = await orchestrator.resolveActiveTarget()

    expect(ready).toMatchObject({
      ok: true,
      value: {
        kind: 'content:ready',
        tabId: activeTab.id,
        frameId: 0,
        contentReady: true,
      },
    })
    expect(target).toMatchObject({
      ok: true,
      value: {
        tabId: activeTab.id,
        frameId: 0,
      },
    })
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('routes run messages to the target frame and tracks run metadata', async () => {
    const activeTab = await createActiveTab()
    const sendMessage = mockReadyContentScript()
    const orchestrator = createTestOrchestrator()
    const message = createRunMessage(activeTab.id, undefined)
    const routedMessage = createRunMessage(activeTab.id, 0)

    const result = await orchestrator.handleMessage(message)

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'scenario:run',
        tabId: activeTab.id,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'run-1',
        contentReady: true,
      },
    })
    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      activeTab.id,
      createExtensionMessage({
        kind: 'content:ready',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
        },
      }),
      { frameId: 0 },
    )
    expect(sendMessage).toHaveBeenNthCalledWith(2, activeTab.id, routedMessage, { frameId: 0 })
    expect(orchestrator.getRunSession('run-1')).toMatchObject({
      runId: 'run-1',
      scenarioId: 'scenario-1',
      tabId: activeTab.id,
      frameId: 0,
      status: 'running',
      startedAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    })
  })

  it('updates run sessions from runtime status messages', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript()
    const orchestrator = createTestOrchestrator()
    await orchestrator.handleMessage(createRunMessage(activeTab.id))
    now += 50

    const result = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'run-1',
          status: 'paused',
          message: 'Paused by user.',
        },
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'runtime:status',
        contentReady: true,
        session: {
          runId: 'run-1',
          status: 'paused',
          message: 'Paused by user.',
          updatedAt: 1_700_000_000_050,
        },
      },
    })
    expect(orchestrator.getRunSession('run-1')).toMatchObject({
      status: 'paused',
      message: 'Paused by user.',
      updatedAt: 1_700_000_000_050,
    })
  })

  it('tracks record session metadata by correlation id', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()
    const start = createExtensionMessage({
      kind: 'record:start',
      payload: {
        tabId: activeTab.id,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'record-1',
      },
    })

    const startResult = await orchestrator.handleMessage(start)
    const eventResult = await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [recordedTextEvent('user@example.com')]),
    )
    now += 25
    const stopResult = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
        },
      }),
    )

    expect(startResult).toMatchObject({
      ok: true,
      value: {
        kind: 'record:start',
        session: {
          runId: 'record-1',
          status: 'recording',
        },
      },
    })
    expect(eventResult).toMatchObject({
      ok: true,
      value: {
        kind: 'record:event',
        session: {
          runId: 'record-1',
          status: 'recording',
        },
      },
    })
    expect(stopResult).toMatchObject({
      ok: true,
      value: {
        kind: 'record:stop',
        session: {
          runId: 'record-1',
          status: 'stopped',
          updatedAt: 1_700_000_000_025,
        },
      },
    })
    expect(orchestrator.getRecordSession({ runId: 'record-1' })).toMatchObject({
      runId: 'record-1',
      status: 'stopped',
    })
  })

  it('normalizes stopped recorder events and returns a cached draft to the panel', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
        },
      }),
    )
    await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [recordedTextEvent('u', 1_700_000_000_010)]),
    )
    await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [
        recordedTextEvent('user@example.com', 1_700_000_000_020, 'change'),
      ]),
    )
    now += 25
    const stop = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
        },
      }),
    )
    const handoff = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:draft:get',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          runId: 'record-1',
        },
      }),
    )

    expect(stop).toMatchObject({
      ok: true,
      value: {
        kind: 'record:stop',
        recordedDraft: {
          draftId: 'record-1',
          sessionId: 'record-1',
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
          sourceEventCount: 2,
          createdAt: 1_700_000_000_025,
          document: {
            steps: [
              {
                id: 'recorded-step-1',
                action: 'fill',
                input: 'user@example.com',
              },
            ],
          },
        },
      },
    })
    expect(handoff).toMatchObject({
      ok: true,
      value: {
        draftId: 'record-1',
        sourceEventCount: 2,
        document: {
          steps: [
            {
              action: 'fill',
            },
          ],
        },
      },
    })
  })

  it('ingests pagehide record event flushes before normalizing on stop', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(recordStartMessage(activeTab.id))
    await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [recordedTextEvent('user@example.com')], {
        reason: 'pagehide',
      }),
    )
    const stop = await orchestrator.handleMessage(recordStopMessage(activeTab.id))

    expect(stop).toMatchObject({
      ok: true,
      value: {
        recordedDraft: {
          sourceEventCount: 1,
          document: {
            steps: [
              {
                action: 'fill',
                input: 'user@example.com',
              },
            ],
          },
        },
      },
    })
  })

  it('re-arms content recording after navigation readiness and continues buffering', async () => {
    const activeTab = await createActiveTab()
    const sendMessage = mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(recordStartMessage(activeTab.id))
    sendMessage.mockClear()
    const ready = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'content:ready',
        payload: {
          url: 'http://localhost:3000/next',
        },
      }),
      {
        tab: activeTab,
        frameId: 0,
        url: 'http://localhost:3000/next',
      },
    )
    await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [recordedTextEvent('after navigation')]),
    )
    const stop = await orchestrator.handleMessage(recordStopMessage(activeTab.id))

    expect(ready).toMatchObject({
      ok: true,
      value: {
        kind: 'content:ready',
        session: {
          type: 'record',
          runId: 'record-1',
          status: 'recording',
        },
      },
    })
    expect(sendMessage).toHaveBeenCalledWith(
      activeTab.id,
      recordStartMessage(activeTab.id),
      { frameId: 0 },
    )
    expect(stop).toMatchObject({
      ok: true,
      value: {
        recordedDraft: {
          sourceEventCount: 1,
        },
      },
    })
  })

  it('rejects recorder event flushes that do not match the active session', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(recordStartMessage(activeTab.id))
    const result = await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [recordedTextEvent('ignored')], {
        sessionId: 'other-recording',
      }),
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'Recorded events do not match an active recorder session.',
        },
      ],
    })
  })

  it('returns an explicit empty recording state instead of an invalid empty draft', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(recordStartMessage(activeTab.id))
    now += 25
    const stop = await orchestrator.handleMessage(recordStopMessage(activeTab.id))

    expect(stop).toMatchObject({
      ok: true,
      value: {
        kind: 'record:stop',
        emptyRecording: {
          sessionId: 'record-1',
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
          sourceEventCount: 0,
          createdAt: 1_700_000_000_025,
          message: 'No browser events were recorded.',
        },
      },
    })
    expect(stop.ok && stop.value).not.toHaveProperty('recordedDraft')
  })

  it('reports normalization failures from the background event buffer', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      if (extensionMessage.kind === 'record:stop') {
        return okContentRecordReceipt(extensionMessage, 'stopped')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(recordStartMessage(activeTab.id))
    await orchestrator.handleMessage(
      recordEventMessage(activeTab.id, [invalidLocatorEvent()]),
    )
    const stop = await orchestrator.handleMessage(recordStopMessage(activeTab.id))

    expect(stop).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          path: ['events', 0, 'target'],
        },
      ],
    })
    expect(orchestrator.getRecordSession({ runId: 'record-1' })).toMatchObject({
      status: 'failed',
      message: 'No locator candidates could be built for the recorded target.',
    })
  })

  it('rejects run, inspector, and recorder commands that would conflict on the same tab', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      return { received: true }
    })
    const runningOrchestrator = createTestOrchestrator()

    await runningOrchestrator.handleMessage(createRunMessage(activeTab.id))
    const recordWhileRunning = await runningOrchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
        },
      }),
    )

    const recordingOrchestrator = createTestOrchestrator()
    await recordingOrchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-2',
        },
      }),
    )
    const runWhileRecording = await recordingOrchestrator.handleMessage(createRunMessage(activeTab.id))
    const inspectorWhileRecording = await recordingOrchestrator.handleMessage(
      createExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          sessionId: 'inspect-1',
        },
      }),
    )

    expect(recordWhileRunning).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'Recording cannot start while a scenario run is active.',
        },
      ],
    })
    expect(runWhileRecording).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'runtime_error',
          message: 'Scenario run cannot start while recording is active.',
        },
      ],
    })
    expect(inspectorWhileRecording).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'inspector_error',
          message: 'Target inspection cannot start while recording is active.',
        },
      ],
    })
  })

  it('routes inspector sessions and ingests selected target metadata', async () => {
    const activeTab = await createActiveTab()
    const sendMessage = mockReadyContentScript()
    const orchestrator = createTestOrchestrator()
    const start = createExtensionMessage({
      kind: 'inspector:start',
      payload: {
        tabId: activeTab.id,
        frameId: 0,
        scenarioId: 'scenario-1',
        sessionId: 'inspect-1',
        targetSlot: {
          kind: 'step-target',
          stepId: 'submit',
        },
      },
    })

    const startResult = await orchestrator.handleMessage(start)
    now += 25
    const selectedResult = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'inspector:selected',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          sessionId: 'inspect-1',
          targetSlot: {
            kind: 'step-target',
            stepId: 'submit',
          },
          target: {
            tagName: 'button',
            id: 'submit',
            text: 'Sign in',
            frameUrl: 'http://localhost:3000/dashboard',
            rect: {
              x: 10,
              y: 20,
              width: 100,
              height: 32,
            },
          },
        },
      }),
    )

    expect(startResult).toMatchObject({
      ok: true,
      value: {
        kind: 'inspector:start',
        sessionId: 'inspect-1',
        session: {
          type: 'inspector',
          sessionId: 'inspect-1',
          status: 'inspecting',
          targetSlot: {
            kind: 'step-target',
            stepId: 'submit',
          },
        },
      },
    })
    expect(sendMessage).toHaveBeenCalledWith(activeTab.id, start, { frameId: 0 })
    expect(selectedResult).toMatchObject({
      ok: true,
      value: {
        kind: 'inspector:selected',
        sessionId: 'inspect-1',
        session: {
          type: 'inspector',
          sessionId: 'inspect-1',
          status: 'selected',
          targetSlot: {
            kind: 'step-target',
            stepId: 'submit',
          },
          selectedTarget: {
            tagName: 'button',
            id: 'submit',
          },
          updatedAt: 1_700_000_000_025,
        },
      },
    })
    expect(orchestrator.getInspectorSession('inspect-1')).toMatchObject({
      sessionId: 'inspect-1',
      status: 'selected',
      targetSlot: {
        kind: 'step-target',
        stepId: 'submit',
      },
      selectedTarget: {
        tagName: 'button',
        id: 'submit',
      },
    })
  })

  it('routes locator preview requests to content and returns the preview result', async () => {
    const activeTab = await createActiveTab()
    const target = {
      tagName: 'button',
      documentOrderIndex: 6,
      role: 'button',
      ariaLabel: 'Sign in',
      rect: {
        x: 10,
        y: 20,
        width: 100,
        height: 32,
      },
    } as const
    const candidates = createLocatorCandidates(target)
    const previewResult = {
      tabId: activeTab.id,
      frameId: 0,
      scenarioId: 'scenario-1',
      candidates: [
        {
          ...candidates[0],
          matchCount: 1,
          strict: true,
          status: 'unique',
        },
      ],
    } as const
    const sendMessage = mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'locator:preview') {
        return { ok: true, value: previewResult }
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()
    const message = createExtensionMessage({
      kind: 'locator:preview',
      payload: {
        tabId: activeTab.id,
        frameId: 0,
        scenarioId: 'scenario-1',
        target,
        candidates,
      },
    })

    const result = await orchestrator.handleMessage(message)

    expect(result).toEqual({
      ok: true,
      value: previewResult,
    })
    expect(sendMessage).toHaveBeenCalledWith(activeTab.id, message, { frameId: 0 })
  })

  it('ingests inspector cancellation reasons', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript()
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          sessionId: 'inspect-1',
        },
      }),
    )
    now += 50
    const result = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'inspector:cancelled',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          sessionId: 'inspect-1',
          reason: 'navigation',
          message: 'Page navigation ended inspection.',
        },
      }),
    )

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'inspector:cancelled',
        session: {
          type: 'inspector',
          sessionId: 'inspect-1',
          status: 'cancelled',
          reason: 'navigation',
          message: 'Page navigation ended inspection.',
          updatedAt: 1_700_000_000_050,
        },
      },
    })
  })

  it('returns popup state for the active tab and latest matching sessions', async () => {
    const activeTab = await createActiveTab()
    mockReadyContentScript(async (_tabId, message) => {
      const extensionMessage = message as ActorbleExtensionMessage
      if (extensionMessage.kind === 'record:start') {
        return okContentRecordReceipt(extensionMessage, 'recording')
      }

      return { received: true }
    })
    const orchestrator = createTestOrchestrator()

    await orchestrator.handleMessage(createRunMessage(activeTab.id))
    now += 5
    await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'run-1',
          status: 'stopped',
        },
      }),
    )
    now += 5
    await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
        },
      }),
    )

    const state = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          tabId: activeTab.id,
          frameId: 0,
          scenarioId: 'scenario-1',
        },
      }),
    )

    expect(state).toMatchObject({
      ok: true,
      value: {
        kind: 'popup:state',
        activeTab: {
          ready: true,
          tabId: activeTab.id,
          frameId: 0,
          url: 'http://localhost:3000/dashboard',
        },
        runSession: {
          type: 'run',
          runId: 'run-1',
          scenarioId: 'scenario-1',
          status: 'stopped',
        },
        recordSession: {
          type: 'record',
          runId: 'record-1',
          scenarioId: 'scenario-1',
          status: 'recording',
        },
      },
    })
  })

  it('returns blocked popup readiness when the active tab cannot run content', async () => {
    await createActiveTab('chrome://extensions')
    const orchestrator = createTestOrchestrator()

    const state = await orchestrator.handleMessage(
      createExtensionMessage({
        kind: 'popup:get-state',
        payload: {},
      }),
    )

    expect(state).toMatchObject({
      ok: true,
      value: {
        kind: 'popup:state',
        activeTab: {
          ready: false,
          issue: {
            code: 'unsupported_page',
            message: 'Actorble cannot run on chrome://extensions.',
          },
        },
      },
    })
  })

  it('returns a clear routing error when the target tab is missing', async () => {
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.handleMessage(createRunMessage(404))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'routing_error',
          message: 'Target tab 404 was not found.',
        },
      ],
    })
  })

  it('returns a content readiness error when the content script cannot receive a command', async () => {
    const activeTab = await createActiveTab()
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockRejectedValue(new Error('No receiver'))
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.handleMessage(createRunMessage(activeTab.id))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'content_not_ready',
          message: 'Content script is not ready for tab 1.',
        },
      ],
    })
  })

  it('rejects unsupported browser pages before routing', async () => {
    const activeTab = await createActiveTab('chrome://extensions')
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue({ received: true })
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.handleMessage(createRunMessage(activeTab.id))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_page',
          message: 'Actorble cannot run on chrome://extensions.',
        },
      ],
    })
  })

  it('rejects tabs without host permission before routing', async () => {
    const tab = await fakeBrowser.tabs.create({
      url: 'https://example.test/dashboard',
    })
    if (tab.id === undefined) {
      throw new Error('Expected fake tab id.')
    }
    vi.spyOn(fakeBrowser.permissions, 'contains').mockResolvedValue(false)
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue({ received: true })
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.handleMessage(createRunMessage(tab.id))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'permission_denied',
          message: 'Actorble does not have permission for https://example.test.',
        },
      ],
    })
  })
})

function createTestOrchestrator() {
  return createBackgroundOrchestrator(createWxtBackgroundBrowserHost(fakeBrowser), {
    now: () => now,
  })
}

function mockReadyContentScript(
  responder: (
    tabId: number,
    message: unknown,
    options?: Readonly<{ frameId?: number }>,
  ) => Promise<unknown> | unknown = () => ({ received: true }),
) {
  return vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (tabId, message, options) => {
    const extensionMessage = message as ActorbleExtensionMessage
    if (extensionMessage.kind === 'content:ready') {
      return {
        ok: true,
        value: {
          tabId: extensionMessage.payload.tabId ?? tabId,
          frameId: extensionMessage.payload.frameId ?? options?.frameId,
          url: 'http://localhost:3000/dashboard',
          topFrame: (extensionMessage.payload.frameId ?? options?.frameId) === 0,
          capabilities: {
            runtime: true,
            recorder: true,
            inspector: true,
            locatorPreview: true,
            frameCorrelation: true,
          },
        },
      }
    }

    return responder(tabId, message, options)
  })
}

async function createActiveTab(url = 'http://localhost:3000/dashboard') {
  const tab = await fakeBrowser.tabs.create({ url })
  if (tab.id === undefined) {
    throw new Error('Expected fake tab id.')
  }

  const activeTab = { ...tab, id: tab.id, active: true, url }

  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async (queryInfo) => {
    if (queryInfo.active === true && queryInfo.currentWindow === true) {
      return [activeTab]
    }

    return []
  })

  return activeTab
}

function createRunMessage(tabId: number, frameId?: number) {
  return createExtensionMessage({
    kind: 'scenario:run',
    payload: {
      tabId,
      ...(frameId === undefined ? {} : { frameId }),
      scenarioId: 'scenario-1',
      runId: 'run-1',
      compilation,
    },
  })
}

function recordStartMessage(tabId: number) {
  return createExtensionMessage({
    kind: 'record:start',
    payload: {
      tabId,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  })
}

function recordStopMessage(tabId: number) {
  return createExtensionMessage({
    kind: 'record:stop',
    payload: {
      tabId,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  })
}

function recordEventMessage(
  tabId: number,
  events: readonly RawRecordedEvent[],
  overrides: Partial<Extract<ActorbleExtensionMessage, { kind: 'record:event' }>['payload']> = {},
) {
  return createExtensionMessage({
    kind: 'record:event',
    payload: {
      tabId,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
      sessionId: 'record-1',
      reason: 'incremental',
      events,
      ...overrides,
    },
  })
}

function okContentRecordReceipt(
  message: ReturnType<typeof createExtensionMessage>,
  status: 'recording' | 'stopped',
) {
  if (message.kind !== 'record:start' && message.kind !== 'record:stop') {
    throw new Error(`Expected recorder message, received ${message.kind}`)
  }

  const sessionId = message.payload.runId ?? `${message.payload.tabId}:${message.payload.frameId ?? 0}`

  return {
    ok: true,
    value: {
      kind: message.kind,
      tabId: message.payload.tabId,
      frameId: message.payload.frameId,
      scenarioId: message.payload.scenarioId,
      runId: message.payload.runId,
      sessionId,
      status,
    },
  }
}

function recordedTextEvent(
  value = 'user@example.com',
  timestamp = 1_700_000_000_020,
  source: RawRecordedTextEvent['source'] = 'input',
): RawRecordedTextEvent {
  return {
    kind: 'text',
    target: {
      tagName: 'input',
      id: 'email',
      inputType: 'email',
      labelText: 'Email',
      name: 'email',
      rect: {
        x: 10,
        y: 80,
        width: 240,
        height: 32,
      },
    },
    source,
    value,
    sensitive: false,
    timestamp,
  }
}

function invalidLocatorEvent(): RawRecordedEvent {
  return {
    kind: 'click',
    target: {
      tagName: 'div',
      rect: {
        x: Number.NaN,
        y: Number.NaN,
        width: Number.NaN,
        height: Number.NaN,
      },
    },
    timestamp: 1_700_000_000_020,
    clientX: 0,
    clientY: 0,
    button: 0,
  }
}
