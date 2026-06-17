import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import {
  createImportedScenarioRunner,
  formatIssue,
  formatIssuePath,
  validateImportedScenarioText,
  type SidepanelActiveTab,
} from '../src/entrypoints/sidepanel/imported-scenario-run.js'
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import { failure, ok, type ExtensionResult } from '../src/shared/result.js'

describe('sidepanel imported scenario run flow', () => {
  it('returns a JSON parse issue before validation or dispatch', () => {
    const result = validateImportedScenarioText('{')

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          message: 'Scenario JSON is not valid JSON.',
        },
      ],
    })
    if (!result.ok) {
      expect(formatIssue(result.issues[0])).toContain('Scenario JSON is not valid JSON.')
    }
  })

  it('renders schema validation issues and does not dispatch a run command', async () => {
    const { runner, sent } = createTestRunner()

    const result = await runner.run(
      JSON.stringify({
        schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      }),
    )

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          path: ['steps'],
        },
      ],
    })
    expect(sent).toEqual([])
    expect(runner.getSnapshot()).toMatchObject({
      status: 'idle',
      issues: [
        {
          path: ['steps'],
        },
      ],
    })
  })

  it('renders compiler issues and does not dispatch a run command', async () => {
    const { runner, sent } = createTestRunner()
    const unsupportedPlatform = {
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      platform: {
        chrome: {
          experiment: true,
        },
      },
      steps: [
        {
          action: 'delay',
          duration: 1,
        },
      ],
    } satisfies ScenarioDocument

    const result = await runner.run(JSON.stringify(unsupportedPlatform))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_platform_extension',
          path: ['platform'],
        },
      ],
    })
    expect(sent).toEqual([])
  })

  it('dispatches a valid imported scenario run to the active tab', async () => {
    const { runner, sent } = createTestRunner()

    const result = await runner.run(JSON.stringify(browserLoginFlow))

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'browser-login-flow',
        runId: 'run-1',
        status: 'running',
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      kind: 'scenario:run',
      payload: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'browser-login-flow',
        runId: 'run-1',
        compilation: {
          scenario: {
            id: 'browser-login-flow',
            name: 'Browser login flow',
          },
        },
      },
    })
    expect(runner.getSnapshot()).toMatchObject({
      scenarioId: 'browser-login-flow',
      runId: 'run-1',
      status: 'running',
      issues: [],
    })
  })

  it('surfaces background routing failures after dispatch', async () => {
    const { runner } = createTestRunner({
      sendResponse: failure({
        code: 'content_not_ready',
        message: 'Content script is not ready for tab 7.',
      }),
    })

    const result = await runner.run(JSON.stringify(browserLoginFlow))

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'content_not_ready',
          message: 'Content script is not ready for tab 7.',
        },
      ],
    })
    expect(runner.getSnapshot()).toMatchObject({
      status: 'idle',
      issues: [
        {
          code: 'content_not_ready',
        },
      ],
    })
  })

  it('updates status and latest trace feedback for the active run only', async () => {
    const { runner } = createTestRunner()
    await runner.run(JSON.stringify(browserLoginFlow))

    const ignored = runner.ingestMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'browser-login-flow',
          runId: 'other-run',
          status: 'failed',
        },
      }),
    )
    const acceptedStatus = runner.ingestMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'browser-login-flow',
          runId: 'run-1',
          status: 'completed',
        },
      }),
    )
    const acceptedTrace = runner.ingestMessage(
      createExtensionMessage({
        kind: 'trace:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'browser-login-flow',
          runId: 'run-1',
          event: {
            runId: 'run-1',
            scenarioId: 'browser-login-flow',
            timestamp: 100,
            name: 'scenario:start',
            level: 'info',
            details: {
              stepId: 'email',
            },
          },
        },
      }),
    )

    expect(ignored).toBe(false)
    expect(acceptedStatus).toBe(true)
    expect(acceptedTrace).toBe(true)
    expect(runner.getSnapshot()).toMatchObject({
      status: 'completed',
      latestTrace: {
        name: 'scenario:start',
        runId: 'run-1',
      },
    })
  })

  it('formats issue paths for compact UI rendering', () => {
    expect(formatIssuePath(['steps', 0, 'target', 'selector'])).toBe(
      'steps[0].target.selector',
    )
    expect(formatIssuePath([])).toBe('document')
  })
})

type TestRunnerOptions = Readonly<{
  activeTab?: SidepanelActiveTab | null
  sendResponse?: ExtensionResult<unknown>
}>

function createTestRunner(options: TestRunnerOptions = {}) {
  const sent: ActorbleExtensionMessage[] = []
  const runner = createImportedScenarioRunner(
    {
      async getActiveTab() {
        return options.activeTab ?? { id: 7, url: 'http://localhost:3000/login' }
      },
      async sendMessage(message) {
        sent.push(message)
        return options.sendResponse ?? ok({ contentReady: true })
      },
    },
    {
      createRunId: () => 'run-1',
      frameId: 0,
    },
  )

  return { runner, sent }
}
