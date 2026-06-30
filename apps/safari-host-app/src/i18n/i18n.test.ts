import { describe, expect, it } from 'vitest';
import { messagesFor, resolveLocale } from './index';
import { messagesEn } from './messages-en';
import { messagesUk } from './messages-uk';

describe('resolveLocale', () => {
  it('returns uk for Ukrainian primary subtags, any region', () => {
    expect(resolveLocale('uk')).toBe('uk');
    expect(resolveLocale('uk-UA')).toBe('uk');
    expect(resolveLocale('UK')).toBe('uk');
  });

  it('falls back to en for English and every unsupported tag', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale('en-US')).toBe('en');
    expect(resolveLocale('fr-FR')).toBe('en');
    expect(resolveLocale('de')).toBe('en');
  });

  it('falls back to en for empty / nullish input', () => {
    const missing: string | null | undefined = undefined;
    expect(resolveLocale('')).toBe('en');
    expect(resolveLocale(null)).toBe('en');
    expect(resolveLocale(missing)).toBe('en');
  });
});

describe('messagesFor', () => {
  it('maps each locale to its catalogue', () => {
    expect(messagesFor('en')).toBe(messagesEn);
    expect(messagesFor('uk')).toBe(messagesUk);
  });
});

/** Flatten an object's leaves to dotted paths ("tabs.detector", …). */
function leafPaths(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? leafPaths(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** Read a dotted path out of a nested object. */
function getPath(obj: object, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, k) => (acc as Record<string, unknown>)[k], obj);
}

describe('catalogue parity', () => {
  // The Ukrainian catalogue is typed against the English shape, but a runtime
  // deep-key check catches an empty string slipping in for a key someone forgot
  // to translate — a gap types don't see.
  it('uk has a non-empty string for every leaf en has', () => {
    for (const leaf of leafPaths(messagesEn)) {
      const value = getPath(messagesUk, leaf);
      expect(typeof value, `uk.${leaf}`).toBe('string');
      expect((value as string).length, `uk.${leaf} non-empty`).toBeGreaterThan(0);
    }
  });
});
