/**
 * Conceal-chunk concealMode boundary spec (rendered-effect proxy).
 *
 * Design intent: prove the capability-loader's lazy-split boundary at runtime —
 * with `concealMode: 'hide'` the curtain UI (`features/curtain-ui.js`) is never
 * loaded, with `concealMode: 'curtain'` it is. The static import-graph guard in
 * apps/extension/src/lib/capability-boundary.test.ts covers the source-level
 * boundary; this is its live-browser counterpart.
 *
 * Why we assert the RENDERED EFFECT, not the network request: Playwright's
 * `context.route()` / `page.on('request')` only observe HTTP(S). The content
 * script loads chunks via `import(runtime.getURL(...))` over `chrome-extension://`,
 * which Chrome serves natively and Playwright cannot intercept or observe through
 * any route/request API (the previous `page.on('request')` approach here was
 * documented as non-functional — it never fired for chrome-extension:// — so the
 * spec was skipped). Rather than ship an observability hook in the published
 * build (which would violate MEMORY: project_observability_separate_dev_extension),
 * we assert the boundary by its DOM consequence:
 *
 *   - `concealMode: 'curtain'` → `attachBlurCurtain` mounts a `data-movar-curtain`
 *     host on each blocked card (content-conceal.ts), which is the ONLY thing that
 *     requires `features/curtain-ui.js` to load. A mounted curtain ⇒ the chunk
 *     loaded.
 *   - `concealMode: 'hide'`   → `hideCard` sets display:none with NO curtain host,
 *     so `features/curtain-ui.js` is never imported. Zero curtain hosts ⇒ the
 *     chunk was not loaded.
 *
 * It's a proxy, not byte-level proof — but it is real runtime coverage of the
 * concealMode → curtain-UI boundary that previously had none, with no test-only
 * hook in the shipped extension. `readMovarDomState().contentBlurCount` counts
 * curtain hosts WITHOUT a picker-container kind (content.ts / picker.ts), which is
 * exactly the content-filter curtains this spec is about.
 */
import { test, expect } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

test.describe('capability chunk loading — concealMode boundary', () => {
  test('hide mode: curtain UI is NOT mounted (curtain-ui.js never loads)', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    await setMovarSettings({ contentModification: true, concealMode: 'hide' });

    // MUST mock the real youtube.com host — the content-filter host check is
    // exact (`youtube.com` / `.youtube.com`). `/feed/trending` is off the
    // enforce-rule path, so only the content filter runs (no URL rewrite race).
    const url = 'https://www.youtube.com/feed/trending';
    const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

    const state = await readMovarDomState(movarPage);
    // Route fired — guards the "URL typo → 404 → nothing ran → passes for the
    // wrong reason" failure mode.
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // The two RU cards ARE blocked (hard-hidden), proving the filter ran...
    const hiddenCards = movarPage.locator(
      'ytd-video-renderer[data-movar-hidden^="content-filter"]',
    );
    await expect(hiddenCards).toHaveCount(2);

    // ...but NO curtain host was mounted, so features/curtain-ui.js never loaded.
    expect(state.contentBlurCount).toBe(0);
    expect(state.curtainCount).toBe(0);
  });

  test('curtain mode: curtain UI IS mounted (curtain-ui.js loads)', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    await setMovarSettings({ contentModification: true, concealMode: 'curtain' });

    const url = 'https://www.youtube.com/feed/trending';
    const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForMovarSettled(movarPage, { timeoutMs: 10_000 });

    const state = await readMovarDomState(movarPage);
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // Two RU cards, each blurred with a curtain host mounted — mounting the
    // curtain is what forces features/curtain-ui.js to load.
    const blurredCards = movarPage.locator('ytd-video-renderer[data-movar-content-blurred="ru"]');
    await expect(blurredCards).toHaveCount(2);
    expect(state.contentBlurCount).toBeGreaterThanOrEqual(2);

    // The cards were NOT hard-hidden in curtain mode — the inverse of the hide
    // test, so a regression that ignored concealMode and always hid would fail
    // here rather than passing both ways.
    const hiddenCards = movarPage.locator(
      'ytd-video-renderer[data-movar-hidden^="content-filter"]',
    );
    await expect(hiddenCards).toHaveCount(0);
  });
});
