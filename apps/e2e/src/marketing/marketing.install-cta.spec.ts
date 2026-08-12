/**
 * Behaviour coverage for the marketing install CTA's browser-conditional
 * handoff — the one marketing behaviour with no pixels to assert, so the visual
 * suite next door can't see it at all.
 *
 * The rule under test (apps/marketing/src/lib/downloads.ts `needsInstallGuide`):
 * on browsers whose store page is the whole story, the CTA is a plain same-tab
 * link to the marketplace. On Edge and Safari it is not — Edge installs from the
 * Chrome Web Store behind an "allow extensions from other stores" prompt the CWS
 * listing never mentions, and an App Store install leaves the Safari extension
 * switched off — so there the click has to reach the guide as well.
 *
 * What the assertions really pin down is that the two destinations are NOT
 * symmetric, because only one of them can be scripted without meeting a popup
 * blocker: the store must ride the link's own `target="_blank"`, and the guide
 * must be the same-tab navigation. A refactor that swapped them would still
 * "open both" here on Chromium and would silently lose the store tab on Safari.
 *
 * Runs on the same `astro preview` server as the visual suite (see
 * `playwright.marketing.config.ts`). Storefront navigations are trapped, so no
 * test here reaches the real internet.
 */
import { expect, test } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';

/** UA strings the site's `detectBrowser()` keys off. Pinned rather than taken
 *  from the runner's chromium so a Playwright bump can't quietly re-route a
 *  case: Edge and Opera UAs also say "Chrome", and Safari's says neither. */
const UA = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  safariIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
} as const;

const CHROME_STORE = /chromewebstore\.google\.com/;
const APP_STORE = /apps\.apple\.com/;
/** The preview origin — anything else is a storefront the CTA is sending us to. */
const OFF_ORIGIN = /^https?:\/\/(?!127\.0\.0\.1[:/])/;

/**
 * Trap every off-origin request and return the running list of what was asked
 * for. The CTA's whole job is to reach a real storefront, and a `_blank` click
 * really does open one, so without this the suite would hit the live Chrome Web
 * Store / App Store on each run.
 *
 * Aborted rather than stubbed, which is not a stylistic choice: Chromium refuses
 * to host a document on the Chrome Web Store origin under automation and tears
 * the whole tab down the moment such a navigation commits, killing the test
 * around it. Aborting records the destination without ever committing it — and
 * it leaves the tab that asked exactly where it was, which is what the
 * "this tab did / didn't move" assertions below want anyway.
 */
async function trapStorefronts(context: BrowserContext): Promise<string[]> {
  const attempted: string[] = [];
  await context.route(OFF_ORIGIN, async (route) => {
    attempted.push(route.request().url());
    await route.abort();
  });
  return attempted;
}

/** Wait until a storefront matching `store` has been asked for. Polled because
 *  the request leaves slightly after the click that caused it resolves. */
async function expectStoreRequested(attempted: string[], store: RegExp): Promise<void> {
  await expect
    .poll(() => attempted.filter((url) => store.test(url)).length, {
      message: `expected a request to ${store.source}, saw ${JSON.stringify(attempted)}`,
    })
    .toBeGreaterThan(0);
}

/** The hero/guide CTA, after its inline script has resolved the browser. The
 *  SSR href is the GitHub fallback, so waiting for a resolved store href is what
 *  proves detection ran — otherwise every assertion below could pass against the
 *  pre-script markup. */
async function resolvedCta(page: Page, store: RegExp) {
  const cta = page.locator('[data-cta]');
  await expect(cta).toHaveAttribute('href', store);
  return cta;
}

test.describe('install CTA — browsers whose store page is enough', () => {
  test.use({ userAgent: UA.chrome, locale: 'en-US' });

  test('Chrome goes straight to the store, in this tab, with no guide detour', async ({
    context,
    page,
  }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, CHROME_STORE);

    // No `target` — the store is this tab's own navigation. Adding one here
    // would be the regression: Chromium pops the extension's own onboarding
    // after install, so a second tab would have nothing left to say.
    expect(await cta.getAttribute('target')).toBeNull();
    await expect(cta).not.toContainText('new tab');

    await cta.click();
    await expectStoreRequested(attempted, CHROME_STORE);

    // One tab, and it was never routed through the guide on the way.
    expect(context.pages()).toHaveLength(1);
    expect(page.url()).not.toContain('/install');
  });
});

test.describe('install CTA — Edge', () => {
  test.use({ userAgent: UA.edge, locale: 'en-US' });

  test('opens the store in a new tab and follows this one to the guide', async ({
    context,
    page,
  }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, CHROME_STORE);

    // The store rides the link's own activation — never popup-blocked, and it
    // takes the foreground tab, so the page where the install actually happens
    // is the one that keeps focus.
    await expect(cta).toHaveAttribute('target', '_blank');
    await expect(cta).toHaveAttribute('rel', 'noopener');
    // `target="_blank"` is announced to nobody without this.
    await expect(cta).toContainText('new tab');

    const storeTab = context.waitForEvent('page');
    await cta.click();

    await storeTab;
    await expectStoreRequested(attempted, CHROME_STORE);
    await page.waitForURL(/\/install\/?$/);

    // The payoff, and the whole reason Edge sits on this side of the rule: the
    // "allow extensions from other stores" note, which the CWS listing the
    // visitor is now looking at never mentions.
    await expect(page.locator('[data-edge-note]')).toBeVisible();
  });
});

test.describe('install CTA — Safari', () => {
  test.use({ userAgent: UA.safari, locale: 'en-US' });

  test('hands off to the guide, where the enable step lives', async ({ context, page }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, APP_STORE);
    await expect(cta).toHaveAttribute('target', '_blank');

    const storeTab = context.waitForEvent('page');
    await cta.click();

    await storeTab;
    await expectStoreRequested(attempted, APP_STORE);
    await page.waitForURL(/\/install\/?$/);

    // An App Store install does not switch the extension on, so the guide has
    // to be showing Safari's own flow rather than the Chromium one.
    await expect(page.locator('[data-flow="safari"]')).toBeVisible();
    await expect(page.locator('[data-flow="chromium"]')).toBeHidden();
  });
});

test.describe('install CTA — iOS Safari', () => {
  test.use({ userAgent: UA.safariIos, locale: 'en-US' });

  test('hands off to the iOS flow', async ({ context, page }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, APP_STORE);
    await expect(cta).toHaveAttribute('target', '_blank');

    const storeTab = context.waitForEvent('page');
    await cta.click();

    await storeTab;
    await expectStoreRequested(attempted, APP_STORE);
    await page.waitForURL(/\/install\/?$/);

    // iOS is the case with no extension onboarding at all — the enable step
    // lives in the Settings app, so this panel is the only place it is ever
    // said.
    await expect(page.locator('[data-flow="safariIos"]')).toBeVisible();
  });
});

test.describe('install CTA — Ukrainian', () => {
  test.use({ userAgent: UA.edge, locale: 'uk-UA' });

  test('hands off to the Ukrainian guide, not the English one', async ({ context, page }) => {
    await trapStorefronts(context);
    await page.goto('/uk/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, CHROME_STORE);

    const storeTab = context.waitForEvent('page');
    await cta.click();

    await storeTab;
    await page.waitForURL(/\/uk\/install\/?$/);
  });
});

test.describe('install CTA — already on the guide', () => {
  test.use({ userAgent: UA.edge, locale: 'en-US' });

  test('does not hand off to the page the visitor is reading', async ({ context, page }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/install', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, CHROME_STORE);

    // The guide renders the same CTA component; without the suppression this
    // click would reload the guide out from under the visitor.
    expect(await cta.getAttribute('target')).toBeNull();

    await cta.click();
    await expectStoreRequested(attempted, CHROME_STORE);
    expect(context.pages()).toHaveLength(1);
  });
});

test.describe('install CTA — header nav link', () => {
  test.use({ userAgent: UA.edge, locale: 'en-US' });

  test('mirrors the hero CTA rather than drifting from it', async ({ context, page }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Desktop row and mobile menu each render one; the desktop row is first.
    const navLink = page.locator('[data-download-cta]').first();
    await expect(navLink).toHaveAttribute('href', CHROME_STORE);
    await expect(navLink).toHaveAttribute('target', '_blank');

    const storeTab = context.waitForEvent('page');
    await navLink.click();

    await storeTab;
    await expectStoreRequested(attempted, CHROME_STORE);
    await page.waitForURL(/\/install\/?$/);
  });
});

test.describe('install CTA — footer link', () => {
  test.use({ userAgent: UA.edge, locale: 'en-US' });

  test('installs rather than scrolling to the hero', async ({ context, page }) => {
    const attempted = await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // The regression this pins: the footer's "Install" used to be a `#download`
    // jump to the hero, so the same word meant "install" in the header and
    // "scroll" in the footer. Anything ending in `#download` is that link back.
    const footerLink = page.locator('footer [data-download-cta]');
    await expect(footerLink).toHaveAttribute('href', CHROME_STORE);
    await expect(footerLink).toHaveAttribute('target', '_blank');

    const storeTab = context.waitForEvent('page');
    await footerLink.click();

    await storeTab;
    await expectStoreRequested(attempted, CHROME_STORE);
    await page.waitForURL(/\/install\/?$/);
  });
});

test.describe('install CTA — modified click', () => {
  test.use({ userAgent: UA.edge, locale: 'en-US' });

  test('leaves this tab alone when the visitor asked for a background tab', async ({
    context,
    page,
  }) => {
    await trapStorefronts(context);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cta = await resolvedCta(page, CHROME_STORE);

    // The store still gets its tab (a background one here, which is why this
    // asserts the tab opened rather than that it fetched — headless Chromium
    // doesn't commit a background tab's navigation until it's foregrounded).
    const storeTab = context.waitForEvent('page');
    await cta.click({ modifiers: ['ControlOrMeta'] });
    await storeTab;

    // Proving a negative: the handoff runs one task behind the click, so give
    // the navigation that must NOT happen a generous window to happen in.
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('/install');
  });
});
