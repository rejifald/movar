/**
 * Curtain visual-regression suite. The curtain is Movar's most visible
 * on-page artifact (806 lines, two modes, two skins, a light/dark token
 * swap), yet before this it was verified only attribute-by-attribute in unit
 * tests and structurally in apps/extension/src/lib/curtain.snapshot.test.ts.
 * Neither catches a *rendered* regression — a token losing contrast, a halo
 * clipping wrong, a dark bundle that doesn't apply. This spec mounts a real
 * curtain via the content script and pixel-compares it.
 *
 * Scope = the curtain HOST element, NOT the page. The screenshot is taken on
 * `[data-movar-curtain]` (the cover-mode overlay mounted inside a blurred RU
 * card on the youtube-cards-ru fixture), so the baseline stays small and a
 * diff is meaningful — a YouTube layout change around the card can't churn it.
 *
 * Light + dark only, one card each: the curtain's color scheme follows the
 * page-mode detector, which for a theme-less fixture falls through to
 * `prefers-color-scheme` (packages/page-mode/src/detect.ts tier 4). So
 * `emulateMedia({ colorScheme })` set before navigation drives the curtain's
 * `data-movar-color-scheme` attribute and exercises the DARK_TOKENS bundle.
 * Two cases keep baseline maintenance bounded (the tradeoff the issue calls
 * out: pixel baselines are platform-specific — committed `*-darwin.png`, CI
 * regenerates `*-linux.png`, same convention as popup.visual.spec.ts).
 */
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/extension';
import { mockSite } from '../fixtures/content-mock';
import { waitForMovarSettled } from '../fixtures/movar-state';

const YOUTUBE_URL = 'https://www.youtube.com/feed/trending';

/** Navigate to the curtained YouTube fixture, wait for the content filter to
 *  settle, and return the host of the first cover-mode content curtain. */
async function mountCurtainedCard(page: Page): Promise<void> {
  // /feed/trending is off the YouTube enforce rule's /results path gate, so
  // only the content filter runs (no redirect race) — same rationale as the
  // content-script.spec.ts YouTube case.
  await page.goto(YOUTUBE_URL, { waitUntil: 'domcontentloaded' });
  await waitForMovarSettled(page, { timeoutMs: 10_000 });
  // Both RU cards get a curtain; assert at least one mounted so the screenshot
  // below isn't taken against an empty page (the "URL typo → no work → passes"
  // failure mode).
  await expect(page.locator('[data-movar-curtain]').first()).toBeVisible({ timeout: 5_000 });
}

test.describe('content curtain — visual', () => {
  test('cover-mode curtain over a Russian card, light', async ({ movarContext, movarPage }) => {
    await movarPage.emulateMedia({ colorScheme: 'light' });
    await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');
    await mountCurtainedCard(movarPage);

    const host = movarPage.locator('[data-movar-curtain]').first();
    await expect(host).toHaveAttribute('data-movar-color-scheme', 'light');
    await expect(host).toHaveScreenshot('curtain-cover-light.png');
  });

  test('cover-mode curtain over a Russian card, dark', async ({ movarContext, movarPage }) => {
    await movarPage.emulateMedia({ colorScheme: 'dark' });
    await mockSite(movarContext, 'https://www.youtube.com/**', 'youtube-cards-ru');
    await mountCurtainedCard(movarPage);

    const host = movarPage.locator('[data-movar-curtain]').first();
    await expect(host).toHaveAttribute('data-movar-color-scheme', 'dark');
    await expect(host).toHaveScreenshot('curtain-cover-dark.png');
  });
});
