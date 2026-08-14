/**
 * BCP-47 tag handling for the page-declaration family.
 *
 * **Well-formedness is not validity.** RFC 5646 separates the two, and so does
 * this module: `isWellFormedBCP47` checks the `langtag` grammar only, so
 * `english-language` passes (grammatical) while `uk_UA` fails. That is the
 * right bar for `core/lang-*-malformed` — the assertion is "this is not a
 * BCP-47 tag", which the site cannot argue with, not "this is not a language I
 * have heard of", which it can.
 *
 * This is also why `normalizeBCP47` from `@movar/lang-detect` is **not** the
 * well-formedness oracle: it returns `null` for any tag outside Movar's alias
 * set (`de-DE` → `null`), which is correct for "should Movar act on this?" and
 * catastrophically wrong for "is this malformed?".
 *
 * The grammar is walked segment by segment rather than matched with one big
 * regex: the ABNF's adjacent repetition groups (`*variant *extension`) are
 * exactly the shape that produces super-linear backtracking.
 */

import { normalizeBCP47 } from '@movar/lang-detect';

const ALPHA_ONLY = /^[a-z]+$/;
const DIGIT_ONLY = /^\d+$/;
const ALPHANUM_ONLY = /^[a-z\d]+$/;

/** `2*3ALPHA` — the ordinary primary language subtag. */
const LANGUAGE_SHORT_MIN = 2;
const LANGUAGE_SHORT_MAX = 3;
/** `4ALPHA` — a reserved primary language, and the script subtag's length. */
const RESERVED_OR_SCRIPT_LENGTH = 4;
/** `5*8ALPHA` — a registered primary language. */
const LANGUAGE_LONG_MIN = 5;
/** No subtag may exceed 8 characters. */
const SUBTAG_MAX = 8;
/** `3ALPHA`, up to three of them. */
const EXTLANG_LENGTH = 3;
const EXTLANG_MAX = 3;
/** `region = 2ALPHA / 3DIGIT`. */
const REGION_ALPHA_LENGTH = 2;
const REGION_DIGIT_LENGTH = 3;
/** `variant = 5*8alphanum / (DIGIT 3alphanum)`. */
const VARIANT_ALPHANUM_MIN = 5;
const VARIANT_DIGIT_LENGTH = 4;
/** `extension = singleton 1*("-" 2*8alphanum)`. */
const EXTENSION_SUBTAG_MIN = 2;
const SINGLETON_LENGTH = 1;
/** The private-use singleton. */
const PRIVATE_USE = 'x';

/** Not found / rejected, in the segment-index walk. */
const REJECT = -1;

function isAlpha(segment: string, length: number): boolean {
  return segment.length === length && ALPHA_ONLY.test(segment);
}

function isAlphaBetween(segment: string, min: number, max: number): boolean {
  return segment.length >= min && segment.length <= max && ALPHA_ONLY.test(segment);
}

function isVariant(segment: string): boolean {
  if (segment.length >= VARIANT_ALPHANUM_MIN && segment.length <= SUBTAG_MAX) return true;
  return segment.length === VARIANT_DIGIT_LENGTH && DIGIT_ONLY.test(segment.slice(0, 1));
}

/** `2*3ALPHA ["-" extlang] / 4ALPHA / 5*8ALPHA`. Returns the next index. */
function readLanguage(segments: readonly string[]): number {
  const first = segments[0];
  if (first === undefined) return REJECT;
  if (isAlphaBetween(first, LANGUAGE_SHORT_MIN, LANGUAGE_SHORT_MAX)) {
    return readExtlangs(segments, 1);
  }
  if (isAlpha(first, RESERVED_OR_SCRIPT_LENGTH)) return 1;
  if (isAlphaBetween(first, LANGUAGE_LONG_MIN, SUBTAG_MAX)) return 1;
  return REJECT;
}

/** Up to three `3ALPHA` extended-language subtags. */
function readExtlangs(segments: readonly string[], start: number): number {
  let index = start;
  while (index - start < EXTLANG_MAX) {
    const segment = segments[index];
    if (segment === undefined || !isAlpha(segment, EXTLANG_LENGTH)) break;
    index += 1;
  }
  return index;
}

function readScript(segments: readonly string[], index: number): number {
  const segment = segments[index];
  if (segment !== undefined && isAlpha(segment, RESERVED_OR_SCRIPT_LENGTH)) return index + 1;
  return index;
}

function readRegion(segments: readonly string[], index: number): number {
  const segment = segments[index];
  if (segment === undefined) return index;
  if (isAlpha(segment, REGION_ALPHA_LENGTH)) return index + 1;
  if (segment.length === REGION_DIGIT_LENGTH && DIGIT_ONLY.test(segment)) return index + 1;
  return index;
}

function readVariants(segments: readonly string[], start: number): number {
  let index = start;
  while (index < segments.length) {
    const segment = segments[index];
    if (segment === undefined || !isVariant(segment)) break;
    index += 1;
  }
  return index;
}

/** `singleton 1*("-" 2*8alphanum)`, repeated. `REJECT` on an empty extension. */
function readExtensions(segments: readonly string[], start: number): number {
  let index = start;
  while (index < segments.length) {
    const singleton = segments[index];
    if (singleton === undefined) break;
    if (singleton.length !== SINGLETON_LENGTH || singleton === PRIVATE_USE) break;
    let next = index + 1;
    while (next < segments.length) {
      const subtag = segments[next];
      if (subtag === undefined || subtag.length < EXTENSION_SUBTAG_MIN) break;
      next += 1;
    }
    if (next === index + 1) return REJECT;
    index = next;
  }
  return index;
}

/** `"x" 1*("-" 1*8alphanum)`. Charset and length are pre-checked by the caller. */
function isPrivateUse(segments: readonly string[], start: number): boolean {
  return segments[start] === PRIVATE_USE && segments.length > start + 1;
}

function hasLegalSegments(segments: readonly string[]): boolean {
  return segments.every(
    (segment) => segment.length > 0 && segment.length <= SUBTAG_MAX && ALPHANUM_ONLY.test(segment),
  );
}

/**
 * Is `tag` a well-formed BCP-47 `langtag` (or a private-use tag)?
 *
 * Irregular grandfathered tags (`i-klingon`, `en-GB-oed`) are deliberately not
 * special-cased: they are deprecated, they do not match the ABNF, and a page
 * still carrying one has a defect worth reporting.
 */
export function isWellFormedBCP47(tag: string): boolean {
  const lower = tag.toLowerCase();
  if (lower === '') return false;
  const segments = lower.split('-');
  if (!hasLegalSegments(segments)) return false;
  if (segments[0] === PRIVATE_USE) return isPrivateUse(segments, 0);

  let index = readLanguage(segments);
  if (index === REJECT) return false;
  index = readScript(segments, index);
  index = readRegion(segments, index);
  index = readVariants(segments, index);
  index = readExtensions(segments, index);
  if (index === REJECT) return false;
  if (index === segments.length) return true;
  return isPrivateUse(segments, index);
}

/** The primary language subtag, lowercased. `''` for an empty tag. */
export function primarySubtag(tag: string): string {
  return (tag.toLowerCase().split('-', 1)[0] ?? '').trim();
}

/**
 * The language a `<html lang>` / `hreflang` declaration resolves to, for
 * comparison against another **declaration**.
 *
 * Movar's canonical code when the alias table knows the tag (`ukr` → `uk`,
 * `uk-UA` → `uk`), and the bare primary subtag otherwise. The fallback matters:
 * `normalizeBCP47('de-DE')` is `null` because Movar does not act on German, but
 * `<html lang="de-DE">` served at `/uk/` is still a contradiction the site
 * declared against itself. Refusing to compare would silently pass it.
 *
 * Only ever compare two declarations this way — never a declaration against a
 * classifier verdict.
 */
export function declaredLanguageOf(tag: string): string {
  return normalizeBCP47(tag) ?? primarySubtag(tag);
}

/**
 * The declared tag, trimmed, or `null` when `<html lang>` (or any other `lang`
 * attribute) is absent or blank.
 *
 * Deliberately **not** run through {@link declaredLanguageOf} or
 * `normalizeBCP47`: every family A/D/F rule that starts here still needs the
 * raw tag, either to well-formedness-check it with {@link isWellFormedBCP47}
 * before any normalization is meaningful, or to quote it verbatim in a
 * summary (`<html lang="${tag}">`). Normalizing first would let a malformed
 * tag slip past the malformed check, or replace what the site actually wrote
 * with Movar's guess at what it meant.
 */
export function presentLang(htmlLang: string | null): string | null {
  if (htmlLang === null) return null;
  const trimmed = htmlLang.trim();
  return trimmed === '' ? null : trimmed;
}
