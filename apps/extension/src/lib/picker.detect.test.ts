import { describe, expect, it } from 'vitest';
import { detectPageLanguage } from './picker';

describe('detectPageLanguage', () => {
  it('reads <html lang>', () => {
    document.documentElement.setAttribute('lang', 'ru-RU');
    expect(detectPageLanguage()).toBe('ru');
  });

  it('falls back to URL path segment', () => {
    document.documentElement.removeAttribute('lang');
    expect(detectPageLanguage(document, { pathname: '/ua/foo' })).toBe('uk');
  });

  it('returns null when neither signal is present', () => {
    expect(detectPageLanguage(document, { pathname: '/about' })).toBeNull();
  });
});

describe('detectPageLanguage — subdomain', () => {
  // ru.example.com / ua.example.com is one of the most common multilingual
  // patterns and currently slips past detection entirely.
  it('reads a language-coded subdomain (ru.example.com)', () => {
    const loc = { pathname: '/about', hostname: 'ru.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('html lang wins over a conflicting language-coded subdomain', () => {
    document.documentElement.setAttribute('lang', 'ru');
    const loc = { pathname: '/about', hostname: 'ua.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });

  it('maps the `ua` subdomain alias to uk', () => {
    const loc = { pathname: '/', hostname: 'ua.example.com' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('ignores non-language subdomain labels (www, m, api)', () => {
    const loc1 = { pathname: '/about', hostname: 'www.example.com' };
    expect(detectPageLanguage(document, loc1)).toBeNull();
    const loc2 = { pathname: '/about', hostname: 'm.example.com' };
    expect(detectPageLanguage(document, loc2)).toBeNull();
    const loc3 = { pathname: '/about', hostname: 'api.example.com' };
    expect(detectPageLanguage(document, loc3)).toBeNull();
  });

  it('does not treat the apex domain as a language', () => {
    const loc = { pathname: '/about', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});

describe('detectPageLanguage — deeper path segments', () => {
  it('finds a language code in the second path segment', () => {
    expect(detectPageLanguage(document, { pathname: '/store/ru/category' })).toBe('ru');
  });

  it('finds a language code in the third path segment', () => {
    expect(detectPageLanguage(document, { pathname: '/store/category/ru' })).toBe('ru');
  });

  it('does not match free-text slugs that contain hyphens (bosch regression)', () => {
    expect(detectPageLanguage(document, { pathname: '/ru-return-warranty' })).toBeNull();
  });
});

describe('detectPageLanguage — content-text fallback', () => {
  // The brief calls out filtering by preferred language; the basis for that
  // is being able to detect when the page itself is in a blocked language
  // even without an <html lang> or a language-coded URL.
  it('falls back to text-content detection when html lang and URL are neutral', () => {
    document.body.textContent = 'Привет, мир! Сегодня хорошая погода. Как дела?';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('detects Ukrainian content via text-content fallback', () => {
    document.body.textContent = 'Слава Україні! Це наш рідний край, наша мова та її традиції.';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('does not classify pages with only English text content', () => {
    document.body.textContent = 'Hello world, this is an English page.';
    const loc = { pathname: '/', hostname: 'example.com' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});

describe('detectPageLanguage — hreflang self-check', () => {
  it('reads <link rel="alternate" hreflang> matching the current URL', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="ru" href="https://example.com/page" />
      <link rel="alternate" hreflang="uk" href="https://example.com/uk/page" />
    `;
    const loc = {
      pathname: '/page',
      hostname: 'example.com',
      href: 'https://example.com/page',
    };
    expect(detectPageLanguage(document, loc)).toBe('ru');
  });

  it('returns the matching hreflang language even when html lang is absent', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="uk" href="https://example.com/" />
    `;
    const loc = { pathname: '/', hostname: 'example.com', href: 'https://example.com/' };
    expect(detectPageLanguage(document, loc)).toBe('uk');
  });

  it('ignores an hreflang link whose href does not match the current page', () => {
    document.head.innerHTML = `
      <link rel="alternate" hreflang="ru" href="https://example.com/other" />
    `;
    const loc = { pathname: '/page', hostname: 'example.com', href: 'https://example.com/page' };
    expect(detectPageLanguage(document, loc)).toBeNull();
  });
});
