import { createActorble } from '@actorble/browser'
import { browser } from 'wxt/browser'
import { isExtensionMessageOfKind } from '../../messaging/index.js'
import { createContentInspectorHost, createDomInspectorAdapter } from './inspector-host.js'
import { createContentRuntimeHost } from './runtime-host.js'

export default defineContentScript({
  matches: ['http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const inspectorHost = createContentInspectorHost({
      adapter: createDomInspectorAdapter(),
      sendMessage(message) {
        return browser.runtime.sendMessage(message)
      },
    })
    const runtimeHost = createContentRuntimeHost({
      createActorble,
      sendMessage(message) {
        return browser.runtime.sendMessage(message)
      },
    })

    browser.runtime.onMessage.addListener((message) => {
      if (
        isExtensionMessageOfKind(message, 'inspector:start') ||
        isExtensionMessageOfKind(message, 'inspector:stop')
      ) {
        return inspectorHost.handleMessage(message)
      }

      return runtimeHost.handleMessage(message)
    })
  },
})
