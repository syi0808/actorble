import { describe, expect, it, vi } from 'vitest';
import { BrowserGestureEngine, createGestureEngine } from '../src/input/gesture-engine/index.js';
import { BrowserPointerEngine } from '../src/input/pointer-engine/index.js';
import { BrowserPointerSignalBus } from '../src/input/pointer-signals/index.js';
import { cancellationError } from '../src/shared/index.js';

function createTimeline(calls) {
  return {
    now: vi.fn(() => 0),
    delay: vi.fn(async (duration, options) => {
      if (calls) {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['delay', duration, options] : ['delay', duration]);
      }
    }),
    nextFrame: vi.fn(async () => 0),
    settle: vi.fn(async () => {}),
    withTimeout: vi.fn(async (operation) => operation),
  };
}

function createTarget(id = 'target-1') {
  const element = document.createElement('button');

  return {
    id,
    element,
    resolvedAt: 0,
    root: document,
    validity: 'live',
    debug: { description: `button#${id}` },
  };
}

function createFakePointer() {
  const calls = [];
  const timeline = createTimeline(calls);
  const state = {
    id: 'pointer-1',
    position: { x: 0, y: 0 },
    previousPosition: null,
    motion: { status: 'idle' },
    buttons: { pressed: [], primary: null },
    surface: { id: null, coordinateSpace: 'viewport' },
  };

  return {
    calls,
    pointer: {
      getState: vi.fn(() => state),
      moveTo: vi.fn(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point]);
        return state;
      }),
      down: vi.fn(async (button) => {
        calls.push(['down', button]);
        return state;
      }),
      up: vi.fn(async (button) => {
        calls.push(['up', button]);
        return state;
      }),
      cancel: vi.fn(async () => {
        calls.push(['cancel']);
        return state;
      }),
    },
    timeline,
  };
}

describe('BrowserGestureEngine', () => {
  it.each([
    {
      phase: 'click dwell after down',
      run: (engine) => engine.click(createTarget(), { x: 3, y: 4 }, { pressDwell: 50 }),
      arrange: ({ timeline }) => {
        timeline.delay.mockRejectedValueOnce(cancellationError('timeline.delay', 'phase abort'));
      },
    },
    {
      phase: 'drag movement after down',
      run: (engine) => engine.drag({ x: 1, y: 1 }, { x: 9, y: 9 }),
      arrange: ({ pointer }) => {
        pointer.moveTo.mockResolvedValueOnce(pointer.getState());
        pointer.moveTo.mockRejectedValueOnce(cancellationError('pointer.moveTo', 'phase abort'));
      },
    },
    {
      phase: 'pointer sequence pause after down',
      run: (engine) =>
        engine.pointerSequence([
          { type: 'down', button: 'primary' },
          { type: 'pause', duration: 50 },
          { type: 'up', button: 'primary' },
        ]),
      arrange: ({ timeline }) => {
        timeline.delay.mockRejectedValueOnce(cancellationError('timeline.delay', 'phase abort'));
      },
    },
  ])('cancels exactly once when aborted during $phase', async ({ arrange, run }) => {
    const harness = createFakePointer();
    const engine = new BrowserGestureEngine({
      pointer: harness.pointer,
      timeline: harness.timeline,
    });

    arrange(harness);

    await expect(run(engine)).rejects.toMatchObject({ code: 'ACTION_CANCELLED' });
    expect(harness.calls.filter(([operation]) => operation === 'cancel')).toHaveLength(1);
    expect(harness.calls.filter(([operation]) => operation === 'up')).toHaveLength(0);
  });

  it('click composes move, down, and up pointer operations in order', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(engine.click(createTarget(), { x: 40, y: 24 })).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 40, y: 24 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('refreshes the click point after movement and before pointer down', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(
      engine.click(
        createTarget(),
        { x: 40, y: 24 },
        {
          refreshPointBeforeDown: vi.fn(async (point) => {
            calls.push(['refreshPointBeforeDown', point]);
            return { x: 45, y: 29 };
          }),
        },
      ),
    ).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 40, y: 24 }],
      ['refreshPointBeforeDown', { x: 40, y: 24 }],
      ['moveTo', { x: 45, y: 29 }, { duration: 0 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('click emits the expected pointer signal sequence through the pointer boundary', async () => {
    const signals = new BrowserPointerSignalBus();
    const timeline = createTimeline();
    const events = [];

    signals.subscribe((signal) => events.push(signal));

    const engine = new BrowserGestureEngine({
      pointer: new BrowserPointerEngine({ signals, timeline }),
    });

    await engine.click(createTarget(), { x: 12, y: 18 });

    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 12, y: 18 },
        previousPoint: { x: 0, y: 0 },
      },
      {
        type: 'pointer:down',
        point: { x: 12, y: 18 },
        button: 'primary',
      },
      {
        type: 'pointer:up',
        point: { x: 12, y: 18 },
        button: 'primary',
      },
    ]);
  });

  it('click passes the requested pointer button through down and up', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await engine.click(createTarget(), { x: 5, y: 9 }, { button: 'secondary' });

    expect(calls).toEqual([
      ['moveTo', { x: 5, y: 9 }],
      ['down', 'secondary'],
      ['up', 'secondary'],
    ]);
  });

  it('click supports a multi-click sequence without moving between clicks', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(
      engine.click(createTarget(), { x: 5, y: 9 }, { clickCount: 2, pressDwell: 0 }),
    ).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 5, y: 9 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('doubleClick composes two pointer down/up sequences after one move', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(
      engine.doubleClick(createTarget(), { x: 6, y: 10 }, { pressDwell: 0 }),
    ).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 6, y: 10 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('refreshes the pointer point before each click in a multi-click sequence', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(
      engine.click(
        createTarget(),
        { x: 10, y: 20 },
        {
          clickCount: 2,
          pressDwell: 0,
          refreshPointBeforeDown: vi
            .fn()
            .mockImplementationOnce(async (point) => {
              calls.push(['refreshPointBeforeDown', point]);
              return { x: 11, y: 21 };
            })
            .mockImplementationOnce(async (point) => {
              calls.push(['refreshPointBeforeDown', point]);
              return { x: 12, y: 22 };
            }),
        },
      ),
    ).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 10, y: 20 }],
      ['refreshPointBeforeDown', { x: 10, y: 20 }],
      ['moveTo', { x: 11, y: 21 }, { duration: 0 }],
      ['down', 'primary'],
      ['up', 'primary'],
      ['refreshPointBeforeDown', { x: 11, y: 21 }],
      ['moveTo', { x: 12, y: 22 }, { duration: 0 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('routes explicit click movement options into pointer movement before pressing', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await engine.click(
      createTarget(),
      { x: 12, y: 18 },
      {
        motion: { kind: 'ease', timing: 'ease-out', duration: 260 },
        timeout: 1500,
      },
    );

    expect(calls).toEqual([
      [
        'moveTo',
        { x: 12, y: 18 },
        {
          motion: { kind: 'ease', timing: 'ease-out', duration: 260 },
          timeout: 1500,
        },
      ],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('routes dynamic click endpoints into pointer movement before pressing', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });
    const resolveEndpoint = vi.fn(async () => ({ x: 18, y: 24 }));

    await engine.click(
      createTarget(),
      { x: 12, y: 18 },
      {
        duration: 120,
        resolveEndpoint,
        pressDwell: 0,
      },
    );

    expect(calls).toEqual([
      [
        'moveTo',
        { x: 12, y: 18 },
        {
          duration: 120,
          resolveEndpoint,
        },
      ],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
  });

  it('lets callers disable or customize click press dwell', async () => {
    const first = createFakePointer();
    const firstEngine = new BrowserGestureEngine({
      pointer: first.pointer,
      timeline: first.timeline,
    });

    await firstEngine.click(createTarget(), { x: 1, y: 2 }, { pressDwell: 0 });

    expect(first.calls).toEqual([
      ['moveTo', { x: 1, y: 2 }],
      ['down', 'primary'],
      ['up', 'primary'],
    ]);
    expect(first.timeline.delay).not.toHaveBeenCalled();

    const second = createFakePointer();
    const secondEngine = new BrowserGestureEngine({
      pointer: second.pointer,
      timeline: second.timeline,
    });
    const controller = new AbortController();

    await secondEngine.click(
      createTarget(),
      { x: 3, y: 4 },
      {
        pressDwell: 24,
        signal: controller.signal,
      },
    );

    expect(second.calls).toEqual([
      ['moveTo', { x: 3, y: 4 }, { signal: controller.signal }],
      ['down', 'primary'],
      ['delay', 24, { signal: controller.signal }],
      ['up', 'primary'],
    ]);
  });

  it('cancels pointer state when click dwell is cancelled after pointer down', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    timeline.delay.mockImplementationOnce(async (duration, options) => {
      const hasOptions = options !== undefined && Object.keys(options).length > 0;

      calls.push(hasOptions ? ['delay', duration, options] : ['delay', duration]);
      throw cancellationError('timeline.delay', 'scenario stopped');
    });

    await expect(
      engine.click(createTarget(), { x: 3, y: 4 }, { pressDwell: 80 }),
    ).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: {
        operation: 'timeline.delay',
        reason: 'scenario stopped',
      },
    });

    expect(calls).toEqual([
      ['moveTo', { x: 3, y: 4 }],
      ['down', 'primary'],
      ['delay', 80],
      ['cancel'],
    ]);
  });

  it('hover only moves the pointer', async () => {
    const { calls, pointer } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer });

    await expect(engine.hover({ x: 3, y: 4 })).resolves.toEqual({ completed: true });

    expect(calls).toEqual([['moveTo', { x: 3, y: 4 }]]);
  });

  it('cancel delegates to pointer cancellation for orchestrator cleanup', async () => {
    const { calls, pointer } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer });

    await expect(engine.cancel()).resolves.toEqual({ completed: false });

    expect(calls).toEqual([['cancel']]);
  });

  it('pointerSequence executes move, down, pause, move, and up in order', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });
    const controller = new AbortController();

    await expect(
      engine.pointerSequence(
        [
          { type: 'move', to: { x: 1, y: 2 }, duration: 10 },
          { type: 'down', button: 'primary' },
          { type: 'pause', duration: 20 },
          { type: 'move', to: { x: 5, y: 6 }, duration: 30 },
          { type: 'up', button: 'primary' },
        ],
        { timeout: 100, signal: controller.signal },
      ),
    ).resolves.toEqual({ completed: true });

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 2 }, { timeout: 100, signal: controller.signal, duration: 10 }],
      ['down', 'primary'],
      ['delay', 20, { signal: controller.signal }],
      ['moveTo', { x: 5, y: 6 }, { timeout: 100, signal: controller.signal, duration: 30 }],
      ['up', 'primary'],
    ]);
  });

  it('pointerSequence cancels pressed pointer state when movement fails after down', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });
    const failure = new Error('sequence move failed');

    pointer.moveTo
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point]);
        return pointer.getState();
      })
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point]);
        throw failure;
      });

    await expect(
      engine.pointerSequence([
        { type: 'move', to: { x: 1, y: 2 } },
        { type: 'down', button: 'primary' },
        { type: 'move', to: { x: 3, y: 4 } },
      ]),
    ).rejects.toBe(failure);

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 2 }],
      ['down', 'primary'],
      ['moveTo', { x: 3, y: 4 }],
      ['cancel'],
    ]);
  });

  it('pointerSequence cancels pressed pointer state when pause is cancelled after down', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    timeline.delay.mockImplementationOnce(async (duration, options) => {
      const hasOptions = options !== undefined && Object.keys(options).length > 0;

      calls.push(hasOptions ? ['delay', duration, options] : ['delay', duration]);
      throw cancellationError('timeline.delay', 'scenario stopped');
    });

    await expect(
      engine.pointerSequence([
        { type: 'down', button: 'primary' },
        { type: 'pause', duration: 50 },
      ]),
    ).rejects.toMatchObject({
      code: 'ACTION_CANCELLED',
      details: { operation: 'timeline.delay', reason: 'scenario stopped' },
    });

    expect(calls).toEqual([['down', 'primary'], ['delay', 50], ['cancel']]);
  });

  it('pointerSequence cancels and reports incomplete sequences that end while pressed', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(
      engine.pointerSequence([{ type: 'down', button: 'primary' }]),
    ).rejects.toMatchObject({
      code: 'POINTER_SEQUENCE_INCOMPLETE',
      details: {
        boundary: 'gesture-engine',
        pressedButtons: ['primary'],
      },
    });

    expect(calls).toEqual([['down', 'primary'], ['cancel']]);
  });

  it('drag composes move, down, move, and up pointer operations in order', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });

    await expect(engine.drag({ x: 1, y: 1 }, { x: 10, y: 10 })).resolves.toEqual({
      completed: true,
    });

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 1 }],
      ['down', 'primary'],
      ['moveTo', { x: 10, y: 10 }],
      ['up', 'primary'],
    ]);
  });

  it('routes drag cancellation options into pointer movement without force', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });
    const controller = new AbortController();

    await engine.drag(
      { x: 2, y: 3 },
      { x: 20, y: 30 },
      {
        timeout: 1200,
        signal: controller.signal,
        duration: 420,
        motion: { kind: 'ease', timing: 'ease-in-out', duration: 420 },
        force: true,
      },
    );

    expect(calls).toEqual([
      [
        'moveTo',
        { x: 2, y: 3 },
        {
          timeout: 1200,
          signal: controller.signal,
          duration: 420,
          motion: { kind: 'ease', timing: 'ease-in-out', duration: 420 },
        },
      ],
      ['down', 'primary'],
      [
        'moveTo',
        { x: 20, y: 30 },
        {
          timeout: 1200,
          signal: controller.signal,
          duration: 420,
          motion: { kind: 'ease', timing: 'ease-in-out', duration: 420 },
        },
      ],
      ['up', 'primary'],
    ]);
  });

  it('surfaces unsupported pointer motion profiles before pressing', async () => {
    const signals = new BrowserPointerSignalBus();
    const timeline = createTimeline();
    const events = [];

    signals.subscribe((signal) => events.push(signal));

    const engine = createGestureEngine({
      pointer: new BrowserPointerEngine({ signals, timeline }),
    });

    await expect(
      engine.click(createTarget(), { x: 12, y: 18 }, { motion: { kind: 'linear' } }),
    ).rejects.toMatchObject({
      code: 'PLATFORM_UNSUPPORTED',
      details: {
        boundary: 'pointer-engine',
        profileKind: 'linear',
        supportedKinds: ['ease', 'inertia', 'spring'],
      },
    });

    expect(events).toEqual([]);
  });

  it('drag emits the expected synthetic pointer signal sequence', async () => {
    const signals = new BrowserPointerSignalBus();
    const timeline = createTimeline();
    const events = [];

    signals.subscribe((signal) => events.push(signal));

    const engine = createGestureEngine({
      pointer: new BrowserPointerEngine({ signals, timeline }),
    });

    await engine.drag({ x: 4, y: 8 }, { x: 40, y: 80 });

    expect(events).toEqual([
      {
        type: 'pointer:moved',
        point: { x: 4, y: 8 },
        previousPoint: { x: 0, y: 0 },
      },
      {
        type: 'pointer:down',
        point: { x: 4, y: 8 },
        button: 'primary',
      },
      {
        type: 'pointer:moved',
        point: { x: 40, y: 80 },
        previousPoint: { x: 4, y: 8 },
      },
      {
        type: 'pointer:up',
        point: { x: 40, y: 80 },
        button: 'primary',
      },
    ]);
  });

  it('drag cancels pressed pointer state when movement fails after down', async () => {
    const { calls, pointer, timeline } = createFakePointer();
    const engine = new BrowserGestureEngine({ pointer, timeline });
    const failure = new Error('drag move failed');

    pointer.moveTo
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point]);
        return pointer.getState();
      })
      .mockImplementationOnce(async (point, options) => {
        const hasOptions = options !== undefined && Object.keys(options).length > 0;

        calls.push(hasOptions ? ['moveTo', point, options] : ['moveTo', point]);
        throw failure;
      });

    await expect(engine.drag({ x: 1, y: 1 }, { x: 10, y: 10 })).rejects.toBe(failure);

    expect(calls).toEqual([
      ['moveTo', { x: 1, y: 1 }],
      ['down', 'primary'],
      ['moveTo', { x: 10, y: 10 }],
      ['cancel'],
    ]);
  });
});
