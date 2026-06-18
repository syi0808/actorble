import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
} from '../src/messaging/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import { failure, ok, type ExtensionResult } from '../src/shared/result.js'
import type {
  ScenarioJsonExport,
  ScenarioRecord,
  ScenarioRecordInput,
  ScenarioRecordUpdate,
} from '../src/storage/index.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelScenarioEditorClient,
} from '../src/entrypoints/sidepanel/scenario-editor.js'

const newestScenario = scenarioRecord(
  'newest-scenario',
  'Newest scenario',
  '2026-06-17T00:02:00.000Z',
  browserLoginFlow as ScenarioDocument,
)
const olderScenario = scenarioRecord(
  'older-scenario',
  'Older scenario',
  '2026-06-17T00:00:00.000Z',
  scenarioDocument('older-scenario', 'Older scenario'),
)

describe('sidepanel scenario editor', () => {
  it('loads saved scenarios, selects the newest record, and renders step summaries', async () => {
    const { editor } = createTestEditor()

    const result = await editor.refresh()

    expect(result).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: 'newest-scenario',
      selectedStepIndex: 0,
      issues: [],
    })
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.scenarioOptions).toEqual([
      { value: 'newest-scenario', label: 'Newest scenario' },
      { value: 'older-scenario', label: 'Older scenario' },
    ])
    expect(view.documentFields).toMatchObject({
      name: 'Browser login flow',
      description: '',
    })
    expect(view.stepRows[0]).toMatchObject({
      index: 0,
      action: 'fill',
      selected: true,
      validationStatus: 'valid',
    })
    expect(view.stepRows[0].targetSummary).toContain('label')
    expect(view.stepRows[0].inputSummary).toContain('user@example.com')
  })

  it('surfaces validation errors on the matching step row', async () => {
    const invalid = scenarioRecord('invalid-scenario', 'Invalid scenario', '2026-06-17T00:03:00.000Z', {
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      id: 'invalid-scenario',
      name: 'Invalid scenario',
      steps: [
        {
          action: 'fill',
          target: {
            strategy: 'label',
            label: 'Email',
          },
          input: '',
        },
      ],
    } as unknown as ScenarioDocument)
    const { editor } = createTestEditor({ scenarios: [invalid] })

    await editor.refresh()
    const validation = editor.validateDraft()

    expect(validation).toMatchObject({
      ok: false,
      issues: [
        {
          path: ['steps', 0, 'input'],
        },
      ],
    })
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.validationSummary).toBe('1 issue')
    expect(view.stepRows).toHaveLength(1)
    expect(view.stepRows[0]).toMatchObject({
      validationStatus: 'invalid',
    })
  })

  it('saves structured edits while preserving unedited document properties', async () => {
    const { editor, updates } = createTestEditor()
    await editor.refresh()
    editor.updateDocumentFields({
      name: 'Edited login flow',
      description: 'Covers the happy path.',
    })
    editor.selectStep(0)
    const edit = editor.updateSelectedStepFields({
      note: 'Use the known test account.',
      input: 'edited@example.com',
    })

    expect(edit).toMatchObject({ ok: true })
    const result = await editor.saveDraft()

    expect(result).toMatchObject({
      ok: true,
      value: {
        id: 'newest-scenario',
        name: 'Edited login flow',
      },
    })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      id: 'newest-scenario',
      update: {
        name: 'Edited login flow',
        document: {
          name: 'Edited login flow',
          description: 'Covers the happy path.',
        },
      },
    })
    expect(updates[0].update.document?.steps).toHaveLength(newestScenario.document.steps.length)
    expect(updates[0].update.document?.steps[0]).toMatchObject({
      action: 'fill',
      note: 'Use the known test account.',
      input: 'edited@example.com',
    })
    expect(updates[0].update.document?.metadata).toEqual(newestScenario.document.metadata)
    expect(updates[0].update.document?.defaults).toEqual(newestScenario.document.defaults)
  })

  it('writes a selected locator into the current step as a strict target and validates it', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()
    editor.selectStep(0)

    const result = editor.applyLocatorToSelectedStep({
      strategy: 'testId',
      value: 'email-input',
    })

    expect(result).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      issues: [],
      message: 'Locator applied',
    })
    expect(editor.getSnapshot().draftDocument?.steps[0]).toMatchObject({
      action: 'fill',
      target: {
        kind: 'target',
        strict: true,
        locators: [
          {
            strategy: 'testId',
            value: 'email-input',
          },
        ],
      },
    })
  })

  it('imports and exports scenarios through the storage repository', async () => {
    const imported = scenarioRecord(
      'imported-scenario',
      'Imported scenario',
      '2026-06-17T00:05:00.000Z',
      scenarioDocument('imported-scenario', 'Imported scenario'),
    )
    const { editor, imports, exports } = createTestEditor({
      importResponse: ok(imported),
      exportResponse: ok({
        id: 'imported-scenario',
        filename: 'imported-scenario.json',
        jsonText: '{\"schemaVersion\":\"actorble.scenario.draft\",\"steps\":[]}\n',
        document: imported.document,
      }),
    })
    await editor.refresh()

    const importResult = await editor.importJson(JSON.stringify(imported.document))
    const exportResult = await editor.exportSelected()

    expect(importResult).toMatchObject({ ok: true })
    expect(editor.getSnapshot().selectedScenarioId).toBe('imported-scenario')
    expect(imports).toEqual([JSON.stringify(imported.document)])
    expect(exportResult).toMatchObject({
      ok: true,
      value: {
        filename: 'imported-scenario.json',
      },
    })
    expect(exports).toEqual(['imported-scenario'])
  })

  it('dispatches a selected-step dry run with one compiled step and a dry-run id', async () => {
    const { editor, sent } = createTestEditor({
      createDryRunId: () => 'dry-run-1',
    })
    await editor.refresh()
    editor.selectStep(1)

    const result = await editor.dryRunSelectedStep()

    expect(result).toMatchObject({
      ok: true,
      value: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'newest-scenario',
        runId: 'dry-run-1',
        status: 'running',
      },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      kind: 'scenario:run',
      payload: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'newest-scenario',
        runId: 'dry-run-1',
        compilation: {
          scenario: {
            steps: [
              {
                action: 'fill',
              },
            ],
          },
        },
      },
    })
    const runMessage = sent[0]
    if (runMessage.kind !== 'scenario:run') {
      throw new Error(`Expected scenario:run, received ${runMessage.kind}`)
    }
    expect(runMessage.payload.compilation.scenario.steps).toHaveLength(1)
  })

  it('renders failure trace details for the active run only', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()
    await editor.runSelectedScenario()

    const ignored = editor.ingestMessage(
      createExtensionMessage({
        kind: 'trace:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'other-run',
          event: {
            runId: 'other-run',
            scenarioId: 'newest-scenario',
            timestamp: 100,
            name: 'target:missing',
            level: 'error',
          },
        },
      }),
    )
    const acceptedTrace = editor.ingestMessage(
      createExtensionMessage({
        kind: 'trace:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-1',
          event: {
            runId: 'run-1',
            scenarioId: 'newest-scenario',
            timestamp: 110,
            name: 'target:missing',
            level: 'error',
            message: 'Target not found.',
            details: {
              stepId: 'password',
            },
          },
        },
      }),
    )
    const acceptedStatus = editor.ingestMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-1',
          status: 'failed',
          message: 'Run failed at password.',
        },
      }),
    )

    expect(ignored).toBe(false)
    expect(acceptedTrace).toBe(true)
    expect(acceptedStatus).toBe(true)
    expect(editor.getSnapshot()).toMatchObject({
      currentRun: {
        runId: 'run-1',
        status: 'failed',
      },
      currentTrace: {
        latestEvent: {
          name: 'target:missing',
          stepId: 'password',
        },
        failure: {
          message: 'Run failed at password.',
          stepId: 'password',
          eventName: 'target:missing',
        },
      },
    })
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).runSummary).toBe(
      'Failed run-1 after 1 event: Run failed at password.',
    )
  })
})

type TestEditorOptions = Readonly<{
  scenarios?: readonly ScenarioRecord[]
  createRunId?: () => string
  createDryRunId?: () => string
  sendResponse?: ExtensionResult<unknown>
  importResponse?: ExtensionResult<ScenarioRecord>
  exportResponse?: ExtensionResult<ScenarioJsonExport>
}>

function createTestEditor(options: TestEditorOptions = {}) {
  let scenarios = [...(options.scenarios ?? [newestScenario, olderScenario])]
  const sent: ActorbleExtensionMessage[] = []
  const updates: { id: string; update: ScenarioRecordUpdate }[] = []
  const saves: ScenarioRecordInput[] = []
  const imports: string[] = []
  const exports: string[] = []

  const client: SidepanelScenarioEditorClient = {
    async listScenarios() {
      return ok(scenarios)
    },
    async updateScenario(id, update) {
      updates.push({ id, update })
      const existing = scenarios.find((scenario) => scenario.id === id)
      if (existing === undefined) {
        return failure({
          code: 'storage_error',
          message: `Missing scenario record ${id}.`,
        })
      }

      const next = {
        ...existing,
        name: update.name ?? existing.name,
        document: update.document ?? existing.document,
        updatedAt: '2026-06-17T00:10:00.000Z',
      }
      scenarios = scenarios.map((scenario) => (scenario.id === id ? next : scenario))
      return ok(next)
    },
    async saveScenario(input) {
      saves.push(input)
      const record = scenarioRecord(
        input.id ?? input.document.id ?? 'generated-scenario',
        input.name ?? input.document.name ?? 'Untitled scenario',
        '2026-06-17T00:10:00.000Z',
        input.document,
      )
      scenarios = [record, ...scenarios]
      return ok(record)
    },
    async importScenarioJson(jsonText) {
      imports.push(jsonText)
      if (options.importResponse !== undefined) {
        if (options.importResponse.ok) {
          scenarios = [options.importResponse.value, ...scenarios]
        }
        return options.importResponse
      }

      return ok(scenarios[0])
    },
    async exportScenarioJson(id) {
      exports.push(id)
      if (options.exportResponse !== undefined) {
        return options.exportResponse
      }

      const record = scenarios.find((scenario) => scenario.id === id)
      if (record === undefined) {
        return failure({
          code: 'storage_error',
          message: `Missing scenario record ${id}.`,
        })
      }

      return ok({
        id,
        filename: `${id}.json`,
        jsonText: `${JSON.stringify(record.document, null, 2)}\n`,
        document: record.document,
      })
    },
    async getActiveTab() {
      return { id: 7, url: 'http://localhost:3000/login' }
    },
    async sendMessage(message) {
      sent.push(message)
      return options.sendResponse ?? ok({ contentReady: true })
    },
  }

  const editor = createSidepanelScenarioEditor(client, {
    createRunId: options.createRunId ?? (() => 'run-1'),
    createDryRunId: options.createDryRunId ?? (() => 'dry-run-1'),
    frameId: 0,
  })

  return { editor, sent, updates, saves, imports, exports }
}

function scenarioRecord(
  id: string,
  name: string,
  updatedAt: string,
  document: ScenarioDocument = scenarioDocument(id, name),
): ScenarioRecord {
  return {
    id,
    name,
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    document,
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt,
  }
}

function scenarioDocument(id: string, name: string): ScenarioDocument {
  return {
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    id,
    name,
    metadata: {
      owner: 'extension-test',
    },
    defaults: {
      timeout: 1_000,
    },
    steps: [
      {
        id: 'wait',
        action: 'delay',
        duration: 1,
        reason: 'Let the page settle.',
      },
    ],
  }
}
