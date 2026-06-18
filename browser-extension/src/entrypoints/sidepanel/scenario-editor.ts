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
import type {
  ScenarioDocument,
  ScenarioLocator,
  ScenarioStep,
  ScenarioTargetGroup,
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

export type SidepanelScenarioRunReceipt = RequiredRunCorrelation &
  Readonly<{
    status: RuntimeRunStatus
  }>

export type SidepanelScenarioEditorSnapshot = Readonly<{
  scenarios: readonly ScenarioRecord[]
  selectedScenarioId?: string
  selectedStepIndex: number
  draftDocument?: ScenarioDocument
  pendingAction: SidepanelPendingAction | null
  issues: readonly ExtensionIssue[]
  currentRun?: SidepanelScenarioRunReceipt
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

export type SidepanelScenarioEditorView = Readonly<{
  scenarioOptions: readonly Readonly<{ value: string; label: string }>[]
  selectedScenarioId?: string
  documentFields: Readonly<{
    name: string
    description: string
  }>
  stepRows: readonly SidepanelStepRowView[]
  selectedStepFields: Readonly<{
    id: string
    action: string
    note: string
    input: string
    duration: string
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
    validate: SidepanelButtonView
    save: SidepanelButtonView
    import: SidepanelButtonView
    export: SidepanelButtonView
    run: SidepanelButtonView
    dryRun: SidepanelButtonView
  }>
}>

export type SidepanelScenarioEditor = Readonly<{
  refresh(): Promise<ExtensionResult<SidepanelScenarioEditorSnapshot>>
  selectScenario(id: string): void
  selectStep(index: number): void
  updateDocumentFields(update: SidepanelDocumentFieldUpdate): void
  updateSelectedStepFields(
    update: SidepanelStepFieldUpdate,
  ): ExtensionResult<ScenarioDocument>
  applyLocatorToSelectedStep(locator: ScenarioLocator): ExtensionResult<ScenarioDocument>
  validateDraft(): ExtensionResult<ScenarioDocument>
  saveDraft(): Promise<ExtensionResult<ScenarioRecord>>
  importJson(jsonText: string): Promise<ExtensionResult<ScenarioRecord>>
  exportSelected(): Promise<ExtensionResult<ScenarioJsonExport>>
  runSelectedScenario(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>>
  dryRunSelectedStep(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>>
  ingestMessage(message: unknown): boolean
  getSnapshot(): SidepanelScenarioEditorSnapshot
}>

const DEFAULT_FRAME_ID = 0

let nextRunSequence = 1
let nextDryRunSequence = 1

export function createSidepanelScenarioEditor(
  client: SidepanelScenarioEditorClient,
  options: SidepanelScenarioEditorOptions = {},
): SidepanelScenarioEditor {
  const createRunId = options.createRunId ?? defaultRunId
  const createDryRunId = options.createDryRunId ?? defaultDryRunId
  const frameId = options.frameId ?? DEFAULT_FRAME_ID
  const targetTabId = options.targetTabId
  const now = options.now ?? Date.now
  const traceStore = createTraceDisplayStore({
    historyLimit: options.traceHistoryLimit,
    runLimit: options.traceRunLimit,
  })
  let snapshot = emptySnapshot(traceStore.getState())

  async function refresh(): Promise<ExtensionResult<SidepanelScenarioEditorSnapshot>> {
    snapshot = {
      ...snapshot,
      pendingAction: 'refresh',
      issues: [],
    }

    const loaded = await loadScenarios(snapshot.selectedScenarioId)
    snapshot = {
      ...snapshot,
      pendingAction: null,
    }

    return loaded.ok ? ok(snapshot) : failure(loaded.issues)
  }

  function selectScenario(id: string): void {
    const scenario = snapshot.scenarios.find((record) => record.id === id)
    if (scenario === undefined) {
      snapshot = {
        ...snapshot,
        selectedScenarioId: id,
        selectedStepIndex: 0,
        draftDocument: undefined,
        issues: [
          {
            code: 'storage_error',
            message: `Scenario record "${id}" is not loaded.`,
          },
        ],
      }
      return
    }

    applySelectedScenario(scenario)
  }

  function selectStep(index: number): void {
    const steps = snapshot.draftDocument?.steps ?? []
    snapshot = {
      ...snapshot,
      selectedStepIndex: clampStepIndex(index, steps.length),
    }
  }

  function updateDocumentFields(update: SidepanelDocumentFieldUpdate): void {
    if (snapshot.draftDocument === undefined) {
      return
    }

    const document = { ...snapshot.draftDocument } as Record<string, unknown>
    if (update.name !== undefined) {
      applyStringField(document, 'name', update.name, { deleteWhenBlank: true })
    }
    if (update.description !== undefined) {
      applyStringField(document, 'description', update.description, { deleteWhenBlank: true })
    }

    snapshot = {
      ...snapshot,
      draftDocument: document as unknown as ScenarioDocument,
      issues: [],
      message: undefined,
    }
  }

  function updateSelectedStepFields(
    update: SidepanelStepFieldUpdate,
  ): ExtensionResult<ScenarioDocument> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before editing a step.',
      })
    }

    const index = snapshot.selectedStepIndex
    const step = snapshot.draftDocument.steps[index]
    if (step === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before editing.',
        path: ['steps'],
      })
    }

    const editedStep = editStep(step, index, update)
    if (!editedStep.ok) {
      snapshot = {
        ...snapshot,
        issues: editedStep.issues,
        message: undefined,
      }
      return failure(editedStep.issues)
    }

    const steps = snapshot.draftDocument.steps.map((item, itemIndex) => (
      itemIndex === index ? editedStep.value : item
    ))
    const document = {
      ...snapshot.draftDocument,
      steps,
    } satisfies ScenarioDocument
    const validation = validateScenarioDocument(document)

    snapshot = {
      ...snapshot,
      draftDocument: document,
      issues: validation.ok ? [] : validation.issues,
      message: undefined,
    }

    return validation.ok ? ok(document) : validation
  }

  function applyLocatorToSelectedStep(
    locator: ScenarioLocator,
  ): ExtensionResult<ScenarioDocument> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before applying a locator.',
      })
    }

    const index = snapshot.selectedStepIndex
    const step = snapshot.draftDocument.steps[index]
    if (step === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before applying a locator.',
        path: ['steps'],
      })
    }

    if (readStepProperty(step, 'target') === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'The selected step does not have a writable target field.',
        path: ['steps', index, 'target'],
      })
    }

    const target = {
      kind: 'target',
      strict: true,
      locators: [locator],
    } satisfies ScenarioTargetGroup
    const steps = snapshot.draftDocument.steps.map((item, itemIndex) => (
      itemIndex === index
        ? {
            ...step,
            target,
          } as ScenarioStep
        : item
    ))
    const document = {
      ...snapshot.draftDocument,
      steps,
    } satisfies ScenarioDocument
    const validation = validateScenarioDocument(document)

    snapshot = {
      ...snapshot,
      draftDocument: document,
      issues: validation.ok ? [] : validation.issues,
      message: validation.ok ? 'Locator applied' : undefined,
    }

    return validation.ok ? ok(document) : validation
  }

  function validateDraft(): ExtensionResult<ScenarioDocument> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before validating.',
      })
    }

    snapshot = {
      ...snapshot,
      pendingAction: 'validate',
      issues: [],
      message: undefined,
    }
    const validation = validateScenarioDocument(snapshot.draftDocument)
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: validation.ok ? [] : validation.issues,
    }

    return validation
  }

  async function saveDraft(): Promise<ExtensionResult<ScenarioRecord>> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before saving.',
      })
    }

    snapshot = {
      ...snapshot,
      pendingAction: 'save',
      issues: [],
      message: undefined,
    }

    const validation = validateScenarioDocument(snapshot.draftDocument)
    if (!validation.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: validation.issues,
      }
      return validation
    }

    const selectedId = snapshot.selectedScenarioId
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
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: result.issues,
      }
      return result
    }

    replaceScenario(result.value)
    snapshot = {
      ...snapshot,
      selectedScenarioId: result.value.id,
      draftDocument: result.value.document,
      selectedStepIndex: clampStepIndex(snapshot.selectedStepIndex, result.value.document.steps.length),
      pendingAction: null,
      issues: [],
      message: 'Saved',
    }

    return result
  }

  async function importJson(jsonText: string): Promise<ExtensionResult<ScenarioRecord>> {
    snapshot = {
      ...snapshot,
      pendingAction: 'import',
      issues: [],
      message: undefined,
    }

    const imported = await client.importScenarioJson(jsonText)
    if (!imported.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: imported.issues,
      }
      return imported
    }

    const loaded = await loadScenarios(imported.value.id)
    snapshot = {
      ...snapshot,
      pendingAction: null,
      message: 'Imported',
    }

    return loaded.ok ? imported : failure(loaded.issues)
  }

  async function exportSelected(): Promise<ExtensionResult<ScenarioJsonExport>> {
    const selectedId = snapshot.selectedScenarioId
    if (selectedId === undefined) {
      return setIssue({
        code: 'storage_error',
        message: 'Select a scenario before exporting.',
      })
    }

    snapshot = {
      ...snapshot,
      pendingAction: 'export',
      issues: [],
      message: undefined,
    }

    const exported = await client.exportScenarioJson(selectedId)
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: exported.ok ? [] : exported.issues,
      message: exported.ok ? 'Exported' : undefined,
    }

    return exported
  }

  async function runSelectedScenario(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before running.',
      })
    }

    return dispatchScenarioRun(snapshot.draftDocument, createRunId(), 'run')
  }

  async function dryRunSelectedStep(): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    if (snapshot.draftDocument === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a scenario before running a step.',
      })
    }

    const step = snapshot.draftDocument.steps[snapshot.selectedStepIndex]
    if (step === undefined) {
      return setIssue({
        code: 'invalid_document',
        message: 'Select a step before running it.',
        path: ['steps'],
      })
    }

    return dispatchScenarioRun(
      {
        ...snapshot.draftDocument,
        steps: [step],
      },
      createDryRunId(),
      'dry-run',
    )
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
      snapshot = {
        ...snapshot,
        currentRun: {
          tabId: message.payload.tabId,
          frameId: message.payload.frameId,
          scenarioId: message.payload.scenarioId,
          runId: message.payload.runId,
          status: message.payload.status,
        },
        message: message.payload.message,
        ...traceFields(),
      }
      return true
    }

    if (message.kind === 'trace:event' && matchesCurrentRun(snapshot.currentRun, message.payload)) {
      traceStore.ingestEvent(message.payload.event)
      snapshot = {
        ...snapshot,
        ...traceFields(),
      }
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
      snapshot = {
        ...snapshot,
        scenarios: [],
        selectedScenarioId: undefined,
        selectedStepIndex: 0,
        draftDocument: undefined,
        issues: scenarios.issues,
      }
      return scenarios
    }

    snapshot = {
      ...snapshot,
      scenarios: scenarios.value,
    }

    const selectedId = selectDefaultScenarioId(scenarios.value, preferredSelection)
    if (selectedId === undefined) {
      snapshot = {
        ...snapshot,
        selectedScenarioId: undefined,
        selectedStepIndex: 0,
        draftDocument: undefined,
        issues: [],
      }
      return scenarios
    }

    const selected = scenarios.value.find((scenario) => scenario.id === selectedId)
    if (selected !== undefined) {
      applySelectedScenario(selected)
    }

    return scenarios
  }

  async function dispatchScenarioRun(
    document: ScenarioDocument,
    runId: string,
    pendingAction: 'run' | 'dry-run',
  ): Promise<ExtensionResult<SidepanelScenarioRunReceipt>> {
    snapshot = {
      ...snapshot,
      pendingAction,
      issues: [],
      message: undefined,
      currentTrace: undefined,
    }

    const validation = validateScenarioDocument(document)
    if (!validation.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: validation.issues,
      }
      return validation
    }

    const compilation = compileToBrowserRuntime(validation.value)
    if (!compilation.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: compilation.issues,
      }
      return compilation
    }

    const target = await resolveRunTargetTab(client, targetTabId)
    if (!target.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: target.issues,
      }
      return target
    }

    const scenarioId = snapshot.selectedScenarioId ?? validation.value.id ?? 'draft-scenario'
    const correlation = {
      tabId: target.value.id,
      frameId,
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
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: responseResult.issues,
      }
      return failure(responseResult.issues)
    }

    const receipt = {
      ...correlation,
      status: 'running',
    } satisfies SidepanelScenarioRunReceipt
    traceStore.startRun(statusSnapshotFrom(correlation, 'running', now()))
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: [],
      currentRun: receipt,
      ...traceFields(),
    }
    return ok(receipt)
  }

  function setIssue<TValue>(issue: ExtensionIssue): ExtensionResult<TValue> {
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: [issue],
      message: undefined,
    }
    return failure(issue)
  }

  function applySelectedScenario(record: ScenarioRecord): void {
    const validation = validateScenarioDocument(record.document)
    const selectedStepIndex = clampStepIndex(snapshot.selectedStepIndex, record.document.steps.length)

    snapshot = {
      ...snapshot,
      selectedScenarioId: record.id,
      selectedStepIndex,
      draftDocument: record.document,
      issues: validation.ok ? [] : validation.issues,
      message: undefined,
    }
  }

  function replaceScenario(record: ScenarioRecord): void {
    const exists = snapshot.scenarios.some((scenario) => scenario.id === record.id)
    snapshot = {
      ...snapshot,
      scenarios: exists
        ? snapshot.scenarios.map((scenario) => (scenario.id === record.id ? record : scenario))
        : [record, ...snapshot.scenarios],
    }
  }

  function traceFields(): Pick<SidepanelScenarioEditorSnapshot, 'trace' | 'currentTrace'> {
    return {
      trace: traceStore.getState(),
      currentTrace: traceStore.getCurrentView(),
    }
  }

  return {
    refresh,
    selectScenario,
    selectStep,
    updateDocumentFields,
    updateSelectedStepFields,
    applyLocatorToSelectedStep,
    validateDraft,
    saveDraft,
    importJson,
    exportSelected,
    runSelectedScenario,
    dryRunSelectedStep,
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

  return {
    scenarioOptions: snapshot.scenarios.map((scenario) => ({
      value: scenario.id,
      label: scenario.name,
    })),
    selectedScenarioId: snapshot.selectedScenarioId,
    documentFields: {
      name: snapshot.draftDocument?.name ?? '',
      description: snapshot.draftDocument?.description ?? '',
    },
    stepRows: stepRows(snapshot),
    selectedStepFields: selectedStepFields(step),
    issueViews: snapshot.issues.map((issue) => ({
      path: formatIssuePath(issue.path ?? []),
      message: issue.message,
    })),
    validationSummary: validationSummary(snapshot),
    runSummary: runSummary(snapshot),
    traceView: snapshot.currentTrace,
    buttons: {
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
        disabled: anyPending || snapshot.selectedScenarioId === undefined,
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
    },
  }
}

function editStep(
  step: ScenarioStep,
  index: number,
  update: SidepanelStepFieldUpdate,
): ExtensionResult<ScenarioStep> {
  const next = {
    ...step,
  } as Record<string, unknown>

  if (update.note !== undefined) {
    applyStringField(next, 'note', update.note, { deleteWhenBlank: true })
  }

  if (update.input !== undefined && typeof next.input === 'string') {
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
      delete next[stepKey]
    } else {
      next[stepKey] = parsed.value
    }
  }

  return ok(next as ScenarioStep)
}

function stepRows(snapshot: SidepanelScenarioEditorSnapshot): readonly SidepanelStepRowView[] {
  return (snapshot.draftDocument?.steps ?? []).map((step, index) => ({
    index,
    id: step.id ?? `step-${index + 1}`,
    action: step.action,
    targetSummary: targetSummaryForStep(step),
    inputSummary: inputSummaryForStep(step),
    validationStatus: hasIssueAtStep(snapshot.issues, index) ? 'invalid' : 'valid',
    selected: index === snapshot.selectedStepIndex,
  }))
}

function selectedStepFields(
  step: ScenarioStep | undefined,
): SidepanelScenarioEditorView['selectedStepFields'] {
  if (step === undefined) {
    return {
      id: '',
      action: '',
      note: '',
      input: '',
      duration: '',
      targetJson: '',
      fromJson: '',
      toJson: '',
      inputJson: '',
    }
  }

  return {
    id: step.id ?? '',
    action: step.action,
    note: step.note ?? '',
    input: typeof readStepProperty(step, 'input') === 'string'
      ? String(readStepProperty(step, 'input'))
      : '',
    duration: typeof readStepProperty(step, 'duration') === 'number'
      ? String(readStepProperty(step, 'duration'))
      : '',
    targetJson: jsonTextFor(readStepProperty(step, 'target')),
    fromJson: jsonTextFor(readStepProperty(step, 'from')),
    toJson: jsonTextFor(readStepProperty(step, 'to')),
    inputJson: typeof readStepProperty(step, 'input') === 'object'
      ? jsonTextFor(readStepProperty(step, 'input'))
      : '',
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

function targetSummaryForStep(step: ScenarioStep): string {
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

function inputSummaryForStep(step: ScenarioStep): string {
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

function selectedStep(snapshot: SidepanelScenarioEditorSnapshot): ScenarioStep | undefined {
  return snapshot.draftDocument?.steps[snapshot.selectedStepIndex]
}

function clampStepIndex(index: number, stepCount: number): number {
  if (stepCount <= 0) {
    return 0
  }

  return Math.max(0, Math.min(index, stepCount - 1))
}

function applyStringField(
  record: Record<string, unknown>,
  key: string,
  value: string,
  options: Readonly<{ deleteWhenBlank: boolean }>,
): void {
  if (value.trim().length === 0 && options.deleteWhenBlank) {
    delete record[key]
    return
  }

  record[key] = value
}

function hasIssueAtStep(issues: readonly ExtensionIssue[], index: number): boolean {
  return issues.some((issue) => issue.path?.[0] === 'steps' && issue.path[1] === index)
}

function readStepProperty(step: ScenarioStep, key: string): unknown {
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

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
