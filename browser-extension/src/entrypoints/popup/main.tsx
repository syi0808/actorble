import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'
import { createWxtScenarioStorageRepository } from '../../storage/index.js'
import {
  Button,
  BrandMark,
  Field,
  IconButton,
  Select,
  UiProvider,
} from '../../ui/components.js'
import {
  createPopupRunControls,
  createPopupRunControlsView,
  type PopupRunControlsSnapshot,
} from './run-controls.js'
import {
  recordedDraftIdFromRecordStopResult,
  sidepanelPathForHandoff,
} from './sidepanel-handoff.js'

type ChromeSidePanelApi = Readonly<{
  open(options: Readonly<{ windowId?: number }>): Promise<void>
  setOptions?(options: Readonly<{
    path?: string
    tabId?: number
    enabled?: boolean
  }>): Promise<void>
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

function PopupApp(): ReactElement {
  const [snapshot, setSnapshot] = useState<PopupRunControlsSnapshot>(() => controls.getSnapshot())
  const [panelPending, setPanelPending] = useState(false)
  const [panelMessage, setPanelMessage] = useState<string | undefined>()
  const view = createPopupRunControlsView(snapshot)
  const statusMessage = panelMessage ?? view.statusMessage

  const renderSnapshot = useCallback(() => {
    setSnapshot(controls.getSnapshot())
  }, [])

  const refreshPopup = useCallback(async () => {
    const refresh = controls.refresh()
    renderSnapshot()
    await refresh
    renderSnapshot()
  }, [renderSnapshot])

  const runAction = useCallback(async <TResult,>(
    action: () => Promise<TResult>,
  ): Promise<TResult> => {
    const operation = action()
    renderSnapshot()
    const result = await operation
    renderSnapshot()
    return result
  }, [renderSnapshot])

  const openSidePanel = useCallback(async (recordedDraftId?: string): Promise<void> => {
    setPanelPending(true)
    setPanelMessage('Opening panel')

    try {
      const chromeApi = chromeExtension()
      if (chromeApi.sidePanel === undefined) {
        throw new Error('Chrome sidePanel API is unavailable.')
      }

      const targetTabId = await getCurrentTabId()
      const path = sidepanelPathForHandoff({
        targetTabId,
        recordedDraftId,
      })
      if (chromeApi.sidePanel.setOptions === undefined && recordedDraftId !== undefined) {
        throw new Error('Chrome sidePanel setOptions API is unavailable.')
      }
      await chromeApi.sidePanel.setOptions?.({
        path,
        ...(targetTabId === undefined ? {} : { tabId: targetTabId }),
        enabled: true,
      })
      await chromeApi.sidePanel.open({
        windowId: chromeApi.windows?.WINDOW_ID_CURRENT ?? -2,
      })
      setPanelMessage('Panel opened')
      window.close()
    } catch {
      await openSidePanelFallback(recordedDraftId)
      setPanelMessage('Panel opened in a tab')
      window.close()
    } finally {
      setPanelPending(false)
    }
  }, [])

  useEffect(() => {
    const listener = (message: unknown): void => {
      if (controls.ingestMessage(message)) {
        renderSnapshot()
      }
    }

    browser.runtime.onMessage.addListener(listener)
    void refreshPopup()

    return () => {
      browser.runtime.onMessage.removeListener(listener)
    }
  }, [refreshPopup, renderSnapshot])

  return (
    <UiProvider>
      <main>
        <header className="app-header">
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <p className="eyebrow">Actorble</p>
              <h1>Quick run</h1>
            </div>
          </div>
          <IconButton
            disabled={panelPending}
            icon="panel-right"
            label="Open panel"
            onClick={() => void openSidePanel()}
            pending={panelPending}
            variant="subtle"
          />
        </header>

        <section className="tab-status" aria-label="Current tab status">
          <span className="status-dot" data-tone={view.statusTone} aria-hidden="true" />
          <span>{statusMessage}</span>
        </section>

        <Field label="Scenario">
          <Select
            aria-label="Scenario"
            disabled={view.scenarioSelectDisabled}
            onChange={(event) => {
              controls.selectScenario(event.currentTarget.value)
              renderSnapshot()
            }}
            value={view.selectedScenarioId ?? ''}
          >
            {view.scenarioOptions.length === 0
              ? <option value="">No saved scenarios</option>
              : view.scenarioOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
          </Select>
        </Field>

        <dl className="run-fields" aria-label="Run status">
          <div>
            <dt>Last run</dt>
            <dd>{view.lastRunText}</dd>
          </div>
          <div>
            <dt>Current run</dt>
            <dd>{view.currentRunText}</dd>
          </div>
          <div>
            <dt>Recording</dt>
            <dd>{view.recordText}</dd>
          </div>
        </dl>

        <div className="primary-action" aria-label="Primary action">
          <Button
            disabled={view.buttons.run.disabled}
            icon="play"
            onClick={() => void runAction(() => controls.runSelectedScenario())}
            pending={view.buttons.run.pending}
            variant="primary"
          >
            {view.buttons.run.label}
          </Button>
        </div>

        <div className="secondary-actions" aria-label="Secondary actions">
          <Button
            disabled={view.buttons.record.disabled}
            icon={snapshot.currentRecord?.status === 'recording' ? 'square' : 'record'}
            onClick={() => {
              const before = controls.getSnapshot()
              void (async () => {
                const result = await runAction(() => (
                  before.currentRecord?.status === 'recording'
                    ? controls.stopRecording()
                    : controls.startRecording()
                ))
                const recordedDraftId = recordedDraftIdFromRecordStopResult(result)
                if (
                  before.currentRecord?.status === 'recording' &&
                  recordedDraftId !== undefined
                ) {
                  await openSidePanel(recordedDraftId)
                }
              })()
            }}
            pending={view.buttons.record.pending}
            variant={snapshot.currentRecord?.status === 'recording' ? 'danger' : 'secondary'}
          >
            {view.buttons.record.label}
          </Button>
        </div>

        {isActiveRunStatus(snapshot.currentRun?.status) ? (
          <div className="run-control-bar" aria-label="Active run controls">
            <Button
              disabled={view.buttons.pauseResume.disabled}
              icon={snapshot.currentRun?.status === 'paused' ? 'play' : 'pause'}
              onClick={() => void runAction(() => (
                snapshot.currentRun?.status === 'paused'
                  ? controls.resumeCurrentRun()
                  : controls.pauseCurrentRun()
              ))}
              pending={view.buttons.pauseResume.pending}
              variant="secondary"
            >
              {view.buttons.pauseResume.label}
            </Button>
            <Button
              disabled={view.buttons.stop.disabled}
              icon="square"
              onClick={() => void runAction(() => controls.stopCurrentRun())}
              pending={view.buttons.stop.pending}
              variant="danger"
            >
              {view.buttons.stop.label}
            </Button>
          </div>
        ) : null}
      </main>
    </UiProvider>
  )
}

function isActiveRunStatus(status: string | undefined): boolean {
  return status === 'running' || status === 'paused'
}

async function openSidePanelFallback(recordedDraftId?: string): Promise<void> {
  const chromeApi = chromeExtension()
  const targetTabId = await getCurrentTabId()
  const path = sidepanelPathForHandoff({
    targetTabId,
    recordedDraftId,
  })
  const url = chromeApi.runtime?.getURL(path) ?? `/${path}`

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

const root = document.querySelector('#root')
if (root === null) {
  throw new Error('Missing popup root element.')
}

createRoot(root).render(<PopupApp />)
