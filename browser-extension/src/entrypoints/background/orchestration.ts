import type {
  ActorbleExtensionMessage,
  ExtensionMessageKind,
  InspectorCancellationReason,
  InspectorSessionCorrelation,
  InspectorTargetMetadata,
  PopupGetStateMessage,
  RequiredRunCorrelation,
  RequiredTabCorrelation,
} from '../../messaging/index.js'
import { isActorbleExtensionMessage } from '../../messaging/index.js'
import { failure, ok, type ExtensionIssue, type ExtensionResult } from '../../shared/result.js'
import type { RuntimeRunStatus } from '../../trace/index.js'

export type BackgroundTab = Readonly<{
  id?: number
  url?: string
  active?: boolean
}>

export type BackgroundTarget = Readonly<{
  tabId: number
  frameId?: number
  url: string
}>

export type BackgroundBrowserHost = Readonly<{
  getActiveTab(): Promise<BackgroundTab | null>
  getTab(tabId: number): Promise<BackgroundTab | null>
  sendTabMessage(
    tabId: number,
    message: ActorbleExtensionMessage,
    options: Readonly<{ frameId?: number }>,
  ): Promise<unknown>
  hasTabPermission?(tab: BackgroundTab & Readonly<{ id: number; url: string }>): Promise<boolean>
}>

export type WxtBackgroundBrowser = Readonly<{
  tabs: Readonly<{
    query(queryInfo: Readonly<{ active?: boolean; currentWindow?: boolean }>): Promise<readonly BackgroundTab[]>
    get(tabId: number): Promise<BackgroundTab | undefined>
    sendMessage(
      tabId: number,
      message: ActorbleExtensionMessage,
      options?: Readonly<{ frameId?: number }>,
    ): Promise<unknown>
  }>
  permissions?: Readonly<{
    contains?(permissions: Readonly<{ origins?: readonly string[] }>): Promise<boolean>
  }>
}>

export type BackgroundRunSession = Readonly<{
  type: 'run'
  runId: string
  scenarioId: string
  tabId: number
  frameId?: number
  status: RuntimeRunStatus
  startedAt: number
  updatedAt: number
  message?: string
}>

export type BackgroundRecordSession = Readonly<{
  type: 'record'
  sessionId: string
  tabId: number
  frameId?: number
  scenarioId?: string
  runId?: string
  status: 'recording' | 'stopped'
  startedAt: number
  updatedAt: number
}>

export type BackgroundInspectorSession = Readonly<{
  type: 'inspector'
  sessionId: string
  tabId: number
  frameId?: number
  scenarioId?: string
  runId?: string
  status: 'inspecting' | 'selected' | 'cancelled' | 'stopped'
  startedAt: number
  updatedAt: number
  selectedTarget?: InspectorTargetMetadata
  reason?: InspectorCancellationReason
  message?: string
}>

export type BackgroundSessionSnapshot =
  | BackgroundRunSession
  | BackgroundRecordSession
  | BackgroundInspectorSession

export type BackgroundCommandReceipt = Readonly<{
  kind: ExtensionMessageKind
  tabId: number
  frameId?: number
  sessionId?: string
  scenarioId?: string
  runId?: string
  contentReady: boolean
  session?: BackgroundSessionSnapshot
}>

export type BackgroundPopupState = Readonly<{
  kind: 'popup:state'
  activeTab:
    | Readonly<{
        ready: true
        tabId: number
        frameId?: number
        url: string
      }>
    | Readonly<{
        ready: false
        issue: ExtensionIssue
      }>
  runSession?: BackgroundRunSession
  recordSession?: BackgroundRecordSession
}>

export type BackgroundMessageResult = BackgroundCommandReceipt | BackgroundPopupState

export type BackgroundOrchestrator = Readonly<{
  handleMessage(message: unknown): Promise<ExtensionResult<BackgroundMessageResult>>
  resolveActiveTarget(frameId?: number): Promise<ExtensionResult<BackgroundTarget>>
  getRunSession(runId: string): BackgroundRunSession | null
  getRecordSession(correlation: Partial<RequiredTabCorrelation> & Readonly<{ runId?: string }>): BackgroundRecordSession | null
  getInspectorSession(sessionId: string): BackgroundInspectorSession | null
}>

export type BackgroundOrchestratorOptions = Readonly<{
  now?: () => number
}>

type RoutableMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{
    kind:
      | 'scenario:run'
      | 'scenario:pause'
      | 'scenario:resume'
      | 'scenario:stop'
      | 'record:start'
      | 'record:stop'
      | 'inspector:start'
      | 'inspector:stop'
  }>
>

type RuntimeStatusMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'runtime:status' }>
>

type TraceEventMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'trace:event' }>
>

type InspectorSelectedMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'inspector:selected' }>
>

type InspectorCancelledMessage = Extract<
  ActorbleExtensionMessage,
  Readonly<{ kind: 'inspector:cancelled' }>
>

export function createBackgroundOrchestrator(
  host: BackgroundBrowserHost,
  options: BackgroundOrchestratorOptions = {},
): BackgroundOrchestrator {
  const getNow = options.now ?? Date.now
  const runSessions = new Map<string, BackgroundRunSession>()
  const recordSessions = new Map<string, BackgroundRecordSession>()
  const inspectorSessions = new Map<string, BackgroundInspectorSession>()

  async function handleMessage(
    message: unknown,
  ): Promise<ExtensionResult<BackgroundMessageResult>> {
    if (!isActorbleExtensionMessage(message)) {
      return failure({
        code: 'unsupported_message',
        message: 'Background received an unsupported extension message.',
      })
    }

    switch (message.kind) {
      case 'scenario:run':
      case 'scenario:pause':
      case 'scenario:resume':
      case 'scenario:stop':
      case 'record:start':
      case 'record:stop':
      case 'inspector:start':
      case 'inspector:stop':
        return routeToContent(message)
      case 'runtime:status':
        return ingestRuntimeStatus(message)
      case 'trace:event':
        return ingestTraceEvent(message)
      case 'inspector:selected':
        return ingestInspectorSelected(message)
      case 'inspector:cancelled':
        return ingestInspectorCancelled(message)
      case 'popup:get-state':
        return getPopupState(message)
      case 'scenario:validate':
      case 'scenario:compile':
        return failure({
          code: 'unsupported_message',
          message: `${message.kind} is handled by the scenario boundary, not the background router.`,
          details: { kind: message.kind },
        })
    }
  }

  async function getPopupState(
    message: PopupGetStateMessage,
  ): Promise<ExtensionResult<BackgroundPopupState>> {
    const target = await resolveActiveTarget(message.payload.frameId)

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
      })
    }

    const sessionFilter = {
      tabId: target.value.tabId,
      frameId: target.value.frameId,
      scenarioId: message.payload.scenarioId,
    }

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
    })
  }

  async function resolveActiveTarget(
    frameId?: number,
  ): Promise<ExtensionResult<BackgroundTarget>> {
    let tab: BackgroundTab | null
    try {
      tab = await host.getActiveTab()
    } catch (error) {
      return failure({
        code: 'routing_error',
        message: 'Active tab lookup failed.',
        details: { error: errorMessage(error) },
      })
    }

    if (tab?.id === undefined) {
      return failure({
        code: 'routing_error',
        message: 'No active tab is available.',
      })
    }

    return validateTargetTab(tab, frameId)
  }

  async function routeToContent(
    message: RoutableMessage,
  ): Promise<ExtensionResult<BackgroundCommandReceipt>> {
    const target = await resolveTargetTab(message.payload)
    if (!target.ok) {
      return target
    }

    try {
      await host.sendTabMessage(target.value.tabId, message, frameOptions(target.value.frameId))
    } catch (error) {
      return failure({
        code: 'content_not_ready',
        message: `Content script is not ready for tab ${target.value.tabId}.`,
        details: {
          tabId: target.value.tabId,
          frameId: target.value.frameId,
          error: errorMessage(error),
        },
      })
    }

    const session = updateSessionForRoutedMessage(message)
    return ok(receiptFor(message.kind, message.payload, true, session))
  }

  async function resolveTargetTab(
    correlation: RequiredTabCorrelation,
  ): Promise<ExtensionResult<BackgroundTarget>> {
    let tab: BackgroundTab | null
    try {
      tab = await host.getTab(correlation.tabId)
    } catch (error) {
      return failure({
        code: 'routing_error',
        message: `Target tab ${correlation.tabId} lookup failed.`,
        details: { tabId: correlation.tabId, error: errorMessage(error) },
      })
    }

    if (tab?.id === undefined) {
      return failure({
        code: 'routing_error',
        message: `Target tab ${correlation.tabId} was not found.`,
        details: { tabId: correlation.tabId },
      })
    }

    return validateTargetTab(tab, correlation.frameId)
  }

  async function validateTargetTab(
    tab: BackgroundTab,
    frameId?: number,
  ): Promise<ExtensionResult<BackgroundTarget>> {
    if (tab.id === undefined) {
      return failure({
        code: 'routing_error',
        message: 'Target tab is missing an id.',
      })
    }

    if (tab.url === undefined || tab.url.length === 0) {
      return failure({
        code: 'unsupported_page',
        message: `Actorble cannot run on tab ${tab.id} because it has no URL.`,
        details: { tabId: tab.id },
      })
    }

    const url = parseSupportedPageUrl(tab.url)
    if (url === null) {
      return failure({
        code: 'unsupported_page',
        message: `Actorble cannot run on ${tab.url}.`,
        details: { tabId: tab.id, url: tab.url },
      })
    }

    if (host.hasTabPermission !== undefined) {
      const hasPermission = await host.hasTabPermission({ ...tab, id: tab.id, url: tab.url })
      if (!hasPermission) {
        return failure({
          code: 'permission_denied',
          message: `Actorble does not have permission for ${url.origin}.`,
          details: { tabId: tab.id, origin: url.origin },
        })
      }
    }

    return ok({
      tabId: tab.id,
      ...optionalFrameId(frameId),
      url: tab.url,
    })
  }

  function ingestRuntimeStatus(
    message: RuntimeStatusMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertRunSession(message.payload, message.payload.status, message.payload.message)
    return ok(receiptFor(message.kind, message.payload, true, session))
  }

  function ingestTraceEvent(
    message: TraceEventMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const existing = runSessions.get(message.payload.runId)
    const session = upsertRunSession(
      message.payload,
      existing?.status ?? 'running',
      existing?.message,
    )
    return ok(receiptFor(message.kind, message.payload, true, session))
  }

  function updateSessionForRoutedMessage(message: RoutableMessage): BackgroundSessionSnapshot | undefined {
    switch (message.kind) {
      case 'scenario:run':
        return upsertRunSession(message.payload, 'running')
      case 'scenario:pause':
        return upsertRunSession(message.payload, 'paused')
      case 'scenario:resume':
        return upsertRunSession(message.payload, 'running')
      case 'scenario:stop':
        return upsertRunSession(message.payload, 'stopped')
      case 'record:start':
        return upsertRecordSession(message.payload, 'recording')
      case 'record:stop':
        return upsertRecordSession(message.payload, 'stopped')
      case 'inspector:start':
        return upsertInspectorSession(message.payload, 'inspecting')
      case 'inspector:stop':
        return upsertInspectorSession(message.payload, 'stopped')
    }
  }

  function upsertRunSession(
    correlation: RequiredRunCorrelation,
    status: RuntimeRunStatus,
    message?: string,
  ): BackgroundRunSession {
    const timestamp = getNow()
    const existing = runSessions.get(correlation.runId)
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
    } satisfies BackgroundRunSession

    runSessions.set(correlation.runId, session)
    return session
  }

  function upsertRecordSession(
    correlation: RequiredTabCorrelation & Readonly<{ scenarioId?: string; runId?: string }>,
    status: BackgroundRecordSession['status'],
  ): BackgroundRecordSession {
    const timestamp = getNow()
    const sessionId = recordSessionId(correlation)
    const existing = recordSessions.get(sessionId)
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
    } satisfies BackgroundRecordSession

    recordSessions.set(sessionId, session)
    return session
  }

  function getRunSession(runId: string): BackgroundRunSession | null {
    return runSessions.get(runId) ?? null
  }

  function getRecordSession(
    correlation: Partial<RequiredTabCorrelation> & Readonly<{ runId?: string }>,
  ): BackgroundRecordSession | null {
    if (correlation.runId !== undefined) {
      return recordSessions.get(correlation.runId) ?? null
    }

    if (correlation.tabId === undefined) {
      return null
    }

    return recordSessions.get(recordSessionId(correlation as RequiredTabCorrelation)) ?? null
  }

  function ingestInspectorSelected(
    message: InspectorSelectedMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertInspectorSession(message.payload, 'selected', {
      selectedTarget: message.payload.target,
    })
    return ok(receiptFor(message.kind, message.payload, true, session))
  }

  function ingestInspectorCancelled(
    message: InspectorCancelledMessage,
  ): ExtensionResult<BackgroundCommandReceipt> {
    const session = upsertInspectorSession(message.payload, 'cancelled', {
      reason: message.payload.reason,
      message: message.payload.message,
    })
    return ok(receiptFor(message.kind, message.payload, true, session))
  }

  function upsertInspectorSession(
    correlation: InspectorSessionCorrelation,
    status: BackgroundInspectorSession['status'],
    update: Readonly<{
      selectedTarget?: InspectorTargetMetadata
      reason?: InspectorCancellationReason
      message?: string
    }> = {},
  ): BackgroundInspectorSession {
    const timestamp = getNow()
    const existing = inspectorSessions.get(correlation.sessionId)
    const session = {
      type: 'inspector',
      sessionId: correlation.sessionId,
      tabId: correlation.tabId,
      ...optionalFrameId(correlation.frameId),
      ...(correlation.scenarioId === undefined ? {} : { scenarioId: correlation.scenarioId }),
      ...(correlation.runId === undefined ? {} : { runId: correlation.runId }),
      status,
      startedAt: existing?.startedAt ?? timestamp,
      updatedAt: timestamp,
      ...(update.selectedTarget === undefined ? {} : { selectedTarget: update.selectedTarget }),
      ...(update.reason === undefined ? {} : { reason: update.reason }),
      ...(update.message === undefined ? {} : { message: update.message }),
    } satisfies BackgroundInspectorSession

    inspectorSessions.set(correlation.sessionId, session)
    return session
  }

  function getInspectorSession(sessionId: string): BackgroundInspectorSession | null {
    return inspectorSessions.get(sessionId) ?? null
  }

  function latestRunSession(
    filter: RequiredTabCorrelation & Readonly<{ scenarioId?: string }>,
  ): BackgroundRunSession | undefined {
    return latestSession(
      Array.from(runSessions.values()).filter((session) => (
        session.tabId === filter.tabId &&
        session.frameId === filter.frameId &&
        (filter.scenarioId === undefined || session.scenarioId === filter.scenarioId)
      )),
    )
  }

  function latestRecordSession(
    filter: RequiredTabCorrelation & Readonly<{ scenarioId?: string }>,
  ): BackgroundRecordSession | undefined {
    return latestSession(
      Array.from(recordSessions.values()).filter((session) => (
        session.tabId === filter.tabId &&
        session.frameId === filter.frameId &&
        (filter.scenarioId === undefined || session.scenarioId === filter.scenarioId)
      )),
    )
  }

  return {
    handleMessage,
    resolveActiveTarget,
    getRunSession,
    getRecordSession,
    getInspectorSession,
  }
}

export function createWxtBackgroundBrowserHost(
  browser: WxtBackgroundBrowser,
): BackgroundBrowserHost {
  return {
    async getActiveTab() {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      return tab ?? null
    },
    async getTab(tabId) {
      return (await browser.tabs.get(tabId)) ?? null
    },
    async sendTabMessage(tabId, message, options) {
      if (options.frameId === undefined) {
        return browser.tabs.sendMessage(tabId, message)
      }

      return browser.tabs.sendMessage(tabId, message, { frameId: options.frameId })
    },
    async hasTabPermission(tab) {
      if (tab.active === true) {
        return true
      }

      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id === tab.id) {
        return true
      }

      if (browser.permissions?.contains === undefined) {
        return true
      }

      const url = parseSupportedPageUrl(tab.url)
      if (url === null) {
        return false
      }

      try {
        return await browser.permissions.contains({ origins: [`${url.origin}/*`] })
      } catch {
        return false
      }
    },
  }
}

function receiptFor(
  kind: ExtensionMessageKind,
  correlation: RequiredTabCorrelation &
    Readonly<{ sessionId?: string; scenarioId?: string; runId?: string }>,
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
    contentReady,
    ...(session === undefined ? {} : { session }),
  }
}

function parseSupportedPageUrl(rawUrl: string): URL | null {
  try {
    const url = new URL(rawUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function recordSessionId(correlation: RequiredTabCorrelation & Readonly<{ runId?: string }>): string {
  return correlation.runId ?? `${correlation.tabId}:${correlation.frameId ?? 0}`
}

function frameOptions(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
}

function optionalFrameId(frameId: number | undefined): Readonly<{ frameId?: number }> {
  return frameId === undefined ? {} : { frameId }
}

function optionalRunSession(
  session: BackgroundRunSession | undefined,
): Readonly<{ runSession?: BackgroundRunSession }> {
  return session === undefined ? {} : { runSession: session }
}

function optionalRecordSession(
  session: BackgroundRecordSession | undefined,
): Readonly<{ recordSession?: BackgroundRecordSession }> {
  return session === undefined ? {} : { recordSession: session }
}

function latestSession<TSession extends Readonly<{ updatedAt: number }>>(
  sessions: readonly TSession[],
): TSession | undefined {
  return sessions.reduce<TSession | undefined>((latest, session) => {
    if (latest === undefined || session.updatedAt > latest.updatedAt) {
      return session
    }

    return latest
  }, undefined)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
