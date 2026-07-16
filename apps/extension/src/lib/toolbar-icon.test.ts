import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';

import type { HiddenSummary } from './messaging';

// The storage-backed collaborators are mocked so the test controls the resolved
// state directly; the REAL resolveActionIconState + path building run, so a
// wrong state→PNG mapping still fails here.
vi.mock('./settings', () => ({ getSettings: vi.fn() }));
vi.mock('./pause', () => ({
  getPauseState: vi.fn(),
  isHostSnoozed: vi.fn(),
  isHostDisabledUntilUpdate: vi.fn(),
}));

import { getSettings } from './settings';
import { getPauseState, isHostDisabledUntilUpdate, isHostSnoozed } from './pause';
import { refreshActiveTabs, refreshTabById, refreshTabIcon } from './toolbar-icon';

const setIcon = vi.fn();
const setBadgeText = vi.fn();

const TAB = 7;
const PAGE = 'https://example.com/x';

function makeHidden(over: Partial<HiddenSummary> = {}): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang: null,
    userOverride: false,
    switchSuppressed: false,
    ...over,
  };
}

function seedSettings(over: Partial<MovarSettings> = {}): void {
  vi.mocked(getSettings).mockResolvedValue({ ...defaultSettings, allowlist: [], ...over });
}

function pathFor(state: string): Record<string, string> {
  return {
    '16': `icon/state/${state}-16.png`,
    '32': `icon/state/${state}-32.png`,
    '48': `icon/state/${state}-48.png`,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
  seedSettings({ enabled: true });
  vi.mocked(getPauseState).mockResolvedValue({ paused: false, until: null, indefinite: false });
  vi.mocked(isHostSnoozed).mockResolvedValue(null);
  vi.mocked(isHostDisabledUntilUpdate).mockResolvedValue(false);
  // fakeBrowser ships no `action` namespace — inject spies for setIcon/setBadgeText.
  (browser as unknown as { action: unknown }).action = { setIcon, setBadgeText };
  setIcon.mockClear();
  setBadgeText.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshTabIcon', () => {
  it('sets the blocking icon + count badge when the content script is concealing', async () => {
    // `tabs.sendMessage`'s 2-arg overload types its response as void; the real
    // call carries a HiddenSummary, so cast past the over-narrow mock signature.
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(
      makeHidden({ feedCurtained: 2, languages: ['ru'] }) as never,
    );

    await refreshTabIcon(TAB, PAGE);

    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('blocking') });
    // count = languages(1) + containers(0) + feedCurtained(2) + feedHidden(0) = 3
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '3' });
  });

  it('sets the attention icon (no badge) when no content script answers', async () => {
    vi.spyOn(browser.tabs, 'sendMessage').mockRejectedValue(new Error('no receiver'));

    await refreshTabIcon(TAB, PAGE);

    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('attention') });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '' });
  });

  it('sets the off icon when globally disabled', async () => {
    seedSettings({ enabled: false });
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(makeHidden() as never);

    await refreshTabIcon(TAB, PAGE);

    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('off') });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '' });
  });

  it('uses a pushed summary without querying the tab', async () => {
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage');

    await refreshTabIcon(TAB, PAGE, makeHidden({ feedHidden: 5 }));

    expect(sendMessage).not.toHaveBeenCalled();
    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('blocking') });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '5' });
  });

  it('sets the exempt icon when the host was turned off from the crash screen', async () => {
    // Crash-disabled folds into `exempt` alongside the permanent allowlist
    // (mirrors the popup's resolvePopupView) — even though the fixture
    // concealed things, the site-level exemption wins.
    vi.mocked(isHostDisabledUntilUpdate).mockResolvedValue(true);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(
      makeHidden({ feedCurtained: 2, languages: ['ru'] }) as never,
    );

    await refreshTabIcon(TAB, PAGE);

    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('exempt') });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '' });
  });

  it('sets the active icon on a non-web tab without querying', async () => {
    const sendMessage = vi.spyOn(browser.tabs, 'sendMessage');

    await refreshTabIcon(TAB, 'chrome://newtab');

    expect(sendMessage).not.toHaveBeenCalled();
    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('active') });
    expect(setBadgeText).toHaveBeenCalledWith({ tabId: TAB, text: '' });
  });
});

describe('refreshTabById', () => {
  it('looks up the tab by id, then refreshes its icon', async () => {
    vi.spyOn(browser.tabs, 'get').mockResolvedValue({ id: TAB, url: PAGE } as never);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(makeHidden() as never);

    await refreshTabById(TAB);

    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('active') });
  });

  it('is a no-op when the tab vanished before it could be read', async () => {
    vi.spyOn(browser.tabs, 'get').mockRejectedValue(new Error('No tab with id: 7'));

    await expect(refreshTabById(TAB)).resolves.toBeUndefined();
    expect(setIcon).not.toHaveBeenCalled();
  });
});

describe('refreshActiveTabs', () => {
  it('refreshes every active tab across windows, skipping ids we cannot target', async () => {
    const OTHER_TAB = 8;
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([
      { id: TAB, url: PAGE },
      // A tab Chrome reports without an id (rare, but the type allows it) —
      // there's no tabId to call setIcon with, so it's skipped rather than
      // throwing.
      { id: undefined, url: PAGE },
      { id: OTHER_TAB, url: 'chrome://newtab' },
    ] as never);
    vi.spyOn(browser.tabs, 'sendMessage').mockResolvedValue(makeHidden() as never);

    await refreshActiveTabs();

    expect(setIcon).toHaveBeenCalledTimes(2);
    expect(setIcon).toHaveBeenCalledWith({ tabId: TAB, path: pathFor('active') });
    expect(setIcon).toHaveBeenCalledWith({ tabId: OTHER_TAB, path: pathFor('active') });
  });
});
