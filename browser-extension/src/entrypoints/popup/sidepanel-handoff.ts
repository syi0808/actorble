export type SidepanelHandoffInput = Readonly<{
  targetTabId?: number;
  recordedDraftId?: string;
}>;

export function sidepanelPathForHandoff(input: SidepanelHandoffInput = {}): string {
  const params = new URLSearchParams();

  if (isPositiveInteger(input.targetTabId)) {
    params.set('targetTabId', String(input.targetTabId));
  }

  const recordedDraftId = compactText(input.recordedDraftId);
  if (recordedDraftId !== undefined) {
    params.set('recordedDraftId', recordedDraftId);
  }

  const query = params.toString();
  return query.length === 0 ? 'sidepanel.html' : `sidepanel.html?${query}`;
}

export function recordedDraftIdFromRecordStopResult(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const result = value as Readonly<{
    ok?: unknown;
    value?: unknown;
  }>;
  if (result.ok !== true || !isRecord(result.value)) {
    return undefined;
  }

  const receipt = result.value as Readonly<{
    kind?: unknown;
    recordedDraft?: unknown;
  }>;
  if (receipt.kind !== 'record:stop' || !isRecord(receipt.recordedDraft)) {
    return undefined;
  }

  return compactText((receipt.recordedDraft as Readonly<{ draftId?: unknown }>).draftId);
}

function compactText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const compact = value.trim();
  return compact.length === 0 ? undefined : compact;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
