/**
 * Per-language detection profiles for {@link classifyBySnippet}.
 *
 * Each profile is declarative and auditable:
 *   - `alphabet`        — the language's lowercased alphabet (raw; distinctiveness
 *                         is computed at runtime per candidate set).
 *   - `words.function`  — curated grammatical markers, hand-verified.
 *   - `words.frequent`  — common words from a register-matched corpus, generated
 *                         by scripts/gen-word-profiles.mts into frequent.generated.ts.
 *                         Languages the corpus doesn't cover (Belarusian — no
 *                         OpenSubtitles data) fall back to a hand-curated list.
 *
 * Curation rule for `function`: a token may appear in exactly one candidate's
 * list ONLY if that form is genuinely used by only that language among the ones
 * we support. Forms shared across languages must be in every list that uses them
 * (set-difference then cancels them) or omitted from all. When in doubt, omit:
 * a missing marker only costs recall, a wrong marker risks hiding native content.
 */
import type { LanguageProfile } from './classify';
import type { LanguageCode } from './engine';
import { FREQUENT_GENERATED } from './frequent.generated';

/** Belarusian has no OpenSubtitles frequency data — hand-curated content words. */
const BE_FREQUENT: readonly string[] = [
  'навіны',
  'відэа',
  'горад',
  'краіна',
  'дзень',
  'жыццё',
  'людзі',
  'праца',
  'беларуская',
  'сёння',
  'вядомы',
];

const uk: LanguageProfile = {
  code: 'uk',
  // has і ї є ґ and и; lacks ё ъ ы э
  alphabet: 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя',
  words: {
    function: [
      'і',
      'й',
      'що',
      'як',
      'це',
      'бо',
      'ще',
      'дуже',
      'де',
      'його',
      'її',
      'але',
      'який',
      'яка',
      'цей',
      'ця',
      'навіть',
      'чи',
      'або',
      'ні',
      'щоб',
      'теж',
      'також',
      'він',
      'вона',
      'вони',
    ],
    frequent: FREQUENT_GENERATED['uk'] ?? [],
  },
};

const ru: LanguageProfile = {
  code: 'ru',
  // has ё ъ ы э and и; lacks і ї є ґ ў
  alphabet: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя',
  words: {
    function: [
      'и',
      'что',
      'как',
      'это',
      'бы',
      'уже',
      'или',
      'нет',
      'очень',
      'его',
      'её',
      'ее',
      'где',
      'когда',
      'этот',
      'эта',
      'но',
      'какой',
      'какая',
      'даже',
      'ещё',
      'чтобы',
      'потому',
      'тоже',
      'он',
      'она',
      'они',
    ],
    frequent: FREQUENT_GENERATED['ru'] ?? [],
  },
};

const be: LanguageProfile = {
  code: 'be',
  // has і ў and ы ё э; lacks и щ ъ ї є ґ
  alphabet: 'абвгдеёжзійклмнопрстуўфхцчшыьэюя',
  words: {
    function: [
      'і',
      'што',
      'гэта',
      'вельмі',
      'дзе',
      'ці',
      'таксама',
      'як',
      'але',
      'бо',
      'каб',
      'ён',
      'яна',
      'яны',
      'быў',
    ],
    frequent: FREQUENT_GENERATED['be'] ?? BE_FREQUENT,
  },
};

const en: LanguageProfile = {
  code: 'en',
  alphabet: 'abcdefghijklmnopqrstuvwxyz',
  words: {
    function: [
      'the',
      'and',
      'or',
      'but',
      'of',
      'to',
      'in',
      'on',
      'at',
      'is',
      'are',
      'was',
      'were',
      'this',
      'that',
      'for',
      'with',
      'you',
      'we',
      'they',
      'he',
      'she',
      'it',
      'his',
      'her',
      'what',
      'how',
      'when',
      'where',
      'why',
      'who',
      'which',
      'a',
      'an',
      'i',
      'my',
      'your',
    ],
    frequent: FREQUENT_GENERATED['en'] ?? [],
  },
};

export { uk, ru, be, en };

/** Registry of shipped profiles, keyed by BCP-47 code. */
export const PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = { uk, ru, be, en };

/** Resolve profiles for the given codes, skipping any without a shipped profile. */
export function getProfiles(codes: readonly LanguageCode[]): LanguageProfile[] {
  return codes.map((c) => PROFILES[c]).filter((p): p is LanguageProfile => p !== undefined);
}
