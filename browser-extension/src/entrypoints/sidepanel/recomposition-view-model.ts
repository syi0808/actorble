import {
  createLocatorPreviewCandidateViews,
  type LocatorPreviewCandidateView,
  type LocatorPreviewSnapshot,
  type LocatorPreviewStatus,
} from '../../inspector/locator-preview.js'
import {
  createTargetPickerView,
  type TargetPickerSnapshot,
  type TargetPickerStatus,
} from '../../inspector/target-picker.js'
import type { ExtensionIssue } from '../../shared/result.js'
import type { TraceRunDisplayView } from '../../trace/index.js'
import {
  createSidepanelScenarioEditorView,
  type SidepanelActionFamilyOptionView,
  type SidepanelButtonView,
  type SidepanelIssueView,
  type SidepanelRecordedDraftReviewView,
  type SidepanelScenarioEditorSnapshot,
  type SidepanelScenarioEditorView,
  type SidepanelStepRowView,
  type SidepanelTargetSlotRowView,
  type SidepanelWorkflowView,
} from './scenario-editor.js'

export type SidepanelDebugDrawerView =
  | 'validation'
  | 'locator'
  | 'run-trace'
  | 'failure'

export type SidepanelDebugDrawerState = Readonly<{
  expanded?: boolean
  activeView?: SidepanelDebugDrawerView
}>

export type SidepanelRecompositionInput = Readonly<{
  editor: SidepanelScenarioEditorSnapshot
  targetPicker: TargetPickerSnapshot
  locatorPreview: LocatorPreviewSnapshot
  debugDrawer?: SidepanelDebugDrawerState
}>

export type SidepanelScenarioShellView = Readonly<{
  status: SidepanelWorkflowView['status']
  summary: string
  dirty: boolean
  issueSummary: string
  selectedScenarioId?: string
  selectedStepId?: string
  selectedTargetSlotId?: string
  scenarioOptions: SidepanelScenarioEditorView['scenarioOptions']
  metadata: SidepanelScenarioEditorView['documentFields']
  targetTab: SidepanelScenarioEditorView['targetTab']
  pendingAction: SidepanelScenarioEditorSnapshot['pendingAction']
  message?: string
  runId?: string
  runStatus?: SidepanelScenarioEditorSnapshot['currentRun'] extends infer TRun
    ? TRun extends Readonly<{ status: infer TStatus }>
      ? TStatus
      : never
    : never
  recordStatus?: SidepanelScenarioEditorSnapshot['currentRecord'] extends infer TRecord
    ? TRecord extends Readonly<{ status: infer TStatus }>
      ? TStatus
      : never
    : never
  buttons: Readonly<{
    create: SidepanelButtonView
    import: SidepanelButtonView
    export: SidepanelButtonView
    save: SidepanelButtonView
    validate: SidepanelButtonView
    run: SidepanelButtonView
    record: SidepanelButtonView
  }>
}>

export type SidepanelSelectedStepView = SidepanelStepRowView &
  Readonly<{
    actionFamily: SidepanelScenarioEditorView['selectedStepFields']['actionFamily']
    fields: SidepanelScenarioEditorView['selectedStepFields']
  }>

export type SidepanelBuilderWorkbenchView = Readonly<{
  status: 'empty' | 'ready'
  actionFamilyOptions: readonly SidepanelActionFamilyOptionView[]
  steps: readonly SidepanelStepRowView[]
  selectedStep?: SidepanelSelectedStepView
  buttons: Readonly<{
    addStep: SidepanelButtonView
    insertStep: SidepanelButtonView
    duplicateStep: SidepanelButtonView
    deleteStep: SidepanelButtonView
    moveStepUp: SidepanelButtonView
    moveStepDown: SidepanelButtonView
    dryRun: SidepanelButtonView
  }>
}>

export type SidepanelTargetAssignmentStatus =
  | 'unavailable'
  | 'idle'
  | TargetPickerStatus
  | LocatorPreviewStatus

export type SidepanelLocatorPreviewView = Readonly<{
  status: LocatorPreviewStatus
  summary: string
  issueSummary: string
  candidates: readonly LocatorPreviewCandidateView[]
}>

export type SidepanelTargetAssignmentView = Readonly<{
  status: SidepanelTargetAssignmentStatus
  selectedTargetSlotId?: string
  slots: readonly SidepanelTargetSlotRowView[]
  picker: Readonly<{
    statusSummary: string
    selectedSummary: string
    issueSummary: string
  }>
  locatorPreview: SidepanelLocatorPreviewView
  buttons: Readonly<{
    start: SidepanelButtonView
    stop: SidepanelButtonView
  }>
}>

export type SidepanelDebugDrawerViewModel = Readonly<{
  expanded: boolean
  activeView: SidepanelDebugDrawerView
  attention: boolean
  views: Readonly<{
    validation: Readonly<{
      summary: string
      issueCount: number
      issues: readonly SidepanelIssueView[]
    }>
    locator: SidepanelLocatorPreviewView
    runTrace: Readonly<{
      summary: string
      eventCount: number
      runId?: string
      status?: string
      latestEventName?: string
      latestEventMessage?: string
    }>
    failure: Readonly<{
      message?: string
      stepId?: string
      eventName?: string
      details?: Readonly<Record<string, unknown>>
    }>
  }>
}>

export type SidepanelRecompositionViewModel = Readonly<{
  scenarioShell: SidepanelScenarioShellView
  builderWorkbench: SidepanelBuilderWorkbenchView
  targetAssignment: SidepanelTargetAssignmentView
  recordedDraftReview: SidepanelRecordedDraftReviewView | undefined
  debugDrawer: SidepanelDebugDrawerViewModel
}>

export function createSidepanelRecompositionViewModel(
  input: SidepanelRecompositionInput,
): SidepanelRecompositionViewModel {
  const editorView = createSidepanelScenarioEditorView(input.editor)
  const locatorPreview = locatorPreviewView(input.locatorPreview, input.editor.pendingAction !== null)

  return {
    scenarioShell: scenarioShellView(input.editor, editorView),
    builderWorkbench: builderWorkbenchView(editorView),
    targetAssignment: targetAssignmentView(input, editorView, locatorPreview),
    recordedDraftReview: editorView.recordedDraftReview,
    debugDrawer: debugDrawerView(input, editorView, locatorPreview),
  }
}

function scenarioShellView(
  snapshot: SidepanelScenarioEditorSnapshot,
  editorView: SidepanelScenarioEditorView,
): SidepanelScenarioShellView {
  return {
    status: editorView.workflow.status,
    summary: editorView.workflow.summary,
    dirty: editorView.workflow.dirty,
    issueSummary: issueSummary(snapshot.issues),
    selectedScenarioId: editorView.selectedScenarioId,
    selectedStepId: editorView.workflow.selectedStepId,
    selectedTargetSlotId: editorView.workflow.selectedTargetSlotId,
    scenarioOptions: editorView.scenarioOptions,
    metadata: editorView.documentFields,
    targetTab: editorView.targetTab,
    pendingAction: snapshot.pendingAction,
    message: snapshot.message,
    runId: snapshot.currentRun?.runId,
    runStatus: snapshot.currentRun?.status,
    recordStatus: snapshot.currentRecord?.status,
    buttons: {
      create: editorView.buttons.create,
      import: editorView.buttons.import,
      export: editorView.buttons.export,
      save: editorView.buttons.save,
      validate: editorView.buttons.validate,
      run: editorView.buttons.run,
      record: editorView.buttons.record,
    },
  }
}

function builderWorkbenchView(
  editorView: SidepanelScenarioEditorView,
): SidepanelBuilderWorkbenchView {
  const selectedStep = editorView.stepRows.find((step) => step.selected)

  return {
    status: editorView.stepRows.length === 0 ? 'empty' : 'ready',
    actionFamilyOptions: editorView.actionFamilyOptions,
    steps: editorView.stepRows,
    selectedStep: selectedStep === undefined
      ? undefined
      : {
          ...selectedStep,
          actionFamily: editorView.selectedStepFields.actionFamily,
          fields: editorView.selectedStepFields,
        },
    buttons: {
      addStep: editorView.buttons.addStep,
      insertStep: editorView.buttons.insertStep,
      duplicateStep: editorView.buttons.duplicateStep,
      deleteStep: editorView.buttons.deleteStep,
      moveStepUp: editorView.buttons.moveStepUp,
      moveStepDown: editorView.buttons.moveStepDown,
      dryRun: editorView.buttons.dryRun,
    },
  }
}

function targetAssignmentView(
  input: SidepanelRecompositionInput,
  editorView: SidepanelScenarioEditorView,
  locatorPreview: SidepanelLocatorPreviewView,
): SidepanelTargetAssignmentView {
  const pickerView = createTargetPickerView(input.targetPicker)
  const unavailable = editorView.workflow.status === 'empty' ||
    editorView.workflow.selectedTargetSlotId === undefined ||
    editorView.targetSlotRows.length === 0
  const editorPending = input.editor.pendingAction !== null

  return {
    status: unavailable
      ? 'unavailable'
      : targetAssignmentStatus(input.targetPicker.status, input.locatorPreview.status),
    selectedTargetSlotId: editorView.workflow.selectedTargetSlotId,
    slots: editorView.targetSlotRows,
    picker: {
      statusSummary: pickerView.statusSummary,
      selectedSummary: pickerView.selectedSummary,
      issueSummary: pickerView.issueSummary,
    },
    locatorPreview,
    buttons: {
      start: {
        ...pickerView.buttons.start,
        label: 'Set selected target',
        disabled: pickerView.buttons.start.disabled || unavailable || editorPending,
      },
      stop: {
        ...pickerView.buttons.stop,
        disabled: pickerView.buttons.stop.disabled || editorPending,
      },
    },
  }
}

function debugDrawerView(
  input: SidepanelRecompositionInput,
  editorView: SidepanelScenarioEditorView,
  locatorPreview: SidepanelLocatorPreviewView,
): SidepanelDebugDrawerViewModel {
  const traceView = input.editor.currentTrace
  const failure = traceView?.failure
  const attention =
    input.editor.issues.length > 0 ||
    input.locatorPreview.issues.length > 0 ||
    failure !== undefined

  return {
    expanded: input.debugDrawer?.expanded ?? false,
    activeView: input.debugDrawer?.activeView ?? defaultDebugDrawerView(
      input.editor.issues,
      input.locatorPreview,
      traceView,
    ),
    attention,
    views: {
      validation: {
        summary: editorView.validationSummary,
        issueCount: input.editor.issues.length,
        issues: editorView.issueViews,
      },
      locator: locatorPreview,
      runTrace: runTraceView(traceView),
      failure: failure === undefined
        ? {}
        : {
            message: failure.message,
            stepId: failure.stepId,
            eventName: failure.eventName,
            details: failure.details,
          },
    },
  }
}

function locatorPreviewView(
  snapshot: LocatorPreviewSnapshot,
  editorPending: boolean,
): SidepanelLocatorPreviewView {
  return {
    status: snapshot.status,
    summary: locatorPreviewSummary(snapshot),
    issueSummary: issueSummary(snapshot.issues),
    candidates: createLocatorPreviewCandidateViews(snapshot.candidates).map((candidate) => ({
      ...candidate,
      selectable: candidate.selectable && !editorPending,
    })),
  }
}

function runTraceView(
  traceView: TraceRunDisplayView | undefined,
): SidepanelDebugDrawerViewModel['views']['runTrace'] {
  if (traceView === undefined) {
    return {
      summary: 'No active run',
      eventCount: 0,
    }
  }

  return {
    summary: traceView.summary,
    eventCount: traceView.eventCount,
    runId: traceView.runId,
    status: traceView.status.status,
    latestEventName: traceView.latestEvent?.name,
    latestEventMessage: traceView.latestEvent?.message,
  }
}

function targetAssignmentStatus(
  targetPickerStatus: TargetPickerStatus,
  locatorPreviewStatus: LocatorPreviewStatus,
): SidepanelTargetAssignmentStatus {
  if (targetPickerStatus !== 'idle') {
    return targetPickerStatus
  }

  return locatorPreviewStatus === 'idle' ? 'idle' : locatorPreviewStatus
}

function defaultDebugDrawerView(
  issues: readonly ExtensionIssue[],
  locatorPreview: LocatorPreviewSnapshot,
  traceView: TraceRunDisplayView | undefined,
): SidepanelDebugDrawerView {
  if (traceView?.failure !== undefined) {
    return 'failure'
  }

  if (issues.length > 0) {
    return 'validation'
  }

  if (locatorPreview.issues.length > 0 || locatorPreview.status === 'failed') {
    return 'locator'
  }

  if (traceView !== undefined) {
    return 'run-trace'
  }

  return 'validation'
}

function locatorPreviewSummary(snapshot: LocatorPreviewSnapshot): string {
  if (snapshot.status === 'ready') {
    const count = snapshot.candidates.length
    return `${count} candidate${count === 1 ? '' : 's'}`
  }

  switch (snapshot.status) {
    case 'idle':
      return 'No preview'
    case 'previewing':
      return 'Previewing'
    case 'failed':
      return 'Preview failed'
  }
}

function issueSummary(
  issues: readonly Readonly<{ message: string }>[],
): string {
  return issues.length === 0
    ? 'None'
    : issues.map((issue) => issue.message).join(' · ')
}
