import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type * as LangDetect from '@movar/lang-detect';
import type { DetectedLanguage, SnippetVerdict } from '@movar/lang-detect';
import {
  SETTINGS_KEY,
  installDnr,
  loadBackground,
  stubCommands,
  setIcon,
  setBadgeText,
  stubAction,
} from './background.test-utils';
import type { MessageTriggerEvent, UpdatedTriggerEvent } from './background.test-utils';
import type { HiddenSummary } from '../../lib/messaging';

// Deterministic franc stubs. The dispatch handler routes each message type to
// one of these; mocking both subpaths keeps the worker's responses fixed and
// franc's real trigram tables out of the test. The spies are exposed directly
// as the mocked exports, so a call into franc is a call we can assert on.
//
// Created via `vi.hoisted` so they exist before any import triggers a mock
// factory: `@movar/settings`'s settings migration now imports `@movar/lang-detect`
// transitively, which evaluates the mock below earlier in the module graph than
// plain top-level `const`s would be initialized.
const { detect, classifyBySnippet, getProfiles, warmFranc } = vi.hoisted(() => ({
  detect: vi.fn<(text: string, ctx: unknown) => Promise<DetectedLanguage | null>>(),
  classifyBySnippet: vi.fn<(...args: unknown[]) => SnippetVerdict | null>(),
  getProfiles: vi.fn<(codes: string[]) => unknown>(),
  warmFranc: vi.fn<() => Promise<void>>(),
}));

// Spread the real module so pure helpers like `normalizeLanguageCode` (now
// pulled in transitively via `@movar/settings`'s settings migration) keep
// their real implementation; override only the franc-routed spies we assert on.
vi.mock('@movar/lang-detect', async (importActual) => ({
  ...(await importActual<typeof LangDetect>()),
  classifyBySnippet,
  getProfiles,
}));

vi.mock('@movar/lang-detect/franc', () => ({
  francEngine: { id: 'franc', isAvailable: () => true, detect },
  francRung3Resolver: { id: 'franc-rung3' },
  warmFranc,
}));

const TAB = 42;

/** Stub the uninstall hook for the `uninstall hook` suite below.
 *
 *  `setUninstallURL` is absent on Safari (an App Store app has no uninstall
 *  hook) and absent from fakeBrowser, which is why the worker probes for it
 *  rather than calling it blind. The spy goes onto the SAME `browser` the worker
 *  imports — the reason `installDnr` above spies there and not on `fakeBrowser`
 *  — and the version is pinned, since fakeBrowser's manifest carries none and an
 *  unreleased version deliberately suppresses the query parameter.
 *
 *  `i18n` is stubbed for the same reason the DNR fake exists: fakeBrowser leaves
 *  it unimplemented and reading it throws. The worker resolves the page's locale
 *  through `getUILanguage()`, so without this the call lands in its own catch and
 *  the hook is silently never set — indistinguishable from the Safari no-op. */
function stubUninstallHook(): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async (_url: string) => {});
  Object.assign(browser.runtime, { setUninstallURL: spy });
  vi.spyOn(browser.runtime, 'getManifest').mockReturnValue({
    version: '1.8.1',
  } as ReturnType<typeof browser.runtime.getManifest>);
  Object.assign(browser, { i18n: { getUILanguage: () => 'en-US' } });
  return spy;
}

/** A fully-populated HiddenSummary for the concealment-push tests; the push
 *  handler forwards it straight to refreshTabIcon (no content-script round-trip). */
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

beforeEach(() => {
  fakeBrowser.reset();
  stubCommands();
  stubAction();
  setIcon.mockClear();
  setBadgeText.mockClear();
  installDnr();
  detect.mockReset().mockResolvedValue({ language: 'ru', confidence: 0.9, engine: 'franc' });
  classifyBySnippet
    .mockReset()
    .mockReturnValue({ language: 'ru', margin: 0.3, rung: 3, discriminating: true });
  getProfiles.mockReset().mockReturnValue(['profile']);
  // Resolves with no value — warmFranc is fire-and-forget (Promise<void>).
  warmFranc.mockReset().mockResolvedValue();
});

afterEach(async () => {
  // The worker's listeners run their handlers fire-and-forget (`void
  // resync()` and friends), so a chain can still be in flight when a test's
  // last assertion passes. Drain it BEFORE restoring the DNR mocks —
  // otherwise its tail updateDynamicRules call lands on the unimplemented
  // fake and surfaces as an unhandled rejection outside any test.
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.restoreAllMocks();
});

describe('change subscriptions', () => {
  it('resyncs the DNR rule when settings change', async () => {
    await loadBackground();
    const update = browser.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    update.mockClear();

    await fakeBrowser.storage.onChanged.trigger(
      { [SETTINGS_KEY]: { newValue: defaultSettings } },
      'sync',
    );

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
  });

  it('resyncs the DNR rule when the pause state changes', async () => {
    await loadBackground();
    const update = browser.declarativeNetRequest.updateDynamicRules as ReturnType<typeof vi.fn>;
    update.mockClear();

    await fakeBrowser.storage.onChanged.trigger(
      { 'movar:pausedIndefinitely': { newValue: true } },
      'local',
    );

    await vi.waitFor(() => {
      expect(update).toHaveBeenCalled();
    });
  });
});

describe('movar:hiddenChanged concealment push', () => {
  it('repaints the pushing tab’s toolbar icon straight from the pushed summary', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    await loadBackground();
    // Drop any incidental setIcon from main()'s wake-time refreshActiveTabs.
    setIcon.mockClear();

    const onMessage = fakeBrowser.runtime.onMessage as unknown as MessageTriggerEvent;
    await onMessage.trigger(
      { type: 'movar:hiddenChanged', summary: makeHidden({ languages: ['en'], feedHidden: 2 }) },
      // A live content script → a real sender.tab with an id (the push path).
      { tab: { id: TAB, url: 'https://example.com/', status: 'complete' } },
      () => {},
    );

    await vi.waitFor(() => {
      expect(setIcon).toHaveBeenCalledWith(expect.objectContaining({ tabId: TAB }));
    });
  });

  it('drops a hiddenChanged push whose sender carries no tab id', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    await loadBackground();
    setIcon.mockClear();

    const onMessage = fakeBrowser.runtime.onMessage as unknown as MessageTriggerEvent;
    await onMessage.trigger(
      { type: 'movar:hiddenChanged', summary: makeHidden() },
      {}, // no sender.tab → tabId is undefined, nothing to repaint
      () => {},
    );

    // No tab id → the push never reaches refreshTabIcon.
    await Promise.resolve();
    expect(setIcon).not.toHaveBeenCalled();
  });
});

describe('tabs.onUpdated toolbar-icon repaint', () => {
  it('repaints the tab once its navigation reaches status:complete', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    await loadBackground();
    setIcon.mockClear();

    const onUpdated = fakeBrowser.tabs.onUpdated as unknown as UpdatedTriggerEvent;
    await onUpdated.trigger(
      TAB,
      { status: 'complete' },
      { url: 'https://example.com/', status: 'complete' },
    );

    await vi.waitFor(() => {
      expect(setIcon).toHaveBeenCalledWith(expect.objectContaining({ tabId: TAB }));
    });
  });

  it('repaints on the navigation-commit tick (changeInfo.url) before complete', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    await loadBackground();
    setIcon.mockClear();

    const onUpdated = fakeBrowser.tabs.onUpdated as unknown as UpdatedTriggerEvent;
    // No status:complete, but a URL change — the SPA / same-tab navigation commit.
    await onUpdated.trigger(
      TAB,
      { url: 'https://example.com/next' },
      { url: 'https://example.com/next', status: 'complete' },
    );

    await vi.waitFor(() => {
      expect(setIcon).toHaveBeenCalledWith(expect.objectContaining({ tabId: TAB }));
    });
  });

  it('ignores an onUpdated tick that is neither complete nor a url change', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    await loadBackground();
    setIcon.mockClear();

    const onUpdated = fakeBrowser.tabs.onUpdated as unknown as UpdatedTriggerEvent;
    await onUpdated.trigger(
      TAB,
      { status: 'loading' },
      { url: 'https://example.com/', status: 'loading' },
    );

    // Neither branch of the guard matched → no repaint.
    await Promise.resolve();
    expect(setIcon).not.toHaveBeenCalled();
  });
});

describe('uninstall hook', () => {
  afterEach(() => {
    // Both were assigned onto the shared `browser`, which `fakeBrowser.reset()`
    // does not undo — leaving them would hand every later test an i18n that the
    // real fake does not have.
    delete (browser.runtime as unknown as Record<string, unknown>)['setUninstallURL'];
    delete (browser as unknown as Record<string, unknown>)['i18n'];
  });

  it('points the browser at the exit page in the user’s UI locale', async () => {
    const spy = stubUninstallHook();
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { ...defaultSettings, uiLanguage: 'uk' },
    });

    await loadBackground();

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith('https://movar.fyi/uk/uninstall?v=1.8.1');
    });
  });

  it('carries the version and nothing else', async () => {
    const spy = stubUninstallHook();
    await fakeBrowser.storage.sync.set({
      [SETTINGS_KEY]: { ...defaultSettings, uiLanguage: 'en' },
    });

    await loadBackground();

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    const url = new URL(String(spy.mock.calls[0]?.[0]));
    // .forEach, not .keys(): the repo bans the WebIDL iterators (Firefox Xray).
    const names: string[] = [];
    url.searchParams.forEach((_value, key) => names.push(key));
    expect(names).toEqual(['v']);
    expect(url.pathname).toBe('/uninstall');
  });

  // Safari, and any browser that drops the API: the probe short-circuits and
  // the wake path completes as normal. A throw here would take the DNR resync
  // down with it.
  it('is a no-op where the browser has no uninstall hook', async () => {
    await fakeBrowser.storage.sync.set({ [SETTINGS_KEY]: { ...defaultSettings } });
    await expect(loadBackground()).resolves.toBeUndefined();
  });
});
