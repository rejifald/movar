/**
 * franc engine core — the trigram detect body + ISO-639-3→BCP-47 map.
 *
 * Isolated from the engine wrapper (./franc.ts) so the wrapper can load this
 * lazily: `franc`'s trigram tables are large (~170 KB), and consumers that
 * never reach the franc rung — or host it elsewhere, e.g. a background worker
 * reached by message — shouldn't pay for the tables in their main bundle. This
 * module is the ONLY franc importer on the engine side.
 *
 * Pure + isomorphic: no DOM, no browser/worker APIs. `franc` runs identically
 * in Node and the browser, so this stays drop-in for either host.
 *
 * Known script gaps (franc, 187 languages): scripts with thin corpus data
 * (e.g. some Indic scripts) may be flaky. If telemetry surfaces a real-world
 * miss the corpus doesn't cover, add a fixture in test/fixtures.ts.
 */
import { franc, francAll } from 'franc';
import type { DetectContext, DetectedLanguage } from '../engine';

/** Stable engine id, surfaced via DetectedLanguage.engine and telemetry. */
export const FRANC_ENGINE_ID = 'franc';
const DEFAULT_MAX_CHARS = 2000;
/** Minimum sample length, in characters. Below this franc returns `und`
 *  rather than guessing — short snippets are too noisy for trigram weighting. */
const MIN_LENGTH = 10;

/** ISO 639-3 → BCP-47 (ISO 639-1) for codes franc can return. Codes not in the
 *  map fall through to null — we'd rather miss than emit an opaque three-letter
 *  tag the rest of the extension doesn't understand. franc (187 langs) can
 *  return many more codes than are mapped here; the unmapped ones resolve to
 *  null (no action), which is the intended behaviour for languages the
 *  extension doesn't act on. */
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

/**
 * Detect the language of `text` with franc and map the ISO-639-3 result to
 * BCP-47. Synchronous — franc itself is sync; the async boundary (lazy load,
 * or a background-worker round-trip) lives in the callers. Returns null on
 * `und` (too short / unrecognised script) or an unmapped code.
 */
export function detectWithFranc(text: string, ctx: DetectContext): DetectedLanguage | null {
  const sample = text.slice(0, ctx.maxChars ?? DEFAULT_MAX_CHARS);
  const code = franc(sample, { minLength: MIN_LENGTH });
  if (code === 'und') return null;
  const language = ISO_639_3_TO_BCP_47[code];
  if (language == null) return null;
  const [top] = francAll(sample, { minLength: MIN_LENGTH });
  const confidence = top?.[1] ?? 0;
  return { language, confidence, engine: FRANC_ENGINE_ID };
}
