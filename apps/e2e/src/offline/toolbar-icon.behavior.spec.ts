/**
 * Toolbar action-icon behaviour — end-to-end in real Chromium with the built
 * extension. The visual gallery (`action-icon.visual.spec.ts`) pins the PNGs;
 * this proves the wiring actually fires them: as a real page is concealed, or
 * settings flip, does the live service worker call `browser.action.setIcon`
 * with the right per-state PNG (and set/clear the native count badge)?
 *
 * The toolbar button is browser chrome — it can't be screenshotted — so instead
 * we instrument `chrome.action.setIcon` inside the running SW and read the calls
 * back, and read the badge through the real `chrome.action.getBadgeText`
 * (per-tab state the browser holds — no spy needed for that half).
 *
 * Every assertion is scoped to the tab under test by `tabId`. The SW paints
 * OTHER tabs at unpredictable moments — the install-time onboarding tab opens
 * (and steals focus) whenever `onInstalled`'s async tab-create lands, and its
 * chrome-extension:// URL resolves to the `active` posture — so "the most
 * recent setIcon call anywhere" races those repaints: a late onboarding paint
 * once pinned an 8s `blocking` poll at `active` in CI. Per-tab records and a
 * per-tab badge read can't be masked by a neighbour tab's paint.
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

/** Wrap the SW's `chrome.action.setIcon` so the test can read back every call
 *  (there is no `getIcon` to read applied state from — unlike the badge, which
 *  {@link tabBadge} reads back through the real API). Idempotent; records into
 *  a global {@link lastIconState} reads. Runs in the browser SW context, so
 *  `chrome.action` is cast to a loose callable record — the extension only ever
 *  calls the single-arg (promise) form. */
async function spyOnAction(sw: Worker): Promise<void> {
  await sw.evaluate(() => {
    const g = globalThis as unknown as { __icon: unknown[] };
    g.__icon = [];
    const action = chrome.action as unknown as {
      __spied?: boolean;
      setIcon: (d: unknown) => unknown;
    };
    if (action.__spied === true) return;
    action.__spied = true;
    const origIcon = action.setIcon.bind(action);
    action.setIcon = (d) => {
      g.__icon.push(d);
      return origIcon(d);
    };
  });
}

/** The browser-side tab id of the (unique) tab matching `urlGlob`, via
 *  `chrome.tabs.query`. Assertions key on it so they can't drift to another
 *  tab's paint. Retries briefly — the query is issued right after a committed
 *  `goto`, so a miss can only be a transient hiccup on a loaded host; after
 *  ~2s of misses it throws, because polling on would only time out later with
 *  a less specific error. */
async function tabIdFor(sw: Worker, urlGlob: string): Promise<number> {
  const deadline = Date.now() + 2_000;
  for (;;) {
    const id = await sw.evaluate(async (glob) => {
      const tabs = await chrome.tabs.query({ url: glob });
      return tabs[0]?.id ?? null;
    }, urlGlob);
    if (id != null) return id;
    if (Date.now() > deadline) throw new Error(`tabIdFor: no open tab matches ${urlGlob}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** The `ActionIconState` behind the most recent `setIcon` for `tabId` (parsed
 *  from the packaged `icon/state/<state>-16.png` filename), or null if that
 *  tab hasn't been painted yet. */
async function lastIconState(sw: Worker, tabId: number): Promise<string | null> {
  return sw.evaluate((id) => {
    const calls = (
      globalThis as unknown as { __icon?: { tabId?: number; path?: Record<string, string> }[] }
    ).__icon;
    const mine = calls?.filter((c) => c.tabId === id);
    const first = Object.values(mine?.at(-1)?.path ?? {})[0];
    if (first == null) return null;
    return /icon\/state\/([a-z]+)-\d+\.png/.exec(first)?.[1] ?? null;
  }, tabId);
}

/** The native badge text on `tabId`, read straight from the real
 *  `chrome.action.getBadgeText` — browser-held per-tab state, so a later paint
 *  of a different tab can't mask it. */
async function tabBadge(sw: Worker, tabId: number): Promise<string> {
  return sw.evaluate(async (id) => chrome.action.getBadgeText({ tabId: id }), tabId);
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
    const tabId = await tabIdFor(serviceWorker, 'https://www.youtube.com/*');

    // Guard: the fixture really concealed cards (else "blocking" couldn't arise).
    expect(route.hits).toBeGreaterThanOrEqual(1);
    expect((await readMovarDomState(movarPage)).contentBlurCount).toBeGreaterThan(0);

    // The live SW flipped THIS tab's toolbar icon to `blocking` — the content
    // script's `movar:hiddenChanged` push guarantees the paint once the guard
    // above holds…
    await expect
      .poll(async () => lastIconState(serviceWorker, tabId), { timeout: 8000 })
      .toBe('blocking');
    // …and set the native count badge to the number of hidden things.
    await expect
      .poll(async () => tabBadge(serviceWorker, tabId), { timeout: 8000 })
      .toMatch(/^[1-9]\d*$/);
  });

  test('active (no badge) on a clean page', async ({ movarContext, movarPage, serviceWorker }) => {
    await spyOnAction(serviceWorker);
    await mockSite(movarContext, 'https://example.com/**', 'clean-uk');

    await movarPage.goto(CLEAN_URL, { waitUntil: 'domcontentloaded' });
    await movarPage.bringToFront(); // the extension's install-time onboarding tab
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 }); // steals focus otherwise
    const tabId = await tabIdFor(serviceWorker, 'https://example.com/*');

    await expect
      .poll(async () => lastIconState(serviceWorker, tabId), { timeout: 8000 })
      .toBe('active');
    expect(await tabBadge(serviceWorker, tabId)).toBe('');
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
    const tabId = await tabIdFor(serviceWorker, 'https://example.com/*');

    // Flip the master switch off — onSettingsChange repaints the ACTIVE tab.
    await setMovarSettings({ enabled: false });
    // Re-activate the tab under test: if the onboarding tab stole focus right
    // at the flip, `refreshActiveTabs` painted IT and this tab would never
    // repaint on its own. The `onActivated` repaint re-reads the committed
    // settings, so this can't resurrect the pre-flip state.
    await movarPage.bringToFront();

    await expect
      .poll(async () => lastIconState(serviceWorker, tabId), { timeout: 8000 })
      .toBe('off');
    expect(await tabBadge(serviceWorker, tabId)).toBe('');
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
    const tabId = await tabIdFor(serviceWorker, 'https://www.youtube.com/*');

    // Allowlist the active host — Movar steps aside; the icon reads `exempt`.
    await setMovarSettings({ allowlist: ['youtube.com'] });
    await movarPage.bringToFront(); // guarantee a repaint of THIS tab (see 'off')

    await expect
      .poll(async () => lastIconState(serviceWorker, tabId), { timeout: 8000 })
      .toBe('exempt');
    // The blur pass set a count badge before the allowlist landed; the exempt
    // repaint clears it. `refreshTabIcon` writes icon-then-badge, so poll: the
    // icon flipping to `exempt` doesn't yet prove the badge write landed.
    await expect.poll(async () => tabBadge(serviceWorker, tabId), { timeout: 8000 }).toBe('');
  });
});
