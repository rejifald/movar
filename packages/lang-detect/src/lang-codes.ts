// `LanguageCode` and the BCP-47 / language-code normalizers are single-sourced
// from langtell. The alias table (uk/ru/be/bg/en endonyms, the UA exonyms and
// "X мова" / "по-X" picker phrases, and BCP-47 codes) and the normalization
// logic now live in langtell; this module is the thin movar-specific adapter.
//
// `normalizeBCP47` pins langtell's permissive normalizer to movar's stricter
// contract: an unknown primary subtag → `null` (movar gates on its known alias
// set and treats anything outside it as unsupported), where langtell's default
// passes the raw subtag through (`pt-BR` → `pt`). We opt into its
// `unknownHead: "null"` mode to preserve the historical movar behavior.
//
// `normalizeLanguageCode` (strict, exact-match) is byte-identical on both sides,
// so it is re-exported unchanged. The only behavioral delta versus movar's former
// hand-rolled table is additive: be/bg aliases now normalize (langtell ships
// those detection profiles too) — verified to be the *sole* difference against
// the union of both alias tables.
import { normalizeBCP47 as ntNormalizeBCP47 } from 'langtell';
import type { LanguageCode } from 'langtell';

export type { LanguageCode } from 'langtell';
export { normalizeLanguageCode } from 'langtell';

/**
 * BCP47-aware normalization: tries the full string first, then strips a
 * region/script suffix (`en-US` → `en`, `uk-Latn-UA` → `uk`). Use ONLY for
 * inputs documented to be BCP47 — `hreflang`, `<html lang>`, the
 * `data-lang`/`data-locale` attributes — never for free-text URL slugs (use
 * {@link normalizeLanguageCode} there, which never hyphen-splits).
 *
 * Returns `null` when the primary subtag isn't a language we recognize
 * (`pt-BR` → `null`, `sv` → `null`): movar treats a tag outside its alias set as
 * unsupported rather than passing the bare subtag through.
 */
export function normalizeBCP47(input: string): LanguageCode | null {
  return ntNormalizeBCP47(input, { unknownHead: 'null' });
}
