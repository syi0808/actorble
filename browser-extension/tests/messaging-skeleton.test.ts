import { describe, expect, it } from 'vitest'
import {
  createExtensionMessage,
  extensionMessageKinds,
  isActorbleExtensionMessage,
  isExtensionMessageKind,
} from '../src/messaging/index.js'

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
      'trace:event',
      'runtime:status',
    ])
  })

  it('creates run messages with correlation metadata', () => {
    const message = createExtensionMessage({
      kind: 'scenario:run',
      payload: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'run-1',
        compilation: {
          scenario: {
            id: 'scenario-1',
            steps: [],
          },
        },
      },
    })

    expect(message.payload).toMatchObject({
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'run-1',
    })
  })

  it('guards message kind and message envelope shape', () => {
    expect(isExtensionMessageKind('trace:event')).toBe(true)
    expect(isExtensionMessageKind('trace:unknown')).toBe(false)

    expect(
      isActorbleExtensionMessage({
        kind: 'runtime:status',
        payload: {
          tabId: 1,
          scenarioId: 'scenario-1',
          runId: 'run-1',
          status: 'running',
        },
      }),
    ).toBe(true)
    expect(isActorbleExtensionMessage({ kind: 'runtime:status' })).toBe(false)
    expect(isActorbleExtensionMessage({ kind: 'unknown', payload: {} })).toBe(false)
  })
})
