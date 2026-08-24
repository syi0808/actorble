import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { actorbleError } from '../src/shared/index.js';
import {
  BrowserDiagnosticsTrace,
  createDiagnosticsTrace,
} from '../src/diagnostics/diagnostics-trace/index.js';

function deterministicClock(start = 1000) {
  let current = start;

  return {
    now() {
      return current++;
    },
  };
}

describe('diagnostics trace', () => {
  it('records span start, end, error, and cancel lifecycle', () => {
    const trace = new BrowserDiagnosticsTrace({
      clock: deterministicClock(),
      idPrefix: 'span',
    });

    const action = trace.startSpan('action.click', { action: 'click' });
    const resolve = trace.startSpan('target.resolve');
    resolve.end({ candidates: 1 });

    const failure = actorbleError('INTERACTABILITY_FAILED', 'Target is occluded', {
      details: { reason: 'occluded' },
    });
    const preflight = trace.startSpan('interactability.preflight');
    preflight.error(failure, { phase: 'preflight' });

    const wait = trace.startSpan('wait.settle');
    wait.cancel('user stopped');

    action.end({ completed: true });

    expect(trace.getTrace().spans).toEqual([
      {
        id: 'span-1',
        name: 'action.click',
        status: 'ok',
        startedAt: 1000,
        endedAt: 1007,
        attributes: { action: 'click', completed: true },
      },
      {
        id: 'span-2',
        name: 'target.resolve',
        parentId: 'span-1',
        status: 'ok',
        startedAt: 1001,
        endedAt: 1002,
        attributes: { candidates: 1 },
      },
      {
        id: 'span-3',
        name: 'interactability.preflight',
        parentId: 'span-1',
        status: 'error',
        startedAt: 1003,
        endedAt: 1004,
        attributes: { phase: 'preflight' },
        error: failure,
      },
      {
        id: 'span-4',
        name: 'wait.settle',
        parentId: 'span-1',
        status: 'cancelled',
        startedAt: 1005,
        endedAt: 1006,
        attributes: { reason: 'user stopped' },
      },
    ]);
  });

  it('appends debug events, span events, warnings, and snapshots', () => {
    const trace = createDiagnosticsTrace({
      clock: deterministicClock(2000),
      idPrefix: 'trace',
    });

    trace.appendEvent('scenario:start', { scenarioId: 's1' });
    const span = trace.startSpan('pointer.click');
    span.event('pointer:down', { button: 'primary' });
    trace.attachSnapshot('before-click', { selector: '#save' });
    trace.warn('Trusted events are not available', { capability: 'trustedEvents' });

    const snapshot = trace.getTrace();
    trace.appendEvent('scenario:end');

    expect(snapshot.events).toEqual([
      { name: 'scenario:start', at: 2000, data: { scenarioId: 's1' } },
      {
        name: 'pointer:down',
        at: 2002,
        spanId: 'trace-1',
        data: { button: 'primary' },
      },
    ]);
    expect(snapshot.snapshots).toEqual([
      { name: 'before-click', at: 2003, data: { selector: '#save' } },
    ]);
    expect(snapshot.warnings).toEqual([
      {
        message: 'Trusted events are not available',
        at: 2004,
        details: { capability: 'trustedEvents' },
      },
    ]);
    expect(snapshot.events).toHaveLength(2);
    expect(trace.getTrace().events).toHaveLength(3);
  });

  it('notifies exact-name event subscribers for future trace events until removed', () => {
    const trace = createDiagnosticsTrace({
      clock: deterministicClock(3000),
      idPrefix: 'trace',
    });
    const scenarioListener = vi.fn();
    const pointerListener = vi.fn();

    trace.on('scenario:start', scenarioListener);
    trace.on('pointer:down', pointerListener);

    trace.appendEvent('scenario:start', { scenarioId: 's1' });
    const span = trace.startSpan('pointer.click');
    span.event('pointer:down', { button: 'primary' });

    trace.off('scenario:start', scenarioListener);
    trace.appendEvent('scenario:start', { scenarioId: 's2' });

    expect(scenarioListener).toHaveBeenCalledOnce();
    expect(scenarioListener).toHaveBeenCalledWith({
      name: 'scenario:start',
      at: 3000,
      data: { scenarioId: 's1' },
    });
    expect(pointerListener).toHaveBeenCalledOnce();
    expect(pointerListener).toHaveBeenCalledWith({
      name: 'pointer:down',
      at: 3002,
      spanId: 'trace-1',
      data: { button: 'primary' },
    });
  });

  it('delivers shallow event copies and isolates listener errors', () => {
    const trace = createDiagnosticsTrace({
      clock: deterministicClock(4000),
    });
    const mutatingListener = vi.fn((event) => {
      event.name = 'mutated';
      event.spanId = 'mutated-span';
    });
    const failingListener = vi.fn(() => {
      throw new Error('listener failed');
    });
    const laterListener = vi.fn();

    trace.on('scenario:start', mutatingListener);
    trace.on('scenario:start', failingListener);
    trace.on('scenario:start', laterListener);

    trace.appendEvent('scenario:start', { scenarioId: 's1' });

    expect(trace.getTrace().events).toEqual([
      { name: 'scenario:start', at: 4000, data: { scenarioId: 's1' } },
    ]);
    expect(failingListener).toHaveBeenCalledOnce();
    expect(laterListener).toHaveBeenCalledWith({
      name: 'scenario:start',
      at: 4000,
      data: { scenarioId: 's1' },
    });
    expect(trace.getTrace().warnings).toEqual([
      {
        message: 'Trace event listener failed.',
        at: 4001,
        details: {
          eventName: 'scenario:start',
          error: 'listener failed',
        },
      },
    ]);
  });

  it('retains the newest events, snapshots, and warnings when limits are configured', () => {
    const trace = createDiagnosticsTrace({
      clock: deterministicClock(5000),
      retention: {
        maxEvents: 2,
        maxSnapshots: 1,
        maxWarnings: 2,
      },
    });

    const firstSpan = trace.startSpan('scenario.step');
    firstSpan.end();
    const secondSpan = trace.startSpan('scenario.step');
    secondSpan.end();
    const thirdSpan = trace.startSpan('scenario.step');
    thirdSpan.end();

    trace.appendEvent('scenario:start', { scenarioId: 's1' });
    trace.appendEvent('scenario:pause', { currentStepIndex: 0 });
    trace.appendEvent('scenario:resume', { currentStepIndex: 0 });
    trace.attachSnapshot('first', { index: 1 });
    trace.attachSnapshot('second', { index: 2 });
    trace.warn('first warning');
    trace.warn('second warning');
    trace.warn('third warning');

    expect(trace.getTrace()).toMatchObject({
      spans: [
        expect.objectContaining({ id: 'span-1', status: 'ok' }),
        expect.objectContaining({ id: 'span-2', status: 'ok' }),
        expect.objectContaining({ id: 'span-3', status: 'ok' }),
      ],
      events: [
        { name: 'scenario:pause', at: 5007, data: { currentStepIndex: 0 } },
        { name: 'scenario:resume', at: 5008, data: { currentStepIndex: 0 } },
      ],
      snapshots: [{ name: 'second', at: 5010, data: { index: 2 } }],
      warnings: [
        { message: 'second warning', at: 5012 },
        { message: 'third warning', at: 5013 },
      ],
    });
  });

  it('notifies subscribers even when event retention stores no events', () => {
    const trace = createDiagnosticsTrace({
      clock: deterministicClock(6000),
      retention: {
        maxEvents: 0,
      },
    });
    const listener = vi.fn();

    trace.on('scenario:start', listener);
    trace.appendEvent('scenario:start', { scenarioId: 's1' });

    expect(listener).toHaveBeenCalledWith({
      name: 'scenario:start',
      at: 6000,
      data: { scenarioId: 's1' },
    });
    expect(trace.getTrace().events).toEqual([]);
  });

  it('keeps the diagnostics trace boundary limited to shared primitives', async () => {
    const source = await readFile(
      join(process.cwd(), 'src/diagnostics/diagnostics-trace/index.ts'),
      'utf8',
    );
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((specifier) => specifier === '../../shared/index.js')).toBe(true);
    expect(source).not.toMatch(/from\s+['"]\.\.\/\.\.\/(runtime|targeting)\//);
  });
});
