import { createActorble } from '@actorble/browser';
import { browser } from 'wxt/browser';
import { createAsyncExtensionMessageListener } from '../../messaging/async-message-listener.js';
import { isExtensionMessageOfKind } from '../../messaging/index.js';
import { createContentInspectorHost, createDomInspectorAdapter } from './inspector-host.js';
import { createContentLocatorPreviewHost } from './locator-preview-host.js';
import { createContentReadinessHost } from './readiness.js';
import {
  createContentRecorderHost,
  createDomRecorderEventCapturePort,
  createRecordEventFlushSender,
} from './recorder-host.js';
import { createContentRuntimeHost } from './runtime-host.js';

type RuntimeFrameIdApi = Readonly<{
  getFrameId?(target: unknown): number;
}>;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    const inspectorHost = createContentInspectorHost({
      adapter: createDomInspectorAdapter(),
      sendMessage(message) {
        return browser.runtime.sendMessage(message);
      },
    });
    const runtimeHost = createContentRuntimeHost({
      createActorble,
      sendMessage(message) {
        return browser.runtime.sendMessage(message);
      },
    });
    const locatorPreviewHost = createContentLocatorPreviewHost({
      createActorble,
    });
    const recorderHost = createContentRecorderHost({
      capture: createDomRecorderEventCapturePort({
        flushEvents: createRecordEventFlushSender((message) => {
          return browser.runtime.sendMessage(message);
        }),
      }),
    });
    const runtimeFrameId = browser.runtime as RuntimeFrameIdApi;
    const readinessHost = createContentReadinessHost({
      sendMessage(message) {
        return browser.runtime.sendMessage(message);
      },
      getFrameId(target) {
        return runtimeFrameId.getFrameId?.(target) ?? -1;
      },
      frameTarget: globalThis,
      url: globalThis.location.href,
    });

    browser.runtime.onMessage.addListener(
      createAsyncExtensionMessageListener((message) => {
        if (isExtensionMessageOfKind(message, 'content:ready')) {
          return readinessHost.handleMessage(message);
        }

        if (
          isExtensionMessageOfKind(message, 'inspector:start') ||
          isExtensionMessageOfKind(message, 'inspector:stop')
        ) {
          return inspectorHost.handleMessage(message);
        }

        if (isExtensionMessageOfKind(message, 'locator:preview')) {
          return locatorPreviewHost.handleMessage(message);
        }

        if (
          isExtensionMessageOfKind(message, 'record:start') ||
          isExtensionMessageOfKind(message, 'record:stop')
        ) {
          return recorderHost.handleMessage(message);
        }

        return runtimeHost.handleMessage(message);
      }),
    );

    void readinessHost.emitReady();
  },
});
