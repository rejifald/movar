/**
 * Per-language detection profiles + their resolver — sourced from langtell,
 * curated to movar's supported set.
 *
 * These profiles (uk/ru/be/bg/en: alphabet, orthographic marks, curated function
 * words, corpus-frequent words, ISO 639-3) were a byte-identical fork of
 * langtell's — verified field-for-field across both word tiers. Rather than carry
 * a second copy plus the OpenSubtitles codegen that produced its frequent-word
 * lists, re-export the shared registry from `langtell/profiles`.
 *
 * langtell ships a broader Cyrillic roster than movar targets (it adds sr/mk/kk,
 * and may add more). movar pins the languages it actually supports via
 * {@link PROFILED_CODES}, so a langtell roster bump doesn't silently widen
 * movar's detection surface — adopting a new language stays a deliberate,
 * calibrated change to that set. `PROFILES` and {@link getProfiles} are narrowed
 * to it here; the individual `uk`/`ru`/… profiles pass through unchanged.
 *
 * The data-free membership check (`hasProfile`/`PROFILED_CODES`) deliberately
 * stays in ./profile-codes: it feeds the always-on content bundle, so it must
 * not drag this word-list DATA along with it.
 */
import {
  PROFILES as LANGTELL_PROFILES,
  getProfiles as getLangtellProfiles,
} from 'langtell/profiles';
import type { LanguageProfile } from './classify';
import type { LanguageCode } from './lang-codes';
import { PROFILED_CODES } from './profile-codes';

export { uk, ru, be, bg, en } from 'langtell/profiles';

/** langtell's registry, narrowed to movar's curated {@link PROFILED_CODES}. */
export const PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = Object.fromEntries(
  Object.entries(LANGTELL_PROFILES).filter(([code]) => PROFILED_CODES.has(code)),
);

/** Resolve `codes` to their profiles, scoped to movar's supported set: a code
 *  langtell knows but movar doesn't ship is dropped, same as an unknown code
 *  (langtell's own resolver already drops the truly-unknown). */
export function getProfiles(codes: readonly LanguageCode[]): LanguageProfile[] {
  return getLangtellProfiles(codes.filter((code) => PROFILED_CODES.has(code)));
}
