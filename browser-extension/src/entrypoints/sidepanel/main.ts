import { browser } from 'wxt/browser'
import {
  createLocatorPreviewCandidateViews,
  createLocatorPreviewer,
  type LocatorPreviewCandidateView,
  type LocatorPreviewSnapshot,
  type LocatorPreviewStatus,
} from '../../inspector/locator-preview.js'
import {
  createTargetPicker,
  createTargetPickerView,
} from '../../inspector/target-picker.js'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import type { TraceRunDisplayView } from '../../trace/index.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelButtonView,
  type SidepanelActionFamilyOptionView,
  type SidepanelScenarioEditorSnapshot,
  type SidepanelTargetSlotRowView,
} from './scenario-editor.js'
import type { BuilderStepActionFamily } from '../../builder/index.js'

const scenarioRepository = createWxtScenarioStorageRepository()
const targetTabId = targetTabIdFromLocation(window.location)
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

const scenarioSelect = requiredElement<HTMLSelectElement>('#scenario-select')
const scenarioFile = requiredElement<HTMLInputElement>('#scenario-file')
const exportFormat = requiredElement<HTMLSelectElement>('#export-format')
const workflowStatus = requiredElement<HTMLElement>('#workflow-status')
const scenarioSummary = requiredElement<HTMLElement>('#scenario-summary')
const createScenarioButton = requiredElement<HTMLButtonElement>('#create-scenario-button')
const scenarioName = requiredElement<HTMLInputElement>('#scenario-name')
const scenarioDescription = requiredElement<HTMLTextAreaElement>('#scenario-description')
const validateButton = requiredElement<HTMLButtonElement>('#validate-button')
const saveButton = requiredElement<HTMLButtonElement>('#save-button')
const exportButton = requiredElement<HTMLButtonElement>('#export-button')
const runButton = requiredElement<HTMLButtonElement>('#run-button')
const recordButton = requiredElement<HTMLButtonElement>('#record-button')
const recordStatus = requiredElement<HTMLElement>('#record-status')
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
const stepInput = requiredElement<HTMLInputElement>('#step-input')
const stepDuration = requiredElement<HTMLInputElement>('#step-duration')
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
const validationSummary = requiredElement<HTMLElement>('#validation-summary')
const issueList = requiredElement<HTMLUListElement>('#issue-list')
const statusPill = requiredElement<HTMLElement>('#status-pill')
const runId = requiredElement<HTMLElement>('#run-id')
const runSummaryOutput = requiredElement<HTMLElement>('#run-summary')
const traceFeedback = requiredElement<HTMLElement>('#trace-feedback')
const failureDetail = requiredElement<HTMLElement>('#failure-detail')

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
  locatorPreviewer.clear()
  void runTargetPickerAction(() => targetPicker.start(editor.getSnapshot().selectedScenarioId))
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

  editor.applyLocatorToSelectedStep(candidate.locator)
  render(editor.getSnapshot())
})

browser.runtime.onMessage.addListener((message) => {
  const editorHandled = editor.ingestMessage(message)
  const pickerHandled = targetPicker.ingestMessage(message)

  if (editorHandled || pickerHandled) {
    render(editor.getSnapshot())
  }

  if (pickerHandled) {
    const selected = targetPicker.getSnapshot().selected
    if (selected !== undefined) {
      void runLocatorPreviewAction(() => (
        locatorPreviewer.previewTarget(selected.target, editor.getSnapshot().selectedScenarioId)
      ))
    }
  }
})

render(editor.getSnapshot())
void runAction(async () => {
  await editor.refresh()
  await editor.loadRecordedDraft()
})

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

  workflowStatus.textContent = view.workflow.summary
  renderScenarioOptions(view.scenarioOptions, view.selectedScenarioId)
  renderActionFamilyOptions(view.actionFamilyOptions, view.selectedStepFields.actionFamily)
  scenarioSummary.textContent = documentSummary(snapshot)
  setInputValue(scenarioName, view.documentFields.name)
  setInputValue(scenarioDescription, view.documentFields.description)
  renderStepList(view.stepRows)
  renderTargetSlotList(view.targetSlotRows)
  stepSummary.textContent = selectedStepSummary(snapshot)
  setSelectValue(stepAction, view.selectedStepFields.actionFamily)
  setInputValue(stepNote, view.selectedStepFields.note)
  setInputValue(stepInput, view.selectedStepFields.input)
  setInputValue(stepDuration, view.selectedStepFields.duration)
  setInputValue(stepTargetJson, view.selectedStepFields.targetJson)
  setInputValue(stepFromJson, view.selectedStepFields.fromJson)
  setInputValue(stepToJson, view.selectedStepFields.toJson)
  setInputValue(stepInputJson, view.selectedStepFields.inputJson)
  setInputValue(stepOptionsJson, view.selectedStepFields.optionsJson)
  validationSummary.textContent = view.validationSummary
  renderIssues(view.issueViews)
  renderStatus(snapshot)
  recordStatus.textContent = recordSummary(snapshot)
  runSummaryOutput.textContent = view.runSummary
  traceFeedback.textContent = latestEventSummary(view.traceView)
  failureDetail.textContent = failureSummary(view.traceView)
  renderTargetPicker(view)
  renderLocatorPreview()

  scenarioSelect.disabled = snapshot.pendingAction !== null || view.scenarioOptions.length === 0
  scenarioFile.disabled = view.buttons.import.disabled
  exportFormat.disabled = view.buttons.export.disabled
  applyButtonView(createScenarioButton, view.buttons.create)
  applyButtonView(addStepButton, view.buttons.addStep)
  applyButtonView(insertStepButton, view.buttons.insertStep)
  applyButtonView(duplicateStepButton, view.buttons.duplicateStep)
  applyButtonView(moveStepUpButton, view.buttons.moveStepUp)
  applyButtonView(moveStepDownButton, view.buttons.moveStepDown)
  applyButtonView(deleteStepButton, view.buttons.deleteStep)
  applyButtonView(validateButton, view.buttons.validate)
  applyButtonView(saveButton, view.buttons.save)
  applyButtonView(exportButton, view.buttons.export)
  applyButtonView(runButton, view.buttons.run)
  applyButtonView(recordButton, view.buttons.record)
  applyButtonView(dryRunButton, view.buttons.dryRun)
}

function renderTargetPicker(
  editorView: ReturnType<typeof createSidepanelScenarioEditorView>,
): void {
  const view = createTargetPickerView(targetPicker.getSnapshot())
  targetPickerStatus.textContent = view.statusSummary
  targetPickerSelected.textContent = view.selectedSummary
  targetPickerIssues.textContent = view.issueSummary
  applyButtonView(targetPickerStartButton, view.buttons.start)
  applyButtonView(targetPickerStopButton, view.buttons.stop)
  targetPickerStartButton.disabled =
    targetPickerStartButton.disabled ||
    editorView.workflow.selectedTargetSlotId === undefined ||
    editorView.workflow.status === 'empty'
}

function renderLocatorPreview(): void {
  const snapshot = locatorPreviewer.getSnapshot()
  locatorPreviewStatus.textContent = locatorPreviewStatusSummary(snapshot)
  locatorPreviewIssues.textContent = issueSummary(snapshot.issues)
  renderLocatorPreviewCandidates(createLocatorPreviewCandidateViews(snapshot.candidates))
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

function renderTargetSlotList(rows: readonly SidepanelTargetSlotRowView[]): void {
  targetSlotList.replaceChildren()

  for (const row of rows) {
    const item = document.createElement('li')
    const button = document.createElement('button')
    const title = document.createElement('span')
    const detail = document.createElement('span')
    const status = document.createElement('span')

    button.type = 'button'
    button.dataset.targetSlotId = row.id
    button.dataset.selected = row.selected ? 'true' : 'false'
    button.dataset.validation = row.validationStatus
    title.className = 'target-slot-title'
    title.textContent = row.label
    detail.className = 'target-slot-detail'
    detail.textContent = row.summary
    status.className = 'target-slot-status'
    status.textContent = row.validationStatus
    button.append(title, detail, status)
    item.append(button)
    targetSlotList.append(item)
  }
}

function renderIssues(issues: readonly Readonly<{ path: string; message: string }>[]): void {
  issueList.replaceChildren()

  for (const issue of issues) {
    const item = document.createElement('li')
    const path = document.createElement('span')
    const message = document.createElement('span')

    path.className = 'issue-path'
    path.textContent = issue.path
    message.textContent = issue.message
    item.title = `${issue.path}: ${issue.message}`
    item.append(path, message)
    issueList.append(item)
  }
}

function renderStatus(snapshot: SidepanelScenarioEditorSnapshot): void {
  const status = snapshot.currentRun?.status ?? 'idle'
  statusPill.textContent = capitalize(status)
  statusPill.dataset.status = status
  runId.textContent = snapshot.currentRun?.runId ?? 'None'
}

function latestEventSummary(traceView: TraceRunDisplayView | undefined): string {
  const event = traceView?.latestEvent
  if (event === undefined) {
    return 'No trace events'
  }

  return [
    event.name,
    event.stepId === undefined ? undefined : `step ${event.stepId}`,
    event.message,
  ].filter((part) => part !== undefined && part.length > 0).join(' · ')
}

function failureSummary(traceView: TraceRunDisplayView | undefined): string {
  const failure = traceView?.failure
  if (failure === undefined) {
    return 'None'
  }

  return [
    failure.message,
    failure.stepId === undefined ? undefined : `step ${failure.stepId}`,
    failure.eventName,
  ].filter((part) => part !== undefined && part.length > 0).join(' · ')
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

function locatorPreviewStatusSummary(snapshot: LocatorPreviewSnapshot): string {
  if (snapshot.status === 'ready') {
    const count = snapshot.candidates.length
    return `${count} candidate${count === 1 ? '' : 's'}`
  }

  return locatorPreviewStatusLabel(snapshot.status)
}

function locatorPreviewStatusLabel(status: LocatorPreviewStatus): string {
  switch (status) {
    case 'idle':
      return 'No preview'
    case 'previewing':
      return 'Previewing'
    case 'ready':
      return 'Ready'
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

function targetTabIdFromLocation(location: Location): number | undefined {
  const rawValue = new URL(location.href).searchParams.get('targetTabId')
  if (rawValue === null) {
    return undefined
  }

  const value = Number(rawValue)
  return Number.isInteger(value) && value > 0 ? value : undefined
}
