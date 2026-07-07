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
});
