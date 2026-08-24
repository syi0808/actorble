import { describe, expect, it } from 'vitest';
import {
  createTraceDisplayStore,
  type RuntimeStatusSnapshot,
  type TraceDisplayEvent,
} from '../src/trace/index.js';

describe('trace display store', () => {
  it('groups trace events by run id while preserving ingestion order', () => {
    const store = createTraceDisplayStore();

    store.startRun(status('run-1', 'running', 10));
    store.ingestEvent(event('run-1', 'scenario:start', 20));
    store.ingestEvent(event('run-2', 'scenario:start', 25, { scenarioId: 'scenario-2' }));
    store.ingestEvent(event('run-1', 'step:start', 15, { stepId: 'email' }));

    expect(store.getRun('run-1')).toMatchObject({
      runId: 'run-1',
      scenarioId: 'scenario-1',
      eventCount: 2,
      latestEvent: {
        name: 'step:start',
        stepId: 'email',
      },
      events: [{ name: 'scenario:start' }, { name: 'step:start' }],
    });
    expect(store.getRun('run-2')).toMatchObject({
      runId: 'run-2',
      scenarioId: 'scenario-2',
      status: {
        status: 'running',
      },
      eventCount: 1,
    });
  });

  it('associates scenario and step ids without rewriting runtime event details', () => {
    const store = createTraceDisplayStore();
    const rawDetails = {
      stepId: 'password',
      data: {
        role: 'textbox',
      },
    };
    const traceEvent = event('run-1', 'locator:resolved', 20, {
      scenarioId: 'scenario-from-event',
      details: rawDetails,
    });

    store.startRun(status('run-1', 'running', 10));
    store.ingestEvent(traceEvent);

    const view = store.getRun('run-1');

    expect(view?.scenarioId).toBe('scenario-1');
    expect(view?.latestEvent).toMatchObject({
      stepId: 'password',
      details: rawDetails,
    });
    expect(view?.latestEvent?.details).toBe(rawDetails);
  });

  it('builds failure display from runtime status and error events', () => {
    const store = createTraceDisplayStore();

    store.startRun(status('run-1', 'running', 10));
    store.ingestEvent(
      event('run-1', 'target:missing', 20, {
        level: 'error',
        message: 'Target not found.',
        stepId: 'submit',
      }),
    );
    store.ingestStatus(
      status('run-1', 'failed', 30, {
        message: 'Run failed at submit.',
        currentStepId: 'submit',
      }),
    );

    expect(store.getCurrentView()).toMatchObject({
      runId: 'run-1',
      status: {
        status: 'failed',
      },
      latestEvent: {
        name: 'target:missing',
      },
      failure: {
        message: 'Run failed at submit.',
        stepId: 'submit',
        eventName: 'target:missing',
      },
      summary: 'Failed run-1 after 1 event: Run failed at submit.',
    });
  });

  it('summarizes completed runs', () => {
    const store = createTraceDisplayStore();

    store.startRun(status('run-1', 'running', 10));
    store.ingestEvent(event('run-1', 'scenario:start', 20));
    store.ingestEvent(event('run-1', 'scenario:end', 30));
    store.ingestStatus(status('run-1', 'completed', 40));

    const view = store.getRun('run-1');

    expect(view).toMatchObject({
      summary: 'Completed run-1 with 2 events.',
    });
    expect(view?.failure).toBeUndefined();
  });

  it('bounds per-run event history and total run history', () => {
    const store = createTraceDisplayStore({
      historyLimit: 2,
      runLimit: 2,
    });

    store.startRun(status('run-1', 'running', 10));
    store.ingestEvent(event('run-1', 'event:1', 11));
    store.ingestEvent(event('run-1', 'event:2', 12));
    store.ingestEvent(event('run-1', 'event:3', 13));
    store.startRun(status('run-2', 'running', 20));
    store.startRun(status('run-3', 'running', 30));

    expect(store.getRun('run-1')).toBeUndefined();
    expect(store.getState().runs.map((run) => run.runId)).toEqual(['run-2', 'run-3']);
    expect(store.getRun('run-3')).toMatchObject({
      events: [],
    });

    store.ingestEvent(event('run-3', 'event:1', 31));
    store.ingestEvent(event('run-3', 'event:2', 32));
    store.ingestEvent(event('run-3', 'event:3', 33));

    expect(store.getRun('run-3')?.events.map((traceEvent) => traceEvent.name)).toEqual([
      'event:2',
      'event:3',
    ]);
    expect(store.getRun('run-3')?.eventCount).toBe(3);
  });
});

function status(
  runId: string,
  status: RuntimeStatusSnapshot['status'],
  updatedAt: number,
  options: Partial<Omit<RuntimeStatusSnapshot, 'runId' | 'status' | 'updatedAt'>> = {},
): RuntimeStatusSnapshot {
  return {
    runId,
    scenarioId: 'scenario-1',
    status,
    updatedAt,
    ...options,
  };
}

function event(
  runId: string,
  name: string,
  timestamp: number,
  options: Partial<Omit<TraceDisplayEvent, 'runId' | 'name' | 'timestamp'>> = {},
): TraceDisplayEvent {
  return {
    runId,
    scenarioId: 'scenario-1',
    timestamp,
    name,
    ...options,
  };
}
