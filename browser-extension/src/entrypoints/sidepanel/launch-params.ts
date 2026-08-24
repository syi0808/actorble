export type SidepanelLaunchParams = Readonly<{
  targetTabId?: number;
  recordedDraftId?: string;
}>;

export function sidepanelLaunchParamsFromUrl(url: string | URL): SidepanelLaunchParams {
  const parsed = typeof url === 'string' ? new URL(url) : url;
  const targetTabId = positiveIntegerParam(parsed.searchParams.get('targetTabId'));
  const recordedDraftId = compactParam(parsed.searchParams.get('recordedDraftId'));

  return {
    ...(targetTabId === undefined ? {} : { targetTabId }),
    ...(recordedDraftId === undefined ? {} : { recordedDraftId }),
  };
}

function positiveIntegerParam(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function compactParam(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const compact = value.trim();
  return compact.length === 0 ? undefined : compact;
}
