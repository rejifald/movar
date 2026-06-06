/**
 * franc-min engine — trigram-based detection, ~17 KB gz, 82 languages.
 *
 * Always available. Wraps `franc(text, { minLength: 10 })` and maps the
 * returned ISO 639-3 code to BCP-47 (ISO 639-1) when one exists. franc
 * already returns `'und'` for inputs shorter than minLength, empty,
 * whitespace, numbers, or scripts it doesn't recognize — we propagate that
 * as `null`.
 *
 * Known v1 misses (see docs/on-device-language-detection.md):
 *  - Hebrew — franc-min lacks the Hebrew trigram model.
 *  - Scripts with insufficient corpus data (Bengali, Hindi, etc. may be flaky).
 *
 * If telemetry surfaces a real-world miss the corpus doesn't already cover,
 * add a fixture in packages/lang-detect/test/fixtures.ts and document it
 * in this test file.
 */

import { franc, francAll } from 'franc-min';
import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from '../engine';

const ENGINE_ID = 'franc-min';
const DEFAULT_MAX_CHARS = 2000;
/** Minimum sample length, in characters. Below this franc-min returns `und`
 *  rather than guessing — short snippets are too noisy for trigram weighting. */
const MIN_LENGTH = 10;

/** ISO 639-3 → BCP-47 (ISO 639-1) for codes franc-min can return. Codes not
 *  in the map fall through to null — we'd rather miss than emit an opaque
 *  three-letter tag the rest of the extension doesn't understand. */
const ISO_639_3_TO_BCP_47: Readonly<Record<string, string>> = {
  ara: 'ar',
  arb: 'ar',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  bul: 'bg',
  cat: 'ca',
  ces: 'cs',
  cmn: 'zh',
  cym: 'cy',
  dan: 'da',
  deu: 'de',
  ell: 'el',
  eng: 'en',
  eus: 'eu',
  fin: 'fi',
  fra: 'fr',
  gle: 'ga',
  glg: 'gl',
  heb: 'he',
  hin: 'hi',
  hun: 'hu',
  hye: 'hy',
  ind: 'id',
  isl: 'is',
  ita: 'it',
  jav: 'jv',
  jpn: 'ja',
  kat: 'ka',
  kaz: 'kk',
  kir: 'ky',
  kor: 'ko',
  nld: 'nl',
  nor: 'no',
  pol: 'pl',
  por: 'pt',
  ron: 'ro',
  rus: 'ru',
  spa: 'es',
  srp: 'sr',
  swe: 'sv',
  tat: 'tt',
  tha: 'th',
  tur: 'tr',
  ukr: 'uk',
  vie: 'vi',
};

export const francMinEngine: LanguageDetectionEngine = {
  id: ENGINE_ID,
  isAvailable() {
    return true;
  },
  async detect(text, ctx: DetectContext): Promise<DetectedLanguage | null> {
    const sample = text.slice(0, ctx.maxChars ?? DEFAULT_MAX_CHARS);
    const code = franc(sample, { minLength: MIN_LENGTH });
    if (code === 'und') return null;
    const language = ISO_639_3_TO_BCP_47[code];
    if (language == null) return null;
    const [top] = francAll(sample, { minLength: MIN_LENGTH });
    const confidence = top?.[1] ?? 0;
    return { language, confidence, engine: ENGINE_ID };
  },
};
