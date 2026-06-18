import {
  addStep as addBuilderStep,
  assignLocatorToTargetSlot,
  clearTargetSlot,
  createScenario as createBuilderScenario,
  createScenarioAuthoringSession,
  deleteStep as deleteBuilderStep,
  duplicateStep as duplicateBuilderStep,
  getValidatedScenarioDocument,
  insertStep as insertBuilderStep,
  listTargetSlotsForStep as listBuilderTargetSlotsForStep,
  markScenarioSaved,
  openDraftDocument,
  reorderStep as reorderBuilderStep,
  selectScenario as selectBuilderScenario,
  selectStep as selectBuilderStep,
  selectTargetSlot as selectBuilderTargetSlot,
  setRecordState,
  setRunState,
  updateDocumentFields as updateBuilderDocumentFields,
  updateStepActionFamily as updateBuilderStepActionFamily,
  updateStepFields as updateBuilderStepFields,
  type BuilderDraftDocument,
  type BuilderDraftStep,
  type BuilderScenarioSource,
  type BuilderStepActionFamily,
  type BuilderStepFieldUpdate,
  type BuilderTargetSlot,
  type CreateScenarioInput,
  type ScenarioAuthoringSessionState,
} from '../../builder/index.js'
import {
  createExtensionMessage,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type ActorbleExtensionMessageByKind,
  type RequiredRunCorrelation,
} from '../../messaging/index.js'
import {
  compileToBrowserRuntime,
  type BrowserRuntimeCompilation,
} from '../../scenario/compile-to-browser-runtime.js'
import {
  exportScenarioToCode,
  type ScenarioCodeExport,
} from '../../scenario/export-code.js'
import {
  documentWithRecordedDraftDefaults,
  type RecordedScenarioDraftHandoff,
} from '../../recorder/workflow.js'
import type {
  ScenarioDocument,
  ScenarioLocator,
  ScenarioStep,
} from '../../scenario/types.js'
import { validateScenarioDocument } from '../../scenario/validate.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../../shared/result.js'
import type {
  ScenarioJsonExport,
  ScenarioRecord,
  ScenarioRecordInput,
  ScenarioRecordUpdate,
} from '../../storage/index.js'
import {
  createTraceDisplayStore,
  type RuntimeRunStatus,
  type RuntimeStatusSnapshot,
  type TraceDisplayState,
  type TraceRunDisplayView,
} from '../../trace/index.js'
import { formatIssuePath } from './imported-scenario-run.js'

export type SidepanelActiveTab = Readonly<{
  id?: number
  url?: string
}>

export type SidepanelPendingAction =
  | 'refresh'
  | 'validate'
  | 'save'
  | 'import'
  | 'export'
  | 'run'
  | 'dry-run'
  | 'record:start'
  | 'record:stop'
  | 'record:draft'

export type SidepanelScenarioRunReceipt = RequiredRunCorrelation &
  Readonly<{
    status: RuntimeRunStatus
  }>

export type SidepanelRecordSession = Readonly<{
  type: 'record'
  sessionId: string
  tabId: number
  frameId?: number
  scenarioId?: string
  runId?: string
  status: 'recording' | 'stopped' | 'failed'
  startedAt: number
  updatedAt: number
  draftId?: string
  message?: string
}>

export type SidepanelRecordCommandReceipt = Readonly<{
  kind: 'record:start' | 'record:stop'
  tabId: number
  frameId?: number
  scenarioId?: string
  runId?: string
  status?: SidepanelRecordSession['status']
  session?: SidepanelRecordSession
  recordedDraft?: RecordedScenarioDraftHandoff
}>

export type SidepanelScenarioEditorSnapshot = Readonly<{
  scenarios: readonly ScenarioRecord[]
  selectedScenarioId?: string
  selectedStepIndex: number
  selectedStepId?: string
  selectedTargetSlot?: BuilderTargetSlot
  draftDocument?: BuilderDraftDocument
  dirty: boolean
  pendingAction: SidepanelPendingAction | null
  issues: readonly ExtensionIssue[]
  currentRun?: SidepanelScenarioRunReceipt
  currentRecord?: SidepanelRecordSession
  trace: TraceDisplayState
  currentTrace: TraceRunDisplayView | undefined
  message?: string
}>

export type SidepanelScenarioEditorClient = Readonly<{
  listScenarios(): Promise<ExtensionResult<readonly ScenarioRecord[]>>
  saveScenario(input: ScenarioRecordInput): Promise<ExtensionResult<ScenarioRecord>>
  updateScenario(
    id: string,
    update: ScenarioRecordUpdate,
  ): Promise<ExtensionResult<ScenarioRecord>>
  importScenarioJson(jsonText: string): Promise<ExtensionResult<ScenarioRecord>>
  exportScenarioJson(id: string): Promise<ExtensionResult<ScenarioJsonExport>>
  getActiveTab(): Promise<SidepanelActiveTab | null>
  getTab?(tabId: number): Promise<SidepanelActiveTab | null>
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>
}>

export type SidepanelScenarioEditorOptions = Readonly<{
  createRunId?: () => string
  createDryRunId?: () => string
  createRecordId?: () => string
  createScenarioId?: () => string
  createStepId?: (family: BuilderStepActionFamily) => string
  frameId?: number
  targetTabId?: number
  now?: () => number
  traceHistoryLimit?: number
  traceRunLimit?: number
}>

export type SidepanelDocumentFieldUpdate = Readonly<{
  name?: string
  description?: string
}>

export type SidepanelStepFieldUpdate = Readonly<{
  note?: string
  input?: string
  duration?: string | number
  optionsJson?: string
  targetJson?: string
  fromJson?: string
  toJson?: string
  inputJson?: string
}>

export type SidepanelStepRowView = Readonly<{
  index: number
  id: string
  action: string
  targetSummary: string
  inputSummary: string
  validationStatus: 'valid' | 'invalid'
  selected: boolean
}>

export type SidepanelIssueView = Readonly<{
  path: string
  message: string
}>

export type SidepanelButtonView = Readonly<{
  label: string
  disabled: boolean
  pending: boolean
}>

export type SidepanelWorkflowView = Readonly<{
  status: 'empty' | 'saved' | 'draft' | 'running' | 'recording'
  dirty: boolean
  selectedStepId?: string
  selectedTargetSlotId?: string
  summary: string
}>

export type SidepanelActionFamilyOptionView = Readonly<{
  value: BuilderStepActionFamily
  label: string
}>

export type SidepanelTargetSlotRowView = Readonly<{
  id: string
  label: string
  summary: string
  selected: boolean
  validationStatus: 'valid' | 'invalid'
}>

export type SidepanelScenarioEditorView = Readonly<{
  workflow: SidepanelWorkflowView
  scenarioOptions: readonly Readonly<{ value: string; label: string }>[]
  selectedScenarioId?: string
  actionFamilyOptions: readonly SidepanelActionFamilyOptionView[]
  documentFields: Readonly<{
    name: string
    description: string
  }>
  stepRows: readonly SidepanelStepRowView[]
  targetSlotRows: readonly SidepanelTargetSlotRowView[]
  selectedStepFields: Readonly<{
    id: string
    action: string
    actionFamily: BuilderStepActionFamily | ''
    note: string
    input: string
    duration: string
    optionsJson: string
    targetJson: string
    fromJson: string
    toJson: string
    inputJson: string
  }>
  issueViews: readonly SidepanelIssueView[]
  validationSummary: string
  runSummary: string
  traceView: TraceRunDisplayView | undefined
  buttons: Readonly<{
    create: SidepanelButtonView
    addStep: SidepanelButtonView
    insertStep: SidepanelButtonView
    duplicateStep: SidepanelButtonView
    deleteStep: SidepanelButtonView
    moveStepUp: SidepanelButtonView
    moveStepDown: SidepanelButtonView
    validate: SidepanelButtonView
    save: SidepanelButtonView
    import: SidepanelButtonView
    export: SidepanelButtonView
    run: SidepanelButtonView
    dryRun: SidepanelButtonView
    record: SidepanelButtonView
  }>
}>

export type SidepanelScenarioEditor = Readonly<{
  refresh(): Promise<ExtensionResult<SidepanelScenarioEditorSnapshot>>
  createScenario(input?: CreateScenarioInput): ExtensionResult<SidepanelScenarioEditorSnapshot>
  selectScenario(id: string): void
  selectStep(index: number): void
  selectTargetSlot(slotId: string): ExtensionResult<SidepanelScenarioEditorSnapshot>
  addStep(family: BuilderStepActionFamily): ExtensionResult<SidepanelScenarioEditorSnapshot>
  insertStep(family: BuilderStepActionFamily): ExtensionResult<SidepanelScenarioEditorSnapshot>
  duplicateSelectedStep(): ExtensionResult<SidepanelScenarioEditorSnapshot>
  deleteSelectedStep(): ExtensionResult<SidepanelScenarioEditorSnapshot>
  moveSelectedStep(delta: -1 | 1): ExtensionResult<SidepanelScenarioEditorSnapshot>
  updateSelectedStepActionFamily(
    family: BuilderStepActionFamily,
  ): ExtensionResult<SidepanelScenarioEditorSnapshot>
  updateDocumentFields(update: SidepanelDocumentFieldUpdate): void
  updateSelectedStepFields(
    update: SidepanelStepFieldUpdate,
  ): ExtensionResult<ScenarioDocument>
  applyLocatorToTargetSlot(
    slot: BuilderTargetSlot,
    locator: ScenarioLocator,
  ): ExtensionResult<ScenarioDocument>
  applyLocatorToSelectedStep(locator: ScenarioLocator): ExtensionResult<ScenarioDocument>
  validateDraft(): ExtensionResult<ScenarioDocument>
  saveDraft(): Promise<ExtensionResult<ScenarioRecord>>
  importJson(jsonText: string): Promise<ExtensionResult<ScenarioRecord>>
  exportSelected(): Promise<ExtensionResult<ScenarioJsonExport>>
  exportSelectedCode(): ExtensionResult<ScenarioCodeExport>
  runSelectedScenario(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>>
  dryRunSelectedStep(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>>
  startRecording(): Promise<ExtensionResult<SidepanelRecordCommandReceipt>>
  stopRecording(): Promise<ExtensionResult<SidepanelRecordCommandReceipt>>
  loadRecordedDraft(draftId?: string): Promise<ExtensionResult<RecordedScenarioDraftHandoff | null>>
  ingestMessage(message: unknown): boolean
  getSnapshot(): SidepanelScenarioEditorSnapshot
}>

let nextRunSequence = 1
let nextDryRunSequence = 1
let nextRecordSequence = 1

export function createSidepanelScenarioEditor(
  client: SidepanelScenarioEditorClient,
  options: SidepanelScenarioEditorOptions = {},
): SidepanelScenarioEditor {
  const createRunId = options.createRunId ?? defaultRunId
  const createDryRunId = options.createDryRunId ?? defaultDryRunId
  const createRecordId = options.createRecordId ?? defaultRecordId
  const createScenarioId = options.createScenarioId
  const createStepId = options.createStepId
  const frameId = options.frameId
  const targetTabId = options.targetTabId
  const now = options.now ?? Date.now
  const traceStore = createTraceDisplayStore({
    historyLimit: options.traceHistoryLimit,
    runLimit: options.traceRunLimit,
  })
  let records: readonly ScenarioRecord[] = []
  let session = createScenarioAuthoringSession({
    scenarios: [],
    ...(createScenarioId === undefined ? {} : { createScenarioId }),
    ...(createStepId === undefined ? {} : { createStepId }),
  })
  let externalIssues: readonly ExtensionIssue[] = []
  let snapshot = emptySnapshot(traceStore.getState())

  async function refresh(): Promise<ExtensionResult<SidepanelScenarioEditorSnapshot>> {
    syncSnapshotFromSession({
      pendingAction: 'refresh',
    })

    const loaded = await loadScenarios(snapshot.selectedScenarioId)
    syncSnapshotFromSession({ pendingAction: null })

    return loaded.ok ? ok(snapshot) : failure(loaded.issues)
  }

  function createScenario(
    input: CreateScenarioInput = {},
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    return applySessionState(createBuilderScenario(session, input), {
      message: undefined,
    })
  }

  function selectScenario(id: string): void {
    const selected = selectBuilderScenario(session, id)
    if (!selected.ok) {
      setExternalIssues(selected.issues, { message: undefined })
      return
    }

    session = withDefaultTargetSlot(selected.value)
    externalIssues = []
    syncSnapshotFromSession({ message: undefined })
  }

  function selectStep(index: number): void {
    const document = session.draftDocument
    const selected = document?.steps[clampStepIndex(index, document.steps.length)]
    if (selected === undefined) {
      setExternalIssues([{
        code: 'invalid_document',
        message: 'Select a step before editing.',
        path: ['steps'],
      }], { message: undefined })
      return
    }

    applySessionState(selectBuilderStep(session, stepIdFor(selected, index)), {
      message: undefined,
    })
  }

  function selectTargetSlot(
    slotId: string,
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    const slot = targetSlotFromViewId(session, slotId)
    if (slot === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: `Target slot "${slotId}" is not available for the selected step.`,
      })
    }

    return applySessionState(selectBuilderTargetSlot(session, slot), {
      message: undefined,
    })
  }

  function addStep(
    family: BuilderStepActionFamily,
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    return applySessionState(addBuilderStep(session, family), { message: undefined })
  }

  function insertStep(
    family: BuilderStepActionFamily,
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    return applySessionState(
      insertBuilderStep(session, snapshot.selectedStepIndex + 1, family),
      { message: undefined },
    )
  }

  function duplicateSelectedStep(): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    const stepId = session.selectedStepId
    if (stepId === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before duplicating.',
        path: ['steps'],
      })
    }

    return applySessionState(duplicateBuilderStep(session, stepId), { message: undefined })
  }

  function deleteSelectedStep(): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    const stepId = session.selectedStepId
    if (stepId === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before deleting.',
        path: ['steps'],
      })
    }

    return applySessionState(deleteBuilderStep(session, stepId), { message: undefined })
  }

  function moveSelectedStep(delta: -1 | 1): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    const stepId = session.selectedStepId
    if (stepId === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before moving.',
        path: ['steps'],
      })
    }

    return applySessionState(
      reorderBuilderStep(session, stepId, snapshot.selectedStepIndex + delta),
      { message: undefined },
    )
  }

  function updateSelectedStepActionFamily(
    family: BuilderStepActionFamily,
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    const stepId = session.selectedStepId
    if (stepId === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before changing the action.',
        path: ['steps'],
      })
    }

    return applySessionState(updateBuilderStepActionFamily(session, stepId, family), {
      message: undefined,
    })
  }

  function updateDocumentFields(update: SidepanelDocumentFieldUpdate): void {
    if (session.draftDocument === undefined) {
      return
    }

    const updated = updateBuilderDocumentFields(session, {
      ...(update.name === undefined ? {} : { name: nullableString(update.name) }),
      ...(update.description === undefined ? {} : { description: nullableString(update.description) }),
    })
    applySessionState(updated, { message: undefined })
  }

  function updateSelectedStepFields(
    update: SidepanelStepFieldUpdate,
  ): ExtensionResult<ScenarioDocument> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before editing a step.',
      })
    }

    const stepId = session.selectedStepId
    const index = selectedStepIndexForSession(session)
    const step = session.draftDocument.steps[index]
    if (stepId === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before editing.',
        path: ['steps'],
      })
    }
    if (step === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before editing.',
        path: ['steps'],
      })
    }

    const fieldUpdate = stepFieldUpdateFromInput(step, index, update)
    if (!fieldUpdate.ok) {
      setExternalIssues(fieldUpdate.issues, { message: undefined })
      return failure(fieldUpdate.issues)
    }

    const updated = updateBuilderStepFields(session, stepId, fieldUpdate.value)
    if (!updated.ok) {
      setExternalIssues(updated.issues, { message: undefined })
      return failure(updated.issues)
    }

    session = withDefaultTargetSlot(updated.value)
    externalIssues = []
    syncSnapshotFromSession({ message: undefined })

    return scenarioDocumentResultFromSession()
  }

  function applyLocatorToSelectedStep(
    locator: ScenarioLocator,
  ): ExtensionResult<ScenarioDocument> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before applying a locator.',
      })
    }

    const slotReady = ensureSelectedTargetSlot(session)
    session = slotReady
    const slot = session.selectedTargetSlot
    if (slot === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a target slot before applying a locator.',
      })
    }

    return applyLocatorToTargetSlot(slot, locator)
  }

  function applyLocatorToTargetSlot(
    slot: BuilderTargetSlot,
    locator: ScenarioLocator,
  ): ExtensionResult<ScenarioDocument> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before applying a locator.',
      })
    }

    const assigned = assignLocatorToTargetSlot(session, slot, locator)
    if (!assigned.ok) {
      setExternalIssues(assigned.issues, { message: undefined })
      return failure(assigned.issues)
    }

    session = withDefaultTargetSlot(assigned.value)
    externalIssues = []
    syncSnapshotFromSession({ message: 'Locator applied' })

    return scenarioDocumentResultFromSession()
  }

  function validateDraft(): ExtensionResult<ScenarioDocument> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before validating.',
      })
    }

    syncSnapshotFromSession({
      pendingAction: 'validate',
      message: undefined,
    })
    const validation = getValidatedScenarioDocument(session)
    externalIssues = validation.ok ? [] : validation.issues
    syncSnapshotFromSession({
      pendingAction: null,
      message: undefined,
    })

    return validation
  }

  async function saveDraft(): Promise<ExtensionResult<ScenarioRecord>> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before saving.',
      })
    }

    syncSnapshotFromSession({
      pendingAction: 'save',
      message: undefined,
    })

    const validation = getValidatedScenarioDocument(session)
    if (!validation.ok) {
      externalIssues = validation.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return validation
    }

    const selectedId = session.selectedScenarioId
    const name = validation.value.name ?? selectedRecord(snapshot)?.name
    const result =
      selectedId === undefined
        ? await client.saveScenario({
            name,
            document: validation.value,
          })
        : await client.updateScenario(selectedId, {
            name,
            document: validation.value,
          })

    if (!result.ok) {
      externalIssues = result.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return result
    }

    replaceScenario(result.value)
    session = withDefaultTargetSlot(markScenarioSaved(session, sourceFromRecord(result.value)))
    externalIssues = []
    syncSnapshotFromSession({
      pendingAction: null,
      message: 'Saved',
    })

    return result
  }

  async function importJson(jsonText: string): Promise<ExtensionResult<ScenarioRecord>> {
    syncSnapshotFromSession({
      pendingAction: 'import',
      message: undefined,
    })

    const imported = await client.importScenarioJson(jsonText)
    if (!imported.ok) {
      externalIssues = imported.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return imported
    }

    const loaded = await loadScenarios(imported.value.id)
    syncSnapshotFromSession({
      pendingAction: null,
      message: 'Imported',
    })

    return loaded.ok ? imported : failure(loaded.issues)
  }

  async function exportSelected(): Promise<ExtensionResult<ScenarioJsonExport>> {
    const selectedId = session.selectedScenarioId
    if (selectedId === undefined || session.dirty) {
      if (session.draftDocument === undefined) {
        return setIssue({
          code: 'storage_error',
          message: 'Select a scenario before exporting.',
        })
      }

      const validation = getValidatedScenarioDocument(session)
      externalIssues = validation.ok ? [] : validation.issues
      syncSnapshotFromSession({
        pendingAction: null,
        message: validation.ok ? 'Exported' : undefined,
      })

      if (!validation.ok) {
        return validation
      }

      const id = validation.value.id ?? 'draft-scenario'
      return ok({
        id,
        filename: `${filenameBase(id)}.json`,
        jsonText: `${JSON.stringify(validation.value, null, 2)}\n`,
        document: validation.value,
      })
    }

    syncSnapshotFromSession({
      pendingAction: 'export',
      message: undefined,
    })

    const exported = await client.exportScenarioJson(selectedId)
    externalIssues = exported.ok ? [] : exported.issues
    syncSnapshotFromSession({
      pendingAction: null,
      message: exported.ok ? 'Exported' : undefined,
    })

    return exported
  }

  function exportSelectedCode(): ExtensionResult<ScenarioCodeExport> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before exporting TypeScript.',
      })
    }

    const validation = getValidatedScenarioDocument(session)
    if (!validation.ok) {
      externalIssues = validation.issues
      syncSnapshotFromSession({
        pendingAction: null,
        message: undefined,
      })
      return failure(validation.issues)
    }

    const exported = exportScenarioToCode(validation.value)
    externalIssues = exported.ok ? [] : exported.issues
    syncSnapshotFromSession({
      pendingAction: null,
      message: exported.ok ? 'Exported TypeScript' : undefined,
    })

    return exported
  }

  async function runSelectedScenario(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before running.',
      })
    }

    const validation = getValidatedScenarioDocument(session)
    if (!validation.ok) {
      externalIssues = validation.issues
      syncSnapshotFromSession({ pendingAction: null, message: undefined })
      return validation
    }

    return dispatchScenarioRun(validation.value, createRunId(), 'run')
  }

  async function dryRunSelectedStep(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    if (session.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before running a step.',
      })
    }

    const step = session.draftDocument.steps[selectedStepIndexForSession(session)]
    if (step === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before running it.',
        path: ['steps'],
      })
    }

    return dispatchScenarioRun(
      {
        ...session.draftDocument,
        steps: [step as ScenarioStep],
      },
      createDryRunId(),
      'dry-run',
    )
  }

  async function startRecording(): Promise<ExtensionResult<SidepanelRecordCommandReceipt>> {
    if (snapshot.currentRun !== undefined && isActiveRunStatus(snapshot.currentRun.status)) {
      return setIssue({
        code: 'recorder_error',
        message: 'Stop the active run before recording.',
      })
    }

    if (snapshot.currentRecord?.status === 'recording') {
      return setIssue({
        code: 'recorder_error',
        message: 'A recorder session is already active.',
      })
    }

    const target = await resolveRunTargetTab(client, targetTabId)
    if (!target.ok) {
      externalIssues = target.issues
      syncSnapshotFromSession({
        message: undefined,
      })
      return target
    }

    return dispatchRecordCommand(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: target.value.id,
          ...(frameId === undefined ? {} : { frameId }),
          ...(snapshot.selectedScenarioId === undefined ? {} : { scenarioId: snapshot.selectedScenarioId }),
          runId: createRecordId(),
        },
      }),
      'record:start',
      'Record start command',
    )
  }

  async function stopRecording(): Promise<ExtensionResult<SidepanelRecordCommandReceipt>> {
    const record = snapshot.currentRecord
    if (record === undefined || record.status !== 'recording') {
      return setIssue({
        code: 'recorder_error',
        message: 'No active recording is available to stop.',
      })
    }

    return dispatchRecordCommand(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: record.tabId,
          ...(record.frameId === undefined ? {} : { frameId: record.frameId }),
          ...(record.scenarioId === undefined ? {} : { scenarioId: record.scenarioId }),
          ...(record.runId === undefined ? {} : { runId: record.runId }),
        },
      }),
      'record:stop',
      'Record stop command',
    )
  }

  async function loadRecordedDraft(
    draftId?: string,
  ): Promise<ExtensionResult<RecordedScenarioDraftHandoff | null>> {
    syncSnapshotFromSession({
      pendingAction: 'record:draft',
      message: undefined,
    })

    const target = draftId === undefined
      ? await resolveRunTargetTab(client, targetTabId)
      : undefined
    if (target !== undefined && !target.ok) {
      externalIssues = target.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return target
    }

    const message = createExtensionMessage({
      kind: 'record:draft:get',
      payload: {
        ...(draftId === undefined ? {} : { draftId }),
        ...(target?.ok ? { tabId: target.value.id, ...(frameId === undefined ? {} : { frameId }) } : {}),
        ...(snapshot.selectedScenarioId === undefined ? {} : { scenarioId: snapshot.selectedScenarioId }),
      },
    })

    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      return setIssue({
        code: 'recorder_error',
        message: `Recorded draft could not be loaded: ${describeUnknownError(error)}`,
      })
    }

    const responseResult = readExtensionResult(response)
    if (responseResult === null) {
      return setIssue({
        code: 'unsupported_message',
        message: 'Recorded draft response was not understood.',
      })
    }

    if (!responseResult.ok) {
      externalIssues = responseResult.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return responseResult as ExtensionResult<RecordedScenarioDraftHandoff | null>
    }

    const draft = responseResult.value as RecordedScenarioDraftHandoff | null
    if (draft !== null) {
      const applied = applyRecordedDraft(draft)
      if (!applied.ok) {
        return failure(applied.issues)
      }
    } else {
      externalIssues = []
      syncSnapshotFromSession({
        pendingAction: null,
      })
    }

    return ok(draft)
  }

  function ingestMessage(message: unknown): boolean {
    if (snapshot.currentRun === undefined || !isActorbleExtensionMessage(message)) {
      return false
    }

    if (message.kind === 'runtime:status' && matchesCurrentRun(snapshot.currentRun, message.payload)) {
      traceStore.ingestStatus(statusSnapshotFrom(
        message.payload,
        message.payload.status,
        now(),
        message.payload.message,
      ))
      const currentRun = {
        tabId: message.payload.tabId,
        frameId: message.payload.frameId,
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        status: message.payload.status,
      } satisfies SidepanelScenarioRunReceipt
      const builderStatus = builderRunStatus(currentRun.status)
      session = builderStatus === undefined
        ? setRunState(session, undefined)
        : setRunState(session, {
            runId: currentRun.runId,
            scenarioId: currentRun.scenarioId,
            status: builderStatus,
            ...(message.payload.message === undefined ? {} : { message: message.payload.message }),
          })
      syncSnapshotFromSession({
        currentRun: {
          tabId: message.payload.tabId,
          frameId: message.payload.frameId,
          scenarioId: message.payload.scenarioId,
          runId: message.payload.runId,
          status: message.payload.status,
        },
        message: message.payload.message,
        ...traceFields(),
      })
      return true
    }

    if (message.kind === 'trace:event' && matchesCurrentRun(snapshot.currentRun, message.payload)) {
      traceStore.ingestEvent(message.payload.event)
      syncSnapshotFromSession({
        ...traceFields(),
      })
      return true
    }

    return false
  }

  function getSnapshot(): SidepanelScenarioEditorSnapshot {
    return snapshot
  }

  async function loadScenarios(
    preferredSelection: string | undefined,
  ): Promise<ExtensionResult<readonly ScenarioRecord[]>> {
    const scenarios = await client.listScenarios()
    if (!scenarios.ok) {
      records = []
      session = createEmptySession(createScenarioId, createStepId)
      externalIssues = scenarios.issues
      syncSnapshotFromSession()
      return scenarios
    }

    records = scenarios.value
    const selectedId = selectDefaultScenarioId(scenarios.value, preferredSelection)
    session = withDefaultTargetSlot(createScenarioAuthoringSession({
      scenarios: scenarios.value.map(sourceFromRecord),
      ...(selectedId === undefined ? {} : { selectedScenarioId: selectedId }),
      ...(createScenarioId === undefined ? {} : { createScenarioId }),
      ...(createStepId === undefined ? {} : { createStepId }),
    }))
    externalIssues = []
    syncSnapshotFromSession()

    return scenarios
  }

  async function dispatchRecordCommand(
    message: Extract<ActorbleExtensionMessage, Readonly<{ kind: 'record:start' | 'record:stop' }>>,
    pendingAction: 'record:start' | 'record:stop',
    label: string,
  ): Promise<ExtensionResult<SidepanelRecordCommandReceipt>> {
    syncSnapshotFromSession({
      pendingAction,
      message: undefined,
    })

    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      return setIssue({
        code: 'content_not_ready',
        message: `${label} could not be delivered: ${describeUnknownError(error)}`,
      })
    }

    const responseResult = readExtensionResult(response)
    if (responseResult === null) {
      return setIssue({
        code: 'unsupported_message',
        message: `${label} returned an unsupported response.`,
      })
    }

    if (!responseResult.ok) {
      externalIssues = responseResult.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return responseResult as ExtensionResult<SidepanelRecordCommandReceipt>
    }

    const receipt = responseResult.value as SidepanelRecordCommandReceipt
    applyRecordReceipt(receipt)

    if (receipt.recordedDraft !== undefined) {
      const applied = applyRecordedDraft(receipt.recordedDraft)
      if (!applied.ok) {
        return failure(applied.issues)
      }
    } else {
      externalIssues = []
      syncSnapshotFromSession({
        pendingAction: null,
        message: receipt.kind === 'record:start' ? 'Recording' : snapshot.message,
      })
    }

    return ok(receipt)
  }

  async function dispatchScenarioRun(
    document: ScenarioDocument,
    runId: string,
    pendingAction: 'run' | 'dry-run',
  ): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    syncSnapshotFromSession({
      pendingAction,
      message: undefined,
      currentTrace: undefined,
    })

    const validation = validateScenarioDocument(document)
    if (!validation.ok) {
      externalIssues = validation.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return validation
    }

    const compilation = compileToBrowserRuntime(validation.value)
    if (!compilation.ok) {
      externalIssues = compilation.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return compilation
    }

    const target = await resolveRunTargetTab(client, targetTabId)
    if (!target.ok) {
      externalIssues = target.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return target
    }

    const scenarioId = session.selectedScenarioId ?? validation.value.id ?? 'draft-scenario'
    const correlation = {
      tabId: target.value.id,
      ...(frameId === undefined ? {} : { frameId }),
      scenarioId,
      runId,
    } satisfies RequiredRunCorrelation
    const message = createRunMessage(correlation, compilation.value)

    let response: unknown
    try {
      response = await client.sendMessage(message)
    } catch (error) {
      return setIssue({
        code: 'content_not_ready',
        message: `Run command could not be delivered: ${describeUnknownError(error)}`,
      })
    }

    const responseResult = readExtensionResult(response)
    if (responseResult !== null && !responseResult.ok) {
      externalIssues = responseResult.issues
      syncSnapshotFromSession({
        pendingAction: null,
      })
      return failure(responseResult.issues)
    }

    const resolvedCorrelation = correlationFromReceipt(correlation, responseResult?.value)
    const receipt = {
      ...resolvedCorrelation,
      status: 'running',
    } satisfies SidepanelScenarioRunReceipt
    traceStore.startRun(statusSnapshotFrom(resolvedCorrelation, 'running', now()))
    session = setRunState(session, {
      runId: receipt.runId,
      scenarioId: receipt.scenarioId,
      status: receipt.status,
    })
    externalIssues = []
    syncSnapshotFromSession({
      pendingAction: null,
      currentRun: receipt,
      ...traceFields(),
    })
    return ok(receipt)
  }

  function setIssue<TValue>(issue: ExtensionIssue): ExtensionResult<TValue> {
    setExternalIssues([issue], {
      pendingAction: null,
      message: undefined,
    })
    return failure(issue)
  }

  function applyRecordReceipt(receipt: SidepanelRecordCommandReceipt): void {
    const record = receipt.session ?? {
      type: 'record',
      sessionId: receipt.runId ?? `${receipt.tabId}:${receipt.frameId ?? 0}`,
      tabId: receipt.tabId,
      ...(receipt.frameId === undefined ? {} : { frameId: receipt.frameId }),
      ...(receipt.scenarioId === undefined ? {} : { scenarioId: receipt.scenarioId }),
      ...(receipt.runId === undefined ? {} : { runId: receipt.runId }),
      status: receipt.status ?? (receipt.kind === 'record:start' ? 'recording' : 'stopped'),
      startedAt: now(),
      updatedAt: now(),
    } satisfies SidepanelRecordSession

    setRecordStateInSession(record)
  }

  function applyRecordedDraft(
    draft: RecordedScenarioDraftHandoff,
  ): ExtensionResult<ScenarioDocument> {
    const document = documentWithRecordedDraftDefaults(draft)
    const validation = validateScenarioDocument(document)
    const currentRecord = snapshot.currentRecord ?? {
      type: 'record',
      sessionId: draft.sessionId,
      tabId: draft.tabId,
      ...(draft.frameId === undefined ? {} : { frameId: draft.frameId }),
      ...(draft.scenarioId === undefined ? {} : { scenarioId: draft.scenarioId }),
      ...(draft.runId === undefined ? {} : { runId: draft.runId }),
      status: 'stopped',
      startedAt: draft.createdAt,
      updatedAt: draft.createdAt,
    } satisfies SidepanelRecordSession

    const nextRecord = {
      ...currentRecord,
      status: validation.ok ? 'stopped' : 'failed',
      draftId: draft.draftId,
      updatedAt: draft.createdAt,
    } satisfies SidepanelRecordSession

    session = withDefaultTargetSlot(openDraftDocument(
      setRecordState(session, recordStateForSession(nextRecord)),
      (validation.ok ? validation.value : document) as BuilderDraftDocument,
      { dirty: true },
    ))
    externalIssues = validation.ok ? [] : validation.issues
    syncSnapshotFromSession({
      currentRecord: nextRecord,
      pendingAction: null,
      message: validation.ok ? 'Recorded draft ready' : undefined,
    })

    return validation
  }

  function replaceScenario(record: ScenarioRecord): void {
    const exists = records.some((scenario) => scenario.id === record.id)
    records = exists
      ? records.map((scenario) => (scenario.id === record.id ? record : scenario))
      : [record, ...records]
  }

  function traceFields(): Pick<SidepanelScenarioEditorSnapshot, 'trace' | 'currentTrace'> {
    return {
      trace: traceStore.getState(),
      currentTrace: traceStore.getCurrentView(),
    }
  }

  function applySessionState(
    result: ExtensionResult<ScenarioAuthoringSessionState>,
    patch: Partial<SidepanelScenarioEditorSnapshot> = {},
  ): ExtensionResult<SidepanelScenarioEditorSnapshot> {
    if (!result.ok) {
      setExternalIssues(result.issues, patch)
      return failure(result.issues)
    }

    session = withDefaultTargetSlot(result.value)
    externalIssues = []
    syncSnapshotFromSession(patch)
    return ok(snapshot)
  }

  function setExternalIssues(
    issues: readonly ExtensionIssue[],
    patch: Partial<SidepanelScenarioEditorSnapshot> = {},
  ): void {
    externalIssues = issues
    syncSnapshotFromSession(patch)
  }

  function syncSnapshotFromSession(
    patch: Partial<SidepanelScenarioEditorSnapshot> = {},
  ): void {
    const selectedStepIndex = selectedStepIndexForSession(session)
    snapshot = {
      ...snapshot,
      scenarios: records,
      selectedScenarioId: session.selectedScenarioId,
      selectedStepIndex,
      selectedStepId: session.selectedStepId,
      selectedTargetSlot: session.selectedTargetSlot,
      draftDocument: session.draftDocument,
      dirty: session.dirty,
      issues: externalIssues.length === 0 ? session.issues : externalIssues,
      trace: traceStore.getState(),
      currentTrace: traceStore.getCurrentView(),
      ...patch,
    }
  }

  function scenarioDocumentResultFromSession(): ExtensionResult<ScenarioDocument> {
    const validation = getValidatedScenarioDocument(session)
    if (!validation.ok) {
      externalIssues = validation.issues
      syncSnapshotFromSession()
      return validation
    }

    externalIssues = []
    syncSnapshotFromSession()
    return validation
  }

  function withDefaultTargetSlot(
    state: ScenarioAuthoringSessionState,
  ): ScenarioAuthoringSessionState {
    return ensureSelectedTargetSlot(state)
  }

  function ensureSelectedTargetSlot(
    state: ScenarioAuthoringSessionState,
  ): ScenarioAuthoringSessionState {
    const step = selectedBuilderStep(state)
    if (step === undefined || state.selectedStepId === undefined) {
      return state.selectedTargetSlot === undefined ? state : clearTargetSlot(state)
    }

    const slots = targetSlotsForStep(step, state.selectedStepId)
    if (slots.length === 0) {
      return state.selectedTargetSlot === undefined ? state : clearTargetSlot(state)
    }

    if (
      state.selectedTargetSlot !== undefined &&
      slots.some((slot) => slotsEqual(slot, state.selectedTargetSlot))
    ) {
      return state
    }

    const selected = selectBuilderTargetSlot(state, slots[0])
    return selected.ok ? selected.value : state
  }

  function setRecordStateInSession(record: SidepanelRecordSession): void {
    session = setRecordState(session, recordStateForSession(record))
    syncSnapshotFromSession({
      currentRecord: record,
    })
  }

  return {
    refresh,
    createScenario,
    selectScenario,
    selectStep,
    selectTargetSlot,
    addStep,
    insertStep,
    duplicateSelectedStep,
    deleteSelectedStep,
    moveSelectedStep,
    updateSelectedStepActionFamily,
    updateDocumentFields,
    updateSelectedStepFields,
    applyLocatorToTargetSlot,
    applyLocatorToSelectedStep,
    validateDraft,
    saveDraft,
    importJson,
    exportSelected,
    exportSelectedCode,
    runSelectedScenario,
    dryRunSelectedStep,
    startRecording,
    stopRecording,
    loadRecordedDraft,
    ingestMessage,
    getSnapshot,
  }
}

export function createSidepanelScenarioEditorView(
  snapshot: SidepanelScenarioEditorSnapshot,
): SidepanelScenarioEditorView {
  const anyPending = snapshot.pendingAction !== null
  const hasDocument = snapshot.draftDocument !== undefined
  const step = selectedStep(snapshot)
  const recordActive = snapshot.currentRecord?.status === 'recording'
  const runActive = snapshot.currentRun !== undefined && isActiveRunStatus(snapshot.currentRun.status)
  const hasStep = step !== undefined
  const selectedStepIndex = snapshot.selectedStepIndex

  return {
    workflow: workflowView(snapshot),
    scenarioOptions: snapshot.scenarios.map((scenario) => ({
      value: scenario.id,
      label: scenario.name,
    })),
    selectedScenarioId: snapshot.selectedScenarioId,
    actionFamilyOptions: actionFamilyOptions(),
    documentFields: {
      name: snapshot.draftDocument?.name ?? '',
      description: snapshot.draftDocument?.description ?? '',
    },
    stepRows: stepRows(snapshot),
    targetSlotRows: targetSlotRows(snapshot),
    selectedStepFields: selectedStepFields(step),
    issueViews: snapshot.issues.map((issue) => ({
      path: formatIssuePath(issue.path ?? []),
      message: issue.message,
    })),
    validationSummary: validationSummary(snapshot),
    runSummary: runSummary(snapshot),
    traceView: snapshot.currentTrace,
    buttons: {
      create: {
        label: 'New',
        disabled: anyPending,
        pending: false,
      },
      addStep: {
        label: 'Add step',
        disabled: anyPending || !hasDocument,
        pending: false,
      },
      insertStep: {
        label: 'Insert',
        disabled: anyPending || !hasStep,
        pending: false,
      },
      duplicateStep: {
        label: 'Duplicate',
        disabled: anyPending || !hasStep,
        pending: false,
      },
      deleteStep: {
        label: 'Delete',
        disabled: anyPending || !hasStep,
        pending: false,
      },
      moveStepUp: {
        label: 'Up',
        disabled: anyPending || !hasStep || selectedStepIndex <= 0,
        pending: false,
      },
      moveStepDown: {
        label: 'Down',
        disabled: anyPending || !hasStep ||
          selectedStepIndex >= (snapshot.draftDocument?.steps.length ?? 0) - 1,
        pending: false,
      },
      validate: {
        label: 'Validate',
        disabled: anyPending || !hasDocument,
        pending: snapshot.pendingAction === 'validate',
      },
      save: {
        label: 'Save',
        disabled: anyPending || !hasDocument,
        pending: snapshot.pendingAction === 'save',
      },
      import: {
        label: 'Import',
        disabled: anyPending,
        pending: snapshot.pendingAction === 'import',
      },
      export: {
        label: 'Export',
        disabled: anyPending || !hasDocument,
        pending: snapshot.pendingAction === 'export',
      },
      run: {
        label: 'Run',
        disabled: anyPending || !hasDocument,
        pending: snapshot.pendingAction === 'run',
      },
      dryRun: {
        label: 'Dry run',
        disabled: anyPending || step === undefined,
        pending: snapshot.pendingAction === 'dry-run',
      },
      record: {
        label: recordActive ? 'Stop recording' : 'Record',
        disabled: anyPending || (!recordActive && runActive),
        pending:
          snapshot.pendingAction === 'record:start' ||
          snapshot.pendingAction === 'record:stop',
      },
    },
  }
}

function stepFieldUpdateFromInput(
  step: BuilderDraftStep,
  index: number,
  update: SidepanelStepFieldUpdate,
): ExtensionResult<BuilderStepFieldUpdate> {
  const next: Record<string, unknown> = {}

  if (update.note !== undefined) {
    next.note = nullableString(update.note)
  }

  if (update.input !== undefined && typeof next.input === 'string') {
    next.input = update.input
  } else if (update.input !== undefined && typeof readStepProperty(step, 'input') === 'string') {
    next.input = update.input
  }

  if (update.duration !== undefined) {
    const duration = parseDuration(update.duration)
    if (!duration.ok) {
      return failure({
        ...duration.issues[0],
        path: ['steps', index, 'duration'],
      })
    }
    next.duration = duration.value
  }

  const jsonFields = [
    ['targetJson', 'target'],
    ['fromJson', 'from'],
    ['toJson', 'to'],
    ['inputJson', 'input'],
    ['optionsJson', 'options'],
  ] as const

  for (const [inputKey, stepKey] of jsonFields) {
    const jsonText = update[inputKey]
    if (jsonText === undefined) {
      continue
    }

    const parsed = parseJsonField(jsonText, ['steps', index, stepKey])
    if (!parsed.ok) {
      return parsed
    }

    if (parsed.value === undefined) {
      next[stepKey] = null
    } else {
      next[stepKey] = parsed.value
    }
  }

  return ok(next as BuilderStepFieldUpdate)
}

function stepRows(snapshot: SidepanelScenarioEditorSnapshot): readonly SidepanelStepRowView[] {
  return (snapshot.draftDocument?.steps ?? []).map((step, index) => ({
    index,
    id: stepIdForView(step, index),
    action: step.action,
    targetSummary: targetSummaryForStep(step),
    inputSummary: inputSummaryForStep(step),
    validationStatus: hasIssueAtStep(snapshot.issues, index) ? 'invalid' : 'valid',
    selected: stepIdFor(step, index) === snapshot.selectedStepId,
  }))
}

function selectedStepFields(
  step: BuilderDraftStep | undefined,
): SidepanelScenarioEditorView['selectedStepFields'] {
  if (step === undefined) {
    return {
      id: '',
      action: '',
      actionFamily: '',
      note: '',
      input: '',
      duration: '',
      optionsJson: '',
      targetJson: '',
      fromJson: '',
      toJson: '',
      inputJson: '',
    }
  }

  return {
    id: step.id ?? '',
    action: step.action,
    actionFamily: actionFamilyForStep(step),
    note: step.note ?? '',
    input: typeof readStepProperty(step, 'input') === 'string'
      ? String(readStepProperty(step, 'input'))
      : '',
    duration: typeof readStepProperty(step, 'duration') === 'number'
      ? String(readStepProperty(step, 'duration'))
      : '',
    optionsJson: jsonTextFor(readStepProperty(step, 'options')),
    targetJson: jsonTextFor(readStepProperty(step, 'target')),
    fromJson: jsonTextFor(readStepProperty(step, 'from')),
    toJson: jsonTextFor(readStepProperty(step, 'to')),
    inputJson: typeof readStepProperty(step, 'input') === 'object'
      ? jsonTextFor(readStepProperty(step, 'input'))
      : '',
  }
}

function workflowView(snapshot: SidepanelScenarioEditorSnapshot): SidepanelWorkflowView {
  const status = workflowStatus(snapshot)
  const stepCount = snapshot.draftDocument?.steps.length ?? 0
  const summary = snapshot.draftDocument === undefined
    ? `${snapshot.scenarios.length} saved`
    : `${stepCount} step${stepCount === 1 ? '' : 's'} · ${
        snapshot.dirty ? 'unsaved' : 'saved'
      }`

  return {
    status,
    dirty: snapshot.dirty,
    selectedStepId: snapshot.selectedStepId,
    selectedTargetSlotId: snapshot.selectedTargetSlot === undefined
      ? undefined
      : targetSlotViewId(snapshot.selectedTargetSlot),
    summary,
  }
}

function workflowStatus(
  snapshot: SidepanelScenarioEditorSnapshot,
): SidepanelWorkflowView['status'] {
  if (snapshot.pendingAction === 'run' || snapshot.pendingAction === 'dry-run') {
    return 'running'
  }

  if (snapshot.currentRecord?.status === 'recording') {
    return 'recording'
  }

  if (snapshot.currentRun !== undefined && isActiveRunStatus(snapshot.currentRun.status)) {
    return 'running'
  }

  if (snapshot.draftDocument === undefined) {
    return 'empty'
  }

  return snapshot.dirty || snapshot.selectedScenarioId === undefined ? 'draft' : 'saved'
}

function actionFamilyOptions(): readonly SidepanelActionFamilyOptionView[] {
  return actionFamilies.map((value) => ({
    value,
    label: actionFamilyLabel(value),
  }))
}

function targetSlotRows(
  snapshot: SidepanelScenarioEditorSnapshot,
): readonly SidepanelTargetSlotRowView[] {
  const step = selectedStep(snapshot)
  if (step === undefined || snapshot.selectedStepId === undefined) {
    return []
  }

  return targetSlotsForStep(step, snapshot.selectedStepId).map((slot) => ({
    id: targetSlotViewId(slot),
    label: targetSlotLabel(slot),
    summary: targetSlotSummary(step, slot),
    selected: slotsEqual(slot, snapshot.selectedTargetSlot),
    validationStatus: hasIssueAtTargetSlot(snapshot.issues, snapshot.selectedStepIndex, slot)
      ? 'invalid'
      : 'valid',
  }))
}

const actionFamilies = [
  'click',
  'moveTo',
  'doubleClick',
  'focus',
  'clickCurrent',
  'type',
  'typeInto',
  'fill',
  'press',
  'scrollToTarget',
  'scrollToPosition',
  'drag',
  'waitForVisible',
  'waitForHidden',
  'waitForText',
  'delay',
] as const satisfies readonly BuilderStepActionFamily[]

function actionFamilyLabel(family: BuilderStepActionFamily): string {
  switch (family) {
    case 'clickCurrent':
      return 'Click current'
    case 'typeInto':
      return 'Type into'
    case 'scrollToTarget':
      return 'Scroll to target'
    case 'scrollToPosition':
      return 'Scroll position'
    case 'waitForVisible':
      return 'Wait visible'
    case 'waitForHidden':
      return 'Wait hidden'
    case 'waitForText':
      return 'Wait text'
    default:
      return capitalize(family)
  }
}

function actionFamilyForStep(step: BuilderDraftStep): BuilderStepActionFamily {
  switch (step.action) {
    case 'scrollTo':
      return readStepProperty(step, 'target') === undefined
        ? 'scrollToPosition'
        : 'scrollToTarget'
    case 'waitFor': {
      const input = readStepProperty(step, 'input')
      if (isRecord(input) && input.kind === 'hidden') {
        return 'waitForHidden'
      }
      if (isRecord(input) && input.kind === 'text') {
        return 'waitForText'
      }
      return 'waitForVisible'
    }
    default:
      return step.action
  }
}

function targetSlotsForStep(
  step: BuilderDraftStep,
  stepId: string,
): readonly BuilderTargetSlot[] {
  return listBuilderTargetSlotsForStep(step, stepId)
}

function targetSlotLabel(slot: BuilderTargetSlot): string {
  switch (slot.kind) {
    case 'step-target':
      return 'Target'
    case 'drag-from':
      return 'Drag from'
    case 'drag-to':
      return 'Drag to'
    case 'waitFor-target':
      return 'Wait target'
    case 'scrollTo-target':
      return 'Scroll target'
  }
}

function targetSlotSummary(step: BuilderDraftStep, slot: BuilderTargetSlot): string {
  switch (slot.kind) {
    case 'step-target':
    case 'scrollTo-target':
      return targetSummary(readStepProperty(step, 'target'))
    case 'drag-from':
      return targetSummary(readStepProperty(step, 'from'))
    case 'drag-to':
      return targetSummary(readStepProperty(step, 'to'))
    case 'waitFor-target': {
      const input = readStepProperty(step, 'input')
      return isRecord(input) ? targetSummary(input.target) : 'current'
    }
  }
}

function targetSlotViewId(slot: BuilderTargetSlot): string {
  return `${slot.kind}:${stepIdForViewId(slot.stepId)}`
}

function stepIdForViewId(stepId: string): string {
  return stepId.startsWith('index:') ? stepId.slice('index:'.length) : stepId
}

function targetSlotFromViewId(
  state: ScenarioAuthoringSessionState,
  slotId: string,
): BuilderTargetSlot | undefined {
  const step = selectedBuilderStep(state)
  if (step === undefined || state.selectedStepId === undefined) {
    return undefined
  }

  return targetSlotsForStep(step, state.selectedStepId)
    .find((slot) => targetSlotViewId(slot) === slotId)
}

function slotsEqual(
  left: BuilderTargetSlot,
  right: BuilderTargetSlot | undefined,
): boolean {
  return right !== undefined && left.kind === right.kind && left.stepId === right.stepId
}

function hasIssueAtTargetSlot(
  issues: readonly ExtensionIssue[],
  stepIndex: number,
  slot: BuilderTargetSlot,
): boolean {
  const slotPath = targetSlotPath(slot)
  return issues.some((issue) => (
    issue.path?.[0] === 'steps' &&
    issue.path[1] === stepIndex &&
    slotPath.every((part, index) => issue.path?.[index + 2] === part)
  ))
}

function targetSlotPath(slot: BuilderTargetSlot): readonly string[] {
  switch (slot.kind) {
    case 'step-target':
    case 'scrollTo-target':
      return ['target']
    case 'drag-from':
      return ['from']
    case 'drag-to':
      return ['to']
    case 'waitFor-target':
      return ['input', 'target']
  }
}

function validationSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  if (snapshot.pendingAction === 'validate') {
    return 'Validating'
  }

  if (snapshot.issues.length > 0) {
    return `${snapshot.issues.length} issue${snapshot.issues.length === 1 ? '' : 's'}`
  }

  return snapshot.draftDocument === undefined ? 'No scenario selected' : 'Ready'
}

function runSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  if (snapshot.currentRun !== undefined) {
    return snapshot.currentTrace?.summary ?? `${capitalize(snapshot.currentRun.status)} ${
      snapshot.currentRun.runId
    }`
  }

  return snapshot.message ?? 'No active run'
}

function targetSummaryForStep(step: BuilderDraftStep): string {
  const target = readStepProperty(step, 'target')
  if (target !== undefined) {
    return targetSummary(target)
  }

  const from = readStepProperty(step, 'from')
  const to = readStepProperty(step, 'to')
  if (from !== undefined || to !== undefined) {
    return `from ${targetSummary(from)} to ${targetSummary(to)}`
  }

  const input = readStepProperty(step, 'input')
  if (isRecord(input) && typeof input.kind === 'string' && isRecord(input.target)) {
    return targetSummary(input.target)
  }

  return 'Current context'
}

function inputSummaryForStep(step: BuilderDraftStep): string {
  const input = readStepProperty(step, 'input')
  if (typeof input === 'string') {
    return input
  }

  if (input !== undefined) {
    return compactJson(input)
  }

  const duration = readStepProperty(step, 'duration')
  if (typeof duration === 'number') {
    return `${duration} ms`
  }

  return ''
}

function targetSummary(value: unknown): string {
  if (!isRecord(value)) {
    return value === undefined ? 'current' : String(value)
  }

  if (typeof value.strategy === 'string') {
    const details =
      stringProperty(value, 'selector') ??
      stringProperty(value, 'label') ??
      stringProperty(value, 'role') ??
      stringProperty(value, 'text') ??
      stringProperty(value, 'value') ??
      pointSummary(value.point)
    return details === undefined ? value.strategy : `${value.strategy}: ${details}`
  }

  if (Array.isArray(value.locators)) {
    const description = stringProperty(value, 'description')
    const [first] = value.locators
    const firstSummary = first === undefined ? 'no locators' : targetSummary(first)
    return description === undefined ? firstSummary : `${description}: ${firstSummary}`
  }

  return compactJson(value)
}

function pointSummary(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.x !== 'number' || typeof value.y !== 'number') {
    return undefined
  }

  return `${value.x}, ${value.y}`
}

function compactJson(value: unknown): string {
  return JSON.stringify(value)
}

function filenameBase(value: string): string {
  const baseName = value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')

  return baseName.length === 0 ? 'scenario' : baseName
}

function jsonTextFor(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2)
}

function parseDuration(value: string | number): ExtensionResult<number> {
  const duration = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isFinite(duration)) {
    return failure({
      code: 'invalid_document',
      message: 'Duration must be a number.',
    })
  }

  return ok(duration)
}

function parseJsonField(
  jsonText: string,
  path: readonly (string | number)[],
): ExtensionResult<unknown> {
  if (jsonText.trim().length === 0) {
    return ok(undefined)
  }

  try {
    return ok(JSON.parse(jsonText))
  } catch (error) {
    return failure({
      code: 'invalid_document',
      message: `Field JSON is not valid JSON: ${describeUnknownError(error)}`,
      path,
    })
  }
}

function sourceFromRecord(record: ScenarioRecord): BuilderScenarioSource {
  return {
    id: record.id,
    name: record.name,
    document: record.document,
  }
}

function createEmptySession(
  createScenarioId?: () => string,
  createStepId?: (family: BuilderStepActionFamily) => string,
): ScenarioAuthoringSessionState {
  return createScenarioAuthoringSession({
    scenarios: [],
    ...(createScenarioId === undefined ? {} : { createScenarioId }),
    ...(createStepId === undefined ? {} : { createStepId }),
  })
}

function selectedStepIndexForSession(state: ScenarioAuthoringSessionState): number {
  const document = state.draftDocument
  if (document === undefined || state.selectedStepId === undefined) {
    return 0
  }

  const index = document.steps.findIndex((step, stepIndex) => (
    stepIdFor(step, stepIndex) === state.selectedStepId
  ))

  return index < 0 ? 0 : index
}

function selectedBuilderStep(
  state: ScenarioAuthoringSessionState,
): BuilderDraftStep | undefined {
  return state.draftDocument?.steps[selectedStepIndexForSession(state)]
}

function stepIdFor(step: BuilderDraftStep, index: number): string {
  return step.id ?? `index:${index}`
}

function stepIdForView(step: BuilderDraftStep, index: number): string {
  return step.id ?? String(index)
}

function nullableString(value: string): string | null {
  return value.trim().length === 0 ? null : value
}

function recordStateForSession(record: SidepanelRecordSession) {
  return {
    sessionId: record.sessionId,
    status: record.status,
    ...(record.scenarioId === undefined ? {} : { scenarioId: record.scenarioId }),
    ...(record.draftId === undefined ? {} : { draftId: record.draftId }),
    ...(record.message === undefined ? {} : { message: record.message }),
  }
}

function builderRunStatus(
  status: RuntimeRunStatus,
): 'running' | 'paused' | 'completed' | 'failed' | 'stopped' | undefined {
  return status === 'idle' ? undefined : status
}

async function resolveActiveTab(
  client: Pick<SidepanelScenarioEditorClient, 'getActiveTab'>,
): Promise<ExtensionResult<SidepanelActiveTab & Readonly<{ id: number }>>> {
  let activeTab: SidepanelActiveTab | null

  try {
    activeTab = await client.getActiveTab()
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: 'Active tab lookup failed.',
      details: {
        reason: describeUnknownError(error),
      },
    })
  }

  if (activeTab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: 'No active tab is available.',
    })
  }

  return ok({
    ...activeTab,
    id: activeTab.id,
  })
}

async function resolveRunTargetTab(
  client: Pick<SidepanelScenarioEditorClient, 'getActiveTab' | 'getTab'>,
  targetTabId: number | undefined,
): Promise<ExtensionResult<SidepanelActiveTab & Readonly<{ id: number }>>> {
  if (targetTabId === undefined) {
    return resolveActiveTab(client)
  }

  if (client.getTab === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} cannot be resolved from this panel.`,
      details: { tabId: targetTabId },
    })
  }

  let tab: SidepanelActiveTab | null
  try {
    tab = await client.getTab(targetTabId)
  } catch (error) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} lookup failed.`,
      details: {
        tabId: targetTabId,
        reason: describeUnknownError(error),
      },
    })
  }

  if (tab?.id === undefined) {
    return failure({
      code: 'routing_error',
      message: `Target tab ${targetTabId} was not found.`,
      details: { tabId: targetTabId },
    })
  }

  return ok({
    ...tab,
    id: tab.id,
  })
}

function createRunMessage(
  correlation: RequiredRunCorrelation,
  compilation: BrowserRuntimeCompilation,
): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'scenario:run',
    payload: {
      ...correlation,
      compilation,
    },
  })
}

function emptySnapshot(trace: TraceDisplayState): SidepanelScenarioEditorSnapshot {
  return {
    scenarios: [],
    selectedStepIndex: 0,
    dirty: false,
    pendingAction: null,
    issues: [],
    trace,
    currentTrace: undefined,
  }
}

function selectDefaultScenarioId(
  scenarios: readonly ScenarioRecord[],
  currentSelection: string | undefined,
): string | undefined {
  if (
    currentSelection !== undefined &&
    scenarios.some((scenario) => scenario.id === currentSelection)
  ) {
    return currentSelection
  }

  return scenarios[0]?.id
}

function selectedRecord(
  snapshot: SidepanelScenarioEditorSnapshot,
): ScenarioRecord | undefined {
  return snapshot.scenarios.find((scenario) => scenario.id === snapshot.selectedScenarioId)
}

function selectedStep(snapshot: SidepanelScenarioEditorSnapshot): BuilderDraftStep | undefined {
  return snapshot.draftDocument?.steps[snapshot.selectedStepIndex]
}

function clampStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) {
    return 0
  }

  return Math.max(0, Math.min(index, stepCount - 1))
}

function hasIssueAtStep(issues: readonly ExtensionIssue[], index: number): boolean {
  return issues.some((issue) => issue.path?.[0] === 'steps' && issue.path[1] === index)
}

function readStepProperty(step: BuilderDraftStep, key: string): unknown {
  return (step as unknown as Readonly<Record<string, unknown>>)[key]
}

function stringProperty(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  if (typeof value === 'string') {
    return value
  }

  if (isRecord(value) && typeof value.value === 'string') {
    return value.value
  }

  return undefined
}

function readExtensionResult(value: unknown): ExtensionResult<unknown> | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return null
  }

  if (value.ok === true && 'value' in value) {
    return value as ExtensionResult<unknown>
  }

  if (value.ok === false && Array.isArray(value.issues)) {
    return value as ExtensionResult<unknown>
  }

  return null
}

function matchesCurrentRun(
  currentRun: RequiredRunCorrelation,
  payload:
    | ActorbleExtensionMessageByKind<'runtime:status'>['payload']
    | ActorbleExtensionMessageByKind<'trace:event'>['payload'],
): boolean {
  return (
    payload.tabId === currentRun.tabId &&
    payload.frameId === currentRun.frameId &&
    payload.scenarioId === currentRun.scenarioId &&
    payload.runId === currentRun.runId
  )
}

function correlationFromReceipt(
  fallback: RequiredRunCorrelation,
  value: unknown,
): RequiredRunCorrelation {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    tabId: typeof value.tabId === 'number' ? value.tabId : fallback.tabId,
    ...(typeof value.frameId === 'number' ? { frameId: value.frameId } : optionalFrameId(fallback.frameId)),
    scenarioId: typeof value.scenarioId === 'string' ? value.scenarioId : fallback.scenarioId,
    runId: typeof value.runId === 'string' ? value.runId : fallback.runId,
  }
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
}

function statusSnapshotFrom(
  correlation: RequiredRunCorrelation,
  status: RuntimeRunStatus,
  updatedAt: number,
  message?: string,
): RuntimeStatusSnapshot {
  return {
    runId: correlation.runId,
    scenarioId: correlation.scenarioId,
    status,
    updatedAt,
    ...(message === undefined ? {} : { message }),
  }
}

function isActiveRunStatus(status: RuntimeRunStatus): boolean {
  return status === 'running' || status === 'paused'
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function defaultRunId(): string {
  return `run-${Date.now()}-${nextRunSequence++}`
}

function defaultDryRunId(): string {
  return `dry-run-${Date.now()}-${nextDryRunSequence++}`
}

function defaultRecordId(): string {
  return `record-${Date.now()}-${nextRecordSequence++}`
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
