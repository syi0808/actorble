import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserDomAdapter } from '../src/platform/platform-adapter/dom-adapter/index.js';
import { BrowserSurfaceEngine } from '../src/targeting/surface-engine/index.js';

const visibility = Object.freeze({
  visibleArea: 100,
  targetArea: 100,
  visibilityRatio: 1,
  fullyVisible: true,
});

function targetHandle(element) {
  return {
    id: 'target-1',
    element,
    root: document,
    resolvedAt: 0,
    validity: 'live',
    debug: {},
  };
}

function executedStep(surface, from, to) {
  return {
    surface,
    from,
    to,
    plannedTo: to,
    actualTo: to,
    axes: ['x', 'y'],
    elapsed: 1,
  };
}

function createScrollEngine(overrides = {}) {
  return {
    reveal: vi.fn(async (target) => ({
      changed: true,
      before: visibility,
      after: visibility,
      fullyVisible: true,
      visibilityRatio: 1,
      steps: [executedStep(window, { x: 0, y: 0 }, { x: 10, y: 20 })],
      elapsed: 1,
      target,
    })),
    to: vi.fn(async (surface, destination) =>
      executedStep(surface, { x: 0, y: 0 }, { x: destination.x ?? 0, y: destination.y ?? 0 }),
    ),
    by: vi.fn(async (surface, delta) =>
      executedStep(surface, { x: 0, y: 0 }, { x: delta.x ?? 0, y: delta.y ?? 0 }),
    ),
    planReveal: vi.fn(() => ({ steps: [], before: visibility, expected: visibility })),
    raf: vi.fn(),
    getState: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  };
}

describe('BrowserSurfaceEngine scroller2 integration', () => {
  beforeEach(() => document.body.replaceChildren());

  it('delegates reveal and maps scroller2 results to Actorble contracts', async () => {
    const target = document.createElement('button');
    document.body.append(target);
    const scrollEngine = createScrollEngine();
    const engine = new BrowserSurfaceEngine({ scrollEngine });

    const result = await engine.reveal(targetHandle(target), {
      visibility: 'full',
      block: 'center',
      motion: { kind: 'instant' },
      settle: 'none',
    });

    expect(scrollEngine.reveal).toHaveBeenCalledWith(
      target,
      expect.objectContaining({
        visibility: 'full',
        block: 'center',
        motion: 'instant',
        settle: false,
        signal: expect.any(AbortSignal),
      }),
    );
    expect(result).toMatchObject({
      changed: true,
      fullyVisible: true,
      visibilityRatio: 1,
      steps: [
        {
          surfaceId: 'viewport',
          from: { x: 0, y: 0 },
          intendedTo: { x: 10, y: 20 },
          to: { x: 10, y: 20 },
        },
      ],
    });
  });

  it('delegates absolute and relative viewport scrolling', async () => {
    const scrollEngine = createScrollEngine();
    const engine = new BrowserSurfaceEngine({ scrollEngine });

    await expect(engine.scrollTo({ x: 10, y: 20 })).resolves.toMatchObject({
      after: { x: 10, y: 20 },
    });
    await expect(engine.scrollBy({ x: 5, y: -2 })).resolves.toMatchObject({
      after: { x: 5, y: -2 },
    });

    expect(scrollEngine.to).toHaveBeenCalledWith(
      window,
      { x: 10, y: 20 },
      expect.objectContaining({
        motion: 'instant',
        settle: false,
      }),
    );
    expect(scrollEngine.by).toHaveBeenCalledWith(window, { x: 5, y: -2 }, expect.any(Object));
  });

  it('maps timed motion and scroll-stable settlement options', async () => {
    const scrollEngine = createScrollEngine();
    const engine = new BrowserSurfaceEngine({ scrollEngine });

    await engine.scrollTo(
      { x: 10, y: 20 },
      {
        timeout: 500,
        motion: { kind: 'timed', duration: 120, timing: 'linear' },
        settle: { kind: 'scroll-stable', quietMs: 20, stableFrames: 3, threshold: 0.25 },
      },
    );

    expect(scrollEngine.to).toHaveBeenCalledWith(
      window,
      { x: 10, y: 20 },
      expect.objectContaining({
        motion: expect.objectContaining({
          type: 'tween',
          duration: 120,
          easing: expect.any(Function),
        }),
        settle: { quietMs: 20, stableFrames: 3, threshold: 0.25, timeout: 500 },
      }),
    );
  });

  it('preserves legacy ensureVisible behind the Surface Engine boundary', async () => {
    const target = document.createElement('button');
    document.body.append(target);
    const dom = new BrowserDomAdapter();
    const scrollIntoView = vi.spyOn(dom, 'scrollIntoView').mockImplementation(() => {});
    const engine = new BrowserSurfaceEngine({ dom, scrollEngine: createScrollEngine() });

    await engine.ensureVisible(targetHandle(target), { block: 'center' });

    expect(scrollIntoView).toHaveBeenCalledWith(target, { block: 'center' });
  });

  it('maps external aborts to Actorble cancellation', async () => {
    const scrollEngine = createScrollEngine({
      to: vi.fn(async (_surface, _destination, options) => {
        await new Promise((resolve) =>
          options.signal.addEventListener('abort', resolve, { once: true }),
        );
        throw new Error('upstream aborted');
      }),
    });
    const controller = new AbortController();
    const engine = new BrowserSurfaceEngine({ scrollEngine });
    const pending = engine.scrollTo({ x: 1, y: 2 }, { signal: controller.signal });

    controller.abort('stop');

    await expect(pending).rejects.toMatchObject({ code: 'ACTION_CANCELLED' });
  });

  it('creates scroller2 lazily and disposes its browser listeners', async () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const engine = new BrowserSurfaceEngine();

    expect(added).not.toHaveBeenCalledWith('wheel', expect.any(Function), expect.anything());

    await engine.scrollTo({ x: 0, y: 0 });
    engine.dispose();

    expect(added).toHaveBeenCalledWith('wheel', expect.any(Function), {
      capture: true,
      passive: true,
    });
    expect(removed).toHaveBeenCalledWith('wheel', expect.any(Function), { capture: true });
  });
});
