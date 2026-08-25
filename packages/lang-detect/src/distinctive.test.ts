import { describe, expect, it } from 'vitest';
import { classifyBySnippet } from './classify';
import type { LanguageProfile } from './classify';
import { discriminatingWords, distinctiveLetters } from './distinctive';
import { getProfiles } from './profiles';

/** The host detector's default comparison set. */
const CYRILLIC = getProfiles(['uk', 'ru', 'be']);
/** Letters as a sorted array, so failures print something readable. Code-unit
 *  order, so `ё` (U+0451) trails the `ъ ы э` block rather than leading it. */
const sorted = (set: ReadonlySet<string>): string[] => [...set].toSorted();

describe('distinctiveLetters', () => {
  it('withholds letters two candidates share, however iconic they look', () => {
    const { exclusive, shared } = distinctiveLetters(CYRILLIC);

    // The three the old hardcoded SIGNAL_SETS claimed, and who really has them:
    // `і` is Ukrainian AND Belarusian; `ы` and `ё` are Russian AND Belarusian.
    // None of them can score for anyone in this set.
    for (const letter of ['і', 'ы', 'ё']) expect(shared.has(letter)).toBe(true);
    expect(exclusive.get('uk')?.has('і')).toBe(false);
    expect(exclusive.get('ru')?.has('ы')).toBe(false);
    expect(exclusive.get('ru')?.has('ё')).toBe(false);
  });

  it('leaves Russian exactly one exclusive letter among uk/ru/be', () => {
    // Not a curiosity — it is why Russian text usually has to reach rung 2a
    // before it can be named, and why the evidence panel used to look wrong.
    expect(sorted(distinctiveLetters(CYRILLIC).exclusive.get('ru') ?? new Set())).toEqual(['ъ']);
  });

  it('gives Ukrainian ґ/є/ї and Belarusian ў', () => {
    const { exclusive } = distinctiveLetters(CYRILLIC);
    expect(sorted(exclusive.get('uk') ?? new Set())).toEqual(['є', 'ї', 'ґ']);
    expect(sorted(exclusive.get('be') ?? new Set())).toEqual(['ў']);
  });

  it('moves when the candidate set moves — the whole point of deriving it', () => {
    // Drop Belarusian and `і` becomes decisive Ukrainian evidence again. A
    // hardcoded table cannot express this, which is why it was wrong.
    const { exclusive, shared } = distinctiveLetters(getProfiles(['uk', 'ru']));
    expect(exclusive.get('uk')?.has('і')).toBe(true);
    expect(shared.has('і')).toBe(false);
    // Russian gains everything Belarusian had been sharing with it.
    expect(sorted(exclusive.get('ru') ?? new Set())).toEqual(['ъ', 'ы', 'э', 'ё']);
  });

  it('counts the apostrophe marks langtell tallies, not just the alphabet', () => {
    // uk and be both declare marks `'’ʼ`, so they are shared here — and would be
    // exclusive to Ukrainian against Russian, which declares none.
    expect(distinctiveLetters(CYRILLIC).shared.has('’')).toBe(true);
    expect(
      distinctiveLetters(getProfiles(['uk', 'ru']))
        .exclusive.get('uk')
        ?.has('’'),
    ).toBe(true);
  });

  it('gives every candidate an entry, including one with nothing exclusive', () => {
    // Bulgarian's alphabet is a subset of Russian's here, so it owns nothing on
    // its own. An absent key would make a report silently skip the candidate;
    // an empty set says "in the comparison, and cannot win at this rung".
    const { exclusive } = distinctiveLetters(getProfiles(['ru', 'bg']));
    expect(exclusive.has('bg')).toBe(true);
    expect(exclusive.get('bg')?.size).toBe(0);
  });

  it('treats a duplicated candidate as itself, not as a rival', () => {
    // `scopeCandidates` de-duplicates by code before scoring, so a repeated
    // profile must not make its own letters "shared".
    const uk = getProfiles(['uk']);
    expect(
      distinctiveLetters([...uk, ...uk])
        .exclusive.get('uk')
        ?.has('ї'),
    ).toBe(true);
    expect(distinctiveLetters([...uk, ...uk]).shared.size).toBe(0);
  });

  it('is empty rather than throwing on no candidates', () => {
    const { exclusive, shared } = distinctiveLetters([]);
    expect(exclusive.size).toBe(0);
    expect(shared.size).toBe(0);
  });
});

describe('discriminatingWords', () => {
  it('separates the two word rungs instead of merging them', () => {
    const fn = discriminatingWords(CYRILLIC, 'function');
    const freq = discriminatingWords(CYRILLIC, 'frequent');
    expect(fn.exclusive.get('uk')?.size).toBeGreaterThan(0);
    expect(freq.exclusive.get('uk')?.size).toBeGreaterThan(0);
    // Different tiers, different lists — a report that merged them would credit
    // a rung-2b verdict to rung 2a.
    expect(sorted(fn.exclusive.get('uk') ?? new Set())).not.toEqual(
      sorted(freq.exclusive.get('uk') ?? new Set()),
    );
  });

  it('treats a profile with no word lists as contributing none', () => {
    // `LanguageProfile.words` is optional, and a profile without it must degrade
    // to "nothing exclusive at this rung" rather than throwing — the same way
    // langtell's own `p.words?.[tier] ?? []` tally treats it. Reachable with a
    // hand-built profile, which is also what a future roster addition looks like
    // before its word lists are written.
    const bare = { code: 'zz', iso6393: 'zzz', alphabet: 'абв' } as LanguageProfile;
    const { exclusive } = discriminatingWords([...CYRILLIC, bare], 'function');
    expect(exclusive.get('zz')?.size).toBe(0);
    // And it does not disturb the real candidates' ownership.
    expect(exclusive.get('uk')?.size).toBeGreaterThan(0);
  });

  it('withholds words more than one candidate uses', () => {
    const { exclusive, shared } = discriminatingWords(CYRILLIC, 'function');
    for (const word of shared) {
      for (const code of ['uk', 'ru', 'be']) {
        expect(exclusive.get(code)?.has(word)).toBe(false);
      }
    }
  });
});

describe('agreement with the classifier', () => {
  // The guard that matters. The derivation is only worth showing if it names
  // the signals langtell actually scored — so drive the classifier with text
  // built FROM the derivation and check it lands where the derivation says.

  it('a lone exclusive letter decides the verdict at rung 1', () => {
    const { exclusive } = distinctiveLetters(CYRILLIC);
    for (const code of ['uk', 'ru', 'be']) {
      for (const letter of exclusive.get(code) ?? []) {
        // Padded with letters every candidate shares, so the exclusive one is
        // the only thing that can be tallied.
        const verdict = classifyBySnippet(`нава ${letter} нава`, CYRILLIC);
        expect({ letter, ...verdict }).toMatchObject({ language: code, rung: 1 });
      }
    }
  });

  it('a shared letter decides nothing at rung 1', () => {
    const { shared } = distinctiveLetters(CYRILLIC);
    for (const letter of shared) {
      const verdict = classifyBySnippet(`нава ${letter} нава`, CYRILLIC);
      // It may fall through to a later rung or to unknown; what it must never
      // do is win rung 1 on a letter no single candidate owns.
      expect({ letter, ...verdict }).not.toMatchObject({ rung: 1 });
    }
  });

  it('reports a single-candidate verdict as non-discriminating', () => {
    // The state the UI has to warn about: with one candidate in scope, the
    // question is only "is this more Ukrainian than nothing else", and Ukrainian
    // text answers it without the set ever having chosen between candidates.
    const verdict = classifyBySnippet('Це українська сторінка', getProfiles(['uk']));
    expect(verdict.language).toBe('uk');
    expect(verdict.discriminating).toBe(false);
  });

  it('a lone candidate the text contradicts abstains rather than winning by default', () => {
    // It used to answer 'uk' here — the honest output of the question asked, but
    // an answer no reader hears that way. Russian text carries `э`/`ы`, letters
    // Ukrainian does not have, and langtell now withdraws a verdict its own
    // alphabet cannot account for. A closed set that cannot spell the text says
    // so instead of naming its only member.
    const verdict = classifyBySnippet('Это русский текст', getProfiles(['uk']));
    expect(verdict.language).toBe('unknown');
    expect(verdict.discriminating).toBe(false);
  });

  it('reports the same text against a real set as discriminating', () => {
    const verdict = classifyBySnippet('Это русский текст', CYRILLIC);
    expect(verdict.language).toBe('ru');
    expect(verdict.discriminating).toBe(true);
  });
});
