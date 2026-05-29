/**
 * Content-script behavior e2e suite. Serves fixed HTML via
 * `context.route()` and asserts the content script reacts:
 *
 *   - picker filter sets `data-movar-hidden` on the blocked-language anchor
 *   - YouTube content filter mounts `data-movar-curtain` over RU cards
 *   - clean-uk page receives ZERO Movar modifications (the negative case)
 *   - bare-text picker triggers a hreflang-redirect to the mocked uk page
 *
 * Deliberately offline: every navigation is fulfilled by a route handler
 * against a fixture under `src/fixtures/html/`. Live counterparts live in
 * `sites.spec.ts`, which is opt-in and network-flaky; this suite is the
 * deterministic CI gate.
 *
 * The YouTube case is the only one that has to mock a real domain. The
 * content-filter host check
 * (`apps/extension/src/lib/content-filter.ts:120-125`) is exact:
 * `host === 'youtube.com' || host.endsWith('.youtube.com')`. A
 * `mocked-youtube.example.test` hostname would silently fail to fire
 * the filter — the test would pass for the wrong reason. So that test
 * routes `https://www.youtube.com/results*` instead.
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';

/** Wait for the content script to settle, then return the Movar-DOM
 *  state in one read. Saves repeating both lines in every test. */
async function settleAndRead(page: Page): Promise<ReturnType<typeof readMovarDomState>> {
  await waitForMovarSettled(page, { timeoutMs: 10_000 });
  return await readMovarDomState(page);
}

test.describe('content script — mocked sites', () => {
  test('picker filter hides the blocked-language anchor on a CS-Cart-style page', async ({
    movarContext,
    movarPage,
  }) => {
    // The CS-Cart fixture has NO `<link rel="alternate" hreflang>` in
    // head, so the hreflang *strategy* doesn't fire — only the picker
    // filter does. The point is to isolate the data-movar-hidden signal
    // from a competing redirect-then-navigate path.
    const url = 'https://mocked-cs-cart.example.test/';
    const route = await mockSite(movarContext, `${url}**`, 'cs-cart-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    // Picker filter runs synchronously after content-script init, so the
    // attribute lands well within 5s on any sane machine. Scoping by the
    // hreflang attribute proves we hid the *right* anchor (the Russian
    // one), not just any picker item.
    //
    // We assert via toHaveAttribute, NOT waitForSelector(state:'visible'),
    // because picker.ts hides the anchor by also setting display:none —
    // the Playwright "visible" check would never pass on a successfully
    // hidden element. The attribute is the truth signal; the visibility
    // is the side-effect.
    await expect(movarPage.locator('a[hreflang="ru"]')).toHaveAttribute('data-movar-hidden', /.+/, {
      timeout: 5_000,
    });

    const state = await settleAndRead(movarPage);
    // Exactly one hidden anchor: the ru link. The uk + en links must
    // survive — otherwise the picker filter is over-eager.
    expect(state.hiddenLinkCount).toBeGreaterThanOrEqual(1);
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // Survivor sanity: the uk anchor must NOT carry data-movar-hidden.
    // The filter's contract is "hide blocked, leave others" — a
    // regression that hides everything would still pass the above
    // count assertion but fail here.
    const ukAnchor = movarPage.locator('a[hreflang="uk"]');
    await expect(ukAnchor).not.toHaveAttribute('data-movar-hidden', /.*/);
  });

  test('YouTube content filter curtains Russian cards on a non-SERP page', async ({
    movarContext,
    movarPage,
  }) => {
    // MUST mock the real youtube.com URL — the host check in
    // content-filter.ts:120 is exact (`'youtube.com'` or `.youtube.com`).
    //
    // Deliberately NOT using `/results` here: the YouTube enforce rule
    // (packages/rules/src/index.ts:202) is path-gated to `/results` and
    // would rewrite the URL to add `hl=uk`+`gl=ua` on any visit. That
    // rewrite triggers a window.location redirect, and the test would
    // race between the redirect's reload and the content filter's scan.
    // `/feed/trending` is off the rule's path — only the content filter
    // runs, which is what this test is actually about.
    const url = 'https://www.youtube.com/feed/trending';
    await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    const state = await settleAndRead(movarPage);

    // Two of the three cards are Russian (one is Ukrainian, see fixture
    // comment). Both RU cards should be blurred and have a curtain host
    // mounted as their child (cover mode).
    //
    // The truth signal here is `data-movar-content-blurred` on the card
    // itself (set by content-filter.ts:134). The curtain host
    // (`data-movar-curtain`) is the visual representation, mounted as a
    // child of the card in cover mode. Note that content curtains do NOT
    // set `data-movar-kind` — only picker-container curtains do (see
    // picker.ts:835 + content.ts:54). The `readMovarDomState` helper
    // counts curtains *without* picker-container kind as content blurs,
    // which is the right derivation here.
    expect(state.contentBlurCount).toBeGreaterThanOrEqual(2);

    // Cross-check via the canonical card attribute. Two cards must carry
    // `data-movar-content-blurred="ru"` — proves the card-level state
    // (not just the visual curtain) is the source of truth.
    const blurredCards = movarPage.locator('ytd-video-renderer[data-movar-content-blurred="ru"]');
    await expect(blurredCards).toHaveCount(2);

    // The UK card must NOT be blurred — the fixture tags it with
    // data-uk-card="true" for selection here. A regression that
    // over-blurs would land here, not on the count assertion above.
    const ukCard = movarPage.locator('ytd-video-renderer[data-uk-card]');
    await expect(ukCard).not.toHaveAttribute('data-movar-content-blurred', /.*/);
  });

  test('no-op on a Ukrainian page — zero Movar modifications, zero correction events', async ({
    movarContext,
    movarPage,
    getCorrections,
  }) => {
    const url = 'https://uk-content.example.test/';
    await mockSite(movarContext, `${url}**`, 'clean-uk');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    // Give the content script a chance to do nothing. waitForMovarSettled
    // returns as soon as the [data-movar-hidden]/[data-movar-curtain]
    // count is stable for 800ms — for a no-op page it stays at 0 the
    // whole time and the function exits after the quiet window.
    const state = await settleAndRead(movarPage);

    // Three independent signals — every Movar-affected attribute count is zero:
    expect(state.hiddenLinkCount).toBe(0);
    expect(state.curtainCount).toBe(0);
    expect(state.trimmedTextCount).toBe(0);

    // And the correction-event log records nothing for this domain.
    // A regression that mis-classified UK as RU and fired a redirect
    // would land here (the redirect itself can't go anywhere because
    // there's no `<link rel="alternate">`, but the CorrectionEvent
    // would be logged before the redirect attempt).
    const events = await getCorrections('uk-content.example.test');
    expect(events).toHaveLength(0);
  });

  test('bare-text picker triggers a hreflang redirect to the mocked Ukrainian destination', async ({
    movarContext,
    movarPage,
  }) => {
    // Two mocks: the starting RU page and the destination UK page. The
    // hreflang strategy reads `<link rel="alternate" hreflang="uk">`
    // from the head of picker-bare-text.html and navigates to its
    // absolute URL — mocked-001.example.test/uk/delux. We mock the
    // destination with clean-uk so the post-navigation page settles
    // cleanly (no further Movar action), giving us a stable URL to
    // assert on.
    await mockSite(movarContext, 'https://mocked-001.example.test/delux**', 'picker-bare-text');
    await mockSite(movarContext, 'https://mocked-001.example.test/uk/delux**', 'clean-uk');

    await movarPage.goto('https://mocked-001.example.test/delux', {
      waitUntil: 'domcontentloaded',
    });

    // The redirect is a `location.href = …` assignment from the
    // strategy — Playwright surfaces it as a normal navigation. Wait
    // for the URL transition with a generous budget for slow CI.
    await movarPage.waitForURL('https://mocked-001.example.test/uk/delux**', {
      timeout: 10_000,
    });

    // Once on the UK destination, the content script does nothing (clean-uk
    // has no pickers, no blocked-language content). Confirm the page
    // settled and the URL is correct.
    await settleAndRead(movarPage);
    expect(movarPage.url()).toMatch(/^https:\/\/mocked-001\.example\.test\/uk\/delux/);
  });
});
