import type { LanguageCode } from './lang-codes';

/**
 * Codes we ship a detection profile for — a lightweight string set, deliberately
 * data-free (no `import` of the profile bodies). It lives in its own module so
 * {@link hasProfile}, which is imported into the always-on content bundle / the
 * structural conceal chunk, drags none of the profile DATA (alphabets, word
 * lists) along with it. `profiles.test.ts` pins this to `Object.keys(PROFILES)`
 * so the hand-written set can't drift from the real registry.
 */
export const PROFILED_CODES: ReadonlySet<LanguageCode> = new Set(['uk', 'ru', 'be', 'bg', 'en']);

/**
 * True when a shipped detection profile exists for `code` (uk/ru/be/bg/en today
 * — all Cyrillic plus English).
 *
 * The content filter uses this to gate its candidate/enabled sets: a
 * profile-less code can't be classified, so a profile-less *enabled* target
 * (e.g. a Latin diaspora language a user added to their priority list, #125)
 * must not be treated as a recognizable language — otherwise the set-difference
 * classifier risks over-concealing cards written in that very language. The
 * redirect layer is multi-target regardless; on-page concealment stays scoped to
 * the languages the detector can actually tell apart.
 */
export function hasProfile(code: LanguageCode): boolean {
  return PROFILED_CODES.has(code);
}
