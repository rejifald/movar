/**
 * Per-snippet language histogram — the secondary, evidence-only signal.
 *
 * For each result snippet we run the same `@movar/lang-detect` heuristic
 * Movar's content script uses internally and bucket the verdict. The
 * resulting `{uk, ru, en, unknown}` tally goes into the test attachment
 * so a triage reader can see the population shape next to the keyword
 * scan — e.g. "keyword scan passed (0 leaks), but histogram is 4 ru / 3
 * unknown / 3 uk" is a very different signal than "0 leaks, 9 uk / 1
 * unknown".
 *
 * NOT asserted on. The keyword scan is the contract; this is colour for
 * the report. Adding histogram thresholds to the contract would re-
 * introduce the fuzzy-threshold problem we just removed by switching to
 * keywords (different snippet lengths → different score distributions →
 * day-to-day flake).
 *
 * "english" is a coarse bucket: any snippet whose Latin-letter density
 * exceeds Cyrillic density. We don't need to distinguish English from
 * Polish from Spanish — for our purposes "not-Cyrillic" is the only
 * Latin-side bucket that matters.
 */
import { detectCyrillicLanguage } from '@movar/lang-detect';

export interface SnippetHistogram {
  uk: number;
  ru: number;
  en: number;
  be: number;
  bg: number;
  unknown: number;
  /** Number of snippets that went into the histogram. `uk + ru + en + ...
   *  === total`. */
  total: number;
}

const LATIN = /[A-Za-z]/g;
const CYRILLIC = /[Ѐ-ӿ]/g;

/** Decide between Latin (en bucket) and Cyrillic-family detection by
 *  letter density. A snippet like "Buy 220V relay — best price 2026"
 *  has many Latin letters and few Cyrillic; lang-detect would return
 *  `unknown` for it. We want it in the `en` bucket so triage can see
 *  "X snippets in English" at a glance. Threshold is "more Latin than
 *  Cyrillic", which is robust to short bilingual snippets without a
 *  magic ratio. */
function isLatinDominant(text: string): boolean {
  const latin = (text.match(LATIN) ?? []).length;
  const cyrillic = (text.match(CYRILLIC) ?? []).length;
  return latin > cyrillic;
}

export function buildSnippetHistogram(snippets: readonly string[]): SnippetHistogram {
  const h: SnippetHistogram = { uk: 0, ru: 0, en: 0, be: 0, bg: 0, unknown: 0, total: 0 };
  for (const s of snippets) {
    if (!s || !s.trim()) continue;
    h.total += 1;
    if (isLatinDominant(s)) {
      h.en += 1;
      continue;
    }
    const verdict = detectCyrillicLanguage(s).language;
    h[verdict] += 1;
  }
  return h;
}
