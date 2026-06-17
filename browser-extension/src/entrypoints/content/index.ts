import { createActorble } from '@actorble/browser'
import { browser } from 'wxt/browser'
import { createContentRuntimeHost } from './runtime-host.js'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const runtimeHost = createContentRuntimeHost({
      createActorble,
      sendMessage(message) {
        return browser.runtime.sendMessage(message)
      },
    })

    browser.runtime.onMessage.addListener((message) => runtimeHost.handleMessage(message))
  },
})
