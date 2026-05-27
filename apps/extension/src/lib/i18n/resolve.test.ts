import { describe, expect, it } from 'vitest';
import { resolveLocale } from './resolve';

describe('resolveLocale', () => {
  it('honours an explicit en override regardless of browser language', () => {
    expect(resolveLocale('en', 'uk-UA')).toBe('en');
    expect(resolveLocale('en', 'de-DE')).toBe('en');
  });

  it('honours an explicit uk override regardless of browser language', () => {
    expect(resolveLocale('uk', 'en-US')).toBe('uk');
    expect(resolveLocale('uk', 'ja-JP')).toBe('uk');
  });

  it('matches Ukrainian browser UI to uk on auto', () => {
    expect(resolveLocale('auto', 'uk')).toBe('uk');
    expect(resolveLocale('auto', 'uk-UA')).toBe('uk');
    expect(resolveLocale('auto', 'UK-ua')).toBe('uk'); // case-insensitive
  });

  it('falls back to en on auto for any unsupported browser language', () => {
    expect(resolveLocale('auto', 'en-US')).toBe('en');
    expect(resolveLocale('auto', 'de-DE')).toBe('en');
    expect(resolveLocale('auto', 'ja')).toBe('en');
    expect(resolveLocale('auto', '')).toBe('en');
  });
});
