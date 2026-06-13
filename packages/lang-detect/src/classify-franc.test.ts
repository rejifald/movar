import { describe, expect, it } from 'vitest';
import { classifyBySnippet } from './classify';
import type { LanguageProfile } from './classify';
import { francOracle, francRung3Resolver } from './classify-franc';
import { be, bg, en, ru, uk } from './profiles';

/** Default-UA candidate set (priority ∪ blocked ∪ imposed be/bg overlay). */
const DEFAULT_CANDIDATES = [uk, en, ru, be, bg];

describe('classifyBySnippet — rung 3 (franc backstop, injected resolver)', () => {
  // Empty word lists so rungs 2a/2b can't fire — forces the distinctive-free
  // residual onto franc. Real alphabets + iso6393 so rung 1 still abstains on
  // shared-letter text and franc is scoped to {rus, ukr}. The resolver is
  // injected: classify itself is franc-free.
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
    const v = classifyBySnippet(
      'Собака медленно бежала домой по дороге',
      [ukRaw, ruRaw],
      francRung3Resolver,
    );
    expect(v.language).toBe('ru');
    expect(v.rung).toBe(3);
  });

  it('skips franc below the length floor', () => {
    expect(classifyBySnippet('кот', [ukRaw, ruRaw], francRung3Resolver).rung).not.toBe(3);
  });

  it('skips franc when fewer than two candidates carry an iso6393 code', () => {
    const noIso: LanguageProfile = {
      code: 'xx',
      alphabet: ru.alphabet,
      words: { function: [], frequent: [] },
    };
    expect(
      classifyBySnippet(
        'Собака медленно бежала домой по дороге',
        [noIso, ruRaw],
        francRung3Resolver,
      ).rung,
    ).not.toBe(3);
  });

  it('without an injected resolver, rung 3 never fires — classify stays franc-free', () => {
    const v = classifyBySnippet('Собака медленно бежала домой по дороге', [ukRaw, ruRaw]);
    expect(v.rung).not.toBe(3);
    expect(v.language).toBe('unknown');
  });
});

describe('classifyBySnippet — Bulgarian under default candidates (with franc)', () => {
  it('confident Bulgarian prose classifies bg, never ru', () => {
    const v = classifyBySnippet(
      'Днес в София се откри нова изложба на българско изкуство.',
      DEFAULT_CANDIDATES,
      francRung3Resolver,
    );
    expect(v.language).toBe('bg');
    expect(v.language).not.toBe('ru');
  });
});

describe('classifyBySnippet — Russian + trailing noise reaches the ru verdict', () => {
  it('a distinctive-free Russian title + URL still scopes Cyrillic and franc-ranks ru', () => {
    // No ы/ё/ъ/э and no ru function word — would fall to franc. The trailing URL
    // is Latin-majority by raw char count; stripNoise keeps the script vote
    // Cyrillic so franc is scoped {ukr, rus, bel, bul} and returns ru.
    const v = classifyBySnippet(
      'Собака медленно бежала домой по дороге https://example.com/article/123',
      DEFAULT_CANDIDATES,
      francRung3Resolver,
    );
    expect(v.language).toBe('ru');
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
