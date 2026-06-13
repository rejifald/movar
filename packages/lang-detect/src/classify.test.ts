import { describe, expect, it } from 'vitest';
import { classifyBySnippet, distinctiveChars, stripNoise } from './classify';
import type { LanguageProfile } from './classify';
import { be, bg, en, getProfiles, ru, uk } from './profiles';

/** The default-UA classification candidate set the content filter derives:
 *  priority (uk, en) ∪ blocked (ru) ∪ the imposed Cyrillic overlay (be, bg). */
const DEFAULT_CANDIDATES = [uk, en, ru, be, bg];

/** True if any code point of `word` is in `distinctive`. `for…of` iterates by
 *  code point (the chars here are BMP Cyrillic/Latin letters); this avoids both
 *  the spread-over-string foot-gun (@typescript-eslint/no-misused-spread) and
 *  `Array.from` (unicorn/prefer-spread). */
function hasDistinctiveChar(word: string, distinctive: ReadonlySet<string>): boolean {
  for (const ch of word) if (distinctive.has(ch)) return true;
  return false;
}

describe('classifyBySnippet — rung 1 (alphabet)', () => {
  it('decides uk via a distinctive letter (і)', () => {
    const v = classifyBySnippet('Слава Україні', [uk, ru]);
    expect(v.language).toBe('uk');
    expect(v.rung).toBe(1);
  });

  it('decides ru via a distinctive letter (э/ы)', () => {
    expect(classifyBySnippet('Это русский язык, объём', [uk, ru]).language).toBe('ru');
  });

  it('decides be via і against ru', () => {
    const v = classifyBySnippet('Я ведаю беларускую мову, дзякуй за ўсё', [be, ru]);
    expect(v.language).toBe('be');
    expect(v.rung).toBe(1);
  });
});

describe('classifyBySnippet — fellow-victim Cyrillic is never concealed-as-ru', () => {
  // The whole point of shipping a bg profile + imposing be/bg as candidates:
  // confident Belarusian/Bulgarian text must NOT collapse to a ru verdict (which
  // the conceal layer would hide for a default UA user).
  it('Bulgarian text → bg, never ru, under default candidates', () => {
    // съм/това/защото are bg function words; ъ is shared {ru, bg} (inert).
    const v = classifyBySnippet('Аз съм българин и това е защото обичам езика', DEFAULT_CANDIDATES);
    expect(v.language).toBe('bg');
    expect(v.language).not.toBe('ru');
  });

  it('a lone ъ no longer reads as ru once bg is a candidate', () => {
    // ъ is ru-distinctive in {uk, ru} but inert in {ru, bg} — neither owns it.
    expect(classifyBySnippet('ъ', [uk, ru]).language).toBe('ru');
    expect(classifyBySnippet('ъ', [ru, bg]).language).toBe('unknown');
    expect(classifyBySnippet('ъ', DEFAULT_CANDIDATES).language).not.toBe('ru');
  });

  it('Belarusian text → be, never ru, under default candidates', () => {
    // ў is uniquely Belarusian even with bg in the set.
    const v = classifyBySnippet('Я ведаю беларускую мову, дзякуй за ўсё', DEFAULT_CANDIDATES);
    expect(v.language).toBe('be');
    expect(v.rung).toBe(1);
    expect(v.language).not.toBe('ru');
  });

  it('Russian distinctive text still wins ru even with be/bg present', () => {
    // ё/ы are now shared with be, but the ru function words это/очень decide 2a.
    const v = classifyBySnippet('Это очень важно для всех нас', DEFAULT_CANDIDATES);
    expect(v.language).toBe('ru');
  });
});

describe('classifyBySnippet — intra-word apostrophe (uk/be keep-signal)', () => {
  // The tokenizer drops the apostrophe, so it lives in profile.marks and is
  // scanned at rung 1. All three apostrophe codepoints: ' (U+0027) ’ (U+2019)
  // ʼ (U+02BC). It only ever argues uk/be → keep, never ru → hide.
  for (const [label, ch] of [
    ['U+0027', "'"],
    ['U+2019', '’'],
    ['U+02BC', 'ʼ'],
  ] as const) {
    it(`комп${ch}ютер → uk (apostrophe ${label})`, () => {
      const v = classifyBySnippet(`комп${ch}ютер`, [uk, ru]);
      expect(v.language).toBe('uk');
      expect(v.rung).toBe(1);
    });
  }

  it("під'їзд → uk (and never ru) under default candidates", () => {
    // Has both і/ї and the apostrophe; resolves to uk even with be/bg present.
    expect(classifyBySnippet("під'їзд", DEFAULT_CANDIDATES).language).toBe('uk');
  });

  it('an apostrophe-only word is inert between uk and be (both carry the mark)', () => {
    // Shared mark → owned by ≥2 candidates → cancels: the safe keep, never ru.
    expect(classifyBySnippet("комп'ютер", DEFAULT_CANDIDATES).language).not.toBe('ru');
    expect(classifyBySnippet("комп'ютер", [uk, be]).language).toBe('unknown');
  });

  it('the apostrophe never argues a hide: a Latin contraction stays en, not uk', () => {
    // Dominant-script scoping drops the Cyrillic uk/be candidates for Latin text,
    // so don't/it's read as en, not as a uk apostrophe signal.
    expect(classifyBySnippet("don't worry, it's fine", DEFAULT_CANDIDATES).language).toBe('en');
  });
});

describe('classifyBySnippet — distinctiveness is candidate-set-relative', () => {
  it('`і` → uk in {uk, ru}', () => {
    expect(classifyBySnippet('і', [uk, ru]).language).toBe('uk');
  });

  it('`і` → be in {be, ru}', () => {
    expect(classifyBySnippet('і', [be, ru]).language).toBe('be');
  });

  it('`і` → unknown in {uk, be} (both have it — inert)', () => {
    expect(classifyBySnippet('і', [uk, be]).language).toBe('unknown');
  });

  it('`ы` is inert in {be, ru}; `і` still wins be', () => {
    // ы is shared be/ru → contributes to neither; і is be-only.
    expect(classifyBySnippet('ы і', [be, ru]).language).toBe('be');
  });

  it('`и` is ru-distinctive vs be (be has no и)', () => {
    expect(classifyBySnippet('ы и', [be, ru]).language).toBe('ru');
  });
});

describe('classifyBySnippet — robust to duplicate candidate codes', () => {
  it('dedupes a repeated candidate so its distinctive letter still wins', () => {
    // A language can appear twice in the candidate list — e.g. an imposed
    // overlay language that is also user-enabled. A char distinctive to it must
    // not be read as "owned by two candidates" (which would cancel it out and
    // silently disable concealment); dedup by code keeps the verdict.
    expect(classifyBySnippet('і', [uk, uk, ru])).toMatchObject({ language: 'uk', rung: 1 });
    expect(classifyBySnippet('і', [ru, uk, uk]).language).toBe('uk');
  });
});

describe('classifyBySnippet — rung 2a (function words)', () => {
  it('standalone `и` → ru (letter is shared, word is not)', () => {
    const v = classifyBySnippet('Кофе и чай', [uk, ru]);
    expect(v.language).toBe('ru');
    expect(v.rung).toBe('2a');
  });

  it('`що` (built from shared letters) → uk via the word rung', () => {
    const v = classifyBySnippet('Зробити що треба', [uk, ru]);
    expect(v.language).toBe('uk');
    expect(v.rung).toBe('2a');
  });
});

describe('classifyBySnippet — rung 2b (frequent words)', () => {
  it('a distinctive-free word decides via the shipped frequent lists ("работа" → ru)', () => {
    // работа has no distinctive letter and is no function word; it is in
    // ru.frequent only (uk is "робота"), so rung 2b recovers the verdict.
    const v = classifyBySnippet('работа', [uk, ru]);
    expect(v.language).toBe('ru');
    expect(v.rung).toBe('2b');
  });

  it('decides via frequent words in both directions (synthetic, corpus-independent)', () => {
    const a: LanguageProfile = {
      code: 'xa',
      alphabet: 'abc',
      words: { function: [], frequent: ['cat'] },
    };
    const b: LanguageProfile = {
      code: 'xb',
      alphabet: 'abc',
      words: { function: [], frequent: ['dog'] },
    };
    expect(classifyBySnippet('cat', [a, b])).toMatchObject({ language: 'xa', rung: '2b' });
    expect(classifyBySnippet('dog', [a, b])).toMatchObject({ language: 'xb', rung: '2b' });
  });
});

describe('classifyBySnippet — unknown ⇒ keep', () => {
  it('Latin text with only Cyrillic candidates → unknown', () => {
    expect(classifyBySnippet('Apple Music', [uk, ru]).language).toBe('unknown');
  });

  it('detects en when en is a candidate (Latin is distinctive vs Cyrillic)', () => {
    const v = classifyBySnippet('Apple Music', [uk, ru, en]);
    expect(v.language).toBe('en');
    expect(v.rung).toBe(1);
  });

  it('empty / numeric / punctuation → unknown', () => {
    expect(classifyBySnippet('', [uk, ru]).language).toBe('unknown');
    expect(classifyBySnippet('12345 !!! ...', [uk, ru]).language).toBe('unknown');
  });

  it('no candidates → unknown', () => {
    expect(classifyBySnippet('Слава Україні', []).language).toBe('unknown');
  });

  it('a genuine tie (distinctive letters that are not words) → unknown', () => {
    // ї (uk-only) vs ы (ru-only); neither is a function/frequent word, so the
    // rung-1 tie is never broken by a later rung.
    expect(classifyBySnippet('ї ы', [uk, ru]).language).toBe('unknown');
  });

  it('the ladder breaks a rung-1 tie at a later rung (`і` is also a uk word)', () => {
    // і ties ы at rung 1, but і is *also* a uk function word, so rung 2a decides.
    const v = classifyBySnippet('і ы', [uk, ru]);
    expect(v.language).toBe('uk');
    expect(v.rung).toBe('2a');
  });
});

describe('classifyBySnippet — degrades safely on real-world DOM noise', () => {
  it('still decides despite surrounding whitespace and newlines from a text node', () => {
    // Text nodes carry the indentation/newlines of the surrounding markup.
    expect(classifyBySnippet('\n   работа\n  ', [uk, ru]).language).toBe('ru');
  });

  it('falls back to unknown (never a false hide) when invisible characters split a word', () => {
    // Sites inject zero-width spaces (U+200B) and soft hyphens (U+00AD) for
    // line-breaking. These split a rung-2 word so it no longer matches; the
    // result must be 'unknown' (= do not conceal), the safe failure — never a
    // wrong-language call that would hide native content.
    expect(classifyBySnippet('работа', [uk, ru]).language).toBe('ru'); // baseline: detectable clean
    expect(classifyBySnippet('раб​ота', [uk, ru]).language).toBe('unknown'); // zero-width space
    expect(classifyBySnippet('раб­ота', [uk, ru]).language).toBe('unknown'); // soft hyphen
  });
});

describe('SnippetVerdict shape', () => {
  it('reports a positive margin and the deciding rung', () => {
    const v = classifyBySnippet('Слава Україні', [uk, ru]);
    expect(v.margin).toBeGreaterThanOrEqual(1);
    expect(v.rung).not.toBeNull();
  });

  it('unknown carries margin 0 and null rung', () => {
    expect(classifyBySnippet('', [uk, ru])).toEqual({ language: 'unknown', margin: 0, rung: null });
  });
});

describe('classifyBySnippet — dominant-script scoping', () => {
  it('a Latin brand name in a Cyrillic title does not tip the verdict to en', () => {
    // "YouTube" is the minority script; `ё` decides ru.
    expect(classifyBySnippet('Всё о коде на YouTube', [uk, ru, en]).language).toBe('ru');
  });

  it('a Cyrillic name in an English sentence stays en', () => {
    expect(classifyBySnippet('New album by Иван today', [uk, ru, en]).language).toBe('en');
  });
});

describe('classifyBySnippet — transliterated/latinized Russian (known leak, characterized)', () => {
  // There is no transliteration profile, and Latin-script Cyrillic-language text
  // scopes to {en} (the only Latin candidate), so it reads as en and is KEPT.
  // This is a documented leak (docs/per-snippet-language-detection.md "Out of
  // scope"). These assertions pin CURRENT behavior so a future transliteration
  // feature has a characterization point — they are NOT a statement that keep is
  // the desired end state.
  it('latinized Russian reads as en (kept), not detected as ru', () => {
    expect(classifyBySnippet('Privet kak dela segodnya', DEFAULT_CANDIDATES).language).toBe('en');
    expect(classifyBySnippet('Eto ochen vazhno dlya vsekh nas', DEFAULT_CANDIDATES).language).toBe(
      'en',
    );
  });
});

describe('stripNoise — URLs / @handles / #hashtags', () => {
  it('removes full URLs, bare domains, www, handles, and hashtags', () => {
    expect(stripNoise('текст https://example.com/a/b').trim()).toBe('текст');
    expect(stripNoise('текст www.example.com/x').trim()).toBe('текст');
    expect(stripNoise('текст example.com/path').trim()).toBe('текст');
    expect(stripNoise('текст @handle').trim()).toBe('текст');
    expect(stripNoise('текст #hashtag #другой').trim()).toBe('текст');
  });

  it('leaves Cyrillic prose (and intra-word apostrophes) untouched', () => {
    expect(stripNoise("комп'ютер і сім'я")).toBe("комп'ютер і сім'я");
  });
});

describe('classifyBySnippet — trailing Latin noise does not flip the script vote', () => {
  // A Russian title followed by a long Latin URL/@handle/#hashtag would, by raw
  // character count, vote Latin and scope to {en} — escaping Cyrillic detection.
  // stripNoise removes the noise before the dominant-script vote and the tallies.
  const candidates = [uk, en, ru, be, bg];

  it('Russian title + long trailing URL still classifies ru', () => {
    // Raw char count is Latin-majority here; without stripping this scopes {en}.
    const v = classifyBySnippet('Это важно для всех https://www.example.com/a/b/c/d/e', candidates);
    expect(v.language).toBe('ru');
  });

  it('Russian title + @handle still classifies ru', () => {
    expect(
      classifyBySnippet('Это очень важно сегодня @some_news_channel', candidates).language,
    ).toBe('ru');
  });

  it('Russian title + #hashtags still classifies ru', () => {
    expect(
      classifyBySnippet('Как это работает на практике #обзор #новости', candidates).language,
    ).toBe('ru');
  });

  it('a bare-domain trailing token does not flip the vote either', () => {
    const v = classifyBySnippet(
      'Когда это случилось some-very-long-domain.example.org/path',
      candidates,
    );
    expect(v.language).toBe('ru');
  });
});

describe('frequent lists carry no globally-unique characters', () => {
  // A word containing a char unique to its own language is dead weight — rung 1
  // always catches it first. The gen script drops them; this pins the invariant.
  const unique = distinctiveChars([uk, ru, be, bg, en]);
  for (const p of [uk, ru, be, bg, en]) {
    it(`${p.code}.words.frequent`, () => {
      const u = unique.get(p.code) ?? new Set<string>();
      const offenders = p.words.frequent.filter((w) => hasDistinctiveChar(w, u));
      expect(offenders).toEqual([]);
    });
  }
});

describe('getProfiles', () => {
  it('resolves known codes and skips unknown ones', () => {
    expect(getProfiles(['uk', 'ru']).map((p) => p.code)).toEqual(['uk', 'ru']);
    expect(getProfiles(['uk', 'zz']).map((p) => p.code)).toEqual(['uk']);
  });

  it('ships a bg profile (Bulgarian fellow-victim overlay)', () => {
    expect(getProfiles(['bg']).map((p) => p.code)).toEqual(['bg']);
    expect(bg.alphabet).toContain('ъ');
    expect(bg.alphabet).not.toContain('ы'); // bg has no ы
    expect(bg.iso6393).toBe('bul');
  });
});
