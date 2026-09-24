/*
 * Class guard for `hidden-words.ts` — the "words to hide" lists the guide
 * teaches readers to paste into Threads/Bluesky/Mastodon.
 *
 * This does not re-verify any single entry by hand (that verification lives
 * in the module's own comments, checked against each network's moderation
 * source). It asserts the SHAPE that keeps every entry safe under every
 * matching rule those three networks use — so a future edit that adds one
 * word without thinking through where it is safe fails here instead of
 * shipping a reader a mute that hides Ukrainian text.
 */
import { describe, expect, it } from 'vitest';

import {
  EXCLUDED_LOOKALIKES,
  HIDDEN_WORDS_LISTS,
  RUSSIAN_ONLY_LETTERS,
  WORDS_WITHOUT_RUSSIAN_LETTERS,
  WORDS_WITH_RUSSIAN_LETTERS,
  isHiddenWordsListId,
  renderHiddenWordsBlock,
} from './hidden-words';

/** Every letter Ukrainian orthography uses — hardcoded rather than imported,
 *  so this guard does not trust the same code it is checking. */
const UKRAINIAN_ALPHABET = 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюя';

/** Plain lowercase Cyrillic, no whitespace, no apostrophe, and — checked
 *  separately below by name — none of the Ukrainian-only letters і ї є ґ:
 *  the Cyrillic block's lowercase run is `а-я` PLUS `ё`, and none of
 *  і (0456) ї (0457) є (0454) ґ (0491) falls inside that range. */
const PLAIN_CYRILLIC = /^[а-яё]+$/u;

/** Whether `word` contains one of the four Russian-exclusive letters
 *  anywhere in it — a plain per-letter `.includes()` scan, not a spread of
 *  `word` into characters. */
function hasRussianLetter(word: string): boolean {
  return RUSSIAN_ONLY_LETTERS.some((letter) => word.includes(letter));
}

describe('RUSSIAN_ONLY_LETTERS', () => {
  it('is exactly the four Russian letters Ukrainian never uses', () => {
    expect(RUSSIAN_ONLY_LETTERS).toEqual(['ы', 'э', 'ъ', 'ё']);
  });

  it('contains no Ukrainian letter', () => {
    for (const letter of RUSSIAN_ONLY_LETTERS) {
      expect(UKRAINIAN_ALPHABET.includes(letter), `"${letter}" must not be Ukrainian`).toBe(false);
    }
  });
});

describe('every list entry is plain lowercase Cyrillic', () => {
  for (const [id, list] of Object.entries(HIDDEN_WORDS_LISTS)) {
    it(`${id}: no whitespace, apostrophe, or і/ї/є/ґ in any entry`, () => {
      for (const word of list.words) {
        expect(PLAIN_CYRILLIC.test(word), `${id}: "${word}"`).toBe(true);
      }
    });
  }
});

describe('the «и» trap — a lone letter must be a Russian-exclusive one', () => {
  for (const [id, list] of Object.entries(HIDDEN_WORDS_LISTS)) {
    it(`${id}: every one-character entry is one of RUSSIAN_ONLY_LETTERS`, () => {
      for (const word of list.words) {
        if (word.length !== 1) continue;
        // A bare "и" as a one-character mute would hide nearly every
        // Ukrainian post on a platform matching Bluesky's rule — the exact
        // failure EXCLUDED_LOOKALIKES exists to name.
        expect(
          (RUSSIAN_ONLY_LETTERS as readonly string[]).includes(word),
          `${id}: "${word}" is a lone letter but not Russian-exclusive`,
        ).toBe(true);
      }
    });
  }
});

describe('WORDS_WITH_RUSSIAN_LETTERS vs WORDS_WITHOUT_RUSSIAN_LETTERS', () => {
  it('every WORDS_WITH_RUSSIAN_LETTERS entry contains one of the four letters', () => {
    for (const word of WORDS_WITH_RUSSIAN_LETTERS) {
      expect(hasRussianLetter(word), `"${word}" carries no Russian-exclusive letter`).toBe(true);
    }
  });

  it('no WORDS_WITHOUT_RUSSIAN_LETTERS entry contains any of the four letters', () => {
    for (const word of WORDS_WITHOUT_RUSSIAN_LETTERS) {
      expect(
        hasRussianLetter(word),
        `"${word}" unexpectedly carries a Russian-exclusive letter`,
      ).toBe(false);
    }
  });

  it('every multi-character threads entry contains one of the four letters — the substring danger', () => {
    // Threads' own substring behaviour is undocumented, so every entry longer
    // than one character in that list must be safe even under a plain
    // substring match — see the module comment for «нет» ⊂ «інтернет» etc.
    for (const word of HIDDEN_WORDS_LISTS.threads.words) {
      if (word.length <= 1) continue;
      expect(hasRussianLetter(word), `threads: "${word}"`).toBe(true);
    }
  });
});

describe('EXCLUDED_LOOKALIKES', () => {
  it('never appears in any shipped list', () => {
    const excluded = new Set<string>(EXCLUDED_LOOKALIKES);
    for (const [id, list] of Object.entries(HIDDEN_WORDS_LISTS)) {
      for (const word of list.words) {
        expect(excluded.has(word), `${id}: "${word}" is an excluded lookalike`).toBe(false);
      }
    }
  });
});

describe('no duplicate entries within a list', () => {
  for (const [id, list] of Object.entries(HIDDEN_WORDS_LISTS)) {
    it(id, () => {
      expect(new Set(list.words).size, id).toBe(list.words.length);
    });
  }
});

describe('HIDDEN_WORDS_LISTS compositions', () => {
  it('threads: paste, letters then WORDS_WITH_RUSSIAN_LETTERS', () => {
    expect(HIDDEN_WORDS_LISTS.threads).toEqual({
      format: 'paste',
      words: [...RUSSIAN_ONLY_LETTERS, ...WORDS_WITH_RUSSIAN_LETTERS],
    });
  });

  it('letters: entries, RUSSIAN_ONLY_LETTERS alone', () => {
    expect(HIDDEN_WORDS_LISTS.letters).toEqual({
      format: 'entries',
      words: [...RUSSIAN_ONLY_LETTERS],
    });
  });

  it('words: entries, WORDS_WITHOUT_RUSSIAN_LETTERS alone', () => {
    expect(HIDDEN_WORDS_LISTS.words).toEqual({
      format: 'entries',
      words: [...WORDS_WITHOUT_RUSSIAN_LETTERS],
    });
  });
});

describe('renderHiddenWordsBlock', () => {
  it('threads: contains the exact comma-joined text and a hidden copy button', () => {
    const html = renderHiddenWordsBlock('threads');
    const expectedText = [...RUSSIAN_ONLY_LETTERS, ...WORDS_WITH_RUSSIAN_LETTERS].join(', ');

    expect(html).toContain(expectedText);
    expect(html).toContain('data-hidden-words-copy');
    // `hidden` on the button itself — the page's script unhides it, so a
    // reader with JavaScript off never sees a dead button.
    expect(html).toMatch(/data-hidden-words-copy[^>]*\bhidden\b/);
  });

  it('letters: one data-hidden-words-entry per letter', () => {
    const html = renderHiddenWordsBlock('letters');
    const matches = html.match(/data-hidden-words-entry/g) ?? [];
    expect(matches).toHaveLength(HIDDEN_WORDS_LISTS.letters.words.length);
  });

  it('words: one data-hidden-words-entry per word', () => {
    const html = renderHiddenWordsBlock('words');
    const matches = html.match(/data-hidden-words-entry/g) ?? [];
    expect(matches).toHaveLength(HIDDEN_WORDS_LISTS.words.words.length);
  });
});

describe('isHiddenWordsListId', () => {
  it('accepts every real id', () => {
    for (const id of Object.keys(HIDDEN_WORDS_LISTS)) {
      expect(isHiddenWordsListId(id)).toBe(true);
    }
  });

  it('rejects an unknown id', () => {
    expect(isHiddenWordsListId('bluesky')).toBe(false);
    expect(isHiddenWordsListId('mastodon')).toBe(false);
    expect(isHiddenWordsListId('')).toBe(false);
  });
});
