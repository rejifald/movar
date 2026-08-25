import { describe, expect, it } from 'vitest';
import { urlLanguageMarker } from './url-language';

describe('urlLanguageMarker', () => {
  it('reads a locale path prefix', () => {
    expect(urlLanguageMarker('https://example.com.ua/uk/products')).toEqual({
      language: 'uk',
      source: 'path',
      token: 'uk',
    });
  });

  it('reads the UA slug alias', () => {
    expect(urlLanguageMarker('https://example.com.ua/ua/')?.language).toBe('uk');
  });

  it('reads a language subdomain', () => {
    expect(urlLanguageMarker('https://ru.example.com/products')).toEqual({
      language: 'ru',
      source: 'subdomain',
      token: 'ru',
    });
  });

  it('looks past www for the language label', () => {
    expect(urlLanguageMarker('https://www.uk.example.com/')?.language).toBe('uk');
  });

  it('reads a bare build path', () => {
    expect(urlLanguageMarker('uk/index.html')?.source).toBe('path');
  });

  it('prefers the path prefix over the subdomain', () => {
    expect(urlLanguageMarker('https://ru.example.com/uk/')).toEqual({
      language: 'uk',
      source: 'path',
      token: 'uk',
    });
  });

  it('does not fire on a slug that merely starts with a language code', () => {
    // The Bosch regression: strict alias matching never hyphen-splits, so
    // `/ru-return-warranty` is a product slug, not a Russian page.
    expect(urlLanguageMarker('https://example.com/ru-return-warranty')).toBeNull();
  });

  it('does not fire on an ordinary path segment', () => {
    expect(urlLanguageMarker('https://example.com/enterprise/pricing')).toBeNull();
  });

  it('does not read the registrable domain as a language', () => {
    expect(urlLanguageMarker('https://ru.com/')).toBeNull();
    expect(urlLanguageMarker('https://www.ru.com/')).toBeNull();
  });

  it('returns null when there is no marker anywhere', () => {
    expect(urlLanguageMarker('https://example.com/')).toBeNull();
  });
});
