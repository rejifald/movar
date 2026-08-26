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
 * Matrix — 8 pages × {en, uk} × {light, dark} = 32 baselines
 * ─────────────────────────────────────────────────────────────────────
 *
 *   pages:   home · install · why-this-happens · how-movar-works ·
 *            why-not-ai · transparency · privacy · 404
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
 * Footer: `Footer.astro` renders on every page above, so a plain full-page shot
 * makes one footer-only change (say, a one-line copy edit that shifts its
 * height) invalidate all 42 of the 44 committed baselines — every page here
 * except the two `blog-post` rows, which `CLIP_HEIGHT_PX` already bounds above
 * the footer — for pixels that didn't move on any of those pages. A Playwright
 * `mask` does not fix this: a masked region still occupies pixels, so a taller
 * footer still grows the full-page image and still invalidates the baseline
 * underneath the mask. `settleAndShoot` instead measures the footer's top edge
 * (`measureFooterTop`) and clips every full-page capture to end right above
 * it, and the footer gets its own dedicated capture below instead — 4 baselines
 * (`marketing-footer-<locale>[-dark].png`), outside the page × locale × scheme
 * matrix above — so a real footer regression still has coverage.
 *
 * Header: the same argument, and the same treatment. `Header.astro` renders on
 * every page too, so its band sat in all 44 page baselines and one nav-copy edit
 * invalidated every one of them. `settleAndShoot` now starts each clip at the
 * header's bottom edge (`measureHeaderBottom`), and the header gets its own
 * dedicated capture — 4 more baselines (`marketing-header-<locale>[-dark].png`).
 * Between the two clips, a page baseline is now the page's own content and
 * nothing else, which is what it was always meant to assert.
 *
 * The post's closing block gets a dedicated capture for the OPPOSITE reason —
 * not that it is in every baseline, but that it was in none. `CLIP_HEIGHT_PX`
 * bounds the post at 3200px and `ReaderCta` sits ~11,000px down, so a
 * regression in the install panel failed nothing. `marketing-post-cta-uk
 * [-dark].png` (2 baselines, uk-only) covers it by shooting the element rather
 * than by raising the ceiling — see CLIP_HEIGHT_PX for why the ceiling stays.
 *
 * Baseline workflow: regenerate the committed Linux PNGs in the pinned Playwright
 * container via `pnpm e2e:baselines:marketing`. Don't run `--update-snapshots` on
 * a macOS host — it writes a `*-darwin.png` CI doesn't use.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/** The page types, with their en (root) and uk (/uk/…) URLs. `stem` is the
 *  baseline-filename stem (`marketing-<stem>-<locale>[-dark]`). The 404 lives at
 *  a literal `.html` (Astro emits `dist/404.html`); the rest use Astro's default
 *  directory URLs.
 *
 *  `en` is optional because the blog is deliberately Ukrainian-only (see
 *  `apps/marketing/src/content.config.ts`): those two rows have no English URL
 *  to shoot, so they contribute uk baselines only and the matrix below skips
 *  them for the en locale. */
const PAGES = [
  { stem: 'home', en: '/', uk: '/uk/' },
  { stem: 'install', en: '/install', uk: '/uk/install' },
  { stem: 'why-this-happens', en: '/why-this-happens', uk: '/uk/why-this-happens' },
  { stem: 'how-movar-works', en: '/how-movar-works', uk: '/uk/how-movar-works' },
  { stem: 'why-not-ai', en: '/why-not-ai', uk: '/uk/why-not-ai' },
  { stem: 'transparency', en: '/transparency', uk: '/uk/transparency' },
  { stem: 'privacy', en: '/privacy', uk: '/uk/privacy' },
  { stem: '404', en: '/404.html', uk: '/uk/404.html' },
  // Built and served, but noindex + out of the sitemap + unlinked while it
  // is finished (see apps/marketing/astro.config.mjs). Visual coverage does
  // not wait for a page to be public — the point is to notice when it
  // changes, and an unlinked page is exactly the kind that changes unwatched.
  { stem: 'for-ukrainian', en: '/for-ukrainian', uk: '/uk/for-ukrainian' },
  { stem: 'blog', en: undefined, uk: '/uk/blog' },
  { stem: 'blog-post', en: undefined, uk: '/uk/blog/tykha-kapitulyatsiya' },
  // The guide: the hub carries both islands and the card grid, and one page
  // stands in for the twenty, which share a single template.
  { stem: 'guide', en: undefined, uk: '/uk/guide' },
  { stem: 'guide-page', en: undefined, uk: '/uk/guide/windows' },
] as const satisfies readonly { stem: string; en: string | undefined; uk: string }[];

/**
 * Pages captured to a fixed height instead of full-page, keyed by stem.
 *
 * A blog post is the one page here whose height is set by its *prose*, not by
 * its design: the first article renders ~11,000px tall, roughly double the
 * tallest marketing page. Shooting that full-page would buy very little and
 * cost a lot — the pixels below the fold are paragraphs, so the baseline would
 * be invalidated by every wording fix in the article, and each regeneration
 * rewrites multi-megabyte PNGs through an emulated container. A gate that goes
 * red for a typo correction is a gate people learn to re-bless blindly.
 *
 * What can actually regress here is the `.article-prose` sheet in
 * `global.css`, and the clip covers a representative slice of it: h1, byline,
 * lead, body paragraphs, an inline `<code>`, a link, the first figure with its
 * caption, and the first `h2`. Content churn below that line is invisible,
 * which is the point.
 *
 * This composes with the separate footer clip in `settleAndShoot` — the
 * capture height is whichever of the two is smaller. In practice they never
 * compete on this page: the footer sits ~11,000px down, far past this 3200px
 * ceiling, so the ceiling alone decides here. It matters on every *other*
 * page, where there is no entry in this table and the footer's own top edge
 * is the only bound.
 */
const CLIP_HEIGHT_PX: Partial<Record<(typeof PAGES)[number]['stem'], number>> = {
  'blog-post': 3200,
};

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
 * Wait for a navigated page to settle before anything asserts on its pixels:
 * network-idle for the above-the-fold assets, a forced load of every image
 * (`loadEveryImage`) so no lazy below-the-fold screenshot is still collapsed,
 * then `document.fonts.ready`. Also asserts the locale-pinned load did NOT
 * cross-redirect and that a real page (not a blank error frame) rendered, so
 * a URL typo or redirect loop can't bake a wrong/empty baseline.
 *
 * Shared by the full-page captures below and the standalone footer capture —
 * both need the same "this actually loaded, in the right locale" guarantee
 * before asserting on pixels, even though the footer test only shoots one
 * element out of the page.
 */
async function settlePage(page: Page, isUk: boolean): Promise<void> {
  await page.waitForLoadState('networkidle');

  const pathname = new URL(page.url()).pathname;
  expect(pathname.startsWith('/uk'), `unexpected cross-locale redirect to ${pathname}`).toBe(isUk);

  await loadEveryImage(page);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });

  const height = await page.evaluate(() => document.body.scrollHeight);
  expect(height, 'page looks blank — did it error?').toBeGreaterThan(300);
}

/**
 * Measure the footer's top edge in full-page document coordinates — the same
 * frame `toHaveScreenshot`'s `clip` option addresses — so `settleAndShoot` can
 * end a full-page capture right above it instead of baking the footer's own
 * band into every page's baseline (see the file-level comment on why that
 * band needs to come out of the page captures at all).
 *
 * Returns `undefined` when the page renders no `<footer>`. Every marketing
 * page does today via `Footer.astro`, but this is a capture helper, not a
 * markup assertion — a future footer-less fixture (or a page mid-redesign)
 * should just lose the clip, not fail the whole suite on a `querySelector`
 * that returned null.
 */
async function measureFooterTop(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const footer = document.querySelector('footer');
    return footer ? Math.round(footer.getBoundingClientRect().top + window.scrollY) : undefined;
  });
}

/**
 * Measure the header's bottom edge in full-page document coordinates, so a
 * capture can start below it — the mirror of {@link measureFooterTop}, for the
 * same reason. `Header.astro` renders on every page here, so its band sat in
 * all 44 committed baselines: one nav-copy edit invalidated every one of them
 * for pixels that moved on none of those pages. The header gets its own
 * dedicated capture below instead.
 *
 * Measured AFTER `pinStickyForCapture`, because that is what puts the header
 * in normal flow — read while it is still `sticky` this would still be right
 * at scroll 0, but only by accident.
 *
 * Returns `undefined` when a page renders no `<header>`, for the same reason
 * the footer helper does: this is a capture helper, not a markup assertion.
 */
async function measureHeaderBottom(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    return header ? Math.round(header.getBoundingClientRect().bottom + window.scrollY) : undefined;
  });
}

/**
 * Settle the loaded page (`settlePage`) and capture a full-page snapshot,
 * clipped to end just above the footer (`measureFooterTop`) and, when the
 * caller passes one, further bounded by `clipHeight` — the smaller of the two
 * wins, so a page with both a footer and a `CLIP_HEIGHT_PX` entry gets
 * whichever constraint is tighter (see CLIP_HEIGHT_PX for why `blog-post`
 * never actually contests this: its footer sits thousands of pixels past its
 * 3200px ceiling).
 */
async function settleAndShoot(
  page: Page,
  name: string,
  isUk: boolean,
  clipHeight?: number,
): Promise<void> {
  await settlePage(page, isUk);

  // Last: pinning is a capture-time tweak, not part of the settle above.
  await pinStickyForCapture(page);

  // `clip` is in full-page coordinates here, so `height` below is "the top N
  // px of the whole document". It's the smaller of the footer's own top edge
  // (so the footer's band, and any regression in it, never lands in a page
  // baseline — see the file-level comment for why) and CLIP_HEIGHT_PX, when
  // the page has an entry there.
  const viewport = page.viewportSize();
  const footerTop = await measureFooterTop(page);
  // `clipHeight` stays a DOCUMENT-coordinate ceiling ("the top N px of the
  // page"), so the header band comes out of the slice rather than pushing the
  // ceiling down and dragging N more px of body copy into the shot.
  const top = (await measureHeaderBottom(page)) ?? 0;
  const clipCandidates = [clipHeight, footerTop].filter((h): h is number => h !== undefined);
  const bottom = clipCandidates.length > 0 ? Math.min(...clipCandidates) : undefined;

  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    ...(bottom === undefined && top === 0
      ? {}
      : {
          clip: {
            x: 0,
            y: top,
            width: viewport?.width ?? 1280,
            // No bound below: everything from the header down to the end of the
            // document.
            height: (bottom ?? (await page.evaluate(() => document.body.scrollHeight))) - top,
          },
        }),
  });
}

for (const locale of LOCALES) {
  for (const scheme of SCHEMES) {
    test.describe(`marketing — ${locale.key}${scheme.suffix ? ' (dark mode)' : ''}`, () => {
      test.use({ locale: locale.tag, colorScheme: scheme.colorScheme });

      for (const marketingPage of PAGES) {
        const url = locale.isUk ? marketingPage.uk : marketingPage.en;
        // Ukrainian-only page in the en pass: nothing to shoot, no baseline.
        if (url === undefined) continue;

        test(marketingPage.stem, async ({ page }) => {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
          });
          await settleAndShoot(
            page,
            `marketing-${marketingPage.stem}-${locale.key}${scheme.suffix}.png`,
            locale.isUk,
            CLIP_HEIGHT_PX[marketingPage.stem],
          );
        });
      }

      /**
       * The footer's own baseline — the coverage `settleAndShoot`'s clip
       * deliberately drops from every page above. Shot once, on the home
       * page, rather than once per page: `Footer.astro` renders the same
       * markup everywhere, so per-page copies would just be the same pixels
       * N times over, each needing its own regeneration for one shared
       * component's change.
       *
       * No `pinStickyForCapture` here: that guards against a sticky header's
       * scroll-dependent paint offset leaking into a *full-page* capture (see
       * its comment above). An element screenshot is cropped to the footer's
       * own bounding box regardless of the header's position — there is no
       * such offset for it to fix.
       */
      test('footer', async ({ page }) => {
        await page.goto(locale.isUk ? '/uk/' : '/', { waitUntil: 'domcontentloaded' });
        await settlePage(page, locale.isUk);

        await expect(page.locator('footer')).toHaveScreenshot(
          `marketing-footer-${locale.key}${scheme.suffix}.png`,
        );
      });

      /** The header's own baseline — the other half of what the page clip
       *  drops. Same one-shot reasoning as the footer above. */
      test('header', async ({ page }) => {
        await page.goto(locale.isUk ? '/uk/' : '/', { waitUntil: 'domcontentloaded' });
        await settlePage(page, locale.isUk);

        await expect(page.locator('header')).toHaveScreenshot(
          `marketing-header-${locale.key}${scheme.suffix}.png`,
        );
      });

      /**
       * The block that closes a post — the install panel and the follow row.
       *
       * It needs its own capture for the opposite reason to the header and the
       * footer: not because it is in every baseline, but because it is in none.
       * `CLIP_HEIGHT_PX` bounds the post at 3200px and the panel sits ~11,000px
       * down, so a regression there would have failed nothing. Shooting the
       * element rather than raising the ceiling keeps the coverage without
       * putting 8,000px of article prose into a baseline that a typo fix would
       * then invalidate (see CLIP_HEIGHT_PX).
       *
       * Ukrainian only: the blog is a single-locale section, so the en pass has
       * no post to open.
       */
      if (locale.isUk) {
        test('post-cta', async ({ page }) => {
          await page.goto('/uk/blog/tykha-kapitulyatsiya', { waitUntil: 'domcontentloaded' });
          await settlePage(page, locale.isUk);

          await expect(page.locator('[data-reader-cta]')).toHaveScreenshot(
            `marketing-post-cta-${locale.key}${scheme.suffix}.png`,
          );
        });
      }
    });
  }
}
