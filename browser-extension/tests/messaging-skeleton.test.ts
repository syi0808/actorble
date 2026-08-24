import { describe, expect, it } from 'vitest';
import {
  type ActorbleExtensionMessage,
  createExtensionMessage,
  extensionMessageKinds,
  isActorbleExtensionMessage,
  isExtensionMessageOfKind,
  isExtensionMessageKind,
} from '../src/messaging/index.js';
import { DRAFT_SCENARIO_SCHEMA_VERSION, type ScenarioDocument } from '../src/scenario/types.js';

const draftDocument = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  steps: [],
} satisfies ScenarioDocument;

const runCorrelation = {
  tabId: 7,
  frameId: 0,
  scenarioId: 'scenario-1',
  runId: 'run-1',
} as const;

const compilation = {
  scenario: {
    id: 'scenario-1',
    steps: [],
  },
} as const;

const traceEvent = {
  runId: 'run-1',
  scenarioId: 'scenario-1',
  timestamp: 100,
  name: 'step:completed',
  level: 'info',
  details: {
    stepId: 'step-1',
  },
} as const;

const debugSnapshot = {
  capturedAt: 120,
  capabilities: {
    pointerInput: 'synthetic',
    trustedEvents: false,
  },
  fidelity: {
    pointerInput: 'synthetic-dom-events',
    limits: ['Synthetic events are not browser-trusted user input.'],
  },
  trace: {
    spans: [
      {
        id: 'span-1',
        name: 'scenario.run',
        status: 'running',
        startedAt: 100,
      },
    ],
    events: [
      {
        name: 'surface:scrolled',
        at: 110,
        spanId: 'span-1',
        data: {
          action: 'scrollTo',
        },
      },
    ],
    snapshots: [
      {
        name: 'target.resolve.candidates',
        at: 108,
        data: {
          ambiguity: 'none',
          candidates: [],
        },
      },
    ],
    warnings: [],
  },
} as const;

const recordedEvent = {
  kind: 'click',
  target: {
    tagName: 'button',
    id: 'submit',
    role: 'button',
    text: 'Sign in',
    rect: {
      x: 10,
      y: 20,
      width: 100,
      height: 32,
    },
  },
  timestamp: 100,
  clientX: 12,
  clientY: 18,
  button: 0,
} as const;

const recordedPointerEvent = {
  kind: 'pointer',
  phase: 'down',
  target: recordedEvent.target,
  timestamp: 101,
  clientX: 12,
  clientY: 18,
  button: 0,
  buttons: 1,
  pointerId: 1,
  pointerType: 'mouse',
} as const;

const recordedSelectionEvent = {
  kind: 'selection',
  timestamp: 102,
  selectedText: 'plain selected text',
  activeTarget: recordedEvent.target,
  anchorTarget: recordedEvent.target,
  focusTarget: recordedEvent.target,
} as const;

const recordedDragEvent = {
  kind: 'drag',
  phase: 'drop',
  target: recordedEvent.target,
  timestamp: 103,
  clientX: 42,
  clientY: 58,
} as const;

const validMessages = [
  {
    kind: 'scenario:validate',
    payload: {
      document: 'raw-json',
    },
  },
  {
    kind: 'scenario:compile',
    payload: {
      document: draftDocument,
    },
  },
  {
    kind: 'scenario:run',
    payload: {
      ...runCorrelation,
      compilation,
    },
  },
  {
    kind: 'scenario:pause',
    payload: runCorrelation,
  },
  {
    kind: 'scenario:resume',
    payload: runCorrelation,
  },
  {
    kind: 'scenario:stop',
    payload: runCorrelation,
  },
  {
    kind: 'record:start',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  },
  {
    kind: 'record:event',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
      sessionId: 'record-1',
      reason: 'incremental',
      events: [recordedEvent],
    },
  },
  {
    kind: 'record:stop',
    payload: {
      tabId: 7,
    },
  },
  {
    kind: 'record:draft:get',
    payload: {
      tabId: 7,
      frameId: 0,
      runId: 'record-1',
    },
  },
  {
    kind: 'inspector:start',
    payload: {
      tabId: 7,
      frameId: 0,
      sessionId: 'inspect-1',
    },
  },
  {
    kind: 'inspector:stop',
    payload: {
      tabId: 7,
      sessionId: 'inspect-1',
      scenarioId: 'scenario-1',
    },
  },
  {
    kind: 'inspector:selected',
    payload: {
      tabId: 7,
      frameId: 0,
      sessionId: 'inspect-1',
      scenarioId: 'scenario-1',
      target: {
        tagName: 'button',
        id: 'submit',
        classes: ['primary'],
        role: 'button',
        ariaLabel: 'Sign in',
        text: 'Sign in',
        frameUrl: 'http://localhost:3000/login',
        rect: {
          x: 10,
          y: 20,
          width: 100,
          height: 32,
        },
      },
    },
  },
  {
    kind: 'inspector:cancelled',
    payload: {
      tabId: 7,
      frameId: 0,
      sessionId: 'inspect-1',
      reason: 'user',
    },
  },
  {
    kind: 'locator:preview',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      target: {
        tagName: 'button',
        documentOrderIndex: 8,
        role: 'button',
        ariaLabel: 'Sign in',
        rect: {
          x: 10,
          y: 20,
          width: 100,
          height: 32,
        },
      },
      candidates: [
        {
          id: 'role-1',
          rank: 1,
          strategy: 'role',
          label: 'role: button "Sign in"',
          locator: {
            strategy: 'role',
            role: 'button',
            name: {
              value: 'Sign in',
              match: 'exact',
            },
          },
        },
      ],
    },
  },
  {
    kind: 'trace:event',
    payload: {
      ...runCorrelation,
      event: traceEvent,
    },
  },
  {
    kind: 'runtime:status',
    payload: {
      ...runCorrelation,
      status: 'running',
      message: 'Run started.',
      debugSnapshot,
    },
  },
  {
    kind: 'content:ready',
    payload: {
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
  },
  {
    kind: 'popup:get-state',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
    },
  },
] satisfies readonly ActorbleExtensionMessage[];

describe('messaging skeleton contracts', () => {
  it('lists the initial architecture message channels', () => {
    expect(extensionMessageKinds).toEqual([
      'scenario:validate',
      'scenario:compile',
      'scenario:run',
      'scenario:pause',
      'scenario:resume',
      'scenario:stop',
      'record:start',
      'record:event',
      'record:stop',
      'record:draft:get',
      'inspector:start',
      'inspector:stop',
      'inspector:selected',
      'inspector:cancelled',
      'locator:preview',
      'trace:event',
      'runtime:status',
      'content:ready',
      'popup:get-state',
    ]);
  });

  it('creates messages while preserving typed payloads', () => {
    const message = createExtensionMessage({
      kind: 'runtime:status',
      payload: {
        ...runCorrelation,
        status: 'running',
      },
    });

    expect(message.payload).toMatchObject({
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'run-1',
      status: 'running',
    });
  });

  it('guards message kind values', () => {
    expect(isExtensionMessageKind('trace:event')).toBe(true);
    expect(isExtensionMessageKind('trace:unknown')).toBe(false);
  });

  it.each(validMessages)('narrows valid $kind messages', (message) => {
    expect(isActorbleExtensionMessage(message)).toBe(true);
    expect(isExtensionMessageOfKind(message, message.kind)).toBe(true);
  });

  it('narrows inspector messages with target slot correlation', () => {
    const targetSlot = {
      kind: 'drag-to',
      stepId: 'drag-step',
    } as const;

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          scenarioId: 'scenario-1',
          targetSlot,
        },
      }),
    ).toBe(true);

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:selected',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          targetSlot,
          target: {
            tagName: 'button',
            rect: {
              x: 10,
              y: 20,
              width: 100,
              height: 32,
            },
          },
        },
      }),
    ).toBe(true);
  });

  it('rejects unknown message kinds and invalid envelopes', () => {
    expect(isActorbleExtensionMessage({ kind: 'runtime:status' })).toBe(false);
    expect(isActorbleExtensionMessage({ kind: 'unknown', payload: {} })).toBe(false);
    expect(isExtensionMessageOfKind({ kind: 'unknown', payload: {} }, 'trace:event')).toBe(false);
  });

  it.each([
    ['scenario:run', { tabId: 7, scenarioId: 'scenario-1', compilation }],
    ['scenario:pause', { tabId: 7, scenarioId: 'scenario-1' }],
    ['scenario:resume', { tabId: 7, runId: 'run-1' }],
    ['scenario:stop', { scenarioId: 'scenario-1', runId: 'run-1' }],
    ['trace:event', { tabId: 7, scenarioId: 'scenario-1', runId: 'run-1' }],
    ['runtime:status', { tabId: 7, scenarioId: 'scenario-1', status: 'running' }],
  ])('rejects %s messages with missing run correlation fields', (kind, payload) => {
    expect(isActorbleExtensionMessage({ kind, payload })).toBe(false);
  });

  it.each([
    ['record:start', { frameId: 0 }],
    [
      'record:event',
      { frameId: 0, sessionId: 'record-1', reason: 'incremental', events: [recordedEvent] },
    ],
    ['record:stop', { scenarioId: 'scenario-1' }],
    ['inspector:start', { tabId: 7 }],
    ['inspector:stop', { frameId: 0 }],
    ['inspector:selected', { tabId: 7, sessionId: 'inspect-1' }],
    ['inspector:cancelled', { tabId: 7, reason: 'user' }],
    ['locator:preview', { frameId: 0, candidates: [] }],
  ])('rejects %s messages with missing tab correlation', (kind, payload) => {
    expect(isActorbleExtensionMessage({ kind, payload })).toBe(false);
  });

  it('rejects invalid optional correlation field types', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: 7,
          frameId: '0',
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          scenarioId: 123,
          sessionId: 'inspect-1',
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:stop',
        payload: {
          tabId: 7,
          sessionId: 123,
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'record:draft:get',
        payload: {
          tabId: '7',
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid recorder event flush payloads', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'record:event',
        payload: {
          tabId: 7,
          sessionId: '',
          reason: 'incremental',
          events: [recordedEvent],
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'record:event',
        payload: {
          tabId: 7,
          sessionId: 'record-1',
          reason: 'unknown',
          events: [recordedEvent],
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'record:event',
        payload: {
          tabId: 7,
          sessionId: 'record-1',
          reason: 'incremental',
          events: [],
        },
      }),
    ).toBe(false);
  });

  it('accepts expanded recorder raw event payloads', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'record:event',
        payload: {
          tabId: 7,
          sessionId: 'record-1',
          reason: 'incremental',
          events: [recordedPointerEvent, recordedSelectionEvent, recordedDragEvent],
        },
      }),
    ).toBe(true);
  });

  it.each([
    [
      'pointer phase',
      {
        ...recordedPointerEvent,
        phase: 'cancel',
      },
    ],
    [
      'selection selectedText',
      {
        ...recordedSelectionEvent,
        selectedText: 123,
      },
    ],
    [
      'drag phase',
      {
        ...recordedDragEvent,
        phase: 'move',
      },
    ],
  ])('rejects invalid recorder %s payloads', (_case, event) => {
    expect(
      isActorbleExtensionMessage({
        kind: 'record:event',
        payload: {
          tabId: 7,
          sessionId: 'record-1',
          reason: 'incremental',
          events: [event],
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid inspector selected and cancellation payloads', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:selected',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          target: {
            tagName: 'button',
            rect: {
              x: 10,
              y: 20,
              width: Number.NaN,
              height: 32,
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:cancelled',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          reason: 'unknown',
        },
      }),
    ).toBe(false);
  });

  it.each([
    { kind: 'unknown', stepId: 'step-1' },
    { kind: 'step-target', stepId: '' },
    { kind: 'step-target' },
    'step-target:step-1',
  ])('rejects invalid inspector target slot correlation %#', (targetSlot) => {
    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          targetSlot,
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid locator preview payloads', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'locator:preview',
        payload: {
          tabId: 7,
          candidates: [],
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'locator:preview',
        payload: {
          tabId: 7,
          candidates: [
            {
              id: 'bad-1',
              rank: 1,
              strategy: 'css',
              label: 'css',
              locator: {
                strategy: 'css',
              },
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid runtime status values', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'runtime:status',
        payload: {
          ...runCorrelation,
          status: 'unknown',
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid runtime debug snapshots', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'runtime:status',
        payload: {
          ...runCorrelation,
          status: 'running',
          debugSnapshot: {
            capturedAt: 100,
            trace: {
              spans: [
                {
                  id: 'span-1',
                  name: 'scenario.run',
                  status: 'unknown',
                  startedAt: 100,
                },
              ],
              events: [],
              snapshots: [],
              warnings: [],
            },
          },
        },
      }),
    ).toBe(false);
  });

  it('rejects popup state messages with invalid optional fields', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          tabId: '7',
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          frameId: '0',
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          scenarioId: 123,
        },
      }),
    ).toBe(false);
  });

  it('rejects invalid content readiness metadata', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'content:ready',
        payload: {
          tabId: 7,
          frameId: '0',
        },
      }),
    ).toBe(false);

    expect(
      isActorbleExtensionMessage({
        kind: 'content:ready',
        payload: {
          tabId: 7,
          capabilities: {
            runtime: true,
            recorder: true,
            inspector: true,
            locatorPreview: true,
            frameCorrelation: 'yes',
          },
        },
      }),
    ).toBe(false);
  });
});
