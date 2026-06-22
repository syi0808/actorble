import { describe, expect, it } from 'vitest'
import browserLoginFlow from '../../schemas/scenario/draft/examples/browser-login-flow.json'
import {
  createExtensionMessage,
  type ActorbleExtensionMessage,
} from '../src/messaging/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
  type ScenarioLocator,
  type ScenarioSelectTextStep,
  type ScenarioTargetTextStep,
} from '../src/scenario/types.js'
import type { ScenarioCodeExport } from '../src/scenario/export-code.js'
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
  it('renders an empty workflow builder session', async () => {
    const { editor } = createTestEditor({ scenarios: [] })

    await editor.refresh()

    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.workflow).toMatchObject({
      status: 'empty',
      dirty: false,
      selectedStepId: undefined,
    })
    expect(view.scenarioOptions).toEqual([])
    expect(view.stepRows).toEqual([])
    expect(view.targetSlotRows).toEqual([])
    expect(view.validationSummary).toBe('No scenario selected')
    expect(view.buttons.create.disabled).toBe(false)
    expect(view.buttons.addStep.disabled).toBe(true)
    expect(view.buttons.run.disabled).toBe(true)
    expect(view.buttons.dryRun.disabled).toBe(true)
  })

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
    expect(view.workflow).toMatchObject({
      status: 'saved',
      dirty: false,
      selectedStepId: 'email',
    })
    expect(view.stepRows[0]).toMatchObject({
      index: 0,
      id: 'email',
      action: 'fill',
      selected: true,
      validationStatus: 'valid',
    })
    expect(view.stepRows[0].targetSummary).toContain('label')
    expect(view.stepRows[0].inputSummary).toContain('user@example.com')
    expect(view.targetSlotRows).toEqual([
      expect.objectContaining({
        id: 'step-target:email',
        label: 'Target',
        selected: true,
      }),
    ])
    expect(view.actionFamilyOptions.some((option) => option.value === 'fill')).toBe(true)
    expect(view.selectedStepFields.actionFamily).toBe('fill')
  })

  it('renders an unsaved dirty draft created through the workflow builder', async () => {
    const { editor } = createTestEditor()
    await editor.refresh()

    const created = editor.createScenario({
      id: 'draft-document',
      name: 'Draft document',
      initialStepFamily: 'click',
    })

    expect(created).toMatchObject({ ok: true })
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.workflow).toMatchObject({
      status: 'draft',
      dirty: true,
      selectedStepId: 'step-1',
    })
    expect(view.documentFields.name).toBe('Draft document')
    expect(view.stepRows).toEqual([
      expect.objectContaining({
        id: 'step-1',
        action: 'click',
        selected: true,
        validationStatus: 'invalid',
      }),
    ])
    expect(view.validationSummary).toBe('1 issue')
    expect(view.buttons.save.disabled).toBe(false)
    expect(view.buttons.addStep.disabled).toBe(false)
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
    expect(view.targetSlotRows[0]).toMatchObject({
      id: 'step-target:0',
      selected: true,
      validationStatus: 'valid',
    })
  })

  it('reorders workflow steps by step id and selects the moved step', async () => {
    const stepIds = ['first-step', 'second-step', 'third-step']
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => stepIds.shift() ?? 'extra-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'sortable-draft',
      name: 'Sortable draft',
      initialStepFamily: 'delay',
    })
    editor.addStep('fill')
    editor.addStep('click')

    const reordered = editor.reorderStep('third-step', 0)

    expect(reordered).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      selectedStepId: 'third-step',
      selectedStepIndex: 0,
    })
    expect(editor.getSnapshot().draftDocument?.steps.map((step) => step.id)).toEqual([
      'third-step',
      'first-step',
      'second-step',
    ])
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.stepRows.map((row) => row.id)).toEqual([
      'third-step',
      'first-step',
      'second-step',
    ])
    expect(view.stepRows[0]).toMatchObject({
      id: 'third-step',
      selected: true,
    })
  })

  it('reorders imported workflow steps from view ids when steps do not have ids', async () => {
    const idlessScenario = scenarioRecord('idless-scenario', 'Idless scenario', '2026-06-17T00:04:00.000Z', {
      schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
      id: 'idless-scenario',
      name: 'Idless scenario',
      steps: [
        {
          action: 'delay',
          duration: 50,
        },
        {
          action: 'type',
          input: 'hello',
        },
      ],
    } as ScenarioDocument)
    const { editor } = createTestEditor({ scenarios: [idlessScenario] })
    await editor.refresh()

    const initialView = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(initialView.stepRows.map((row) => row.id)).toEqual(['0', '1'])

    const reordered = editor.reorderStep('1', 0)

    expect(reordered).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps.map((step) => step.action)).toEqual([
      'type',
      'delay',
    ])
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(view.stepRows[0]).toMatchObject({
      id: '0',
      action: 'type',
      selected: true,
    })
  })

  it('renders pending run state from the workflow session', async () => {
    const { editor } = createTestEditor({
      sendResponse() {
        return new Promise<ExtensionResult<unknown>>((resolve) => {
          setTimeout(() => resolve(ok({ contentReady: true })), 0)
        })
      },
    })
    await editor.refresh()

    const operation = editor.runSelectedScenario()
    const pendingView = createSidepanelScenarioEditorView(editor.getSnapshot())

    expect(pendingView.workflow.status).toBe('running')
    expect(pendingView.buttons.run).toMatchObject({
      disabled: true,
      pending: true,
    })
    expect(pendingView.buttons.save.disabled).toBe(true)

    await operation
  })

  it('loads target tab readiness for the scenario shell lifecycle controls', async () => {
    const { editor, sent } = createTestEditor({
      targetTabId: 7,
      sendResponse(message) {
        if (message.kind === 'popup:get-state') {
          return ok({
            kind: 'popup:state',
            activeTab: {
              ready: true,
              tabId: 7,
              frameId: 0,
              url: 'http://localhost:3000/login',
            },
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    const readiness = await editor.refreshTargetTabState()
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())

    expect(readiness).toMatchObject({
      ok: true,
      value: {
        status: 'ready',
        tabId: 7,
        frameId: 0,
      },
    })
    expect(sent.at(-1)).toEqual(createExtensionMessage({
      kind: 'popup:get-state',
      payload: {
        tabId: 7,
        scenarioId: 'newest-scenario',
      },
    }))
    expect(view.targetTab).toMatchObject({
      status: 'ready',
      tone: 'ready',
      summary: 'Tab ready',
      tabId: 7,
      url: 'http://localhost:3000/login',
    })
    expect(view.buttons.run.disabled).toBe(false)
    expect(view.buttons.record.disabled).toBe(false)
  })

  it('keeps run and record disabled when target tab readiness is blocked', async () => {
    const { editor } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'popup:get-state') {
          return ok({
            kind: 'popup:state',
            activeTab: {
              ready: false,
              issue: {
                code: 'permission_denied',
                message: 'Actorble does not have permission for https://example.test.',
              },
            },
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    const readiness = await editor.refreshTargetTabState()
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())

    expect(readiness).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'permission_denied',
        },
      ],
    })
    expect(view.targetTab).toMatchObject({
      status: 'blocked',
      tone: 'blocked',
      summary: 'Actorble does not have permission for https://example.test.',
    })
    expect(view.buttons.run.disabled).toBe(true)
    expect(view.buttons.record.disabled).toBe(true)
    expect(view.buttons.save.disabled).toBe(false)
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

  it('writes locator preview selections into the correlated target slot', async () => {
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
    editor.selectTargetSlot('drag-from:slot-step')
    editor.applyLocatorToSelectedStep({
      strategy: 'testId',
      value: 'drag-source',
    })

    const assigned = editor.applyLocatorToTargetSlot({
      kind: 'drag-to',
      stepId: 'slot-step',
    }, {
      strategy: 'testId',
      value: 'drop-zone',
    })

    expect(assigned).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      selectedTargetSlot: {
        kind: 'drag-to',
        stepId: 'slot-step',
      },
      draftDocument: {
        steps: [
          {
            action: 'drag',
            from: {
              kind: 'target',
              strict: true,
              locators: [
                {
                  strategy: 'testId',
                  value: 'drag-source',
                },
              ],
            },
            to: {
              kind: 'target',
              strict: true,
              locators: [
                {
                  strategy: 'testId',
                  value: 'drop-zone',
                },
              ],
            },
          },
        ],
      },
    })
  })

  it('writes auto-applied inspector targets with browser metadata into the correlated target slot', async () => {
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => 'slot-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'slot-document',
      name: 'Slot document',
      initialStepFamily: 'click',
    })

    const assigned = editor.applyTargetToTargetSlot({
      kind: 'step-target',
      stepId: 'slot-step',
    }, {
      kind: 'target',
      strict: true,
      locators: [
        {
          strategy: 'role',
          role: 'button',
          name: {
            value: 'Save',
            match: 'exact',
          },
          matchIndex: 1,
        },
      ],
      platform: {
        'actorble.browser': {
          inspector: {
            documentOrderIndex: 18,
            candidateId: 'role-1',
            selectedMatchIndex: 1,
          },
        },
      },
    })

    expect(assigned).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps[0]).toMatchObject({
      action: 'click',
      target: {
        kind: 'target',
        strict: true,
        locators: [
          {
            strategy: 'role',
            role: 'button',
            matchIndex: 1,
          },
        ],
        platform: {
          'actorble.browser': {
            inspector: {
              documentOrderIndex: 18,
              candidateId: 'role-1',
              selectedMatchIndex: 1,
            },
          },
        },
      },
    })
  })

  it('writes locator selections into every action-specific target assignment slot and refreshes validation', async () => {
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => 'slot-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'slot-document',
      name: 'Slot document',
      initialStepFamily: 'click',
    })

    const stepTarget = editor.applyLocatorToTargetSlot({
      kind: 'step-target',
      stepId: 'slot-step',
    }, testIdLocator('primary-target'))
    editor.updateSelectedStepActionFamily('drag')
    const dragFrom = editor.applyLocatorToTargetSlot({
      kind: 'drag-from',
      stepId: 'slot-step',
    }, testIdLocator('drag-source'))
    const afterDragFrom = editor.getSnapshot()
    const dragTo = editor.applyLocatorToTargetSlot({
      kind: 'drag-to',
      stepId: 'slot-step',
    }, testIdLocator('drop-zone'))
    editor.updateSelectedStepActionFamily('waitForVisible')
    const waitTarget = editor.applyLocatorToTargetSlot({
      kind: 'waitFor-target',
      stepId: 'slot-step',
    }, testIdLocator('wait-target'))
    editor.updateSelectedStepActionFamily('scrollToTarget')
    const scrollTarget = editor.applyLocatorToTargetSlot({
      kind: 'scrollTo-target',
      stepId: 'slot-step',
    }, testIdLocator('scroll-target'))

    expect(stepTarget).toMatchObject({ ok: true })
    expect(dragFrom).toMatchObject({
      ok: false,
      issues: [
        {
          path: ['steps', 0, 'to', 'locators'],
        },
      ],
    })
    expect(afterDragFrom.draftDocument?.steps[0]).toMatchObject({
      action: 'drag',
      from: targetWithTestId('drag-source'),
    })
    expect(dragTo).toMatchObject({ ok: true })
    expect(waitTarget).toMatchObject({ ok: true })
    expect(scrollTarget).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      issues: [],
      selectedTargetSlot: {
        kind: 'scrollTo-target',
        stepId: 'slot-step',
      },
      draftDocument: {
        steps: [
          {
            action: 'scrollTo',
            target: targetWithTestId('scroll-target'),
          },
        ],
      },
    })
  })

  it('renders target slots for every writable target-bearing action and none for targetless actions', async () => {
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

    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).targetSlotRows).toEqual([
      expect.objectContaining({ id: 'drag-from:slot-step', selected: true }),
      expect.objectContaining({ id: 'drag-to:slot-step', selected: false }),
    ])

    editor.updateSelectedStepActionFamily('waitForVisible')
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).targetSlotRows).toEqual([
      expect.objectContaining({ id: 'waitFor-target:slot-step', selected: true }),
    ])

    editor.updateSelectedStepActionFamily('scrollToTarget')
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).targetSlotRows).toEqual([
      expect.objectContaining({ id: 'scrollTo-target:slot-step', selected: true }),
    ])

    editor.updateSelectedStepActionFamily('selectText')
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).targetSlotRows).toEqual([
      expect.objectContaining({
        id: 'step-target:slot-step',
        label: 'Target',
        selected: true,
      }),
    ])

    editor.updateSelectedStepFields({
      targetJson: JSON.stringify({
        anchor: {
          target: {
            kind: 'target',
            strict: true,
            locators: [],
          },
          offset: 1,
        },
        focus: {
          target: {
            kind: 'target',
            strict: true,
            locators: [],
          },
          offset: 5,
        },
      }),
    })
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).targetSlotRows).toEqual([
      expect.objectContaining({
        id: 'selection-anchor:slot-step',
        label: 'Selection anchor',
        selected: true,
        validationStatus: 'invalid',
      }),
      expect.objectContaining({
        id: 'selection-focus:slot-step',
        label: 'Selection focus',
        selected: false,
        validationStatus: 'invalid',
      }),
    ])

    editor.updateSelectedStepActionFamily('waitForText')
    const targetlessView = createSidepanelScenarioEditorView(editor.getSnapshot())

    expect(targetlessView.targetSlotRows).toEqual([])
    expect(targetlessView.workflow.selectedTargetSlotId).toBeUndefined()
  })

  it('renders selected-step structured controls and writes action-specific fields', async () => {
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => 'structured-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'structured-document',
      name: 'Structured document',
      initialStepFamily: 'waitForText',
    })

    const waitTextView = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(waitTextView.selectedStepFields).toMatchObject({
      actionFamily: 'waitForText',
      waitText: '',
      controls: {
        waitText: true,
        scrollPosition: false,
        textInput: false,
        duration: false,
        targetSlots: false,
      },
    })

    const waitTextUpdate = editor.updateSelectedStepFields({
      waitText: 'Welcome back',
    })
    expect(waitTextUpdate).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps[0]).toMatchObject({
      action: 'waitFor',
      input: {
        kind: 'text',
        value: 'Welcome back',
      },
    })

    editor.updateSelectedStepActionFamily('scrollToPosition')
    const scrollView = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(scrollView.selectedStepFields).toMatchObject({
      actionFamily: 'scrollToPosition',
      scrollX: '0',
      scrollY: '0',
      scrollCoordinateSpace: 'document',
      controls: {
        waitText: false,
        scrollPosition: true,
        textInput: false,
        duration: false,
        targetSlots: false,
      },
    })

    const scrollUpdate = editor.updateSelectedStepFields({
      scrollX: '25',
      scrollY: '40',
      scrollCoordinateSpace: 'viewport',
    })
    expect(scrollUpdate).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps[0]).toMatchObject({
      action: 'scrollTo',
      input: {
        x: 25,
        y: 40,
        coordinateSpace: 'viewport',
      },
    })

    editor.updateSelectedStepActionFamily('fill')
    const fillView = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(fillView.selectedStepFields.controls).toMatchObject({
      textInput: true,
      duration: false,
      waitText: false,
      scrollPosition: false,
      targetSlots: true,
    })

    editor.updateSelectedStepActionFamily('selectText')
    const selectTextView = createSidepanelScenarioEditorView(editor.getSnapshot())
    expect(selectTextView.actionFamilyOptions).toEqual(
      expect.arrayContaining([
        {
          value: 'selectText',
          label: 'Select text',
        },
      ]),
    )
    expect(selectTextView.selectedStepFields).toMatchObject({
      actionFamily: 'selectText',
      controls: {
        textInput: false,
        duration: true,
        waitText: false,
        scrollPosition: false,
        targetSlots: true,
      },
    })
  })

  it('keeps advanced JSON repair available for direct field updates', async () => {
    const { editor } = createTestEditor({
      scenarios: [],
      createStepId: () => 'repair-step',
    })
    await editor.refresh()
    editor.createScenario({
      id: 'repair-document',
      name: 'Repair document',
      initialStepFamily: 'click',
    })

    const repaired = editor.updateSelectedStepFields({
      targetJson: JSON.stringify({
        strategy: 'testId',
        value: 'primary-action',
      }),
      optionsJson: JSON.stringify({
        timeout: 2500,
      }),
    })

    expect(repaired).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps[0]).toMatchObject({
      action: 'click',
      target: {
        strategy: 'testId',
        value: 'primary-action',
      },
      options: {
        timeout: 2500,
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

  it('exports the selected draft as TypeScript without using JSON storage export', async () => {
    const { editor, exports } = createTestEditor()
    await editor.refresh()

    const result = editor.exportSelectedCode()

    expect(result).toMatchObject({
      ok: true,
      value: {
        filename: 'browser-login-flow.actorble.ts',
      },
    } satisfies ExtensionResult<Partial<ScenarioCodeExport>>)
    if (result.ok) {
      expect(result.value.source).toContain("export const scenario: Scenario =")
      expect(result.value.source).toContain("await actorble.run(scenario, runOptions)")
    }
    expect(exports).toEqual([])
  })

  it('surfaces TypeScript export errors on the editor snapshot', async () => {
    const unsupported = scenarioRecord(
      'unsupported-export',
      'Unsupported export',
      '2026-06-17T00:03:00.000Z',
      {
        schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
        id: 'unsupported-export',
        name: 'Unsupported export',
        platform: { browser: { capability: 'future' } },
        steps: [{ action: 'delay', duration: 1 }],
      },
    )
    const { editor } = createTestEditor({ scenarios: [unsupported] })
    await editor.refresh()

    const result = editor.exportSelectedCode()

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_platform_extension',
          path: ['platform'],
        },
      ],
    })
    expect(editor.getSnapshot().issues).toEqual(result.ok ? [] : result.issues)
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

  it('uses resolved frame correlation from the background run receipt', async () => {
    const { editor, sent } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'scenario:run') {
          return ok({
            kind: 'scenario:run',
            tabId: message.payload.tabId,
            frameId: 0,
            scenarioId: message.payload.scenarioId,
            runId: message.payload.runId,
            contentReady: true,
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    const result = await editor.runSelectedScenario()
    const acceptedStatus = editor.ingestMessage(
      createExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-1',
          status: 'completed',
        },
      }),
    )

    expect(sent[0]).toMatchObject({
      kind: 'scenario:run',
      payload: {
        tabId: 7,
        scenarioId: 'newest-scenario',
      },
    })
    expect(sent[0].payload).not.toHaveProperty('frameId')
    expect(result).toMatchObject({
      ok: true,
      value: {
        frameId: 0,
      },
    })
    expect(acceptedStatus).toBe(true)
  })

  it('starts and stops recording, then reviews the returned draft without overwriting the current scenario', async () => {
    const { editor, sent, saves, exports } = createTestEditor({
      createRecordId: () => 'record-sidepanel-1',
      sendResponse(message) {
        if (message.kind === 'record:start') {
          return ok(commandReceiptForRecord(message, 'recording'))
        }

        if (message.kind === 'record:stop') {
          return ok({
            ...commandReceiptForRecord(message, 'stopped'),
            recordedDraft: recordedDraft(message.payload.runId ?? 'record-sidepanel-1'),
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()
    const beforeRecording = editor.getSnapshot().draftDocument

    const start = await editor.startRecording()
    const stop = await editor.stopRecording()
    const snapshot = editor.getSnapshot()
    const view = createSidepanelScenarioEditorView(snapshot)
    const exported = editor.exportRecordedDraft()
    const replaced = editor.replaceWithRecordedDraft()

    expect(start).toMatchObject({
      ok: true,
      value: {
        runId: 'record-sidepanel-1',
        status: 'recording',
      },
    })
    expect(stop).toMatchObject({
      ok: true,
      value: {
        runId: 'record-sidepanel-1',
        status: 'stopped',
      },
    })
    expect(sent).toEqual([
      createExtensionMessage({
        kind: 'record:start',
          payload: {
            tabId: 7,
            scenarioId: 'newest-scenario',
            runId: 'record-sidepanel-1',
          },
      }),
      createExtensionMessage({
        kind: 'record:stop',
          payload: {
            tabId: 7,
            scenarioId: 'newest-scenario',
            runId: 'record-sidepanel-1',
          },
      }),
    ])
    expect(snapshot).toMatchObject({
      selectedScenarioId: 'newest-scenario',
      issues: [],
      message: 'Recorded draft ready for review',
      draftDocument: beforeRecording,
      recordedDraftReview: {
        draftId: 'record-sidepanel-1',
        sourceEventCount: 1,
        validationStatus: 'valid',
        sensitiveInputCount: 0,
        document: {
          id: 'recorded-record-sidepanel-1',
          name: 'Recorded scenario record-sidepanel-1',
          steps: [
            {
              id: 'recorded-step-1',
              action: 'fill',
              input: 'user@example.com',
            },
          ],
        },
      },
    })
    expect(view.recordedDraftReview).toMatchObject({
      summary: '1 source event · valid',
      buttons: {
        replace: { disabled: false },
        append: { disabled: false },
        saveAsNew: { disabled: false },
        export: { disabled: false },
      },
    })
    expect(exported).toMatchObject({
      ok: true,
      value: {
        id: 'recorded-record-sidepanel-1',
        filename: 'recorded-record-sidepanel-1.json',
      },
    })
    expect(replaced).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: undefined,
      recordedDraftReview: undefined,
      draftDocument: {
        id: 'recorded-record-sidepanel-1',
        name: 'Recorded scenario record-sidepanel-1',
        steps: [
          {
            id: 'recorded-step-1',
            action: 'fill',
            input: 'user@example.com',
          },
        ],
      },
    })
    const saved = await editor.saveDraft()
    expect(saved).toMatchObject({
      ok: true,
      value: {
        id: 'recorded-record-sidepanel-1',
        name: 'Recorded scenario record-sidepanel-1',
      },
    })
    expect(exports).toEqual([])
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({
      name: 'Recorded scenario record-sidepanel-1',
      document: {
        id: 'recorded-record-sidepanel-1',
      },
    })
  })

  it('appends or discards a reviewed recorded draft by explicit user action', async () => {
    const { editor, updates } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedDraft('record-popup-1'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()
    const originalStepCount = editor.getSnapshot().draftDocument?.steps.length ?? 0

    await editor.loadRecordedDraft('record-popup-1')
    const discarded = editor.discardRecordedDraft()
    await editor.loadRecordedDraft('record-popup-1')
    const appended = editor.appendRecordedDraftSteps()
    const saved = await editor.saveDraft()

    expect(discarded).toMatchObject({ ok: true })
    expect(appended).toMatchObject({ ok: true })
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: 'newest-scenario',
      dirty: false,
      recordedDraftReview: undefined,
    })
    expect(editor.getSnapshot().draftDocument?.steps).toHaveLength(originalStepCount + 1)
    expect(editor.getSnapshot().draftDocument?.steps.at(-1)).toMatchObject({
      id: 'recorded-step-1',
      action: 'fill',
      input: 'user@example.com',
    })
    expect(saved).toMatchObject({
      ok: true,
      value: {
        id: 'newest-scenario',
      },
    })
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('newest-scenario')
    expect(updates[0].update.document?.steps).toHaveLength(originalStepCount + 1)
  })

  it('reviews, exports, appends, replaces, and discards recorded selectText drafts', async () => {
    const { editor, updates } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedSelectTextDraft('record-selection-1'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()
    const originalStepCount = editor.getSnapshot().draftDocument?.steps.length ?? 0

    await editor.loadRecordedDraft('record-selection-1')
    const view = createSidepanelScenarioEditorView(editor.getSnapshot())
    const exported = editor.exportRecordedDraft()
    const appended = editor.appendRecordedDraftSteps()
    const saved = await editor.saveDraft()

    expect(view.recordedDraftReview).toMatchObject({
      summary: '1 source event · valid',
      buttons: {
        append: { disabled: false },
        replace: { disabled: false },
        export: { disabled: false },
      },
    })
    expect(exported).toMatchObject({
      ok: true,
      value: {
        document: {
          steps: [
            {
              action: 'selectText',
            },
          ],
        },
      },
    })
    expect(appended).toMatchObject({ ok: true })
    expect(saved).toMatchObject({ ok: true })
    expect(updates[0].update.document?.steps).toHaveLength(originalStepCount + 1)
    expect(updates[0].update.document?.steps.at(-1)).toMatchObject({
      id: 'recorded-select-text',
      action: 'selectText',
      target: {
        strategy: 'testId',
        value: 'copy-block',
      },
    })
    expect(JSON.stringify(updates[0].update.document)).not.toContain('selectedTextWarnings')

    await editor.loadRecordedDraft('record-selection-1')
    const discarded = editor.discardRecordedDraft()
    await editor.loadRecordedDraft('record-selection-1')
    const replaced = editor.replaceWithRecordedDraft()

    expect(discarded).toMatchObject({ ok: true })
    expect(replaced).toMatchObject({ ok: true })
    expect(editor.getSnapshot().draftDocument?.steps).toEqual([
      expect.objectContaining({
        id: 'recorded-select-text',
        action: 'selectText',
      }),
    ])
  })

  it('saves a reviewed recorded draft as a new scenario without replacing the current draft first', async () => {
    const { editor, saves } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedDraft('record-popup-1'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    await editor.loadRecordedDraft('record-popup-1')
    const saved = await editor.saveRecordedDraftAsNew()

    expect(saved).toMatchObject({
      ok: true,
      value: {
        id: 'recorded-record-popup-1',
        name: 'Recorded scenario record-popup-1',
      },
    })
    expect(saves).toHaveLength(1)
    expect(saves[0]).toMatchObject({
      name: 'Recorded scenario record-popup-1',
      document: {
        id: 'recorded-record-popup-1',
      },
    })
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: 'recorded-record-popup-1',
      dirty: false,
      recordedDraftReview: undefined,
    })
  })

  it('requires visible confirmation before saving sensitive recorded input', async () => {
    const { editor, saves } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedDraft('record-sensitive-1', {
            input: '[masked]',
            note: 'Sensitive input was masked during recording (password_type); confirm the value before saving.',
          }))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    await editor.loadRecordedDraft('record-sensitive-1')
    const initialView = createSidepanelScenarioEditorView(editor.getSnapshot())
    const blocked = await editor.saveRecordedDraftAsNew()
    const replaceBlocked = editor.replaceWithRecordedDraft()
    editor.confirmRecordedDraftSensitiveInputs(true)
    const saved = await editor.saveRecordedDraftAsNew()

    expect(initialView.recordedDraftReview).toMatchObject({
      sensitiveSummary: '1 sensitive input requires confirmation',
      buttons: {
        saveAsNew: { disabled: true },
      },
    })
    expect(blocked).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'Confirm sensitive recorded inputs before saving the recorded draft.',
        },
      ],
    })
    expect(replaceBlocked).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
        },
      ],
    })
    expect(saved).toMatchObject({ ok: true })
    expect(saves).toHaveLength(1)
    expect(editor.getSnapshot().recordedDraftReview).toBeUndefined()
  })

  it('requires confirmation for sensitive selected text warnings without storing them in documents', async () => {
    const { editor, saves } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok({
            ...recordedSelectTextDraft('record-selection-sensitive-1'),
            selectedTextWarnings: [
              {
                stepId: 'recorded-select-text',
                reason: 'secret_like_field',
                message: 'Selected text may contain sensitive content.',
                requiresConfirmation: true,
              },
            ],
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    await editor.loadRecordedDraft('record-selection-sensitive-1')
    const initialView = createSidepanelScenarioEditorView(editor.getSnapshot())
    const exportedBlocked = editor.exportRecordedDraft()
    const appendBlocked = editor.appendRecordedDraftSteps()
    editor.confirmRecordedDraftSensitiveInputs(true)
    const saved = await editor.saveRecordedDraftAsNew()

    expect(initialView.recordedDraftReview).toMatchObject({
      sensitiveSummary: '1 sensitive selection requires confirmation',
      buttons: {
        append: { disabled: true },
        export: { disabled: true },
        saveAsNew: { disabled: true },
      },
    })
    expect(exportedBlocked).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'recorder_error',
          message: 'Confirm sensitive recorded inputs before saving the recorded draft.',
        }),
      ],
    })
    expect(appendBlocked).toMatchObject({
      ok: false,
      issues: [
        expect.objectContaining({
          code: 'recorder_error',
        }),
      ],
    })
    expect(saved).toMatchObject({ ok: true })
    expect(saves).toHaveLength(1)
    expect(JSON.stringify(saves[0].document)).not.toContain('selectedTextWarnings')
    expect(JSON.stringify(saves[0].document)).not.toContain(
      'Selected text may contain sensitive content',
    )
  })

  it('loads a cached recorder draft by handoff id for review', async () => {
    const { editor, sent } = createTestEditor({
      sendResponse(message) {
        if (message.kind === 'record:draft:get') {
          return ok(recordedDraft('record-popup-1'))
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()

    const loaded = await editor.loadRecordedDraft('record-popup-1')

    expect(loaded).toMatchObject({
      ok: true,
      value: {
        draftId: 'record-popup-1',
      },
    })
    expect(sent).toEqual([
      createExtensionMessage({
        kind: 'record:draft:get',
        payload: {
          draftId: 'record-popup-1',
          scenarioId: 'newest-scenario',
        },
      }),
    ])
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: 'newest-scenario',
      recordedDraftReview: {
        draftId: 'record-popup-1',
        sourceEventCount: 1,
        validationStatus: 'valid',
        document: {
          id: 'recorded-record-popup-1',
          steps: [
            {
              action: 'fill',
            },
          ],
        },
      },
    })
  })

  it('surfaces empty recording stops without replacing the current draft', async () => {
    const { editor } = createTestEditor({
      createRecordId: () => 'record-sidepanel-1',
      sendResponse(message) {
        if (message.kind === 'record:start') {
          return ok(commandReceiptForRecord(message, 'recording'))
        }

        if (message.kind === 'record:stop') {
          return ok({
            ...commandReceiptForRecord(message, 'stopped'),
            emptyRecording: {
              sessionId: message.payload.runId ?? 'record-sidepanel-1',
              tabId: message.payload.tabId,
              frameId: message.payload.frameId,
              scenarioId: message.payload.scenarioId,
              runId: message.payload.runId,
              sourceEventCount: 0,
              createdAt: 1_700_000_000_000,
              message: 'No browser events were recorded.',
            },
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()
    const before = editor.getSnapshot().draftDocument

    await editor.startRecording()
    const stop = await editor.stopRecording()

    expect(stop).toMatchObject({
      ok: true,
      value: {
        emptyRecording: {
          sourceEventCount: 0,
          message: 'No browser events were recorded.',
        },
      },
    })
    expect(editor.getSnapshot()).toMatchObject({
      selectedScenarioId: 'newest-scenario',
      draftDocument: before,
      message: 'No browser events were recorded.',
      currentRecord: {
        status: 'stopped',
      },
    })
  })

  it('surfaces recorder draft validation failures from stop responses', async () => {
    const { editor } = createTestEditor({
      createRecordId: () => 'record-sidepanel-1',
      sendResponse(message) {
        if (message.kind === 'record:start') {
          return ok(commandReceiptForRecord(message, 'recording'))
        }

        if (message.kind === 'record:stop') {
          return failure({
            code: 'invalid_document',
            message: 'Recorded draft is invalid.',
            path: ['steps', 0, 'input'],
          })
        }

        return ok({ contentReady: true })
      },
    })
    await editor.refresh()
    await editor.startRecording()

    const result = await editor.stopRecording()

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'invalid_document',
          message: 'Recorded draft is invalid.',
          path: ['steps', 0, 'input'],
        },
      ],
    })
    expect(createSidepanelScenarioEditorView(editor.getSnapshot()).validationSummary).toBe(
      '1 issue',
    )
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
  createRecordId?: () => string
  createStepId?: () => string
  targetTabId?: number
  sendResponse?:
    | ExtensionResult<unknown>
    | Promise<ExtensionResult<unknown>>
    | ((message: ActorbleExtensionMessage) => ExtensionResult<unknown> | Promise<ExtensionResult<unknown>>)
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
    ...(options.targetTabId === undefined ? {} : { targetTabId: options.targetTabId }),
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
    },
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

function recordedSelectTextDraft(draftId: string) {
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
          id: 'recorded-select-text',
          action: 'selectText',
          target: {
            strategy: 'testId',
            value: 'copy-block',
          },
        },
      ],
    } satisfies ScenarioDocument & { steps: readonly ScenarioSelectTextStep[] },
  }
}

function testIdLocator(value: string): ScenarioLocator {
  return {
    strategy: 'testId',
    value,
  }
}

function targetWithTestId(value: string) {
  return {
    kind: 'target',
    strict: true,
    locators: [
      {
        strategy: 'testId',
        value,
      },
    ],
  }
}
