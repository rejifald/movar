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
import { getRuleForHost } from '@movar/host-match';
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
});
