import {
  createExtensionMessage,
  isActorbleExtensionMessage,
  type ActorbleExtensionMessage,
  type ExtensionMessageKind,
  type RequiredRunCorrelation,
} from '../../messaging/index.js';
import { compileToBrowserRuntime } from '../../scenario/compile-to-browser-runtime.js';
import type {
  RecordedEmptyRecordingState,
  RecordedScenarioDraftHandoff,
} from '../../recorder/workflow.js';
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../../shared/result.js';
import type { ScenarioRecord } from '../../storage/index.js';
import type { RuntimeRunStatus } from '../../trace/index.js';

export type PopupRunSession = RequiredRunCorrelation &
  Readonly<{
    type: 'run';
    status: RuntimeRunStatus;
    startedAt: number;
    updatedAt: number;
    message?: string;
  }>;

export type PopupRecordSession = Readonly<{
  type: 'record';
  sessionId: string;
  tabId: number;
  frameId?: number;
  scenarioId?: string;
  runId?: string;
  status: 'recording' | 'stopped' | 'failed';
  startedAt: number;
  updatedAt: number;
  draftId?: string;
  message?: string;
}>;

export type PopupBackgroundState = Readonly<{
  kind: 'popup:state';
  activeTab:
    | Readonly<{
        ready: true;
        tabId: number;
        frameId?: number;
        url: string;
      }>
    | Readonly<{
        ready: false;
        issue: ExtensionIssue;
      }>;
  runSession?: PopupRunSession;
  recordSession?: PopupRecordSession;
}>;

export type PopupPendingAction =
  | 'refresh'
  | 'run'
  | 'record:start'
  | 'record:stop'
  | 'pause'
  | 'resume'
  | 'stop';

export type PopupTabState =
  | Readonly<{ status: 'checking' }>
  | Readonly<{
      status: 'ready';
      tabId: number;
      frameId?: number;
      url: string;
    }>
  | Readonly<{
      status: 'blocked';
      issue: ExtensionIssue;
    }>;

export type PopupRunControlsSnapshot = Readonly<{
  scenarios: readonly ScenarioRecord[];
  selectedScenarioId?: string;
  activeTab: PopupTabState;
  currentRun?: PopupRunSession;
  currentRecord?: PopupRecordSession;
  pendingAction: PopupPendingAction | null;
  issues: readonly ExtensionIssue[];
}>;

export type PopupButtonView = Readonly<{
  label: string;
  disabled: boolean;
  pending: boolean;
}>;

export type PopupRunControlsView = Readonly<{
  statusMessage: string;
  statusTone: 'checking' | 'ready' | 'blocked' | 'error';
  scenarioOptions: readonly Readonly<{ value: string; label: string }>[];
  selectedScenarioId?: string;
  scenarioSelectDisabled: boolean;
  lastRunText: string;
  currentRunText: string;
  recordText: string;
  buttons: Readonly<{
    run: PopupButtonView;
    record: PopupButtonView;
    pauseResume: PopupButtonView;
    stop: PopupButtonView;
  }>;
}>;

export type PopupRunControlsClient = Readonly<{
  listScenarios(): Promise<ExtensionResult<readonly ScenarioRecord[]>>;
  sendMessage(message: ActorbleExtensionMessage): Promise<unknown>;
}>;

export type PopupRunControlsOptions = Readonly<{
  createRunId?: () => string;
  createRecordId?: () => string;
  frameId?: number;
}>;

export type PopupCommandReceipt = Readonly<{
  kind: ExtensionMessageKind;
  tabId: number;
  frameId?: number;
  scenarioId?: string;
  runId?: string;
  contentReady: boolean;
  session?: PopupRunSession | PopupRecordSession;
  status?: RuntimeRunStatus | PopupRecordSession['status'];
  recordedDraft?: RecordedScenarioDraftHandoff;
  emptyRecording?: RecordedEmptyRecordingState;
}>;

export type PopupRunControls = Readonly<{
  refresh(): Promise<ExtensionResult<PopupRunControlsSnapshot>>;
  selectScenario(id: string): void;
  runSelectedScenario(): Promise<ExtensionResult<PopupCommandReceipt>>;
  startRecording(): Promise<ExtensionResult<PopupCommandReceipt>>;
  stopRecording(): Promise<ExtensionResult<PopupCommandReceipt>>;
  pauseCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>>;
  resumeCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>>;
  stopCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>>;
  ingestMessage(message: unknown): boolean;
  getSnapshot(): PopupRunControlsSnapshot;
}>;

let nextRunSequence = 1;
let nextRecordSequence = 1;

export function createPopupRunControls(
  client: PopupRunControlsClient,
  options: PopupRunControlsOptions = {},
): PopupRunControls {
  const frameId = options.frameId;
  const createRunId = options.createRunId ?? defaultRunId;
  const createRecordId = options.createRecordId ?? defaultRecordId;
  let snapshot = emptySnapshot();

  async function refresh(): Promise<ExtensionResult<PopupRunControlsSnapshot>> {
    snapshot = {
      ...snapshot,
      pendingAction: 'refresh',
      issues: [],
    };

    const scenarios = await client.listScenarios();
    if (!scenarios.ok) {
      snapshot = {
        ...snapshot,
        scenarios: [],
        selectedScenarioId: undefined,
        pendingAction: null,
        issues: scenarios.issues,
      };
      return failure(scenarios.issues);
    }

    const selectedScenarioId = selectDefaultScenarioId(
      scenarios.value,
      snapshot.selectedScenarioId,
    );
    snapshot = {
      ...snapshot,
      scenarios: scenarios.value,
      selectedScenarioId,
    };

    const state = await refreshBackgroundState();
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: state.ok ? [] : state.issues,
    };

    return state.ok ? ok(snapshot) : failure(state.issues);
  }

  function selectScenario(id: string): void {
    snapshot = {
      ...snapshot,
      selectedScenarioId: id,
      issues: [],
    };
  }

  async function runSelectedScenario(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const scenario = selectedScenario(snapshot);
    if (scenario === undefined) {
      return setIssue({
        code: 'runtime_error',
        message: 'Select a scenario before running.',
      });
    }

    const target = await ensureReadyTarget();
    if (!target.ok) {
      return target;
    }

    const compilation = compileToBrowserRuntime(scenario.document);
    if (!compilation.ok) {
      snapshot = {
        ...snapshot,
        issues: compilation.issues,
      };
      return failure(compilation.issues);
    }

    const runId = createRunId();
    return dispatchCommand(
      createExtensionMessage({
        kind: 'scenario:run',
        payload: {
          tabId: target.value.tabId,
          ...optionalFrameId(target.value.frameId),
          scenarioId: scenario.id,
          runId,
          compilation: compilation.value,
        },
      }),
      'run',
      'Run command',
    );
  }

  async function startRecording(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const target = await ensureReadyTarget();
    if (!target.ok) {
      return target;
    }

    return dispatchCommand(
      createExtensionMessage({
        kind: 'record:start',
        payload: {
          tabId: target.value.tabId,
          ...optionalFrameId(target.value.frameId),
          ...optionalScenarioId(snapshot.selectedScenarioId),
          runId: createRecordId(),
        },
      }),
      'record:start',
      'Record start command',
    );
  }

  async function stopRecording(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const record = snapshot.currentRecord;
    if (record === undefined || record.status !== 'recording') {
      return setIssue({
        code: 'runtime_error',
        message: 'No active recording is available to stop.',
      });
    }

    return dispatchCommand(
      createExtensionMessage({
        kind: 'record:stop',
        payload: {
          tabId: record.tabId,
          ...optionalFrameId(record.frameId),
          ...optionalScenarioId(record.scenarioId),
          ...optionalRunId(record.runId),
        },
      }),
      'record:stop',
      'Record stop command',
    );
  }

  async function pauseCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const run = currentRunForControl('running', 'No running scenario is available to pause.');
    if (!run.ok) {
      return run;
    }

    return dispatchRunControl('scenario:pause', run.value, 'pause', 'Pause command');
  }

  async function resumeCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const run = currentRunForControl('paused', 'No paused scenario is available to resume.');
    if (!run.ok) {
      return run;
    }

    return dispatchRunControl('scenario:resume', run.value, 'resume', 'Resume command');
  }

  async function stopCurrentRun(): Promise<ExtensionResult<PopupCommandReceipt>> {
    const run = snapshot.currentRun;
    if (run === undefined || !isActiveRunStatus(run.status)) {
      return setIssue({
        code: 'runtime_error',
        message: 'No active scenario run is available to stop.',
      });
    }

    return dispatchRunControl('scenario:stop', run, 'stop', 'Stop command');
  }

  function ingestMessage(message: unknown): boolean {
    if (!isActorbleExtensionMessage(message)) {
      return false;
    }

    if (message.kind !== 'runtime:status' || snapshot.currentRun === undefined) {
      return false;
    }

    if (!matchesRun(snapshot.currentRun, message.payload)) {
      return false;
    }

    snapshot = {
      ...snapshot,
      currentRun: {
        type: 'run',
        tabId: message.payload.tabId,
        ...optionalFrameId(message.payload.frameId),
        scenarioId: message.payload.scenarioId,
        runId: message.payload.runId,
        status: message.payload.status,
        startedAt: snapshot.currentRun.startedAt,
        updatedAt: Date.now(),
        ...(message.payload.message === undefined ? {} : { message: message.payload.message }),
      },
    };
    return true;
  }

  function getSnapshot(): PopupRunControlsSnapshot {
    return snapshot;
  }

  async function refreshBackgroundState(): Promise<ExtensionResult<PopupBackgroundState>> {
    let response: unknown;
    try {
      response = await client.sendMessage(
        createExtensionMessage({
          kind: 'popup:get-state',
          payload: {
            ...optionalFrameId(frameId),
            ...optionalScenarioId(snapshot.selectedScenarioId),
          },
        }),
      );
    } catch (error) {
      return failure({
        code: 'routing_error',
        message: `Popup state could not be loaded: ${describeUnknownError(error)}`,
      });
    }

    const result = readExtensionResult<PopupBackgroundState>(response);
    if (result === null) {
      return failure({
        code: 'unsupported_message',
        message: 'Popup state response was not understood.',
      });
    }

    if (!result.ok) {
      return result;
    }

    applyBackgroundState(result.value);
    return result;
  }

  async function ensureReadyTarget(): Promise<
    ExtensionResult<Readonly<{ tabId: number; frameId?: number }>>
  > {
    if (snapshot.activeTab.status !== 'ready') {
      const state = await refreshBackgroundState();
      if (!state.ok) {
        snapshot = {
          ...snapshot,
          issues: state.issues,
        };
        return failure(state.issues);
      }
    }

    if (snapshot.activeTab.status === 'ready') {
      return ok({
        tabId: snapshot.activeTab.tabId,
        ...optionalFrameId(snapshot.activeTab.frameId),
      });
    }

    if (snapshot.activeTab.status === 'blocked') {
      return setIssue<Readonly<{ tabId: number; frameId?: number }>>(snapshot.activeTab.issue);
    }

    return setIssue<Readonly<{ tabId: number; frameId?: number }>>({
      code: 'routing_error',
      message: 'Active tab readiness could not be resolved.',
    });
  }

  async function dispatchRunControl(
    kind: 'scenario:pause' | 'scenario:resume' | 'scenario:stop',
    run: PopupRunSession,
    pendingAction: PopupPendingAction,
    label: string,
  ): Promise<ExtensionResult<PopupCommandReceipt>> {
    return dispatchCommand(
      createExtensionMessage({
        kind,
        payload: {
          tabId: run.tabId,
          ...optionalFrameId(run.frameId),
          scenarioId: run.scenarioId,
          runId: run.runId,
        },
      }),
      pendingAction,
      label,
    );
  }

  async function dispatchCommand(
    message: ActorbleExtensionMessage,
    pendingAction: PopupPendingAction,
    label: string,
  ): Promise<ExtensionResult<PopupCommandReceipt>> {
    snapshot = {
      ...snapshot,
      pendingAction,
      issues: [],
    };

    let response: unknown;
    try {
      response = await client.sendMessage(message);
    } catch (error) {
      return setIssue({
        code: 'runtime_error',
        message: `${label} failed: ${describeUnknownError(error)}`,
      });
    }

    const result = readExtensionResult<PopupCommandReceipt>(response);
    if (result === null) {
      return setIssue({
        code: 'unsupported_message',
        message: `${label} returned an unsupported response.`,
      });
    }

    if (!result.ok) {
      snapshot = {
        ...snapshot,
        pendingAction: null,
        issues: result.issues,
      };
      return result;
    }

    const receipt = normalizeCommandReceipt(result.value);
    applyCommandReceipt(receipt);
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: [],
    };
    return ok(receipt);
  }

  function applyBackgroundState(state: PopupBackgroundState): void {
    snapshot = {
      ...snapshot,
      activeTab: state.activeTab.ready
        ? {
            status: 'ready',
            tabId: state.activeTab.tabId,
            ...optionalFrameId(state.activeTab.frameId),
            url: state.activeTab.url,
          }
        : {
            status: 'blocked',
            issue: state.activeTab.issue,
          },
      currentRun: state.runSession,
      currentRecord: state.recordSession,
    };
  }

  function applyCommandReceipt(receipt: PopupCommandReceipt): void {
    if (receipt.session?.type === 'run') {
      snapshot = {
        ...snapshot,
        currentRun: receipt.session,
      };
      return;
    }

    if (receipt.session?.type === 'record') {
      snapshot = {
        ...snapshot,
        currentRecord: receipt.session,
      };
    }
  }

  function currentRunForControl(
    status: RuntimeRunStatus,
    missingMessage: string,
  ): ExtensionResult<PopupRunSession> {
    if (snapshot.currentRun?.status === status) {
      return ok(snapshot.currentRun);
    }

    return setIssue<PopupRunSession>({
      code: 'runtime_error',
      message: missingMessage,
    });
  }

  function setIssue<TValue = PopupCommandReceipt>(issue: ExtensionIssue): ExtensionResult<TValue> {
    snapshot = {
      ...snapshot,
      pendingAction: null,
      issues: [issue],
    };
    return failure(issue);
  }

  return {
    refresh,
    selectScenario,
    runSelectedScenario,
    startRecording,
    stopRecording,
    pauseCurrentRun,
    resumeCurrentRun,
    stopCurrentRun,
    ingestMessage,
    getSnapshot,
  };
}

export function createPopupRunControlsView(
  snapshot: PopupRunControlsSnapshot,
): PopupRunControlsView {
  const anyPending = snapshot.pendingAction !== null;
  const tabReady = snapshot.activeTab.status === 'ready';
  const selected = selectedScenario(snapshot);
  const recordActive = snapshot.currentRecord?.status === 'recording';
  const runActive =
    snapshot.currentRun !== undefined && isActiveRunStatus(snapshot.currentRun.status);
  const canPause = snapshot.currentRun?.status === 'running';
  const canResume = snapshot.currentRun?.status === 'paused';
  const canStop = runActive;

  return {
    statusMessage: statusMessage(snapshot),
    statusTone: statusTone(snapshot),
    scenarioOptions: snapshot.scenarios.map((scenario) => ({
      value: scenario.id,
      label: scenario.name,
    })),
    selectedScenarioId: snapshot.selectedScenarioId,
    scenarioSelectDisabled: anyPending || snapshot.scenarios.length === 0,
    lastRunText: lastRunText(selected),
    currentRunText: currentRunText(snapshot.currentRun),
    recordText: recordText(snapshot.currentRecord),
    buttons: {
      run: {
        label: 'Run',
        disabled: anyPending || !tabReady || selected === undefined || recordActive,
        pending: snapshot.pendingAction === 'run',
      },
      record: {
        label: recordActive ? 'Stop recording' : 'Record',
        disabled: anyPending || !tabReady || (!recordActive && runActive),
        pending:
          snapshot.pendingAction === 'record:start' || snapshot.pendingAction === 'record:stop',
      },
      pauseResume: {
        label: canResume ? 'Resume' : 'Pause',
        disabled: anyPending || (!canPause && !canResume),
        pending: snapshot.pendingAction === 'pause' || snapshot.pendingAction === 'resume',
      },
      stop: {
        label: 'Stop',
        disabled: anyPending || !canStop,
        pending: snapshot.pendingAction === 'stop',
      },
    },
  };
}

function emptySnapshot(): PopupRunControlsSnapshot {
  return {
    scenarios: [],
    activeTab: { status: 'checking' },
    pendingAction: null,
    issues: [],
  };
}

function selectDefaultScenarioId(
  scenarios: readonly ScenarioRecord[],
  currentSelection: string | undefined,
): string | undefined {
  if (
    currentSelection !== undefined &&
    scenarios.some((scenario) => scenario.id === currentSelection)
  ) {
    return currentSelection;
  }

  return scenarios[0]?.id;
}

function selectedScenario(snapshot: PopupRunControlsSnapshot): ScenarioRecord | undefined {
  return snapshot.scenarios.find((scenario) => scenario.id === snapshot.selectedScenarioId);
}

function normalizeCommandReceipt(receipt: PopupCommandReceipt): PopupCommandReceipt {
  return {
    ...receipt,
    ...(receipt.session === undefined ? {} : { status: receipt.session.status }),
  };
}

function readExtensionResult<TValue>(value: unknown): ExtensionResult<TValue> | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    return null;
  }

  if (value.ok === true && 'value' in value) {
    return value as ExtensionResult<TValue>;
  }

  if (value.ok === false && Array.isArray(value.issues)) {
    return value as ExtensionResult<TValue>;
  }

  return null;
}

function statusMessage(snapshot: PopupRunControlsSnapshot): string {
  const [issue] = snapshot.issues;
  if (issue !== undefined) {
    return issue.message;
  }

  if (snapshot.pendingAction === 'refresh' || snapshot.activeTab.status === 'checking') {
    return 'Checking tab';
  }

  if (snapshot.activeTab.status === 'ready') {
    return 'Tab ready';
  }

  return snapshot.activeTab.issue.message;
}

function statusTone(snapshot: PopupRunControlsSnapshot): PopupRunControlsView['statusTone'] {
  if (snapshot.issues.length > 0) {
    return 'error';
  }

  switch (snapshot.activeTab.status) {
    case 'checking':
      return 'checking';
    case 'ready':
      return 'ready';
    case 'blocked':
      return 'blocked';
  }
}

function lastRunText(scenario: ScenarioRecord | undefined): string {
  if (scenario === undefined) {
    return 'No scenario selected';
  }

  if (scenario.lastRun === undefined) {
    return 'No runs yet';
  }

  const label = capitalize(scenario.lastRun.status);
  const error = scenario.lastRun.error === undefined ? '' : `: ${scenario.lastRun.error}`;
  return `${label} at ${scenario.lastRun.completedAt}${error}`;
}

function currentRunText(run: PopupRunSession | undefined): string {
  if (run === undefined) {
    return 'No active run';
  }

  return run.message === undefined
    ? capitalize(run.status)
    : `${capitalize(run.status)}: ${run.message}`;
}

function recordText(record: PopupRecordSession | undefined): string {
  if (record === undefined) {
    return 'Not recording';
  }

  if (record.status === 'recording') {
    return 'Recording';
  }

  if (record.status === 'failed') {
    return record.message === undefined
      ? 'Recording failed'
      : `Recording failed: ${record.message}`;
  }

  return record.draftId === undefined ? 'Recording stopped' : 'Draft ready';
}

function matchesRun(currentRun: PopupRunSession, payload: RequiredRunCorrelation): boolean {
  return (
    payload.tabId === currentRun.tabId &&
    payload.frameId === currentRun.frameId &&
    payload.scenarioId === currentRun.scenarioId &&
    payload.runId === currentRun.runId
  );
}

function isActiveRunStatus(status: RuntimeRunStatus): boolean {
  return status === 'running' || status === 'paused';
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId };
}

function optionalScenarioId(scenarioId: string | undefined): Readonly<{ scenarioId?: string }> {
  return scenarioId === undefined ? {} : { scenarioId };
}

function optionalRunId(runId: string | undefined): Readonly<{ runId?: string }> {
  return runId === undefined ? {} : { runId };
}

function defaultRunId(): string {
  return `run-${Date.now()}-${nextRunSequence++}`;
}

function defaultRecordId(): string {
  return `record-${Date.now()}-${nextRecordSequence++}`;
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
