import { describe, expect, it } from 'vitest';
import { encodedValue, getRuleForHost, isGoogleHost, isYouTubeHost, rules } from './index';

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

  it('matches google.com.ua (a ccTLD that is not a .com suffix)', () => {
    // Covered by the isGoogleHost predicate, not a per-ccTLD entry.
    const rule = getRuleForHost('www.google.com.ua');
    expect(rule).toBeDefined();
    expect(rule!.strategy.type).toBe('searchParams');
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

// A representative sample of Google ccTLDs. The rule now matches *all* google.*
// via the isGoogleHost predicate, so `google.es` (never enumerated) is included
// to prove an unlisted ccTLD gets the same strategy as the well-known ones.
const GOOGLE_DOMAINS = [
  'google.com',
  'google.com.ua',
  'google.de',
  'google.fr',
  'google.co.uk',
  'google.pl',
  'google.com.au',
  'google.es',
] as const;

describe('search-engine rules — localized Google ccTLDs', () => {
  // A UA-priority user abroad on google.de or google.fr typing a Cyrillic
  // query gets the same Russian-result-bias problem we already fixed on
  // google.com — the single predicate rule covers every ccTLD.
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

  it.each(GOOGLE_DOMAINS)('sets joinPreferences=true on lr for %s', (domain) => {
    // `lr` is the result-language filter — joining the user's whole
    // preference list (`lang_uk|lang_en`) means an English speaker with
    // Ukrainian as their #1 doesn't lose every English result.
    const rule = getRuleForHost(`www.${domain}`)!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    const lr = rule.strategy.params.find((p) => p.name === 'lr')!;
    expect(lr.joinPreferences).toBe(true);
  });

  it.each(GOOGLE_DOMAINS)('does NOT set joinPreferences on hl for %s', (domain) => {
    // `hl` is the interface language — a "pick one" knob. Joining would
    // produce an invalid value.
    const rule = getRuleForHost(`www.${domain}`)!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    const hl = rule.strategy.params.find((p) => p.name === 'hl')!;
    expect(hl.joinPreferences).toBeFalsy();
  });

  it.each(GOOGLE_DOMAINS)('strips the `sei` session-bias token for %s', (domain) => {
    // `sei` is Google's opaque session-event token; carrying it forward
    // can override `hl`/`lr` with prior-session locale bias.
    const rule = getRuleForHost(`www.${domain}`)!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    expect(rule.strategy.stripParams).toEqual(['sei']);
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

describe('getRuleForHost — Google ccTLDs resolve to one predicate rule', () => {
  // Previously google.com and google.co.uk were separate enumerated rules; now
  // a single `matchHost: isGoogleHost` rule covers every ccTLD, so different
  // Google hosts resolve to the *same* rule object. The sort-by-`match`-length
  // tie-break in getRuleForHost still lets a future, more specific suffix rule
  // (a longer `match`) win over this broad predicate.
  it('returns the same rule object for google.com and google.co.uk', () => {
    const comRule = getRuleForHost('www.google.com');
    const ukRule = getRuleForHost('www.google.co.uk');
    expect(comRule).toBeDefined();
    expect(ukRule).toBe(comRule);
    expect(comRule!.match).toBe('google');
  });
});

describe('getRuleForHost — Google predicate coverage', () => {
  it.each(['google.es', 'google.co.jp', 'google.com.br', 'news.google.de'])(
    'matches an unlisted Google ccTLD/subdomain (%s)',
    (host) => {
      const rule = getRuleForHost(host);
      expect(rule).toBeDefined();
      expect(rule!.strategy.type).toBe('searchParams');
    },
  );

  it.each(['notgoogle.com', 'google.com.evil.com', 'mygoogle.org'])(
    'does not match a non-Google lookalike (%s)',
    (host) => {
      expect(getRuleForHost(host)).toBeUndefined();
    },
  );
});

describe('isGoogleHost', () => {
  it.each([
    'google.com',
    'google.com.ua',
    'google.co.uk',
    'www.google.de',
    'news.google.co.jp',
    'google.es',
  ])('accepts %s', (host) => {
    expect(isGoogleHost(host)).toBe(true);
  });

  it.each([
    'notgoogle.com',
    'google.com.evil.com',
    'youtube.com',
    'example.com',
    'mygoogle.org',
    'google',
  ])('rejects %s', (host) => {
    expect(isGoogleHost(host)).toBe(false);
  });
});

describe('isYouTubeHost', () => {
  it.each(['youtube.com', 'www.youtube.com', 'm.youtube.com'])('accepts %s', (host) => {
    expect(isYouTubeHost(host)).toBe(true);
  });

  it.each(['example.com', 'google.com', 'fake-youtube.com'])('rejects %s', (host) => {
    expect(isYouTubeHost(host)).toBe(false);
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
