import { describe, expect, it } from 'vitest';
import type { PickerModel } from '@movar/lang-pickers/types';
import {
  detectPageLanguageFromModel,
  languageFromHtmlLang,
  languageFromPathSegments,
  languageFromSelfHreflang,
  languageFromSubdomain,
} from './page-language';

/** A picker model with no pickers, carrying just a pre-computed active language. */
const model = (activeLanguage: string | null): PickerModel => ({
  extractor: 'generic',
  pickers: [],
  activeLanguage,
});

describe('languageFromSubdomain — real-world hostnames', () => {
  it('reads a language-coded first label case-insensitively', () => {
    expect(languageFromSubdomain('RU.example.com')).toBe('ru');
  });

  it('reads a language subdomain under a multi-label TLD', () => {
    expect(languageFromSubdomain('ua.example.co.uk')).toBe('uk');
  });

  it('tolerates a trailing dot (fully-qualified hostname)', () => {
    expect(languageFromSubdomain('ru.example.com.')).toBe('ru');
  });

  it('does not treat an IP-address octet as a language', () => {
    expect(languageFromSubdomain('192.168.1.1')).toBeNull();
  });

  it('does not split a hyphenated label — region-coded subdomains stay strict', () => {
    // The first label is matched strictly (not BCP47), so a hyphenated host
    // label is never mistaken for a language. 'en-us' is a miss by design — the
    // same strictness that stops 'my-shop.example.com' from false-positiving.
    expect(languageFromSubdomain('en-us.example.com')).toBeNull();
  });

  it('returns null for an empty or missing hostname', () => {
    expect(languageFromSubdomain('')).toBeNull();
  });
});

describe('languageFromPathSegments — multiple candidates', () => {
  it('returns the first language-matching segment when several qualify', () => {
    expect(languageFromPathSegments('/en/ru/page')).toBe('en');
    expect(languageFromPathSegments('/ua/ru/page')).toBe('uk');
  });

  it('finds a language segment after non-language ones', () => {
    expect(languageFromPathSegments('/shop/de/cat')).toBe('de');
  });

  it('returns null for an empty or separator-only path', () => {
    expect(languageFromPathSegments('')).toBeNull();
    expect(languageFromPathSegments('///')).toBeNull();
  });
});

describe('languageFromHtmlLang', () => {
  it('ignores an empty lang attribute', () => {
    document.documentElement.setAttribute('lang', '');
    expect(languageFromHtmlLang(document)).toBeNull();
  });

  it('strips a region subtag (EN-GB -> en)', () => {
    document.documentElement.setAttribute('lang', 'EN-GB');
    expect(languageFromHtmlLang(document)).toBe('en');
  });

  it('returns null when no lang attribute is present', () => {
    expect(languageFromHtmlLang(document)).toBeNull();
  });
});

describe('languageFromSelfHreflang', () => {
  it('skips hreflang="x-default" and returns the real self-targeted language', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="x-default" href="https://example.com/page" />
      <link rel="alternate" hreflang="ru" href="https://example.com/page" />
      <link rel="alternate" hreflang="uk" href="https://example.com/uk/page" />
    `;
    expect(languageFromSelfHreflang(document, 'https://example.com/page')).toBe('ru');
  });

  it('requires an exact href match (a trailing-slash difference does not match)', () => {
    document.head.innerHTML =
      '<link rel="alternate" hreflang="ru" href="https://example.com/page/" />';
    expect(languageFromSelfHreflang(document, 'https://example.com/page')).toBeNull();
  });

  it('returns null when there is no current href', () => {
    expect(languageFromSelfHreflang(document, '')).toBeNull();
  });
});

describe('detectPageLanguageFromModel — the pre-built-model variant', () => {
  it('returns the model active language and skips the markup tiers', () => {
    document.documentElement.setAttribute('lang', 'ru'); // would lose to the picker
    expect(detectPageLanguageFromModel(model('uk'), document, { pathname: '/about' })).toBe('uk');
    document.documentElement.removeAttribute('lang');
  });

  it('falls through to <html lang> when the model has no active language', () => {
    document.documentElement.setAttribute('lang', 'ru');
    expect(detectPageLanguageFromModel(model(null), document, { pathname: '/about' })).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });

  it('falls through to a path segment when model and <html lang> are absent', () => {
    expect(detectPageLanguageFromModel(model(null), document, { pathname: '/ua/x' })).toBe('uk');
  });

  it('prefers a language-coded subdomain over a path segment', () => {
    expect(
      detectPageLanguageFromModel(model(null), document, {
        hostname: 'ru.example.com',
        pathname: '/ua/x',
      }),
    ).toBe('ru');
  });

  it('returns null when no tier matches', () => {
    expect(
      detectPageLanguageFromModel(model(null), document, {
        pathname: '/about',
        hostname: 'example.com',
      }),
    ).toBeNull();
  });
});
