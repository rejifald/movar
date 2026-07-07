/**
 * Integration test: pin the end-to-end behaviour of the google.com rule
 * (registered in `@movar/host-match`) composed with `applyStrategy`. The rule
 * and the strategy mechanics each have their own unit tests; this file
 * verifies the *combination* on the production hot path — /search with a
 * Ukrainian priority must end up with `hl=uk` and `lr=lang_uk`.
 *
 * Original bug (now fixed) — Google honoured Accept-Language for the
 * interface but used `lr=lang_<code>` to restrict result languages, so a
 * UA-first user got Russian SERP hits. The fix landed as a `searchParams`
 * rule on google.com gated to /search. This file ensures the rule + strategy
 * stay coupled correctly; a refactor to either side that breaks the
 * combination surfaces here.
 */
import { describe, expect, it } from 'vitest';
import { getRuleForHost } from '../sites/registry';
import { applyStrategy } from './strategy';
import { makeContext } from './strategy.test-utils';

describe('google.com — rule + strategy integration on /search', () => {
  it('has a site rule registered for www.google.com', () => {
    expect(getRuleForHost('www.google.com')).toBeDefined();
  });

  it('rewrites /search to add hl=uk and lr=lang_uk when priority is Ukrainian', () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    // Cyrillic query — the symptom case from real users.
    const initial = `https://www.google.com/search?q=${encodeURIComponent('яблуко')}`;
    const { ctx, navigate } = makeContext(initial);
    applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('lr')).toBe('lang_uk');
  });

  it('preserves the original q= when rewriting', () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const q = 'яблуко';
    const initial = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    const { ctx, navigate } = makeContext(initial);
    applyStrategy(rule.strategy, 'uk', ctx);

    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('q')).toBe(q);
  });

  it('does not navigate when hl and lr are already at the target values', () => {
    // Avoids burning a redirect per SERP load once the URL is already correct.
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const initial = 'https://www.google.com/search?q=apple&hl=uk&lr=lang_uk';
    const { ctx, navigate } = makeContext(initial);
    const out = applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('strips sei and gs_lcrp on rewrite (empty-SERP regression)', () => {
    // gs_lcrp is Chrome's omnibox-session context blob, generated before this
    // rewrite runs. Left in place, it pinned Google's serving to a candidate
    // set computed under the pre-rewrite language context — confirmed by live
    // testing to zero out an otherwise ~1M-result query ("Реле напруги") even
    // though hl/lr were set correctly. See the rule's stripParams comment.
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const q = 'реле напруги';
    const initial = `https://www.google.com/search?q=${encodeURIComponent(q)}&sei=stale123&gs_lcrp=EgZjaHJvbWUq`;
    const { ctx, navigate } = makeContext(initial);
    applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.has('sei')).toBe(false);
    expect(target.searchParams.has('gs_lcrp')).toBe(false);
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('lr')).toBe('lang_uk');
  });

  it('rewrites again to strip a lingering gs_lcrp even when hl/lr already match', () => {
    // The exact stuck state a real user hit: a prior rewrite set hl/lr
    // correctly but this rule didn't yet strip gs_lcrp, so the empty SERP
    // persisted across reloads (no-op sees hl/lr as already correct). Once
    // gs_lcrp is in stripParams, the same URL must no longer be a no-op.
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const q = 'реле напруги';
    const initial = `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=uk&lr=lang_uk&gs_lcrp=EgZjaHJvbWUq`;
    const { ctx, navigate } = makeContext(initial);
    const out = applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(out.appliedSteps).toBeGreaterThan(0);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.has('gs_lcrp')).toBe(false);
  });

  it('scrubs the gs_* family and legacy omnibox tokens on an entry rewrite', () => {
    // Omnibox/homepage entry URLs never carry `lr`, so the rewrite always
    // navigates — and sheds the whole `gs_*` suggest-session namespace plus
    // `aqs` (gs_lcrp's predecessor) and `rlz` (install-cohort token) on the
    // way. `oq` and `sourceid` are honest attribution and stay untouched.
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const initial =
      'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5&oq=rele&gs_lp=Abc&gs_ssp=Def&aqs=chrome.69i57&rlz=1C5CHFA&sourceid=chrome&ie=UTF-8';
    const { ctx, navigate } = makeContext(initial);
    applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    for (const gone of ['gs_lp', 'gs_ssp', 'aqs', 'rlz']) {
      expect(target.searchParams.has(gone), `${gone} should be scrubbed`).toBe(false);
    }
    expect(target.searchParams.get('oq')).toBe('rele');
    expect(target.searchParams.get('sourceid')).toBe('chrome');
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('lr')).toBe('lang_uk');
  });

  it('does not burn a reload just to scrub: refinement URL at target keeps gs_lp', () => {
    // A SERP search-box refinement preserves `hl`/`lr` (Google's form
    // carries them over — observed live) and adds a fresh `gs_lp` generated
    // under the already-corrected language context. Navigating here would
    // double-load every query refinement, so the scrub tier must stay
    // dormant when the URL is otherwise at target.
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const initial = 'https://www.google.com/search?q=apple&hl=uk&lr=lang_uk&gs_lp=Abc';
    const { ctx, navigate } = makeContext(initial);
    const out = applyStrategy(rule.strategy, 'uk', ctx);

    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('carries nothing across queries: back-to-back rewrites stay independent', () => {
    // The user searches query A (rewritten, token scrubbed), then query B.
    // The shared rule object must not remember anything from A: B's rewrite
    // derives from B's URL alone. (The runtime loop-guard that suppresses
    // re-entry is keyed on exact full URLs in per-tab sessionStorage, so a
    // changed query can never collide with a previous one either.)
    const rule = getRuleForHost('www.google.com');
    expect(rule).toBeDefined();
    if (!rule) return;

    const first = makeContext('https://www.google.com/search?q=persha&gs_lp=TokenA&oq=a');
    applyStrategy(rule.strategy, 'uk', first.ctx);
    expect(first.navigate).toHaveBeenCalledTimes(1);

    const second = makeContext('https://www.google.com/search?q=druha&oq=b');
    applyStrategy(rule.strategy, 'uk', second.ctx);
    expect(second.navigate).toHaveBeenCalledTimes(1);
    const target = new URL(second.navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('q')).toBe('druha');
    expect(target.searchParams.get('oq')).toBe('b');
    expect(target.toString()).not.toContain('TokenA');
  });
});
