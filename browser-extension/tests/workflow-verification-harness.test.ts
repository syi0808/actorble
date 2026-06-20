import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorbleFacadeOptions, TraceCollector } from '@actorble/browser'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  createBackgroundOrchestrator,
  createWxtBackgroundBrowserHost,
} from '../src/entrypoints/background/orchestration.js'
import {
  createContentInspectorHost,
  type ContentInspectorAdapter,
  type ContentInspectorPointerEvent,
} from '../src/entrypoints/content/inspector-host.js'
import {
  createContentLocatorPreviewHost,
  type ContentLocatorPreviewActorble,
} from '../src/entrypoints/content/locator-preview-host.js'
import {
  createContentRecorderHost,
  createRecordEventFlushSender,
} from '../src/entrypoints/content/recorder-host.js'
import {
  createContentRuntimeHost,
  type ContentActorbleFacade,
} from '../src/entrypoints/content/runtime-host.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelScenarioEditorClient,
} from '../src/entrypoints/sidepanel/scenario-editor.js'
import {
  createSidepanelRecompositionViewModel,
} from '../src/entrypoints/sidepanel/recomposition-view-model.js'
import {
  createLocatorPreviewCandidateViews,
  createLocatorPreviewer,
} from '../src/inspector/locator-preview.js'
import { createTargetPicker } from '../src/inspector/target-picker.js'
import {
  type ActorbleExtensionMessage,
  type InspectorTargetMetadata,
} from '../src/messaging/index.js'
import {
  createRecorderEventCapturePort,
  type RecorderEventCaptureAdapter,
  type RecorderTextEvent,
} from '../src/recorder/event-capture.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'
import { ok } from '../src/shared/result.js'
import type {
  ScenarioJsonExport,
  ScenarioRecord,
  ScenarioRecordInput,
} from '../src/storage/index.js'

const FIXTURE_URL = 'http://localhost:3000/actorble-workflow-fixture.html'

beforeEach(() => {
  vi.restoreAllMocks()
  fakeBrowser.reset()
})

describe('workflow verification harness', () => {
  it('verifies recomposed authoring, target picking, dry-run, recording review, save, and run feedback', async () => {
    const harness = await createWorkflowHarness()

    await harness.editor.refresh()
    const created = harness.editor.createScenario({
      id: 'workflow-scenario',
      name: 'Workflow verification',
      initialStepFamily: 'delay',
    })
    harness.editor.updateDocumentFields({
      name: 'Workflow verification edited',
      description: 'End-to-end recomposed flow',
    })
    const added = harness.editor.addStep('click')

    expect(created).toMatchObject({ ok: true })
    expect(added).toMatchObject({ ok: true })
    expect(createSidepanelScenarioEditorView(harness.editor.getSnapshot())).toMatchObject({
      workflow: {
        status: 'draft',
        selectedStepId: 'workflow-click',
        selectedTargetSlotId: 'step-target:workflow-click',
      },
    })
    expectRecomposedPrimarySurfaces(recomposedViewFor(harness))
    expect(recomposedViewFor(harness)).toMatchObject({
      scenarioShell: {
        status: 'draft',
        dirty: true,
        metadata: {
          name: 'Workflow verification edited',
          description: 'End-to-end recomposed flow',
        },
        selectedStepId: 'workflow-click',
        selectedTargetSlotId: 'step-target:workflow-click',
      },
      builderWorkbench: {
        status: 'ready',
        selectedStep: {
          id: 'workflow-click',
          action: 'click',
          actionFamily: 'click',
          fields: {
            controls: {
              targetSlots: true,
            },
          },
        },
      },
      targetAssignment: {
        status: 'idle',
        selectedTargetSlotId: 'step-target:workflow-click',
        buttons: {
          start: {
            disabled: false,
          },
        },
      },
      debugDrawer: {
        expanded: false,
        activeView: 'validation',
        attention: true,
      },
    })

    const pickerStart = await harness.targetPicker.start({
      scenarioId: 'workflow-scenario',
      targetSlot: harness.editor.getSnapshot().selectedTargetSlot,
    })
    harness.inspectorAdapter.dispatchPointerMove(220, 122)
    harness.inspectorAdapter.dispatchClick(220, 122)
    await flushAsyncWork()

    const selected = harness.targetPicker.getSnapshot().selected
    expect(pickerStart).toMatchObject({ ok: true })
    expect(selected).toMatchObject({
      scenarioId: 'workflow-scenario',
      targetSlot: {
        kind: 'step-target',
        stepId: 'workflow-click',
      },
      target: {
        testId: 'submit-button',
      },
    })

    if (selected === undefined) {
      throw new Error('Expected a selected target.')
    }

    const preview = await harness.locatorPreviewer.previewTarget(selected.target, {
      scenarioId: selected.scenarioId,
      targetSlot: selected.targetSlot,
    })
    expect(preview).toMatchObject({
      ok: true,
      value: {
        targetSlot: {
          kind: 'step-target',
          stepId: 'workflow-click',
        },
      },
    })

    const testIdCandidate = harness.locatorPreviewer.getSnapshot().candidates.find(
      (candidate) => candidate.strategy === 'testId',
    )
    expect(testIdCandidate).toMatchObject({
      status: 'unique',
      matchCount: 1,
      locator: {
        strategy: 'testId',
        value: 'submit-button',
      },
    })
    expect(createLocatorPreviewCandidateViews(harness.locatorPreviewer.getSnapshot().candidates)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategy: 'testId',
          selectable: true,
        }),
      ]),
    )
    expect(recomposedViewFor(harness).targetAssignment).toMatchObject({
      status: 'selected',
      selectedTargetSlotId: 'step-target:workflow-click',
      locatorPreview: {
        status: 'ready',
        summary: expect.stringContaining('candidate'),
        candidates: expect.arrayContaining([
          expect.objectContaining({
            strategy: 'testId',
            selectable: true,
          }),
        ]),
      },
    })

    if (testIdCandidate === undefined || selected.targetSlot === undefined) {
      throw new Error('Expected a selectable testId candidate.')
    }

    const applied = harness.editor.applyLocatorToTargetSlot(
      selected.targetSlot,
      testIdCandidate.locator,
    )
    expect(applied).toMatchObject({ ok: true })
    expect(harness.editor.getSnapshot().draftDocument?.steps[1]).toMatchObject({
      id: 'workflow-click',
      action: 'click',
      target: {
        locators: [
          {
            strategy: 'testId',
            value: 'submit-button',
          },
        ],
      },
    })

    const dryRun = await harness.editor.dryRunSelectedStep()
    await flushAsyncWork()
    expect(dryRun).toMatchObject({
      ok: true,
      value: {
        tabId: harness.activeTab.id,
        frameId: 0,
        scenarioId: 'workflow-scenario',
        runId: 'dry-run-workflow',
      },
    })
    const dryRunMessage = harness.routedMessages.find(
      (message) => message.kind === 'scenario:run' && message.payload.runId === 'dry-run-workflow',
    )
    expect(dryRunMessage).toMatchObject({
      kind: 'scenario:run',
      payload: {
        compilation: {
          scenario: {
            steps: [
              {
                action: 'click',
              },
            ],
          },
        },
      },
    })
    if (dryRunMessage?.kind !== 'scenario:run') {
      throw new Error('Expected routed dry-run message.')
    }
    expect(dryRunMessage.payload.compilation.scenario.steps).toHaveLength(1)
    expect(harness.editor.getSnapshot().currentRun).toMatchObject({
      runId: 'dry-run-workflow',
      status: 'completed',
    })
    expect(recomposedViewFor(harness).debugDrawer).toMatchObject({
      expanded: false,
      activeView: 'run-trace',
      attention: false,
      views: {
        runTrace: {
          runId: 'dry-run-workflow',
          status: 'completed',
          latestEventName: 'workflow:run',
        },
      },
    })

    const recordStart = await harness.editor.startRecording()
    harness.recorderAdapter.dispatchInput('user@example.com')
    await flushAsyncWork()
    const recordStop = await harness.editor.stopRecording()

    expect(recordStart).toMatchObject({
      ok: true,
      value: {
        runId: 'record-workflow',
        session: {
          status: 'recording',
        },
      },
    })
    expect(recordStop).toMatchObject({
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
    expect(createSidepanelScenarioEditorView(harness.editor.getSnapshot()).recordedDraftReview).toMatchObject({
      summary: '1 source event · valid',
      buttons: {
        append: {
          disabled: false,
        },
      },
    })
    expect(harness.editor.getSnapshot().draftDocument?.steps).toHaveLength(2)
    expect(recomposedViewFor(harness).recordedDraftReview).toMatchObject({
      summary: '1 source event · valid',
      buttons: {
        append: {
          disabled: false,
        },
        replace: {
          disabled: false,
        },
      },
    })

    const appended = harness.editor.appendRecordedDraftSteps()
    const saved = await harness.editor.saveDraft()

    expect(appended).toMatchObject({ ok: true })
    expect(saved).toMatchObject({
      ok: true,
      value: {
        id: 'workflow-scenario',
      },
    })
    expect(harness.saves).toHaveLength(1)
    expect(harness.saves[0].document.steps).toHaveLength(3)
    expect(harness.saves[0].document.steps.at(-1)).toMatchObject({
      action: 'fill',
      input: 'user@example.com',
    })
    expect(recomposedViewFor(harness)).toMatchObject({
      scenarioShell: {
        status: 'saved',
        dirty: false,
      },
      builderWorkbench: {
        steps: [
          expect.objectContaining({ action: 'delay' }),
          expect.objectContaining({ action: 'click' }),
          expect.objectContaining({ action: 'fill' }),
        ],
      },
      recordedDraftReview: undefined,
    })

    const run = await harness.editor.runSelectedScenario()
    await flushAsyncWork()

    expect(run).toMatchObject({
      ok: true,
      value: {
        runId: 'run-workflow',
        status: 'running',
      },
    })
    expect(harness.runtimeRuns.at(-1)).toMatchObject({
      id: 'workflow-scenario',
      steps: [
        { action: 'delay' },
        { action: 'click' },
        { action: 'fill' },
      ],
    })
    expect(harness.editor.getSnapshot()).toMatchObject({
      currentRun: {
        runId: 'run-workflow',
        status: 'completed',
      },
      currentTrace: {
        latestEvent: {
          name: 'workflow:run',
        },
      },
    })
    expect(createSidepanelScenarioEditorView(harness.editor.getSnapshot()).runSummary).toContain(
      'Completed run-workflow',
    )
    expect(recomposedViewFor(harness).debugDrawer).toMatchObject({
      expanded: false,
      activeView: 'run-trace',
      attention: false,
      views: {
        runTrace: {
          runId: 'run-workflow',
          status: 'completed',
          latestEventName: 'workflow:run',
        },
      },
    })
  })

  it('verifies recorded draft replace and failed run details through the recomposed drawer', async () => {
    const harness = await createWorkflowHarness({ runtimeMode: 'failure' })

    await createTargetedWorkflowDraft(harness)
    const recordStart = await harness.editor.startRecording()
    harness.recorderAdapter.dispatchInput('replacement@example.com')
    await flushAsyncWork()
    const recordStop = await harness.editor.stopRecording()

    expect(recordStart).toMatchObject({ ok: true })
    expect(recordStop).toMatchObject({ ok: true })
    expect(harness.editor.getSnapshot().draftDocument?.steps).toHaveLength(2)
    expect(recomposedViewFor(harness).recordedDraftReview).toMatchObject({
      summary: '1 source event · valid',
      buttons: {
        replace: {
          disabled: false,
        },
      },
    })

    const replaced = harness.editor.replaceWithRecordedDraft()
    const saved = await harness.editor.saveDraft()

    expect(replaced).toMatchObject({ ok: true })
    expect(saved).toMatchObject({ ok: true })
    expect(harness.saves[0].document.steps).toEqual([
      expect.objectContaining({
        action: 'fill',
        input: 'replacement@example.com',
      }),
    ])
    expect(recomposedViewFor(harness).recordedDraftReview).toBeUndefined()

    const run = await harness.editor.runSelectedScenario()
    await flushAsyncWork()

    expect(run).toMatchObject({
      ok: true,
      value: {
        runId: 'run-workflow',
        status: 'running',
      },
    })
    expect(recomposedViewFor(harness)).toMatchObject({
      scenarioShell: {
        runStatus: 'failed',
      },
      debugDrawer: {
        expanded: false,
        activeView: 'failure',
        attention: true,
        views: {
          failure: {
            message: 'Workflow target missing.',
            eventName: 'workflow:failure',
            details: {
              data: {
                stepId: expect.any(String),
              },
            },
          },
          runTrace: {
            runId: 'run-workflow',
            status: 'failed',
            eventCount: 1,
            latestEventName: 'workflow:failure',
          },
        },
      },
    })
  })
})

type WorkflowHarnessOptions = Readonly<{
  runtimeMode?: 'success' | 'failure'
}>

async function createWorkflowHarness(options: WorkflowHarnessOptions = {}) {
  let now = 1_700_000_000_000
  const routedMessages: ActorbleExtensionMessage[] = []
  const contentMessages: ActorbleExtensionMessage[] = []
  const saves: ScenarioRecordInput[] = []
  const runtimeRuns: ScenarioDocument[] = []
  const records: ScenarioRecord[] = []
  const activeTab = await createActiveTab(FIXTURE_URL)
  const orchestrator = createBackgroundOrchestrator(
    createWxtBackgroundBrowserHost(fakeBrowser),
    { now: () => now },
  )
  let editor: ReturnType<typeof createSidepanelScenarioEditor> | undefined
  let targetPicker: ReturnType<typeof createTargetPicker> | undefined

  async function deliverContentMessage(message: ActorbleExtensionMessage): Promise<unknown> {
    contentMessages.push(message)
    const result = await orchestrator.handleMessage(message, {
      tab: activeTab,
      frameId: 0,
      url: activeTab.url,
    })

    if (message.kind === 'runtime:status' || message.kind === 'trace:event') {
      editor?.ingestMessage(message)
    }

    if (message.kind === 'inspector:selected' || message.kind === 'inspector:cancelled') {
      targetPicker?.ingestMessage(message)
    }

    return result
  }

  const inspectorAdapter = createFixtureInspectorAdapter()
  const contentInspector = createContentInspectorHost({
    adapter: inspectorAdapter,
    sendMessage: deliverContentMessage,
  })
  const contentLocatorPreview = createContentLocatorPreviewHost({
    createActorble: createLocatorPreviewActorble,
  })
  const recorderAdapter = createFixtureRecorderAdapter()
  const contentRecorder = createContentRecorderHost({
    capture: createRecorderEventCapturePort(recorderAdapter, {
      now: () => now + 50,
      flushEvents: createRecordEventFlushSender(deliverContentMessage),
    }),
    now: () => now,
  })
  const contentRuntime = createContentRuntimeHost({
    createActorble(actorbleOptions) {
      return createRuntimeActorble(actorbleOptions, runtimeRuns, {
        mode: options.runtimeMode ?? 'success',
      })
    },
    now: () => now++,
    sendMessage: deliverContentMessage,
  })

  vi.spyOn(fakeBrowser.tabs, 'sendMessage').mockImplementation(async (tabId, message, options) => {
    const extensionMessage = message as ActorbleExtensionMessage
    routedMessages.push(extensionMessage)

    switch (extensionMessage.kind) {
      case 'content:ready':
        return ok({
          tabId: extensionMessage.payload.tabId ?? tabId,
          frameId: extensionMessage.payload.frameId ?? options?.frameId,
          url: FIXTURE_URL,
          topFrame: (extensionMessage.payload.frameId ?? options?.frameId) === 0,
          capabilities: {
            runtime: true,
            recorder: true,
            inspector: true,
            locatorPreview: true,
            frameCorrelation: true,
          },
        })
      case 'inspector:start':
      case 'inspector:stop':
        return contentInspector.handleMessage(extensionMessage)
      case 'locator:preview':
        return contentLocatorPreview.handleMessage(extensionMessage)
      case 'record:start':
      case 'record:stop':
        return contentRecorder.handleMessage(extensionMessage)
      case 'scenario:run':
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
        return contentRuntime.handleMessage(extensionMessage)
      case 'scenario:validate':
      case 'scenario:compile':
      case 'record:event':
      case 'record:draft:get':
      case 'inspector:selected':
      case 'inspector:cancelled':
      case 'trace:event':
      case 'runtime:status':
      case 'popup:get-state':
        throw new Error(`${extensionMessage.kind} should not be routed to content in this harness.`)
    }
  })

  const client: SidepanelScenarioEditorClient = {
    async listScenarios() {
      return ok(records)
    },
    async saveScenario(input) {
      saves.push(input)
      const record = scenarioRecord(
        input.id ?? input.document.id ?? 'workflow-scenario',
        input.name ?? input.document.name ?? 'Workflow verification',
        input.document,
      )
      records.unshift(record)
      return ok(record)
    },
    async updateScenario(id, update) {
      const index = records.findIndex((record) => record.id === id)
      if (index < 0) {
        throw new Error(`Missing scenario record ${id}.`)
      }

      const current = records[index]
      const record = {
        ...current,
        name: update.name ?? current.name,
        document: update.document ?? current.document,
        updatedAt: '2026-06-18T00:01:00.000Z',
      } satisfies ScenarioRecord
      records[index] = record
      return ok(record)
    },
    async importScenarioJson() {
      throw new Error('Import is not part of the workflow verification harness.')
    },
    async exportScenarioJson(id) {
      const record = records.find((candidate) => candidate.id === id)
      if (record === undefined) {
        throw new Error(`Missing scenario record ${id}.`)
      }

      return ok({
        id: record.id,
        filename: `${record.id}.json`,
        jsonText: `${JSON.stringify(record.document, null, 2)}\n`,
        document: record.document,
      } satisfies ScenarioJsonExport)
    },
    async getActiveTab() {
      return activeTab
    },
    async getTab(tabId) {
      return tabId === activeTab.id ? activeTab : null
    },
    sendMessage(message) {
      return orchestrator.handleMessage(message)
    },
  }
  editor = createSidepanelScenarioEditor(client, {
    createRunId: () => 'run-workflow',
    createDryRunId: () => 'dry-run-workflow',
    createRecordId: () => 'record-workflow',
    createStepId: (family) => `workflow-${family}`,
    targetTabId: activeTab.id,
  })
  const pickerClient = {
    async getActiveTab() {
      return activeTab
    },
    async getTab(tabId: number) {
      return tabId === activeTab.id ? activeTab : null
    },
    sendMessage(message: ActorbleExtensionMessage) {
      return orchestrator.handleMessage(message)
    },
  }
  targetPicker = createTargetPicker(pickerClient, {
    createSessionId: () => 'inspect-workflow',
    targetTabId: activeTab.id,
  })
  const locatorPreviewer = createLocatorPreviewer(pickerClient, {
    targetTabId: activeTab.id,
  })

  return {
    activeTab,
    editor,
    targetPicker,
    locatorPreviewer,
    inspectorAdapter,
    recorderAdapter,
    routedMessages,
    contentMessages,
    saves,
    runtimeRuns,
  }
}

type WorkflowHarness = Awaited<ReturnType<typeof createWorkflowHarness>>

function recomposedViewFor(harness: WorkflowHarness) {
  return createSidepanelRecompositionViewModel({
    editor: harness.editor.getSnapshot(),
    targetPicker: harness.targetPicker.getSnapshot(),
    locatorPreview: harness.locatorPreviewer.getSnapshot(),
  })
}

function expectRecomposedPrimarySurfaces(
  view: ReturnType<typeof recomposedViewFor>,
): void {
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
}

async function createTargetedWorkflowDraft(harness: WorkflowHarness): Promise<void> {
  await harness.editor.refresh()
  expect(harness.editor.createScenario({
    id: 'workflow-scenario',
    name: 'Workflow verification',
    initialStepFamily: 'delay',
  })).toMatchObject({ ok: true })
  harness.editor.updateDocumentFields({
    name: 'Workflow verification edited',
    description: 'End-to-end recomposed flow',
  })
  expect(harness.editor.addStep('click')).toMatchObject({ ok: true })

  await harness.targetPicker.start({
    scenarioId: 'workflow-scenario',
    targetSlot: harness.editor.getSnapshot().selectedTargetSlot,
  })
  harness.inspectorAdapter.dispatchPointerMove(220, 122)
  harness.inspectorAdapter.dispatchClick(220, 122)
  await flushAsyncWork()

  const selected = harness.targetPicker.getSnapshot().selected
  if (selected === undefined) {
    throw new Error('Expected a selected target.')
  }

  await harness.locatorPreviewer.previewTarget(selected.target, {
    scenarioId: selected.scenarioId,
    targetSlot: selected.targetSlot,
  })
  const candidate = harness.locatorPreviewer.getSnapshot().candidates.find(
    (locatorCandidate) => locatorCandidate.strategy === 'testId',
  )

  if (candidate === undefined || selected.targetSlot === undefined) {
    throw new Error('Expected a selectable testId candidate.')
  }

  expect(harness.editor.applyLocatorToTargetSlot(
    selected.targetSlot,
    candidate.locator,
  )).toMatchObject({ ok: true })
}

type ActiveFixtureTab = Readonly<{
  id: number
  active: true
  url: string
}> & Awaited<ReturnType<typeof fakeBrowser.tabs.create>>

async function createActiveTab(url: string): Promise<ActiveFixtureTab> {
  const created = await fakeBrowser.tabs.create({ url })
  if (created.id === undefined) {
    throw new Error('Expected fake tab id.')
  }

  const activeTab = {
    ...created,
    id: created.id,
    active: true,
    url,
  } satisfies ActiveFixtureTab

  vi.spyOn(fakeBrowser.tabs, 'query').mockImplementation(async (queryInfo) => {
    if (queryInfo.active === true && queryInfo.currentWindow === true) {
      return [activeTab]
    }

    return []
  })

  return activeTab
}

function scenarioRecord(
  id: string,
  name: string,
  document: ScenarioDocument,
): ScenarioRecord {
  return {
    id,
    name,
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    document,
    createdAt: '2026-06-18T00:00:00.000Z',
    updatedAt: '2026-06-18T00:00:00.000Z',
  }
}

type FixtureElement = 'submit' | 'email'

const submitTarget = {
  tagName: 'button',
  id: 'submit',
  role: 'button',
  ariaLabel: 'Sign in',
  testId: 'submit-button',
  text: 'Sign in',
  frameUrl: FIXTURE_URL,
  rect: {
    x: 180,
    y: 96,
    width: 120,
    height: 48,
  },
} satisfies InspectorTargetMetadata

const emailTarget = {
  tagName: 'input',
  id: 'email',
  role: 'textbox',
  labelText: 'Email',
  testId: 'email-input',
  inputType: 'email',
  name: 'email',
  frameUrl: FIXTURE_URL,
  rect: {
    x: 24,
    y: 96,
    width: 140,
    height: 32,
  },
} as const

function createFixtureInspectorAdapter() {
  const highlight = vi.fn((_rect: InspectorTargetMetadata['rect']) => {})
  const clearHighlight = vi.fn(() => {})
  let pointerMove: ((event: ContentInspectorPointerEvent) => void) | undefined
  let click: ((event: ContentInspectorPointerEvent) => void) | undefined

  return {
    onPointerMove(listener) {
      pointerMove = listener
      return () => {}
    },
    onClick(listener) {
      click = listener
      return () => {}
    },
    onKeydown() {
      return () => {}
    },
    onPagehide() {
      return () => {}
    },
    elementFromPoint() {
      return 'submit'
    },
    describeElement() {
      return submitTarget
    },
    highlight,
    clearHighlight,
    dispatchPointerMove(clientX: number, clientY: number) {
      pointerMove?.(pointerEvent(clientX, clientY))
    },
    dispatchClick(clientX: number, clientY: number) {
      const event = pointerEvent(clientX, clientY)
      click?.(event)
      return event
    },
  } satisfies ContentInspectorAdapter<FixtureElement> & {
    highlight: typeof highlight
    clearHighlight: typeof clearHighlight
    dispatchPointerMove(clientX: number, clientY: number): void
    dispatchClick(clientX: number, clientY: number): ContentInspectorPointerEvent
  }
}

function createFixtureRecorderAdapter() {
  const element = 'email' satisfies FixtureElement
  let value = ''
  let input: ((event: RecorderTextEvent<FixtureElement>) => void) | undefined

  return {
    onClick() {
      return () => {}
    },
    onInput(listener) {
      input = listener
      return () => {}
    },
    onChange() {
      return () => {}
    },
    onPointerDown() {
      return () => {}
    },
    onPointerMove() {
      return () => {}
    },
    onPointerUp() {
      return () => {}
    },
    onSelectionChange() {
      return () => {}
    },
    onDragStart() {
      return () => {}
    },
    onDrop() {
      return () => {}
    },
    onPagehide() {
      return () => {}
    },
    describeElement() {
      return emailTarget
    },
    readElementValue() {
      return value
    },
    readSelection() {
      return {
        selectedText: '',
      }
    },
    sensitiveInputReason() {
      return null
    },
    dispatchInput(nextValue: string) {
      value = nextValue
      input?.({ target: element })
    },
  } satisfies RecorderEventCaptureAdapter<FixtureElement> & {
    dispatchInput(nextValue: string): void
  }
}

function createLocatorPreviewActorble(): ContentLocatorPreviewActorble {
  return {
    resolveAll: vi.fn(async (locator: Readonly<{ kind: string; value?: string }>) => {
      if (locator.kind === 'testId' && locator.value === 'submit-button') {
        return [{ id: 'submit' }]
      }

      return []
    }) as unknown as ContentLocatorPreviewActorble['resolveAll'],
    destroy: vi.fn(),
  }
}

function createRuntimeActorble(
  options: ActorbleFacadeOptions,
  runtimeRuns: ScenarioDocument[],
  runtimeOptions: Readonly<{ mode: 'success' | 'failure' }>,
): ContentActorbleFacade {
  const trace = options.trace as TraceCollector | undefined

  const actorble = {
    run: vi.fn(async (scenario: ScenarioDocument) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
      runtimeRuns.push(scenario)
      if (runtimeOptions.mode === 'failure') {
        trace?.appendEvent('workflow:failure', {
          stepId: scenario.steps.at(0)?.id,
        })
        throw new Error('Workflow target missing.')
      }

      trace?.appendEvent('workflow:run', {
        stepCount: scenario.steps.length,
      })
    }) as unknown as ContentActorbleFacade['run'],
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    getCapabilities: vi.fn(() => ({
      pointerInput: 'synthetic',
      trustedEvents: false,
    })),
    getFidelity: vi.fn(() => ({
      pointerInput: 'synthetic-dom-events',
      limits: [],
    })),
    getTrace: vi.fn(() => ({
      spans: [],
      events: [],
      snapshots: [],
      warnings: [],
    })),
  }

  return actorble as unknown as ContentActorbleFacade
}

function pointerEvent(
  clientX: number,
  clientY: number,
): ContentInspectorPointerEvent {
  return {
    clientX,
    clientY,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve()
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
  await Promise.resolve()
}
