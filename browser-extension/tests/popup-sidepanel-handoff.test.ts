import { describe, expect, it } from 'vitest';
import { sidepanelPathForHandoff } from '../src/entrypoints/popup/sidepanel-handoff.js';
import { sidepanelLaunchParamsFromUrl } from '../src/entrypoints/sidepanel/launch-params.js';

describe('popup to sidepanel recorded draft handoff', () => {
  it('adds the recorded draft id to the sidepanel URL without dropping the target tab', () => {
    const path = sidepanelPathForHandoff({
      targetTabId: 7,
      recordedDraftId: 'record-popup-1',
    });

    expect(path).toBe('sidepanel.html?targetTabId=7&recordedDraftId=record-popup-1');
    expect(sidepanelLaunchParamsFromUrl(`chrome-extension://extension-id/${path}`)).toEqual({
      targetTabId: 7,
      recordedDraftId: 'record-popup-1',
    });
  });

  it('omits invalid handoff values from the sidepanel URL', () => {
    expect(
      sidepanelPathForHandoff({
        targetTabId: -1,
        recordedDraftId: '   ',
      }),
    ).toBe('sidepanel.html');
    expect(
      sidepanelLaunchParamsFromUrl(
        'chrome-extension://extension-id/sidepanel.html?targetTabId=0&recordedDraftId=%20',
      ),
    ).toEqual({});
  });
});
