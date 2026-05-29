/*
 * Capture the marketing-site before/after pair —
 * `apps/marketing/public/screenshots/google-{without,with}-movar.png`.
 *
 * Strategy: navigate real Chrome to two google.com.ua URLs and
 * screenshot the rendered SERPs. We don't need to load the extension
 * because Movar's only user-visible Google behavior is appending
 * `&hl=uk&lr=lang_uk` to the search URL and rewriting Accept-Language
 * to `uk`-first — both of which we set directly on the Playwright
 * context. Google itself returns Ukrainian-prioritized results when
 * those params are present; that's what makes the comparison honest.
 *
 *   without  → google.com.ua/search?q=<query>                  +
 *              ru-leaning Accept-Language (legacy-Russian-browser case)
 *   with     → google.com.ua/search?q=<query>&hl=uk&lr=lang_uk +
 *              uk-UA Accept-Language + Movar's Google rule params
 *
 * The asymmetry is the point: Movar's pitch addresses Ukrainian users
 * with non-UA browser locales (legacy Russian-default Windows installs
 * common on older hardware, system locales inherited from earlier
 * OS choices, etc.). The "without" captures what such a user actually
 * sees today on google.com.ua; the "with" captures what Movar
 * negotiates in their place. Strictly-fair (same locale in both)
 * comparison is also defensible but makes Movar's dramatic effect
 * invisible — see earlier turns in this script's history.
 *
 * Why real Chrome (`channel: 'chrome'`) + `launchPersistentContext`
 * + `headless: false`: bundled Chromium in default headless mode
 * trips Google's bot-detection and lands on the "/sorry/index" CAPTCHA
 * page. A real Chrome binary with a fresh on-disk profile and a
 * visible window is treated as a human session. The capture takes a
 * few seconds and pops a window — acceptable for an on-demand script.
 *
 * Cookie consent: we pre-set `SOCS` / `CONSENT` cookies so Google's
 * EU/UA consent modal is dismissed before the page paints. If a
 * consent dialog still appears (Google rotates its consent flow), we
 * fall back to clicking the dismiss button by text.
 *
 * Not added to `verify:release` — on-demand only, with re-runs
 * expected ~quarterly as Google's SERP layout and our query's
 * ranking drift. Run with:
 *   pnpm --filter @movar/extension exec tsx \
 *     scripts/capture-marketing-before-after.mts
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(here, '..');
const marketingPublicDir = path.resolve(extensionRoot, '..', 'marketing', 'public', 'screenshots');

const VIEWPORT = { width: 1280, height: 800 } as const;
// Query choice: needs to survive Movar's `lr=lang_uk` strict filter — many
// Cyrillic e-commerce queries (including the canonical "Реле напруги")
// trip Google into "не знайдено жодного документа" and leave the
// with-Movar screenshot blank after noise-strip. "новини війни"
// (war news) produces results in both states: from a ru-leaning browser
// without Movar, Google ranks ru-language Wikipedia / news / topic
// pages on top; with Movar's `&hl=uk&lr=lang_uk` applied, Ukrainian
// news outlets (Українська правда, УНІАН) and uk-Wikipedia move up.
// If this query's behavior drifts, re-run the candidate sweep snapshot
// in this file's git history and pick a new survivor.
const QUERY = 'новини війни';
const Q = encodeURIComponent(QUERY);

interface Capture {
  variant: 'without' | 'with';
  filename: string;
  url: string;
  /** Wire-form Accept-Language; the without case stays browser-default
   *  (no UA prioritization), the with case mirrors what Movar's
   *  declarativeNetRequest rule sends. */
  acceptLanguage: string;
  /** Playwright context `locale` — affects `navigator.language` and
   *  Google's own server-side locale detection. */
  locale: string;
}

const CAPTURES: readonly Capture[] = [
  {
    variant: 'without',
    filename: 'google-without-movar.png',
    url: `https://www.google.com.ua/search?q=${Q}`,
    // Russian-leaning Accept-Language represents the legacy Ukrainian
    // browser config that Movar targets — system locale ru-RU (very
    // common on older Windows + macOS installs in Ukraine). With this
    // header and a bare URL, Google ranks the RU pages of Ukrainian
    // e-commerce sites first.
    acceptLanguage: 'ru-RU,ru;q=0.9,en;q=0.7',
    locale: 'ru-RU',
  },
  {
    variant: 'with',
    filename: 'google-with-movar.png',
    // Matches Movar's google.com.ua rule in packages/rules/src/index.ts:
    // `&hl=uk&lr=lang_uk` on /search URLs.
    url: `https://www.google.com.ua/search?q=${Q}&hl=uk&lr=lang_uk`,
    acceptLanguage: 'uk-UA,uk;q=0.9,en;q=0.8',
    locale: 'uk-UA',
  },
];

/**
 * Selectors of SERP elements to strip out so only the search box and
 * the organic results remain. Captured by walking the DOM up from the
 * visible AI Overview / Sponsored Products markers on a real
 * google.com.ua SERP — IDs like `#m-x-content` (AI Overview's modular
 * content wrapper) and `#atvcap` (the ads cap) are stable; class
 * names like `WAUd4` rotate on Google's deploys, so we lean on IDs
 * and `jsname`/`jscontroller` attributes wherever possible.
 *
 * If a selector stops matching after a Google deploy, re-run the
 * DOM-walk debug script and search by the visible Ukrainian text
 * markers ("Огляд від ШІ", "Рекламовані товари") rather than class
 * hashes — that's what produced this list to begin with.
 *
 * Removed instead of `display:none`-hidden: the layout collapses
 * naturally so the organic results pull up to right below the search
 * box, with no orphan whitespace where the AI Overview used to be.
 */
const NOISE_SELECTORS: readonly string[] = [
  // Navigation tabs row (Усі / Зображення / Покупки / …). The tabs
  // are inside `<role=navigation>`; the surrounding IDs (`#hdtb`,
  // `#top_nav`, `#appbar`) provide belt-and-braces coverage across
  // Google's layout variants.
  '#hdtb',
  '#top_nav',
  '#hdtbMenus',
  '#appbar',
  '[role="navigation"]',
  // AI Overview / SGE summary block. We strip the entire `#dEwkXc`
  // module wrapper — `#m-x-content` alone leaves orphan padding from
  // its parent module container. `[jsname="txosbe"]` and the
  // `.h7Tj7e` wrapper catch fallback layouts.
  '#dEwkXc',
  '#m-x-content',
  '[jsname="txosbe"]',
  '.h7Tj7e',
  // Sponsored products carousel (#atvcap is the ads cap, #bGmlqc the
  // inner container) and other ad slots.
  '#atvcap',
  '#bGmlqc',
  '#tads',
  '#tadsb',
  '#taw',
  '#bottomads',
  '[data-text-ad]',
  '[data-pcu]',
  // Right-side knowledge panel / entity card
  '#rhs',
  // "People also ask" + the "Показати більше" expander button that
  // sometimes survives the module strip.
  '[jsname="Cpkphb"]',
  '[jsname="lprdSe"]',
  '[data-initq]',
  '.related-question-pair',
  '[data-async-context*="related_search"]',
  '#botstuff',
  // "Looking for results in English?" inline notice
  '[role="status"]',
] as const;

/**
 * Google's EU/UA consent banner blocks first paint until the user
 * acknowledges. Pre-seeding `SOCS` + `CONSENT` cookies skips the
 * modal entirely for most rollouts; the click-fallback covers the
 * cases where Google A/B-tests a new variant our cookies don't match.
 */
const CONSENT_COOKIES = [
  {
    name: 'CONSENT',
    value: 'YES+cb.20240101-08-p0',
    domain: '.google.com.ua',
    path: '/',
  },
  {
    name: 'SOCS',
    value: 'CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjQwODEzLjA1X3AwGgJlbiACGgYIgM',
    domain: '.google.com.ua',
    path: '/',
  },
] as const;

async function dismissConsentIfPresent(page: Page): Promise<void> {
  // Cookies usually do it; this is the click-fallback. We try the
  // common phrasings across UA + EN, with short timeouts so a
  // legitimate "no banner" case doesn't stall the capture.
  const candidates = [
    page.getByRole('button', { name: /^reject all$/i }),
    page.getByRole('button', { name: /^accept all$/i }),
    page.getByRole('button', { name: /^відхилити все$/i }),
    page.getByRole('button', { name: /^прийняти все$/i }),
    page.getByRole('button', { name: /я погоджуюсь/i }),
  ];
  for (const c of candidates) {
    try {
      if (await c.isVisible({ timeout: 500 })) {
        await c.click();
        // Let the modal teardown animation finish so the screenshot
        // doesn't catch a half-faded overlay.
        await page.waitForTimeout(400);
        return;
      }
    } catch {
      // Locator was a no-match for this variant; try the next one.
    }
  }
}

async function capture(cap: Capture): Promise<void> {
  // Fresh user-data-dir per capture so cookies/storage from the
  // previous variant don't leak across the comparison. Real Chrome
  // (`channel: 'chrome'`) + a visible window get us past Google's
  // bot challenge; bundled headless Chromium reliably hits
  // /sorry/index for this query.
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'movar-serp-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: cap.locale,
    extraHTTPHeaders: { 'Accept-Language': cap.acceptLanguage },
    reducedMotion: 'reduce',
    args: [
      // Suppresses the navigator.webdriver fingerprint — Google's
      // bot heuristics check this and a real Chrome session won't
      // have it set.
      '--disable-blink-features=AutomationControlled',
    ],
  });
  await context.addCookies(CONSENT_COOKIES.map((c) => ({ ...c })));
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(cap.url, { waitUntil: 'domcontentloaded' });
    await dismissConsentIfPresent(page);
    // `#main` is Google's outer SERP wrapper — present whether or not
    // organic results exist. Waiting on `#search` would time out when
    // `lr=lang_uk` over-filters, because Google then renders an empty
    // (display:none) #search above a "no documents found" message.
    await page.waitForSelector('#main', { timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    // One more settle for any post-load layout shift (lazy-loaded
    // sidebar widgets, etc.).
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    // Strip noise elements *after* the SERP has finished loading —
    // Google reflows aggressively during load, and our removals would
    // be re-stomped if applied before #rso settles. We `remove()`
    // rather than `display:none`-hide so the layout collapses and the
    // organic results pull up flush against the search box.
    await page.evaluate(
      (selectors) => {
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        }
      },
      NOISE_SELECTORS as unknown as string[],
    );
    // Small visual settle for the post-removal layout reflow.
    await page.waitForTimeout(400);
    const outPath = path.resolve(marketingPublicDir, cap.filename);
    await page.screenshot({
      path: outPath,
      type: 'png',
      fullPage: false,
      omitBackground: false,
    });
    console.log(`  📸 ${cap.filename}`);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await mkdir(marketingPublicDir, { recursive: true });
  console.log(`▶ Output dir: ${path.relative(extensionRoot, marketingPublicDir)}`);
  for (const cap of CAPTURES) {
    await capture(cap);
  }
  console.log('✓ Done.');
}

await main();
