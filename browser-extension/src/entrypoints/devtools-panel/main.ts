import { browser } from 'wxt/browser';
import {
  isActorbleExtensionMessage,
  type ActorbleExtensionMessageByKind,
} from '../../messaging/index.js';
import {
  createDevtoolsTracePanelStore,
  type DevtoolsCapabilityRow,
  type DevtoolsFrameSurfaceRow,
  type DevtoolsLocatorDiagnosticView,
  type DevtoolsTracePanelRunView,
  type RuntimeStatusSnapshot,
  type RuntimeTraceDataSnapshot,
  type RuntimeTraceEventSnapshot,
  type RuntimeTraceSpanSnapshot,
  type RuntimeTraceWarningSnapshot,
} from '../../trace/index.js';

const store = createDevtoolsTracePanelStore({
  historyLimit: 500,
  runLimit: 40,
});

const connectionState = requiredElement<HTMLElement>('#connection-state');
const runCount = requiredElement<HTMLElement>('#run-count');
const runList = requiredElement<HTMLUListElement>('#run-list');
const runSummary = requiredElement<HTMLElement>('#run-summary');
const runStatus = requiredElement<HTMLElement>('#run-status');
const spanCount = requiredElement<HTMLElement>('#span-count');
const eventCount = requiredElement<HTMLElement>('#event-count');
const snapshotCount = requiredElement<HTMLElement>('#snapshot-count');
const warningCount = requiredElement<HTMLElement>('#warning-count');
const capabilityList = requiredElement<HTMLElement>('#capability-list');
const surfaceList = requiredElement<HTMLElement>('#surface-list');
const locatorList = requiredElement<HTMLUListElement>('#locator-list');
const spanList = requiredElement<HTMLUListElement>('#span-list');
const eventList = requiredElement<HTMLUListElement>('#event-list');
const snapshotList = requiredElement<HTMLUListElement>('#snapshot-list');
const warningList = requiredElement<HTMLUListElement>('#warning-list');
const traceJson = requiredElement<HTMLPreElement>('#trace-json');

runList.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
    'button[data-run-id]',
  );

  if (button?.dataset.runId === undefined) {
    return;
  }

  if (store.selectRun(button.dataset.runId)) {
    render();
  }
});

try {
  browser.runtime.onMessage.addListener((message) => {
    if (!isActorbleExtensionMessage(message)) {
      return;
    }

    if (message.kind === 'runtime:status') {
      store.ingestStatus(statusSnapshotFromMessage(message.payload));
      render();
      return;
    }

    if (message.kind === 'trace:event') {
      store.ingestEvent(message.payload.event);
      render();
    }
  });
} catch (error) {
  connectionState.textContent = 'Unsupported';
  connectionState.dataset.status = 'failed';
  runSummary.textContent = `DevTools runtime subscription failed: ${errorMessage(error)}`;
}

render();

function render(): void {
  const snapshot = store.getSnapshot();
  const selectedRun = snapshot.selectedRun;

  connectionState.textContent = 'Listening';
  connectionState.dataset.status = 'running';
  runCount.textContent = `${snapshot.runs.length}`;
  renderRunList(snapshot.runs);
  runSummary.textContent = snapshot.summary;
  applyStatus(runStatus, selectedRun?.status.status ?? 'idle');
  spanCount.textContent = `${selectedRun?.traceSummary.spans ?? 0}`;
  eventCount.textContent = `${selectedRun?.traceSummary.events ?? 0}`;
  snapshotCount.textContent = `${selectedRun?.traceSummary.snapshots ?? 0}`;
  warningCount.textContent = `${selectedRun?.traceSummary.warnings ?? 0}`;
  renderKeyValueList(capabilityList, selectedRun?.capabilityRows ?? [], capabilityRow);
  renderKeyValueList(surfaceList, selectedRun?.frameSurfaceRows ?? [], surfaceRow);
  renderDetailList(
    locatorList,
    selectedRun?.locatorDiagnostics ?? [],
    locatorRow,
    'No locator diagnostics',
  );
  renderDetailList(spanList, selectedRun?.debugSnapshot?.trace.spans ?? [], spanRow, 'No spans');
  renderDetailList(
    eventList,
    selectedRun?.debugSnapshot?.trace.events ?? [],
    eventRow,
    'No trace events',
  );
  renderDetailList(
    snapshotList,
    selectedRun?.debugSnapshot?.trace.snapshots ?? [],
    snapshotRow,
    'No snapshots',
  );
  renderDetailList(
    warningList,
    selectedRun?.debugSnapshot?.trace.warnings ?? [],
    warningRow,
    'No warnings',
  );
  traceJson.textContent =
    selectedRun?.debugSnapshot === undefined
      ? 'No debug snapshot'
      : JSON.stringify(selectedRun.debugSnapshot, null, 2);
}

function renderRunList(runs: readonly DevtoolsTracePanelRunView[]): void {
  runList.replaceChildren();

  if (runs.length === 0) {
    runList.append(emptyItem('No runs observed'));
    return;
  }

  for (const run of runs) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const title = document.createElement('span');
    const meta = document.createElement('span');
    const status = document.createElement('span');

    button.type = 'button';
    button.dataset.runId = run.runId;
    button.setAttribute('aria-pressed', String(run.selected));
    button.className = run.selected ? 'selected' : '';
    title.className = 'run-title';
    title.textContent = run.scenarioId ?? run.runId;
    meta.className = 'run-meta';
    meta.textContent = `${run.runId} · ${run.eventCount} events`;
    status.className = 'status-dot';
    status.dataset.status = run.status.status;
    status.textContent = run.status.status;

    button.append(title, meta, status);
    item.append(button);
    runList.append(item);
  }
}

function renderKeyValueList<TItem>(
  list: HTMLElement,
  items: readonly TItem[],
  rowFor: (item: TItem) => Readonly<{ label: string; value: string }>,
): void {
  list.replaceChildren();

  if (items.length === 0) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    term.textContent = 'State';
    detail.textContent = 'No data';
    row.append(term, detail);
    list.append(row);
    return;
  }

  for (const item of items) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const detail = document.createElement('dd');
    const view = rowFor(item);

    term.textContent = view.label;
    detail.textContent = view.value;
    row.append(term, detail);
    list.append(row);
  }
}

function renderDetailList<TItem>(
  list: HTMLUListElement,
  items: readonly TItem[],
  rowFor: (item: TItem) => Readonly<{ title: string; detail: string }>,
  emptyText: string,
): void {
  list.replaceChildren();

  if (items.length === 0) {
    list.append(emptyItem(emptyText));
    return;
  }

  for (const item of items) {
    const row = rowFor(item);
    const element = document.createElement('li');
    const title = document.createElement('span');
    const detail = document.createElement('span');

    title.className = 'detail-title';
    title.textContent = row.title;
    detail.className = 'detail-meta';
    detail.textContent = row.detail;
    element.append(title, detail);
    list.append(element);
  }
}

function statusSnapshotFromMessage(
  payload: ActorbleExtensionMessageByKind<'runtime:status'>['payload'],
): RuntimeStatusSnapshot {
  return {
    runId: payload.runId,
    scenarioId: payload.scenarioId,
    tabId: payload.tabId,
    ...(payload.frameId === undefined ? {} : { frameId: payload.frameId }),
    status: payload.status,
    updatedAt: Date.now(),
    ...(payload.message === undefined ? {} : { message: payload.message }),
    ...(payload.debugSnapshot === undefined ? {} : { debugSnapshot: payload.debugSnapshot }),
  };
}

function applyStatus(element: HTMLElement, status: RuntimeStatusSnapshot['status']): void {
  element.textContent = capitalize(status);
  element.dataset.status = status;
}

function capabilityRow(row: DevtoolsCapabilityRow): Readonly<{ label: string; value: string }> {
  return {
    label: `${capitalize(row.source)} · ${row.label}`,
    value: row.value,
  };
}

function surfaceRow(row: DevtoolsFrameSurfaceRow): Readonly<{ label: string; value: string }> {
  return row;
}

function locatorRow(
  row: DevtoolsLocatorDiagnosticView,
): Readonly<{ title: string; detail: string }> {
  return {
    title: `${row.name} · ${row.candidateCount} candidates`,
    detail: `${row.ambiguity}${row.locator === undefined ? '' : ` · ${row.locator}`}`,
  };
}

function spanRow(span: RuntimeTraceSpanSnapshot): Readonly<{ title: string; detail: string }> {
  const duration =
    span.endedAt === undefined ? 'open' : `${Math.round(span.endedAt - span.startedAt)}ms`;
  const error = span.error === undefined ? '' : ` · ${span.error.message}`;

  return {
    title: `${span.name} · ${span.status}`,
    detail: `${span.id} · ${duration}${error}`,
  };
}

function eventRow(event: RuntimeTraceEventSnapshot): Readonly<{ title: string; detail: string }> {
  return {
    title: event.name,
    detail: `${Math.round(event.at)}${event.spanId === undefined ? '' : ` · ${event.spanId}`}`,
  };
}

function snapshotRow(
  snapshot: RuntimeTraceDataSnapshot,
): Readonly<{ title: string; detail: string }> {
  return {
    title: snapshot.name,
    detail: compactJson(snapshot.data),
  };
}

function warningRow(
  warning: RuntimeTraceWarningSnapshot,
): Readonly<{ title: string; detail: string }> {
  return {
    title: warning.message,
    detail:
      warning.details === undefined ? `${Math.round(warning.at)}` : compactJson(warning.details),
  };
}

function emptyItem(text: string): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'empty';
  item.textContent = text;
  return item;
}

function compactJson(value: unknown): string {
  const json = JSON.stringify(value);
  return json.length <= 160 ? json : `${json.slice(0, 157)}...`;
}

function requiredElement<TElement extends HTMLElement>(selector: string): TElement {
  const element = document.querySelector<TElement>(selector);

  if (element === null) {
    throw new Error(`Missing DevTools panel element: ${selector}`);
  }

  return element;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
