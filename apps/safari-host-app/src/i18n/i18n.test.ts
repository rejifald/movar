import { describe, expect, it } from 'vitest';
import { messagesFor } from './index';
import { messagesEn } from './messages-en';
import { messagesUk } from './messages-uk';

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

/** A leaf's rendered text: strings as-is, string-builders driven with a sample
 *  argument (`about.versionLink` takes the rendered `v…` stamp). Returns null
 *  for anything that is neither, so the caller can fail on the type. */
function render(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return (value as (arg: string) => string)('v1.2.3');
  return null;
}

describe('catalogue parity', () => {
  // The Ukrainian catalogue is typed against the English shape, but a runtime
  // deep-key check catches an empty string slipping in for a key someone forgot
  // to translate — a gap types don't see.
  it('uk renders non-empty copy for every leaf en has', () => {
    for (const leaf of leafPaths(messagesEn)) {
      const rendered = render(getPath(messagesUk, leaf));
      expect(rendered, `uk.${leaf} is a string or string-builder`).not.toBeNull();
      expect(rendered?.length, `uk.${leaf} non-empty`).toBeGreaterThan(0);
    }
  });

  // The version stamp is the whole visible label of the About footer's changelog
  // link, so WCAG 2.5.3 needs the accessible name to start with it — in both
  // catalogues. Same contract as `@movar/i18n`'s `versionLink`.
  it('both versionLink labels lead with the stamp they are handed', () => {
    const labels = [messagesEn, messagesUk].map((m) => m.about.versionLink('v1.6.2'));
    expect(labels.map((label) => label.startsWith('v1.6.2'))).toEqual([true, true]);
  });
});
