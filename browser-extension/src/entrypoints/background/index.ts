import { browser } from 'wxt/browser';
import { createAsyncExtensionMessageListener } from '../../messaging/async-message-listener.js';
import { createBackgroundOrchestrator, createWxtBackgroundBrowserHost } from './orchestration.js';

export default defineBackground(() => {
  const orchestrator = createBackgroundOrchestrator(createWxtBackgroundBrowserHost(browser));

  browser.runtime.onMessage.addListener(
    createAsyncExtensionMessageListener((message, sender) =>
      orchestrator.handleMessage(message, sender),
    ),
  );
});
