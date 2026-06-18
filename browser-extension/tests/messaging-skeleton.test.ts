import { describe, expect, it } from 'vitest'
import {
  type ActorbleExtensionMessage,
  createExtensionMessage,
  extensionMessageKinds,
  isActorbleExtensionMessage,
  isExtensionMessageOfKind,
  isExtensionMessageKind,
} from '../src/messaging/index.js'
import {
  DRAFT_SCENARIO_SCHEMA_VERSION,
  type ScenarioDocument,
} from '../src/scenario/types.js'

const draftDocument = {
  schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
  steps: [],
} satisfies ScenarioDocument

const runCorrelation = {
  tabId: 7,
  frameId: 0,
  scenarioId: 'scenario-1',
  runId: 'run-1',
} as const

const compilation = {
  scenario: {
    id: 'scenario-1',
    steps: [],
  },
} as const

const traceEvent = {
  runId: 'run-1',
  scenarioId: 'scenario-1',
  timestamp: 100,
  name: 'step:completed',
  level: 'info',
  details: {
    stepId: 'step-1',
  },
} as const

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
    kind: 'record:stop',
    payload: {
      tabId: 7,
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
    },
  },
  {
    kind: 'popup:get-state',
    payload: {
      frameId: 0,
      scenarioId: 'scenario-1',
    },
  },
] satisfies readonly ActorbleExtensionMessage[]

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
      'record:stop',
      'inspector:start',
      'inspector:stop',
      'inspector:selected',
      'inspector:cancelled',
      'trace:event',
      'runtime:status',
      'popup:get-state',
    ])
  })

  it('creates messages while preserving typed payloads', () => {
    const message = createExtensionMessage({
      kind: 'runtime:status',
      payload: {
        ...runCorrelation,
        status: 'running',
      },
    })

    expect(message.payload).toMatchObject({
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'run-1',
      status: 'running',
    })
  })

  it('guards message kind values', () => {
    expect(isExtensionMessageKind('trace:event')).toBe(true)
    expect(isExtensionMessageKind('trace:unknown')).toBe(false)
  })

  it.each(validMessages)('narrows valid $kind messages', (message) => {
    expect(isActorbleExtensionMessage(message)).toBe(true)
    expect(isExtensionMessageOfKind(message, message.kind)).toBe(true)
  })

  it('rejects unknown message kinds and invalid envelopes', () => {
    expect(isActorbleExtensionMessage({ kind: 'runtime:status' })).toBe(false)
    expect(isActorbleExtensionMessage({ kind: 'unknown', payload: {} })).toBe(false)
    expect(isExtensionMessageOfKind({ kind: 'unknown', payload: {} }, 'trace:event')).toBe(
      false,
    )
  })

  it.each([
    ['scenario:run', { tabId: 7, scenarioId: 'scenario-1', compilation }],
    ['scenario:pause', { tabId: 7, scenarioId: 'scenario-1' }],
    ['scenario:resume', { tabId: 7, runId: 'run-1' }],
    ['scenario:stop', { scenarioId: 'scenario-1', runId: 'run-1' }],
    ['trace:event', { tabId: 7, scenarioId: 'scenario-1', runId: 'run-1' }],
    ['runtime:status', { tabId: 7, scenarioId: 'scenario-1', status: 'running' }],
  ])('rejects %s messages with missing run correlation fields', (kind, payload) => {
    expect(isActorbleExtensionMessage({ kind, payload })).toBe(false)
  })

  it.each([
    ['record:start', { frameId: 0 }],
    ['record:stop', { scenarioId: 'scenario-1' }],
    ['inspector:start', { tabId: 7 }],
    ['inspector:stop', { frameId: 0 }],
    ['inspector:selected', { tabId: 7, sessionId: 'inspect-1' }],
    ['inspector:cancelled', { tabId: 7, reason: 'user' }],
  ])('rejects %s messages with missing tab correlation', (kind, payload) => {
    expect(isActorbleExtensionMessage({ kind, payload })).toBe(false)
  })

  it('rejects invalid optional correlation field types', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: 7,
          frameId: '0',
        },
      }),
    ).toBe(false)

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:start',
        payload: {
          tabId: 7,
          scenarioId: 123,
          sessionId: 'inspect-1',
        },
      }),
    ).toBe(false)

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:stop',
        payload: {
          tabId: 7,
          sessionId: 123,
        },
      }),
    ).toBe(false)
  })

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
    ).toBe(false)

    expect(
      isActorbleExtensionMessage({
        kind: 'inspector:cancelled',
        payload: {
          tabId: 7,
          sessionId: 'inspect-1',
          reason: 'unknown',
        },
      }),
    ).toBe(false)
  })

  it('rejects invalid runtime status values', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'runtime:status',
        payload: {
          ...runCorrelation,
          status: 'unknown',
        },
      }),
    ).toBe(false)
  })

  it('rejects popup state messages with invalid optional fields', () => {
    expect(
      isActorbleExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          frameId: '0',
        },
      }),
    ).toBe(false)

    expect(
      isActorbleExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          scenarioId: 123,
        },
      }),
    ).toBe(false)
  })
})
