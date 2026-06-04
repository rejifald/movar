import { describe, expect, it } from 'vitest';
import { resolveLocale, uiLanguageFromPriority } from './resolve';

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

  it('matches case-insensitively in the auto fallback (EN-US → en)', () => {
    // Pairs with the uk-UA case-insensitivity check above — the lowercase
    // split must work for the en branch too, not just uk.
    expect(resolveLocale('auto', 'EN-US')).toBe('en');
    expect(resolveLocale('auto', 'DE-DE')).toBe('en');
  });
});

describe('uiLanguageFromPriority', () => {
  it('uses the first priority language the popup has a catalogue for', () => {
    expect(uiLanguageFromPriority(['uk', 'en'])).toBe('uk');
    expect(uiLanguageFromPriority(['en', 'uk'])).toBe('en');
  });

  it('skips priority languages with no catalogue', () => {
    expect(uiLanguageFromPriority(['de', 'en'])).toBe('en');
    expect(uiLanguageFromPriority(['pl', 'uk', 'en'])).toBe('uk');
  });

  it("falls back to 'auto' when no priority language is a UI locale", () => {
    expect(uiLanguageFromPriority(['de', 'fr'])).toBe('auto');
    expect(uiLanguageFromPriority([])).toBe('auto');
  });
});
