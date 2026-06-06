/**
 * Page-language readout used by the spec to verify Movar's algorithm. Pulls
 * `<html lang>` + body text from the live page, then classifies the body via
 * `@movar/lang-detect` — the same letter-signal heuristic Movar's content
 * script uses internally. Two signals on the same surface: if both agree,
 * the page really is in that language; if they disagree, the readout is
 * surfaced verbatim so test failures point at the source of disagreement.
 */
import type { Page } from '@playwright/test';
import {
  type CyrillicLanguage,
  type DetectionResult,
  detectCyrillicLanguage,
} from '@movar/lang-detect';

export interface PageLangReadout {
  url: string;
  htmlLang: string;
  detected: CyrillicLanguage;
  ukScore: number;
  ruScore: number;
  bodyCharCount: number;
}

export async function readPageLanguage(page: Page): Promise<PageLangReadout> {
  const htmlLang = await page.evaluate(() => document.documentElement.lang || '');
  // textContent (not innerText) because Playwright evaluates in a real DOM
  // context — textContent is cheap and avoids layout, which is plenty for
  // Cyrillic-letter counting.
  const bodyText = await page.evaluate(() => document.body.textContent);
  const det: DetectionResult = detectCyrillicLanguage(bodyText);
  return {
    url: page.url(),
    htmlLang,
    detected: det.language,
    ukScore: det.ukScore,
    ruScore: det.ruScore,
    bodyCharCount: bodyText.length,
  };
}
