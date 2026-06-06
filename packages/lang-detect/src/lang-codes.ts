/** ISO 639-1 language code, e.g. 'uk', 'en', 'ru'. */
export type LanguageCode = string;

/**
 * Aliases that appear in URLs, hreflang attributes, class names, and short
 * link/label text, mapped to canonical ISO 639-1 codes. Keys are lowercased.
 *
 * Ukrainian is the load-bearing case: most sites use 'ua' in URLs even though
 * the ISO code is 'uk'. We accept both on input; we always output 'uk'.
 *
 * Includes localized phrases the user actually sees in pickers
 * ('українською', 'по-русски', 'in english', ...).
 */
const ALIASES: Record<string, LanguageCode> = {
  // Ukrainian
  ua: 'uk',
  uk: 'uk',
  укр: 'uk',
  українська: 'uk',
  українською: 'uk',
  'українська мова': 'uk',
  'на українській': 'uk',
  'українською мовою': 'uk',
  ukrainian: 'uk',
  'in ukrainian': 'uk',

  // Russian
  ru: 'ru',
  rus: 'ru',
  рус: 'ru',
  русский: 'ru',
  'по-русски': 'ru',
  'по русски': 'ru',
  'русский язык': 'ru',
  'на русском': 'ru',
  russian: 'ru',
  'in russian': 'ru',
  російська: 'ru',
  'російська мова': 'ru',
  'по-російськи': 'ru',
  'по російськи': 'ru',

  // English
  en: 'en',
  eng: 'en',
  english: 'en',
  'in english': 'en',
  англійська: 'en',
  английский: 'en',

  // Polish
  pl: 'pl',
  pol: 'pl',
  polski: 'pl',
  'po polsku': 'pl',
  polish: 'pl',
  польська: 'pl',
  'польська мова': 'pl',
  'по-польськи': 'pl',

  // German
  de: 'de',
  deu: 'de',
  ger: 'de',
  deutsch: 'de',
  'auf deutsch': 'de',
  german: 'de',
  німецька: 'de',
  'німецька мова': 'de',
  'по-німецьки': 'de',

  // French
  fr: 'fr',
  fra: 'fr',
  français: 'fr',
  francais: 'fr',
  'en français': 'fr',
  french: 'fr',
  французька: 'fr',
  'французька мова': 'fr',
  'по-французьки': 'fr',

  // Spanish
  es: 'es',
  spa: 'es',
  español: 'es',
  espanol: 'es',
  'en español': 'es',
  spanish: 'es',
  іспанська: 'es',
  'іспанська мова': 'es',
  'по-іспанськи': 'es',

  // Italian
  it: 'it',
  ita: 'it',
  italiano: 'it',
  'in italiano': 'it',
  italian: 'it',
  італійська: 'it',
  'італійська мова': 'it',
  'по-італійськи': 'it',
};

/**
 * Strict, exact-match lookup. Returns null for unknown inputs and does NOT
 * fall back to a hyphen-prefix. Use this anywhere a hyphen split could be a
 * coincidence — URL path segments (`/ru-return-warranty`), title attrs, link
 * text, image alt, etc. The phrase aliases ('по-русски', 'in english') are in
 * the table directly, so exact lookup still finds them.
 */
export function normalizeLanguageCode(input: string): LanguageCode | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;
  return ALIASES[cleaned] ?? null;
}

/**
 * BCP47-aware normalization: tries the full string first, then strips a
 * region/script suffix ('en-US' → 'en', 'zh_CN' → 'zh'). Use this ONLY for
 * inputs that are documented to be BCP47 — `hreflang`, `<html lang>`, the
 * `data-lang`/`data-locale` attributes — never for free-text URL slugs.
 */
export function normalizeBCP47(input: string): LanguageCode | null {
  if (!input) return null;
  const cleaned = input.trim().toLowerCase();
  if (!cleaned) return null;
  const direct = ALIASES[cleaned];
  if (direct != null) return direct;
  const head = cleaned.split(/[-_]/)[0];
  if (head == null || head === '') return null;
  return ALIASES[head] ?? null;
}
