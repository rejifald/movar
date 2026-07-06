import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';
import { getPauseState } from '../../lib/pause';
import { usePopupController } from './use-popup-controller';

/** The controller only reads `id` + `url` off the active tab. wxt's
 *  fake-browser types `tabs.query`/`tabs.sendMessage` as `Promise<void>`, so the
 *  spies are widened to their real resolved shapes (mirrors the spy widening in
 *  lib/lang-detect-bridge.test.ts). */
interface QueriedTab {
  id: number;
  url?: string;
}
type QuerySpy = MockInstance<(...args: unknown[]) => Promise<QueriedTab[]>>;
type SendMessageSpy = MockInstance<(id: number, msg: unknown) => Promise<HiddenSummary | null>>;

const hiddenSummary: HiddenSummary = {
  languages: ['ru'],
  containers: 1,
  feedCurtained: 0,
  feedHidden: 0,
  pageLang: 'ru',
  userOverride: false,
  switchSuppressed: false,
};

/** Read the enforced settings back out of sync storage. */
async function storedSettings(): Promise<MovarSettings> {
  return (await fakeBrowser.storage.sync.get('settings'))['settings'] as MovarSettings;
}

/** Flush the microtask queue inside `act` so a fire-and-forget handler's async
 *  chain (the `() => void handleX()` controllers) advances and React applies the
 *  resulting state updates without an "update not wrapped in act" warning. */
async function flushEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

const TAB_ID = 42;

/** Seed an active http(s) tab + a settings snapshot, then mount the hook and
 *  wait for the async bootstrap to land. The fake's `tabs.query` doesn't model
 *  active-tab selection, so the active tab is supplied via the query spy. */
async function mount(
  settings: Partial<MovarSettings> = {},
  url: string | null = 'https://example.com/',
) {
  await fakeBrowser.storage.sync.set({ settings: { ...defaultSettings, ...settings } });
  const tab = url == null ? { id: TAB_ID } : { id: TAB_ID, url };
  querySpy.mockResolvedValue([tab]);
  const view = renderHook(() => usePopupController());
  await waitFor(() => {
    expect(view.result.current.settings).not.toBe(defaultSettings);
  });
  return view;
}

let closeSpy: ReturnType<typeof vi.spyOn>;
let reloadSpy: ReturnType<typeof vi.spyOn>;
let sendMessageSpy: SendMessageSpy;
let openOptionsSpy: ReturnType<typeof vi.spyOn>;
let querySpy: QuerySpy;

beforeEach(() => {
  fakeBrowser.reset();
  closeSpy = vi.spyOn(globalThis, 'close').mockImplementation(() => {});
  reloadSpy = vi.spyOn(browser.tabs, 'reload').mockResolvedValue();
  // Default: content script absent (getHidden/restoreHidden resolve to null).
  sendMessageSpy = vi.spyOn(browser.tabs, 'sendMessage');
  sendMessageSpy.mockResolvedValue(null);
  openOptionsSpy = vi.spyOn(browser.runtime, 'openOptionsPage').mockResolvedValue();
  // The fake's tabs.query ignores the active/currentWindow filter; each test's
  // mount() seeds the active tab through this spy.
  // `tabs.query` has overloaded signatures (the callback overload returns
  // void), so the spy's Mock type needs an explicit widening to a single
  // promise-returning signature.
  querySpy = vi.spyOn(browser.tabs, 'query') as unknown as QuerySpy;
  querySpy.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('usePopupController bootstrap', () => {
  it('loads settings, pause, hidden snapshot, and report url on mount', async () => {
    sendMessageSpy.mockResolvedValue(hiddenSummary);
    const { result } = await mount({ enabled: false, priority: ['en'] }, 'https://news.example/a');

    expect(result.current.settings.enabled).toBe(false);
    expect(result.current.settings.priority).toEqual(['en']);
    await waitFor(() => {
      expect(result.current.hidden).toEqual(hiddenSummary);
    });
    expect(result.current.reportUrl).toBe('https://news.example/a');
    expect(result.current.pause.paused).toBe(false);
    // getHidden was requested from the active tab.
    expect(sendMessageSpy).toHaveBeenCalledWith(expect.any(Number), { type: 'movar:getHidden' });
  });

  it('reports a null report url on a non-web tab', async () => {
    const { result } = await mount({ priority: ['en'] }, 'chrome://newtab');
    expect(result.current.reportUrl).toBeNull();
  });

  it('tolerates there being no active tab at all', async () => {
    // query → [] means activeTabId() is undefined: no sendMessage, null hidden,
    // null reportUrl — and onReloadTab still closes the popup.
    await fakeBrowser.storage.sync.set({ settings: { ...defaultSettings, priority: ['en'] } });
    querySpy.mockResolvedValue([]);
    const { result } = renderHook(() => usePopupController());

    await waitFor(() => {
      expect(result.current.settings.priority).toEqual(['en']);
    });
    expect(result.current.hidden).toBeNull();
    expect(result.current.reportUrl).toBeNull();
    expect(sendMessageSpy).not.toHaveBeenCalled();

    result.current.onReloadTab();
    await flushEffects();
    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
    // No active tab → nothing to reload.
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('onTurnOn', () => {
  it('enables Movar globally, persists, reloads the tab and closes the popup', async () => {
    const { result } = await mount({ enabled: false, priority: ['en'] });

    result.current.onTurnOn();
    await flushEffects();

    await waitFor(async () => {
      expect((await storedSettings()).enabled).toBe(true);
    });
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('onToggleContentModification', () => {
  it('persists the new contentModification flag', async () => {
    const { result } = await mount({ contentModification: false, priority: ['en'] });

    result.current.onToggleContentModification(true);
    await flushEffects();

    await waitFor(async () => {
      expect((await storedSettings()).contentModification).toBe(true);
    });
    expect(result.current.settings.contentModification).toBe(true);
    // A pure setting flip must not reload the tab.
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

describe('onPause / onResume', () => {
  it('onPause persists a pause and reflects it in state', async () => {
    const { result } = await mount({ priority: ['en'] });

    result.current.onPause('indefinite');
    await flushEffects();

    await waitFor(() => {
      expect(result.current.pause.paused).toBe(true);
    });
    expect(result.current.pause.indefinite).toBe(true);
    expect((await getPauseState()).paused).toBe(true);
  });

  it('onResume clears an existing pause', async () => {
    const { result } = await mount({ priority: ['en'] });
    result.current.onPause('indefinite');
    await flushEffects();
    await waitFor(() => {
      expect(result.current.pause.paused).toBe(true);
    });

    result.current.onResume();
    await flushEffects();

    await waitFor(() => {
      expect(result.current.pause.paused).toBe(false);
    });
    expect((await getPauseState()).paused).toBe(false);
  });
});

describe('onRestore', () => {
  it('sends restoreHidden to the active tab and stores the returned snapshot', async () => {
    const restored: HiddenSummary = {
      ...hiddenSummary,
      languages: [],
      containers: 0,
      userOverride: true,
    };
    const { result } = await mount({ priority: ['en'] });
    sendMessageSpy.mockResolvedValue(restored);

    result.current.onRestore();
    await flushEffects();

    await waitFor(() => {
      expect(result.current.hidden).toEqual(restored);
    });
    expect(sendMessageSpy).toHaveBeenCalledWith(expect.any(Number), {
      type: 'movar:restoreHidden',
    });
  });
});

describe('onEnableForSite', () => {
  it('drops allowlist entries matching the active host, persists, reloads', async () => {
    const { result } = await mount(
      { priority: ['en'], allowlist: ['example.com', 'other.org'] },
      'https://www.example.com/page',
    );

    result.current.onEnableForSite();
    await flushEffects();

    await waitFor(async () => {
      expect((await storedSettings()).allowlist).toEqual(['other.org']);
    });
    // Un-exempting only takes effect after a reload.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('is a no-op on a non-web tab (no report url)', async () => {
    const { result } = await mount(
      { priority: ['en'], allowlist: ['example.com'] },
      'chrome://newtab',
    );

    result.current.onEnableForSite();
    await flushEffects();

    // Nothing reloaded, allowlist untouched.
    expect(reloadSpy).not.toHaveBeenCalled();
    expect((await storedSettings()).allowlist).toEqual(['example.com']);
  });
});

describe('onReloadTab', () => {
  it('reloads the active tab and closes the popup', async () => {
    const { result } = await mount({ priority: ['en'] });

    result.current.onReloadTab();
    await flushEffects();

    await waitFor(() => {
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('still closes the popup when the tab refuses to reload (chrome:// / store)', async () => {
    // reloadActiveTab swallows a reload rejection — the setting already
    // persisted, so it closes regardless.
    reloadSpy.mockRejectedValue(new Error('cannot reload this tab'));
    const { result } = await mount({ priority: ['en'] });

    result.current.onReloadTab();
    await flushEffects();

    await waitFor(() => {
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});

describe('onRetrySwitch', () => {
  it('asks the content script to clear its guards, then reloads and closes', async () => {
    const { result } = await mount({ priority: ['en'] });

    result.current.onRetrySwitch();
    await flushEffects();

    await waitFor(() => {
      expect(sendMessageSpy).toHaveBeenCalledWith(expect.any(Number), {
        type: 'movar:retrySwitch',
      });
    });
    // A fresh document_start pass (post-reload) is what re-runs the switch ladder.
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

describe('onRestore (no content script)', () => {
  it('swallows a sendMessage rejection and leaves the hidden snapshot null', async () => {
    const { result } = await mount({ priority: ['en'] });
    // restoreHidden goes to a tab with no listener — the reject is caught.
    sendMessageSpy.mockRejectedValue(new Error('no receiving end'));

    result.current.onRestore();
    await flushEffects();

    await waitFor(() => {
      expect(sendMessageSpy).toHaveBeenCalledWith(expect.any(Number), {
        type: 'movar:restoreHidden',
      });
    });
    expect(result.current.hidden).toBeNull();
  });
});

describe('onOpenSettings', () => {
  it('opens the options page', async () => {
    const { result } = await mount({ priority: ['en'] });

    result.current.onOpenSettings();
    await flushEffects();

    await waitFor(() => {
      expect(openOptionsSpy).toHaveBeenCalledTimes(1);
    });
  });

  it('swallows an openOptionsPage failure without throwing', async () => {
    // The catch arm: opening options is best-effort; a rejection must not
    // bubble out of the handler.
    openOptionsSpy.mockRejectedValue(new Error('no options page'));
    const { result } = await mount({ priority: ['en'] });

    result.current.onOpenSettings();
    await flushEffects();

    await waitFor(() => {
      expect(openOptionsSpy).toHaveBeenCalledTimes(1);
    });
    // Hook is still alive and usable.
    expect(result.current.settings.priority).toEqual(['en']);
  });
});

describe('per-site snooze', () => {
  it('onSnoozeSite snoozes the active host and exposes the until', async () => {
    const { result } = await mount({ priority: ['en'] }, 'https://news.example/a');
    expect(result.current.snoozedUntil).toBeNull();

    result.current.onSnoozeSite();
    await flushEffects();
    await waitFor(() => {
      expect(result.current.snoozedUntil).not.toBeNull();
    });
    const map = (await fakeBrowser.storage.local.get('movar:snoozedHosts'))['movar:snoozedHosts'];
    expect(map).toHaveProperty('news.example');
  });

  it('reads the active host snooze on bootstrap', async () => {
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { 'news.example': Date.now() + 3_600_000 },
    });
    const { result } = await mount({ priority: ['en'] }, 'https://news.example/a');
    expect(result.current.snoozedUntil).not.toBeNull();
  });

  it('onResumeSite clears the active host snooze', async () => {
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { 'news.example': Date.now() + 3_600_000 },
    });
    const { result } = await mount({ priority: ['en'] }, 'https://news.example/a');
    expect(result.current.snoozedUntil).not.toBeNull();

    result.current.onResumeSite();
    await flushEffects();
    await waitFor(() => {
      expect(result.current.snoozedUntil).toBeNull();
    });
    const map = (await fakeBrowser.storage.local.get('movar:snoozedHosts'))['movar:snoozedHosts'];
    expect(map).toEqual({});
  });

  it('is a no-op on a non-web tab (no host to snooze)', async () => {
    const { result } = await mount({ priority: ['en'] }, 'chrome://newtab');
    result.current.onSnoozeSite();
    await flushEffects();
    expect(result.current.snoozedUntil).toBeNull();
    expect(await fakeBrowser.storage.local.get('movar:snoozedHosts')).toEqual({});
  });
});
