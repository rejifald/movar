/**
 * Cyrillic-language detection by letter signals.
 *
 * Each language we care about has letters the others don't (or use much less):
 *   Ukrainian   — і ї є ґ
 *   Russian     — ы ё   (ъ э are shared with bg/be and treated separately)
 *   Belarusian  — ў     (uniquely Belarusian)
 *   Bulgarian   — ъ used as a vowel in nearly every word
 *
 * The shared letters `ъ` and `э` need care: `подъезд` is Russian, but
 * `съм българин` is Bulgarian — both texts contain `ъ`. We disambiguate by
 * density and length: a single `ъ` in a short snippet leans RU; multiple `ъ`
 * in longer text leans BG. `э` alone is weaker still — Russian uses it in
 * loanwords and `Это`, Belarusian uses it in `гэта`/`сэрца` etc. — so a
 * lone `э` with no other distinctives is treated as `unknown` rather than
 * silently calling either way.
 *
 * The cheap heuristic stays cheap; if a use case needs more accuracy than
 * letter signals can give, escalate to franc/cld3.
 */

export type CyrillicLanguage = 'uk' | 'ru' | 'be' | 'bg' | 'unknown';

const UK_DISTINCTIVE = /[іїєґ]/gi;
const RU_DISTINCTIVE = /[ыё]/gi;
const BE_DISTINCTIVE = /ў/gi;
const HARD_SIGN = /ъ/gi;
const E_OBOROT = /э/gi;
const CYRILLIC = /[Ѐ-ӿ]/g;

/** Minimum Cyrillic-letter count before we'll guess at a language. Below
 *  this, a short snippet (`Привет`, `Хочу`) is too ambiguous to act on. */
const MIN_CYRILLIC_FOR_FALLBACK = 10;
/** Minimum text length before `ъ`-density is read as Bulgarian. Single-word
 *  Russian samples like `подъезд` (7 chars) would otherwise misclassify. */
const MIN_LEN_FOR_BG = 10;

export interface DetectionResult {
  language: CyrillicLanguage;
  ukScore: number;
  ruScore: number;
}

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

export function detectCyrillicLanguage(text: string): DetectionResult {
  const ukScore = count(text, UK_DISTINCTIVE);
  const ruDistinctive = count(text, RU_DISTINCTIVE);
  const beScore = count(text, BE_DISTINCTIVE);
  const hardSigns = count(text, HARD_SIGN);
  const eOborot = count(text, E_OBOROT);
  const cyrillicCount = count(text, CYRILLIC);

  // ў is uniquely Belarusian — strongest single signal.
  if (beScore > 0) {
    return { language: 'be', ukScore, ruScore: ruDistinctive };
  }

  // Both UA and RU evidence present — tie should be unknown, not a silent
  // UA call (which would misclassify Belarusian/Bulgarian whenever і or ё
  // happens to balance out).
  if (ukScore > 0 && ruDistinctive > 0) {
    if (ukScore === ruDistinctive) {
      return { language: 'unknown', ukScore, ruScore: ruDistinctive };
    }
    return {
      language: ukScore > ruDistinctive ? 'uk' : 'ru',
      ukScore,
      ruScore: ruDistinctive,
    };
  }

  // Distinctive RU letters (ы, ё) with no UA evidence — unambiguously RU.
  if (ruDistinctive > 0) {
    return { language: 'ru', ukScore, ruScore: ruDistinctive };
  }

  // Distinctive UA letters with no RU distinctives — UA.
  if (ukScore > 0) {
    return { language: 'uk', ukScore, ruScore: 0 };
  }

  // Bulgarian: ъ used as a vowel — multiple occurrences in non-trivial text,
  // no Russian distinctives, no UA distinctives. Length guard keeps short
  // Russian compounds like `подъезд` from sliding into BG.
  if (hardSigns >= 2 && text.length >= MIN_LEN_FOR_BG) {
    return { language: 'bg', ukScore: 0, ruScore: hardSigns };
  }

  // Russian fallback: substantial Cyrillic with no UA, no BE distinctives,
  // and no э (which signals possible Belarusian). Catches the common case
  // of short-but-clear Russian text that contains none of ы/ё/ъ/э (e.g.
  // `Привет, мир` or `Здравствуйте, меня зовут Алексей`).
  if (cyrillicCount >= MIN_CYRILLIC_FOR_FALLBACK && eOborot === 0) {
    return { language: 'ru', ukScore: 0, ruScore: 0 };
  }

  // Lone ъ (no э, no other distinctives) in shorter text — RU compound word
  // pattern (подъезд, объект, съезд). Without this we'd lose existing RU
  // classification for these.
  if (hardSigns > 0 && eOborot === 0) {
    return { language: 'ru', ukScore: 0, ruScore: hardSigns };
  }

  return { language: 'unknown', ukScore: 0, ruScore: 0 };
}

export function isRussian(text: string): boolean {
  return detectCyrillicLanguage(text).language === 'ru';
}

export type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';
export { ENGINES, detectLanguageFromText } from './orchestrator';
export { classifyBySnippet, francOracle } from './classify';
export type { LanguageProfile, SnippetVerdict } from './classify';
export { PROFILES, getProfiles } from './profiles';
export { classifyDivergence } from './shadow';
export type { DivergenceKind, OracleVerdict } from './shadow';
