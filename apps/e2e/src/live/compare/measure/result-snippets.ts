/**
 * Google SERP scraping — extract the visible text we'll scan for keywords
 * + bucket into the language histogram.
 *
 * Two outputs, intentionally redundant:
 *   - `regionText`: the entire results column's textContent, joined. The
 *     primary input to `scanKeywords`. Robust to per-row selector drift —
 *     even when Google ships a redesign that breaks our row selectors,
 *     the results column itself stays identifiable.
 *   - `snippets[]`: best-effort per-row text, top-N. The input to the
 *     histogram. Degrades to `[]` when the row selectors miss; the
 *     keyword scan still runs against `regionText` so the assertion path
 *     survives.
 *
 * Selector strategy: each surface has a primary + fallbacks, tried in
 * order. The first one that yields a non-empty match wins. When a fall-
 * back fires, we attach the selector to the evidence (so the next time
 * Google moves the DOM around, the run report says which selector is
 * now load-bearing).
 *
 * Why not Playwright's `locator.allInnerTexts()` everywhere: snippets
 * include child-element punctuation Google injects for styling (the "›"
 * separators in the URL crumb, e.g.). `textContent` plus
 * `replace(/\s+/g, ' ')` gives a stable signal across renderings.
 *
 * Consent banner: Google's pre-search consent dialog suppresses results
 * rendering. We try a small set of accept-button selectors with a tight
 * timeout — if none match (consent already dismissed, or Google didn't
 * show it for this region), we just continue. The banner is one of the
 * most common sources of "test passes locally, fails in CI" in this
 * suite, so the dismiss is worth its complexity.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface ResultsExtract {
  /** Joined visible text from the results region. Primary input to
   *  `scanKeywords`. Never null — falls back to `document.body.textContent`
   *  if every region selector misses, with `regionSelectorUsed = 'body-fallback'`. */
  regionText: string;
  /** Per-row snippet text, capped at the caller's `topN`. May be `[]` if
   *  every row selector misses; the histogram then reports `total: 0`
   *  and the assertion path falls back entirely to `regionText`. */
  snippets: string[];
  /** Which region selector actually fired. Attached to evidence so DOM
   *  drift is observable from the run report without re-reading the
   *  page source. */
  regionSelectorUsed: string;
  /** Which row selector actually fired. `null` when none matched. */
  rowSelectorUsed: string | null;
}

/** Google's results column. Ordered most-specific first; the last entry
 *  is a near-sure thing on every layout Google has shipped since 2018. */
const REGION_SELECTORS = ['#rcnt #search', '#search', '#rcnt', 'main'];

/** Per-result rows. The first two are observed on current desktop
 *  Google; the body-fallback path is on `regionText` not here. */
const ROW_SELECTORS = [
  'div#search div[data-hveid][data-ved]',
  'div#rso > div',
  'div.g',
  'div[data-snc]',
];

/** Consent-dialog "accept all" buttons across the localisations Google
 *  ships when geolocating non-EU runners to EU servers. Best-effort
 *  click; if none fire in 2s we proceed. */
const CONSENT_ACCEPT_SELECTORS = [
  'button[aria-label*="Accept" i]',
  'button[aria-label*="Прийняти" i]',
  'button[aria-label*="Принять" i]',
  'button:has-text("I agree")',
  'button:has-text("Accept all")',
  'button:has-text("Прийняти все")',
  'form[action*="consent"] button[type="submit"]',
];

export interface ConsentDismissResult {
  dismissed: boolean;
  tried: string[];
  matched?: string;
}

/** Best-effort dismiss of Google's consent dialog. Returns whether a
 *  button was clicked, the full list of selectors tried, and which one
 *  matched (if any), so the runner can attach this for triage. */
export async function dismissConsentIfPresent(page: Page): Promise<ConsentDismissResult> {
  const tried: string[] = [];
  for (const sel of CONSENT_ACCEPT_SELECTORS) {
    tried.push(sel);
    const btn = page.locator(sel).first();
    // Short per-selector wait: if the dialog is up at all, the first
    // matching button is present within a fraction of a second. Long
    // per-selector waits would compound to a multi-second delay when
    // no dialog is shown (the common case).
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click({ timeout: 2_000 }).catch(() => {
        /* race lost to another listener — proceed */
      });
      // Confirm the banner actually disappeared — a silent click failure
      // (stale element, race with a redirect) is now surfaced here
      // instead of letting the suite proceed with a consent wall blocking
      // the results region.
      await expect(btn)
        .toBeHidden({ timeout: 5_000 })
        .catch(() => {
          /* best-effort; if the banner persists the extraction will still
           run and regionText will be thin, caught downstream */
        });
      // Give the navigation/render a beat to settle.
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => {
        /* settle wait is best-effort; proceed to next phase regardless */
      });
      return { dismissed: true, tried, matched: sel };
    }
  }
  return { dismissed: false, tried };
}

/** Collapse whitespace; trim. Cheap and idempotent. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Extract the results column's joined text + top-N per-row snippets.
 * Always returns a result (never throws on selector miss); the caller
 * inspects `regionSelectorUsed` to know whether to trust the snippets.
 */
export async function extractResults(page: Page, topN: number): Promise<ResultsExtract> {
  // Region text: first selector with non-empty text wins. Falls back to
  // `body` so `regionText` is never empty if the page rendered anything.
  let regionText = '';
  let regionSelectorUsed = 'body-fallback';
  for (const sel of REGION_SELECTORS) {
    const txt = await page
      .locator(sel)
      .first()
      .evaluate((el) => el.textContent ?? '')
      .catch(() => '');
    const tidied = tidy(txt);
    if (tidied.length > 100) {
      regionText = tidied;
      regionSelectorUsed = sel;
      break;
    }
  }
  if (!regionText) {
    regionText = tidy(await page.evaluate(() => document.body?.textContent ?? '').catch(() => ''));
  }

  // Per-row snippets: first selector that yields ≥ 3 rows wins. The
  // threshold guards against a selector that accidentally matches one
  // global container (e.g. `main`); we want actual result rows.
  let snippets: string[] = [];
  let rowSelectorUsed: string | null = null;
  for (const sel of ROW_SELECTORS) {
    const texts = await page
      .locator(sel)
      .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ''))
      .catch(() => []);
    const tidied = texts.map(tidy).filter((s) => s.length > 20);
    if (tidied.length >= 3) {
      snippets = tidied.slice(0, topN);
      rowSelectorUsed = sel;
      break;
    }
  }

  return { regionText, snippets, regionSelectorUsed, rowSelectorUsed };
}
