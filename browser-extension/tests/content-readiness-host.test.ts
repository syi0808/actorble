import { describe, expect, it } from 'vitest';
import { createContentReadinessHost } from '../src/entrypoints/content/readiness.js';
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js';

describe('content readiness host', () => {
  it('answers content readiness with frame capability metadata', () => {
    const host = createContentReadinessHost({
      async sendMessage() {
        return undefined;
      },
      getFrameId() {
        return 0;
      },
      frameTarget: {},
      url: 'http://localhost:3000/login',
    });

    const result = host.handleMessage(
      createExtensionMessage({
        kind: 'content:ready',
        payload: {
          tabId: 7,
        },
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        tabId: 7,
        frameId: 0,
        url: 'http://localhost:3000/login',
        topFrame: true,
        capabilities: {
          runtime: true,
          recorder: true,
          inspector: true,
          locatorPreview: true,
          frameCorrelation: true,
        },
      },
    });
  });

  it('omits frame metadata when the browser cannot report it', async () => {
    const sent: ActorbleExtensionMessage[] = [];
    const host = createContentReadinessHost({
      async sendMessage(message) {
        sent.push(message);
      },
      getFrameId() {
        return -1;
      },
      frameTarget: {},
      url: 'http://localhost:3000/login',
    });

    const result = await host.emitReady();
    if (!result.ok) {
      throw new Error('Expected readiness emission to succeed.');
    }

    expect(result).toEqual({
      ok: true,
      value: {
        url: 'http://localhost:3000/login',
        capabilities: {
          runtime: true,
          recorder: true,
          inspector: true,
          locatorPreview: true,
          frameCorrelation: false,
        },
      },
    });
    expect(sent).toEqual([
      createExtensionMessage({
        kind: 'content:ready',
        payload: result.value,
      }),
    ]);
  });
});
