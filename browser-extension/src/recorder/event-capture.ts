import { failure, ok, type ExtensionResult } from '../shared/result.js';
import type { RequiredTabCorrelation } from '../messaging/index.js';

export type RecorderSensitiveInputPolicy = 'mask' | 'omit' | 'plain';

export type RecorderSensitiveInputReason = 'password_type' | 'secret_like_field';

export type RecorderTextEventSource = 'input' | 'change';
export type RecorderPointerEventPhase = 'down' | 'move' | 'up';
export type RecorderDragEventPhase = 'start' | 'drop';

export const RECORDER_MASKED_VALUE = '[masked]';

export type RecorderTargetRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type RecorderTargetSnapshot = Readonly<{
  tagName: string;
  rect: RecorderTargetRect;
  frameUrl?: string;
  id?: string;
  classes?: readonly string[];
  role?: string;
  ariaLabel?: string;
  labelText?: string;
  testId?: string;
  inputType?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  text?: string;
}>;

export type RawRecordedClickEvent = Readonly<{
  kind: 'click';
  target: RecorderTargetSnapshot;
  timestamp: number;
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
  button: number;
}>;

export type RawRecordedTextEvent = Readonly<{
  kind: 'text';
  target: RecorderTargetSnapshot;
  source: RecorderTextEventSource;
  value: string;
  sensitive: boolean;
  sensitiveReason?: RecorderSensitiveInputReason;
  timestamp: number;
}>;

export type RawRecordedPointerEvent = Readonly<{
  kind: 'pointer';
  phase: RecorderPointerEventPhase;
  target: RecorderTargetSnapshot;
  timestamp: number;
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
  button: number;
  buttons: number;
  pointerId: number;
  pointerType: string;
}>;

export type RawRecordedSelectionEvent = Readonly<{
  kind: 'selection';
  timestamp: number;
  selectedText: string;
  activeTarget?: RecorderTargetSnapshot;
  anchorTarget?: RecorderTargetSnapshot;
  focusTarget?: RecorderTargetSnapshot;
}>;

export type RawRecordedDragEvent = Readonly<{
  kind: 'drag';
  phase: RecorderDragEventPhase;
  target: RecorderTargetSnapshot;
  timestamp: number;
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
}>;

export type RawRecordedEvent =
  | RawRecordedClickEvent
  | RawRecordedTextEvent
  | RawRecordedPointerEvent
  | RawRecordedSelectionEvent
  | RawRecordedDragEvent;

export type RecorderEventFlushReason = 'incremental' | 'pagehide' | 'stop';

export type RecorderSession = RequiredTabCorrelation &
  Readonly<{
    sessionId: string;
    startedAt: number;
    sensitiveInputPolicy: RecorderSensitiveInputPolicy;
    scenarioId?: string;
    runId?: string;
  }>;

export type RecorderCaptureStartReceipt = RecorderSession &
  Readonly<{
    status: 'recording';
  }>;

export type RecorderEventFlush = RecorderSession &
  Readonly<{
    reason: RecorderEventFlushReason;
    events: readonly RawRecordedEvent[];
  }>;

export type RecorderClickEvent<TElement = unknown> = Readonly<{
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
  button?: number;
  target: TElement | null;
}>;

export type RecorderTextEvent<TElement = unknown> = Readonly<{
  target: TElement | null;
}>;

export type RecorderPointerEvent<TElement = unknown> = Readonly<{
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
  button: number;
  buttons: number;
  pointerId: number;
  pointerType: string;
  target: TElement | null;
}>;

export type RecorderSelectionSnapshot<TElement = unknown> = Readonly<{
  selectedText: string;
  activeTarget?: TElement | null;
  anchorTarget?: TElement | null;
  focusTarget?: TElement | null;
}>;

export type RecorderDragEvent<TElement = unknown> = Readonly<{
  clientX: number;
  clientY: number;
  pageX?: number;
  pageY?: number;
  target: TElement | null;
}>;

export type RecorderEventCaptureAdapter<TElement = unknown> = Readonly<{
  onClick(listener: (event: RecorderClickEvent<TElement>) => void): () => void;
  onInput(listener: (event: RecorderTextEvent<TElement>) => void): () => void;
  onChange(listener: (event: RecorderTextEvent<TElement>) => void): () => void;
  onPointerDown(listener: (event: RecorderPointerEvent<TElement>) => void): () => void;
  onPointerMove(listener: (event: RecorderPointerEvent<TElement>) => void): () => void;
  onPointerUp(listener: (event: RecorderPointerEvent<TElement>) => void): () => void;
  onSelectionChange(listener: () => void): () => void;
  onDragStart(listener: (event: RecorderDragEvent<TElement>) => void): () => void;
  onDrop(listener: (event: RecorderDragEvent<TElement>) => void): () => void;
  onPagehide(listener: () => void): () => void;
  describeElement(element: TElement): RecorderTargetSnapshot;
  readElementValue(element: TElement): string;
  readSelection(): RecorderSelectionSnapshot<TElement>;
  sensitiveInputReason(element: TElement): RecorderSensitiveInputReason | null;
}>;

export interface RecorderEventCapturePort {
  start(session: RecorderSession): ExtensionResult<RecorderCaptureStartReceipt>;
  stop(sessionId: string): Promise<ExtensionResult<void>>;
  dispose(): void;
}

export type RecorderEventCaptureOptions = Readonly<{
  now?: () => number;
  autoFlush?: boolean;
  flushEvents?: (flush: RecorderEventFlush) => Promise<void> | void;
}>;

type ActiveRecorderSession<TElement> = {
  session: RecorderSession;
  pendingEvents: RawRecordedEvent[];
  disposers: (() => void)[];
  cleaned: boolean;
  flushChain: Promise<void>;
  flushIssue?: {
    code: 'recorder_error';
    message: string;
    details?: Readonly<Record<string, unknown>>;
  };
};

export function createRecorderEventCapturePort<TElement = unknown>(
  adapter: RecorderEventCaptureAdapter<TElement>,
  options: RecorderEventCaptureOptions = {},
): RecorderEventCapturePort {
  const getNow = options.now ?? Date.now;
  let activeSession: ActiveRecorderSession<TElement> | null = null;

  function start(session: RecorderSession): ExtensionResult<RecorderCaptureStartReceipt> {
    if (activeSession !== null) {
      return failure({
        code: 'recorder_error',
        message: 'A recorder session is already active.',
        details: {
          activeSessionId: activeSession.session.sessionId,
          requestedSessionId: session.sessionId,
        },
      });
    }

    const active: ActiveRecorderSession<TElement> = {
      session,
      pendingEvents: [],
      disposers: [],
      cleaned: false,
      flushChain: Promise.resolve(),
    };

    active.disposers = [
      adapter.onClick((event) => captureClick(active, event)),
      adapter.onInput((event) => captureText(active, 'input', event)),
      adapter.onChange((event) => captureText(active, 'change', event)),
      adapter.onPointerDown((event) => capturePointer(active, 'down', event)),
      adapter.onPointerMove((event) => capturePointer(active, 'move', event)),
      adapter.onPointerUp((event) => capturePointer(active, 'up', event)),
      adapter.onSelectionChange(() => captureSelection(active)),
      adapter.onDragStart((event) => captureDrag(active, 'start', event)),
      adapter.onDrop((event) => captureDrag(active, 'drop', event)),
      adapter.onPagehide(() => {
        queueFlush(active, 'pagehide');
        cleanup(active);
      }),
    ];
    activeSession = active;

    return ok({
      ...session,
      status: 'recording',
    });
  }

  async function stop(sessionId: string): Promise<ExtensionResult<void>> {
    if (activeSession === null) {
      return ok(undefined);
    }

    if (activeSession.session.sessionId !== sessionId) {
      return failure({
        code: 'recorder_error',
        message: 'The stop message does not match the active recorder session.',
        details: {
          activeSessionId: activeSession.session.sessionId,
          requestedSessionId: sessionId,
        },
      });
    }

    const stoppedSession = activeSession;
    queueFlush(stoppedSession, 'stop');
    cleanup(stoppedSession);
    await stoppedSession.flushChain;

    if (stoppedSession.flushIssue !== undefined) {
      return failure(stoppedSession.flushIssue);
    }

    return ok(undefined);
  }

  function dispose(): void {
    if (activeSession !== null) {
      cleanup(activeSession);
    }
  }

  function captureClick(
    active: ActiveRecorderSession<TElement>,
    event: RecorderClickEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return;
    }

    enqueueEvent(active, {
      kind: 'click',
      target: adapter.describeElement(event.target),
      timestamp: getNow(),
      clientX: event.clientX,
      clientY: event.clientY,
      ...(event.pageX === undefined ? {} : { pageX: event.pageX }),
      ...(event.pageY === undefined ? {} : { pageY: event.pageY }),
      button: event.button ?? 0,
    });
  }

  function captureText(
    active: ActiveRecorderSession<TElement>,
    source: RecorderTextEventSource,
    event: RecorderTextEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return;
    }

    const sensitiveReason = adapter.sensitiveInputReason(event.target);
    const sensitive = sensitiveReason !== null;
    enqueueEvent(active, {
      kind: 'text',
      target: adapter.describeElement(event.target),
      source,
      value: recordedValue(
        adapter.readElementValue(event.target),
        sensitive,
        active.session.sensitiveInputPolicy,
      ),
      sensitive,
      ...(sensitiveReason === null ? {} : { sensitiveReason }),
      timestamp: getNow(),
    });
  }

  function capturePointer(
    active: ActiveRecorderSession<TElement>,
    phase: RecorderPointerEventPhase,
    event: RecorderPointerEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return;
    }

    enqueueEvent(active, {
      kind: 'pointer',
      phase,
      target: adapter.describeElement(event.target),
      timestamp: getNow(),
      clientX: event.clientX,
      clientY: event.clientY,
      ...(event.pageX === undefined ? {} : { pageX: event.pageX }),
      ...(event.pageY === undefined ? {} : { pageY: event.pageY }),
      button: event.button,
      buttons: event.buttons,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
    });
  }

  function captureSelection(active: ActiveRecorderSession<TElement>): void {
    if (!isCurrent(active)) {
      return;
    }

    const selection = adapter.readSelection();
    enqueueEvent(active, {
      kind: 'selection',
      timestamp: getNow(),
      selectedText: selection.selectedText,
      ...optionalSelectionTarget(adapter, 'activeTarget', selection.activeTarget),
      ...optionalSelectionTarget(adapter, 'anchorTarget', selection.anchorTarget),
      ...optionalSelectionTarget(adapter, 'focusTarget', selection.focusTarget),
    });
  }

  function captureDrag(
    active: ActiveRecorderSession<TElement>,
    phase: RecorderDragEventPhase,
    event: RecorderDragEvent<TElement>,
  ): void {
    if (!isCurrent(active) || event.target === null) {
      return;
    }

    enqueueEvent(active, {
      kind: 'drag',
      phase,
      target: adapter.describeElement(event.target),
      timestamp: getNow(),
      clientX: event.clientX,
      clientY: event.clientY,
      ...(event.pageX === undefined ? {} : { pageX: event.pageX }),
      ...(event.pageY === undefined ? {} : { pageY: event.pageY }),
    });
  }

  function enqueueEvent(active: ActiveRecorderSession<TElement>, event: RawRecordedEvent): void {
    active.pendingEvents.push(event);
    if (options.autoFlush !== false) {
      queueFlush(active, 'incremental');
    }
  }

  function queueFlush(
    active: ActiveRecorderSession<TElement>,
    reason: RecorderEventFlushReason,
  ): void {
    if (active.pendingEvents.length === 0) {
      return;
    }

    const flushEvents = options.flushEvents;
    const events = active.pendingEvents;
    active.pendingEvents = [];

    if (flushEvents === undefined) {
      return;
    }

    const flush = {
      ...active.session,
      reason,
      events,
    } satisfies RecorderEventFlush;

    active.flushChain = active.flushChain.then(async () => {
      try {
        await flushEvents(flush);
      } catch (error) {
        active.flushIssue ??= {
          code: 'recorder_error',
          message: 'Recorder events could not be flushed.',
          details: {
            sessionId: active.session.sessionId,
            reason,
            error: errorMessage(error),
          },
        };
      }
    });
  }

  function cleanup(active: ActiveRecorderSession<TElement>): void {
    if (active.cleaned) {
      return;
    }

    active.cleaned = true;
    for (const disposeListener of active.disposers) {
      disposeListener();
    }

    if (activeSession === active) {
      activeSession = null;
    }
  }

  function isCurrent(active: ActiveRecorderSession<TElement>): boolean {
    return activeSession === active && !active.cleaned;
  }

  return {
    start,
    stop,
    dispose,
  };
}

function optionalSelectionTarget<TElement>(
  adapter: RecorderEventCaptureAdapter<TElement>,
  key: 'activeTarget' | 'anchorTarget' | 'focusTarget',
  element: TElement | null | undefined,
): Partial<Pick<RawRecordedSelectionEvent, 'activeTarget' | 'anchorTarget' | 'focusTarget'>> {
  if (element === undefined || element === null) {
    return {};
  }

  return {
    [key]: adapter.describeElement(element),
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type SensitiveInputMetadata = Readonly<{
  inputType?: string;
  id?: string;
  name?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  autocomplete?: string;
}>;

export function detectSensitiveInputReason(
  metadata: SensitiveInputMetadata,
): RecorderSensitiveInputReason | null {
  if (metadata.inputType?.toLowerCase() === 'password') {
    return 'password_type';
  }

  const haystack = [
    metadata.id,
    metadata.name,
    metadata.ariaLabel,
    metadata.labelText,
    metadata.placeholder,
    metadata.autocomplete,
  ]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join(' ');

  if (secretLikePattern.test(haystack)) {
    return 'secret_like_field';
  }

  return null;
}

function recordedValue(
  value: string,
  sensitive: boolean,
  policy: RecorderSensitiveInputPolicy,
): string {
  if (!sensitive || policy === 'plain') {
    return value;
  }

  return policy === 'omit' ? '' : RECORDER_MASKED_VALUE;
}

const secretLikePattern =
  /(^|[^a-z0-9])(pass(word|code|phrase)?|passwd|secret|token|api[-_\s]?key|credential|private[-_\s]?key|otp|one[-_\s]?time)([^a-z0-9]|$)/i;
