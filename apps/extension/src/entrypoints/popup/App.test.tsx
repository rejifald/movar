import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { messagesUk } from '../../lib/i18n/messages-uk';
import type { HiddenSummary } from '../../lib/messaging';
import { App } from './App';

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
};

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
