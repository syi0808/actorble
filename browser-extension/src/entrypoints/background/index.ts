import { browser } from 'wxt/browser'
import {
  createBackgroundOrchestrator,
  createWxtBackgroundBrowserHost,
} from './orchestration.js'

export default defineBackground(() => {
  const orchestrator = createBackgroundOrchestrator(
    createWxtBackgroundBrowserHost(browser),
  )

  browser.runtime.onMessage.addListener((message) => orchestrator.handleMessage(message))
})
