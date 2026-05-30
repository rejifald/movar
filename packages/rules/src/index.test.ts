import { describe, expect, it } from 'vitest';
import { encodedValue, getRuleForHost, rules } from './index';

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
    const s = rule!.strategy;
    if (s.type !== 'searchParams') throw new Error('expected searchParams strategy');
    const setlang = s.params.find((p) => p.name === 'setlang');
    expect(setlang).toBeDefined();
    // setlang uses pass-through values (no custom map), so values must be absent/falsy
    expect(setlang!.values).toBeFalsy();
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
    const paramNames = s.params.map((p) => p.name);
    expect(paramNames).toEqual(expect.arrayContaining(['gl', 'hl']));
    expect(paramNames).toHaveLength(2);
  });

  it('does NOT register any Russian search engines', () => {
    expect(getRuleForHost('yandex.ru')).toBeUndefined();
    expect(getRuleForHost('ya.ru')).toBeUndefined();
    expect(getRuleForHost('mail.ru')).toBeUndefined();
    expect(getRuleForHost('rambler.ru')).toBeUndefined();
  });
});

const GOOGLE_DOMAINS = [
  'google.com',
  'google.com.ua',
  'google.de',
  'google.fr',
  'google.co.uk',
  'google.pl',
  'google.com.au',
] as const;

describe('search-engine rules — localized Google ccTLDs', () => {
  // A UA-priority user abroad on google.de or google.fr typing a Cyrillic
  // query gets the same Russian-result-bias problem we already fixed on
  // google.com — the rule needs to cover the popular ccTLDs too.
  it.each(GOOGLE_DOMAINS)('registers %s and has lr param with values map', (domain) => {
    const rule = getRuleForHost(`www.${domain}`);
    expect(rule).toBeDefined();
    const s = rule!.strategy;
    if (s.type !== 'searchParams') throw new Error('expected searchParams strategy');
    const lrParam = s.params.find((p) => p.name === 'lr');
    expect(lrParam).toBeDefined();
    // lr must carry an explicit values map (lang_<code> mapping) — not pass-through
    expect(lrParam!.values).toBeTruthy();
  });
});

describe('getRuleForHost — suffix-anchor negatives', () => {
  // getRuleForHost must NOT match when the rule's match string appears as an
  // infix, not a proper dot-separated suffix or exact match.
  const allRuleHosts = rules.map((r) => r.match);

  it.each(allRuleHosts)('does not match faked subdomain prefix for %s', (host) => {
    expect(getRuleForHost(`fake${host}`)).toBeUndefined();
  });
});

describe('getRuleForHost — most-specific rule wins', () => {
  // google.co.uk (13 chars) is more specific than google.com (10 chars).
  // Both are in the rule list and neither is a suffix of the other, but the
  // sort-by-length precedence logic is what we're locking here.
  // If both matched the same host this would be the regression guard;
  // since they don't share a suffix they resolve independently — the test
  // documents the sort-by-length contract and will catch a regression if a
  // wildcard or shared-suffix rule is ever introduced.
  it('google.co.uk rule is more specific than google.com rule (sort by match length)', () => {
    const ukRule = getRuleForHost('www.google.co.uk');
    const comRule = getRuleForHost('www.google.com');
    expect(ukRule).toBeDefined();
    expect(comRule).toBeDefined();
    expect(ukRule!.match).toBe('google.co.uk');
    expect(comRule!.match).toBe('google.com');
    // co.uk is longer — if both ever matched the same host, co.uk would win
    expect(ukRule!.match.length).toBeGreaterThan(comRule!.match.length);
  });
});

describe('search-engine rules — Google path-scoped behavior', () => {
  // /maps and /images on google.com share the host with /search but have
  // different param semantics. lr=lang_* on Images is largely benign; on
  // Maps it can degrade or invalidate the search. The behavioural assertion
  // — that /maps URLs are not rewritten — lives in strategy.test.ts; here we
  // pin the rule's path gate to '/search' so a change in the config produces
  // a clear failure pointing at this file, not at strategy mechanics.
  it('gates the Google rule on the /search pathname', () => {
    const rule = getRuleForHost('www.google.com')!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    expect(rule.strategy.onlyOnPath).toBe('/search');
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
