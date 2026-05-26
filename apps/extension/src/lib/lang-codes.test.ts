import { describe, expect, it } from 'vitest';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';

describe('normalizeLanguageCode (strict)', () => {
  it('looks up canonical ISO codes', () => {
    expect(normalizeLanguageCode('uk')).toBe('uk');
    expect(normalizeLanguageCode('en')).toBe('en');
    expect(normalizeLanguageCode('ru')).toBe('ru');
    expect(normalizeLanguageCode('de')).toBe('de');
  });

  it('maps `ua` → `uk` (URL-common alias for Ukrainian)', () => {
    expect(normalizeLanguageCode('ua')).toBe('uk');
  });

  it('case-insensitive on ASCII and Cyrillic', () => {
    expect(normalizeLanguageCode('UK')).toBe('uk');
    expect(normalizeLanguageCode('Russian')).toBe('ru');
    expect(normalizeLanguageCode('РУССКИЙ')).toBe('ru');
  });

  it('recognizes localized phrase aliases as exact matches', () => {
    expect(normalizeLanguageCode('українською')).toBe('uk');
    expect(normalizeLanguageCode('по-русски')).toBe('ru');
    expect(normalizeLanguageCode('in english')).toBe('en');
    expect(normalizeLanguageCode('auf deutsch')).toBe('de');
  });

  it('does NOT split on hyphen — `/ru-return-warranty` must not match (bosch regression)', () => {
    expect(normalizeLanguageCode('ru-return-warranty')).toBeNull();
    expect(normalizeLanguageCode('en-something-else')).toBeNull();
    expect(normalizeLanguageCode('uk-page')).toBeNull();
  });

  it('does NOT split BCP47 region — `en-US` is unknown to strict mode', () => {
    expect(normalizeLanguageCode('en-US')).toBeNull();
    expect(normalizeLanguageCode('zh-CN')).toBeNull();
  });

  it('returns null for empty / unknown input', () => {
    expect(normalizeLanguageCode('')).toBeNull();
    expect(normalizeLanguageCode('   ')).toBeNull();
    expect(normalizeLanguageCode('xx')).toBeNull();
    expect(normalizeLanguageCode('product123')).toBeNull();
    expect(normalizeLanguageCode('Бош Центр')).toBeNull();
  });
});

describe('normalizeBCP47', () => {
  it('strips region suffix: en-US → en, zh_CN → zh', () => {
    expect(normalizeBCP47('en-US')).toBe('en');
    expect(normalizeBCP47('en_US')).toBe('en');
    expect(normalizeBCP47('uk-UA')).toBe('uk');
    expect(normalizeBCP47('ru-RU')).toBe('ru');
  });

  it('treats `ua-ua` as Ukrainian (some sites use `ua` even as primary tag)', () => {
    expect(normalizeBCP47('ua-UA')).toBe('uk');
  });

  it('still works for bare ISO codes', () => {
    expect(normalizeBCP47('uk')).toBe('uk');
    expect(normalizeBCP47('en')).toBe('en');
  });

  it('returns null for unknown tags', () => {
    expect(normalizeBCP47('xx-XX')).toBeNull();
    expect(normalizeBCP47('')).toBeNull();
  });

  it('does NOT classify free-text slugs (length-of-head matters but no semantic check)', () => {
    // BCP47 split DOES treat 'ru-return-warranty' as 'ru' — that's expected
    // for documented BCP47 inputs. The whole point of having two normalizers
    // is that callers pick the right one based on input type. URL path
    // segments must use the strict variant, not this one.
    expect(normalizeBCP47('ru-return-warranty')).toBe('ru');
  });
});
