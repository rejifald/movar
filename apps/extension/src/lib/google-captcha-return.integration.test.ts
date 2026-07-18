/**
 * Integration test for #251 — the Google captcha (/sorry) detour.
 *
 * When Google interrupts a SERP with an "unusual traffic" interstitial
 * (`/sorry/index?continue=…`) and the user solves it, they are returned to the
 * pre-captcha `/search` URL — the exact URL the loop guard already marked as
 * redirected-from when the switch first fired. That makes `recentlyAttemptedHere`
 * true, so the enforce-mode switch is suppressed as a bounce and the SERP stays
 * in the blocked language. The fix models the interstitial on the site rule
 * (`googleRule.interstitialMatch = isGoogleSorryUrl`); the content runtime drops
 * the guard when the interstitial is the current page or the referrer of the
 * returned page, so the switch re-applies.
 *
 * This composes the REAL sessionStorage-backed loop guard, the REAL
 * applyStrategy, and the enforce ladder (`tryStrategySwitch`) with the real
 * google rule — only the URL surface (location) is a test double, exactly as
 * the content script shares its real `location`. The runtime's guard-drop clause
 * is `rule.interstitialMatch(location.href|referrer) ⇒ clearAttempt()`; the
 * tests exercise both halves (the predicate and the resulting ladder behaviour).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRuleForHost } from '../sites/registry';
import { isGoogleSorryUrl } from '../sites/google';
import { applyStrategy } from './strategy';
import { tryStrategySwitch } from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';
import { clearAttempt, hasAttemptedNavTo, markAttempt, recentlyAttemptedHere } from './loop-guard';

/** Pre-rewrite SERP: Russian results, no hl/lr yet — the URL the guard marks
 *  redirected-from, and the URL Google's `continue` returns the user to. */
const SERP_URL = 'https://www.google.com/search?q=%D1%80%D0%B5%D0%BB%D0%B5&udm=14';
/** The captcha interstitial that returned the user to SERP_URL. */
const SORRY_URL = `https://www.google.com/sorry/index?continue=${encodeURIComponent(SERP_URL)}`;
const PRIORITY = ['uk', 'en'] as const;

/** Mutable stand-in for the page `location`, shared by the ladder deps exactly
 *  like the content script shares its real `location`. */
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

/** Ladder deps wired to the REAL loop guard (jsdom sessionStorage) and the REAL
 *  applyStrategy, with only the URL surface redirected at `loc`. */
function makeSwitchDeps(loc: TestLocation): LanguageSwitchDeps {
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

/** The content-runtime clause under test: drop the guard when the site's
 *  interstitial is the current page or the referrer of the returned page. */
function applyRuntimeCaptchaGuardDrop(href: string, referrer: string): void {
  const rule = getRuleForHost(new URL(href).hostname);
  if (rule?.interstitialMatch?.(href) === true || rule?.interstitialMatch?.(referrer) === true) {
    clearAttempt();
  }
}

beforeEach(() => {
  clearAttempt();
});
afterEach(() => {
  clearAttempt();
  vi.restoreAllMocks();
});

describe('isGoogleSorryUrl', () => {
  it('matches the /sorry interstitial across google ccTLDs', () => {
    expect(isGoogleSorryUrl(SORRY_URL)).toBe(true);
    expect(isGoogleSorryUrl('https://www.google.com/sorry')).toBe(true);
    expect(isGoogleSorryUrl('https://www.google.de/sorry/index?continue=x')).toBe(true);
    expect(isGoogleSorryUrl('https://www.google.com.ua/sorry/index')).toBe(true);
  });

  it('rejects ordinary SERP URLs, non-google hosts, and an absent referrer', () => {
    expect(isGoogleSorryUrl(SERP_URL)).toBe(false);
    expect(isGoogleSorryUrl('https://www.google.com/search?q=x')).toBe(false);
    // Not a /sorry path — a query param merely containing the word must not match.
    expect(isGoogleSorryUrl('https://www.google.com/search?q=sorry')).toBe(false);
    expect(isGoogleSorryUrl('https://sorry.example.com/sorry')).toBe(false);
    expect(isGoogleSorryUrl('')).toBe(false); // empty document.referrer
    expect(isGoogleSorryUrl('not a url')).toBe(false);
  });

  it('is wired onto the enforce-mode google rule', () => {
    const rule = getRuleForHost('www.google.com');
    expect(rule?.enforce).toBe(true);
    expect(rule?.interstitialMatch?.(SORRY_URL)).toBe(true);
    expect(rule?.interstitialMatch?.(SERP_URL)).toBe(false);
  });
});

describe('enforce switch after a /sorry captcha return (#251)', () => {
  it('re-applies hl/lr on the returned SERP once the captcha detour drops the guard', async () => {
    // The switch fired once before the captcha: the guard marked the SERP URL.
    markAttempt(SERP_URL);
    const loc = makeLocation(SERP_URL);
    const deps = makeSwitchDeps(loc);
    const rule = getRuleForHost('www.google.com')!;

    // Precondition — the stale guard suppresses the re-switch (the #251 bug).
    expect(await tryStrategySwitch(deps, rule, 'ru', PRIORITY)).toBe(false);
    expect(loc.href).toBe(SERP_URL); // no navigation

    // Runtime sees the /sorry referrer on the returned page → drops the guard.
    applyRuntimeCaptchaGuardDrop(loc.href, SORRY_URL);

    // Now the switch re-applies: hl (interface) + lr (results filter).
    expect(await tryStrategySwitch(deps, rule, 'ru', PRIORITY)).toBe(true);
    expect(loc.href).toContain('hl=uk');
    expect(loc.href).toContain('lr=lang_uk');
  });

  it('also drops the guard while sitting ON the /sorry page (referrer-policy safe)', async () => {
    // Belt-and-suspenders: the content script runs on /sorry (<all_urls>), so
    // the guard is cleared proactively there even if the return referrer is
    // later truncated to the bare origin by Google's referrer policy.
    markAttempt(SERP_URL);
    applyRuntimeCaptchaGuardDrop(SORRY_URL, ''); // on /sorry, no referrer needed
    expect(recentlyAttemptedHere(SERP_URL)).toBe(false);

    const loc = makeLocation(SERP_URL);
    const deps = makeSwitchDeps(loc);
    const rule = getRuleForHost('www.google.com')!;
    expect(await tryStrategySwitch(deps, rule, 'ru', PRIORITY)).toBe(true);
    expect(loc.href).toContain('hl=uk');
  });

  it('keeps the guard when the return is NOT via a captcha (YouTube-style loop stays broken)', async () => {
    // A same-URL return whose referrer is an ordinary SERP — not /sorry — must
    // stay suppressed, exactly as the enforce-mode retention intends. This is
    // the regression fence for the param-strip loop the guard exists to break.
    markAttempt(SERP_URL);
    applyRuntimeCaptchaGuardDrop(SERP_URL, 'https://www.google.com/search?q=other&udm=14');
    expect(recentlyAttemptedHere(SERP_URL)).toBe(true); // guard NOT dropped

    const loc = makeLocation(SERP_URL);
    const deps = makeSwitchDeps(loc);
    const rule = getRuleForHost('www.google.com')!;
    expect(await tryStrategySwitch(deps, rule, 'ru', PRIORITY)).toBe(false);
    expect(loc.href).toBe(SERP_URL); // still suppressed — no navigation
  });
});
