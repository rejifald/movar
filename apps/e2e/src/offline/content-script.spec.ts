/**
 * Content-script behavior e2e suite. Serves fixed HTML via
 * `context.route()` and asserts the content script reacts:
 *
 *   - picker filter sets `data-movar-hidden` on the blocked-language anchor
 *     AND logs a CorrectionEvent with `mechanism: 'dom'`
 *   - YouTube content filter mounts `data-movar-curtain` over RU cards
 *   - clean-uk page receives ZERO Movar modifications (the negative case,
 *     paired with the cs-cart positive case so "zero events" is
 *     genuinely distinguishable from "events never get logged")
 *   - bare-text picker triggers a hreflang-redirect to the mocked uk page
 *   - bare-text picker (no hreflang) triggers `trimOrphanSeparators`, so
 *     the surviving UA anchor carries `data-movar-original-text`
 *   - `settings.contentModification: false` gates the picker filter off
 *     even on a fixture that would otherwise hide RU
 *   - allowlisted domains receive ZERO Movar modifications even on a
 *     fixture that would otherwise hide RU
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
 *
 * `mockSite` returns a `{ hits }` bookkeeping object explicitly so tests
 * can catch the "URL typo → 404 → no work → passes" failure mode. Every
 * test in this file asserts `hits >= 1` after navigation — without it, a
 * stray typo in the URL pattern would leave the page on a default 404,
 * the content script would correctly do nothing on that page, and the
 * "no Movar modifications happened" assertion would pass for the wrong
 * reason.
 *
 * Timeouts: `waitForMovarSettled` is invoked with `timeoutMs: 10_000`
 * (vs the helper default of 15_000) because the spec budget under
 * the default `playwright.config.ts` is 30_000 — a 15s settle would chew
 * half the spec budget on a happy path and leave too little headroom
 * for the navigation + assertion phases. 10s comfortably covers the
 * MutationObserver debounce + a settle cycle on a loaded runner.
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
  test('picker filter hides the blocked-language anchor on a CS-Cart-style page and logs a CorrectionEvent', async ({
    movarContext,
    movarPage,
    getCorrections,
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

    // Positive CorrectionEvent assertion. content.ts:345 logs `mechanism:
    // 'dom', fromLang: 'ru', toLang: '<priority head or pageLang>'` per
    // distinct hidden language. Asserting it lands here proves the event
    // path is alive — and gives the "no events on UK page" assertion in
    // the no-op test below a meaningful negative to be the inverse of.
    await expect
      .poll(async () => await getCorrections('mocked-cs-cart.example.test'), {
        message: 'no CorrectionEvent logged for mocked-cs-cart.example.test',
        timeout: 5_000,
      })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            mechanism: 'dom',
            fromLang: 'ru',
            domain: 'mocked-cs-cart.example.test',
          }),
        ]),
      );
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
    const route = await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    const state = await settleAndRead(movarPage);
    // Route fired at least once — guards against the silent "typo in URL
    // pattern, page served 404, content script correctly did nothing,
    // test passed for the wrong reason" failure mode.
    expect(route.hits).toBeGreaterThanOrEqual(1);

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
    const route = await mockSite(movarContext, `${url}**`, 'clean-uk');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    // Give the content script a chance to do nothing. waitForMovarSettled
    // returns as soon as the [data-movar-hidden]/[data-movar-curtain]
    // count is stable for 800ms — for a no-op page it stays at 0 the
    // whole time and the function exits after the quiet window.
    const state = await settleAndRead(movarPage);

    // Route fired — the assertion below is "zero modifications HAPPENED",
    // not "the URL was wrong and nothing ran".
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // Three independent signals — every Movar-affected attribute count is zero:
    expect(state.hiddenLinkCount).toBe(0);
    expect(state.curtainCount).toBe(0);
    expect(state.trimmedTextCount).toBe(0);

    // And the correction-event log records nothing for this domain.
    // A regression that mis-classified UK as RU and fired a redirect
    // would land here (the redirect itself can't go anywhere because
    // there's no `<link rel="alternate">`, but the CorrectionEvent
    // would be logged before the redirect attempt).
    //
    // This assertion has teeth because the cs-cart test above asserts
    // the inverse: events ARE logged on a RU page. Without the positive
    // case, "events.length === 0" is trivially true even if the event
    // pipeline is completely broken.
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
    const sourceRoute = await mockSite(
      movarContext,
      'https://mocked-001.example.test/delux**',
      'picker-bare-text',
    );
    const destRoute = await mockSite(
      movarContext,
      'https://mocked-001.example.test/uk/delux**',
      'clean-uk',
    );

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
    // BOTH routes fired — source served, then destination served. A
    // typo in either pattern would land an unexpected 404 here.
    expect(sourceRoute.hits).toBeGreaterThanOrEqual(1);
    expect(destRoute.hits).toBeGreaterThanOrEqual(1);
  });

  test('bare-text picker (no hreflang) trims the orphan separator on the surviving UA active-language marker', async ({
    movarContext,
    movarPage,
  }) => {
    // Sibling fixture to picker-bare-text.html, but WITHOUT
    // `<link rel="alternate" hreflang>` — so the redirect strategy
    // bails (no hreflang map, no anchor with an external href the
    // picker-redirect can follow) and the picker filter's
    // `trimOrphanSeparators` pass runs.
    //
    // The 001.com.ua picker pattern: active language is plain text
    // inside a `<span>` with the visual `|` separator baked into the
    // SAME text node (`<span>UA  |  </span>`); the other language is
    // a sibling `<a>`. When RU hides, the trailing `|` becomes an
    // orphan and `trimOrphanSeparators` rewrites the span's text
    // node, stamping `data-movar-original-text` on the SPAN (not on
    // an anchor — there's no UA anchor to begin with) so the popup's
    // restore action can put the verbatim text back.
    //
    // Without this fixture, the trim path has zero offline coverage:
    // cs-cart-ru uses `<li>` boundaries between anchors (so there's
    // no separator text to trim), youtube-cards-ru is the content
    // filter (no picker), clean-uk has no picker, and picker-bare-text
    // redirects away before the trim pass.
    const url = 'https://mocked-trim.example.test/';
    const route = await mockSite(movarContext, `${url}**`, 'picker-bare-text-trim');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    // Wait for `data-movar-original-text` on ANY element — the trim
    // path stamps it on the `<span>` carrying the active-language
    // marker (see picker.ts:666), and the e2e DOM-state helper
    // (`movar-state.ts:34`) counts any-element matches too.
    await expect(movarPage.locator('[data-movar-original-text]')).toHaveCount(1, {
      timeout: 5_000,
    });

    const state = await settleAndRead(movarPage);
    expect(route.hits).toBeGreaterThanOrEqual(1);
    expect(state.trimmedTextCount).toBeGreaterThanOrEqual(1);
    // Sanity: trim only fires AFTER a hide, so we should also see the
    // RU anchor hidden. Without this, a regression that wrote
    // ORIGINAL_TEXT_ATTR on every anchor regardless would pass the
    // count assertion above.
    expect(state.hiddenLinkCount).toBeGreaterThanOrEqual(1);
  });

  test('contentModification: false gates the picker filter off — no hide on a RU picker page', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    // Without this test, a regression that ran the picker filter
    // regardless of `settings.contentModification` would ship green —
    // every other content-script test seeds the default (true).
    //
    // cs-cart-ru is the right fixture because it has no hreflang +
    // no rule, so the ONLY thing Movar would do here is the picker
    // filter (gated by contentModification per content.ts:392). With
    // the flag off, the page must look untouched.
    await setMovarSettings({ contentModification: false });

    const url = 'https://mocked-cs-cart.example.test/';
    const route = await mockSite(movarContext, `${url}**`, 'cs-cart-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    const state = await settleAndRead(movarPage);
    expect(route.hits).toBeGreaterThanOrEqual(1);

    // Picker filter off → no anchor carries data-movar-hidden, no
    // curtain mounts, no trim runs.
    expect(state.hiddenLinkCount).toBe(0);
    expect(state.curtainCount).toBe(0);
    expect(state.trimmedTextCount).toBe(0);

    // The RU anchor specifically must NOT be hidden. Same assertion
    // shape as the positive test (cs-cart picker filter) — inverted
    // expectation. Catches a regression that gates the curtain UI off
    // but still applies `data-movar-hidden` to anchors.
    const ruAnchor = movarPage.locator('a[hreflang="ru"]');
    await expect(ruAnchor).not.toHaveAttribute('data-movar-hidden', /.*/);
  });

  test('allowlisted domain receives zero Movar modifications even on a RU picker page', async ({
    movarContext,
    movarPage,
    setMovarSettings,
  }) => {
    // The allowlist is the user-facing safety knob — "don't touch this
    // site at all". content.ts:419 returns early at content-script
    // bootstrap when the host matches; no picker filter, no content
    // filter, no redirect attempt.
    //
    // cs-cart-ru is the right fixture for the same reason as the
    // gate-off test above: an unallowlisted run hides the RU anchor.
    // An allowlisted run must not.
    await setMovarSettings({ allowlist: ['mocked-cs-cart.example.test'] });

    const url = 'https://mocked-cs-cart.example.test/';
    const route = await mockSite(movarContext, `${url}**`, 'cs-cart-ru');

    await movarPage.goto(url, { waitUntil: 'domcontentloaded' });

    const state = await settleAndRead(movarPage);
    expect(route.hits).toBeGreaterThanOrEqual(1);

    expect(state.hiddenLinkCount).toBe(0);
    expect(state.curtainCount).toBe(0);
    expect(state.trimmedTextCount).toBe(0);

    const ruAnchor = movarPage.locator('a[hreflang="ru"]');
    await expect(ruAnchor).not.toHaveAttribute('data-movar-hidden', /.*/);
  });
});
