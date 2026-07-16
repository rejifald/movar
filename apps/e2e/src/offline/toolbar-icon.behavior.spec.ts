/**
 * Toolbar action-icon behaviour — end-to-end in real Chromium with the built
 * extension. The visual gallery (`action-icon.visual.spec.ts`) pins the PNGs;
 * this proves the wiring actually fires them: as a real page is concealed, or
 * settings flip, does the live service worker call `browser.action.setIcon`
 * with the right per-state PNG (and set/clear the native count badge)?
 *
 * The toolbar button is browser chrome — it can't be screenshotted — so instead
 * we instrument `chrome.action.setIcon`/`setBadgeText` inside the running SW and
 * read the calls back, and cross-check the badge with the real
 * `chrome.action.getBadgeText` read-back (no spy needed for that half).
 *
 * Offline + deterministic like the sibling `content-script.spec.ts`: the Russian
 * feed is the `curtain-tiers-ru` fixture served from youtube.com via
 * `context.route`, so the real content script conceals it and the real
 * background reacts — no network.
 */
import { expect, test } from '../fixtures/extension';
import type { Worker } from '@playwright/test';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

const TRENDING_URL = 'https://www.youtube.com/feed/trending';
const CLEAN_URL = 'https://example.com/';

/** Wrap the SW's `chrome.action` setters so the test can read back every call.
 *  Idempotent; records into globals the poll helpers below read. Runs in the
 *  browser SW context, so `chrome.action` is cast to a loose callable record —
 *  the extension only ever calls the single-arg (promise) form. */
async function spyOnAction(sw: Worker): Promise<void> {
  await sw.evaluate(() => {
    const g = globalThis as unknown as { __icon: unknown[]; __badge: unknown[] };
    g.__icon = [];
    g.__badge = [];
    const action = chrome.action as unknown as {
      __spied?: boolean;
      setIcon: (d: unknown) => unknown;
      setBadgeText: (d: unknown) => unknown;
    };
    if (action.__spied === true) return;
    action.__spied = true;
    const origIcon = action.setIcon.bind(action);
    action.setIcon = (d) => {
      g.__icon.push(d);
      return origIcon(d);
    };
    const origBadge = action.setBadgeText.bind(action);
    action.setBadgeText = (d) => {
      g.__badge.push(d);
      return origBadge(d);
    };
  });
}

/** The `ActionIconState` behind the most recent `setIcon` path (parsed from the
 *  packaged `icon/state/<state>-16.png` filename), or null if none yet. */
async function lastIconState(sw: Worker): Promise<string | null> {
  return sw.evaluate(() => {
    const calls = (globalThis as unknown as { __icon?: { path?: Record<string, string> }[] })
      .__icon;
    const first = Object.values(calls?.at(-1)?.path ?? {})[0];
    if (first == null) return null;
    return /icon\/state\/([a-z]+)-\d+\.png/.exec(first)?.[1] ?? null;
  });
}

/** The native badge text on the tab the extension last acted on, read straight
 *  from the real `getBadgeText` API (the tabId comes from the spy so it can't
 *  drift from whichever tab the SW actually targeted). */
async function actedTabBadge(sw: Worker): Promise<string> {
  return sw.evaluate(async () => {
    const badges = (globalThis as unknown as { __badge?: { tabId?: number }[] }).__badge;
    const tabId = badges?.at(-1)?.tabId;
    if (tabId == null) return '';
    return chrome.action.getBadgeText({ tabId });
  });
}

test.describe('toolbar icon — end-to-end', () => {
  test('blocking + count badge on a Russian feed', async ({
    movarContext,
    movarPage,
    serviceWorker,
  }) => {
    await spyOnAction(serviceWorker);
    const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'curtain-tiers-ru');

    await movarPage.goto(TRENDING_URL, { waitUntil: 'domcontentloaded' });
    await movarPage.bringToFront(); // the extension's install-time onboarding tab
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 }); // steals focus otherwise

    // Guard: the fixture really concealed cards (else "blocking" couldn't arise).
    expect(route.hits).toBeGreaterThanOrEqual(1);
    expect((await readMovarDomState(movarPage)).contentBlurCount).toBeGreaterThan(0);

    // The live SW flipped the toolbar icon to `blocking`…
    await expect.poll(async () => lastIconState(serviceWorker), { timeout: 8000 }).toBe('blocking');
    // …and set the native count badge to the number of hidden things.
    await expect
      .poll(async () => actedTabBadge(serviceWorker), { timeout: 8000 })
      .toMatch(/^[1-9]\d*$/);
  });

  test('active (no badge) on a clean page', async ({ movarContext, movarPage, serviceWorker }) => {
    await spyOnAction(serviceWorker);
    await mockSite(movarContext, 'https://example.com/**', 'clean-uk');

    await movarPage.goto(CLEAN_URL, { waitUntil: 'domcontentloaded' });
    await movarPage.bringToFront(); // the extension's install-time onboarding tab
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 }); // steals focus otherwise

    await expect.poll(async () => lastIconState(serviceWorker), { timeout: 8000 }).toBe('active');
    expect(await actedTabBadge(serviceWorker)).toBe('');
  });

  test('off when Movar is disabled', async ({
    movarContext,
    movarPage,
    serviceWorker,
    setMovarSettings,
  }) => {
    await spyOnAction(serviceWorker);
    await mockSite(movarContext, 'https://example.com/**', 'clean-uk');
    await movarPage.goto(CLEAN_URL, { waitUntil: 'domcontentloaded' });
    await movarPage.bringToFront(); // the extension's install-time onboarding tab
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 }); // steals focus otherwise

    // Flip the master switch off — onSettingsChange repaints the active tab.
    await setMovarSettings({ enabled: false });

    await expect.poll(async () => lastIconState(serviceWorker), { timeout: 8000 }).toBe('off');
    expect(await actedTabBadge(serviceWorker)).toBe('');
  });

  test('exempt on an allowlisted site', async ({
    movarContext,
    movarPage,
    serviceWorker,
    setMovarSettings,
  }) => {
    await spyOnAction(serviceWorker);
    await mockSite(movarContext, 'https://www.youtube.com/**', 'curtain-tiers-ru');
    await movarPage.goto(TRENDING_URL, { waitUntil: 'domcontentloaded' });
    await movarPage.bringToFront(); // the extension's install-time onboarding tab
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 }); // steals focus otherwise

    // Allowlist the active host — Movar steps aside; the icon reads `exempt`.
    await setMovarSettings({ allowlist: ['youtube.com'] });

    await expect.poll(async () => lastIconState(serviceWorker), { timeout: 8000 }).toBe('exempt');
    expect(await actedTabBadge(serviceWorker)).toBe('');
  });
});
