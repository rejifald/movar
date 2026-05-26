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
