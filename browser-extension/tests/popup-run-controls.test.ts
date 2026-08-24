import { describe, expect, it } from 'vitest';
import {
  createPopupRunControls,
  createPopupRunControlsView,
  type PopupBackgroundState,
  type PopupRunControlsClient,
} from '../src/entrypoints/popup/run-controls.js';
import { createExtensionMessage, type ActorbleExtensionMessage } from '../src/messaging/index.js';
import { DRAFT_SCENARIO_SCHEMA_VERSION, type ScenarioDocument } from '../src/scenario/types.js';
import { failure, ok, type ExtensionResult } from '../src/shared/result.js';
import type { ScenarioRecord } from '../src/storage/index.js';

const olderScenario = scenarioRecord(
  'older-scenario',
  'Older scenario',
  '2026-06-17T00:00:00.000Z',
);
const newestScenario = scenarioRecord(
  'newest-scenario',
  'Newest scenario',
  '2026-06-17T00:01:00.000Z',
  {
    runId: 'run-previous',
    status: 'completed',
    completedAt: '2026-06-17T00:02:00.000Z',
  },
);

describe('popup run controls', () => {
  it('loads saved scenarios, defaults to the newest record, and renders tab readiness', async () => {
    const { controls, sent } = createTestControls();

    await controls.refresh();

    const snapshot = controls.getSnapshot();
    const view = createPopupRunControlsView(snapshot);
    expect(snapshot.selectedScenarioId).toBe('newest-scenario');
    expect(view.scenarioOptions).toEqual([
      { value: 'newest-scenario', label: 'Newest scenario' },
      { value: 'older-scenario', label: 'Older scenario' },
    ]);
    expect(view.statusMessage).toBe('Tab ready');
    expect(view.lastRunText).toBe('Completed at 2026-06-17T00:02:00.000Z');
    expect(view.buttons.run.disabled).toBe(false);
    expect(view.buttons.pauseResume.disabled).toBe(true);
    expect(sent[0]).toEqual(
      createExtensionMessage({
        kind: 'popup:get-state',
        payload: {
          scenarioId: 'newest-scenario',
        },
      }),
    );
  });

  it('dispatches the selected scenario run with compiled payload and correlation metadata', async () => {
    const { controls, sent } = createTestControls({
      createRunId: () => 'run-popup-1',
    });
    await controls.refresh();
    controls.selectScenario('older-scenario');

    const result = await controls.runSelectedScenario();

    expect(result).toMatchObject({
      ok: true,
      value: {
        kind: 'scenario:run',
        runId: 'run-popup-1',
        scenarioId: 'older-scenario',
        status: 'running',
      },
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]).toMatchObject({
      kind: 'scenario:run',
      payload: {
        tabId: 7,
        frameId: 0,
        scenarioId: 'older-scenario',
        runId: 'run-popup-1',
        compilation: {
          scenario: {
            id: 'older-scenario',
            steps: [{ action: 'delay', duration: 1 }],
          },
        },
      },
    });
    expect(controls.getSnapshot()).toMatchObject({
      currentRun: {
        runId: 'run-popup-1',
        status: 'running',
      },
    });
  });

  it('dispatches record commands from popup state', async () => {
    const { controls, sent } = createTestControls({
      createRecordId: () => 'record-popup-1',
    });
    await controls.refresh();

    await controls.startRecording();
    await controls.stopRecording();

    expect(sent.slice(1)).toEqual([
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'record-popup-1',
        },
      }),
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'record-popup-1',
        },
      }),
    ]);
    expect(controls.getSnapshot()).toMatchObject({
      currentRecord: {
        runId: 'record-popup-1',
        status: 'stopped',
      },
    });
  });

  it('keeps stopped record state when the background returns an empty recording', async () => {
    const { controls } = createTestControls({
      createRecordId: () => 'record-popup-1',
      sendResponse(message) {
        if (message.kind === 'record:stop') {
          return ok({
            kind: message.kind,
            tabId: message.payload.tabId,
            frameId: message.payload.frameId,
            scenarioId: message.payload.scenarioId,
            runId: message.payload.runId,
            contentReady: true,
            session: sessionFor(message),
            emptyRecording: {
              sessionId: message.payload.runId ?? 'record-popup-1',
              tabId: message.payload.tabId,
              frameId: message.payload.frameId,
              scenarioId: message.payload.scenarioId,
              runId: message.payload.runId,
              sourceEventCount: 0,
              createdAt: 1_700_000_000_000,
              message: 'No browser events were recorded.',
            },
          });
        }

        return commandReceiptFor(message);
      },
    });
    await controls.refresh();

    await controls.startRecording();
    const stop = await controls.stopRecording();

    expect(stop).toMatchObject({
      ok: true,
      value: {
        emptyRecording: {
          sourceEventCount: 0,
        },
      },
    });
    expect(controls.getSnapshot()).toMatchObject({
      currentRecord: {
        runId: 'record-popup-1',
        status: 'stopped',
      },
    });
  });

  it('dispatches active run control commands from popup state', async () => {
    const { controls, sent } = createTestControls({
      initialState: popupState({
        runSession: {
          type: 'run',
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-current',
          status: 'running',
          startedAt: 100,
          updatedAt: 100,
        },
      }),
    });
    await controls.refresh();

    await controls.pauseCurrentRun();
    await controls.resumeCurrentRun();
    await controls.stopCurrentRun();

    expect(sent.slice(1)).toEqual([
      createExtensionMessage({
        kind: 'scenario:pause',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-current',
        },
      }),
      createExtensionMessage({
        kind: 'scenario:resume',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-current',
        },
      }),
      createExtensionMessage({
        kind: 'scenario:stop',
        payload: {
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-current',
        },
      }),
    ]);
  });

  it('disables conflicting run and record controls in the popup view', async () => {
    const { controls } = createTestControls({
      initialState: popupState({
        recordSession: {
          type: 'record',
          sessionId: 'record-popup-1',
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'record-popup-1',
          status: 'recording',
          startedAt: 100,
          updatedAt: 100,
        },
      }),
    });
    await controls.refresh();

    const recordingView = createPopupRunControlsView(controls.getSnapshot());
    expect(recordingView.buttons.run.disabled).toBe(true);
    expect(recordingView.buttons.record.disabled).toBe(false);

    const { controls: runningControls } = createTestControls({
      initialState: popupState({
        runSession: {
          type: 'run',
          tabId: 7,
          frameId: 0,
          scenarioId: 'newest-scenario',
          runId: 'run-current',
          status: 'running',
          startedAt: 100,
          updatedAt: 100,
        },
      }),
    });
    await runningControls.refresh();

    const runningView = createPopupRunControlsView(runningControls.getSnapshot());
    expect(runningView.buttons.record.disabled).toBe(true);
  });

  it('surfaces concise command failures and clears pending state', async () => {
    const { controls } = createTestControls({
      sendResponse: failure({
        code: 'content_not_ready',
        message: 'Content script is not ready for tab 7.',
      }),
    });
    await controls.refresh();

    const result = await controls.runSelectedScenario();

    expect(result).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'content_not_ready',
          message: 'Content script is not ready for tab 7.',
        },
      ],
    });
    const snapshot = controls.getSnapshot();
    expect(snapshot.pendingAction).toBeNull();
    expect(createPopupRunControlsView(snapshot).statusMessage).toBe(
      'Content script is not ready for tab 7.',
    );
  });
});

type TestControlsOptions = Readonly<{
  createRunId?: () => string;
  createRecordId?: () => string;
  initialState?: PopupBackgroundState;
  sendResponse?:
    | ExtensionResult<unknown>
    | ((message: ActorbleExtensionMessage) => ExtensionResult<unknown>);
}>;

function createTestControls(options: TestControlsOptions = {}) {
  const sent: ActorbleExtensionMessage[] = [];
  const client: PopupRunControlsClient = {
    async listScenarios() {
      return ok([newestScenario, olderScenario]);
    },
    async sendMessage(message) {
      sent.push(message);

      if (message.kind === 'popup:get-state') {
        return ok(options.initialState ?? popupState());
      }

      if (options.sendResponse !== undefined) {
        if (typeof options.sendResponse === 'function') {
          return options.sendResponse(message);
        }

        return options.sendResponse;
      }

      return commandReceiptFor(message);
    },
  };
  const controls = createPopupRunControls(client, {
    createRunId: options.createRunId ?? (() => 'run-popup'),
    createRecordId: options.createRecordId ?? (() => 'record-popup'),
  });

  return { controls, sent };
}

function commandReceiptFor(message: ActorbleExtensionMessage) {
  switch (message.kind) {
    case 'scenario:run':
    case 'scenario:pause':
    case 'scenario:resume':
    case 'scenario:stop':
    case 'record:start':
    case 'record:stop':
      return ok({
        kind: message.kind,
        tabId: message.payload.tabId,
        frameId: message.payload.frameId,
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        contentReady: true,
        session: sessionFor(message),
      });
    case 'scenario:validate':
    case 'scenario:compile':
    case 'inspector:start':
    case 'inspector:stop':
    case 'inspector:selected':
    case 'inspector:cancelled':
    case 'locator:preview':
    case 'trace:event':
    case 'runtime:status':
    case 'content:ready':
    case 'popup:get-state':
    case 'record:event':
    case 'record:draft:get':
      throw new Error(`Unexpected popup test command: ${message.kind}`);
  }
}

function popupState(overrides: Partial<PopupBackgroundState> = {}): PopupBackgroundState {
  return {
    kind: 'popup:state',
    activeTab: {
      ready: true,
      tabId: 7,
      frameId: 0,
      url: 'http://localhost:3000/dashboard',
    },
    ...overrides,
  };
}

function sessionFor(message: ActorbleExtensionMessage) {
  switch (message.kind) {
    case 'scenario:run':
      return {
        type: 'run',
        tabId: message.payload.tabId,
        frameId: message.payload.frameId,
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        status: 'running',
        startedAt: 100,
        updatedAt: 100,
      } as const;
    case 'scenario:pause':
      return {
        type: 'run',
        ...message.payload,
        status: 'paused',
        startedAt: 100,
        updatedAt: 110,
      } as const;
    case 'scenario:resume':
      return {
        type: 'run',
        ...message.payload,
        status: 'running',
        startedAt: 100,
        updatedAt: 120,
      } as const;
    case 'scenario:stop':
      return {
        type: 'run',
        ...message.payload,
        status: 'stopped',
        startedAt: 100,
        updatedAt: 130,
      } as const;
    case 'record:start':
      return {
        type: 'record',
        sessionId: message.payload.runId ?? '7:0',
        tabId: message.payload.tabId,
        frameId: message.payload.frameId,
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        status: 'recording',
        startedAt: 100,
        updatedAt: 100,
      } as const;
    case 'record:stop':
      return {
        type: 'record',
        sessionId: message.payload.runId ?? '7:0',
        tabId: message.payload.tabId,
        frameId: message.payload.frameId,
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        status: 'stopped',
        startedAt: 100,
        updatedAt: 130,
      } as const;
    default:
      return undefined;
  }
}

function scenarioRecord(
  id: string,
  name: string,
  updatedAt: string,
  lastRun?: ScenarioRecord['lastRun'],
): ScenarioRecord {
  return {
    id,
    name,
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    document: scenarioDocument(id, name),
    createdAt: '2026-06-17T00:00:00.000Z',
    updatedAt,
    ...(lastRun === undefined ? {} : { lastRun }),
  };
}

function scenarioDocument(id: string, name: string): ScenarioDocument {
  return {
    schemaVersion: DRAFT_SCENARIO_SCHEMA_VERSION,
    id,
    name,
    steps: [
      {
        action: 'delay',
        duration: 1,
      },
    ],
  };
}
