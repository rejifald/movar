/**
 * Marketing-site visual-regression suite. Serves the BUILT Astro site via
 * `astro preview` (see `playwright.marketing.config.ts`'s `webServer`), loads
 * each page with its locale pinned, and compares full-page pixels against a
 * committed Linux baseline.
 *
 * This is the appearance-parity coverage for `apps/marketing` — the public site,
 * which had NO pixel coverage before. Every page renders through the shared
 * `@movar/theme` tokens (colours, type scale, spacing, radii wired into Tailwind
 * v4), so a token regression on any surface lands here as a diff.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Matrix — 6 pages × {en, uk} × {light, dark} = 24 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   pages:   home · install · why-this-happens · transparency · privacy · 404
 *   locale:  en (root) · uk (/uk/…)   — pinned via `navigator.language` so
 *            `BaseLayout`'s inline redirect (/ ↔ /uk/) never fires, AND to
 *            exercise Cyrillic glyph rendering + text wrapping;
 *   scheme:  light · dark             — the `prefers-color-scheme` token flip,
 *            so a dark-only regression can't hide behind a passing light cell.
 *
 * Determinism: `animations: 'disabled'` (config) cancels the infinite hero-aurora
 * keyframes to their initial frame; `reducedMotion: 'reduce'` trips the site's
 * own prefers-reduced-motion gates; each spec waits for network-idle (twice,
 * around a full scroll pass that triggers any lazy assets) and `document.fonts.
 * ready` before the capture, so glyph metrics + images are settled.
 *
 * Baseline workflow: regenerate the committed Linux PNGs in the pinned Playwright
 * container via `pnpm e2e:baselines:marketing`. Don't run `--update-snapshots` on
 * a macOS host — it writes a `*-darwin.png` CI doesn't use.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The six page types, with their en (root) and uk (/uk/…) URLs. `stem` is the
 *  baseline-filename stem (`marketing-<stem>-<locale>[-dark]`). The 404 lives at
 *  a literal `.html` (Astro emits `dist/404.html`); the rest use Astro's default
 *  directory URLs. */
const PAGES = [
  { stem: 'home', en: '/', uk: '/uk/' },
  { stem: 'install', en: '/install', uk: '/uk/install' },
  { stem: 'why-this-happens', en: '/why-this-happens', uk: '/uk/why-this-happens' },
  { stem: 'transparency', en: '/transparency', uk: '/uk/transparency' },
  { stem: 'privacy', en: '/privacy', uk: '/uk/privacy' },
  { stem: '404', en: '/404.html', uk: '/uk/404.html' },
] as const;

const LOCALES = [
  { key: 'en', tag: 'en-US', isUk: false },
  { key: 'uk', tag: 'uk-UA', isUk: true },
] as const;

const SCHEMES = [
  { colorScheme: 'light', suffix: '' },
  { colorScheme: 'dark', suffix: '-dark' },
] as const;

/**
 * Settle the loaded page and capture a full-page snapshot: network-idle for the
 * above-the-fold assets, a full scroll pass (+ a second network-idle) so any
 * lazy below-the-fold image loads, `document.fonts.ready`, then the shot. Also
 * asserts the locale-pinned load did NOT cross-redirect and that a real page
 * (not a blank error frame) rendered, so a URL typo or redirect loop can't bake
 * a wrong/empty baseline.
 */
async function settleAndShoot(page: Page, name: string, isUk: boolean): Promise<void> {
  await page.waitForLoadState('networkidle');

  const pathname = new URL(page.url()).pathname;
  expect(pathname.startsWith('/uk'), `unexpected cross-locale redirect to ${pathname}`).toBe(isUk);

  await page.evaluate(() => {
    for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
      window.scrollTo(0, y);
    }
  });
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await document.fonts.ready;
  });

  const height = await page.evaluate(() => document.body.scrollHeight);
  expect(height, 'page looks blank — did it error?').toBeGreaterThan(300);

  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

for (const locale of LOCALES) {
  for (const scheme of SCHEMES) {
    test.describe(`marketing — ${locale.key}${scheme.suffix ? ' (dark mode)' : ''}`, () => {
      test.use({ locale: locale.tag, colorScheme: scheme.colorScheme });

      for (const marketingPage of PAGES) {
        test(marketingPage.stem, async ({ page }) => {
          await page.goto(locale.isUk ? marketingPage.uk : marketingPage.en, {
            waitUntil: 'domcontentloaded',
          });
          await settleAndShoot(
            page,
            `marketing-${marketingPage.stem}-${locale.key}${scheme.suffix}.png`,
            locale.isUk,
          );
        });
      }
    });
  }
}
