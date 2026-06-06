/**
 * Per-leg evidence capture. Every compare test produces two evidence
 * bundles (baseline + treatment) attached to the Playwright HTML report:
 *
 *   - screenshot (full-page PNG) — visual proof of what the user saw
 *   - results JSON — the full reading: URL, html lang, region selector
 *     used, snippets array, keyword scan result, histogram
 *
 * Attachments live in `testInfo.outputDir`, automatically uploaded by
 * the GitHub Action's `actions/upload-artifact` step. A reviewer looking
 * at a failed nightly run can open the artifact, see the screenshot
 * pair side-by-side, and read the JSON to understand whether the
 * failure is "Movar regressed" or "Google's response shape changed".
 *
 * `attach` is intentionally narrow: it doesn't drive measurement, only
 * persists what measurement produced. Keeps the runner readable —
 * `await attachLegEvidence(testInfo, 'baseline', reading)` is one line.
 */
import type { Page, TestInfo } from '@playwright/test';
import type { KeywordScan } from './keywords';
import type { SnippetHistogram } from './lang-histogram';

/** What we record per leg. All fields are populated by the runner
 *  before attaching; this type is the contract between runner and
 *  evidence layer. */
export interface LegReading {
  url: string;
  htmlLang: string;
  /** From `extractResults`. */
  regionSelectorUsed: string;
  /** From `extractResults`. May be `null` when row selectors all missed. */
  rowSelectorUsed: string | null;
  /** Length of the joined region text — quick triage signal when
   *  results look truncated. */
  regionTextChars: number;
  /** Up to N (typically 10) per-row snippets. May be empty when row
   *  selectors missed. */
  snippets: string[];
  /** Keyword scan against `russianLeakKeywords`. */
  russianLeak: KeywordScan;
  /** Keyword scan against `ukrainianMarkers`. */
  ukrainianMarker: KeywordScan;
  /** `@movar/lang-detect` bucketing of `snippets`. */
  histogram: SnippetHistogram;
  /** Whether the consent dialog was dismissed during this leg. Useful
   *  diagnostic when results look thin in one leg but not the other. */
  consentDismissed: boolean;
  /** Whether the runner stripped a `sei` param from the URL before
   *  measurement. For the treatment leg this is typically `false`
   *  (Movar's Google rule has already stripped it during its rewrite);
   *  for the baseline leg this is `true` whenever Google added one
   *  after the initial navigation. Belt-and-braces: keeps both legs
   *  symmetric by removing the session-bias signal before the SERP is
   *  scanned, so a difference in result language can't be attributed
   *  to `sei` carryover on one side. */
  seiStripped: boolean;
}

export type LegName = 'baseline' | 'treatment';

/** Take a full-page screenshot + attach the reading JSON, both labelled
 *  with the leg name so a reader sees `baseline.png` next to
 *  `treatment.png` in the report. */
export async function attachLegEvidence(
  testInfo: TestInfo,
  leg: LegName,
  page: Page,
  reading: LegReading,
): Promise<void> {
  const screenshot = await page
    .screenshot({ fullPage: true, type: 'png' })
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error('failed to capture leg screenshot — evidence incomplete: ' + reason);
    });
  await testInfo.attach(`${leg}.png`, { body: screenshot, contentType: 'image/png' });
  await testInfo.attach(`${leg}.json`, {
    body: Buffer.from(JSON.stringify(reading, null, 2), 'utf8'),
    contentType: 'application/json',
  });
}
