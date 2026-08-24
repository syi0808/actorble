import { describe, expect, it } from 'vitest';
import {
  createContentRecorderHost,
  createRecordEventFlushSender,
} from '../src/entrypoints/content/recorder-host.js';
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js';
import {
  createRecorderEventCapturePort,
  type RecorderClickEvent,
  type RecorderDragEvent,
  type RecorderEventCaptureAdapter,
  type RecorderPointerEvent,
  type RecorderSelectionSnapshot,
} from '../src/recorder/event-capture.js';

describe('content recorder host', () => {
  it('starts and stops a correlated recorder session and flushes captured events', async () => {
    const adapter = createFakeAdapter();
    const sent: ActorbleExtensionMessage[] = [];
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter, {
        now: () => 5000,
        flushEvents: createRecordEventFlushSender((message) => {
          sent.push(message);
        }),
      }),
      now: () => 1000,
    });

    const start = await host.handleMessage(startMessage());
    adapter.dispatchClick();
    const stop = await host.handleMessage(stopMessage());

    expect(start).toMatchObject({
      ok: true,
      value: {
        kind: 'record:start',
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'record-1',
        sessionId: 'record-1',
        status: 'recording',
      },
    });
    expect(stop).toMatchObject({
      ok: true,
      value: {
        kind: 'record:stop',
        tabId: 7,
        frameId: 0,
        scenarioId: 'scenario-1',
        runId: 'record-1',
        sessionId: 'record-1',
        status: 'stopped',
      },
    });
    expect(stop.ok && stop.value).not.toHaveProperty('events');
    expect(sent).toMatchObject([
      {
        kind: 'record:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
          sessionId: 'record-1',
          reason: 'incremental',
          events: [
            {
              kind: 'click',
              timestamp: 5000,
              target: {
                tagName: 'button',
                id: 'submit',
              },
            },
          ],
        },
      },
    ]);
  });

  it('flushes pending events on pagehide before content cleanup', async () => {
    const adapter = createFakeAdapter();
    const sent: ActorbleExtensionMessage[] = [];
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter, {
        now: () => 5000,
        autoFlush: false,
        flushEvents: createRecordEventFlushSender((message) => {
          sent.push(message);
        }),
      }),
      now: () => 1000,
    });

    await host.handleMessage(startMessage());
    adapter.dispatchClick();
    adapter.dispatchPagehide();
    await Promise.resolve();

    expect(sent).toMatchObject([
      {
        kind: 'record:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
          sessionId: 'record-1',
          reason: 'pagehide',
          events: [
            {
              kind: 'click',
              timestamp: 5000,
            },
          ],
        },
      },
    ]);
  });

  it('forwards pointer selection and drag raw events with recorder correlation', async () => {
    const adapter = createFakeAdapter();
    const sent: ActorbleExtensionMessage[] = [];
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter, {
        now: createClock(6000),
        autoFlush: false,
        flushEvents: createRecordEventFlushSender((message) => {
          sent.push(message);
        }),
      }),
      now: () => 1000,
    });

    await host.handleMessage(startMessage());
    adapter.dispatchPointer('down');
    adapter.dispatchSelection({
      selectedText: 'selected text',
      activeTarget: adapter.target,
      anchorTarget: adapter.target,
      focusTarget: adapter.target,
    });
    adapter.dispatchDrag('start');
    const stop = await host.handleMessage(stopMessage());

    expect(stop).toMatchObject({ ok: true });
    expect(sent).toMatchObject([
      {
        kind: 'record:event',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'scenario-1',
          runId: 'record-1',
          sessionId: 'record-1',
          reason: 'stop',
          events: [
            {
              kind: 'pointer',
              phase: 'down',
              timestamp: 6000,
            },
            {
              kind: 'selection',
              selectedText: 'selected text',
              timestamp: 6001,
            },
            {
              kind: 'drag',
              phase: 'start',
              timestamp: 6002,
            },
          ],
        },
      },
    ]);
  });

  it('rejects overlapping recorder sessions and mismatched stops', async () => {
    const adapter = createFakeAdapter();
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(adapter),
    });

    await host.handleMessage(startMessage());
    const overlapping = await host.handleMessage(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: 7,
          frameId: 0,
          runId: 'record-2',
        },
      }),
    );
    const mismatch = await host.handleMessage(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: 7,
          frameId: 0,
          runId: 'record-2',
        },
      }),
    );

    expect(overlapping).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'A recorder session is already active.',
        },
      ],
    });
    expect(mismatch).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'recorder_error',
          message: 'The stop message does not match the active recorder session.',
        },
      ],
    });
  });

  it('rejects unsupported messages at the recorder boundary', async () => {
    const host = createContentRecorderHost({
      capture: createRecorderEventCapturePort(createFakeAdapter()),
    });

    const result = await host.handleMessage({
      kind: 'scenario:validate',
      payload: {
        document: {},
      },
    } satisfies ActorbleExtensionMessage);

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'unsupported_message',
          message: 'scenario:validate is not handled by the content recorder host.',
        },
      ],
    });
  });
});

type FakeElement = Readonly<{ key: string }>;

function createFakeAdapter() {
  const target = { key: 'button' } satisfies FakeElement;
  let click: ((event: RecorderClickEvent<FakeElement>) => void) | undefined;
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
    target,
    onClick(listener) {
      click = listener;
      return () => {};
    },
    onInput() {
      return () => {};
    },
    onChange() {
      return () => {};
    },
    onPointerDown(listener) {
      pointerDown = listener;
      return () => {};
    },
    onPointerMove(listener) {
      pointerMove = listener;
      return () => {};
    },
    onPointerUp(listener) {
      pointerUp = listener;
      return () => {};
    },
    onSelectionChange(listener) {
      selectionChange = listener;
      return () => {};
    },
    onDragStart(listener) {
      dragStart = listener;
      return () => {};
    },
    onDrop(listener) {
      drop = listener;
      return () => {};
    },
    onPagehide(listener) {
      pagehide = listener;
      return () => {};
    },
    describeElement() {
      return {
        tagName: 'button',
        id: 'submit',
        role: 'button',
        text: 'Sign in',
        rect: { x: 10, y: 20, width: 100, height: 32 },
        frameUrl: 'http://localhost:3000/login',
      };
    },
    readElementValue() {
      return '';
    },
    readSelection() {
      return selectionSnapshot;
    },
    sensitiveInputReason() {
      return null;
    },
    dispatchClick() {
      click?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        target,
      });
    },
    dispatchPointer(phase) {
      const listener = phase === 'down' ? pointerDown : phase === 'move' ? pointerMove : pointerUp;
      listener?.({
        clientX: 12,
        clientY: 18,
        button: 0,
        buttons: phase === 'up' ? 0 : 1,
        pointerId: 1,
        pointerType: 'mouse',
        target,
      });
    },
    dispatchSelection(snapshot) {
      selectionSnapshot = snapshot;
      selectionChange?.();
    },
    dispatchDrag(phase) {
      const listener = phase === 'start' ? dragStart : drop;
      listener?.({
        clientX: 12,
        clientY: 18,
        target,
      });
    },
    dispatchPagehide() {
      pagehide?.();
    },
  } satisfies RecorderEventCaptureAdapter<FakeElement> & {
    target: FakeElement;
    dispatchClick(): void;
    dispatchPointer(phase: 'down' | 'move' | 'up'): void;
    dispatchSelection(snapshot: RecorderSelectionSnapshot<FakeElement>): void;
    dispatchDrag(phase: 'start' | 'drop'): void;
    dispatchPagehide(): void;
  };

  return adapter;
}

function createClock(start: number): () => number {
  let now = start;
  return () => now++;
}

function startMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'record:start',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  });
}

function stopMessage(): ActorbleExtensionMessage {
  return createExtensionMessage({
    kind: 'record:stop',
    payload: {
      tabId: 7,
      frameId: 0,
      scenarioId: 'scenario-1',
      runId: 'record-1',
    },
  });
}
