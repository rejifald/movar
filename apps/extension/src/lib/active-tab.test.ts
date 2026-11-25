import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { activeTabId, activeTabUrl, reloadActiveTab } from './active-tab';

interface Tab {
  id?: number;
  url?: string;
}

// fakeBrowser types the tabs API with the callback overload; widen the spies to
// the promise-returning shape the code under test consumes.
function queryReturns(tabs: Tab[]): MockInstance<(...args: unknown[]) => Promise<Tab[]>> {
  const spy = vi.spyOn(browser.tabs, 'query') as unknown as MockInstance<
    (...args: unknown[]) => Promise<Tab[]>
  >;
  spy.mockResolvedValue(tabs);
  return spy;
}

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('activeTabId', () => {
  it('queries the active tab of the current window and returns its id', async () => {
    const query = queryReturns([{ id: 12 }]);
    expect(await activeTabId()).toBe(12);
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('is undefined when there is no active tab', async () => {
    queryReturns([]);
    expect(await activeTabId()).toBeUndefined();
  });
});

describe('activeTabUrl', () => {
  it.each(['https://example.com/a', 'http://example.com', 'HTTPS://EXAMPLE.COM'])(
    'returns an http(s) url: %s',
    async (url) => {
      queryReturns([{ id: 1, url }]);
      expect(await activeTabUrl()).toBe(url);
    },
  );

  it.each([
    'chrome://extensions',
    'about:blank',
    'file:///tmp/a.pdf',
    'chrome-extension://x/a.html',
  ])('returns null for a non-web url: %s', async (url) => {
    queryReturns([{ id: 1, url }]);
    expect(await activeTabUrl()).toBeNull();
  });

  it('returns null when the tab has no url or there is no tab', async () => {
    queryReturns([{ id: 1 }]);
    expect(await activeTabUrl()).toBeNull();
    queryReturns([]);
    expect(await activeTabUrl()).toBeNull();
  });
});

describe('reloadActiveTab', () => {
  let close: MockInstance<() => void>;
  beforeEach(() => {
    close = vi.spyOn(globalThis, 'close').mockImplementation(() => {});
  });

  function reloadSpy(): MockInstance<(...args: unknown[]) => Promise<void>> {
    return vi.spyOn(browser.tabs, 'reload');
  }

  it('reloads the active tab, then closes the popup', async () => {
    queryReturns([{ id: 5 }]);
    const reload = reloadSpy().mockResolvedValue();

    await reloadActiveTab();

    expect(reload).toHaveBeenCalledWith(5);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('still closes the popup when the tab refuses to reload', async () => {
    queryReturns([{ id: 5 }]);
    reloadSpy().mockRejectedValue(new Error('cannot reload'));

    await expect(reloadActiveTab()).resolves.toBeUndefined();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('skips the reload but closes the popup when there is no active tab', async () => {
    queryReturns([]);
    const reload = reloadSpy().mockResolvedValue();

    await reloadActiveTab();

    expect(reload).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
