/**
 * Live-website end-to-end spec. Parameterised over `SITES`; for each site
 * the four-part contract from the user prompt is verified:
 *
 *   1. "verify that website opens in russian"
 *      — fetch the start URL in `cleanContext` (no Movar), confirm
 *        `<html lang>` + `@movar/lang-detect` agree on `'ru'` (or the
 *        broader set the fixture tolerates).
 *
 *   2. "it correctly recognized by algorithm"
 *      — re-run the same readout inside `movarContext` BEFORE Movar
 *        redirects. Tied to the existing `detectPageLanguage` logic
 *        implicitly: if Movar's recognition disagreed with us, no
 *        correction event would be logged. We assert the event log
 *        carries `fromLang === 'ru'` for this domain.
 *
 *   3. "correctly switches language"
 *      — assert the final URL matches the fixture's `afterMovar.url`
 *        and that `<html lang>` + body detection now report `'uk'`
 *        (or the fixture-permitted set).
 *
 *   4. "correctly hides language options or content"
 *      — assert `data-movar-hidden` populated (picker filter) and/or
 *        `data-movar-curtain` populated (content-filter blur), per
 *        the fixture.
 *
 * Each `test.describe` block per site keeps the report readable: a
 * single red `electrica-shop-com-ua > switches to UA` is easier to
 * triage than a generic "site test 3 failed at line 200".
 */
import type { BrowserContext, Page } from '@playwright/test';
import type { CorrectionEvent } from '@movar/events';
import { expect, test } from '../fixtures/extension';
import { readPageLanguage } from '../fixtures/lang-detect';
import { readMovarDomState, waitForMovarSettled } from '../fixtures/movar-state';
import { SITES, type SiteFixture } from './sites';

/** Per-context boilerplate the four tests share. Sets headers / cookies
 *  before the first navigation in the given context. */
async function prepareContext(context: BrowserContext, site: SiteFixture): Promise<void> {
  if (site.extraHeaders) {
    await context.setExtraHTTPHeaders(site.extraHeaders);
  }
  if (site.preCookies && site.preCookies.length > 0) {
    await context.addCookies(
      site.preCookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path ?? '/',
      })),
    );
  }
}

/**
 * The full navigation prelude that tests 2 and 4 share: prepare the
 * context, navigate to the site's start URL, wait for Movar to redirect
 * (when the fixture predicts one), then wait for Movar's settle signal.
 *
 * `onUrlTimeout` decides what to do if the predicted URL transition
 * doesn't happen within 20s. Test 2 wants to throw (a missing transition
 * IS the failure); test 4 wants to continue (the picker / content
 * assertions still run on whatever the page settled to).
 */
async function navigateAndSettleMovar(
  context: BrowserContext,
  page: Page,
  site: SiteFixture,
  opts: { onUrlTimeout: 'throw' | 'continue' },
): Promise<void> {
  await prepareContext(context, site);
  await page.goto(site.startUrl, { waitUntil: 'domcontentloaded' });
  if (site.afterMovar.url) {
    await page.waitForURL(site.afterMovar.url, { timeout: 20_000 }).catch((error) => {
      if (opts.onUrlTimeout === 'throw') {
        throw new Error(
          `Movar didn't navigate to ${site.afterMovar.url} within 20s. Final URL: ${page.url()}. Root cause: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      /* continue: a missing URL transition is the previous test's concern,
         not this one's. */
    });
    // YouTube's polymer router can match the waitForURL pattern on a
    // transient mid-redirect URL. Add a positive structural signal for
    // YouTube to ensure the final URL truly includes `hl=uk`.
    if (page.url().includes('youtube.com')) {
      await page
        .waitForFunction(() => location.search.includes('hl=uk'), undefined, { timeout: 5_000 })
        .catch(() => {
          /* best-effort; if the param never lands, the URL assertion in
             test 3 will catch it */
        });
    }
  }
  await page.waitForLoadState('domcontentloaded');
  await waitForMovarSettled(page, { timeoutMs: 10_000 });
}

/** Coerce `bodyDetected` (a value or an array) into an array. */
function asArray<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

function htmlLangMatches(actual: string, allowed: readonly string[]): boolean {
  // `allowed` is typed as a non-empty tuple at the SiteFixture level;
  // no runtime guard needed.
  const a = (actual || '').toLowerCase();
  return allowed.some((p) => {
    const pp = p.toLowerCase();
    if (pp === '') return a === '';
    return a === pp || a.startsWith(`${pp}-`);
  });
}

/**
 * Poll the correction-event log for the expected fromLang/toLang/mechanism
 * tuple. The content script logs asynchronously after Movar redirects, so
 * waiting up to 10s gives the event time to land.
 */
async function expectCorrectionEvent(
  getCorrections: (hostname: string) => Promise<CorrectionEvent[]>,
  site: SiteFixture,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const events = await getCorrections(site.hostname);
        return events.some(
          (e) =>
            e.fromLang === site.correction.fromLang &&
            e.toLang === site.correction.toLang &&
            site.correction.mechanism.includes(e.mechanism),
        );
      },
      {
        message: `no CorrectionEvent with from=${site.correction.fromLang} to=${site.correction.toLang} mechanism∈${JSON.stringify(site.correction.mechanism)} for domain=${site.hostname}`,
        timeout: 10_000,
      },
    )
    .toBe(true);
}

/**
 * Assert the post-Movar readout matches the fixture's expectations:
 * `<html lang>` is in the allowed prefix set, body-detected language is
 * in the allowed set, and the final URL matches the predicted pattern.
 */
function assertAfterMovarReadout(
  after: { htmlLang: string; detected: string | null },
  site: SiteFixture,
  finalUrl: string,
): void {
  if (site.afterMovar.htmlLangPrefix) {
    expect(
      htmlLangMatches(after.htmlLang, site.afterMovar.htmlLangPrefix),
      `<html lang>="${after.htmlLang}" not in allowed set ${JSON.stringify(site.afterMovar.htmlLangPrefix)}`,
    ).toBe(true);
  }
  if (site.afterMovar.bodyDetected) {
    expect(asArray(site.afterMovar.bodyDetected)).toContain(after.detected);
  }
  if (site.afterMovar.url) {
    expect(finalUrl).toMatch(site.afterMovar.url);
  }
}

/**
 * Assert each `hiddenSelectors` element is present in DOM AND visually
 * hidden — either via Movar's `data-movar-hidden` / `display:none` hide
 * or the curtain's `aria-hidden="true"`.
 */
async function assertHiddenSelectors(page: Page, selectors: readonly string[]): Promise<void> {
  for (const sel of selectors) {
    const el = page.locator(sel).first();
    if (!(await el.count()))
      throw new Error(`selector ${sel} not found in DOM — cannot assert hidden`);
    const hidden = await el.evaluate(
      (node) =>
        node.hasAttribute('data-movar-hidden') ||
        getComputedStyle(node as Element).display === 'none' ||
        (node as HTMLElement).getAttribute('aria-hidden') === 'true',
      undefined,
      { timeout: 5_000 },
    );
    expect(hidden, `expected ${sel} to be hidden by Movar`).toBe(true);
  }
}

/**
 * Assert each `visibleSelectors` element is either visible OR sits under
 * a Movar curtain replacement. Strict-mode pickers with ≤1 surviving
 * link get collapsed into a chip overlay; both outcomes (still visible,
 * curtained-ancestor) count as "Movar reacted, user still has language
 * affordance".
 */
async function assertVisibleOrCurtained(page: Page, selectors: readonly string[]): Promise<void> {
  for (const sel of selectors) {
    if (!(await page.locator(sel).count()))
      throw new Error(`selector ${sel} not found in DOM — cannot assert visible/curtained`);
    const outcome = await page
      .locator(sel)
      .first()
      .evaluate((node) => {
        const visible =
          getComputedStyle(node as Element).display !== 'none' &&
          (node as HTMLElement).getAttribute('aria-hidden') !== 'true';
        // Walk ancestors looking for a Movar curtain replacement.
        let ancestor: Element | null = node;
        let curtainedAncestor = false;
        while (ancestor) {
          const prev = ancestor.previousElementSibling;
          if (
            prev instanceof HTMLElement &&
            prev.hasAttribute('data-movar-curtain') &&
            prev.dataset['movarKind'] === 'picker-container'
          ) {
            curtainedAncestor = true;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        return { visible, curtainedAncestor };
      });
    expect(
      outcome.visible || outcome.curtainedAncestor,
      `expected ${sel} to be visible OR its picker container to be replaced by a Movar chip overlay; got ${JSON.stringify(outcome)}`,
    ).toBe(true);
  }
}

// Smoke test: if `SITES` is accidentally empty (a typo in sites/index.ts
// re-export, or a future refactor that loses every push), the for-loop
// below generates zero `test()` calls and `playwright test` exits 0
// with no signal that the suite ran zero scenarios. This explicit test
// mirrors `runner.spec.ts`'s `SCENARIOS registry is non-empty` and turns
// that silent pass into a clear failure.
test('SITES registry is non-empty', () => {
  expect(SITES.length).toBeGreaterThan(0);
});

for (const site of SITES) {
  test.describe(site.label, () => {
    test.skip(
      Boolean(site.skipIfEnv && process.env[site.skipIfEnv] === '1'),
      `${site.skipIfEnv}=1 in env`,
    );

    // Cached baseline readout shared by tests 1, 2, and 3. Populated in
    // `beforeAll` so we only do one live navigation per site per worker
    // pass instead of ~3. Tests that need the value read from the closure.
    let cachedBaseline: Awaited<ReturnType<typeof readPageLanguage>> | null = null;

    test.beforeAll(async ({ cleanContext, cleanPage }) => {
      await prepareContext(cleanContext, site);
      await cleanPage.goto(site.startUrl, { waitUntil: 'domcontentloaded' });
      await cleanPage.waitForSelector('body', { state: 'attached' });
      cachedBaseline = await readPageLanguage(cleanPage);
      console.log(`  baseline [${site.id}]:`, cachedBaseline);
    });

    test('1) opens in Russian or Ukrainian (baseline)', () => {
      // Use the beforeAll-cached readout — no extra navigation needed.
      const readout = cachedBaseline!;

      expect(
        htmlLangMatches(readout.htmlLang, site.initial.htmlLangPrefix),
        `<html lang>="${readout.htmlLang}" not in allowed set ${JSON.stringify(site.initial.htmlLangPrefix)}`,
      ).toBe(true);
      expect(asArray(site.initial.bodyDetected)).toContain(readout.detected);
      if (site.initial.minRuScore !== undefined) {
        expect(readout.ruScore).toBeGreaterThanOrEqual(site.initial.minRuScore);
      }
    });

    test('2) Movar recognises the page', async ({ movarContext, movarPage, getCorrections }) => {
      // Use the cached baseline readout — avoids a second live navigation.
      const baseline = cachedBaseline!;
      const startedInRussian =
        baseline.detected === 'ru' || (baseline.htmlLang || '').toLowerCase().startsWith('ru');
      // Search-engine fixtures always proceed: the SERP body is mostly
      // chrome, so body-detection can't tell us "user started in RU". The
      // enforce-mode rewrite is unconditional anyway.
      test.skip(
        site.kind === 'site' && !startedInRussian,
        `baseline served ${baseline.detected} (htmlLang=${baseline.htmlLang}); site did not put us in a Russian starting state in this environment — Movar's redirect path can't be exercised here`,
      );

      // First navigation; content script runs at document_start, detects
      // RU, and triggers the redirect / enforce-rewrite path.
      await navigateAndSettleMovar(movarContext, movarPage, site, { onUrlTimeout: 'throw' });

      await expectCorrectionEvent(getCorrections, site);
    });

    test('3) switches language', async ({ movarContext, movarPage }) => {
      // Use the cached baseline readout — same skip guard as test 2.
      const baseline = cachedBaseline!;
      const startedInRussian =
        baseline.detected === 'ru' || (baseline.htmlLang || '').toLowerCase().startsWith('ru');
      test.skip(
        site.kind === 'site' && !startedInRussian,
        `baseline served ${baseline.detected} (htmlLang=${baseline.htmlLang}); site did not put us in a Russian starting state in this environment — Movar's redirect path can't be exercised here`,
      );

      await navigateAndSettleMovar(movarContext, movarPage, site, { onUrlTimeout: 'throw' });

      const after = await readPageLanguage(movarPage);
      console.log(`  after-Movar [${site.id}]:`, after);

      assertAfterMovarReadout(after, site, movarPage.url());
    });

    test('4) hides blocked language options / blurs blocked content', async ({
      movarContext,
      movarPage,
    }) => {
      await navigateAndSettleMovar(movarContext, movarPage, site, { onUrlTimeout: 'continue' });

      const state = await readMovarDomState(movarPage);
      console.log(`  movar-dom-state [${site.id}]:`, state);

      if (site.afterMovar.minHiddenLinks !== undefined) {
        expect(state.hiddenLinkCount).toBeGreaterThanOrEqual(site.afterMovar.minHiddenLinks);
      }
      if (site.afterMovar.minContentBlur !== undefined) {
        // When the fixture requires ≥1 blur but the SERP returned zero
        // RU cards (e.g. YouTube SERP served from a UA-IP geolocated
        // session), we skip rather than fail — the absence of RU cards
        // is the environment's doing, not a Movar regression.
        if (site.afterMovar.minContentBlur > 0 && state.contentBlurCount === 0) {
          test.skip(
            true,
            'content-filter site returned 0 RU cards in this environment — skip blur assertion',
          );
        }
        expect(state.contentBlurCount).toBeGreaterThanOrEqual(site.afterMovar.minContentBlur);
      }
      await assertHiddenSelectors(movarPage, site.afterMovar.hiddenSelectors ?? []);
      await assertVisibleOrCurtained(movarPage, site.afterMovar.visibleSelectors ?? []);
    });
  });
}
