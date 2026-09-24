/*
 * The single source for every "words to hide" list the guide page at
 * `/uk/guide/prykhovani-slova` teaches readers to paste into Threads',
 * Bluesky's or Mastodon's own muted-words setting — so a reader hiding
 * Russian-language posts in their feed does not have to trust three
 * hand-typed copies of the same list to stay in sync.
 *
 * ## Why one word can be safe on one network and dangerous on another
 *
 * Verified directly against each network's own moderation source (cited here
 * rather than re-derived — do not change these facts without re-checking
 * them there):
 *
 *   - Bluesky (`bluesky-social/atproto`,
 *     `packages/api/src/moderation/mutewords.ts`): a ONE-character mute
 *     matches anywhere in the post (`postText.includes(word)`); a
 *     multi-character word matches only as a whole token. Lowercased. One
 *     entry per add.
 *   - Mastodon (`app/models/custom_filter_keyword.rb`): «Ціле слово»
 *     (whole_word, default ON) compiles a Unicode-aware `\b…\b` regex; OFF
 *     falls back to a case-insensitive substring. One keyword per row.
 *   - Threads: takes a comma-separated batch («Додайте слова через кому»);
 *     whether an entry matches inside a longer word is UNDOCUMENTED.
 *
 * SAFE and USEFUL are two different questions here, and keeping them apart is
 * the whole point of this module. A single Russian-only letter is SAFE under
 * every one of the three rules above — no Ukrainian word contains one, so a
 * one-character mute built from it can never hit Ukrainian text, whichever
 * way the platform matches. Whether it is also USEFUL is separate: a
 * one-character entry only catches anything where the platform matches
 * inside a word — Bluesky, and Mastodon with «Ціле слово» off. Under
 * whole-word matching a bare letter is not a "word" of its own, so it sits
 * there inert rather than harmful — just useless. A multi-letter Russian
 * word used as a SUBSTRING, by contrast, is actively dangerous: «нет» ⊂
 * «інтернет», «если» ⊂ «несли», «кто» ⊂ «доктор», «снова» ⊂ «основа»,
 * «есть» ⊂ «честь» — every one of those is a real Ukrainian word a
 * substring mute would black out.
 *
 * `hidden-words.test.ts` is the class guard for the word groups below.
 * {@link RUSSIAN_ONLY_LETTERS} and {@link WORDS_WITH_RUSSIAN_LETTERS} are
 * derived from `@movar/lang-detect` rather than hand-typed (see their own
 * comments for how), so the test recomputes them independently from the same
 * package instead of re-asserting this module's own arithmetic.
 * {@link WORDS_WITHOUT_RUSSIAN_LETTERS} stays hand-curated for now and is
 * checked against the corpus instead. Neither kind of check is what makes an
 * entry SAFE, though — a correct derivation can still produce a word this
 * module must never ship — so every list here still gets the SHAPE
 * assertions below regardless of where its words came from.
 */

import { distinctiveLetters, getProfiles } from '@movar/lang-detect';
import type { LanguageCode, LanguageProfile } from '@movar/lang-detect';

import { guideStrings } from './guide';

/** Look up `code`'s profile in `profiles`, or throw. A missing uk/ru profile
 *  would otherwise degrade every derivation below silently — e.g.
 *  {@link distinctiveLetters} scored against a single candidate calls
 *  everything in its alphabet "exclusive" — so this fails the build loudly
 *  at module load instead. */
function requireProfile(code: LanguageCode, profiles: readonly LanguageProfile[]): LanguageProfile {
  const profile = profiles.find((candidate) => candidate.code === code);
  if (profile === undefined) {
    throw new Error(
      `@movar/lang-detect has no "${code}" profile — hidden-words.ts derives its lists from it`,
    );
  }
  return profile;
}

/**
 * The {uk, ru} pair every derived list below is scored against — the exact
 * candidate set `classifyBySnippet` itself would use for this comparison, so
 * "Russian-exclusive" means the same thing here as it does in the detector.
 * Resolved once at module load rather than per list. Both codes are always
 * in `@movar/lang-detect`'s `PROFILED_CODES` today; the length check exists
 * so a future removal breaks the marketing build instead of silently
 * shrinking a mute list.
 */
const UK_AND_RU_PROFILES = getProfiles(['uk', 'ru']);
if (UK_AND_RU_PROFILES.length !== 2) {
  throw new Error(
    `@movar/lang-detect resolved ${UK_AND_RU_PROFILES.length} of 2 profiles for ['uk', 'ru'] — ` +
      'hidden-words.ts needs both',
  );
}

const RU_PROFILE = requireProfile('ru', UK_AND_RU_PROFILES);

/**
 * langtell's Russian corpus-frequency list (hermitdave/FrequencyWords via
 * OpenSubtitles 2018) — every list below either filters or ranks against
 * this same array, so a langtell version bump moves every one of them
 * without a hand edit. Array order is corpus-frequency rank, most frequent
 * first; that ordering is not yet a documented guarantee of the package
 * (rejifald/langtell#38), only its de facto behaviour today.
 */
const RU_FREQUENT_WORDS: readonly string[] = RU_PROFILE.words?.frequent ?? [];

/** How many {@link RU_FREQUENT_WORDS} entries contain `signal` — "how often
 *  would a reader actually run into this", the measure
 *  {@link RUSSIAN_ONLY_LETTERS} ranks by. */
function frequentUsageCount(signal: string): number {
  return RU_FREQUENT_WORDS.filter((word) => word.includes(signal)).length;
}

/** Sort `signals` by {@link frequentUsageCount}, most-used first; ties break
 *  alphabetically (Russian letters, so the `ru` locale) so the order is
 *  total rather than resting on `Set` iteration order. */
function byFrequentUsage(signals: Iterable<string>): string[] {
  return [...signals].toSorted(
    (a, b) => frequentUsageCount(b) - frequentUsageCount(a) || a.localeCompare(b, 'ru'),
  );
}

/** Sort `words` by ascending rank within {@link RU_FREQUENT_WORDS} — most
 *  frequent first, per the same de facto ordering {@link RU_FREQUENT_WORDS}
 *  documents (rejifald/langtell#38). A word not found there (should not
 *  happen — `hidden-words.test.ts` asserts every curated entry is) sorts
 *  last rather than throwing, so a stale entry degrades instead of breaking
 *  the build. */
function byFrequencyRank(words: readonly string[]): string[] {
  const rank = new Map(RU_FREQUENT_WORDS.map((word, index) => [word, index]));
  return [...words].toSorted((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}

/**
 * Cyrillic letters Ukrainian never uses — derived, not hand-kept: the
 * letters `ru`'s alphabet solely owns against `uk`'s, the same rung-1
 * ownership `classifyBySnippet` itself scores at runtime
 * (`distinctiveLetters`, imported directly from `@movar/lang-detect` —
 * unlike the classifier this module never scores arbitrary text, so calling
 * the same function once at module load for the fixed {uk, ru} pair above
 * costs nothing and can never drift from what "Russian-exclusive" means
 * elsewhere in the codebase). Ranked by {@link byFrequentUsage} — most
 * encountered first — because a reader building a one-character mute list
 * benefits most from the letter they are most likely to actually see. Today:
 * ы, э, ё, ъ (18, 14, 5, 0 matches in {@link RU_FREQUENT_WORDS}).
 *
 * Because no Ukrainian word can contain one of these, a ONE-character mute
 * built from this list is safe under every matching rule above, including
 * Threads' undocumented one — which is why every entry below that is a bare
 * single character is drawn only from here.
 */
export const RUSSIAN_ONLY_LETTERS: readonly string[] = byFrequentUsage(
  distinctiveLetters(UK_AND_RU_PROFILES).exclusive.get('ru') ?? [],
);

/** How many of {@link WORDS_WITH_RUSSIAN_LETTERS}'s qualifying entries the
 *  Threads paste list carries — the this-many most frequent, named so the
 *  count reads as a decision rather than a bare `.slice(0, 20)`. Exported so
 *  `hidden-words.test.ts` can recompute the list independently against the
 *  same number instead of hardcoding a second `20`. */
export const THREADS_WORD_COUNT = 20;

/**
 * The {@link THREADS_WORD_COUNT} most frequent Russian words that each
 * contain one of {@link RUSSIAN_ONLY_LETTERS} — filtered straight out of
 * {@link RU_FREQUENT_WORDS} in its own array order (rejifald/langtell#38:
 * that order is corpus-frequency rank today, not yet a documented
 * guarantee — a future langtell release could reorder `words.frequent` for
 * an unrelated reason, and this list would still be safe, just no longer
 * led by the most-encountered word until #38 pins the contract).
 *
 * So, by the same reasoning as {@link RUSSIAN_ONLY_LETTERS}, no Ukrainian
 * word can equal or contain one of *these* either. Safe as a MULTI-character
 * entry under any of the three matching rules above, including a plain
 * substring match. This is what keeps the Threads paste list safe while
 * Threads' own matching stays undocumented — every multi-character entry in
 * that list comes from here, never from {@link WORDS_WITHOUT_RUSSIAN_LETTERS}.
 */
export const WORDS_WITH_RUSSIAN_LETTERS: readonly string[] = RU_FREQUENT_WORDS.filter((word) =>
  RUSSIAN_ONLY_LETTERS.some((letter) => word.includes(letter)),
).slice(0, THREADS_WORD_COUNT);

/**
 * Frequent Russian words that carry none of {@link RUSSIAN_ONLY_LETTERS} —
 * each rejected by the macOS Ukrainian spellchecker (checked 2026-09-24), so
 * none of them is a Ukrainian word form.
 *
 * Membership stays CURATED, unlike the two lists above: the obvious
 * derivation — `ru.words.frequent` minus `uk.words.frequent` — cannot be
 * used yet. langtell's `uk` frequent list currently carries roughly ninety
 * Russian words (rejifald/langtell#37), so a ru-minus-uk difference today
 * would drop every one of these 24 words («что», «как», «нет», «спасибо», …),
 * because langtell's own `uk` list already contains them. Subtracting only
 * the clean `uk` FUNCTION words instead is worse: it keeps Ukrainian words
 * such as «уже», «не», «на», «да», «его», «потому», «тоже».
 * Once #37 lands and `uk.words.frequent` is clean, replace this block with:
 * `ru.words.frequent` minus `uk.words.frequent` minus one-character entries
 * minus {@link EXCLUDED_LOOKALIKES}, first N — not before.
 *
 * The ORDER, though, already follows langtell: {@link byFrequencyRank}
 * against {@link RU_FREQUENT_WORDS}, most frequent first. Only the
 * membership is pinned.
 *
 * Safe ONLY under WHOLE-WORD matching — a substring rule would black out
 * real Ukrainian text (see the module comment above) — so this group is used
 * only where the network's own rule matches whole tokens: Bluesky's
 * multi-character rule, and Mastodon with «Ціле слово» explicitly ON. Never
 * mixed into the Threads list, whose substring behaviour is undocumented.
 */
const CURATED_WORDS_WITHOUT_RUSSIAN_LETTERS = [
  'что',
  'как',
  'нет',
  'если',
  'есть',
  'только',
  'когда',
  'может',
  'будет',
  'где',
  'кто',
  'очень',
  'еще',
  'сейчас',
  'почему',
  'здесь',
  'сегодня',
  'спасибо',
  'привет',
  'пожалуйста',
  'хорошо',
  'ничего',
  'всегда',
  'никогда',
] as const;

export const WORDS_WITHOUT_RUSSIAN_LETTERS: readonly string[] = byFrequencyRank(
  CURATED_WORDS_WITHOUT_RUSSIAN_LETTERS,
);

/**
 * Words that look like Russian-only signal but are not — never add these to
 * any list above. «и» is a Ukrainian letter in its own right: as a
 * ONE-character mute on Bluesky it would hide nearly every Ukrainian post,
 * the exact opposite of the point. The rest are words a Ukrainian
 * spellchecker accepts — «его» is itself Ukrainian, the psychology term
 * "ego", and «потому», «конечно» survive as archaic or dialect Ukrainian —
 * so a whole-word match on any of them still risks a real Ukrainian sentence.
 *
 * Not consumed by {@link HIDDEN_WORDS_LISTS}; `hidden-words.test.ts` asserts
 * no entry of any shipped list is one of these, which is the whole reason
 * this list exists rather than living only in a code-review comment.
 */
export const EXCLUDED_LOOKALIKES = [
  'и',
  'его',
  'она',
  'они',
  'он',
  'мне',
  'надо',
  'тоже',
  'потому',
  'конечно',
  'такая',
  'уже',
  'просто',
  'так',
  'все',
  'тут',
  'там',
  'же',
  'от',
  'тем',
  'том',
  'об',
  'ну',
  'во',
] as const;

/**
 * Every "words to hide" block the guide page renders. Ids are network-
 * agnostic — Bluesky and Mastodon both end up showing the SAME two entry
 * blocks, just under different settings, so the id names the *content*
 * (`letters`, `words`) rather than a platform:
 *
 *   - `threads` — Threads' own paste box (`paste`): one comma-separated
 *     batch mixing {@link RUSSIAN_ONLY_LETTERS} and
 *     {@link WORDS_WITH_RUSSIAN_LETTERS}, because both groups are
 *     substring-safe and Threads' own substring behaviour is undocumented.
 *   - `letters` — {@link RUSSIAN_ONLY_LETTERS} alone, as copyable entries
 *     (`entries`). Used on Bluesky (added as ordinary one-character mutes —
 *     Bluesky's own rule matches those anywhere) and on Mastodon with «Ціле
 *     слово» explicitly OFF: a single Cyrillic letter is almost never a
 *     "whole word" of its own, so whole-word matching would make it
 *     effectively inert.
 *   - `words` — {@link WORDS_WITHOUT_RUSSIAN_LETTERS} alone, as copyable
 *     entries (`entries`). Used on Bluesky (its multi-character rule already
 *     matches whole tokens only) and on Mastodon with «Ціле слово»
 *     explicitly ON — required here, because these words carry no
 *     Russian-exclusive letter, so a substring rule would black out real
 *     Ukrainian text (see the module comment).
 *
 * `format` decides which shape {@link renderHiddenWordsBlock} draws: `paste`
 * is one selectable/copyable line, `entries` is a list of individually
 * copyable chips.
 */
export interface HiddenWordsList {
  readonly format: 'paste' | 'entries';
  readonly words: readonly string[];
}

export type HiddenWordsListId = 'threads' | 'letters' | 'words';

export const HIDDEN_WORDS_LISTS: Record<HiddenWordsListId, HiddenWordsList> = {
  threads: {
    format: 'paste',
    words: [...RUSSIAN_ONLY_LETTERS, ...WORDS_WITH_RUSSIAN_LETTERS],
  },
  letters: {
    format: 'entries',
    words: [...RUSSIAN_ONLY_LETTERS],
  },
  words: {
    format: 'entries',
    words: [...WORDS_WITHOUT_RUSSIAN_LETTERS],
  },
};

const HIDDEN_WORDS_LIST_IDS = Object.keys(HIDDEN_WORDS_LISTS) as HiddenWordsListId[];

/** Type guard for a `hidden-words` fence's meta string — see
 *  `plugins/remark-hidden-words.mjs`, the only caller that has an
 *  unvalidated string in hand rather than a literal id. */
export function isHiddenWordsListId(value: string): value is HiddenWordsListId {
  return (HIDDEN_WORDS_LIST_IDS as readonly string[]).includes(value);
}

/**
 * Escape text for both an HTML text node and a double-quoted attribute
 * value. Every dynamic string this module interpolates is either a lowercase
 * Cyrillic word (none of these characters) or one of the two copy-button
 * labels below (also none) — this exists so that stays true by construction
 * rather than by the current word lists happening not to need it.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A `paste`-format block: one comma-joined line, selectable and copyable as
 * a whole — the shape Threads' own «Додайте слова через кому» box wants.
 * The copy button ships `hidden` and is revealed by the page's `<script>`
 * (see `pages/uk/guide/[...slug].astro`), so a no-JS visitor still sees and
 * can hand-select the full text.
 */
function renderPasteBlock(id: HiddenWordsListId, words: readonly string[]): string {
  const text = escapeHtml(words.join(', '));
  const copyLabel = escapeHtml(guideStrings.copy);
  const copiedLabel = escapeHtml(guideStrings.copied);

  return (
    `<div class="hidden-words" data-hidden-words="${id}" data-format="paste">` +
    `<code class="hidden-words__paste" data-hidden-words-text>${text}</code>` +
    `<button type="button" class="hidden-words__copy" data-hidden-words-copy ` +
    `data-copied-label="${copiedLabel}" hidden>${copyLabel}</button>` +
    `</div>`
  );
}

/**
 * An `entries`-format block: one chip per word — the shape a reader adds one
 * row at a time on Bluesky or Mastodon. Chips render as plain `<code>` text
 * so the list is fully readable with no JavaScript; the page's `<script>`
 * upgrades each one to a `<button>` that copies just that word. The copy and
 * copied labels ride the wrapper's own `data-*` attributes rather than each
 * chip's, since every chip in a block shares the same two labels.
 */
function renderEntriesBlock(id: HiddenWordsListId, words: readonly string[]): string {
  const copyLabel = escapeHtml(guideStrings.copy);
  const copiedLabel = escapeHtml(guideStrings.copied);
  const items = words
    .map(
      (word) =>
        `<li><code class="hidden-words__entry" data-hidden-words-entry>${escapeHtml(word)}</code></li>`,
    )
    .join('');

  return (
    `<div class="hidden-words" data-hidden-words="${id}" data-format="entries" ` +
    `data-copy-label="${copyLabel}" data-copied-label="${copiedLabel}">` +
    `<ul class="hidden-words__entries" role="list">${items}</ul>` +
    `<p class="hidden-words__status" aria-live="polite" data-hidden-words-status></p>` +
    `</div>`
  );
}

/**
 * Render one `hidden-words` block to static HTML — the only thing
 * `plugins/remark-hidden-words.mjs` puts in place of the fence that named
 * `id`. Every word comes from {@link HIDDEN_WORDS_LISTS}, so the page, the
 * class guard in `hidden-words.test.ts`, and the e2e suite all read the same
 * three lists this module owns.
 */
export function renderHiddenWordsBlock(id: HiddenWordsListId): string {
  const list = HIDDEN_WORDS_LISTS[id];
  return list.format === 'paste'
    ? renderPasteBlock(id, list.words)
    : renderEntriesBlock(id, list.words);
}
