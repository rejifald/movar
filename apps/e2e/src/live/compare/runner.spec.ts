/**
 * Compare-suite runner — paired baseline (no Movar) vs treatment (with
 * Movar) on the same Google query, same Accept-Language, same minute.
 *
 * For each scenario:
 *   1. Build `https://www.google.com/search?q=<encoded query>`.
 *   2. Run both legs concurrently in their respective contexts. The
 *      fixture supplies `cleanContext`/`cleanPage` (no extension) and
 *      `movarContext`/`movarPage` (extension loaded + seeded).
 *      Concurrency minimises wall-clock skew — if Google's serving
 *      shifts in 30s the two legs would see different SERPs.
 *   3. On each leg, dismiss the consent banner if present, wait for
 *      results to render (and, for the treatment leg, wait for Movar
 *      to settle), extract results region text + top-10 row snippets.
 *   4. Capture evidence (full-page screenshot + reading JSON) for both
 *      legs BEFORE running assertions, so a failing test still
 *      attaches both bundles for triage.
 *   5. Assert: baseline reproduces the bug (≥ N leaks), treatment
 *      passes the fix contract (0 leaks, ≥ M markers, URL contains
 *      hl=uk, html lang=uk).
 *
 * Hard-fail policy: a baseline leg with too few leaks fails the test
 * with a "bug not reproduced" message. That's the user's chosen
 * policy — when the witness disappears (Google's locale guessing
 * improved, or our egress IP is no longer right), we want to be told,
 * not silently coast.
 *
 * Concurrency note: Promise.all on two same-host navigations from one
 * runner can trip Google's anti-bot. If we see CAPTCHAs in nightly,
 * the fix is sequencing the navigations (baseline → treatment) with
 * a small gap — adds ~10s wall-clock per scenario, removes the
 * simultaneity signature.
 */
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { test, expect } from '../../fixtures/extension';
import { waitForMovarSettled } from '../../fixtures/movar-state';
import { SCENARIOS } from './scenarios';
import type { CompareScenario } from './scenarios';
import { dismissConsentIfPresent, extractResults } from './measure/result-snippets';
import { scanKeywords } from './measure/keywords';
import { buildSnippetHistogram } from './measure/lang-histogram';
import { attachLegEvidence } from './measure/evidence';
import type { LegName, LegReading } from './measure/evidence';

const GOOGLE_SEARCH_BASE = 'https://www.google.com/search';
const TOP_N_SNIPPETS = 10;

function buildGoogleSearchUrl(query: string): string {
  return `${GOOGLE_SEARCH_BASE}?q=${encodeURIComponent(query)}`;
}

/** Defensive `sei` strip — Google appends this opaque session-event
 *  token after the first navigation/consent flow and uses it to bias
 *  subsequent results toward the prior session's locale guess. Movar's
 *  Google rule already strips it on the treatment leg as part of its
 *  rewrite; the runner does it for the baseline leg only so measurements
 *  are symmetric (the baseline leg also reaches measurement with sei
 *  removed, so a language delta can't be attributed to sei carryover
 *  on the no-Movar side). Returns whether a strip happened, recorded
 *  in evidence. */
async function stripSeiIfPresent(page: Page): Promise<boolean> {
  const current = new URL(page.url());
  if (!current.searchParams.has('sei')) return false;
  current.searchParams.delete('sei');
  await page.goto(current.toString(), { waitUntil: 'domcontentloaded' });
  return true;
}

interface LegPrep {
  seiStripped: boolean;
  movarNotSettled: boolean;
  consentDismissed: boolean;
}

/** Navigate to `url`, handle consent banner, strip sei on baseline,
 *  and wait for Movar settle on treatment. Returns metadata about what
 *  happened so it can be recorded in evidence. Isolated so `runLeg`
 *  stays focused on measurement + evidence capture. */
async function prepareLeg(
  legName: LegName,
  context: BrowserContext,
  page: Page,
  url: string,
  scenario: CompareScenario,
): Promise<LegPrep> {
  if (scenario.extraHeaders) {
    await context.setExtraHTTPHeaders(scenario.extraHeaders);
  }
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const consentResult = await dismissConsentIfPresent(page);

  // Strip `sei` on the baseline leg only. Movar's Google rule already
  // strips it on treatment; doing it twice risks a second navigation
  // after Movar has settled.
  let seiStripped = false;
  if (legName === 'baseline') {
    seiStripped = await stripSeiIfPresent(page);
    if (seiStripped) await dismissConsentIfPresent(page);
  }

  let movarNotSettled = false;
  if (legName === 'treatment') {
    // Movar runs at document_start and settles within ~1-2s; don't
    // start scraping mid-mutation.
    await waitForMovarSettled(page, { timeoutMs: 15_000 }).catch(() => {
      movarNotSettled = true;
    });
  }

  // Brief networkidle wait lets late Google round-trips (logo, ads)
  // finish without blocking forever on long-poll requests.
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});

  return { seiStripped, movarNotSettled, consentDismissed: consentResult.dismissed };
}

type PartialExtract = Awaited<ReturnType<typeof extractResults>> | undefined;

/** Normalise a potentially-undefined extract into concrete fields,
 *  substituting safe defaults where the measurement phase threw. */
function extractOrDefault(extract: PartialExtract) {
  return {
    regionSelectorUsed: extract?.regionSelectorUsed ?? 'unknown',
    rowSelectorUsed: extract?.rowSelectorUsed ?? null,
    regionTextChars: extract?.regionText.length ?? 0,
    snippets: extract?.snippets ?? [],
  };
}

/** Merge normalised measurement fields with prep metadata into a
 *  complete `LegReading`. Pure function — no I/O. */
function buildReading(
  page: Page,
  prep: LegPrep,
  htmlLang: string,
  extract: PartialExtract,
  russianLeak: ReturnType<typeof scanKeywords> | undefined,
  ukrainianMarker: ReturnType<typeof scanKeywords> | undefined,
  histogram: ReturnType<typeof buildSnippetHistogram> | undefined,
): LegReading {
  return {
    url: page.url(),
    htmlLang,
    ...extractOrDefault(extract),
    russianLeak: russianLeak ?? { hits: 0, matched: [] },
    ukrainianMarker: ukrainianMarker ?? { hits: 0, matched: [] },
    histogram: histogram ?? { total: 0, ru: 0, uk: 0, en: 0, be: 0, bg: 0, unknown: 0 },
    consentDismissed: prep.consentDismissed,
    seiStripped: prep.seiStripped,
  };
}

/** Attach full-page evidence and log a console summary for headed
 *  debugging. Called from `runLeg`'s finally block so artifacts are
 *  captured even when an assertion fails mid-measurement. */
async function captureEvidence(
  testInfo: TestInfo,
  legName: LegName,
  scenarioId: string,
  page: Page,
  prep: LegPrep,
  htmlLang: string,
  extract: PartialExtract,
  russianLeak: ReturnType<typeof scanKeywords> | undefined,
  ukrainianMarker: ReturnType<typeof scanKeywords> | undefined,
  histogram: ReturnType<typeof buildSnippetHistogram> | undefined,
): Promise<LegReading> {
  const reading = buildReading(
    page,
    prep,
    htmlLang,
    extract,
    russianLeak,
    ukrainianMarker,
    histogram,
  );
  await attachLegEvidence(testInfo, legName, page, reading);
  console.log(`  ${legName} [${scenarioId}]:`, {
    url: reading.url,
    htmlLang: reading.htmlLang,
    leaks: reading.russianLeak.hits,
    leakWords: reading.russianLeak.matched,
    markers: reading.ukrainianMarker.hits,
    markerWords: reading.ukrainianMarker.matched,
    histogram: reading.histogram,
    regionTextChars: reading.regionTextChars,
    rowSelectorUsed: reading.rowSelectorUsed,
    consentDismissed: prep.consentDismissed,
    seiStripped: prep.seiStripped,
  });
  return reading;
}

/** Navigate, measure, and capture evidence for one comparison leg.
 *  Never throws on measurement failure — `captureEvidence` always runs
 *  so triage artifacts are attached before assertions re-throw. */
async function runLeg(
  legName: LegName,
  context: BrowserContext,
  page: Page,
  url: string,
  scenario: CompareScenario,
  testInfo: TestInfo,
): Promise<LegReading> {
  const prep = await prepareLeg(legName, context, page, url, scenario);
  await testInfo.attach('consent-dismiss.json', {
    body: JSON.stringify({ dismissed: prep.consentDismissed }),
    contentType: 'application/json',
  });

  let extract: PartialExtract;
  let htmlLang = '';
  let russianLeak: ReturnType<typeof scanKeywords> | undefined;
  let ukrainianMarker: ReturnType<typeof scanKeywords> | undefined;
  let histogram: ReturnType<typeof buildSnippetHistogram> | undefined;

  try {
    expect(prep.movarNotSettled, 'Movar never settled — measurement is unreliable').toBe(false);
    extract = await extractResults(page, TOP_N_SNIPPETS);
    htmlLang = await page.evaluate(() => document.documentElement.lang || '');
    const rowCount = extract.snippets.length;
    expect(
      rowCount >= 3 || extract.regionText.length > 500,
      `results region failed to render — likely CAPTCHA or layout broken (rowCount=${rowCount}, regionTextChars=${extract.regionText.length})`,
    ).toBe(true);
    russianLeak = scanKeywords(extract.regionText, scenario.russianLeakKeywords);
    ukrainianMarker = scanKeywords(extract.regionText, scenario.ukrainianMarkers);
    histogram = buildSnippetHistogram(extract.snippets);
  } finally {
    await captureEvidence(
      testInfo,
      legName,
      scenario.id,
      page,
      prep,
      htmlLang,
      extract,
      russianLeak,
      ukrainianMarker,
      histogram,
    );
  }

  return {
    url: page.url(),
    htmlLang,
    regionSelectorUsed: extract!.regionSelectorUsed,
    rowSelectorUsed: extract!.rowSelectorUsed,
    regionTextChars: extract!.regionText.length,
    snippets: extract!.snippets,
    russianLeak: russianLeak!,
    ukrainianMarker: ukrainianMarker!,
    histogram: histogram!,
    consentDismissed: prep.consentDismissed,
    seiStripped: prep.seiStripped,
  };
}

// Sanity guard — same pattern as `sites.spec.ts`. If `SCENARIOS` is
// accidentally empty (refactor losing entries, conditional that elides
// every push), the for-loop generates zero `test()` calls and Playwright
// exits 0 with no signal. This one-line check turns that silent pass
// into an explicit failure.
test('SCENARIOS registry is non-empty', () => {
  expect(SCENARIOS.length).toBeGreaterThan(0);
});

for (const scenario of SCENARIOS) {
  test.describe(scenario.label, () => {
    test.skip(
      Boolean(scenario.skipIfEnv && process.env[scenario.skipIfEnv] === '1'),
      `${scenario.skipIfEnv}=1 in env`,
    );

    // Split into two sub-tests so the baseline-witness failure (bug not
    // reproduced) is decoupled from the treatment-regression failure
    // (Movar didn't fix it). The baseline check uses test.skip (not
    // fail) when the witness is wedged — an environment issue shouldn't
    // block the treatment check from providing useful signal.

    test(`${scenario.id}-baseline-witness`, async ({ cleanContext, cleanPage }, testInfo) => {
      const url = buildGoogleSearchUrl(scenario.query);
      const baseline = await runLeg('baseline', cleanContext, cleanPage, url, scenario, testInfo);

      // Baseline: bug must reproduce. Skip (not fail) when wedged so
      // nightly doesn't red-board on a CAPTCHA day or a Google locale
      // change — but the skip is visible and triggers investigation.
      if (baseline.regionTextChars < 500 && baseline.snippets.length < 3) {
        test.skip(
          true,
          `Baseline region too thin (${baseline.regionTextChars} chars, ${baseline.snippets.length} rows) — CAPTCHA or layout broken; skipping witness check`,
        );
      }

      expect(
        baseline.russianLeak.hits,
        `Baseline did NOT reproduce the bug. ` +
          `Expected ≥${scenario.baseline.minRussianLeaks} hits from ` +
          `${JSON.stringify(scenario.russianLeakKeywords)}; got ${baseline.russianLeak.hits}. ` +
          `Possible causes: egress IP geolocated to UA, query no longer popular, ` +
          `Google changed locale-guessing, anti-bot challenge served. ` +
          `See attached baseline.png + baseline.json.`,
      ).toBeGreaterThanOrEqual(scenario.baseline.minRussianLeaks);
    });

    test(`${scenario.id}-treatment-regression`, async ({ movarContext, movarPage }, testInfo) => {
      const url = buildGoogleSearchUrl(scenario.query);
      const treatment = await runLeg('treatment', movarContext, movarPage, url, scenario, testInfo);

      // 1) Treatment: no Russian leak words at all. This is the core
      //    Movar-still-works assertion.
      expect(
        treatment.russianLeak.hits,
        `Movar leaked Russian content. ` +
          `Found ${treatment.russianLeak.hits} hits: ` +
          `${JSON.stringify(treatment.russianLeak.matched)}. ` +
          `See attached treatment.png + treatment.json.`,
      ).toBeLessThanOrEqual(scenario.treatment.maxRussianLeaks);

      // 2) Treatment: enough Ukrainian markers. Catches the case
      //    where Movar suppressed Russian but the SERP came back
      //    English / empty / errored — leak count of 0 alone is not
      //    sufficient evidence of a Ukrainian fix.
      expect(
        treatment.ukrainianMarker.hits,
        `Treatment did NOT show enough Ukrainian markers. ` +
          `Expected ≥${scenario.treatment.minUkrainianMarkers} hits from ` +
          `${JSON.stringify(scenario.ukrainianMarkers)}; got ${treatment.ukrainianMarker.hits}. ` +
          `SERP may have come back English or empty. See attached treatment.json.`,
      ).toBeGreaterThanOrEqual(scenario.treatment.minUkrainianMarkers);

      // 3) Structural: URL was rewritten with Movar's hl/lr params.
      //    Catches a DNR-rule regression that the keyword scan would
      //    miss if Google happened to serve Ukrainian anyway.
      if (scenario.treatment.urlContains) {
        expect(
          treatment.url,
          `Treatment URL missing Movar's hl rewrite. URL: ${treatment.url}`,
        ).toMatch(scenario.treatment.urlContains);
      }

      // 4) Structural: <html lang> reports Ukrainian. Independent of
      //    content scan; catches the case where Movar rewrote the
      //    URL but Google ignored hl= and served Russian under
      //    `<html lang="ru">`.
      if (scenario.treatment.htmlLang) {
        const want = scenario.treatment.htmlLang.toLowerCase();
        const got = (treatment.htmlLang || '').toLowerCase();
        expect(
          got === want || got.startsWith(`${want}-`),
          `Treatment <html lang> expected to start with "${want}"; got "${treatment.htmlLang}". See attached treatment.png + treatment.json.`,
        ).toBe(true);
      }
    });
  });
}
