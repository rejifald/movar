/**
 * Lightweight UA-vs-RU detection.
 *
 * Both languages use Cyrillic, so a "is it Cyrillic" check is useless. We score
 * text on letters that are distinctive to each language:
 *   Ukrainian: і ї є ґ
 *   Russian:   ы ъ э ё
 *
 * This is the cheap, ship-first heuristic. If accuracy proves insufficient we
 * escalate to a library (franc / cld3 WASM). See movar-spec.md §5.3.
 */

export type CyrillicLanguage = 'uk' | 'ru' | 'unknown';

const UK_DISTINCTIVE = /[іїєґ]/gi;
const RU_DISTINCTIVE = /[ыъэё]/gi;

export interface DetectionResult {
  language: CyrillicLanguage;
  ukScore: number;
  ruScore: number;
}

export function detectCyrillicLanguage(text: string): DetectionResult {
  const ukScore = (text.match(UK_DISTINCTIVE) ?? []).length;
  const ruScore = (text.match(RU_DISTINCTIVE) ?? []).length;

  let language: CyrillicLanguage = 'unknown';
  if (ukScore !== 0 || ruScore !== 0) {
    language = ukScore >= ruScore ? 'uk' : 'ru';
  }

  return { language, ukScore, ruScore };
}

export function isRussian(text: string): boolean {
  return detectCyrillicLanguage(text).language === 'ru';
}
