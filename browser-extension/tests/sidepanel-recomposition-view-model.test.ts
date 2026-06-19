import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js'
import type { LocatorPreviewSnapshot } from '../src/inspector/locator-preview.js'
import type { TargetPickerSnapshot } from '../src/inspector/target-picker.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
  type ScenarioTargetTextStep,
} from '../src/scenario/types.js'
import { failure, ok, type ExtensionResult } from '../src/shared/result.js'
import type {
  ScenarioJsonExport,
  ScenarioRecord,
} from '../src/storage/index.js'
import {
  createSidepanelScenarioEditor,
  type SidepanelRecordSession,
  type SidepanelScenarioEditor,
  type SidepanelScenarioEditorClient,
} from '../src/entrypoints/sidepanel/scenario-editor.js'
import {
  createSidepanelRecompositionViewModel,
  type SidepanelRecompositionInput,
} from '../src/entrypoints/sidepanel/recomposition-view-model.js'

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

describe('sidepanel recomposition view model', () => {
  it('groups an empty session around the recomposed information architecture', async () => {
    const { editor } = createTestEditor({ scenarios: [] })

    await editor.refresh()

    const view = viewFor(editor)
    expect(Object.keys(view)).toEqual([
      'scenarioShell',
      'builderWorkbench',
      'targetAssignment',
      'recordedDraftReview',
      'debugDrawer',
    ])
    expect(view).not.toHaveProperty('document')
    expect(view).not.toHaveProperty('recording')
    expect(view).not.toHaveProperty('targetPicker')
    expect(view).not.toHaveProperty('locatorPreview')
    expect(view).not.toHaveProperty('validation')
    expect(view).not.toHaveProperty('run')
    expect(view.scenarioShell.status).toBe('empty')
    expect(view.scenarioShell.buttons.create.disabled).toBe(false)
    expect(view.builderWorkbench.status).toBe('empty')
    expect(view.builderWorkbench.buttons.addStep.disabled).toBe(true)
    expect(view.targetAssignment.status).toBe('unavailable')
    expect(view.targetAssignment.buttons.start.disabled).toBe(true)
    expect(view.debugDrawer).toMatchObject({
      expanded: false,
      activeView: 'validation',
      attention: false,
    })
  })

  it('renders a saved scenario as shell, workbench, and target assignment state', async () => {
    const { editor } = createTestEditor()

    await editor.refresh()

    const view = viewFor(editor)
    expect(view.scenarioShell).toMatchObject({
      status: 'saved',
      dirty: false,
      selectedScenarioId: 'newest-scenario',
      targetTab: {
        status: 'unknown',
        summary: 'Tab not checked',
      },
      metadata: {
        name: 'Browser login flow',
        description: '',
      },
    })
    expect(view.builderWorkbench.selectedStep).toMatchObject({
      id: 'email',
      actionFamily: 'fill',
      selected: true,
    })
    expect(view.targetAssignment).toMatchObject({
      status: 'idle',
      selectedTargetSlotId: 'step-target:email',
      buttons: {
        start: {
          disabled: false,
          pending: false,
        },
      },
    })
    expect(view.targetAssignment.slots).toEqual([
      expect.objectContaining({
        id: 'step-target:email',
        label: 'Target',
        selected: true,
      }),
    ])
    expect(view.debugDrawer.views.validation.summary).toBe('Ready')
  })

  it('renders a dirty draft without storing UI state in the draft document', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()

    editor.createScenario({
      id: 'draft-document',
      name: 'Draft document',
      initialStepFamily: 'delay',
    })

    const view = viewFor(editor)
    expect(view.scenarioShell).toMatchObject({
      status: 'draft',
      dirty: true,
      selectedScenarioId: undefined,
      metadata: {
        name: 'Draft document',
      },
    })
    expect(view.builderWorkbench).toMatchObject({
      status: 'ready',
      selectedStep: {
        id: 'step-1',
        action: 'delay',
        actionFamily: 'delay',
      },
    })
    expect(view.targetAssignment.status).toBe('unavailable')
    expect(editor.getSnapshot().draftDocument).not.toHaveProperty('debugDrawer')
    expect(editor.getSnapshot().draftDocument).not.toHaveProperty('selectedTargetSlot')
  })

  it('renders the selected target slot and target picker progress in assignment state', async () => {
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => 'slot-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'slot-document',
      name: 'Slot document',
      initialStepFamily: 'drag',
    })
    editor.selectTargetSlot('drag-to:slot-step')

    const view = viewFor(editor, {
      targetPicker: {
        status: 'starting',
        issues: [],
      },
    })
    expect(view.targetAssignment).toMatchObject({
      status: 'starting',
      selectedTargetSlotId: 'drag-to:slot-step',
      buttons: {
        start: {
          disabled: true,
          pending: true,
        },
      },
    })
    expect(view.targetAssignment.slots).toEqual([
      expect.objectContaining({ id: 'drag-from:slot-step', selected: false }),
      expect.objectContaining({ id: 'drag-to:slot-step', selected: true }),
    ])
  })

  it('renders active recording as scenario shell lifecycle state', async () => {
    const { editor } = createTestEditor({
      createRecordId: () => 'record-sidepanel-1',
      sendResponse(message) {
        if (message.kind === 'record:start') {
          return ok(commandReceiptForRecord(message, 'recording'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    await editor.startRecording()

    const view = viewFor(editor)
    expect(view.scenarioShell).toMatchObject({
      status: 'recording',
      recordStatus: 'recording',
      buttons: {
        record: {
          label: 'Stop recording',
          disabled: false,
          pending: false,
        },
      },
    })
    expect(view.debugDrawer.views.validation.summary).toBe('Ready')
  })

  it('renders recorded draft review inside the builder flow', async () => {
    const { editor } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedDraft('record-popup-1'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    await editor.loadRecordedDraft('record-popup-1')

    const view = viewFor(editor)
    expect(view.recordedDraftReview).toMatchObject({
      draftId: 'record-popup-1',
      summary: '1 source event · valid',
      buttons: {
        replace: { disabled: false },
        append: { disabled: false },
        saveAsNew: { disabled: false },
      },
    })
    expect(view.scenarioShell.recordStatus).toBe('stopped')
  })

  it('keeps validation errors in the collapsed debug drawer by default', async () => {
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

    editor.validateDraft()

    const view = viewFor(editor)
    expect(view.debugDrawer).toMatchObject({
      expanded: false,
      activeView: 'validation',
      attention: true,
      views: {
        validation: {
          issueCount: 1,
          summary: '1 issue',
        },
      },
    })
    expect(view.builderWorkbench.steps[0]).toMatchObject({
      validationStatus: 'invalid',
    })
  })

  it('keeps failed run detail in the collapsed debug drawer by default', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()
    await editor.runSelectedScenario()

    editor.ingestMessage(
      createExtensionMessage({
        kind: 'trace:event',
        payload: {
          tabId: 7,
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
    editor.ingestMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 7,
          scenarioId: 'newest-scenario',
          runId: 'run-1',
          status: 'failed',
          message: 'Run failed at password.',
        },
      }),
    )

    const view = viewFor(editor)
    expect(view.scenarioShell.runStatus).toBe('failed')
    expect(view.debugDrawer).toMatchObject({
      expanded: false,
      activeView: 'failure',
      attention: true,
      views: {
        failure: {
          message: 'Run failed at password.',
          stepId: 'password',
          eventName: 'target:missing',
        },
        runTrace: {
          eventCount: 1,
        },
      },
    })
  })

  it('derives locator preview state and candidate selection from preview status', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()

    const view = viewFor(editor, {
      locatorPreview: {
        status: 'ready',
        candidates: [
          {
            id: 'testId-1',
            rank: 1,
            strategy: 'testId',
            label: 'testId: email',
            locator: {
              strategy: 'testId',
              value: 'email',
            },
            matchCount: 1,
            strict: true,
            status: 'unique',
          },
          {
            id: 'css-2',
            rank: 2,
            strategy: 'css',
            label: 'css: input',
            locator: {
              strategy: 'css',
              selector: 'input',
            },
            matchCount: 2,
            strict: false,
            status: 'ambiguous',
          },
        ],
        issues: [],
      },
    })

    expect(view.targetAssignment.locatorPreview).toMatchObject({
      status: 'ready',
      summary: '2 candidates',
      candidates: [
        {
          id: 'testId-1',
          selectable: true,
        },
        {
          id: 'css-2',
          selectable: false,
        },
      ],
    })
  })

  it('surfaces content readiness failures in the scenario shell', async () => {
    const { editor } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'scenario:run') {
          return failure({
            code: 'content_not_ready',
            message: 'Content script is not ready for tab 7.',
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    const result = await editor.runSelectedScenario()
    const view = viewFor(editor)

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'content_not_ready',
        },
      ],
    })
    expect(view.scenarioShell).toMatchObject({
      issueSummary: 'Content script is not ready for tab 7.',
      buttons: {
        run: {
          disabled: false,
          pending: false,
        },
      },
    })
  })
})

type TestEditorOptions = Readonly<{
  scenarios?: readonly ScenarioRecord[]
  createRunId?: () => string
  createDryRunId?: () => string
  createRecordId?: () => string
  createStepId?: () => string
  sendResponse?:
    | ExtensionResult<unknown>
    | Promise<ExtensionResult<unknown>>
    | ((message: ActorbleExtensionMessage) => ExtensionResult<unknown> | Promise<ExtensionResult<unknown>>)
}>

function createTestEditor(options: TestEditorOptions = {}) {
  let scenarios = [...(options.scenarios ?? [newestScenario, olderScenario])]
  const sent: ActorbleExtensionMessage[] = []

  const client: SidepanelScenarioEditorClient = {
    async listScenarios() {
      return ok(scenarios)
    },
    async updateScenario(id, update) {
      const existing = scenarios.find((scenario) => scenario.id === id)
      if (existing === undefined) {
        throw new Error(`Missing scenario record ${id}.`)
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
      const record = scenarioRecord(
        input.id ?? input.document.id ?? 'generated-scenario',
        input.name ?? input.document.name ?? 'Untitled scenario',
        '2026-06-17T00:10:00.000Z',
        input.document,
      )
      scenarios = [record, ...scenarios]
      return ok(record)
    },
    async importScenarioJson() {
      return ok(scenarios[0])
    },
    async exportScenarioJson(id) {
      const record = scenarios.find((scenario) => scenario.id === id)
      if (record === undefined) {
        throw new Error(`Missing scenario record ${id}.`)
      }

      return ok({
        id,
        filename: `${id}.json`,
        jsonText: `${JSON.stringify(record.document, null, 2)}\n`,
        document: record.document,
      } satisfies ScenarioJsonExport)
    },
    async getActiveTab() {
      return { id: 7, url: 'http://localhost:3000/login' }
    },
    async sendMessage(message) {
      sent.push(message)
      if (typeof options.sendResponse === 'function') {
        return options.sendResponse(message)
      }

      return options.sendResponse ?? ok({ contentReady: true })
    },
  }

  const editor = createSidepanelScenarioEditor(client, {
    createRunId: options.createRunId ?? (() => 'run-1'),
    createDryRunId: options.createDryRunId ?? (() => 'dry-run-1'),
    createRecordId: options.createRecordId ?? (() => 'record-1'),
    ...(options.createStepId === undefined ? {} : { createStepId: options.createStepId }),
  })

  return { editor, sent }
}

function viewFor(
  editor: SidepanelScenarioEditor,
  input: Partial<Omit<SidepanelRecompositionInput, 'editor'>> = {},
) {
  return createSidepanelRecompositionViewModel({
    editor: editor.getSnapshot(),
    targetPicker: input.targetPicker ?? idleTargetPicker(),
    locatorPreview: input.locatorPreview ?? idleLocatorPreview(),
    ...(input.debugDrawer === undefined ? {} : { debugDrawer: input.debugDrawer }),
  })
}

function idleTargetPicker(): TargetPickerSnapshot {
  return {
    status: 'idle',
    issues: [],
  }
}

function idleLocatorPreview(): LocatorPreviewSnapshot {
  return {
    status: 'idle',
    candidates: [],
    issues: [],
  }
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

function commandReceiptForRecord(
  message: Extract<ActorbleExtensionMessage, { kind: 'record:start' | 'record:stop' }>,
  status: 'recording' | 'stopped',
) {
  return {
    kind: message.kind,
    tabId: message.payload.tabId,
    frameId: message.payload.frameId,
    scenarioId: message.payload.scenarioId,
    runId: message.payload.runId,
    contentReady: true,
    status,
    session: {
      type: 'record',
      sessionId: message.payload.runId ?? '7:0',
      tabId: message.payload.tabId,
      frameId: message.payload.frameId,
      scenarioId: message.payload.scenarioId,
      runId: message.payload.runId,
      status,
      startedAt: 100,
      updatedAt: 110,
    } satisfies SidepanelRecordSession,
  }
}

function recordedDraft(
  draftId: string,
  stepPatch: Partial<ScenarioTargetTextStep> = {},
) {
  return {
    draftId,
    sessionId: draftId,
    tabId: 7,
    frameId: 0,
    scenarioId: 'newest-scenario',
    runId: draftId,
    sourceEventCount: 1,
    createdAt: 1_700_000_000_000,
    document: {
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      steps: [
        {
          id: 'recorded-step-1',
          action: 'fill',
          target: {
            kind: 'target',
            strict: true,
            locators: [
              {
                strategy: 'label',
                label: 'Email',
              },
            ],
          },
          input: 'user@example.com',
          ...stepPatch,
        },
      ],
    } satisfies ScenarioDocument,
  }
}
