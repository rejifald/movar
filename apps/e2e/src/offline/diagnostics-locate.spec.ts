/**
 * End-to-end coverage for the popup "Show on page" (locate) button — the full
 * popup → content-script → on-page flash path (Phase 4 of the per-snippet
 * detection design; see docs/per-snippet-language-detection.md).
 *
 * Flow under test:
 *   1. A YouTube-shaped fixture (youtube-divergence.html) whose cards the fast
 *      classifier and the franc cross-check disagree on, so the shadow oracle
 *      records a real DetectionDivergence per card (with a WeakRef to the card).
 *   2. Read the recorded divergence's id via the `movar:getDiagnostics` message.
 *   3. Fire `movar:highlightDivergence` (exactly what the popup button sends),
 *      and assert the content script lays a temporary highlight overlay over the
 *      source card — and reports `{ found: false }` for an unknown id.
 *
 * The messages are driven from the service-worker context rather than the popup:
 * in the offline harness the popup renders as its own tab, so *its* active tab
 * isn't the content page. The SW's `chrome.tabs.sendMessage(contentTabId, …)`
 * hits the same content-script listener the popup's `sendToActiveTab` does, with
 * identical payloads.
 *
 * Deliberately offline + outside the pre-push fast set (like content-script.spec)
 * — it depends on the idle-scheduled oracle drain and runs in the full e2e job.
 */
import type { Worker } from '@playwright/test';
import type { DiagnosticsSummary } from '@movar/shared';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';

/** Resolve the content tab's id from the service-worker context by URL. */
async function tabIdForUrl(sw: Worker, urlSubstring: string): Promise<number | undefined> {
  return sw.evaluate(async (sub) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url?.includes(sub))?.id;
  }, urlSubstring);
}

/** Round-trip a MovarMessage to the content tab via the SW, mirroring the
 *  popup→content bridge. */
async function sendToTab<T>(sw: Worker, tabId: number, message: unknown): Promise<T> {
  return (await sw.evaluate(({ tabId: id, message: m }) => chrome.tabs.sendMessage(id, m), {
    tabId,
    message,
  })) as T;
}

test.describe('popup locate (show on page)', () => {
  test('flashes the divergence source element on the page', async ({
    movarContext,
    movarPage,
    serviceWorker,
    setMovarSettings,
  }) => {
    await setMovarSettings({ uiLanguage: 'en', contentModification: true, diagnostics: true });
    const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-divergence');

    // /feed/trending, not /results: the YouTube enforce rule is path-gated to
    // /results and would redirect (hl=uk), racing the content scan.
    await movarPage.goto('https://www.youtube.com/feed/trending', {
      waitUntil: 'domcontentloaded',
    });
    await waitForMovarSettled(movarPage);
    expect(route.hits).toBeGreaterThanOrEqual(1);

    const tabId = await tabIdForUrl(serviceWorker, 'youtube.com');
    if (tabId === undefined) throw new Error('content tab not found in the service worker');

    // The shadow oracle drains on idle (≤2s). Poll until a divergence lands.
    await expect
      .poll(
        async () => {
          const s = await sendToTab<DiagnosticsSummary>(serviceWorker, tabId, {
            type: 'movar:getDiagnostics',
          });
          return s.total;
        },
        { message: 'expected ≥1 recorded divergence from the fixture', timeout: 8_000 },
      )
      .toBeGreaterThanOrEqual(1);

    const summary = await sendToTab<DiagnosticsSummary>(serviceWorker, tabId, {
      type: 'movar:getDiagnostics',
    });
    const divergenceId = summary.recent[0]?.id;
    expect(divergenceId, 'a divergence id should be present').toBeTruthy();

    // Nothing highlighted yet.
    await expect(movarPage.locator('[data-movar-highlight]')).toHaveCount(0);

    // Fire the exact message the popup's locate button sends.
    const res = await sendToTab<{ found: boolean }>(serviceWorker, tabId, {
      type: 'movar:highlightDivergence',
      id: divergenceId ?? '',
    });
    expect(res).toEqual({ found: true });

    // One synchronous read (the overlay self-removes after ~2s): assert it's in
    // the DOM, has a real box, and overlaps one of the source cards — i.e. the
    // content script targeted the right element, not just painted somewhere.
    const flash = await movarPage.evaluate(() => {
      const overlay = document.querySelector('[data-movar-highlight]');
      if (!overlay) return { present: false, overlaps: false };
      const o = overlay.getBoundingClientRect();
      const overlaps = [...document.querySelectorAll('ytd-video-renderer')].some((card) => {
        const c = card.getBoundingClientRect();
        return o.left < c.right && o.right > c.left && o.top < c.bottom && o.bottom > c.top;
      });
      return { present: o.width > 0 && o.height > 0, overlaps };
    });
    expect(flash.present, 'a highlight overlay should be on the page').toBe(true);
    expect(flash.overlaps, 'the overlay should cover a source card').toBe(true);

    // Unknown id → graceful false (the popup's "couldn't find it" path).
    const miss = await sendToTab<{ found: boolean }>(serviceWorker, tabId, {
      type: 'movar:highlightDivergence',
      id: 'does-not-exist',
    });
    expect(miss).toEqual({ found: false });
  });
});
