import { browser } from 'wxt/browser'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import {
  createSidepanelScenarioEditor,
  createSidepanelScenarioEditorView,
  type SidepanelButtonView,
  type SidepanelScenarioEditorSnapshot,
} from './scenario-editor.js'

const scenarioRepository = createWxtScenarioStorageRepository()
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
  targetTabId: targetTabIdFromLocation(window.location),
})

const scenarioSelect = requiredElement<HTMLSelectElement>('#scenario-select')
const scenarioFile = requiredElement<HTMLInputElement>('#scenario-file')
const scenarioSummary = requiredElement<HTMLElement>('#scenario-summary')
const scenarioName = requiredElement<HTMLInputElement>('#scenario-name')
const scenarioDescription = requiredElement<HTMLTextAreaElement>('#scenario-description')
const validateButton = requiredElement<HTMLButtonElement>('#validate-button')
const saveButton = requiredElement<HTMLButtonElement>('#save-button')
const exportButton = requiredElement<HTMLButtonElement>('#export-button')
const runButton = requiredElement<HTMLButtonElement>('#run-button')
const stepList = requiredElement<HTMLUListElement>('#step-list')
const stepSummary = requiredElement<HTMLElement>('#step-summary')
const stepAction = requiredElement<HTMLInputElement>('#step-action')
const stepNote = requiredElement<HTMLInputElement>('#step-note')
const stepInput = requiredElement<HTMLInputElement>('#step-input')
const stepDuration = requiredElement<HTMLInputElement>('#step-duration')
const stepTargetJson = requiredElement<HTMLTextAreaElement>('#step-target-json')
const stepFromJson = requiredElement<HTMLTextAreaElement>('#step-from-json')
const stepToJson = requiredElement<HTMLTextAreaElement>('#step-to-json')
const stepInputJson = requiredElement<HTMLTextAreaElement>('#step-input-json')
const dryRunButton = requiredElement<HTMLButtonElement>('#dry-run-button')
const validationSummary = requiredElement<HTMLElement>('#validation-summary')
const issueList = requiredElement<HTMLUListElement>('#issue-list')
const statusPill = requiredElement<HTMLElement>('#status-pill')
const runId = requiredElement<HTMLElement>('#run-id')
const traceFeedback = requiredElement<HTMLElement>('#trace-feedback')

for (const section of document.querySelectorAll<HTMLElement>('section')) {
  section.tabIndex = 0
}

scenarioSelect.addEventListener('change', () => {
  editor.selectScenario(scenarioSelect.value)
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

dryRunButton.addEventListener('click', () => {
  void runAction(() => editor.dryRunSelectedStep())
})

browser.runtime.onMessage.addListener((message) => {
  if (editor.ingestMessage(message)) {
    render(editor.getSnapshot())
  }
})

render(editor.getSnapshot())
void runAction(() => editor.refresh())

async function runAction(action: () => Promise<unknown>): Promise<void> {
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
  const operation = editor.exportSelected()
  render(editor.getSnapshot())
  const exported = await operation
  if (exported.ok) {
    downloadJson(exported.value.filename, exported.value.jsonText)
  }
  render(editor.getSnapshot())
}

function render(snapshot: SidepanelScenarioEditorSnapshot): void {
  const view = createSidepanelScenarioEditorView(snapshot)

  renderScenarioOptions(view.scenarioOptions, view.selectedScenarioId)
  scenarioSummary.textContent = documentSummary(snapshot)
  setInputValue(scenarioName, view.documentFields.name)
  setInputValue(scenarioDescription, view.documentFields.description)
  renderStepList(view.stepRows)
  stepSummary.textContent = selectedStepSummary(snapshot)
  setInputValue(stepAction, view.selectedStepFields.action)
  setInputValue(stepNote, view.selectedStepFields.note)
  setInputValue(stepInput, view.selectedStepFields.input)
  setInputValue(stepDuration, view.selectedStepFields.duration)
  setInputValue(stepTargetJson, view.selectedStepFields.targetJson)
  setInputValue(stepFromJson, view.selectedStepFields.fromJson)
  setInputValue(stepToJson, view.selectedStepFields.toJson)
  setInputValue(stepInputJson, view.selectedStepFields.inputJson)
  validationSummary.textContent = view.validationSummary
  renderIssues(view.issueViews)
  renderStatus(snapshot)
  traceFeedback.textContent = view.runSummary

  scenarioSelect.disabled = snapshot.pendingAction !== null || view.scenarioOptions.length === 0
  scenarioFile.disabled = view.buttons.import.disabled
  applyButtonView(validateButton, view.buttons.validate)
  applyButtonView(saveButton, view.buttons.save)
  applyButtonView(exportButton, view.buttons.export)
  applyButtonView(runButton, view.buttons.run)
  applyButtonView(dryRunButton, view.buttons.dryRun)
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

function downloadJson(filename: string, jsonText: string): void {
  const url = URL.createObjectURL(new Blob([jsonText], { type: 'application/json' }))
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
