import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  createBackgroundOrchestrator,
  createWxtBackgroundBrowserHost,
} from '../src/entrypoints/background/orchestration.js'
import { createExtensionMessage } from '../src/messaging/index.js'

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
    const orchestrator = createTestOrchestrator()

    const result = await orchestrator.resolveActiveTarget()

    expect(result).toEqual({
      ok: true,
      value: {
        tabId: activeTab.id,
        url: 'http://localhost:3000/login',
      },
    })
  })

  it('routes run messages to the target frame and tracks run metadata', async () => {
    const activeTab = await createActiveTab()
    const sendMessage = vi
      .spyOn(fakeBrowser.tabs, 'sendMessage')
      .mockResolvedValue({ received: true })
    const orchestrator = createTestOrchestrator()
    const message = createRunMessage(activeTab.id)

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
    expect(sendMessage).toHaveBeenCalledWith(activeTab.id, message, { frameId: 0 })
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
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue({ received: true })
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
    vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockResolvedValue({ received: true })
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

function createRunMessage(tabId: number) {
  return createExtensionMessage({
    kind: 'scenario:run',
    payload: {
      tabId,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'run-1',
      compilation,
    },
  })
}
