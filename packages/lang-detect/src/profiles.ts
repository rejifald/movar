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
import type { LanguageCode } from './lang-codes';
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

/** Bulgarian has no OpenSubtitles frequency data here — hand-curated content
 *  words, mirroring the BE fallback. Speaker-review required; keep forms whose
 *  spelling is genuinely Bulgarian (e.g. `град`/`днес` vs ru `город`/`сегодня`,
 *  uk `місто`/`сьогодні`) so set-difference can use them at rung 2b. */
const BG_FREQUENT: readonly string[] = [
  'новини',
  'видео',
  'град',
  'държава',
  'днес',
  'живот',
  'хора',
  'работа',
  'българия',
  'български',
  'известен',
  'страна',
];

const uk: LanguageProfile = {
  code: 'uk',
  iso6393: 'ukr',
  // has і ї є ґ and и; lacks ё ъ ы э
  alphabet: 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя',
  // intra-word apostrophe (комп'ютер, сім'я, під'їзд) — uk/be use it where ru
  // uses ъ/nothing. All three codepoints: U+0027 ' U+2019 ' U+02BC ʼ.
  marks: "'’ʼ",
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
  iso6393: 'rus',
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
  iso6393: 'bel',
  // has і ў and ы ё э; lacks и щ ъ ї є ґ
  alphabet: 'абвгдеёжзійклмнопрстуўфхцчшыьэюя',
  // intra-word apostrophe (аб'ява, сям'я) — same uk/be keep-signal. Since uk and
  // be both carry it, it is inert between them and only decides them vs ru.
  marks: "'’ʼ",
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

const bg: LanguageProfile = {
  code: 'bg',
  iso6393: 'bul',
  // 30-letter Bulgarian alphabet. Has и й щ ъ ь (ъ is a full vowel, in nearly
  // every word); lacks ё ы э і ї є ґ ў. `ъ` is shared with ru — so once bg is a
  // candidate it is inert between {ru, bg} and the word rungs decide, exactly
  // the mechanism `be` relies on for its shared letters.
  alphabet: 'абвгдежзийклмнопрстуфхцчшщъьюя',
  words: {
    // Bulgarian-distinctive grammatical markers: forms whose spelling is used
    // by Bulgarian and none of the other supported Cyrillic languages. Shared
    // forms are deliberately omitted — `да`/`там`/`много` (also Russian),
    // `как` (in ru.function → set-difference cancels it), and the universal
    // particles (е, на, за, се, не, и, в, с, по, или, но). A missing marker only
    // costs recall; a wrong one risks pulling genuine ru off a hide.
    function: [
      'ще',
      'съм',
      'това',
      'този',
      'тази',
      'който',
      'която',
      'което',
      'които',
      'защото',
      'също',
      'тя',
      'ние',
      'вие',
    ],
    frequent: FREQUENT_GENERATED['bg'] ?? BG_FREQUENT,
  },
};

const en: LanguageProfile = {
  code: 'en',
  iso6393: 'eng',
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

export { uk, ru, be, bg, en };

/** Registry of shipped profiles, keyed by BCP-47 code. The detection DATA;
 *  `hasProfile` (in ./profile-codes) is the data-free membership check. */
export const PROFILES: Readonly<Record<LanguageCode, LanguageProfile>> = { uk, ru, be, bg, en };

/** Resolve profiles for the given codes, skipping any without a shipped profile. */
export function getProfiles(codes: readonly LanguageCode[]): LanguageProfile[] {
  return codes.map((c) => PROFILES[c]).filter((p): p is LanguageProfile => p !== undefined);
}
