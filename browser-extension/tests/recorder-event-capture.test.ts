import { describe, expect, it } from 'vitest';
import {
  RECORDER_MASKED_VALUE,
  createRecorderEventCapturePort,
  detectSensitiveInputReason,
  type RecorderClickEvent,
  type RecorderDragEvent,
  type RecorderEventCaptureAdapter,
  type RecorderEventFlush,
  type RecorderPointerEvent,
  type RecorderSession,
  type RecorderSelectionSnapshot,
  type RecorderTextEvent,
} from '../src/recorder/event-capture.js';

describe('recorder event capture', () => {
  it('flushes click events with locator-useful target context and cleans listeners on stop', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(1000),
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    const start = capture.start(session());
    adapter.dispatchClick(targets.button, {
      clientX: 12,
      clientY: 18,
      pageX: 112,
      pageY: 218,
      button: 0,
    });
    const stop = await capture.stop('record-1');

    expect(start).toMatchObject({
      ok: true,
      value: {
        sessionId: 'record-1',
        tabId: 7,
        frameId: 0,
      },
    });
    expect(stop).toEqual({
      ok: true,
      value: undefined,
    });
    expect(flushes).toMatchObject([
      {
        tabId: 7,
        frameId: 0,
        sessionId: 'record-1',
        reason: 'incremental',
        events: [
          {
            kind: 'click',
            timestamp: 1000,
            clientX: 12,
            clientY: 18,
            pageX: 112,
            pageY: 218,
            button: 0,
            target: {
              tagName: 'button',
              id: 'submit',
              role: 'button',
              text: 'Sign in',
            },
          },
        ],
      },
    ]);
    expect(adapter.removedListeners).toEqual([
      'click',
      'input',
      'change',
      'pointerdown',
      'pointermove',
      'pointerup',
      'selectionchange',
      'dragstart',
      'drop',
      'pagehide',
    ]);
  });

  it('captures text input and masks sensitive values before flushing raw events', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(2000),
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    capture.start(session());
    adapter.dispatchInput(targets.password);
    const stop = await capture.stop('record-1');

    expect(stop).toMatchObject({ ok: true });
    expect(flushes).toMatchObject([
      {
        reason: 'incremental',
        events: [
          {
            kind: 'text',
            timestamp: 2000,
            source: 'input',
            value: RECORDER_MASKED_VALUE,
            sensitive: true,
            sensitiveReason: 'password_type',
            target: {
              tagName: 'input',
              id: 'password',
              inputType: 'password',
              name: 'password',
            },
          },
        ],
      },
    ]);
    expect(JSON.stringify(flushes)).not.toContain('correct horse battery staple');
  });

  it('captures pointer windows in dispatch order with target context', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(2500),
      autoFlush: false,
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    capture.start(session());
    adapter.dispatchPointer('down', targets.button, { clientX: 12, clientY: 18, buttons: 1 });
    adapter.dispatchPointer('move', targets.button, { clientX: 22, clientY: 28, buttons: 1 });
    adapter.dispatchPointer('up', targets.button, {
      clientX: 32,
      clientY: 38,
      button: 0,
      buttons: 0,
    });
    const stop = await capture.stop('record-1');

    expect(stop).toMatchObject({ ok: true });
    expect(flushes).toMatchObject([
      {
        reason: 'stop',
        events: [
          {
            kind: 'pointer',
            phase: 'down',
            timestamp: 2500,
            clientX: 12,
            clientY: 18,
            pointerId: 1,
            pointerType: 'mouse',
            button: 0,
            buttons: 1,
            target: {
              tagName: 'button',
              id: 'submit',
            },
          },
          {
            kind: 'pointer',
            phase: 'move',
            timestamp: 2501,
            clientX: 22,
            clientY: 28,
          },
          {
            kind: 'pointer',
            phase: 'up',
            timestamp: 2502,
            clientX: 32,
            clientY: 38,
            buttons: 0,
          },
        ],
      },
    ]);
  });

  it('captures selection changes with selected text in plain text', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(2600),
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    capture.start(session());
    adapter.dispatchSelection({
      selectedText: 'plain selected secret',
      activeTarget: targets.editor,
      anchorTarget: targets.editor,
      focusTarget: targets.editor,
    });
    const stop = await capture.stop('record-1');

    expect(stop).toMatchObject({ ok: true });
    expect(flushes).toMatchObject([
      {
        reason: 'incremental',
        events: [
          {
            kind: 'selection',
            timestamp: 2600,
            selectedText: 'plain selected secret',
            activeTarget: {
              tagName: 'div',
              role: 'textbox',
            },
            anchorTarget: {
              tagName: 'div',
              role: 'textbox',
            },
            focusTarget: {
              tagName: 'div',
              role: 'textbox',
            },
          },
        ],
      },
    ]);
  });

  it('captures drag start and drop events with timestamps and targets', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(2700),
      autoFlush: false,
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    capture.start(session());
    adapter.dispatchDrag('start', targets.draggable, { clientX: 40, clientY: 50 });
    adapter.dispatchDrag('drop', targets.dropzone, { clientX: 140, clientY: 150 });
    const stop = await capture.stop('record-1');

    expect(stop).toMatchObject({ ok: true });
    expect(flushes).toMatchObject([
      {
        reason: 'stop',
        events: [
          {
            kind: 'drag',
            phase: 'start',
            timestamp: 2700,
            clientX: 40,
            clientY: 50,
            target: {
              tagName: 'div',
              id: 'card',
            },
          },
          {
            kind: 'drag',
            phase: 'drop',
            timestamp: 2701,
            clientX: 140,
            clientY: 150,
            target: {
              tagName: 'section',
              id: 'lane',
            },
          },
        ],
      },
    ]);
  });

  it('flushes pending events on page navigation and ignores later events', async () => {
    const adapter = createFakeAdapter();
    const flushes: RecorderEventFlush[] = [];
    const capture = createRecorderEventCapturePort(adapter, {
      now: createClock(3000),
      autoFlush: false,
      flushEvents(flush) {
        flushes.push(flush);
      },
    });

    capture.start(session());
    adapter.dispatchClick(targets.button);
    adapter.dispatchPointer('down', targets.button);
    adapter.dispatchPagehide();
    adapter.dispatchClick(targets.button);
    adapter.dispatchPointer('up', targets.button);
    const stop = await capture.stop('record-1');

    expect(adapter.removedListeners).toEqual([
      'click',
      'input',
      'change',
      'pointerdown',
      'pointermove',
      'pointerup',
      'selectionchange',
      'dragstart',
      'drop',
      'pagehide',
    ]);
    expect(stop).toEqual({
      ok: true,
      value: undefined,
    });
    expect(flushes).toMatchObject([
      {
        reason: 'pagehide',
        events: [
          {
            kind: 'click',
            timestamp: 3000,
          },
          {
            kind: 'pointer',
            phase: 'down',
            timestamp: 3001,
          },
        ],
      },
    ]);
  });

  it('reports flush failures on stop', async () => {
    const adapter = createFakeAdapter();
    const capture = createRecorderEventCapturePort(adapter, {
      flushEvents() {
        throw new Error('background unavailable');
      },
    });

    capture.start(session());
    adapter.dispatchClick(targets.button);
    const stop = await capture.stop('record-1');

    expect(stop).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'Recorder events could not be flushed.',
        },
      ],
    });
  });

  it('marks secret-like fields as sensitive even when the input type is not password', () => {
    expect(
      detectSensitiveInputReason({
        inputType: 'text',
        name: 'api_token',
      }),
    ).toBe('secret_like_field');

    expect(
      detectSensitiveInputReason({
        inputType: 'password',
        name: 'login',
      }),
    ).toBe('password_type');
  });

  it('rejects overlapping sessions and mismatched stops', async () => {
    const adapter = createFakeAdapter();
    const capture = createRecorderEventCapturePort(adapter);

    expect(capture.start(session())).toMatchObject({ ok: true });
    expect(capture.start({ ...session(), sessionId: 'record-2' })).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'A recorder session is already active.',
        },
      ],
    });
    await expect(capture.stop('record-2')).resolves.toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'The stop message does not match the active recorder session.',
        },
      ],
    });
  });
});

type FakeElement = Readonly<{
  key: string;
  value?: string;
  sensitiveReason?: 'password_type' | 'secret_like_field';
}>;

const targets = {
  button: {
    key: 'button',
  },
  password: {
    key: 'password',
    value: 'correct horse battery staple',
    sensitiveReason: 'password_type',
  },
  editor: {
    key: 'editor',
  },
  draggable: {
    key: 'draggable',
  },
  dropzone: {
    key: 'dropzone',
  },
} satisfies Record<string, FakeElement>;

function createFakeAdapter() {
  const removedListeners: string[] = [];
  let click: ((event: RecorderClickEvent<FakeElement>) => void) | undefined;
  let input: ((event: RecorderTextEvent<FakeElement>) => void) | undefined;
  let change: ((event: RecorderTextEvent<FakeElement>) => void) | undefined;
  let pointerDown: ((event: RecorderPointerEvent<FakeElement>) => void) | undefined;
  let pointerMove: ((event: RecorderPointerEvent<FakeElement>) => void) | undefined;
  let pointerUp: ((event: RecorderPointerEvent<FakeElement>) => void) | undefined;
  let selectionChange: (() => void) | undefined;
  let selectionSnapshot: RecorderSelectionSnapshot<FakeElement> = {
    selectedText: '',
  };
  let dragStart: ((event: RecorderDragEvent<FakeElement>) => void) | undefined;
  let drop: ((event: RecorderDragEvent<FakeElement>) => void) | undefined;
  let pagehide: (() => void) | undefined;

  const adapter = {
    removedListeners,
    onClick(listener) {
      click = listener;
      return () => {
        removedListeners.push('click');
      };
    },
    onInput(listener) {
      input = listener;
      return () => {
        removedListeners.push('input');
      };
    },
    onChange(listener) {
      change = listener;
      return () => {
        removedListeners.push('change');
      };
    },
    onPointerDown(listener) {
      pointerDown = listener;
      return () => {
        removedListeners.push('pointerdown');
      };
    },
    onPointerMove(listener) {
      pointerMove = listener;
      return () => {
        removedListeners.push('pointermove');
      };
    },
    onPointerUp(listener) {
      pointerUp = listener;
      return () => {
        removedListeners.push('pointerup');
      };
    },
    onSelectionChange(listener) {
      selectionChange = listener;
      return () => {
        removedListeners.push('selectionchange');
      };
    },
    onDragStart(listener) {
      dragStart = listener;
      return () => {
        removedListeners.push('dragstart');
      };
    },
    onDrop(listener) {
      drop = listener;
      return () => {
        removedListeners.push('drop');
      };
    },
    onPagehide(listener) {
      pagehide = listener;
      return () => {
        removedListeners.push('pagehide');
      };
    },
    describeElement(element) {
      if (element.key === 'password') {
        return {
          tagName: 'input',
          id: 'password',
          name: 'password',
          inputType: 'password',
          rect: { x: 10, y: 20, width: 200, height: 32 },
          frameUrl: 'http://localhost:3000/login',
        };
      }

      if (element.key === 'editor') {
        return {
          tagName: 'div',
          role: 'textbox',
          text: 'Plain selected text',
          rect: { x: 10, y: 70, width: 260, height: 90 },
          frameUrl: 'http://localhost:3000/login',
        };
      }

      if (element.key === 'draggable') {
        return {
          tagName: 'div',
          id: 'card',
          rect: { x: 40, y: 50, width: 100, height: 40 },
          frameUrl: 'http://localhost:3000/login',
        };
      }

      if (element.key === 'dropzone') {
        return {
          tagName: 'section',
          id: 'lane',
          rect: { x: 120, y: 130, width: 280, height: 320 },
          frameUrl: 'http://localhost:3000/login',
        };
      }

      return {
        tagName: 'button',
        id: 'submit',
        role: 'button',
        text: 'Sign in',
        rect: { x: 10, y: 20, width: 100, height: 32 },
        frameUrl: 'http://localhost:3000/login',
      };
    },
    readElementValue(element) {
      return element.value ?? '';
    },
    readSelection() {
      return selectionSnapshot;
    },
    sensitiveInputReason(element) {
      return element.sensitiveReason ?? null;
    },
    dispatchClick(target, event = {}) {
      click?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        target,
        ...event,
      });
    },
    dispatchInput(target) {
      input?.({ target });
    },
    dispatchChange(target) {
      change?.({ target });
    },
    dispatchPointer(phase, target, event = {}) {
      const listener = phase === 'down' ? pointerDown : phase === 'move' ? pointerMove : pointerUp;
      listener?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        target,
        ...event,
      });
    },
    dispatchSelection(snapshot) {
      selectionSnapshot = snapshot;
      selectionChange?.();
    },
    dispatchDrag(phase, target, event = {}) {
      const listener = phase === 'start' ? dragStart : drop;
      listener?.({
        clientX: 12,
        clientY: 18,
        target,
        ...event,
      });
    },
    dispatchPagehide() {
      pagehide?.();
    },
  } satisfies RecorderEventCaptureAdapter<FakeElement> & {
    removedListeners: string[];
    dispatchClick(target: FakeElement, event?: Partial<RecorderClickEvent<FakeElement>>): void;
    dispatchInput(target: FakeElement): void;
    dispatchChange(target: FakeElement): void;
    dispatchPointer(
      phase: 'down' | 'move' | 'up',
      target: FakeElement,
      event?: Partial<RecorderPointerEvent<FakeElement>>,
    ): void;
    dispatchSelection(snapshot: RecorderSelectionSnapshot<FakeElement>): void;
    dispatchDrag(
      phase: 'start' | 'drop',
      target: FakeElement,
      event?: Partial<RecorderDragEvent<FakeElement>>,
    ): void;
    dispatchPagehide(): void;
  };
  return adapter;
}

function session(): RecorderSession {
  return {
    tabId: 7,
    frameId: 0,
    sessionId: 'record-1',
    startedAt: 100,
    sensitiveInputPolicy: 'mask',
  };
}

function createClock(start: number): () => number {
  let now = start;
  return () => now++;
}
