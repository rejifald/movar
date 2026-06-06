import { normalizeBCP47, normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import {
  CLASS_NOISE,
  COUNTRY_TO_LANG,
  LABEL_SEPARATORS,
  MAX_LANG_TEXT,
  QUERY_LANG_PARAMS,
} from './types';
import type { ClassifiedLink } from './types';

/** Decode a regional-indicator flag emoji into its ISO 3166-1 alpha-2 code.
 *  Returns null for anything that isn't exactly a two-codepoint flag. */
// Bytewise codepoint validation; the six early-return guards are the readable
// shape for this decode.
// fallow-ignore-next-line complexity
function flagEmojiToCountry(text: string): string | null {
  const trimmed = text.trim();
  // eslint-disable-next-line unicorn/prefer-spread -- Array.from is the codepoint-aware decomposition we want here; the spread form `[...trimmed]` is rejected by @typescript-eslint/no-misused-spread for strings, and these two rules directly conflict
  const cps = Array.from(trimmed);
  if (cps.length !== 2) return null;
  const [first, second] = cps;
  if (first === undefined || second === undefined) return null;
  const a = first.codePointAt(0);
  const b = second.codePointAt(0);
  if (a === undefined || b === undefined) return null;
  const REGIONAL_A = 0x1f1e6;
  const REGIONAL_Z = 0x1f1ff;
  if (a < REGIONAL_A || a > REGIONAL_Z) return null;
  if (b < REGIONAL_A || b > REGIONAL_Z) return null;
  const c1 = String.fromCodePoint(0x41 + (a - REGIONAL_A));
  const c2 = String.fromCodePoint(0x41 + (b - REGIONAL_A));
  return c1 + c2;
}

/** Strict per-token classify — alias table or flag emoji, no tokenisation. */
export function classifyToken(text: string): LanguageCode | null {
  const direct = normalizeLanguageCode(text);
  if (direct != null) return direct;
  const country = flagEmojiToCountry(text);
  return country == null ? null : (COUNTRY_TO_LANG[country] ?? null);
}

/** Resolve text — plain alias, BCP47 tag, or flag emoji — to a language.
 *  When the whole string doesn't classify, falls back to splitting on visual
 *  separators ("UA | ", "EN / DE") and returning the first token that does.
 *  Don't call this on the textContent of an element with element children —
 *  see `languageFromText` for why. */
function textToLanguage(text: string): LanguageCode | null {
  const direct = classifyToken(text);
  if (direct != null) return direct;
  if (!LABEL_SEPARATORS.test(text)) return null;
  for (const part of text.split(LABEL_SEPARATORS)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length > MAX_LANG_TEXT) continue;
    const partLang = classifyToken(trimmed);
    if (partLang != null) return partLang;
  }
  return null;
}

/** Try to find a language code anywhere in the class list, ignoring noise tokens. */
function languageFromClasses(className: string): LanguageCode | null {
  for (const cls of className.split(/\s+/)) {
    if (!cls) continue;
    // Direct match on the whole token (e.g. `uk`, `ua`).
    const direct = normalizeLanguageCode(cls);
    if (direct != null) return direct;
    // Otherwise scan each part split on `-`, `_`, OR a camelCase boundary
    // (`langRu` → ['lang', 'Ru']). Skip noise words.
    for (const part of cls.split(/[-_]|(?=[A-Z])/)) {
      if (!part || CLASS_NOISE.has(part.toLowerCase())) continue;
      const lang = normalizeLanguageCode(part);
      if (lang != null) return lang;
    }
  }
  return null;
}

function parseAnchorURL(el: HTMLAnchorElement): URL | null {
  try {
    return new URL(el.href, el.baseURI);
  } catch {
    return null;
  }
}

function languageFromQueryParams(url: URL): LanguageCode | null {
  for (const param of QUERY_LANG_PARAMS) {
    const value = url.searchParams.get(param);
    if (value == null || value === '') continue;
    const lang = normalizeBCP47(value);
    if (lang != null) return lang;
  }
  return null;
}

/** A present, non-empty value short enough to be a language label. */
function isLabelSized(s: string | null | undefined): s is string {
  return s != null && s !== '' && s.length <= MAX_LANG_TEXT;
}

/** Label-like signals on an anchor — text, title, aria-label, descendant img alt. */
function collectAnchorLabelSignals(el: HTMLAnchorElement): string[] {
  const signals: string[] = [];
  const text = el.textContent.trim();
  if (text !== '' && text.length <= MAX_LANG_TEXT) signals.push(text);
  for (const attr of ['title', 'aria-label'] as const) {
    const v = el.getAttribute(attr);
    if (isLabelSized(v)) signals.push(v);
  }
  const alt = el.querySelector('img[alt]')?.getAttribute('alt');
  if (isLabelSized(alt)) signals.push(alt);
  return signals;
}

/** Corroborate a path-segment language guess via class hints or label signals. */
function anchorCorroboratesLanguage(el: HTMLAnchorElement, urlLang: LanguageCode): boolean {
  if (
    typeof el.className === 'string' &&
    el.className &&
    languageFromClasses(el.className) === urlLang
  )
    return true;
  for (const signal of collectAnchorLabelSignals(el)) {
    if (textToLanguage(signal) === urlLang) return true;
  }
  return false;
}

/** Anchor-only signals: hreflang attr + URL path/query, with corroboration
 *  for the noisy path-segment case. */
function classifyAnchor(el: HTMLAnchorElement): ClassifiedLink | null {
  // hreflang is documented as BCP47 → split-on-hyphen is correct here.
  const hreflang = el.getAttribute('hreflang');
  if (hreflang != null && hreflang !== '') {
    const lang = normalizeBCP47(hreflang);
    if (lang != null) return { el, language: lang };
  }

  const url = parseAnchorURL(el);
  if (!url) return null;

  // Query parameters are explicit by convention (`?lang=`, `?hl=en-US`) — these
  // unambiguously identify a language switcher.
  const queryLang = languageFromQueryParams(url);
  if (queryLang != null) return { el, language: queryLang };

  // Path segments are FREE-TEXT slugs — strict match only AND require a
  // corroborating signal on the same anchor. /ru works for a logo link to the
  // RU homepage just as much as for an actual language picker; the difference
  // is that real picker items also carry a flag image, language-named text,
  // a title="Russian", or a `ru-link` class.
  const firstSeg = url.pathname.split('/').find(Boolean);
  if (firstSeg == null) return null;
  const urlLang = normalizeLanguageCode(firstSeg);
  if (urlLang == null) return null;

  return anchorCorroboratesLanguage(el, urlLang) ? { el, language: urlLang } : null;
}

function languageFromOptionValue(el: HTMLElement): LanguageCode | null {
  if (!(el instanceof HTMLOptionElement)) return null;
  const value = el.getAttribute('value');
  return value != null && value !== '' ? normalizeBCP47(value) : null;
}

function languageFromDataAttrs(el: HTMLElement): LanguageCode | null {
  const dataLang = el.dataset['lang'] ?? el.dataset['locale'];
  return dataLang != null && dataLang !== '' ? normalizeBCP47(dataLang) : null;
}

function languageFromHreflangAttr(el: HTMLElement): LanguageCode | null {
  const hreflang = el.getAttribute('hreflang');
  return hreflang != null && hreflang !== '' ? normalizeBCP47(hreflang) : null;
}

function languageFromLabelAttrs(el: HTMLElement): LanguageCode | null {
  for (const attr of ['aria-label', 'title'] as const) {
    const src = el.getAttribute(attr);
    if (src == null || src === '' || src.length > MAX_LANG_TEXT) continue;
    const lang = textToLanguage(src);
    if (lang != null) return lang;
  }
  return null;
}

function languageFromText(el: HTMLElement): LanguageCode | null {
  const text = el.textContent.trim();
  if (!text || text.length > MAX_LANG_TEXT) return null;
  // Separator-split only fires on leaf elements (no element children). A
  // bare <span>UA  |  </span> next to a switch <a> classifies cleanly — but
  // if the element has children, its textContent is the joined labels of
  // inner nodes ("UA | RU"), and splitting would let the container itself
  // classify as one of those languages and shadow per-child detection.
  if (el.children.length > 0) return classifyToken(text);
  return textToLanguage(text);
}

/** Flag-only picker fallback. Restricted to leaf-like clickables; doing it
 *  for any element would let a container classify itself via its first
 *  child's flag and shadow real items. */
function languageFromDescendantFlag(el: HTMLElement): LanguageCode | null {
  if (!(el instanceof HTMLAnchorElement) && !(el instanceof HTMLButtonElement)) return null;
  const img = el.querySelector('img[alt]');
  const alt = img?.getAttribute('alt');
  if (alt == null || alt === '' || alt.length > MAX_LANG_TEXT) return null;
  return textToLanguage(alt);
}

/**
 * Classify any element as a language link. Tries signals from most to least
 * reliable: hreflang/URL (anchors) → option value → data-lang/data-locale →
 * class pattern → aria-label/title → text → descendant <img alt>
 * (flag-only pickers).
 */
export function classifyLanguageElement(el: HTMLElement): ClassifiedLink | null {
  if (el instanceof HTMLAnchorElement) {
    const anchored = classifyAnchor(el);
    if (anchored) return anchored;
  }

  const fromOption = languageFromOptionValue(el);
  if (fromOption != null) return { el, language: fromOption };

  const fromData = languageFromDataAttrs(el);
  if (fromData != null) return { el, language: fromData };

  // hreflang on anchors is already covered by classifyAnchor above.
  if (!(el instanceof HTMLAnchorElement)) {
    const fromHreflang = languageFromHreflangAttr(el);
    if (fromHreflang != null) return { el, language: fromHreflang };
  }

  const className = el.className;
  if (typeof className === 'string' && className) {
    const lang = languageFromClasses(className);
    if (lang != null) return { el, language: lang };
  }

  const fromLabel = languageFromLabelAttrs(el);
  if (fromLabel != null) return { el, language: fromLabel };

  const fromText = languageFromText(el);
  if (fromText != null) return { el, language: fromText };

  const fromFlag = languageFromDescendantFlag(el);
  if (fromFlag != null) return { el, language: fromFlag };

  return null;
}
