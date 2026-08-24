import { describe, expect, it, vi } from 'vitest';
import { actorbleError } from '../src/shared/index.js';
import { BrowserDiagnosticsTrace } from '../src/diagnostics/diagnostics-trace/index.js';
import {
  BrowserVisualStabilityObserver,
  DEFAULT_VISUAL_STABILITY_POLICY,
} from '../src/runtime/visual-stability-observer/index.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createControlledTimeline() {
  let now = 0;
  const frames = [];

  return {
    timeline: {
      now: vi.fn(() => now),
      nextFrame: vi.fn(({ signal } = {}) => {
        const frame = deferred();
        const onAbort = () => frame.reject(actorbleError('ACTION_CANCELLED', 'frame cancelled'));
        signal?.addEventListener('abort', onAbort, { once: true });
        const pending = { frame, signal, onAbort };
        frames.push(pending);
        return frame.promise.finally(() => {
          signal?.removeEventListener('abort', onAbort);
          const index = frames.indexOf(pending);
          if (index >= 0) frames.splice(index, 1);
        });
      }),
    },
    async frame(timestamp) {
      await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0));
      now = timestamp;
      const pending = frames.shift();
      if (!pending) throw new Error('No visual-stability frame is pending.');
      pending.frame.resolve(timestamp);
      await pending.frame.promise;
      await Promise.resolve();
    },
    get pendingFrames() {
      return frames.length;
    },
  };
}

function createLayoutInvalidationTracker() {
  const listeners = new Set();
  let running = false;

  return {
    tracker: {
      start: vi.fn(() => {
        running = true;
      }),
      stop: vi.fn(() => {
        running = false;
      }),
      isRunning: vi.fn(() => running),
      markDirty: vi.fn(),
      subscribe: vi.fn(() => ({ dispose() {} })),
      subscribeDirty: vi.fn((listener) => {
        listeners.add(listener);
        return { dispose: vi.fn(() => listeners.delete(listener)) };
      }),
      dispose: vi.fn(),
    },
    emit(reason, at) {
      for (const listener of [...listeners]) listener({ reason, at });
    },
  };
}

function targetHandle(element) {
  return {
    id: 'target-1',
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: { description: 'button#target' },
  };
}

function rect(x = 10, y = 20, width = 100, height = 40) {
  return { x, y, width, height };
}

function metrics(scrollLeft = 0, scrollTop = 0) {
  return {
    scrollLeft,
    scrollTop,
    scrollWidth: 1000,
    scrollHeight: 1000,
    clientWidth: 500,
    clientHeight: 500,
    clientLeft: 0,
    clientTop: 0,
  };
}

function createHarness({
  rects = [rect()],
  offsets = [[0, 0]],
  activeAnimations = [0],
  validate,
  trace,
} = {}) {
  const controlled = createControlledTimeline();
  const layout = createLayoutInvalidationTracker();
  const element = document.createElement('button');
  document.body.append(element);
  const target = targetHandle(element);
  const surface = document.createElement('div');
  const rectQueue = [...rects];
  const offsetQueue = [...offsets];
  const animationQueue = [...activeAnimations];
  const geometry = {
    getBoundingRect: vi.fn(() => rectQueue.shift() ?? rectQueue.at(-1) ?? rect()),
  };
  const dom = {
    getRoot: vi.fn(() => document),
    getViewportScrollTarget: vi.fn(() => window),
    getScrollMetrics: vi.fn(() => {
      const [x, y] = offsetQueue.shift() ?? offsetQueue.at(-1) ?? [0, 0];
      return metrics(x, y);
    }),
    getActiveAnimationCount: vi.fn(() => animationQueue.shift() ?? animationQueue.at(-1) ?? 0),
  };
  const resolver = {
    validate: vi.fn(validate ?? (async (handle) => handle)),
  };
  const scrollChain = {
    resolve: vi.fn(() => [{ scrollTarget: surface }]),
  };
  const observer = new BrowserVisualStabilityObserver({
    dom,
    geometry,
    layoutInvalidation: layout.tracker,
    resolver,
    scrollChain,
    timeline: controlled.timeline,
    trace,
  });

  return { controlled, dom, geometry, layout, observer, resolver, surface, target };
}

describe('BrowserVisualStabilityObserver', () => {
  it('uses the documented observed-stability defaults', () => {
    expect(DEFAULT_VISUAL_STABILITY_POLICY).toEqual({
      quietMs: 80,
      stableFrames: 2,
      threshold: 0.5,
    });
  });

  it('requires two unchanged geometry and scroll frames after the baseline', async () => {
    const harness = createHarness({ rects: [rect(), rect(), rect()] });
    const promise = harness.observer.observe(harness.target);

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await harness.controlled.frame(112);

    await expect(promise).resolves.toMatchObject({
      requiredStableFrames: 2,
      observedStableFrames: 2,
      lastRect: rect(),
      previousRect: rect(),
    });
    expect(harness.geometry.getBoundingRect).toHaveBeenCalledTimes(3);
    expect(harness.layout.tracker.start).toHaveBeenCalledOnce();
    expect(harness.layout.tracker.stop).toHaveBeenCalledOnce();
    expect(harness.controlled.pendingFrames).toBe(0);
  });

  it('resets stable frames when the target moves or resizes', async () => {
    const harness = createHarness({
      rects: [rect(), rect(11), rect(11, 20, 120), rect(11, 20, 120), rect(11, 20, 120)],
    });
    const settled = vi.fn();
    const observation = harness.observer.observe(harness.target);
    observation.then(settled);

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await harness.controlled.frame(112);
    await harness.controlled.frame(128);
    expect(settled).not.toHaveBeenCalled();
    await harness.controlled.frame(144);

    await expect(observation).resolves.toMatchObject({ observedStableFrames: 2 });
  });

  it('does not settle while the watched target has an active CSS animation', async () => {
    const harness = createHarness({
      rects: [rect(), rect(), rect(), rect()],
      activeAnimations: [1, 1, 0, 0],
    });
    const settled = vi.fn();
    const observation = harness.observer.observe(harness.target);
    observation.then(settled);

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await harness.controlled.frame(112);
    expect(settled).not.toHaveBeenCalled();
    await harness.controlled.frame(128);

    await expect(observation).resolves.toMatchObject({ observedStableFrames: 2 });
    expect(harness.dom.getActiveAnimationCount).toHaveBeenCalledTimes(4);
  });

  it('delays mutation and scroll quiet independently without reading geometry in callbacks', async () => {
    const harness = createHarness({ rects: [rect(), rect(), rect(), rect(), rect()] });
    const settled = vi.fn();
    const observation = harness.observer.observe(harness.target);
    observation.then(settled);

    harness.layout.emit('mutation', 70);
    harness.layout.emit('mutation', 71);
    harness.layout.emit('scroll', 72);
    expect(harness.geometry.getBoundingRect).not.toHaveBeenCalled();

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await harness.controlled.frame(112);
    expect(settled).not.toHaveBeenCalled();
    await harness.controlled.frame(160);

    await expect(observation).resolves.toMatchObject({
      lastMutationAt: 71,
      lastScrollAt: 72,
    });
    expect(harness.geometry.getBoundingRect).toHaveBeenCalledTimes(4);
  });

  it('uses root-only mutation and viewport scroll gates without geometry reads', async () => {
    const harness = createHarness();
    const promise = harness.observer.observe();

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await harness.controlled.frame(112);

    await expect(promise).resolves.toMatchObject({
      requiredStableFrames: 2,
      observedStableFrames: 2,
    });
    expect(harness.geometry.getBoundingRect).not.toHaveBeenCalled();
    expect(harness.dom.getViewportScrollTarget).toHaveBeenCalledWith(document);
  });

  it('fails promptly when the watched target detaches and cleans up the frame loop', async () => {
    let attempts = 0;
    const trace = new BrowserDiagnosticsTrace();
    const harness = createHarness({
      validate: async (handle) => {
        attempts += 1;
        if (attempts === 2) throw actorbleError('TARGET_DETACHED', 'Target detached.');
        return handle;
      },
      trace,
    });
    const promise = harness.observer.observe(harness.target);

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);

    await expect(promise).rejects.toMatchObject({ code: 'TARGET_DETACHED' });
    expect(harness.layout.tracker.stop).toHaveBeenCalledOnce();
    expect(harness.controlled.pendingFrames).toBe(0);
    expect(trace.getTrace().events.at(-1)).toMatchObject({
      name: 'stability:complete',
      data: { outcome: 'failed', code: 'TARGET_DETACHED' },
    });
  });

  it('reports the last stability sample on timeout and disposes after abort', async () => {
    const harness = createHarness({ rects: [rect(), rect(20)] });
    const timedOut = harness.observer.observe(harness.target, { timeout: 90 });
    const timeoutExpectation = expect(timedOut).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: {
        requiredStableFrames: 2,
        observedStableFrames: 0,
        previousRect: rect(),
        lastRect: rect(20),
        lastMutationAt: 0,
        lastScrollAt: 0,
      },
    });

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);

    await timeoutExpectation;

    const abortTrace = new BrowserDiagnosticsTrace();
    const abortHarness = createHarness({ trace: abortTrace });
    const controller = new AbortController();
    const cancelled = abortHarness.observer.observe(abortHarness.target, {
      signal: controller.signal,
    });
    controller.abort('stop');

    await expect(cancelled).rejects.toMatchObject({ code: 'ACTION_CANCELLED' });
    expect(abortHarness.layout.tracker.stop).toHaveBeenCalledOnce();
    expect(abortHarness.controlled.pendingFrames).toBe(0);
    expect(abortTrace.getTrace().events.at(-1)).toMatchObject({
      name: 'stability:complete',
      data: { outcome: 'cancelled', code: 'ACTION_CANCELLED' },
    });
  });

  it('records scalar-only stability lifecycle and an authoritative timeout snapshot', async () => {
    const trace = new BrowserDiagnosticsTrace({ retention: { maxEvents: 1, maxSnapshots: 1 } });
    const harness = createHarness({ rects: [rect(), rect(20)], trace });
    const timedOut = harness.observer.observe(harness.target, { timeout: 90 });
    const expectation = expect(timedOut).rejects.toMatchObject({
      code: 'ACTION_TIMEOUT',
      details: expect.objectContaining({
        requiredStableFrames: 2,
        observedStableFrames: 0,
        lastRect: rect(20),
      }),
    });

    await harness.controlled.frame(80);
    await harness.controlled.frame(96);
    await expectation;

    const snapshot = trace.getTrace();
    expect(snapshot.events).toEqual([
      expect.objectContaining({
        name: 'stability:complete',
        data: { outcome: 'timed-out', code: 'ACTION_TIMEOUT' },
      }),
    ]);
    expect(snapshot.snapshots).toEqual([
      expect.objectContaining({
        name: 'stability:timeout',
        data: expect.objectContaining({ lastRect: rect(20), observedStableFrames: 0 }),
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('target-1');
    expect(JSON.stringify(snapshot)).not.toContain('button#target');
  });
});
