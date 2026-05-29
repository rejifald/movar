/**
 * POC demo recording — single beat ("search hygiene").
 *
 * Scope: prove the recording pipeline works end-to-end. One beat, one
 * spec, one WebM out. Once this beat is signed off, the file gains the
 * other three beats from the planned shotlist (silent save, picker
 * survivor, configure-in-10-seconds); each is a separate `test()` so a
 * site issue with one beat doesn't block re-shooting the others.
 *
 * What it shows:
 *   1. User types a Cyrillic search query into DuckDuckGo.
 *   2. Movar's enforce rule rewrites the URL with `kl=ua-uk` *before*
 *      the navigation lands.
 *   3. Results page renders in Ukrainian.
 *
 * Why DuckDuckGo and not Google: Google CAPTCHAs Playwright contexts
 * with high reliability (the live-site suite recommends `SKIP_GOOGLE=1`
 * on captcha days). DDG has no such anti-automation gate — see
 * `apps/e2e/src/live/sites/duckduckgo.ts`: "the most automation-friendly of
 * the four search engines; in practice this test is the closest thing to
 * a reliable green."
 *
 * The visible cursor follower from `./cursor.ts` makes the typing/click
 * motion legible to a viewer — Playwright's synthetic mouse events
 * don't paint a system cursor.
 *
 * The Makefile (`./Makefile`) reads the WebM Playwright drops under
 * `demo-results/` and produces:
 *   - `master-1080p.mp4` for YouTube
 *   - `hero.gif` for the README
 *   - `social-{square,vertical}.mp4` for Bluesky/X/Mastodon
 *
 * Skipped behind `RUN_DEMO=1` — recording runs are slow and the
 * existing `pnpm --filter @movar/e2e test` would otherwise pick this up.
 */
import { test, expect } from '../fixtures/extension';
import { installVisibleCursor, moveTo } from './cursor';

const SHOULD_RUN = process.env['RUN_DEMO'] === '1';

// ASCII-only describe so the test-output directory name doesn't carry
// shell-hostile characters (the previous middle-dot version turned into
// `master-movar-demo-·-search…` and broke Makefile pattern matching).
test.describe('movar demo - search hygiene beat', () => {
  test.skip(!SHOULD_RUN, 'set RUN_DEMO=1 to record this beat');

  test('duckduckgo rewrites the URL and serves Ukrainian results', async ({ movarPage }) => {
    await installVisibleCursor(movarPage);

    // Land on the DDG home page so the viewer sees the query *being
    // typed*, not a pre-filled search box that auto-resolves.
    await movarPage.goto('https://duckduckgo.com/', { waitUntil: 'domcontentloaded' });
    // Hold the empty home-page frame for a beat so the viewer can
    // register the starting state before the cursor moves.
    await movarPage.waitForTimeout(900);

    // DDG's home-page search field is `[name="q"]`. Get its bounds, route
    // the simulated cursor through them, click, type.
    const searchBox = movarPage.locator('input[name="q"]').first();
    const box = await searchBox.boundingBox();
    if (!box) throw new Error('Could not locate DuckDuckGo search box');
    await moveTo(movarPage, box.x + box.width / 2, box.y + box.height / 2, { steps: 18 });
    await searchBox.click();
    await movarPage.waitForTimeout(300);

    // `яблуко` (apple) is the same Cyrillic probe the live-site suite
    // uses — known to bleed RU results without Movar's enforce rule.
    // Per-keystroke delay so the recording captures the letters
    // appearing rather than a paste.
    await movarPage.keyboard.type('яблуко', { delay: 90 });
    await movarPage.waitForTimeout(500);

    // Submit and wait for the rewritten SERP URL. Movar's DNR rule fires
    // before the request leaves the browser; `waitForURL` matches the
    // post-rewrite shape so the assertion below isn't racing the redirect.
    await movarPage.keyboard.press('Enter');
    await movarPage.waitForURL(/[?&]kl=ua-uk\b/, { timeout: 20_000 });
    await movarPage.waitForLoadState('domcontentloaded');

    // Final assertion — recording is junk if Movar didn't fire.
    expect(movarPage.url()).toMatch(/[?&]kl=ua-uk\b/);

    // Held final frame so the editor (or the GIF derivation) has a clean
    // cut point on the Ukrainian SERP.
    await movarPage.waitForTimeout(1800);
  });
});
