import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn, messagesUk } from '@movar/i18n';
import type { HiddenSummary } from '../../lib/messaging';
import type { PauseState } from '../../lib/pause';
import { App, resolvePopupView } from './App';

const TAB_ID = 7;

/** The popup only reads `id` + `url` off the active tab. wxt's fake-browser
 *  types `tabs.query` as returning `Promise<void>`, so widen the spy to a real
 *  resolved tab list (mirrors lib/lang-detect-bridge.test.ts's spy widening). */
interface QueriedTab {
  id: number;
  url?: string;
}
type TabsQuerySpy = MockInstance<(...args: unknown[]) => Promise<QueriedTab[]>>;
function spyTabsQuery(): TabsQuerySpy {
  // `tabs.query` is typed with overloaded signatures (the callback overload
  // returns void), so the spy's Mock type needs an explicit widening — the
  // return annotation alone can't pick the promise-returning overload.
  return vi.spyOn(browser.tabs, 'query') as unknown as TabsQuerySpy;
}
/** Same widening for `tabs.sendMessage`: the content script replies with a
 *  HiddenSummary, but the fake types the method's result as `Promise<void>`. */
function spyTabsSendMessage(): MockInstance<(id: number, msg: unknown) => Promise<HiddenSummary>> {
  return vi.spyOn(browser.tabs, 'sendMessage');
}

beforeEach(() => {
  fakeBrowser.reset();
  // I18nProvider resolves the locale via getUILanguage; fakeBrowser throws
  // unless it's mocked.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en-US');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function seed(settings: Partial<MovarSettings>, url: string | null): Promise<void> {
  await fakeBrowser.storage.sync.set({ settings: { ...defaultSettings, ...settings } });
  // The fake's tabs.query ignores active/currentWindow, so hand the active tab
  // back through the spy. A null url models a non-web tab (chrome://, store).
  const tab = url == null ? { id: TAB_ID, url: 'chrome://newtab' } : { id: TAB_ID, url };
  spyTabsQuery().mockResolvedValue([tab]);
}

const fullHidden: HiddenSummary = {
  languages: ['ru'],
  containers: 0,
  feedCurtained: 0,
  feedHidden: 0,
  pageLang: 'ru',
  userOverride: false,
  switchSuppressed: false,
};

const NO_PAUSE: PauseState = { paused: false, until: null, indefinite: false };
function settings(o: Partial<MovarSettings> = {}): MovarSettings {
  return { ...defaultSettings, ...o };
}
function hid(o: Partial<HiddenSummary> = {}): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang: null,
    userOverride: false,
    switchSuppressed: false,
    ...o,
  };
}

describe('resolvePopupView', () => {
  it('offers snooze on a fresh web page; a blocked language spawns the blocked hero', () => {
    const view = resolvePopupView(
      settings({ blocked: ['ru'] }),
      NO_PAUSE,
      hid({ pageLang: 'ru' }),
      'https://x.com/',
      null,
    );
    expect(view.exempt).toBe(false);
    expect(view.hero).toEqual({ kind: 'blocked', language: 'ru' });
    expect(view.canSnooze).toBe(true);
  });

  it('shows the snoozed hero and hides the snooze affordance when the host is snoozed', () => {
    const view = resolvePopupView(settings(), NO_PAUSE, hid(), 'https://x.com/', 99);
    expect(view.hero).toEqual({ kind: 'snoozed', until: 99 });
    expect(view.canSnooze).toBe(false);
  });

  it('marks exempt and hides the snooze affordance on an allowlisted site', () => {
    const view = resolvePopupView(
      settings({ allowlist: ['x.com'] }),
      NO_PAUSE,
      hid(),
      'https://x.com/',
      null,
    );
    expect(view.exempt).toBe(true);
    expect(view.canSnooze).toBe(false);
  });

  it('resolves no hero while globally paused or off', () => {
    const paused = resolvePopupView(
      settings(),
      { paused: true, until: null, indefinite: true },
      hid(),
      'https://x.com/',
      null,
    );
    expect(paused.hero).toBeNull();
    const off = resolvePopupView(
      settings({ enabled: false }),
      NO_PAUSE,
      hid(),
      'https://x.com/',
      null,
    );
    expect(off.hero).toBeNull();
  });

  it('offers no snooze on a non-web tab', () => {
    const view = resolvePopupView(settings(), NO_PAUSE, null, null, null);
    expect(view.canSnooze).toBe(false);
    expect(view.exempt).toBe(false);
  });

  it('marks exempt when the host was turned off from the crash screen, even off the allowlist', () => {
    const view = resolvePopupView(settings(), NO_PAUSE, hid(), 'https://x.com/', null, true);
    expect(view.exempt).toBe(true);
    expect(view.canSnooze).toBe(false);
    expect(view.hero).toEqual({ kind: 'exempt', untilUpdate: true });
  });

  it('ignores disabledUntilUpdate on a non-web tab', () => {
    const view = resolvePopupView(settings(), NO_PAUSE, null, null, null, true);
    expect(view.exempt).toBe(false);
  });
});

describe('App', () => {
  it('renders the popup chrome once bootstrap settles (English via en priority)', async () => {
    // priority ['en'] makes uiLanguageFromPriority resolve to English so we can
    // assert against the English catalogue.
    await seed({ priority: ['en'], contentModification: false }, 'https://example.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    });
    // Footer surfaces: settings button + report link.
    expect(screen.getByRole('button', { name: messagesEn.settings })).toBeTruthy();
    expect(screen.getByText(messagesEn.report.link)).toBeTruthy();
  });

  it('marks the active site exempt when its host is on the allowlist', async () => {
    await seed({ priority: ['en'], allowlist: ['example.com'] }, 'https://www.example.com/page');

    render(<App />);

    // exempt → the StatusHeader hero shows the exempt copy + un-exempt CTA.
    await waitFor(() => {
      expect(screen.getByText(messagesEn.pageStatus.exemptTitle)).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: messagesEn.pageStatus.enableSiteCta })).toBeTruthy();
    // No contextual blocked-site report on an exempt site.
    expect(screen.queryByText(messagesEn.report.blockedSite.link)).toBeNull();
  });

  it('shows the contextual blocked-site report when the active page is in a blocked language', async () => {
    // pageLang 'ru' ∈ blocked, no concealment → the hero resolves to `blocked`.
    spyTabsSendMessage().mockResolvedValue({ ...fullHidden, languages: [], pageLang: 'ru' });
    await seed({ priority: ['en'], blocked: ['ru'], contentModification: false }, 'https://x.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.pageStatus.blockedTitle('Russian'))).toBeTruthy();
    });
    const report = screen.getByText(messagesEn.report.blockedSite.link);
    expect(report).toBeTruthy();
    // It's a mailto with the blocked-site prompt — no network.
    expect(report.closest('a')?.getAttribute('href')).toMatch(/^mailto:/);
    // switchSuppressed is false here (fullHidden default) → no retry button; the
    // site simply has no target language to switch to.
    expect(screen.queryByRole('button', { name: messagesEn.pageStatus.retrySwitch })).toBeNull();
  });

  it('offers "Try switching again" on a blocked page when a session guard is suppressing the switch', async () => {
    // switchSuppressed → a prior hiccup or a manual pick is holding the switch
    // back, so the retry (clear the guards + reload) can actually do something.
    spyTabsSendMessage().mockResolvedValue({
      ...fullHidden,
      languages: [],
      pageLang: 'ru',
      switchSuppressed: true,
    });
    await seed({ priority: ['en'], blocked: ['ru'], contentModification: false }, 'https://x.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: messagesEn.pageStatus.retrySwitch })).toBeTruthy();
    });
  });

  it('hides the contextual report when the page is served (not blocked)', async () => {
    // pageLang 'en' ∈ priority → `served` hero, not `blocked`.
    spyTabsSendMessage().mockResolvedValue({ ...fullHidden, languages: [], pageLang: 'en' });
    await seed({ priority: ['en'], blocked: ['ru'], contentModification: false }, 'https://x.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.pageStatus.servedIn('English'))).toBeTruthy();
    });
    expect(screen.queryByText(messagesEn.report.blockedSite.link)).toBeNull();
  });

  it('treats a non-web tab as no-page (reportUrl null → hasPage false)', async () => {
    await seed({ priority: ['en'] }, null); // chrome://newtab → activeTabUrl returns null

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.pageStatus.noPage)).toBeTruthy();
    });
  });

  it('renders the HiddenPanel only when content is hidden and modification is on', async () => {
    spyTabsSendMessage().mockResolvedValue(fullHidden);
    await seed({ priority: ['en'], contentModification: true }, 'https://example.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.hidden.title)).toBeTruthy();
    });
  });

  it('omits the HiddenPanel when content modification is off, even with hidden content', async () => {
    spyTabsSendMessage().mockResolvedValue(fullHidden);
    await seed({ priority: ['en'], contentModification: false }, 'https://example.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    });
    expect(screen.queryByText(messagesEn.hidden.title)).toBeNull();
  });

  it('drives the provider locale from the priority order (Ukrainian default)', async () => {
    // Default priority ['uk', 'en'] → uiLanguageFromPriority picks 'uk'.
    await seed({ priority: ['uk', 'en'] }, 'https://example.com/');

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(messagesUk.contentToggle.label)).toBeTruthy();
    });
  });
});

// iOS's own osLabel/isIOS check runs at module load (see App.tsx's top-level
// `const isIOS = …`), so it can only be exercised by stubbing the UA *before*
// a fresh import — `vi.resetModules()` + dynamic import, same technique
// `content.test.ts` uses for the same reason. A separate describe block keeps
// this reset scoped away from the rest of the suite's static `App` import.
describe('App — iOS Safari sheet fill', () => {
  const IOS_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.cssText = '';
    document.body.style.cssText = '';
  });

  it('fills the native sheet and bumps the type scale on iOS', async () => {
    // `Object.create` (not a `{ ...navigator }` spread) so the stub keeps
    // Navigator's real prototype chain — spreading a class instance would
    // silently drop everything but its own enumerable properties.
    vi.stubGlobal(
      'navigator',
      Object.create(globalThis.navigator, {
        userAgent: { value: IOS_UA, configurable: true },
      }),
    );
    vi.resetModules();
    const { App: IOSApp } = await import('./App');

    await seed({ priority: ['en'], contentModification: false }, 'https://example.com/');
    render(<IOSApp />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    });
    expect(document.documentElement.style.height).toBe('100%');
    expect(document.body.style.height).toBe('100%');
    // Root font-size is a Dynamic-Type-relative percentage (the measured
    // `-apple-system-body` size ÷ 17pt × 115%); it falls back to a flat 115% when
    // the keyword can't be measured (jsdom), so assert the shape, not an exact %.
    expect(document.documentElement.style.fontSize).toMatch(/^[\d.]+%$/);
    // `--text-ui-*` are now rem so they scale with the root (were fixed px).
    expect(document.documentElement.style.getPropertyValue('--text-ui-base')).toBe('0.9rem');
    expect(screen.getByTestId('popup-root').className).toContain('min-h-full w-full');
  });
});
