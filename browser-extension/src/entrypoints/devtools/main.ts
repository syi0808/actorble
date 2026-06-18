import { browser } from 'wxt/browser'

type DevtoolsPanelBrowser = typeof browser & Readonly<{
  devtools?: Readonly<{
    panels?: Readonly<{
      create(title: string, iconPath: string, pagePath: string): Promise<unknown> | void
    }>
  }>
}>

const devtoolsBrowser = browser as DevtoolsPanelBrowser

try {
  void devtoolsBrowser.devtools?.panels?.create(
    'Actorble Trace',
    '',
    'devtools-panel.html',
  )
} catch (error) {
  console.warn('Actorble DevTools panel could not be registered.', error)
}
