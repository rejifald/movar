/**
 * Integration test: pin the end-to-end behaviour of the google.com rule's
 * `emptyResultsRetry` composed with the retry runtime (`empty-results-retry`),
 * the REAL sessionStorage-backed loop guard, and the enforce-mode switch
 * ladder. The retry module and the ladder each have their own unit tests; this
 * file verifies the *combination* on the production hot path — the residual
 * empty-SERP case URL hygiene can't reach (docs/google-search-url-params.md,
 * finding #1).
 *
 * The scenario (observed live, 2026-07-07/08): the omnibox entry request is
 * served before the rewrite runs, its `gs_lcrp` token pins Google's session
 * to a pre-rewrite candidate set, and the fully cleaned SERP URL (`hl`/`lr`
 * correct, no strippable token) still renders zero organic results. The
 * runtime must: retry that exact query once without `lr` (keeping `hl`), keep
 * the enforce rewrite from immediately re-adding `lr` on the retried page,
 * and never retry the same URL twice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuleForHost } from '../sites/registry';
import { applyStrategy } from './strategy';
import { tryStrategySwitch } from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';
import { clearAttempt, hasAttemptedNavTo, markAttempt, recentlyAttemptedHere } from './loop-guard';
import {
  RETRY_SETTLE_DELAY_MS,
  maybeScheduleEmptyResultsRetry,
  resetEmptyResultsRetryState,
} from './empty-results-retry';
import type { EmptyResultsRetryDeps } from './empty-results-retry';

/** The stuck URL: rewrite already applied (hl/lr at target, no strippable
 *  token left) yet the SERP below renders empty. */
const PINNED_URL =
  'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5+%D0%BD%D0%B0%D0%BF%D1%80%D1%83%D0%B3%D0%B8&hl=uk&lr=lang_uk%7Clang_en';

/** Zero-organic SERP as Google renders it: the results area exists (with the
 *  localized "no results" copy — which detection must NOT parse), but holds no
 *  `<a><h3>` organic title links. */
const EMPTY_SERP_BODY = `
  <div id="search">
    <div id="rso"></div>
    <p>Приблизна кількість результатів: 0</p>
  </div>`;

/** Healthy SERP: organic cards are `<a href><h3>` title links inside #search
 *  (the same shape @movar/page-content's extractor keys on). */
const HEALTHY_SERP_BODY = `
  <div id="search"><div id="rso">
    <div data-hveid="1"><a href="https://axiomplus.com.ua/"><h3>Реле напруги — купити</h3></a></div>
    <div data-hveid="2"><a href="https://rozetka.com.ua/"><h3>Реле напруги ZUBR</h3></a></div>
  </div></div>`;

/** Mutable stand-in for the page `location`, shared by the ladder deps and the
 *  retry deps exactly like the content script shares its real `location`. */
function makeLocation(href: string): { href: string; replace(url: string): void; reload(): void } {
  return {
    href,
    replace(url: string) {
      this.href = url;
    },
    reload: vi.fn(),
  };
}

type TestLocation = ReturnType<typeof makeLocation>;

/** Ladder deps wired to the REAL loop guard (jsdom sessionStorage) and the
 *  REAL applyStrategy, with only the URL surface redirected at `loc`. */
function makeSwitchDeps(
  loc: TestLocation,
): LanguageSwitchDeps & { record: ReturnType<typeof vi.fn> } {
  return {
    recentlyAttemptedHere: () => recentlyAttemptedHere(loc.href),
    hasAttemptedNavTo,
    markAttempt: () => {
      markAttempt(loc.href);
    },
    record: vi.fn(async () => {}),
    applyStrategy,
    loopGuardCtx: {
      getUrl: () => new URL(loc.href),
      navigate: (url: string) => {
        loc.replace(url);
      },
      isAttemptedUrl: hasAttemptedNavTo,
    },
    location: loc,
    setSimulatedClick: () => {},
  };
}

/** Retry deps mirroring the content-runtime wiring: real DOM counts, real
 *  loop guard, document already settled (jsdom fixture pages don't load). */
function makeRetryDeps(
  loc: TestLocation,
): EmptyResultsRetryDeps & { record: ReturnType<typeof vi.fn> } {
  return {
    location: loc,
    countMatches: (selector) => document.querySelectorAll(selector).length,
    whenSettled: (fn) => {
      fn();
    },
    recentlyAttemptedHere,
    markAttempt,
    record: vi.fn(async () => {}),
    isActive: () => true,
    // The DNR redirect rule is suspended (via the background) before the retry
    // navigates, so it can't re-add the dropped filter param; a no-op here.
    suspendRedirect: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearAttempt();
  resetEmptyResultsRetryState();
  document.body.innerHTML = EMPTY_SERP_BODY;
});

afterEach(() => {
  vi.useRealTimers();
  clearAttempt();
  document.body.innerHTML = '';
});

describe('google.com — emptyResultsRetry + loop guard + enforce ladder integration', () => {
  it('declares the empty-results retry on the google rule', () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule?.emptyResultsRetry).toEqual({
      dropParam: 'lr',
      containerSelector: '#search',
      resultsSelector: '#search a h3',
    });
  });

  it('retries the pinned empty SERP once without lr, and the enforce rewrite does not undo it', async () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule?.emptyResultsRetry).toBeDefined();
    if (!rule?.emptyResultsRetry) return;
    const loc = makeLocation(PINNED_URL);

    // 1. The tick's switch ladder no-ops: the URL is already at target — this
    //    is precisely the stuck state the strip/scrub tiers cannot recover.
    const switchDeps = makeSwitchDeps(loc);
    expect(await tryStrategySwitch(switchDeps, rule, 'uk', ['uk', 'en'])).toBe(false);
    expect(loc.href).toBe(PINNED_URL);

    // 2. The same tick arms the retry; after settle + delay it navigates to
    //    the identical query without `lr` (hl and q intact).
    const retryDeps = makeRetryDeps(loc);
    maybeScheduleEmptyResultsRetry(rule.emptyResultsRetry, 'uk', retryDeps);
    await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);

    const retried = new URL(loc.href);
    expect(retried.searchParams.has('lr')).toBe(false);
    expect(retried.searchParams.get('hl')).toBe('uk');
    expect(retried.searchParams.get('q')).toBe('реле напруги');
    expect(retryDeps.record).toHaveBeenCalledWith('search-retry', 'uk', 'uk');

    // 3. The fresh tick on the retried page runs the enforce ladder again.
    //    Without the pre-marked target URL this would re-add `lr` and bounce
    //    straight back to the empty SERP; the real loop guard must bail.
    const retriedHref = loc.href;
    expect(await tryStrategySwitch(makeSwitchDeps(loc), rule, 'uk', ['uk', 'en'])).toBe(false);
    expect(loc.href).toBe(retriedHref);

    // 4. And the retried page itself never re-arms: `lr` is gone, so even a
    //    legitimately-empty query stops here — the retry WAS the test.
    maybeScheduleEmptyResultsRetry(rule.emptyResultsRetry, 'uk', retryDeps);
    await vi.runAllTimersAsync();
    expect(loc.href).toBe(retriedHref);
  });

  it('does not retry the same URL twice within the guard TTL (back-button case)', async () => {
    const rule = getRuleForHost('www.google.com');
    if (!rule?.emptyResultsRetry) return;
    const loc = makeLocation(PINNED_URL);
    const retryDeps = makeRetryDeps(loc);

    maybeScheduleEmptyResultsRetry(rule.emptyResultsRetry, 'uk', retryDeps);
    await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);
    const retriedHref = loc.href;
    expect(retriedHref).not.toBe(PINNED_URL);

    // User navigates back to the pinned URL; the sessionStorage mark survives.
    loc.href = PINNED_URL;
    maybeScheduleEmptyResultsRetry(rule.emptyResultsRetry, 'uk', retryDeps);
    await vi.runAllTimersAsync();
    expect(loc.href).toBe(PINNED_URL);
    expect(retryDeps.record).toHaveBeenCalledTimes(1);
  });

  it('leaves a healthy SERP alone — organic titles are counted, not localized strings', async () => {
    const rule = getRuleForHost('www.google.com');
    if (!rule?.emptyResultsRetry) return;
    document.body.innerHTML = HEALTHY_SERP_BODY;
    const loc = makeLocation(PINNED_URL);
    const retryDeps = makeRetryDeps(loc);

    maybeScheduleEmptyResultsRetry(rule.emptyResultsRetry, 'uk', retryDeps);
    await vi.runAllTimersAsync();

    expect(loc.href).toBe(PINNED_URL);
    expect(retryDeps.record).not.toHaveBeenCalled();
  });
});
