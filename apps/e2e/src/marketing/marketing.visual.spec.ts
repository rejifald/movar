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
 * own prefers-reduced-motion gates; each spec waits for network-idle, then forces
 * every image to load and awaits it (see `loadEveryImage`) and `document.fonts.
 * ready` before the capture, so glyph metrics + images are settled; and the
 * sticky header is pinned for the shot (see `pinStickyForCapture`).
 *
 * Baseline workflow: regenerate the committed Linux PNGs in the pinned Playwright
 * container via `pnpm e2e:baselines:marketing`. Don't run `--update-snapshots` on
 * a macOS host — it writes a `*-darwin.png` CI doesn't use.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The seven page types, with their en (root) and uk (/uk/…) URLs. `stem` is the
 *  baseline-filename stem (`marketing-<stem>-<locale>[-dark]`). The 404 lives at
 *  a literal `.html` (Astro emits `dist/404.html`); the rest use Astro's default
 *  directory URLs. */
const PAGES = [
  { stem: 'home', en: '/', uk: '/uk/' },
  { stem: 'install', en: '/install', uk: '/uk/install' },
  { stem: 'why-this-happens', en: '/why-this-happens', uk: '/uk/why-this-happens' },
  { stem: 'why-not-ai', en: '/why-not-ai', uk: '/uk/why-not-ai' },
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
 * Take the sticky header out of sticky positioning for the capture.
 *
 * A `position: sticky` box is painted at the page's scroll offset, and a
 * full-page capture does not resolve that offset reproducibly. Two runs of the
 * same commit, in the same container, painted the header exactly 2px apart —
 * an exact vertical translation of rows 17-62, with every row below it
 * byte-identical, because the page content below a sticky box is in normal flow
 * and never moves with it.
 *
 * That one band is why the suite churned: 39 rows is ~0.7% of a short page like
 * /install (over `maxDiffPixelRatio`, so it failed) but ~0.16% of the long home
 * page (under it, so it passed). Same defect every run; only the page's height
 * decided whether it tripped the gate. Regenerating with `--update-snapshots=all`
 * then rewrote a different-looking subset each time, which made it read as
 * several unrelated flakes rather than one.
 *
 * Pinning removes the variable without weakening the assertion: at scroll offset
 * 0 — where every one of these captures starts — a sticky box occupies exactly
 * its static position, so not one pixel the baseline asserts changes. What is
 * genuinely untestable here is stickiness itself, and a full-page shot at offset
 * 0 never covered that anyway.
 */
async function pinStickyForCapture(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.sticky { position: static !important; }' });
}

/** Per-image ceiling on the load wait below. Generous against a loopback
 *  `astro preview` serving static PNGs — it exists only so a stalled fetch
 *  fails on the assertion (which names the src) rather than on the spec's
 *  opaque 30s timeout. */
const IMAGE_SETTLE_MS = 10_000;

/**
 * Force every image to load, and wait until all of them have settled.
 *
 * This used to be an instantaneous scroll pass — `window.scrollTo` to each
 * viewport offset in a tight loop — on the theory that visiting an offset makes
 * Chromium fetch the `loading="lazy"` images there. It does not: the loop never
 * yields, so the lazy-load/IntersectionObserver heuristics only ever see the
 * final scroll position and the offsets it swept past never trigger a fetch.
 *
 * The Examples section's 8 lazy screenshots (`Examples.astro`, in `<picture>`
 * elements with `prefers-color-scheme` dark variants) therefore stayed unloaded
 * and collapsed to zero height — and *which* page happened to win the race
 * varied per run: one regeneration of the 24 baselines produced 23 pages without
 * the screenshots and exactly one with them, ~1800px taller than its siblings.
 * Every historically committed baseline lost that race, so the suite never
 * actually covered the Examples imagery.
 *
 * Flipping `loading` to `eager` starts each fetch unconditionally, independent of
 * viewport position, and awaiting load/error settles the layout before the shot.
 *
 * The closing assertion is the durable half: an image that silently fails to load
 * bakes a blank box into the baseline, which stays invisible until some later run
 * loads it and then reads as a spurious visual regression. Now it fails here,
 * naming the src that never arrived.
 */
async function loadEveryImage(page: Page): Promise<void> {
  const unloaded = await page.evaluate(async (timeoutMs) => {
    const images = [...document.querySelectorAll('img')];
    for (const image of images) image.loading = 'eager';

    await Promise.all(
      images.map(async (image) => {
        if (image.complete) return;
        await new Promise<void>((resolve) => {
          const settle = (): void => {
            resolve();
          };
          image.addEventListener('load', settle, { once: true });
          image.addEventListener('error', settle, { once: true });
          setTimeout(settle, timeoutMs);
        });
      }),
    );

    return images
      .filter((image) => image.naturalWidth === 0)
      .map((image) => image.currentSrc || image.src);
  }, IMAGE_SETTLE_MS);

  expect(unloaded, 'image(s) never loaded — the baseline would bake a blank box').toEqual([]);
}

/**
 * Settle the loaded page and capture a full-page snapshot: network-idle for the
 * above-the-fold assets, a forced load of every image (`loadEveryImage`) so no
 * lazy below-the-fold screenshot is still collapsed, `document.fonts.ready`, then
 * the shot. Also asserts the locale-pinned load did NOT cross-redirect and that a
 * real page (not a blank error frame) rendered, so a URL typo or redirect loop
 * can't bake a wrong/empty baseline.
 */
async function settleAndShoot(page: Page, name: string, isUk: boolean): Promise<void> {
  await page.waitForLoadState('networkidle');

  const pathname = new URL(page.url()).pathname;
  expect(pathname.startsWith('/uk'), `unexpected cross-locale redirect to ${pathname}`).toBe(isUk);

  await loadEveryImage(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const height = await page.evaluate(() => document.body.scrollHeight);
  expect(height, 'page looks blank — did it error?').toBeGreaterThan(300);

  // Last: pinning is a capture-time tweak, not part of the settle above.
  await pinStickyForCapture(page);

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
