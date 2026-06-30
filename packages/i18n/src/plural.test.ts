import { describe, expect, it } from 'vitest';
import { plural } from './plural';

// Echo the chosen CLDR category so selection is asserted independent of any real
// translation. Ukrainian exercises the full one/few/many split; English the
// minimal one/other. These are the same boundaries the old hand-rolled rule
// targeted — now sourced from Intl.PluralRules (ICU/CLDR) instead.
const UK = { one: 'one', few: 'few', many: 'many', other: 'other' } as const;
const EN = { one: 'one', other: 'other' } as const;

describe('plural — Ukrainian (Intl.PluralRules, CLDR one/few/many)', () => {
  it.each([1, 21, 31, 101, 1001])('n=%i → one', (n) => {
    expect(plural('uk', n, UK)).toBe('one');
  });

  it.each([2, 3, 4, 22, 23, 24, 104])('n=%i → few', (n) => {
    expect(plural('uk', n, UK)).toBe('few');
  });

  // 11–14 are the trap the naive mod10 rule gets wrong: many, not one/few.
  it.each([0, 5, 11, 12, 13, 14, 15, 20, 25, 100, 111])('n=%i → many', (n) => {
    expect(plural('uk', n, UK)).toBe('many');
  });

  it('non-integer counts fall into the other category', () => {
    expect(plural('uk', 1.5, UK)).toBe('other');
  });
});

describe('plural — English (one/other)', () => {
  it('uses one only for exactly 1', () => {
    expect(plural('en', 1, EN)).toBe('one');
  });

  it.each([0, 2, 3, 11, 21, 100])('n=%i → other', (n) => {
    expect(plural('en', n, EN)).toBe('other');
  });
});

describe('plural — fallback', () => {
  it('falls back to other for any category the caller omitted', () => {
    // Ukrainian n=2 selects 'few'; with no few form supplied it must use other.
    expect(plural('uk', 2, { one: 'one', other: 'other' })).toBe('other');
    // n=5 selects 'many'; same fallback.
    expect(plural('uk', 5, { one: 'one', other: 'other' })).toBe('other');
  });
});
