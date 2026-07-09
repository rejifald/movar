import { describe, expect, it } from 'vitest';
import { encodedValue } from './types';
import { getRuleForHost, resolveModelChunk, rules } from './registry';

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
  it.each(GOOGLE_DOMAINS)('registers %s and prefixes lr with lang_', (domain) => {
    const rule = getRuleForHost(`www.${domain}`);
    expect(rule).toBeDefined();
    const s = rule!.strategy;
    if (s.type !== 'searchParams') throw new Error('expected searchParams strategy');
    const lrParam = s.params.find((p) => p.name === 'lr');
    expect(lrParam).toBeDefined();
    // lr prepends `lang_` to every preferred code (lang_uk|lang_en) via `prefix`,
    // so the value transform stays out of a per-language values map.
    expect(lrParam!.prefix).toBe('lang_');
    expect(lrParam!.values).toBeUndefined();
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

  it.each(GOOGLE_DOMAINS)('strips the `sei`/`gs_lcrp` session tokens for %s', (domain) => {
    // `sei` is Google's opaque session-event token; carrying it forward
    // can override `hl`/`lr` with prior-session locale bias. `gs_lcrp` is
    // Chrome's opaque omnibox-session context blob, generated before this
    // rewrite runs — left in place it can pin serving to a candidate set
    // computed under the pre-rewrite context, zeroing out an otherwise
    // healthy query once `lr` filters it.
    const rule = getRuleForHost(`www.${domain}`)!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    expect(rule.strategy.stripParams).toEqual(['sei', 'gs_lcrp']);
  });

  it.each(GOOGLE_DOMAINS)(
    'scrubs the gs_* namespace and legacy omnibox tokens for %s',
    (domain) => {
      // Scrub tier (non-navigating): the `gs_*` suggest/omnibox session-state
      // namespace `gs_lcrp` came from, plus `aqs` (its predecessor on older
      // Chrome builds) and `rlz` (branded-install cohort token). These ride a
      // rewrite that is already happening; they must never move to stripParams,
      // which would force a reload on every SERP-box refinement (those URLs
      // carry `gs_lp`).
      const rule = getRuleForHost(`www.${domain}`)!;
      if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
      expect(rule.strategy.scrubPrefixes).toEqual(['gs_']);
      expect(rule.strategy.scrubParams).toEqual(['aqs', 'rlz']);
    },
  );
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
  // A single `matchHost: isGoogleHost` rule covers every ccTLD, so different
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

  // Spoof hosts (`google` label trailed by a non-Google public suffix) must not
  // engage either Google runtime surface: the searchParams redirect rule
  // (getRuleForHost) nor the lazy-loaded SERP extractor (resolveModelChunk).
  it.each(['google.evil.com', 'google.attacker.io', 'sub.google.evil.com', 'a.google.b'])(
    'does not engage the redirect or content path for spoof host (%s)',
    (host) => {
      expect(getRuleForHost(host)).toBeUndefined();
      expect(resolveModelChunk(host)).toBeNull();
    },
  );

  // Every representative real Google ccTLD must still resolve to the
  // searchParams rule — no genuine ccTLD regressed by the tightened predicate.
  it.each(GOOGLE_DOMAINS)('still resolves the searchParams rule for %s', (domain) => {
    const rule = getRuleForHost(domain);
    expect(rule).toBeDefined();
    expect(rule!.strategy.type).toBe('searchParams');
  });
});

describe('search-engine rules — Google path-scoped behavior', () => {
  // /maps and /images on google.com share the host with /search but have
  // different param semantics. The behavioural assertion — that /maps URLs are
  // not rewritten — lives in strategy.test.ts; here we pin the rule's path gate
  // to '/search' so a config change produces a clear failure pointing here.
  it('gates the Google rule on the /search pathname', () => {
    const rule = getRuleForHost('www.google.com')!;
    if (rule.strategy.type !== 'searchParams') throw new Error('expected searchParams');
    expect(rule.strategy.onlyOnPath).toBe('/search');
  });
});

describe('resolveModelChunk', () => {
  it('maps Google hosts (any ccTLD) to the google model chunk', () => {
    expect(resolveModelChunk('www.google.com')).toBe('models/google.js');
    expect(resolveModelChunk('google.com.ua')).toBe('models/google.js');
  });

  it('maps YouTube hosts to the youtube model chunk', () => {
    expect(resolveModelChunk('www.youtube.com')).toBe('models/youtube.js');
    expect(resolveModelChunk('m.youtube.com')).toBe('models/youtube.js');
  });

  it('returns null for rule-only sites and unknown hosts', () => {
    expect(resolveModelChunk('www.bing.com')).toBeNull();
    expect(resolveModelChunk('duckduckgo.com')).toBeNull();
    expect(resolveModelChunk('example.com')).toBeNull();
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
