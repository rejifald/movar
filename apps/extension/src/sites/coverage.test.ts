/**
 * Registry / host-predicate coverage cross-check (dead-rule guard).
 *
 * `registry.test.ts` asserts *per-rule behaviour*; `@movar/host-match`'s own
 * tests spot-check the predicates. Neither asserts that every shipped rule and
 * every host predicate is actually *exercised by a representative host* — so a
 * rule could go dead (its `match`/`matchHost` reachable by no host we test) or
 * a predicate could quietly stop being covered when a rule changes.
 *
 * This test pins coverage from the host side:
 *   1. Dead-rule guard — every rule in `registry.ts` `rules` is selected by
 *      `getRuleForHost` for ≥1 host in the in-repo fixture set; no rule is
 *      reachable by zero hosts.
 *   2. Predicate guard — each `@movar/host-match` predicate (`isGoogleHost`,
 *      `isYouTubeHost`) is exercised both ways (≥1 host true, ≥1 host false).
 *   3. Negative guard — the designated "clean" hosts resolve to no rule, so the
 *      fixture set proves the matcher also *rejects* unrelated hosts.
 *
 * Host source: a small in-repo list mirroring the offline HTML fixtures
 * (`apps/e2e/src/fixtures/html/`) and the live e2e site `hostname`s
 * (`apps/e2e/src/live/sites/*.ts`). The live suite is excluded from `pnpm test`,
 * so this list — not the live runner — is what keeps coverage honest offline.
 *
 * Manifest parity is intentionally N/A: the manifest grants `<all_urls>`
 * globally — required on Safari/the e2e build, requested at runtime on
 * Chrome/Firefox (see wxt.config.ts) — with no per-host `host_permissions`,
 * so any DNR host condition is always within the granted scope. The
 * Accept-Language correction stays a GLOBAL dynamic DNR rule (no host
 * condition); the Google /search redirect rule IS host-conditioned
 * (`requestDomains`), so it gets a real parity check below: its domain list
 * must agree with the same `isGoogleHost` predicate that selects the
 * registry's Google rule, or the network layer and the content-script layer
 * would cover different hosts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { GOOGLE_REQUEST_DOMAINS, isGoogleHost, isYouTubeHost } from '@movar/host-match';
import { defaultSettings } from '@movar/settings';
import { getRuleForHost, rules } from './registry';
import { buildGoogleSearchRedirectRule, syncAcceptLanguageRule } from '../lib/dnr';

const EXTENSION_SRC = path.resolve(__dirname, '..');

/** Representative hosts that SHOULD match a shipped rule — one or more per rule,
 *  mirroring the offline fixtures + live e2e `hostname`s. Keep at least one host
 *  per rule so the dead-rule guard below cannot silently lose coverage. */
const COVERED_HOSTS: readonly string[] = [
  // electricaRule (match: 'electrica-shop.com.ua')
  'electrica-shop.com.ua',
  'www.electrica-shop.com.ua',
  // googleRule (matchHost: isGoogleHost) — multiple ccTLDs + subdomains.
  'google.com',
  'www.google.com',
  'google.com.ua',
  'news.google.co.uk',
  // bingRule (match: 'bing.com')
  'www.bing.com',
  // duckduckgoRule (match: 'duckduckgo.com')
  'duckduckgo.com',
  // youtubeRule (matchHost: isYouTubeHost)
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
];

/** Hosts that must resolve to NO rule — unrelated sites + near-miss spoofs that
 *  the matcher/predicates are designed to reject. */
const CLEAN_HOSTS: readonly string[] = [
  'example.com',
  'fake-electrica-shop.com.ua',
  'notgoogle.com',
  'google.com.evil.com',
];

describe('registry rule coverage (dead-rule guard)', () => {
  it('every shipped rule is selected by at least one covered host', () => {
    const matchedRuleLabels = new Set<string>();
    for (const host of COVERED_HOSTS) {
      const rule = getRuleForHost(host);
      if (rule !== undefined) matchedRuleLabels.add(rule.match);
    }
    const deadRules = rules.map((r) => r.match).filter((label) => !matchedRuleLabels.has(label));
    expect(deadRules).toEqual([]);
  });

  it('every covered host resolves to some rule (no rule-less fixture)', () => {
    const unmatched = COVERED_HOSTS.filter((host) => getRuleForHost(host) === undefined);
    expect(unmatched).toEqual([]);
  });

  it('clean hosts resolve to no rule (matcher rejects unrelated hosts)', () => {
    const wronglyMatched = CLEAN_HOSTS.filter((host) => getRuleForHost(host) !== undefined);
    expect(wronglyMatched).toEqual([]);
  });
});

describe('host-match predicate coverage', () => {
  it('isGoogleHost is exercised both ways by the fixture set', () => {
    expect(COVERED_HOSTS.some((h) => isGoogleHost(h))).toBe(true);
    expect([...COVERED_HOSTS, ...CLEAN_HOSTS].some((h) => !isGoogleHost(h))).toBe(true);
  });

  it('isYouTubeHost is exercised both ways by the fixture set', () => {
    expect(COVERED_HOSTS.some((h) => isYouTubeHost(h))).toBe(true);
    expect([...COVERED_HOSTS, ...CLEAN_HOSTS].some((h) => !isYouTubeHost(h))).toBe(true);
  });

  it('predicate-backed rules are the ones the predicates select', () => {
    // The two predicate-driven rules must be reachable exactly via their
    // predicate hosts — ties this coverage test to the registry wiring.
    const googleHosts = COVERED_HOSTS.filter((h) => isGoogleHost(h));
    const ytHosts = COVERED_HOSTS.filter((h) => isYouTubeHost(h));
    expect(googleHosts.every((h) => getRuleForHost(h)?.match === 'google')).toBe(true);
    expect(ytHosts.every((h) => getRuleForHost(h)?.match === 'youtube.com')).toBe(true);
  });
});

/** The Google DNR rule's host condition. Built from GOOGLE_REQUEST_DOMAINS;
 *  the parity tests assert against the rule itself so a builder that stopped
 *  consuming the list would fail here, not just in @movar/host-match's own
 *  tests. */
function ruleDomains(): readonly string[] {
  return buildGoogleSearchRedirectRule(['uk']).condition.requestDomains ?? [];
}

describe('Google DNR redirect rule / registry host parity', () => {
  it('the rule condition carries exactly the shared @movar/host-match domain list', () => {
    expect(ruleDomains()).toEqual(GOOGLE_REQUEST_DOMAINS);
  });

  it('every requestDomains entry is a host the registry Google rule matches', () => {
    const strays = ruleDomains().filter(
      (domain) => !isGoogleHost(domain) || getRuleForHost(domain)?.match !== 'google',
    );
    expect(strays).toEqual([]);
  });

  it('every covered Google fixture host is inside the rule condition (DNR subdomain semantics)', () => {
    const domains = ruleDomains();
    const coveredByCondition = (host: string): boolean =>
      domains.some((d) => host === d || host.endsWith(`.${d}`));
    const missed = COVERED_HOSTS.filter(isGoogleHost).filter((h) => !coveredByCondition(h));
    expect(missed).toEqual([]);
    // And the clean hosts stay outside it — the condition must not out-reach
    // the predicate the content-script layer gates on.
    const leaked = CLEAN_HOSTS.filter(coveredByCondition);
    expect(leaked).toEqual([]);
  });
});

describe('manifest parity is N/A (broad grant + global DNR rule)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('host access stays global <all_urls> — required for Safari/e2e, optional elsewhere (no per-host grant to cross-check)', () => {
    // Read the manifest declaration from source rather than importing the
    // WXT config (owned elsewhere); we only assert the broad-grant invariant.
    const wxtConfig = readFileSync(path.resolve(EXTENSION_SRC, '../wxt.config.ts'), 'utf8');
    // Chrome/Firefox request it at runtime instead of holding it unconditionally.
    expect(wxtConfig).toMatch(/optional_host_permissions:\s*\['<all_urls>'\]/);
    // Safari (and the MOVAR_E2E test build) still hold it as a required grant.
    // Negative lookbehind excludes the `optional_host_permissions` match above —
    // that identifier textually ends in `host_permissions`, so an unanchored
    // regex would match both branches and silently miss a dropped required case.
    expect(wxtConfig).toMatch(/(?<!optional_)host_permissions:\s*\['<all_urls>'\]/);
  });

  it('the Accept-Language DNR rule is global (no per-host condition)', async () => {
    const update = vi
      .spyOn(browser.declarativeNetRequest, 'updateDynamicRules')
      .mockResolvedValue();
    await syncAcceptLanguageRule(defaultSettings, true);

    const addedRule = update.mock.calls
      .flatMap((call) => (call[0] as { addRules?: { condition?: object }[] }).addRules ?? [])
      .at(0);
    expect(addedRule).toBeDefined();
    const condition = (addedRule?.condition ?? {}) as Record<string, unknown>;
    // A global rule keys only on resourceTypes (+ optional allowlist exclusion);
    // it must carry no host-targeting key. If one is ever added, this fails and
    // a real per-host manifest/registry parity check should replace this stanza.
    for (const hostKey of ['urlFilter', 'requestDomains', 'initiatorDomains', 'regexFilter']) {
      expect(condition[hostKey]).toBeUndefined();
    }
    expect(condition['resourceTypes']).toEqual(['main_frame', 'sub_frame']);
  });
});
