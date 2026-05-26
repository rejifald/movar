/**
 * Regression: searching on Google with Ukrainian as the top priority still
 * returns Russian-language results in the SERP. Movar's global Accept-Language
 * rewrite isn't enough — Google honors that for the *interface* but uses
 * `lr=lang_<code>` to restrict the *result* languages. There is also no
 * site-specific rule for google.com yet, so nothing rewrites the URL.
 *
 * Reproducer flow:
 *   priority = ['uk', 'en']
 *   visit    https://www.google.com/search?q=яблуко
 *   observe  Russian-language hits in the results
 *
 * Expected fix: a google.com rule that, on /search URLs, sets
 *   hl=<target>           (interface language)
 *   lr=lang_<target>      (result-language restriction)
 * while preserving the original `q=` and not looping on already-correct URLs.
 *
 * These tests describe the desired post-fix behavior and currently fail.
 */
import { describe, expect, it, vi } from 'vitest';
import { getRuleForHost } from '@movar/rules';
import { applyStrategy, type StrategyContext } from './strategy';

function makeContext(initialUrl: string): {
  ctx: StrategyContext;
  navigate: ReturnType<typeof vi.fn>;
} {
  let url = initialUrl;
  const navigate = vi.fn((next: string) => {
    url = next;
  });
  const ctx: StrategyContext = {
    getUrl: () => new URL(url),
    navigate,
    reload: vi.fn(),
    getCookie: () => '',
    setCookie: vi.fn(),
    getStorage: () => null,
    setStorage: vi.fn(),
    clickSelector: vi.fn(() => true),
    getHreflangLinks: () => [],
  };
  return { ctx, navigate };
}

describe('google.com mixed-language SERP regression', () => {
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
