// `LanguageCode` and the BCP-47 / language-code normalizers are single-sourced
// from langtell. The alias table (uk/ru/be/bg/en endonyms, the UA exonyms and
// "X мова" / "по-X" picker phrases, and BCP-47 codes) and the normalization
// logic live in langtell; this module is the thin movar-specific adapter.
//
// `normalizeBCP47` pins langtell's permissive normalizer to movar's stricter
// contract: an unknown primary subtag → `null` (movar gates on its known alias
// set and treats anything outside it as unsupported), where langtell's default
// passes the raw subtag through (`pt-BR` → `pt`). We opt into its
// `unknownHead: "null"` mode to preserve the historical movar behavior.
//
// Both normalizers also fill one gap in langtell's alias table: the Latin
// ISO 639-2/639-3 code `ukr` → `uk` (see MOVAR_ISO3_ALIASES). langtell resolves
// `rus`/`bel`/`bul`/`eng` but not `ukr` (it only ships the Cyrillic `укр`); the
// supplement below closes that asymmetry. Everything else is delegated
// unchanged.
import {
  normalizeBCP47 as ntNormalizeBCP47,
  normalizeLanguageCode as ntNormalizeLanguageCode,
} from 'langtell';
import type { LanguageCode } from 'langtell';

export type { LanguageCode } from 'langtell';

/**
 * ISO 639-2/639-3 three-letter codes for Movar-supported languages that
 * langtell's alias table is missing. langtell resolves `rus`→ru, `bel`→be,
 * `bul`→bg, and `eng`→en, but NOT the Latin `ukr`→uk — it only ships the
 * Cyrillic `укр`. That asymmetric gap bites in the wild: Ukrainian shops on
 * UMI.CMS label their language switcher "UKR", and the Ukrainian URL carries no
 * language prefix (Russian sits under `/ru/`), so the path segment is no help
 * either — the switcher's Ukrainian entry then never classifies, the picker is
 * left with a single language, and picker detection (≥2 languages) drops it
 * entirely. Keyed lowercase; callers trim + lowercase before lookup. Fold any
 * future upstream fix back out of here.
 */
const MOVAR_ISO3_ALIASES: Record<string, LanguageCode> = { ukr: 'uk' };

function movarIso3Alias(subtag: string): LanguageCode | null {
  return MOVAR_ISO3_ALIASES[subtag.trim().toLowerCase()] ?? null;
}

/**
 * Strict, exact-match language normalization: never hyphen-splits, so free-text
 * URL slugs (`/ru-return-warranty`) don't false-match. Delegates to langtell,
 * then fills langtell's missing `ukr`→uk alias. Use for URL path segments and
 * picker label text; use {@link normalizeBCP47} for documented BCP47 inputs.
 */
export function normalizeLanguageCode(input: string): LanguageCode | null {
  return ntNormalizeLanguageCode(input) ?? movarIso3Alias(input);
}

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
  const direct = ntNormalizeBCP47(input, { unknownHead: 'null' });
  if (direct != null) return direct;
  // langtell didn't resolve it — try the leading subtag against Movar's
  // supplemental ISO 639-2/3 aliases (`ukr` / `ukr-UA` → uk), mirroring how
  // langtell strips a BCP47 tag down to its primary subtag. `split` always
  // yields a first element at runtime; `?? ''` only satisfies the optional
  // index type, and `movarIso3Alias('')` is a clean miss.
  const primary = input.split(/[-_]/, 1)[0] ?? '';
  return movarIso3Alias(primary);
}
