/**
 * Per-language detection profiles + their resolver — single-sourced from langtell.
 *
 * These profiles (uk/ru/be/bg/en: alphabet, orthographic marks, curated function
 * words, corpus-frequent words, ISO 639-3) were a byte-identical fork of
 * langtell's — verified field-for-field across both word tiers. Rather than carry
 * a second copy plus the OpenSubtitles codegen that produced its frequent-word
 * lists, re-export the shared registry from `langtell/profiles`.
 *
 * The data-free membership check (`hasProfile`/`PROFILED_CODES`) deliberately
 * stays in ./profile-codes: it feeds the always-on content bundle, so it must not
 * drag this word-list DATA along with it (langtell's `PROFILED_CODES` is derived
 * from `PROFILES`, so importing it here would retain the corpus).
 */
export { PROFILES, getProfiles, uk, ru, be, bg, en } from 'langtell/profiles';
