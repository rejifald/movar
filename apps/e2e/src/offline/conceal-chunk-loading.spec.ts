/**
 * Conceal-chunk lazy-loading spec.
 *
 * Design intent: assert that with `concealMode: 'hide'`, the content script
 * NEVER requests `features/curtain-ui.js`; with `concealMode: 'curtain'` it
 * DOES. This validates the capability-loader's lazy-split boundary at
 * runtime — the static import-graph test in `capability-boundary.test.ts`
 * covers the source-level boundary; this would cover the live browser
 * behaviour.
 *
 * Why skipped: Playwright's `context.route()` and `page.route()` intercept
 * standard HTTP/HTTPS requests only. Dynamic `import(runtime.getURL(...))` in
 * the content script loads chunks over the `chrome-extension://` scheme, which
 * Chrome serves natively from the packed extension and which Playwright cannot
 * intercept or observe through any route/request API. There is no supported
 * way to spy on `chrome-extension://` network activity from a Playwright test
 * context. To unblock these cases, the harness would need either:
 *
 *   (a) A CDP `Fetch.enable` or `Network.enable` call scoped to the content
 *       script's renderer process that intercepts `chrome-extension://`
 *       requests — currently not exposed by Playwright.
 *   (b) An in-extension diagnostic hook that records which capability chunks
 *       were loaded and exposes the list via `chrome.storage.local` or a
 *       runtime message, which the test could read via `serviceWorker.evaluate`.
 *       This conflicts with the "no observability in the published extension"
 *       constraint (MEMORY: project_observability_separate_dev_extension).
 */
import { test, expect } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';

test.describe('capability chunk loading — concealMode boundary', () => {
  // TODO: unblock when Playwright gains `chrome-extension://` request
  // interception (CDP Fetch/Network for extension renderers), OR when a
  // separate dev-only diagnostic extension can record loaded chunks without
  // shipping observability in the published build.
  test.skip(
    true,
    'Cannot observe chrome-extension:// dynamic imports from Playwright — ' +
      'context.route() only intercepts HTTP/HTTPS; no CDP path available for ' +
      'chrome-extension:// scheme in the content renderer. ' +
      'See file-level comment for the two unblocking paths.',
  );

  test('hide mode: curtain-ui.js is NOT requested', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    await setMovarSettings({ contentModification: true, concealMode: 'hide' });

    const url = 'https://mocked-chunk-hide.example.test/';
    await mockSite(movarContext, `${url}**`, 'youtube-cards-ru');

    // Collect chrome-extension:// requests during navigation.
    // NOTE: this approach does not work — page.on('request') does not fire
    // for chrome-extension:// scheme requests. Left here to document what
    // was attempted and why it cannot succeed without harness changes.
    const loadedChunks: string[] = [];
    movarPage.on('request', (req) => {
      if (req.url().startsWith('chrome-extension://')) {
        loadedChunks.push(req.url());
      }
    });

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

    const curtainUiLoaded = loadedChunks.some((u) => u.endsWith('curtain-ui.js'));
    expect(curtainUiLoaded).toBe(false);
  });

  test('curtain mode: curtain-ui.js IS requested', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    await setMovarSettings({ contentModification: true, concealMode: 'curtain' });

    const url = 'https://mocked-chunk-curtain.example.test/';
    await mockSite(movarContext, `${url}**`, 'youtube-cards-ru');

    const loadedChunks: string[] = [];
    movarPage.on('request', (req) => {
      if (req.url().startsWith('chrome-extension://')) {
        loadedChunks.push(req.url());
      }
    });

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

    const curtainUiLoaded = loadedChunks.some((u) => u.endsWith('curtain-ui.js'));
    expect(curtainUiLoaded).toBe(true);
  });
});
