import { describe, expect, it } from 'vitest';
import { encodedValue, getRuleForHost } from './index';

describe('getRuleForHost', () => {
  it('matches an exact domain', () => {
    expect(getRuleForHost('electrica-shop.com.ua')?.match).toBe('electrica-shop.com.ua');
  });

  it('matches a subdomain', () => {
    expect(getRuleForHost('www.electrica-shop.com.ua')?.match).toBe('electrica-shop.com.ua');
  });

  it('returns undefined when no rule matches', () => {
    expect(getRuleForHost('example.com')).toBeUndefined();
  });

  it('does not match partial-suffix collisions', () => {
    // 'fake-electrica-shop.com.ua' shouldn't match 'electrica-shop.com.ua'
    expect(getRuleForHost('fake-electrica-shop.com.ua')).toBeUndefined();
  });
});

describe('search-engine rules', () => {
  it('registers google.com as an enforce-mode searchParams rule', () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    expect(rule!.enforce).toBe(true);
    expect(rule!.strategy.type).toBe('searchParams');
  });

  it('registers google.com.ua separately (ccTLD is not a .com suffix)', () => {
    const rule = getRuleForHost('www.google.com.ua');
    expect(rule).toBeDefined();
    expect(rule!.match).toBe('google.com.ua');
  });

  it('registers bing.com', () => {
    const rule = getRuleForHost('www.bing.com');
    expect(rule).toBeDefined();
    expect(rule!.enforce).toBe(true);
  });

  it('registers duckduckgo.com', () => {
    const rule = getRuleForHost('duckduckgo.com');
    expect(rule).toBeDefined();
    expect(rule!.enforce).toBe(true);
  });

  it('does NOT register any Russian search engines', () => {
    expect(getRuleForHost('yandex.ru')).toBeUndefined();
    expect(getRuleForHost('ya.ru')).toBeUndefined();
    expect(getRuleForHost('mail.ru')).toBeUndefined();
    expect(getRuleForHost('rambler.ru')).toBeUndefined();
  });
});

describe('encodedValue', () => {
  it('returns the mapped value when present', () => {
    expect(encodedValue({ uk: 'ua' }, 'uk')).toBe('ua');
  });

  it('falls back to the canonical code when no map entry', () => {
    expect(encodedValue({ ru: 'ru' }, 'uk')).toBe('uk');
  });

  it('falls back to the canonical code when no values map at all', () => {
    expect(encodedValue(undefined, 'en')).toBe('en');
  });
});
