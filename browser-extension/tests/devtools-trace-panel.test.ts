import { describe, expect, it } from 'vitest'
import {
  createDevtoolsTracePanelStore,
  type RuntimeDebugSnapshot,
  type RuntimeStatusSnapshot,
  type TraceDisplayEvent,
} from '../src/trace/index.js'

describe('devtools trace panel store', () => {
  it('derives advanced debug views from existing runtime status and trace channels', () => {
    const store = createDevtoolsTracePanelStore({
      historyLimit: 5,
      runLimit: 5,
    })

    store.ingestStatus(status('running', {
      debugSnapshot: debugSnapshot(),
    }))
    store.ingestEvent(event('surface:scrolled', 130, {
      details: {
        spanId: 'span-2',
        data: {
          action: 'scrollTo',
          inputKind: 'target',
          targetId: 'target-1',
        },
      },
    }))

    const view = store.getSnapshot()

    expect(view.summary).toBe('Running run-1: surface:scrolled')
    expect(view.selectedRun).toMatchObject({
      runId: 'run-1',
      scenarioId: 'scenario-1',
      selected: true,
      traceSummary: {
        spans: 2,
        events: 1,
        snapshots: 1,
        warnings: 1,
      },
      locatorDiagnostics: [
        {
          name: 'target.resolve.candidates',
          ambiguity: 'strict-multiple-candidates',
          candidateCount: 2,
        },
      ],
      capabilityRows: [
        { source: 'capability', label: 'pointerInput', value: 'synthetic' },
        { source: 'capability', label: 'trustedEvents', value: 'false' },
        { source: 'fidelity', label: 'pointerInput', value: 'synthetic-dom-events' },
        {
          source: 'fidelity',
          label: 'limits',
          value: 'Synthetic events are not browser-trusted user input.',
        },
      ],
    })
    expect(view.selectedRun?.frameSurfaceRows).toEqual([
      { label: 'Tab', value: '7' },
      { label: 'Frame', value: '0' },
      { label: 'surface:scrolled', value: 'scrollTo target target-1' },
    ])
  })

  it('selects explicit runs without creating a separate trace source', () => {
    const store = createDevtoolsTracePanelStore()

    store.ingestStatus(status('completed'))
    store.ingestEvent(event('scenario:end', 150))
    store.ingestStatus(status('running', {
      runId: 'run-2',
      scenarioId: 'scenario-2',
    }))

    store.selectRun('run-1')

    const view = store.getSnapshot()

    expect(view.selectedRunId).toBe('run-1')
    expect(view.selectedRun).toMatchObject({
      runId: 'run-1',
      selected: true,
      eventCount: 1,
    })
    expect(view.runs.map((run) => run.runId)).toEqual(['run-1', 'run-2'])
  })
})

function status(
  runStatus: RuntimeStatusSnapshot['status'],
  options: Partial<Omit<RuntimeStatusSnapshot, 'runId' | 'scenarioId' | 'status' | 'updatedAt'>> &
    Pick<Partial<RuntimeStatusSnapshot>, 'runId' | 'scenarioId'> = {},
): RuntimeStatusSnapshot {
  return {
    runId: options.runId ?? 'run-1',
    scenarioId: options.scenarioId ?? 'scenario-1',
    tabId: 7,
    frameId: 0,
    status: runStatus,
    updatedAt: 120,
    ...options,
  }
}

function event(
  name: string,
  timestamp: number,
  options: Partial<Omit<TraceDisplayEvent, 'runId' | 'scenarioId' | 'name' | 'timestamp'>> = {},
): TraceDisplayEvent {
  return {
    runId: 'run-1',
    scenarioId: 'scenario-1',
    timestamp,
    name,
    ...options,
  }
}

function debugSnapshot(): RuntimeDebugSnapshot {
  return {
    capturedAt: 125,
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
        {
          id: 'span-2',
          name: 'target.resolve',
          parentId: 'span-1',
          status: 'ok',
          startedAt: 110,
          endedAt: 115,
          attributes: {
            locator: {
              strategy: 'role',
              role: 'button',
            },
          },
        },
      ],
      events: [
        {
          name: 'surface:scrolled',
          at: 130,
          spanId: 'span-2',
          data: {
            action: 'scrollTo',
            inputKind: 'target',
            targetId: 'target-1',
          },
        },
      ],
      snapshots: [
        {
          name: 'target.resolve.candidates',
          at: 112,
          data: {
            locator: {
              strategy: 'role',
              role: 'button',
            },
            ambiguity: 'strict-multiple-candidates',
            candidates: [
              { targetId: 'target-1' },
              { targetId: 'target-2' },
            ],
          },
        },
      ],
      warnings: [
        {
          message: 'Browser resolver cannot inspect cross-origin frames or closed shadow roots.',
          at: 113,
          details: {
            unsupported: ['cross-origin-frame', 'closed-shadow-root'],
          },
        },
      ],
    },
  }
}
