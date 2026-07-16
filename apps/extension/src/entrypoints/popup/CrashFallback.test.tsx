import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { messagesEn, messagesUk } from '@movar/i18n';
import { isHostDisabledUntilUpdate } from '../../lib/pause';
import { PopupCrashFallback } from './CrashFallback';

/** Mirrors the spy widening in use-popup-controller.test.ts: wxt's fake-browser
 *  types `tabs.query`'s callback overload as `Promise<void>`, so the spy needs
 *  an explicit widening to its real resolved shape. */
type QuerySpy = MockInstance<(...args: unknown[]) => Promise<{ id: number; url?: string }[]>>;

/** Drain a few microtask turns so a fire-and-forget handler's async chain
 *  (browser.tabs.query → the early-return branch) settles before a test
 *  asserts an absence — there's no React state change here for `act()`'s
 *  automatic flushing to key off. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('lang');
});

describe('PopupCrashFallback', () => {
  it('renders the StatusHeader crash hero with the English copy by default', () => {
    render(<PopupCrashFallback />);

    expect(screen.getByText(messagesEn.errorBoundary.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.errorBoundary.description)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.errorBoundary.reload })).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesEn.errorBoundary.turnOffSite })).toBeTruthy();
    // The brand bar identifies the crashed surface as Movar.
    expect(screen.getAllByText('Movar').length).toBeGreaterThan(0);
  });

  it('picks the Ukrainian copy when the document lang is uk', () => {
    document.documentElement.lang = 'uk';
    render(<PopupCrashFallback />);

    expect(screen.getByText(messagesUk.errorBoundary.title)).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesUk.errorBoundary.reload })).toBeTruthy();
    expect(screen.getByRole('button', { name: messagesUk.errorBoundary.turnOffSite })).toBeTruthy();
  });

  it('reloads the popup when the crash hero reload button is clicked', async () => {
    const reload = vi.fn();
    // jsdom's location.reload is non-configurable and throws when called, so it
    // can't be spied directly — mock the `location` getter to hand back a
    // stand-in whose reload is observable (mirrors error-boundary.test).
    const realLocation = globalThis.location as unknown as Record<string, unknown>;
    vi.spyOn(globalThis, 'location', 'get').mockReturnValue({
      ...realLocation,
      reload,
    } as unknown as Location);

    render(<PopupCrashFallback />);
    await userEvent.click(screen.getByRole('button', { name: messagesEn.errorBoundary.reload }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  describe('turn off for this site', () => {
    const TAB_ID = 7;
    let querySpy: QuerySpy;
    let reloadSpy: ReturnType<typeof vi.spyOn>;
    let closeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      fakeBrowser.reset();
      querySpy = vi.spyOn(browser.tabs, 'query') as unknown as QuerySpy;
      reloadSpy = vi.spyOn(browser.tabs, 'reload').mockResolvedValue();
      closeSpy = vi.spyOn(globalThis, 'close').mockImplementation(() => {});
    });

    it('disables the active host until the next update, reloads the tab, and closes the popup', async () => {
      querySpy.mockResolvedValue([{ id: TAB_ID, url: 'https://news.example/a' }]);
      render(<PopupCrashFallback />);

      await userEvent.click(
        screen.getByRole('button', { name: messagesEn.errorBoundary.turnOffSite }),
      );

      await waitFor(async () => {
        expect(await isHostDisabledUntilUpdate('news.example')).toBe(true);
      });
      expect(reloadSpy).toHaveBeenCalledWith(TAB_ID);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('works even with no prior crash-disable state stored', async () => {
      // No storage seeded at all — disableHostUntilUpdate's own map-read
      // tolerates a missing/malformed value; the crash screen must not depend
      // on any live state to make this call.
      querySpy.mockResolvedValue([{ id: TAB_ID, url: 'https://news.example/a' }]);
      render(<PopupCrashFallback />);

      await userEvent.click(
        screen.getByRole('button', { name: messagesEn.errorBoundary.turnOffSite }),
      );

      await waitFor(async () => {
        expect(await isHostDisabledUntilUpdate('news.example')).toBe(true);
      });
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('is a no-op on a non-web tab (no host to disable)', async () => {
      querySpy.mockResolvedValue([{ id: TAB_ID, url: 'chrome://newtab' }]);
      render(<PopupCrashFallback />);

      await userEvent.click(
        screen.getByRole('button', { name: messagesEn.errorBoundary.turnOffSite }),
      );
      await flushMicrotasks();

      expect(reloadSpy).not.toHaveBeenCalled();
      expect(closeSpy).not.toHaveBeenCalled();
    });
  });
});
