import { browser } from 'wxt/browser'
import {
  createImportedScenarioRunner,
  formatIssue,
  formatIssuePath,
  validateImportedScenarioText,
  type ImportedScenarioRunSnapshot,
} from './imported-scenario-run.js'

const runner = createImportedScenarioRunner({
  async getActiveTab() {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    return activeTab ?? null
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
})

const scenarioJson = requiredElement<HTMLTextAreaElement>('#scenario-json')
const scenarioFile = requiredElement<HTMLInputElement>('#scenario-file')
const validateButton = requiredElement<HTMLButtonElement>('#validate-button')
const runButton = requiredElement<HTMLButtonElement>('#run-button')
const documentSummary = requiredElement<HTMLElement>('#document-summary')
const validationSummary = requiredElement<HTMLElement>('#validation-summary')
const issueList = requiredElement<HTMLUListElement>('#issue-list')
const statusPill = requiredElement<HTMLElement>('#status-pill')
const runId = requiredElement<HTMLElement>('#run-id')
const traceFeedback = requiredElement<HTMLElement>('#trace-feedback')

for (const section of document.querySelectorAll<HTMLElement>('section')) {
  section.tabIndex = 0
}

scenarioJson.addEventListener('input', () => {
  render({
    ...runner.getSnapshot(),
    issues: [],
  })
})

scenarioFile.addEventListener('change', () => {
  void importSelectedFile()
})

validateButton.addEventListener('click', () => {
  const result = runner.validate(scenarioJson.value)
  render(runner.getSnapshot())

  if (result.ok) {
    validationSummary.textContent = 'Ready'
  }
})

runButton.addEventListener('click', () => {
  void runImportedScenario()
})

browser.runtime.onMessage.addListener((message) => {
  if (runner.ingestMessage(message)) {
    render(runner.getSnapshot())
  }
})

render(runner.getSnapshot())

async function importSelectedFile(): Promise<void> {
  const file = scenarioFile.files?.[0]
  if (file === undefined) {
    return
  }

  scenarioJson.value = await file.text()
  const validation = validateImportedScenarioText(scenarioJson.value)
  render(
    validation.ok
      ? {
          ...runner.getSnapshot(),
          document: validation.value.document,
          issues: [],
        }
      : {
          ...runner.getSnapshot(),
          issues: validation.issues,
        },
  )
}

async function runImportedScenario(): Promise<void> {
  const run = runner.run(scenarioJson.value)
  render(runner.getSnapshot())
  await run
  render(runner.getSnapshot())
}

function render(snapshot: ImportedScenarioRunSnapshot): void {
  const hasJson = scenarioJson.value.trim().length > 0

  validateButton.disabled = snapshot.pending || !hasJson
  runButton.disabled = snapshot.pending || !hasJson
  validateButton.dataset.pending = snapshot.pending ? 'true' : 'false'
  runButton.dataset.pending = snapshot.pending ? 'true' : 'false'

  documentSummary.textContent = documentLabel(snapshot)
  validationSummary.textContent = validationLabel(snapshot)
  renderIssues(snapshot)
  renderStatus(snapshot)
  runId.textContent = snapshot.runId ?? 'None'
  traceFeedback.textContent = traceLabel(snapshot)
}

function renderIssues(snapshot: ImportedScenarioRunSnapshot): void {
  issueList.replaceChildren()

  for (const issue of snapshot.issues) {
    const item = document.createElement('li')
    const path = document.createElement('span')
    const message = document.createElement('span')

    path.className = 'issue-path'
    path.textContent = formatIssuePath(issue.path ?? [])
    message.textContent = issue.message
    item.title = formatIssue(issue)
    item.append(path, message)
    issueList.append(item)
  }
}

function renderStatus(snapshot: ImportedScenarioRunSnapshot): void {
  statusPill.textContent = capitalize(snapshot.status)
  statusPill.dataset.status = snapshot.status
}

function documentLabel(snapshot: ImportedScenarioRunSnapshot): string {
  if (snapshot.document === undefined) {
    return 'No scenario loaded'
  }

  const name = snapshot.document.name ?? snapshot.document.id ?? 'Imported scenario'
  const stepCount = snapshot.document.steps.length
  return `${name} · ${stepCount} step${stepCount === 1 ? '' : 's'}`
}

function validationLabel(snapshot: ImportedScenarioRunSnapshot): string {
  if (snapshot.pending) {
    return 'Running'
  }

  if (snapshot.issues.length > 0) {
    return `${snapshot.issues.length} issue${snapshot.issues.length === 1 ? '' : 's'}`
  }

  if (snapshot.document !== undefined) {
    return 'Ready'
  }

  return 'Idle'
}

function traceLabel(snapshot: ImportedScenarioRunSnapshot): string {
  if (snapshot.latestTrace !== undefined) {
    const details =
      snapshot.latestTrace.message ??
      (snapshot.latestTrace.stepId === undefined ? undefined : snapshot.latestTrace.stepId)
    return details === undefined
      ? snapshot.latestTrace.name
      : `${snapshot.latestTrace.name}: ${details}`
  }

  if (snapshot.message !== undefined) {
    return snapshot.message
  }

  return snapshot.status === 'failed' ? 'Run failed' : 'No trace event'
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
