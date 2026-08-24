import type {
  ActorbleExtensionMessage,
  ActorbleExtensionMessageByKind,
  ContentReadyCapabilities,
  ExtensionMessageKind,
  InspectorCancellationReason,
  InspectorSessionCorrelation,
  InspectorTargetMetadata,
  InspectorTargetSlotCorrelation,
  PopupGetStateMessage,
  RequiredRunCorrelation,
  RequiredTabCorrelation,
} from '../../messaging/index.js';
import { createExtensionMessage, isActorbleExtensionMessage } from '../../messaging/index.js';
import type { LocatorPreviewResult } from '../../inspector/locator-preview.js';
import { normalizeRecordedEvents } from '../../recorder/event-to-step.js';
import type { RawRecordedEvent } from '../../recorder/event-capture.js';
import type {
  RecordedEmptyRecordingState,
  RecordedScenarioDraftHandoff,
} from '../../recorder/workflow.js';
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../../shared/result.js';
import type { RuntimeRunStatus } from '../../trace/index.js';

export type BackgroundTab = Readonly<{
  id?: number;
  url?: string;
  active?: boolean;
}>;

export type BackgroundTarget = Readonly<{
  tabId: number;
  frameId?: number;
  url: string;
  capabilities?: ContentReadyCapabilities;
}>;

export type BackgroundMessageSender = Readonly<{
  tab?: BackgroundTab;
  frameId?: number;
  url?: string;
}>;

export type BackgroundBrowserHost = Readonly<{
  getActiveTab(): Promise<BackgroundTab | null>;
  getTab(tabId: number): Promise<BackgroundTab | null>;
  sendTabMessage(
    tabId: number,
    message: ActorbleExtensionMessage,
    options: Readonly<{ frameId?: number }>,
  ): Promise<unknown>;
  hasTabPermission?(tab: BackgroundTab & Readonly<{ id: number; url: string }>): Promise<boolean>;
}>;

export type WxtBackgroundBrowser = Readonly<{
  tabs: Readonly<{
    query(
      queryInfo: Readonly<{ active?: boolean; currentWindow?: boolean }>,
    ): Promise<readonly BackgroundTab[]>;
    get(tabId: number): Promise<BackgroundTab | undefined>;
    sendMessage(
      tabId: number,
      message: ActorbleExtensionMessage,
      options?: Readonly<{ frameId?: number }>,
    ): Promise<unknown>;
  }>;
  permissions?: Readonly<{
    contains?(permissions: Readonly<{ origins?: readonly string[] }>): Promise<boolean>;
  }>;
}>;

export type BackgroundRunSession = Readonly<{
  type: 'run';
  runId: string;
  scenarioId: string;
  tabId: number;
  frameId?: number;
  status: RuntimeRunStatus;
  startedAt: number;
  updatedAt: number;
  message?: string;
}>;

export type BackgroundRecordSession = Readonly<{
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

export type BackgroundInspectorSession = Readonly<{
  type: 'inspector';
  sessionId: string;
  tabId: number;
  frameId?: number;
  scenarioId?: string;
  runId?: string;
  targetSlot?: InspectorTargetSlotCorrelation;
  status: 'inspecting' | 'selected' | 'cancelled' | 'stopped';
  startedAt: number;
  updatedAt: number;
  selectedTarget?: InspectorTargetMetadata;
  reason?: InspectorCancellationReason;
  message?: string;
}>;

export type BackgroundSessionSnapshot =
  | BackgroundRunSession
  | BackgroundRecordSession
  | BackgroundInspectorSession;

export type BackgroundCommandReceipt = Readonly<{
  kind: ExtensionMessageKind;
  tabId: number;
  frameId?: number;
  sessionId?: string;
  scenarioId?: string;
  runId?: string;
  targetSlot?: InspectorTargetSlotCorrelation;
  contentReady: boolean;
  session?: BackgroundSessionSnapshot;
  recordedDraft?: RecordedScenarioDraftHandoff;
  emptyRecording?: RecordedEmptyRecordingState;
}>;

export type BackgroundPopupState = Readonly<{
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
  runSession?: BackgroundRunSession;
  recordSession?: BackgroundRecordSession;
}>;

export type BackgroundMessageResult =
  | BackgroundCommandReceipt
  | BackgroundPopupState
  | RecordedScenarioDraftHandoff
  | null
  | LocatorPreviewResult;

export type BackgroundOrchestrator = Readonly<{
  handleMessage(
    message: unknown,
    sender?: BackgroundMessageSender,
  ): Promise<ExtensionResult<BackgroundMessageResult>>;
  resolveActiveTarget(frameId?: number): Promise<ExtensionResult<BackgroundTarget>>;
  getRunSession(runId: string): BackgroundRunSession | null;
  getRecordSession(
    correlation: Partial<RequiredTabCorrelation> & Readonly<{ runId?: string }>,
  ): BackgroundRecordSession | null;
  getInspectorSession(sessionId: string): BackgroundInspectorSession | null;
}>;

export type BackgroundOrchestratorOptions = Readonly<{
  now?: () => number;
}>;

type RoutableMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{
    kind:
      | 'scenario:run'
      | 'scenario:pause'
      | 'scenario:resume'
      | 'scenario:stop'
      | 'inspector:start'
      | 'inspector:stop';
  }>
>;

type RecordCommandMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'record:start' | 'record:stop' }>
>;

type RecordEventMessage = Extract<ActorbleExtensionMessage, Readonly<{ kind: 'record:event' }>>;

type RecordDraftGetMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'record:draft:get' }>
>;

type ContentRecorderReceipt = RequiredTabCorrelation &
  Readonly<{
    kind: 'record:start' | 'record:stop';
    sessionId: string;
    scenarioId?: string;
    runId?: string;
    status: 'recording' | 'stopped';
  }>;

type LocatorPreviewMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'locator:preview' }>
>;

type ContentReadyMessage = ActorbleExtensionMessageByKind<'content:ready'>;

type ContentReadyMetadata = ContentReadyMessage['payload'];

type RuntimeStatusMessage = Extract<ActorbleExtensionMessage, Readonly<{ kind: 'runtime:status' }>>;

type TraceEventMessage = Extract<ActorbleExtensionMessage, Readonly<{ kind: 'trace:event' }>>;

type InspectorSelectedMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'inspector:selected' }>
>;

type InspectorCancelledMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'inspector:cancelled' }>
>;

export function createBackgroundOrchestrator(
  host: BackgroundBrowserHost,
  options: BackgroundOrchestratorOptions = {},
): BackgroundOrchestrator {
  const getNow = options.now ?? Date.now;
  const runSessions = new Map<string, BackgroundRunSession>();
  const recordSessions = new Map<string, BackgroundRecordSession>();
  const recordEventBuffers = new Map<string, RawRecordedEvent[]>();
  const inspectorSessions = new Map<string, BackgroundInspectorSession>();
  const recordedDrafts = new Map<string, RecordedScenarioDraftHandoff>();
  const contentFrames = new Map<number, Map<number, ContentReadyMetadata>>();

  async function handleMessage(
    message: unknown,
    sender?: BackgroundMessageSender,
  ): Promise<ExtensionResult<BackgroundMessageResult>> {
    if (!isActorbleExtensionMessage(message)) {
      return failure({
        code: 'unsupported_message',
        message: 'Background received an unsupported extension message.',
      });
    }

    switch (message.kind) {
      case 'scenario:run':
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
      case 'inspector:start':
      case 'inspector:stop':
        return routeToContent(message);
      case 'record:start':
      case 'record:stop':
        return routeRecordCommand(message);
      case 'record:event':
        return ingestRecordEvent(message);
      case 'record:draft:get':
        return getRecordedDraft(message);
      case 'locator:preview':
        return routeLocatorPreview(message);
      case 'runtime:status':
        return ingestRuntimeStatus(message);
      case 'trace:event':
        return ingestTraceEvent(message);
      case 'content:ready':
        return ingestContentReady(message, sender);
      case 'inspector:selected':
        return ingestInspectorSelected(message);
      case 'inspector:cancelled':
        return ingestInspectorCancelled(message);
      case 'popup:get-state':
        return getPopupState(message);
      case 'scenario:validate':
      case 'scenario:compile':
        return failure({
          code: 'unsupported_message',
          message: `${message.kind} is handled by the scenario boundary, not the background router.`,
          details: { kind: message.kind },
        });
    }
  }

  async function getPopupState(
    message: PopupGetStateMessage,
  ): Promise<ExtensionResult<BackgroundPopupState>> {
    const target =
      message.payload.tabId === undefined
        ? await resolveActiveTarget(message.payload.frameId)
        : await resolveTargetTab({
            tabId: message.payload.tabId,
            ...optionalFrameId(message.payload.frameId),
          });

    if (!target.ok) {
      return ok({
        kind: 'popup:state',
        activeTab: {
          ready: false,
          issue: target.issues[0] ?? {
            code: 'routing_error',
            message: 'Active tab readiness could not be resolved.',
          },
        },
      });
    }

    const sessionFilter = {
      tabId: target.value.tabId,
      frameId: target.value.frameId,
      scenarioId: message.payload.scenarioId,
    };

    return ok({
      kind: 'popup:state',
      activeTab: {
        ready: true,
        tabId: target.value.tabId,
        ...optionalFrameId(target.value.frameId),
        url: target.value.url,
      },
      ...optionalRunSession(latestRunSession(sessionFilter)),
      ...optionalRecordSession(latestRecordSession(sessionFilter)),
    });
  }

  async function resolveActiveTarget(frameId?: number): Promise<ExtensionResult<BackgroundTarget>> {
    let tab: BackgroundTab | null;
    try {
      tab = await host.getActiveTab();
    } catch (error) {
      return failure({
        code: 'routing_error',
        message: 'Active tab lookup failed.',
        details: { error: errorMessage(error) },
      });
    }

    if (tab?.id === undefined) {
      return failure({
        code: 'routing_error',
        message: 'No active tab is available.',
      });
    }

    return validateTargetTab(tab, frameId);
  }

  async function routeToContent(
    message: RoutableMessage,
  ): Promise<ExtensionResult<BackgroundCommandReceipt>> {
    const target = await resolveTargetTab(message.payload);
    if (!target.ok) {
      return target;
    }
    const routedMessage = withResolvedFrame(message, target.value.frameId);

    const conflict = conflictForRoutableMessage(routedMessage);
    if (conflict !== null) {
      return failure(conflict);
    }

    try {
      await host.sendTabMessage(
        target.value.tabId,
        routedMessage,
        frameOptions(target.value.frameId),
      );
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${target.value.tabId}.`,
        details: {
          tabId: target.value.tabId,
          frameId: target.value.frameId,
          error: errorMessage(error),
        },
      });
    }

    const session = updateSessionForRoutedMessage(routedMessage);
    return ok(receiptFor(routedMessage.kind, routedMessage.payload, true, session));
  }

  async function routeRecordCommand(
    message: RecordCommandMessage,
  ): Promise<ExtensionResult<BackgroundCommandReceipt>> {
    if (message.kind === 'record:stop') {
      return stopRecordCommand(message);
    }

    const target = await resolveTargetTab(message.payload);
    if (!target.ok) {
      return target;
    }
    const routedMessage = withResolvedFrame(message, target.value.frameId);

    const conflict = conflictForRecordCommand(routedMessage);
    if (conflict !== null) {
      if (routedMessage.kind === 'record:start') {
        upsertRecordSession(routedMessage.payload, 'failed', { message: conflict.message });
      }
      return failure(conflict);
    }

    const session = upsertRecordSession(routedMessage.payload, 'recording');
    recordEventBuffers.set(session.sessionId, []);

    const armed = await armContentRecorder(session);
    if (!armed.ok) {
      const [issue] = armed.issues;
      recordEventBuffers.delete(session.sessionId);
      upsertRecordSession(routedMessage.payload, 'failed', {
        message: issue?.message ?? 'Recorder command failed.',
      });
      return armed;
    }

    return ok(
      receiptFor(
        routedMessage.kind,
        {
          ...routedMessage.payload,
          sessionId: session.sessionId,
        },
        true,
        session,
      ),
    );
  }

  async function stopRecordCommand(
    message: Extract<RecordCommandMessage, Readonly<{ kind: 'record:stop' }>>,
  ): Promise<ExtensionResult<BackgroundCommandReceipt>> {
    const sessionId = recordSessionId(message.payload);
    const activeSession = recordSessions.get(sessionId);
    if (
      activeSession === undefined ||
      activeSession.status !== 'recording' ||
      !matchesRecordCommandCorrelation(activeSession, message.payload)
    ) {
      return failure({
        code: 'recorder_error',
        message: 'No active recorder session matches the stop command.',
        details: targetDetails(message.payload),
      });
    }

    const contentReady = await stopContentRecorder(activeSession);
    const events = recordEventBuffers.get(sessionId) ?? [];

    if (events.length === 0) {
      recordEventBuffers.delete(sessionId);
      const emptyRecording = createEmptyRecording(activeSession);
      const session = upsertRecordSession(activeSession, 'stopped', {
        message: emptyRecording.message,
      });
      return ok({
        ...receiptFor(
          message.kind,
          {
            ...activeSession,
            sessionId,
          },
          contentReady,
          session,
        ),
        emptyRecording,
      });
    }

    const draft = createRecordedDraft(activeSession, events);
    recordEventBuffers.delete(sessionId);
    if (!draft.ok) {
      const [issue] = draft.issues;
      upsertRecordSession(activeSession, 'failed', {
        message: issue?.message ?? 'Recorded draft could not be created.',
      });
      return draft;
    }

    const session = upsertRecordSession(activeSession, 'stopped', {
      draftId: draft.value.draftId,
    });
    return ok({
      ...receiptFor(
        message.kind,
        {
          ...activeSession,
          sessionId,
        },
        contentReady,
        session,
      ),
      recordedDraft: draft.value,
    });
  }

  async function armContentRecorder(
    session: BackgroundRecordSession,
  ): Promise<ExtensionResult<ContentRecorderReceipt>> {
    const message = createExtensionMessage({
      kind: 'record:start',
      payload: {
        tabId: session.tabId,
        ...optionalFrameId(session.frameId),
        ...(session.scenarioId === undefined ? {} : { scenarioId: session.scenarioId }),
        ...(session.runId === undefined ? {} : { runId: session.runId }),
      },
    });

    return sendRecorderCommandToContent(message, session);
  }

  async function stopContentRecorder(session: BackgroundRecordSession): Promise<boolean> {
    const message = createExtensionMessage({
      kind: 'record:stop',
      payload: {
        tabId: session.tabId,
        ...optionalFrameId(session.frameId),
        ...(session.scenarioId === undefined ? {} : { scenarioId: session.scenarioId }),
        ...(session.runId === undefined ? {} : { runId: session.runId }),
      },
    });

    const result = await sendRecorderCommandToContent(message, session);
    return result.ok;
  }

  async function sendRecorderCommandToContent(
    message: RecordCommandMessage,
    session: RequiredTabCorrelation,
  ): Promise<ExtensionResult<ContentRecorderReceipt>> {
    let response: unknown;
    try {
      response = await host.sendTabMessage(session.tabId, message, frameOptions(session.frameId));
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${session.tabId}.`,
        details: {
          tabId: session.tabId,
          frameId: session.frameId,
          error: errorMessage(error),
        },
      });
    }

    const contentResult = readExtensionResult<ContentRecorderReceipt>(response);
    if (contentResult === null) {
      return failure({
        code: 'unsupported_message',
        message: 'Content recorder returned an unsupported response.',
        details: {
          tabId: session.tabId,
          frameId: session.frameId,
          kind: message.kind,
        },
      });
    }

    if (!contentResult.ok) {
      return contentResult;
    }

    if (contentResult.value.kind !== message.kind) {
      return failure({
        code: 'unsupported_message',
        message: 'Content recorder response kind does not match the command.',
        details: {
          expected: message.kind,
          actual: contentResult.value.kind,
        },
      });
    }

    return contentResult;
  }

  function getRecordedDraft(
    message: RecordDraftGetMessage,
  ): ExtensionResult<RecordedScenarioDraftHandoff | null> {
    const draft = selectRecordedDraft(message.payload);
    if (draft === null) {
      return ok(null);
    }

    recordedDrafts.delete(draft.draftId);
    return ok(draft);
  }

  async function routeLocatorPreview(
    message: LocatorPreviewMessage,
  ): Promise<ExtensionResult<LocatorPreviewResult>> {
    const target = await resolveTargetTab(message.payload);
    if (!target.ok) {
      return target;
    }
    const routedMessage = withResolvedFrame(message, target.value.frameId);

    let response: unknown;
    try {
      response = await host.sendTabMessage(
        target.value.tabId,
        routedMessage,
        frameOptions(target.value.frameId),
      );
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${target.value.tabId}.`,
        details: {
          tabId: target.value.tabId,
          frameId: target.value.frameId,
          error: errorMessage(error),
        },
      });
    }

    const result = readExtensionResult<LocatorPreviewResult>(response);
    if (result === null) {
      return failure({
        code: 'unsupported_message',
        message: 'Content locator preview returned an unsupported response.',
        details: {
          tabId: target.value.tabId,
          frameId: target.value.frameId,
        },
      });
    }

    return result;
  }

  async function resolveTargetTab(
    correlation: RequiredTabCorrelation,
  ): Promise<ExtensionResult<BackgroundTarget>> {
    let tab: BackgroundTab | null;
    try {
      tab = await host.getTab(correlation.tabId);
    } catch (error) {
      return failure({
        code: 'routing_error',
        message: `Target tab ${correlation.tabId} lookup failed.`,
        details: { tabId: correlation.tabId, error: errorMessage(error) },
      });
    }

    if (tab?.id === undefined) {
      return failure({
        code: 'routing_error',
        message: `Target tab ${correlation.tabId} was not found.`,
        details: { tabId: correlation.tabId },
      });
    }

    return validateTargetTab(tab, correlation.frameId);
  }

  async function validateTargetTab(
    tab: BackgroundTab,
    frameId?: number,
  ): Promise<ExtensionResult<BackgroundTarget>> {
    if (tab.id === undefined) {
      return failure({
        code: 'routing_error',
        message: 'Target tab is missing an id.',
      });
    }

    if (tab.url === undefined || tab.url.length === 0) {
      return failure({
        code: 'unsupported_page',
        message: `Actorble cannot run on tab ${tab.id} because it has no URL.`,
        details: { tabId: tab.id },
      });
    }

    const url = parseSupportedPageUrl(tab.url);
    if (url === null) {
      return failure({
        code: 'unsupported_page',
        message: `Actorble cannot run on ${tab.url}.`,
        details: { tabId: tab.id, url: tab.url },
      });
    }

    if (host.hasTabPermission !== undefined) {
      const hasPermission = await host.hasTabPermission({ ...tab, id: tab.id, url: tab.url });
      if (!hasPermission) {
        return failure({
          code: 'permission_denied',
          message: `Actorble does not have permission for ${url.origin}.`,
          details: { tabId: tab.id, origin: url.origin },
        });
      }
    }

    const readiness = await resolveContentReadiness(tab.id, frameId);
    if (!readiness.ok) {
      return failure(readiness.issues);
    }

    return ok({
      tabId: tab.id,
      ...optionalFrameId(readiness.value.frameId),
      url: tab.url,
      ...(readiness.value.capabilities === undefined
        ? {}
        : { capabilities: readiness.value.capabilities }),
    });
  }

  async function resolveContentReadiness(
    tabId: number,
    frameId?: number,
  ): Promise<ExtensionResult<ContentReadyMetadata>> {
    const cached = selectContentFrame(tabId, frameId);
    if (cached !== null) {
      return ok(cached);
    }

    const probeFrameId = frameId ?? 0;
    const request = createExtensionMessage({
      kind: 'content:ready',
      payload: {
        tabId,
        frameId: probeFrameId,
      },
    });

    let response: unknown;
    try {
      response = await host.sendTabMessage(tabId, request, frameOptions(probeFrameId));
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${tabId}.`,
        details: {
          tabId,
          frameId: probeFrameId,
          error: errorMessage(error),
        },
      });
    }

    const result = readExtensionResult<ContentReadyMetadata>(response);
    if (result === null) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${tabId}.`,
        details: {
          tabId,
          frameId: probeFrameId,
          response,
        },
      });
    }

    if (!result.ok) {
      return result;
    }

    return ok(
      rememberContentFrame({
        ...result.value,
        tabId,
        frameId: result.value.frameId ?? probeFrameId,
      }),
    );
  }

  async function ingestContentReady(
    message: ContentReadyMessage,
    sender?: BackgroundMessageSender,
  ): Promise<ExtensionResult<BackgroundCommandReceipt>> {
    const tabId = message.payload.tabId ?? sender?.tab?.id;
    if (tabId === undefined) {
      return failure({
        code: 'routing_error',
        message: 'Content readiness could not be correlated to a tab.',
      });
    }

    const frameId = message.payload.frameId ?? sender?.frameId;
    const metadata = rememberContentFrame({
      ...message.payload,
      tabId,
      ...(frameId === undefined ? {} : { frameId }),
      ...(message.payload.url === undefined && sender?.url !== undefined
        ? { url: sender.url }
        : {}),
    });

    const activeRecord = activeRecordSessionFor({
      tabId,
      ...optionalFrameId(metadata.frameId),
    });
    if (activeRecord !== undefined) {
      await armContentRecorder(activeRecord);
    }

    return ok(
      receiptFor(
        message.kind,
        {
          tabId,
          ...optionalFrameId(metadata.frameId),
        },
        true,
        activeRecord,
      ),
    );
  }

  function ingestRecordEvent(
    message: RecordEventMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = recordSessions.get(message.payload.sessionId);
    if (
      session === undefined ||
      session.status !== 'recording' ||
      !matchesRecordEventCorrelation(session, message.payload)
    ) {
      return failure({
        code: 'recorder_error',
        message: 'Recorded events do not match an active recorder session.',
        details: {
          sessionId: message.payload.sessionId,
          ...targetDetails(message.payload),
        },
      });
    }

    const events = recordEventBuffers.get(session.sessionId) ?? [];
    events.push(...message.payload.events);
    recordEventBuffers.set(session.sessionId, events);

    return ok(
      receiptFor(
        message.kind,
        {
          ...message.payload,
          sessionId: session.sessionId,
        },
        true,
        session,
      ),
    );
  }

  function ingestRuntimeStatus(
    message: RuntimeStatusMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertRunSession(
      message.payload,
      message.payload.status,
      message.payload.message,
    );
    return ok(receiptFor(message.kind, message.payload, true, session));
  }

  function ingestTraceEvent(message: TraceEventMessage): ExtensionResult<BackgroundCommandReceipt> {
    const existing = runSessions.get(message.payload.runId);
    const session = upsertRunSession(
      message.payload,
      existing?.status ?? 'running',
      existing?.message,
    );
    return ok(receiptFor(message.kind, message.payload, true, session));
  }

  function updateSessionForRoutedMessage(
    message: RoutableMessage,
  ): BackgroundSessionSnapshot | undefined {
    switch (message.kind) {
      case 'scenario:run':
        return upsertRunSession(message.payload, 'running');
      case 'scenario:pause':
        return upsertRunSession(message.payload, 'paused');
      case 'scenario:resume':
        return upsertRunSession(message.payload, 'running');
      case 'scenario:stop':
        return upsertRunSession(message.payload, 'stopped');
      case 'inspector:start':
        return upsertInspectorSession(message.payload, 'inspecting');
      case 'inspector:stop':
        return upsertInspectorSession(message.payload, 'stopped');
    }
  }

  function upsertRunSession(
    correlation: RequiredRunCorrelation,
    status: RuntimeRunStatus,
    message?: string,
  ): BackgroundRunSession {
    const timestamp = getNow();
    const existing = runSessions.get(correlation.runId);
    const session = {
      type: 'run',
      runId: correlation.runId,
      scenarioId: correlation.scenarioId,
      tabId: correlation.tabId,
      ...optionalFrameId(correlation.frameId),
      status,
      startedAt: existing?.startedAt ?? timestamp,
      updatedAt: timestamp,
      ...(message === undefined ? {} : { message }),
    } satisfies BackgroundRunSession;

    runSessions.set(correlation.runId, session);
    return session;
  }

  function upsertRecordSession(
    correlation: RequiredTabCorrelation & Readonly<{ scenarioId?: string; runId?: string }>,
    status: BackgroundRecordSession['status'],
    update: Readonly<{
      draftId?: string;
      message?: string;
    }> = {},
  ): BackgroundRecordSession {
    const timestamp = getNow();
    const sessionId = recordSessionId(correlation);
    const existing = recordSessions.get(sessionId);
    const draftId = update.draftId ?? existing?.draftId;
    const session = {
      type: 'record',
      sessionId,
      tabId: correlation.tabId,
      ...optionalFrameId(correlation.frameId),
      ...(correlation.scenarioId === undefined ? {} : { scenarioId: correlation.scenarioId }),
      ...(correlation.runId === undefined ? {} : { runId: correlation.runId }),
      status,
      startedAt: existing?.startedAt ?? timestamp,
      updatedAt: timestamp,
      ...(draftId === undefined ? {} : { draftId }),
      ...(update.message === undefined ? {} : { message: update.message }),
    } satisfies BackgroundRecordSession;

    recordSessions.set(sessionId, session);
    return session;
  }

  function getRunSession(runId: string): BackgroundRunSession | null {
    return runSessions.get(runId) ?? null;
  }

  function getRecordSession(
    correlation: Partial<RequiredTabCorrelation> & Readonly<{ runId?: string }>,
  ): BackgroundRecordSession | null {
    if (correlation.runId !== undefined) {
      return recordSessions.get(correlation.runId) ?? null;
    }

    if (correlation.tabId === undefined) {
      return null;
    }

    return recordSessions.get(recordSessionId(correlation as RequiredTabCorrelation)) ?? null;
  }

  function ingestInspectorSelected(
    message: InspectorSelectedMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertInspectorSession(message.payload, 'selected', {
      selectedTarget: message.payload.target,
    });
    return ok(receiptFor(message.kind, message.payload, true, session));
  }

  function ingestInspectorCancelled(
    message: InspectorCancelledMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertInspectorSession(message.payload, 'cancelled', {
      reason: message.payload.reason,
      message: message.payload.message,
    });
    return ok(receiptFor(message.kind, message.payload, true, session));
  }

  function upsertInspectorSession(
    correlation: InspectorSessionCorrelation,
    status: BackgroundInspectorSession['status'],
    update: Readonly<{
      selectedTarget?: InspectorTargetMetadata;
      reason?: InspectorCancellationReason;
      message?: string;
    }> = {},
  ): BackgroundInspectorSession {
    const timestamp = getNow();
    const existing = inspectorSessions.get(correlation.sessionId);
    const session = {
      type: 'inspector',
      sessionId: correlation.sessionId,
      tabId: correlation.tabId,
      ...optionalFrameId(correlation.frameId),
      ...(correlation.scenarioId === undefined ? {} : { scenarioId: correlation.scenarioId }),
      ...(correlation.runId === undefined ? {} : { runId: correlation.runId }),
      ...(correlation.targetSlot === undefined ? {} : { targetSlot: correlation.targetSlot }),
      status,
      startedAt: existing?.startedAt ?? timestamp,
      updatedAt: timestamp,
      ...(update.selectedTarget === undefined ? {} : { selectedTarget: update.selectedTarget }),
      ...(update.reason === undefined ? {} : { reason: update.reason }),
      ...(update.message === undefined ? {} : { message: update.message }),
    } satisfies BackgroundInspectorSession;

    inspectorSessions.set(correlation.sessionId, session);
    return session;
  }

  function getInspectorSession(sessionId: string): BackgroundInspectorSession | null {
    return inspectorSessions.get(sessionId) ?? null;
  }

  function selectContentFrame(tabId: number, frameId?: number): ContentReadyMetadata | null {
    const frames = contentFrames.get(tabId);
    if (frames === undefined) {
      return null;
    }

    return frames.get(frameId ?? 0) ?? null;
  }

  function rememberContentFrame(
    metadata: ContentReadyMetadata & Readonly<{ tabId: number }>,
  ): ContentReadyMetadata {
    const normalized = {
      ...metadata,
      tabId: metadata.tabId,
      ...optionalFrameId(metadata.frameId),
    } satisfies ContentReadyMetadata;

    if (normalized.frameId === undefined) {
      return normalized;
    }

    const frames = contentFrames.get(metadata.tabId) ?? new Map<number, ContentReadyMetadata>();
    frames.set(normalized.frameId, normalized);
    contentFrames.set(metadata.tabId, frames);
    return normalized;
  }

  function latestRunSession(
    filter: RequiredTabCorrelation & Readonly<{ scenarioId?: string }>,
  ): BackgroundRunSession | undefined {
    return latestSession(
      Array.from(runSessions.values()).filter(
        (session) =>
          session.tabId === filter.tabId &&
          session.frameId === filter.frameId &&
          (filter.scenarioId === undefined || session.scenarioId === filter.scenarioId),
      ),
    );
  }

  function latestRecordSession(
    filter: RequiredTabCorrelation & Readonly<{ scenarioId?: string }>,
  ): BackgroundRecordSession | undefined {
    return latestSession(
      Array.from(recordSessions.values()).filter(
        (session) =>
          session.tabId === filter.tabId &&
          session.frameId === filter.frameId &&
          (filter.scenarioId === undefined || session.scenarioId === filter.scenarioId),
      ),
    );
  }

  function conflictForRoutableMessage(message: RoutableMessage): ExtensionIssue | null {
    if (message.kind === 'scenario:run' && activeRecordSessionFor(message.payload) !== undefined) {
      return {
        code: 'runtime_error',
        message: 'Scenario run cannot start while recording is active.',
        details: targetDetails(message.payload),
      };
    }

    if (
      message.kind === 'inspector:start' &&
      activeRecordSessionFor(message.payload) !== undefined
    ) {
      return {
        code: 'inspector_error',
        message: 'Target inspection cannot start while recording is active.',
        details: targetDetails(message.payload),
      };
    }

    return null;
  }

  function conflictForRecordCommand(message: RecordCommandMessage): ExtensionIssue | null {
    if (message.kind !== 'record:start') {
      return null;
    }

    const activeRecord = activeRecordSessionFor(message.payload);
    if (activeRecord !== undefined) {
      return {
        code: 'recorder_error',
        message: 'A recorder session is already active.',
        details: {
          ...targetDetails(message.payload),
          activeSessionId: activeRecord.sessionId,
        },
      };
    }

    const activeRun = activeRunSessionFor(message.payload);
    if (activeRun !== undefined) {
      return {
        code: 'recorder_error',
        message: 'Recording cannot start while a scenario run is active.',
        details: {
          ...targetDetails(message.payload),
          activeRunId: activeRun.runId,
        },
      };
    }

    const activeInspector = activeInspectorSessionFor(message.payload);
    if (activeInspector !== undefined) {
      return {
        code: 'recorder_error',
        message: 'Recording cannot start while target inspection is active.',
        details: {
          ...targetDetails(message.payload),
          activeSessionId: activeInspector.sessionId,
        },
      };
    }

    return null;
  }

  function activeRecordSessionFor(
    target: RequiredTabCorrelation,
  ): BackgroundRecordSession | undefined {
    return Array.from(recordSessions.values()).find(
      (session) => session.status === 'recording' && matchesTarget(session, target),
    );
  }

  function activeRunSessionFor(target: RequiredTabCorrelation): BackgroundRunSession | undefined {
    return Array.from(runSessions.values()).find(
      (session) =>
        (session.status === 'running' || session.status === 'paused') &&
        matchesTarget(session, target),
    );
  }

  function activeInspectorSessionFor(
    target: RequiredTabCorrelation,
  ): BackgroundInspectorSession | undefined {
    return Array.from(inspectorSessions.values()).find(
      (session) => session.status === 'inspecting' && matchesTarget(session, target),
    );
  }

  function createRecordedDraft(
    session: BackgroundRecordSession,
    events: readonly RawRecordedEvent[],
  ): ExtensionResult<RecordedScenarioDraftHandoff> {
    const normalized = normalizeRecordedEvents(events);
    if (!normalized.ok) {
      return normalized;
    }

    const draftId = session.runId ?? session.sessionId;
    const draft = {
      draftId,
      sessionId: session.sessionId,
      tabId: session.tabId,
      ...optionalFrameId(session.frameId),
      ...(session.scenarioId === undefined ? {} : { scenarioId: session.scenarioId }),
      ...(session.runId === undefined ? {} : { runId: session.runId }),
      document: normalized.value.document,
      sourceEventCount: events.length,
      createdAt: getNow(),
    } satisfies RecordedScenarioDraftHandoff;

    recordedDrafts.set(draft.draftId, draft);
    return ok(draft);
  }

  function createEmptyRecording(session: BackgroundRecordSession): RecordedEmptyRecordingState {
    return {
      sessionId: session.sessionId,
      tabId: session.tabId,
      ...optionalFrameId(session.frameId),
      ...(session.scenarioId === undefined ? {} : { scenarioId: session.scenarioId }),
      ...(session.runId === undefined ? {} : { runId: session.runId }),
      sourceEventCount: 0,
      createdAt: getNow(),
      message: 'No browser events were recorded.',
    };
  }

  function selectRecordedDraft(
    lookup: RecordDraftGetMessage['payload'],
  ): RecordedScenarioDraftHandoff | null {
    if (lookup.draftId !== undefined) {
      return recordedDrafts.get(lookup.draftId) ?? null;
    }

    const drafts = Array.from(recordedDrafts.values()).reverse();
    return (
      drafts.find(
        (draft) =>
          (lookup.tabId === undefined || draft.tabId === lookup.tabId) &&
          (lookup.frameId === undefined || draft.frameId === lookup.frameId) &&
          (lookup.scenarioId === undefined || draft.scenarioId === lookup.scenarioId) &&
          (lookup.runId === undefined || draft.runId === lookup.runId),
      ) ?? null
    );
  }

  return {
    handleMessage,
    resolveActiveTarget,
    getRunSession,
    getRecordSession,
    getInspectorSession,
  };
}

export function createWxtBackgroundBrowserHost(
  browser: WxtBackgroundBrowser,
): BackgroundBrowserHost {
  return {
    async getActiveTab() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      return tab ?? null;
    },
    async getTab(tabId) {
      return (await browser.tabs.get(tabId)) ?? null;
    },
    async sendTabMessage(tabId, message, options) {
      if (options.frameId === undefined) {
        return browser.tabs.sendMessage(tabId, message);
      }

      return browser.tabs.sendMessage(tabId, message, { frameId: options.frameId });
    },
    async hasTabPermission(tab) {
      if (tab.active === true) {
        return true;
      }

      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id === tab.id) {
        return true;
      }

      if (browser.permissions?.contains === undefined) {
        return true;
      }

      const url = parseSupportedPageUrl(tab.url);
      if (url === null) {
        return false;
      }

      try {
        return await browser.permissions.contains({ origins: [`${url.origin}/*`] });
      } catch {
        return false;
      }
    },
  };
}

function receiptFor(
  kind: ExtensionMessageKind,
  correlation: RequiredTabCorrelation &
    Readonly<{
      sessionId?: string;
      scenarioId?: string;
      runId?: string;
      targetSlot?: InspectorTargetSlotCorrelation;
    }>,
  contentReady: boolean,
  session?: BackgroundSessionSnapshot,
): BackgroundCommandReceipt {
  return {
    kind,
    tabId: correlation.tabId,
    ...optionalFrameId(correlation.frameId),
    ...(correlation.sessionId === undefined ? {} : { sessionId: correlation.sessionId }),
    ...(correlation.scenarioId === undefined ? {} : { scenarioId: correlation.scenarioId }),
    ...(correlation.runId === undefined ? {} : { runId: correlation.runId }),
    ...(correlation.targetSlot === undefined ? {} : { targetSlot: correlation.targetSlot }),
    contentReady,
    ...(session === undefined ? {} : { session }),
  };
}

function parseSupportedPageUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function recordSessionId(
  correlation: RequiredTabCorrelation & Readonly<{ runId?: string }>,
): string {
  return correlation.runId ?? `${correlation.tabId}:${correlation.frameId ?? 0}`;
}

function withResolvedFrame<
  TMessage extends RoutableMessage | RecordCommandMessage | LocatorPreviewMessage,
>(message: TMessage, frameId: number | undefined): TMessage {
  if (frameId === undefined || message.payload.frameId === frameId) {
    return message;
  }

  return {
    ...message,
    payload: {
      ...message.payload,
      frameId,
    },
  } as TMessage;
}

function frameOptions(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId };
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId };
}

function optionalRunSession(
  session: BackgroundRunSession | undefined,
): Readonly<{ runSession?: BackgroundRunSession }> {
  return session === undefined ? {} : { runSession: session };
}

function optionalRecordSession(
  session: BackgroundRecordSession | undefined,
): Readonly<{ recordSession?: BackgroundRecordSession }> {
  return session === undefined ? {} : { recordSession: session };
}

function latestSession<TSession extends Readonly<{ updatedAt: number }>>(
  sessions: readonly TSession[],
): TSession | undefined {
  return sessions.reduce<TSession | undefined>((latest, session) => {
    if (latest === undefined || session.updatedAt > latest.updatedAt) {
      return session;
    }

    return latest;
  }, undefined);
}

function matchesTarget(session: RequiredTabCorrelation, target: RequiredTabCorrelation): boolean {
  return session.tabId === target.tabId && session.frameId === target.frameId;
}

function matchesRecordEventCorrelation(
  session: BackgroundRecordSession,
  payload: RecordEventMessage['payload'],
): boolean {
  return (
    session.sessionId === payload.sessionId &&
    matchesTarget(session, payload) &&
    (payload.scenarioId === undefined || session.scenarioId === payload.scenarioId) &&
    (payload.runId === undefined || session.runId === payload.runId)
  );
}

function matchesRecordCommandCorrelation(
  session: BackgroundRecordSession,
  payload: RequiredTabCorrelation & Readonly<{ scenarioId?: string; runId?: string }>,
): boolean {
  return (
    matchesTarget(session, payload) &&
    (payload.scenarioId === undefined || session.scenarioId === payload.scenarioId) &&
    (payload.runId === undefined || session.runId === payload.runId)
  );
}

function targetDetails(target: RequiredTabCorrelation): Readonly<Record<string, unknown>> {
  return {
    tabId: target.tabId,
    ...(target.frameId === undefined ? {} : { frameId: target.frameId }),
  };
}

function readExtensionResult<TValue>(value: unknown): ExtensionResult<TValue> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const result = value as Readonly<{
    ok?: unknown;
    value?: unknown;
    issues?: unknown;
  }>;

  if (result.ok === true && result.value !== undefined) {
    return value as ExtensionResult<TValue>;
  }

  if (result.ok === false && Array.isArray(result.issues)) {
    return value as ExtensionResult<TValue>;
  }

  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
