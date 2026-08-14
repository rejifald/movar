/**
 * The document head's **declared** language surface: `og:locale`,
 * `og:locale:alternate`, and `Content-Language` in either of its two carriers.
 *
 * Kernel rather than a rule file, because two families read the same
 * declarations and must not disagree about what they mean: family A adjudicates
 * a head declaration against `<html lang>`, and family B counts
 * `og:locale:alternate` as a fourth source of the language inventory.
 *
 * Three decisions are load-bearing:
 *
 * 1. **Open Graph is not BCP-47.** `og:locale` is `language_TERRITORY` with an
 *    underscore, so `isWellFormedBCP47` rejects every valid one. The two
 *    grammars are checked separately, and {@link ogLocaleTag} is the only place
 *    the underscore form is bridged to the hyphenated one.
 * 2. **Only the language is compared; the region never is.** `<html lang="uk">`
 *    against `og:locale="uk_UA"` is agreement, not a defect: the page declared
 *    a language, Open Graph declared a language and a market, and neither
 *    contradicts the other. `declaredLanguageOf` collapses both sides to the
 *    language before they meet, so `uk` vs `ru` is the only shape that can
 *    fail. A market mismatch between two regions of one language is not a
 *    language defect, and this family does not invent one.
 * 3. **`og:locale` is not an inventory source.** It declares what *this* page
 *    is, exactly as `<html lang>` does, and `inventory.ts` excludes that for a
 *    reason. Only `og:locale:alternate` says what the site *offers*.
 *
 * @see ../../../docs/movar-audit-rules.md — families A and B
 */

import { declaredLanguageOf } from './bcp47';
import type { HeadLanguageDeclaration, PageEvidence } from './evidence';

/**
 * `language_TERRITORY` — Open Graph's locale shape.
 *
 * Case-insensitive on purpose. The convention is a lowercase language and an
 * uppercase territory, but `uk_ua` is unambiguous, and reporting a casing
 * preference as a defect is over-firing on a rule about a preview card. What
 * this does catch is the real population: `uk-UA` (BCP-47 hyphen pasted into an
 * Open Graph slot), a bare `uk` (no territory), and free text.
 */
const OG_LOCALE_SHAPE = /^[a-z]{2,3}_[a-z]{2}$/iu;

/**
 * `Content-Language` is a comma-separated list — RFC 9110 § 8.5.
 *
 * Split on the bare comma and trim afterwards, rather than on a
 * whitespace-swallowing regex. A pattern with an unbounded whitespace class on
 * both sides of the comma is the shape that backtracks super-linearly, and the
 * header is attacker-supplied.
 */
const LIST_SEPARATOR = ',';

/** Is this a well-formed Open Graph locale? */
export function isWellFormedOgLocale(value: string): boolean {
  return OG_LOCALE_SHAPE.test(value.trim());
}

/**
 * An Open Graph locale as a BCP-47 tag: `uk_UA` → `uk-UA`.
 *
 * Only the separator is changed. Anything else — casing, an unknown territory —
 * is left for {@link declaredLanguageOf} and the malformed rule to deal with,
 * so this never launders a broken value into a plausible one.
 */
export function ogLocaleTag(value: string): string {
  return value.trim().replace('_', '-');
}

/**
 * Every language a head declaration asserts, as comparable declaration codes.
 *
 * A list, not a single value, because `Content-Language: en, uk` is legal and
 * says the response is in both — collapsing it to the first entry would
 * manufacture a contradiction against a page that declared no such thing.
 * Blank entries are dropped rather than resolved, so a trailing comma is not a
 * declaration of nothing.
 */
export function headDeclarationLanguages(declaration: HeadLanguageDeclaration): readonly string[] {
  const raw =
    declaration.kind === 'content-language'
      ? declaration.value.split(LIST_SEPARATOR)
      : [ogLocaleTag(declaration.value)];
  const languages: string[] = [];
  for (const entry of raw) {
    const trimmed = entry.trim();
    if (trimmed === '') continue;
    languages.push(declaredLanguageOf(trimmed));
  }
  return languages;
}

/** The head declarations of one kind, in document order. */
export function headDeclarationsOf(
  page: PageEvidence,
  kind: HeadLanguageDeclaration['kind'],
): readonly HeadLanguageDeclaration[] {
  return (page.document.head?.declarations ?? []).filter(
    (declaration) => declaration.kind === kind,
  );
}

/** How a finding names the carrier it read. */
export function headCarrierLabel(declaration: HeadLanguageDeclaration): string {
  if (declaration.kind === 'og-locale') return '<meta property="og:locale">';
  if (declaration.kind === 'og-locale-alternate') {
    return '<meta property="og:locale:alternate">';
  }
  return declaration.source === 'header'
    ? 'the Content-Language response header'
    : '<meta http-equiv="content-language">';
}
