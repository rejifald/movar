import { describe, expect, it } from 'vitest';
import type { SiteRule } from './types';
import { getRuleForHost, rules } from './registry';

/**
 * Generic registry invariants — the safety net for community site-rule
 * contributions (see ./CONTRIBUTING-A-SITE.md). Unlike registry.test.ts, which
 * spot-checks named engines, this file iterates the *whole* `rules` array and
 * asserts the structural guarantees every rule must keep, so a PR that adds a
 * rule with a typo'd `match`, an overlapping suffix, or no fixture fails here
 * rather than shipping a bad redirect onto `<all_urls>`.
 *
 * The per-rule "fixture" is the lightweight kind the issue settled on: a
 * required sample-host entry below, not an HTML capture. It is what makes the
 * suffix-resolution and no-overlap checks executable — every rule MUST have at
 * least one sample host here, and CI fails if a new rule is added without one.
 */

/**
 * One real, representative host per rule, keyed by the rule's `match` label.
 * Adding a rule to registry.ts without adding an entry here fails the
 * "every rule has a fixture" test below.
 *
 * - For suffix rules the sample must be a host the rule's `match` is a real
 *   dot-anchored suffix of (or exactly equals).
 * - For predicate rules (`matchHost`) the sample must be a host the predicate
 *   accepts; `match` is only a label there.
 */
const SAMPLE_HOSTS: Record<string, string> = {
  'electrica-shop.com.ua': 'www.electrica-shop.com.ua',
  google: 'www.google.com',
  'bing.com': 'www.bing.com',
  'duckduckgo.com': 'duckduckgo.com',
  'youtube.com': 'www.youtube.com',
};

/** Suffix rules: a `match` is a dot-anchored suffix of `host` (or equals it). */
function isSuffixOf(match: string, host: string): boolean {
  return host === match || host.endsWith(`.${match}`);
}

describe('registry invariants — every rule', () => {
  it('has a registered sample host ("fixture")', () => {
    // Guards against a rule landing in registry.ts with no test coverage at
    // all. The sample map below is what the rest of these checks iterate.
    const missing = rules.map((r) => r.match).filter((m) => !(m in SAMPLE_HOSTS));
    expect(missing, `rules missing a SAMPLE_HOSTS entry: ${missing.join(', ')}`).toEqual([]);
  });

  it.each(rules.map((r): [string, SiteRule] => [r.match, r]))(
    'resolves for its sample host (%s)',
    (match, rule) => {
      const sample = SAMPLE_HOSTS[match];
      expect(sample, `no sample host registered for "${match}"`).toBeDefined();
      // Predicate rules resolve via matchHost; suffix rules via getRuleForHost.
      // Either way the registry must return *this* rule for its own sample.
      expect(getRuleForHost(sample!)).toBe(rule);
    },
  );

  it.each(rules.filter((r) => !r.matchHost).map((r): [string, SiteRule] => [r.match, r]))(
    'rejects a faked-prefix lookalike for suffix rule (%s)',
    (match) => {
      // Generalizes the single fake-prefix negative in registry.test.ts: a
      // `match` must anchor on a dot boundary, so `fake<match>` (an infix, not
      // a real subdomain) must NOT resolve. Only suffix rules are checked —
      // predicate rules define their own anti-spoofing (e.g. isGoogleHost).
      expect(getRuleForHost(`fake${match}`)).toBeUndefined();
    },
  );

  it('has a sample host that resolves to exactly one (the intended) rule', () => {
    // No host in the per-rule sample set resolves ambiguously: each sample
    // must come back as its own rule, never a different one shadowing it.
    for (const rule of rules) {
      const sample = SAMPLE_HOSTS[rule.match];
      expect(
        getRuleForHost(sample!),
        `sample "${sample}" did not resolve to rule "${rule.match}"`,
      ).toBe(rule);
    }
  });
});

describe('registry invariants — no overlaps between suffix rules', () => {
  // Two suffix rules where one `match` is a dot-anchored suffix of the other
  // would make resolution order-dependent and surprising. Predicate rules are
  // exempt from the suffix-overlap rule (their `match` is only a label), but
  // they must NOT also be covered by a competing suffix rule — that is checked
  // separately below.
  const suffixRules = rules.filter((r) => !r.matchHost);

  it('has no suffix rule whose match is a suffix of another rule', () => {
    for (const a of suffixRules) {
      for (const b of suffixRules) {
        if (a === b) continue;
        expect(
          isSuffixOf(a.match, b.match),
          `rule "${b.match}" overlaps rule "${a.match}" (one is a dot-anchored suffix of the other)`,
        ).toBe(false);
      }
    }
  });

  it('has no suffix rule that also matches a predicate rule’s sample host', () => {
    // A predicate rule (e.g. isGoogleHost) must own its hosts outright. If a
    // suffix rule also resolved one of the predicate's sample hosts, the
    // sort-by-`match`-length tie-break could hand the host to the wrong rule.
    const predicateRules = rules.filter((r) => r.matchHost);
    for (const predicateRule of predicateRules) {
      const sample = SAMPLE_HOSTS[predicateRule.match];
      expect(sample, `no sample host for predicate rule "${predicateRule.match}"`).toBeDefined();
      const suffixHit = suffixRules.find((r) => isSuffixOf(r.match, sample!));
      expect(
        suffixHit?.match,
        `predicate rule "${predicateRule.match}" sample "${sample}" also matches suffix rule "${suffixHit?.match}"`,
      ).toBeUndefined();
    }
  });
});

describe('registry invariants — Russian search engines stay unregistered', () => {
  // Retained from registry.test.ts so the guard survives if that file is ever
  // trimmed: Movar must never register a redirect rule for a Russian engine.
  it.each(['yandex.ru', 'ya.ru', 'mail.ru', 'rambler.ru'])('does not register %s', (host) => {
    expect(getRuleForHost(host)).toBeUndefined();
  });
});
