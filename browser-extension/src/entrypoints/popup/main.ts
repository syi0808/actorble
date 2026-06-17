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

const commandButtons = document.querySelectorAll<HTMLButtonElement>('[data-command]')
const statusMessage = document.querySelector<HTMLElement>('#status-message')

for (const button of commandButtons) {
  button.addEventListener('click', () => {
    button.dataset.pending = 'true'

    if (button.dataset.command === 'panel') {
      void openSidePanel(button)
      return
    }

    window.setTimeout(() => {
      delete button.dataset.pending
    }, 160)
  })
}

async function openSidePanel(button: HTMLButtonElement): Promise<void> {
  setStatus('Opening panel')

  try {
    const chromeApi = chromeExtension()
    if (chromeApi.sidePanel === undefined) {
      throw new Error('Chrome sidePanel API is unavailable.')
    }

    await chromeApi.sidePanel.open({
      windowId: chromeApi.windows?.WINDOW_ID_CURRENT ?? -2,
    })
    setStatus('Panel opened')
    window.close()
  } catch {
    await openSidePanelFallback()
    setStatus('Panel opened in a tab')
    window.close()
  } finally {
    delete button.dataset.pending
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

function setStatus(message: string): void {
  if (statusMessage !== null) {
    statusMessage.textContent = message
  }
}
