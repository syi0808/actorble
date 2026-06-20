import { browser } from 'wxt/browser'
import {
  autoApplyTargetFromPreview,
  createLocatorPreviewer,
  type LocatorPreviewCandidateView,
} from '../../inspector/locator-preview.js'
import {
  createTargetPicker,
} from '../../inspector/target-picker.js'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelButtonView,
  type SidepanelActionFamilyOptionView,
  type SidepanelScenarioEditorSnapshot,
} from './scenario-editor.js'
import {
  createSidepanelRecompositionViewModel,
  type SidepanelDebugDrawerState,
  type SidepanelDebugDrawerView,
  type SidepanelDebugDrawerViewModel,
  type SidepanelLocatorPreviewView,
  type SidepanelScenarioShellView,
  type SidepanelTargetAssignmentView,
} from './recomposition-view-model.js'
import type { BuilderStepActionFamily } from '../../builder/index.js'
import type { ScenarioCoordinateSpace } from '../../scenario/types.js'
import { sidepanelLaunchParamsFromUrl } from './launch-params.js'

const scenarioRepository = createWxtScenarioStorageRepository()
const launchParams = sidepanelLaunchParamsFromUrl(window.location.href)
const targetTabId = launchParams.targetTabId
const editor = createSidepanelScenarioEditor({
  listScenarios() {
    return scenarioRepository.list()
  },
  saveScenario(input) {
    return scenarioRepository.save(input)
  },
  updateScenario(id, update) {
    return scenarioRepository.update(id, update)
  },
  importScenarioJson(jsonText) {
    return scenarioRepository.importJson(jsonText)
  },
  exportScenarioJson(id) {
    return scenarioRepository.exportJson(id)
  },
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})
const targetPicker = createTargetPicker({
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})
const locatorPreviewer = createLocatorPreviewer({
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  async getTab(tabId) {
    return await browser.tabs.get(tabId)
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
}, {
  targetTabId,
})
let debugDrawerState: SidepanelDebugDrawerState = {}

const scenarioSelect = requiredElement<HTMLSelectElement>('#scenario-select')
const scenarioFile = requiredElement<HTMLInputElement>('#scenario-file')
const exportFormat = requiredElement<HTMLSelectElement>('#export-format')
const workflowStatus = requiredElement<HTMLElement>('#workflow-status')
const scenarioSummary = requiredElement<HTMLElement>('#scenario-summary')
const scenarioShellIssue = requiredElement<HTMLElement>('#scenario-shell-issue')
const targetTabStatus = requiredElement<HTMLElement>('#target-tab-status')
const createScenarioButton = requiredElement<HTMLButtonElement>('#create-scenario-button')
const scenarioName = requiredElement<HTMLInputElement>('#scenario-name')
const scenarioDescription = requiredElement<HTMLTextAreaElement>('#scenario-description')
const validateButton = requiredElement<HTMLButtonElement>('#validate-button')
const saveButton = requiredElement<HTMLButtonElement>('#save-button')
const exportButton = requiredElement<HTMLButtonElement>('#export-button')
const runButton = requiredElement<HTMLButtonElement>('#run-button')
const recordButton = requiredElement<HTMLButtonElement>('#record-button')
const recordStatus = requiredElement<HTMLElement>('#record-status')
const recordedDraftReview = requiredElement<HTMLElement>('#recorded-draft-review')
const recordedDraftSummary = requiredElement<HTMLElement>('#recorded-draft-summary')
const recordedDraftValidation = requiredElement<HTMLElement>('#recorded-draft-validation')
const recordedDraftSensitive = requiredElement<HTMLElement>('#recorded-draft-sensitive')
const recordedDraftSensitiveConfirm = requiredElement<HTMLInputElement>(
  '#recorded-draft-sensitive-confirm',
)
const recordedDraftReplaceButton = requiredElement<HTMLButtonElement>(
  '#recorded-draft-replace-button',
)
const recordedDraftAppendButton = requiredElement<HTMLButtonElement>(
  '#recorded-draft-append-button',
)
const recordedDraftDiscardButton = requiredElement<HTMLButtonElement>(
  '#recorded-draft-discard-button',
)
const recordedDraftSaveNewButton = requiredElement<HTMLButtonElement>(
  '#recorded-draft-save-new-button',
)
const recordedDraftExportButton = requiredElement<HTMLButtonElement>(
  '#recorded-draft-export-button',
)
const stepList = requiredElement<HTMLUListElement>('#step-list')
const stepSummary = requiredElement<HTMLElement>('#step-summary')
const stepActionFamily = requiredElement<HTMLSelectElement>('#step-action-family')
const addStepButton = requiredElement<HTMLButtonElement>('#add-step-button')
const insertStepButton = requiredElement<HTMLButtonElement>('#insert-step-button')
const duplicateStepButton = requiredElement<HTMLButtonElement>('#duplicate-step-button')
const moveStepUpButton = requiredElement<HTMLButtonElement>('#move-step-up-button')
const moveStepDownButton = requiredElement<HTMLButtonElement>('#move-step-down-button')
const deleteStepButton = requiredElement<HTMLButtonElement>('#delete-step-button')
const stepAction = requiredElement<HTMLSelectElement>('#step-action')
const stepNote = requiredElement<HTMLInputElement>('#step-note')
const stepInputField = requiredElement<HTMLElement>('#step-input-field')
const stepInput = requiredElement<HTMLInputElement>('#step-input')
const stepDurationField = requiredElement<HTMLElement>('#step-duration-field')
const stepDuration = requiredElement<HTMLInputElement>('#step-duration')
const stepWaitTextField = requiredElement<HTMLElement>('#step-wait-text-field')
const stepWaitText = requiredElement<HTMLInputElement>('#step-wait-text')
const stepScrollPositionField = requiredElement<HTMLElement>('#step-scroll-position-field')
const stepScrollX = requiredElement<HTMLInputElement>('#step-scroll-x')
const stepScrollY = requiredElement<HTMLInputElement>('#step-scroll-y')
const stepScrollCoordinateSpace = requiredElement<HTMLSelectElement>(
  '#step-scroll-coordinate-space',
)
const targetSlotSection = requiredElement<HTMLElement>('#target-slot-section')
const targetSlotList = requiredElement<HTMLUListElement>('#target-slot-list')
const stepTargetJson = requiredElement<HTMLTextAreaElement>('#step-target-json')
const stepFromJson = requiredElement<HTMLTextAreaElement>('#step-from-json')
const stepToJson = requiredElement<HTMLTextAreaElement>('#step-to-json')
const stepInputJson = requiredElement<HTMLTextAreaElement>('#step-input-json')
const stepOptionsJson = requiredElement<HTMLTextAreaElement>('#step-options-json')
const dryRunButton = requiredElement<HTMLButtonElement>('#dry-run-button')
const targetPickerStatus = requiredElement<HTMLElement>('#target-picker-status')
const targetPickerSelected = requiredElement<HTMLElement>('#target-picker-selected')
const targetPickerIssues = requiredElement<HTMLElement>('#target-picker-issues')
const targetPickerStartButton = requiredElement<HTMLButtonElement>('#target-picker-start-button')
const targetPickerStopButton = requiredElement<HTMLButtonElement>('#target-picker-stop-button')
const locatorPreviewStatus = requiredElement<HTMLElement>('#locator-preview-status')
const locatorPreviewList = requiredElement<HTMLUListElement>('#locator-preview-list')
const locatorPreviewIssues = requiredElement<HTMLElement>('#locator-preview-issues')
const statusPill = requiredElement<HTMLElement>('#status-pill')
const debugDrawer = requiredElement<HTMLElement>('#debug-drawer')
const debugDrawerSummary = requiredElement<HTMLElement>('#debug-drawer-summary')
const debugDrawerToggle = requiredElement<HTMLButtonElement>('#debug-drawer-toggle')
const debugDrawerPanel = requiredElement<HTMLElement>('#debug-drawer-panel')
const debugDrawerTabs = requiredElement<HTMLElement>('#debug-drawer-tabs')
const debugValidationSummary = requiredElement<HTMLElement>('#debug-validation-summary')
const debugValidationIssues = requiredElement<HTMLUListElement>('#debug-validation-issues')
const debugLocatorStatus = requiredElement<HTMLElement>('#debug-locator-status')
const debugLocatorIssues = requiredElement<HTMLElement>('#debug-locator-issues')
const debugLocatorCandidates = requiredElement<HTMLUListElement>('#debug-locator-candidates')
const debugRunId = requiredElement<HTMLElement>('#debug-run-id')
const debugRunStatus = requiredElement<HTMLElement>('#debug-run-status')
const debugRunSummary = requiredElement<HTMLElement>('#debug-run-summary')
const debugTraceFeedback = requiredElement<HTMLElement>('#debug-trace-feedback')
const debugFailureDetail = requiredElement<HTMLElement>('#debug-failure-detail')
const debugFailureStep = requiredElement<HTMLElement>('#debug-failure-step')
const debugFailureEvent = requiredElement<HTMLElement>('#debug-failure-event')
const debugFailureDetailsJson = requiredElement<HTMLElement>('#debug-failure-details-json')

for (const section of document.querySelectorAll<HTMLElement>('section')) {
  section.tabIndex = 0
}

scenarioSelect.addEventListener('change', () => {
  editor.selectScenario(scenarioSelect.value)
  render(editor.getSnapshot())
})

createScenarioButton.addEventListener('click', () => {
  editor.createScenario({
    name: 'Untitled scenario',
    initialStepFamily: selectedActionFamily(),
  })
  render(editor.getSnapshot())
})

scenarioName.addEventListener('input', () => {
  editor.updateDocumentFields({ name: scenarioName.value })
  render(editor.getSnapshot())
})

scenarioDescription.addEventListener('input', () => {
  editor.updateDocumentFields({ description: scenarioDescription.value })
  render(editor.getSnapshot())
})

scenarioFile.addEventListener('change', () => {
  void importSelectedFile()
})

validateButton.addEventListener('click', () => {
  debugDrawerState = {
    ...debugDrawerState,
    activeView: 'validation',
  }
  editor.validateDraft()
  render(editor.getSnapshot())
})

saveButton.addEventListener('click', () => {
  void runAction(() => editor.saveDraft())
})

exportButton.addEventListener('click', () => {
  void exportSelectedScenario()
})

runButton.addEventListener('click', () => {
  void runAction(() => editor.runSelectedScenario())
})

recordButton.addEventListener('click', () => {
  const snapshot = editor.getSnapshot()
  void runAction(() => (
    snapshot.currentRecord?.status === 'recording'
      ? editor.stopRecording()
      : editor.startRecording()
  ))
})

recordedDraftSensitiveConfirm.addEventListener('change', () => {
  editor.confirmRecordedDraftSensitiveInputs(recordedDraftSensitiveConfirm.checked)
  render(editor.getSnapshot())
})

recordedDraftReplaceButton.addEventListener('click', () => {
  editor.replaceWithRecordedDraft()
  render(editor.getSnapshot())
})

recordedDraftAppendButton.addEventListener('click', () => {
  editor.appendRecordedDraftSteps()
  render(editor.getSnapshot())
})

recordedDraftDiscardButton.addEventListener('click', () => {
  editor.discardRecordedDraft()
  render(editor.getSnapshot())
})

recordedDraftSaveNewButton.addEventListener('click', () => {
  void runAction(() => editor.saveRecordedDraftAsNew())
})

recordedDraftExportButton.addEventListener('click', () => {
  const exported = editor.exportRecordedDraft()
  if (exported.ok) {
    downloadFile(exported.value.filename, exported.value.jsonText, 'application/json')
  }
  render(editor.getSnapshot())
})

stepList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-step-index]',
  )
  if (button == null) {
    return
  }

  editor.selectStep(Number(button.dataset.stepIndex))
  render(editor.getSnapshot())
})

stepActionFamily.addEventListener('change', () => {
  editor.updateSelectedStepActionFamily(selectedActionFamily())
  render(editor.getSnapshot())
})

addStepButton.addEventListener('click', () => {
  editor.addStep(selectedActionFamily())
  render(editor.getSnapshot())
})

insertStepButton.addEventListener('click', () => {
  editor.insertStep(selectedActionFamily())
  render(editor.getSnapshot())
})

duplicateStepButton.addEventListener('click', () => {
  editor.duplicateSelectedStep()
  render(editor.getSnapshot())
})

moveStepUpButton.addEventListener('click', () => {
  editor.moveSelectedStep(-1)
  render(editor.getSnapshot())
})

moveStepDownButton.addEventListener('click', () => {
  editor.moveSelectedStep(1)
  render(editor.getSnapshot())
})

deleteStepButton.addEventListener('click', () => {
  editor.deleteSelectedStep()
  render(editor.getSnapshot())
})

stepAction.addEventListener('change', () => {
  editor.updateSelectedStepActionFamily(stepAction.value as BuilderStepActionFamily)
  render(editor.getSnapshot())
})

stepNote.addEventListener('input', () => {
  editor.updateSelectedStepFields({ note: stepNote.value })
  render(editor.getSnapshot())
})

stepInput.addEventListener('input', () => {
  editor.updateSelectedStepFields({ input: stepInput.value })
  render(editor.getSnapshot())
})

stepDuration.addEventListener('input', () => {
  editor.updateSelectedStepFields({ duration: stepDuration.value })
  render(editor.getSnapshot())
})

stepWaitText.addEventListener('input', () => {
  editor.updateSelectedStepFields({ waitText: stepWaitText.value })
  render(editor.getSnapshot())
})

stepScrollX.addEventListener('input', () => {
  editor.updateSelectedStepFields({ scrollX: stepScrollX.value })
  render(editor.getSnapshot())
})

stepScrollY.addEventListener('input', () => {
  editor.updateSelectedStepFields({ scrollY: stepScrollY.value })
  render(editor.getSnapshot())
})

stepScrollCoordinateSpace.addEventListener('change', () => {
  editor.updateSelectedStepFields({
    scrollCoordinateSpace: stepScrollCoordinateSpace.value as ScenarioCoordinateSpace,
  })
  render(editor.getSnapshot())
})

stepTargetJson.addEventListener('change', () => {
  editor.updateSelectedStepFields({ targetJson: stepTargetJson.value })
  render(editor.getSnapshot())
})

stepFromJson.addEventListener('change', () => {
  editor.updateSelectedStepFields({ fromJson: stepFromJson.value })
  render(editor.getSnapshot())
})

stepToJson.addEventListener('change', () => {
  editor.updateSelectedStepFields({ toJson: stepToJson.value })
  render(editor.getSnapshot())
})

stepInputJson.addEventListener('change', () => {
  editor.updateSelectedStepFields({ inputJson: stepInputJson.value })
  render(editor.getSnapshot())
})

stepOptionsJson.addEventListener('change', () => {
  editor.updateSelectedStepFields({ optionsJson: stepOptionsJson.value })
  render(editor.getSnapshot())
})

targetSlotList.addEventListener('click', (event) => {
  const startButton = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-target-slot-start-id]',
  )
  if (startButton != null) {
    void startTargetAssignment(startButton.dataset.targetSlotStartId)
    return
  }

  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-target-slot-id]',
  )
  if (button == null) {
    return
  }

  editor.selectTargetSlot(button.dataset.targetSlotId ?? '')
  render(editor.getSnapshot())
})

dryRunButton.addEventListener('click', () => {
  void runAction(() => editor.dryRunSelectedStep())
})

targetPickerStartButton.addEventListener('click', () => {
  void startTargetAssignment()
})

targetPickerStopButton.addEventListener('click', () => {
  void runTargetPickerAction(() => targetPicker.stop())
})

locatorPreviewList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-locator-preview-index]',
  )
  if (button == null) {
    return
  }

  const candidate = locatorPreviewer.getSnapshot().candidates[Number(button.dataset.locatorPreviewIndex)]
  if (candidate === undefined || candidate.status !== 'unique') {
    return
  }

  const targetSlot = locatorPreviewer.getSnapshot().targetSlot
  if (targetSlot !== undefined) {
    editor.applyLocatorToTargetSlot(targetSlot, candidate.locator)
  }
  render(editor.getSnapshot())
})

debugDrawerToggle.addEventListener('click', () => {
  debugDrawerState = {
    ...debugDrawerState,
    expanded: !(debugDrawerState.expanded ?? false),
  }
  render(editor.getSnapshot())
})

debugDrawerTabs.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-debug-view]',
  )
  const view = button?.dataset.debugView
  if (!isDebugDrawerView(view)) {
    return
  }

  debugDrawerState = {
    expanded: true,
    activeView: view,
  }
  render(editor.getSnapshot())
})

browser.runtime.onMessage.addListener((message) => {
  const editorHandled = editor.ingestMessage(message)
  const pickerHandled = targetPicker.ingestMessage(message)

  if (editorHandled && message?.kind === 'runtime:status' && message.payload?.status === 'failed') {
    debugDrawerState = {
      ...debugDrawerState,
      activeView: 'failure',
    }
  }

  if (editorHandled || pickerHandled) {
    render(editor.getSnapshot())
  }

  if (pickerHandled) {
    const selected = targetPicker.getSnapshot().selected
    if (selected?.targetSlot !== undefined) {
      void runLocatorPreviewAction(async () => {
        const preview = await locatorPreviewer.previewTarget(selected.target, {
          scenarioId: selected.scenarioId ?? editor.getSnapshot().selectedScenarioId,
          targetSlot: selected.targetSlot,
        })
        if (!preview.ok) {
          return
        }

        const autoApplied = autoApplyTargetFromPreview(locatorPreviewer.getSnapshot())
        if (!autoApplied.ok) {
          locatorPreviewer.reportIssue(autoApplied.issues[0] ?? {
            code: 'inspector_error',
            message: 'Selected element could not be applied to the target slot.',
          })
          return
        }

        const applied = editor.applyTargetToTargetSlot(
          autoApplied.value.targetSlot,
          autoApplied.value.target,
        )
        if (!applied.ok) {
          locatorPreviewer.reportIssue(applied.issues[0] ?? {
            code: 'invalid_document',
            message: 'Selected element could not be applied to the target slot.',
          })
        }
      })
    }
  }
})

render(editor.getSnapshot())
void runAction(async () => {
  await editor.refresh()
  await editor.refreshTargetTabState()
  await editor.loadRecordedDraft(launchParams.recordedDraftId)
})

async function startTargetAssignment(slotId?: string): Promise<void> {
  if (slotId !== undefined) {
    const selected = editor.selectTargetSlot(slotId)
    if (!selected.ok) {
      render(editor.getSnapshot())
      return
    }
  }

  const snapshot = editor.getSnapshot()
  const targetSlot = snapshot.selectedTargetSlot
  if (targetSlot === undefined) {
    render(snapshot)
    return
  }

  locatorPreviewer.clear()
  await runTargetPickerAction(() => targetPicker.start({
    scenarioId: snapshot.selectedScenarioId,
    targetSlot,
  }))
}

async function runAction(action: () => Promise<unknown>): Promise<void> {
  const operation = action()
  render(editor.getSnapshot())
  await operation
  render(editor.getSnapshot())
}

async function runTargetPickerAction(action: () => Promise<unknown>): Promise<void> {
  const operation = action()
  render(editor.getSnapshot())
  await operation
  render(editor.getSnapshot())
}

async function runLocatorPreviewAction(action: () => Promise<unknown>): Promise<void> {
  const operation = action()
  render(editor.getSnapshot())
  await operation
  const preview = locatorPreviewer.getSnapshot()
  if (preview.status === 'failed' || preview.issues.length > 0) {
    debugDrawerState = {
      ...debugDrawerState,
      activeView: 'locator',
    }
  }
  render(editor.getSnapshot())
}

async function importSelectedFile(): Promise<void> {
  const file = scenarioFile.files?.[0]
  if (file === undefined) {
    return
  }

  try {
    await runAction(async () => {
      await editor.importJson(await file.text())
    })
  } finally {
    scenarioFile.value = ''
  }
}

async function exportSelectedScenario(): Promise<void> {
  if (exportFormat.value === 'typescript') {
    const exported = editor.exportSelectedCode()
    if (exported.ok) {
      downloadFile(exported.value.filename, exported.value.source, 'text/typescript')
    }
    render(editor.getSnapshot())
    return
  }

  const operation = editor.exportSelected()
  render(editor.getSnapshot())
  const exported = await operation
  if (exported.ok) {
    downloadFile(exported.value.filename, exported.value.jsonText, 'application/json')
  }
  render(editor.getSnapshot())
}

function render(snapshot: SidepanelScenarioEditorSnapshot): void {
  const view = createSidepanelScenarioEditorView(snapshot)
  const recomposedView = createSidepanelRecompositionViewModel({
    editor: snapshot,
    targetPicker: targetPicker.getSnapshot(),
    locatorPreview: locatorPreviewer.getSnapshot(),
    debugDrawer: debugDrawerState,
  })
  const shell = recomposedView.scenarioShell
  const targetAssignment = recomposedView.targetAssignment

  workflowStatus.textContent = shell.summary
  renderScenarioOptions(shell.scenarioOptions, shell.selectedScenarioId)
  renderActionFamilyOptions(view.actionFamilyOptions, view.selectedStepFields.actionFamily)
  scenarioSummary.textContent = shell.summary
  renderTargetTabStatus(shell.targetTab)
  renderShellIssue(shell.issueSummary)
  setInputValue(scenarioName, shell.metadata.name)
  setInputValue(scenarioDescription, shell.metadata.description)
  renderStepList(view.stepRows)
  stepSummary.textContent = selectedStepSummary(snapshot)
  setSelectValue(stepAction, view.selectedStepFields.actionFamily)
  setInputValue(stepNote, view.selectedStepFields.note)
  setInputValue(stepInput, view.selectedStepFields.input)
  setInputValue(stepDuration, view.selectedStepFields.duration)
  setInputValue(stepWaitText, view.selectedStepFields.waitText)
  setInputValue(stepScrollX, view.selectedStepFields.scrollX)
  setInputValue(stepScrollY, view.selectedStepFields.scrollY)
  setSelectValue(stepScrollCoordinateSpace, view.selectedStepFields.scrollCoordinateSpace)
  renderSelectedStepControlVisibility(view.selectedStepFields.controls)
  renderTargetSlotList(targetAssignment)
  renderTargetAssignment(targetAssignment)
  setInputValue(stepTargetJson, view.selectedStepFields.targetJson)
  setInputValue(stepFromJson, view.selectedStepFields.fromJson)
  setInputValue(stepToJson, view.selectedStepFields.toJson)
  setInputValue(stepInputJson, view.selectedStepFields.inputJson)
  setInputValue(stepOptionsJson, view.selectedStepFields.optionsJson)
  renderStatus(snapshot)
  renderRecordStatus(shell, snapshot)
  renderRecordedDraftReview(view, snapshot)
  renderDebugDrawer(recomposedView.debugDrawer)

  scenarioSelect.disabled = shell.pendingAction !== null || shell.scenarioOptions.length === 0
  scenarioFile.disabled = shell.buttons.import.disabled
  exportFormat.disabled = shell.buttons.export.disabled
  applyButtonView(createScenarioButton, shell.buttons.create)
  applyButtonView(addStepButton, view.buttons.addStep)
  applyButtonView(insertStepButton, view.buttons.insertStep)
  applyButtonView(duplicateStepButton, view.buttons.duplicateStep)
  applyButtonView(moveStepUpButton, view.buttons.moveStepUp)
  applyButtonView(moveStepDownButton, view.buttons.moveStepDown)
  applyButtonView(deleteStepButton, view.buttons.deleteStep)
  applyButtonView(validateButton, shell.buttons.validate)
  applyButtonView(saveButton, shell.buttons.save)
  applyButtonView(exportButton, shell.buttons.export)
  applyButtonView(runButton, shell.buttons.run)
  applyButtonView(recordButton, shell.buttons.record)
  applyButtonView(dryRunButton, view.buttons.dryRun)
}

function renderRecordedDraftReview(
  view: ReturnType<typeof createSidepanelScenarioEditorView>,
  snapshot: SidepanelScenarioEditorSnapshot,
): void {
  const review = view.recordedDraftReview
  recordedDraftReview.hidden = review === undefined
  if (review === undefined) {
    recordedDraftSummary.textContent = 'No recorded draft'
    recordedDraftValidation.textContent = 'None'
    recordedDraftSensitive.textContent = 'No sensitive inputs'
    recordedDraftSensitiveConfirm.checked = false
    recordedDraftSensitiveConfirm.disabled = true
    return
  }

  const hasSensitiveReviewItems = review.sensitiveSummary !== 'No sensitive inputs'
  recordedDraftSummary.textContent = review.summary
  recordedDraftValidation.textContent = review.validationSummary
  recordedDraftSensitive.textContent = review.sensitiveSummary
  recordedDraftSensitiveConfirm.disabled = !hasSensitiveReviewItems
  if (document.activeElement !== recordedDraftSensitiveConfirm) {
    recordedDraftSensitiveConfirm.checked = review.sensitiveInputsConfirmed
  }
  applyButtonView(recordedDraftReplaceButton, review.buttons.replace)
  applyButtonView(recordedDraftAppendButton, review.buttons.append)
  applyButtonView(recordedDraftDiscardButton, review.buttons.discard)
  applyButtonView(recordedDraftSaveNewButton, review.buttons.saveAsNew)
  applyButtonView(recordedDraftExportButton, review.buttons.export)
}

function renderTargetAssignment(view: SidepanelTargetAssignmentView): void {
  targetPickerStatus.textContent = view.picker.statusSummary
  targetPickerSelected.textContent = view.picker.selectedSummary
  targetPickerIssues.textContent = view.picker.issueSummary
  applyButtonView(targetPickerStartButton, view.buttons.start)
  applyButtonView(targetPickerStopButton, view.buttons.stop)
  renderLocatorPreview(view.locatorPreview)
}

function renderLocatorPreview(view: SidepanelLocatorPreviewView): void {
  locatorPreviewStatus.textContent = view.summary
  locatorPreviewIssues.textContent = view.issueSummary
  renderLocatorPreviewCandidates(view.candidates)
}

function renderLocatorPreviewCandidates(
  candidates: readonly LocatorPreviewCandidateView[],
): void {
  locatorPreviewList.replaceChildren()

  for (const candidate of candidates) {
    const item = document.createElement('li')
    const content = document.createElement('div')
    const label = document.createElement('span')
    const match = document.createElement('span')
    const button = document.createElement('button')

    item.dataset.status = candidate.status
    content.className = 'locator-preview-main'
    label.className = 'locator-preview-label'
    label.textContent = candidate.label
    match.className = 'locator-preview-match'
    match.textContent = candidate.matchSummary
    button.type = 'button'
    button.textContent = 'Use'
    button.disabled = !candidate.selectable
    button.dataset.locatorPreviewIndex = String(candidate.index)
    content.append(label, match)
    item.append(content, button)
    locatorPreviewList.append(item)
  }
}

function renderDebugDrawer(view: SidepanelDebugDrawerViewModel): void {
  debugDrawer.dataset.expanded = view.expanded ? 'true' : 'false'
  debugDrawer.dataset.attention = view.attention ? 'true' : 'false'
  debugDrawerSummary.textContent = debugDrawerSummaryText(view)
  debugDrawerToggle.textContent = view.expanded ? 'Hide debug' : 'Show debug'
  debugDrawerToggle.setAttribute('aria-expanded', view.expanded ? 'true' : 'false')
  debugDrawerPanel.hidden = !view.expanded

  for (const tab of debugDrawerTabs.querySelectorAll<HTMLButtonElement>('button[data-debug-view]')) {
    const selected = tab.dataset.debugView === view.activeView
    tab.dataset.selected = selected ? 'true' : 'false'
    tab.setAttribute('aria-selected', selected ? 'true' : 'false')
    tab.tabIndex = selected ? 0 : -1
  }

  for (const panel of debugDrawerPanel.querySelectorAll<HTMLElement>('[data-debug-panel]')) {
    panel.hidden = panel.dataset.debugPanel !== view.activeView
  }

  debugValidationSummary.textContent = view.views.validation.summary
  renderIssues(debugValidationIssues, view.views.validation.issues)

  debugLocatorStatus.textContent = view.views.locator.summary
  debugLocatorIssues.textContent = view.views.locator.issueSummary
  renderDebugLocatorCandidates(view.views.locator.candidates)

  debugRunId.textContent = view.views.runTrace.runId ?? 'None'
  debugRunStatus.textContent = capitalize(view.views.runTrace.status ?? 'idle')
  debugRunSummary.textContent = view.views.runTrace.summary
  debugTraceFeedback.textContent = latestDebugEventSummary(view.views.runTrace)

  debugFailureDetail.textContent = view.views.failure.message ?? 'None'
  debugFailureStep.textContent = view.views.failure.stepId ?? 'None'
  debugFailureEvent.textContent = view.views.failure.eventName ?? 'None'
  debugFailureDetailsJson.textContent = view.views.failure.details === undefined
    ? 'None'
    : JSON.stringify(view.views.failure.details, null, 2)
}

function renderDebugLocatorCandidates(
  candidates: readonly LocatorPreviewCandidateView[],
): void {
  debugLocatorCandidates.replaceChildren()

  for (const candidate of candidates) {
    const item = document.createElement('li')
    const label = document.createElement('span')
    const detail = document.createElement('span')

    item.dataset.status = candidate.status
    label.className = 'debug-locator-label'
    label.textContent = candidate.label
    detail.className = 'debug-locator-detail'
    detail.textContent = `${candidate.matchSummary} · ${candidate.status}`
    item.append(label, detail)
    debugLocatorCandidates.append(item)
  }
}

function renderScenarioOptions(
  options: readonly Readonly<{ value: string; label: string }>[],
  selectedScenarioId: string | undefined,
): void {
  scenarioSelect.replaceChildren()

  if (options.length === 0) {
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'No saved scenarios'
    scenarioSelect.append(option)
    return
  }

  for (const optionView of options) {
    const option = document.createElement('option')
    option.value = optionView.value
    option.textContent = optionView.label
    option.selected = optionView.value === selectedScenarioId
    scenarioSelect.append(option)
  }
}

function renderActionFamilyOptions(
  options: readonly SidepanelActionFamilyOptionView[],
  selectedFamily: string,
): void {
  const previous = stepActionFamily.value
  stepActionFamily.replaceChildren()
  stepAction.replaceChildren()

  for (const optionView of options) {
    const toolbarOption = document.createElement('option')
    toolbarOption.value = optionView.value
    toolbarOption.textContent = optionView.label
    toolbarOption.selected = optionView.value === (previous || selectedFamily)
    stepActionFamily.append(toolbarOption)

    const editorOption = document.createElement('option')
    editorOption.value = optionView.value
    editorOption.textContent = optionView.label
    editorOption.selected = optionView.value === selectedFamily
    stepAction.append(editorOption)
  }

  stepAction.disabled = selectedFamily.length === 0
}

function renderStepList(rows: ReturnType<typeof createSidepanelScenarioEditorView>['stepRows']): void {
  stepList.replaceChildren()

  for (const row of rows) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    const title = document.createElement('span')
    const detail = document.createElement('span')
    const status = document.createElement('span')

    button.type = 'button'
    button.dataset.stepIndex = String(row.index)
    button.dataset.selected = row.selected ? 'true' : 'false'
    button.dataset.validation = row.validationStatus
    title.className = 'step-title'
    title.textContent = `${row.index + 1}. ${row.action}`
    detail.className = 'step-detail'
    detail.textContent = [row.targetSummary, row.inputSummary].filter(Boolean).join(' · ')
    status.className = 'step-status'
    status.textContent = row.validationStatus
    button.append(title, detail, status)
    item.append(button)
    stepList.append(item)
  }
}

function renderTargetSlotList(assignment: SidepanelTargetAssignmentView): void {
  targetSlotList.replaceChildren()

  for (const row of assignment.slots) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    const command = document.createElement('button')
    const title = document.createElement('span')
    const detail = document.createElement('span')
    const status = document.createElement('span')

    button.type = 'button'
    button.className = 'target-slot-select'
    button.dataset.targetSlotId = row.id
    button.dataset.selected = row.selected ? 'true' : 'false'
    button.dataset.validation = row.validationStatus
    command.type = 'button'
    command.className = 'target-slot-command'
    command.textContent = targetSlotCommandLabel(row.summary)
    command.disabled = assignment.buttons.start.disabled
    command.dataset.pending = assignment.buttons.start.pending ? 'true' : 'false'
    command.dataset.targetSlotStartId = row.id
    title.className = 'target-slot-title'
    title.textContent = row.label
    detail.className = 'target-slot-detail'
    detail.textContent = row.summary
    status.className = 'target-slot-status'
    status.textContent = row.validationStatus
    button.append(title, detail, status)
    item.append(button, command)
    targetSlotList.append(item)
  }
}

function targetSlotCommandLabel(summary: string): string {
  return summary === 'no locators' || summary === 'current' ? 'Set target' : 'Change target'
}

function renderSelectedStepControlVisibility(
  controls: ReturnType<typeof createSidepanelScenarioEditorView>['selectedStepFields']['controls'],
): void {
  stepInputField.hidden = !controls.textInput
  stepDurationField.hidden = !controls.duration
  stepWaitTextField.hidden = !controls.waitText
  stepScrollPositionField.hidden = !controls.scrollPosition
  targetSlotSection.hidden = !controls.targetSlots
}

function renderIssues(
  list: HTMLUListElement,
  issues: readonly Readonly<{ path: string; message: string }>[],
): void {
  list.replaceChildren()

  for (const issue of issues) {
    const item = document.createElement('li')
    const path = document.createElement('span')
    const message = document.createElement('span')

    path.className = 'issue-path'
    path.textContent = issue.path
    message.textContent = issue.message
    item.title = `${issue.path}: ${issue.message}`
    item.append(path, message)
    list.append(item)
  }
}

function renderStatus(snapshot: SidepanelScenarioEditorSnapshot): void {
  const status = snapshot.currentRun?.status ?? 'idle'
  statusPill.textContent = capitalize(status)
  statusPill.dataset.status = status
}

function renderTargetTabStatus(
  targetTab: SidepanelScenarioShellView['targetTab'],
): void {
  targetTabStatus.textContent = targetTab.summary
  targetTabStatus.dataset.status = targetTab.status
}

function renderShellIssue(issueSummary: string): void {
  const hasIssue = issueSummary !== 'None'
  scenarioShellIssue.hidden = !hasIssue
  scenarioShellIssue.textContent = hasIssue ? issueSummary : ''
}

function renderRecordStatus(
  shell: SidepanelScenarioShellView,
  snapshot: SidepanelScenarioEditorSnapshot,
): void {
  const status = shell.recordStatus ?? 'idle'
  recordStatus.textContent = recordSummary(snapshot)
  recordStatus.dataset.status = status
}

function latestDebugEventSummary(
  traceView: SidepanelDebugDrawerViewModel['views']['runTrace'],
): string {
  if (traceView.latestEventName === undefined) {
    return 'No trace events'
  }

  return [
    traceView.latestEventName,
    traceView.latestEventMessage,
  ].filter((part) => part !== undefined && part.length > 0).join(' · ')
}

function debugDrawerSummaryText(view: SidepanelDebugDrawerViewModel): string {
  if (view.views.failure.message !== undefined) {
    return 'Run failure'
  }

  if (view.views.validation.issueCount > 0) {
    const count = view.views.validation.issueCount
    return `${count} validation issue${count === 1 ? '' : 's'}`
  }

  if (view.views.locator.issueSummary !== 'None') {
    return 'Locator issue'
  }

  return view.views.runTrace.eventCount > 0
    ? view.views.runTrace.summary
    : view.views.validation.summary
}

function recordSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  const record = snapshot.currentRecord
  if (record === undefined) {
    return 'Not recording'
  }

  if (record.status === 'recording') {
    return 'Recording'
  }

  if (record.status === 'failed') {
    return record.message === undefined ? 'Recording failed' : `Recording failed: ${record.message}`
  }

  return record.draftId === undefined ? 'Recording stopped' : 'Draft ready'
}

function applyButtonView(button: HTMLButtonElement, view: SidepanelButtonView): void {
  button.textContent = view.label
  button.disabled = view.disabled
  button.dataset.pending = view.pending ? 'true' : 'false'
}

function documentSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  if (snapshot.draftDocument === undefined) {
    return `${snapshot.scenarios.length} saved`
  }

  const stepCount = snapshot.draftDocument.steps.length
  return `${stepCount} step${stepCount === 1 ? '' : 's'} · ${snapshot.scenarios.length} saved`
}

function selectedStepSummary(snapshot: SidepanelScenarioEditorSnapshot): string {
  const step = snapshot.draftDocument?.steps[snapshot.selectedStepIndex]
  return step === undefined
    ? 'No step selected'
    : `Step ${snapshot.selectedStepIndex + 1} · ${step.action}`
}

function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  if (document.activeElement === element || element.value === value) {
    return
  }

  element.value = value
}

function setSelectValue(element: HTMLSelectElement, value: string): void {
  if (document.activeElement === element || element.value === value) {
    return
  }

  element.value = value
}

function selectedActionFamily(): BuilderStepActionFamily {
  return (stepActionFamily.value || 'click') as BuilderStepActionFamily
}

function isDebugDrawerView(value: string | undefined): value is SidepanelDebugDrawerView {
  return value === 'validation' ||
    value === 'locator' ||
    value === 'run-trace' ||
    value === 'failure'
}

function downloadFile(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function requiredElement<TElement extends HTMLElement>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector)
  if (element === null) {
    throw new Error(`Missing sidepanel element: ${selector}`)
  }

  return element
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}
