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

  it('registers youtube.com (search_query-gated, hl+gl)', () => {
    const rule = getRuleForHost('www.youtube.com');
    expect(rule).toBeDefined();
    expect(rule!.enforce).toBe(true);
    const s = rule!.strategy;
    if (s.type !== 'searchParams') throw new Error('expected searchParams strategy');
    expect(s.onlyWhenParam).toBe('search_query');
    expect(s.params.map((p) => p.name).sort()).toEqual(['gl', 'hl']);
  });

  it('does NOT register any Russian search engines', () => {
    expect(getRuleForHost('yandex.ru')).toBeUndefined();
    expect(getRuleForHost('ya.ru')).toBeUndefined();
    expect(getRuleForHost('mail.ru')).toBeUndefined();
    expect(getRuleForHost('rambler.ru')).toBeUndefined();
  });
});

describe('search-engine rules — localized Google ccTLDs', () => {
  // A UA-priority user abroad on google.de or google.fr typing a Cyrillic
  // query gets the same Russian-result-bias problem we already fixed on
  // google.com — the rule needs to cover the popular ccTLDs too.
  it('registers google.de', () => {
    expect(getRuleForHost('www.google.de')).toBeDefined();
  });

  it('registers google.fr', () => {
    expect(getRuleForHost('www.google.fr')).toBeDefined();
  });

  it('registers google.co.uk', () => {
    expect(getRuleForHost('www.google.co.uk')).toBeDefined();
  });

  it('registers google.pl', () => {
    expect(getRuleForHost('www.google.pl')).toBeDefined();
  });

  it('registers google.com.au', () => {
    expect(getRuleForHost('www.google.com.au')).toBeDefined();
  });
});

describe('search-engine rules — Google path-scoped behavior', () => {
  // /maps and /images on google.com share the host with /search but have
  // different param semantics. lr=lang_* on Images is largely benign; on
  // Maps it can degrade or invalidate the search. The rule should at minimum
  // be aware of /search vs other paths.
  it('exposes a path-gating mechanism for the Google rule', () => {
    const rule = getRuleForHost('www.google.com')!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    // The strategy needs to be opt-in for SERPs only — a new `onlyOnPath` (or
    // equivalent) gate that's set to '/search' would do it.
    const gated = rule.strategy as unknown as { onlyOnPath?: string | RegExp };
    expect(gated.onlyOnPath).toBeDefined();
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
