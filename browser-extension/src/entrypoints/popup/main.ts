import { browser } from 'wxt/browser'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import {
  createPopupRunControls,
  createPopupRunControlsView,
  type PopupRunControlsSnapshot,
} from './run-controls.js'

type ChromeSidePanelApi = Readonly<{
  open(options: Readonly<{ windowId?: number }>): Promise<void>
}>

type ChromeTabsApi = Readonly<{
  query(options: Readonly<{ active: boolean; currentWindow: boolean }>): Promise<readonly Readonly<{ id?: number }>[]> | readonly Readonly<{ id?: number }>[]
  create(options: Readonly<{ url: string }>): Promise<unknown> | void
}>

type ChromeRuntimeApi = Readonly<{
  getURL(path: string): string
}>

type ChromeWindowsApi = Readonly<{
  WINDOW_ID_CURRENT?: number
}>

type ChromeExtensionApi = Readonly<{
  sidePanel?: ChromeSidePanelApi
  tabs?: ChromeTabsApi
  runtime?: ChromeRuntimeApi
  windows?: ChromeWindowsApi
}>

const scenarioRepository = createWxtScenarioStorageRepository()
const controls = createPopupRunControls({
  listScenarios() {
    return scenarioRepository.list()
  },
  sendMessage(message) {
    return browser.runtime.sendMessage(message)
  },
})

const statusDot = requiredElement<HTMLElement>('#status-dot')
const statusMessage = requiredElement<HTMLElement>('#status-message')
const scenarioSelect = requiredElement<HTMLSelectElement>('#scenario-select')
const lastRunStatus = requiredElement<HTMLElement>('#last-run-status')
const currentRunStatus = requiredElement<HTMLElement>('#current-run-status')
const recordStatus = requiredElement<HTMLElement>('#record-status')
const runButton = requiredElement<HTMLButtonElement>('#run-button')
const recordButton = requiredElement<HTMLButtonElement>('#record-button')
const pauseResumeButton = requiredElement<HTMLButtonElement>('#pause-resume-button')
const stopButton = requiredElement<HTMLButtonElement>('#stop-button')
const panelButton = requiredElement<HTMLButtonElement>('#panel-button')

scenarioSelect.addEventListener('change', () => {
  controls.selectScenario(scenarioSelect.value)
  void refreshPopup()
})

runButton.addEventListener('click', () => {
  void runAction(() => controls.runSelectedScenario())
})

recordButton.addEventListener('click', () => {
  const snapshot = controls.getSnapshot()
  void (async () => {
    const result = await runAction(() => (
      snapshot.currentRecord?.status === 'recording'
        ? controls.stopRecording()
        : controls.startRecording()
    ))

    if (
      snapshot.currentRecord?.status === 'recording' &&
      isRecordStopDraftResult(result)
    ) {
      await openSidePanel(panelButton)
    }
  })()
})

pauseResumeButton.addEventListener('click', () => {
  const snapshot = controls.getSnapshot()
  void runAction(() => (
    snapshot.currentRun?.status === 'paused'
      ? controls.resumeCurrentRun()
      : controls.pauseCurrentRun()
  ))
})

stopButton.addEventListener('click', () => {
  void runAction(() => controls.stopCurrentRun())
})

panelButton.addEventListener('click', () => {
  void openSidePanel(panelButton)
})

browser.runtime.onMessage.addListener((message) => {
  if (controls.ingestMessage(message)) {
    render(controls.getSnapshot())
  }
})

render(controls.getSnapshot())
void refreshPopup()

async function refreshPopup(): Promise<void> {
  const refresh = controls.refresh()
  render(controls.getSnapshot())
  await refresh
  render(controls.getSnapshot())
}

async function runAction(
  action: () => Promise<unknown>,
): Promise<unknown> {
  const operation = action()
  render(controls.getSnapshot())
  const result = await operation
  render(controls.getSnapshot())
  return result
}

function isRecordStopDraftResult(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  const result = value as Readonly<{
    ok?: unknown
    value?: Readonly<{
      kind?: unknown
      recordedDraft?: unknown
    }>
  }>

  return (
    result.ok === true &&
    result.value?.kind === 'record:stop' &&
    result.value.recordedDraft !== undefined
  )
}

function render(snapshot: PopupRunControlsSnapshot): void {
  const view = createPopupRunControlsView(snapshot)

  statusDot.dataset.tone = view.statusTone
  statusMessage.textContent = view.statusMessage
  renderScenarioOptions(view.scenarioOptions, view.selectedScenarioId)

  scenarioSelect.disabled = view.scenarioSelectDisabled
  lastRunStatus.textContent = view.lastRunText
  currentRunStatus.textContent = view.currentRunText
  recordStatus.textContent = view.recordText
  applyButtonView(runButton, view.buttons.run)
  applyButtonView(recordButton, view.buttons.record)
  applyButtonView(pauseResumeButton, view.buttons.pauseResume)
  applyButtonView(stopButton, view.buttons.stop)
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

function applyButtonView(
  button: HTMLButtonElement,
  view: Readonly<{ label: string; disabled: boolean; pending: boolean }>,
): void {
  button.textContent = view.label
  button.disabled = view.disabled
  button.dataset.pending = view.pending ? 'true' : 'false'
}

async function openSidePanel(button: HTMLButtonElement): Promise<void> {
  button.dataset.pending = 'true'
  button.disabled = true
  statusMessage.textContent = 'Opening panel'

  try {
    const chromeApi = chromeExtension()
    if (chromeApi.sidePanel === undefined) {
      throw new Error('Chrome sidePanel API is unavailable.')
    }

    await chromeApi.sidePanel.open({
      windowId: chromeApi.windows?.WINDOW_ID_CURRENT ?? -2,
    })
    statusMessage.textContent = 'Panel opened'
    window.close()
  } catch {
    await openSidePanelFallback()
    statusMessage.textContent = 'Panel opened in a tab'
    window.close()
  } finally {
    button.dataset.pending = 'false'
    button.disabled = false
  }
}

async function openSidePanelFallback(): Promise<void> {
  const chromeApi = chromeExtension()
  const targetTabId = await getCurrentTabId()
  const url = chromeApi.runtime?.getURL(
    targetTabId === undefined ? 'sidepanel.html' : `sidepanel.html?targetTabId=${targetTabId}`,
  ) ?? '/sidepanel.html'

  await chromeApi.tabs?.create?.({ url })
}

async function getCurrentTabId(): Promise<number | undefined> {
  const chromeApi = chromeExtension()
  const tabs = await chromeApi.tabs?.query?.({
    active: true,
    currentWindow: true,
  }) ?? []
  const [tab] = tabs

  return tab?.id
}

function chromeExtension(): ChromeExtensionApi {
  return (globalThis as typeof globalThis & Readonly<{ chrome?: ChromeExtensionApi }>).chrome ?? {}
}

function requiredElement<TElement extends HTMLElement>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector)
  if (element === null) {
    throw new Error(`Missing popup element: ${selector}`)
  }

  return element
}
