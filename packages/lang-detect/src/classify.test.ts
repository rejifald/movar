import { describe, expect, it } from 'vitest';
import { classifyBySnippet, distinctiveChars, francOracle, type LanguageProfile } from './classify';
import { be, en, getProfiles, ru, uk } from './profiles';

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

describe('classifyBySnippet — rung 3 (franc backstop)', () => {
  // Empty word lists so rungs 2a/2b can't fire — forces the distinctive-free
  // residual onto franc. Real alphabets + iso6393 so rung 1 still abstains on
  // shared-letter text and franc is scoped to {rus, ukr}.
  const ruRaw: LanguageProfile = {
    code: 'ru',
    iso6393: 'rus',
    alphabet: ru.alphabet,
    words: { function: [], frequent: [] },
  };
  const ukRaw: LanguageProfile = {
    code: 'uk',
    iso6393: 'ukr',
    alphabet: uk.alphabet,
    words: { function: [], frequent: [] },
  };

  it('catches distinctive-free Russian via franc when rungs 1-2 abstain', () => {
    const v = classifyBySnippet('Собака медленно бежала домой по дороге', [ukRaw, ruRaw]);
    expect(v.language).toBe('ru');
    expect(v.rung).toBe(3);
  });

  it('skips franc below the length floor', () => {
    expect(classifyBySnippet('кот', [ukRaw, ruRaw]).rung).not.toBe(3);
  });

  it('skips franc when fewer than two candidates carry an iso6393 code', () => {
    const noIso: LanguageProfile = {
      code: 'xx',
      alphabet: ru.alphabet,
      words: { function: [], frequent: [] },
    };
    expect(
      classifyBySnippet('Собака медленно бежала домой по дороге', [noIso, ruRaw]).rung,
    ).not.toBe(3);
  });
});

describe('francOracle', () => {
  it('returns a franc verdict scoped to the candidates', () => {
    const o = francOracle('Собака медленно бежала домой по дороге', [uk, ru]);
    expect(o?.language).toBe('ru');
    expect(o?.margin ?? 0).toBeGreaterThan(0);
  });

  it('returns null when franc abstains (too short)', () => {
    expect(francOracle('кот', [uk, ru])).toBeNull();
  });

  it('returns null when fewer than two candidates share the dominant script', () => {
    // Latin text → Cyrillic candidates scoped out → < 2 candidates → null.
    expect(francOracle('Apple Music playlist here', [uk, ru])).toBeNull();
  });
});

describe('frequent lists carry no globally-unique characters', () => {
  // A word containing a char unique to its own language is dead weight — rung 1
  // always catches it first. The gen script drops them; this pins the invariant.
  const unique = distinctiveChars([uk, ru, be, en]);
  for (const p of [uk, ru, be, en]) {
    it(`${p.code}.words.frequent`, () => {
      const u = unique.get(p.code) ?? new Set<string>();
      const offenders = p.words.frequent.filter((w) => [...w].some((ch) => u.has(ch)));
      expect(offenders).toEqual([]);
    });
  }
});

describe('getProfiles', () => {
  it('resolves known codes and skips unknown ones', () => {
    expect(getProfiles(['uk', 'ru']).map((p) => p.code)).toEqual(['uk', 'ru']);
    expect(getProfiles(['uk', 'zz']).map((p) => p.code)).toEqual(['uk']);
  });
});
