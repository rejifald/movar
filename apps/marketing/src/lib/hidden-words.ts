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
 * `hidden-words.test.ts` is the class guard for the word groups below: it
 * does not re-verify any single entry by hand, it asserts the SHAPE that
 * keeps every entry safe under every matching rule this module has to serve.
 */

import { guideStrings } from './guide';

/**
 * Cyrillic letters Ukrainian never uses — the same alphabet-level signal
 * Movar's own detector derives as Russian-exclusive against Ukrainian at its
 * first rung (`distinctiveLetters` in `packages/lang-detect/src/distinctive.ts`
 * — cited for the parallel, not imported: that module scores an arbitrary
 * candidate set at runtime against a shared corpus, this is a fixed
 * four-letter list for a copy-paste box, and the two have no reason to share
 * code).
 *
 * Because no Ukrainian word can contain one of these, a ONE-character mute
 * built from this list is safe under every matching rule above, including
 * Threads' undocumented one — which is why every entry below that is a bare
 * single character is drawn only from here.
 */
export const RUSSIAN_ONLY_LETTERS = ['ы', 'э', 'ъ', 'ё'] as const;

/**
 * Common Russian words that each contain one of {@link RUSSIAN_ONLY_LETTERS}
 * — so, by the same reasoning, no Ukrainian word can equal or contain one of
 * *these* either. Safe as a MULTI-character entry under any of the three
 * matching rules above, including a plain substring match. This is what
 * keeps the Threads paste list safe while Threads' own matching stays
 * undocumented — every multi-character entry in that list comes from here,
 * never from {@link WORDS_WITHOUT_RUSSIAN_LETTERS}.
 */
export const WORDS_WITH_RUSSIAN_LETTERS = [
  'это',
  'мы',
  'вы',
  'ты',
  'бы',
  'был',
  'была',
  'было',
  'были',
  'быть',
  'чтобы',
  'этот',
  'эта',
  'эти',
  'этого',
  'этом',
  'который',
  'которые',
  'всё',
  'ещё',
  'её',
] as const;

/**
 * Frequent Russian words that carry none of {@link RUSSIAN_ONLY_LETTERS} —
 * each rejected by the macOS Ukrainian spellchecker (checked 2026-09-24), so
 * none of them is a Ukrainian word form. Safe ONLY under WHOLE-WORD
 * matching — a substring rule would black out real Ukrainian text (see the
 * module comment above) — so this group is used only where the network's own
 * rule matches whole tokens: Bluesky's multi-character rule, and Mastodon
 * with «Ціле слово» explicitly ON. Never mixed into the Threads list, whose
 * substring behaviour is undocumented.
 */
export const WORDS_WITHOUT_RUSSIAN_LETTERS = [
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
