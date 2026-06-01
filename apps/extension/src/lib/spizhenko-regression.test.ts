/**
 * Regression: https://spizhenko.clinic/uk/konsultacija-vracha-onkologa hiccups —
 * the extension oscillates endlessly between sibling locale URLs.
 *
 * Root cause: every locale path on the site serves `<html lang="ru">` (a CMS
 * misconfiguration), so the extension detects 'ru' on each page, tries the
 * hreflang fallback, lands on a sibling URL that ALSO reads as 'ru', and
 * follows the hreflang back. The original single-URL `movar:redirectedFrom`
 * guard never matched because it always held the previous URL while we were
 * checking the current one.
 *
 * Fix verified end-to-end here:
 *   1. PREVENT — the `isAttemptedUrl` predicate threaded through the strategy
 *      context makes `findHreflangMatch` refuse a candidate URL we've already
 *      redirected from. The second hop becomes a no-op before navigation.
 *   2. RESCUE — even if a hop somehow gets through, the multi-URL
 *      `recentlyAttemptedHere()` set catches us when we land back on a URL
 *      already in the history. (Unit-tested in [[loop-guard.test]].)
 *
 * The hreflang block below is verbatim from the live site (curled on
 * 2026-06-01). Includes `x-default` because that's what made the original
 * single-URL guard miss: x-default acts as a fallback for ANY target, so
 * `hreflang('uk')` from /uk/... skips the self-referencing uk link and
 * navigates via x-default to the /ru/ root — a third URL that the single-
 * URL guard could not track.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { detectPageLanguage } from './picker';
import { applyStrategy, type HreflangLink } from './strategy';
import { makeContext } from './strategy.test-utils';
import {
  clearAttempt,
  getAttemptedUrls,
  hasAttemptedNavTo,
  markAttempt,
  recentlyAttemptedHere,
} from './loop-guard';

const URL_UK = 'https://spizhenko.clinic/uk/konsultacija-vracha-onkologa';
const URL_EN = 'https://spizhenko.clinic/en/konsul-tatsiya-vracha-onkologa-v-kieve-vtoroe-mnenie';
const URL_RU = 'https://spizhenko.clinic/konsul-tatsiya-vracha-onkologa-v-kieve-vtoroe-mnenie';

/** Byte-identical on all three locale pages — that's the CMS bug that
 *  makes the site loop in the first place. */
const HREFLANGS: HreflangLink[] = [
  { hreflang: 'uk', href: URL_UK },
  { hreflang: 'ru', href: URL_RU },
  { hreflang: 'en', href: URL_EN },
  { hreflang: 'x-default', href: URL_RU },
];

/** Run `applyStrategy({type:'hreflang'}, target)` for each entry in `priority`
 *  in order, returning at the first navigation — mirrors the loop body of
 *  `tryHreflangRedirect` in [content.ts]. The bug, and its fix, live in the
 *  interaction between this loop and the strategy ctx, so reproducing the
 *  loop verbatim here is the most faithful regression scaffold. */
function runHreflangFallback(
  ctx: ReturnType<typeof makeContext>['ctx'],
  priority: readonly string[],
): { navigated: boolean; calls: number } {
  let calls = 0;
  for (const target of priority) {
    const out = applyStrategy({ type: 'hreflang' }, target, ctx);
    calls++;
    if (out.navigated) return { navigated: true, calls };
  }
  return { navigated: false, calls };
}

const oldStyleDetect = (): string | null => {
  const lang = document.documentElement.getAttribute('lang');
  return lang === 'ru' ? 'ru' : null;
};

beforeEach(() => {
  sessionStorage.clear();
});

describe('spizhenko.clinic regression — oscillation between sibling locale URLs', () => {
  it('hop 1: at /uk/..., hreflang(uk) navigates via x-default to /ru/ root', () => {
    // User priority is ['uk']. The page reads as 'ru' (lang attribute bug).
    // findHreflangMatch ranks the uk-tagged link (rank 2) ahead of x-default
    // (rank 3), but the uk link points at the current URL — so it's skipped
    // and x-default wins. Result: navigate to URL_RU.
    const { ctx, navigate } = makeContext(URL_UK, {
      hreflangs: HREFLANGS,
      isAttemptedUrl: hasAttemptedNavTo,
    });
    const result = runHreflangFallback(ctx, ['uk']);
    expect(result.navigated).toBe(true);
    expect(navigate).toHaveBeenCalledWith(URL_RU);
  });

  it('hop 2 is REFUSED when loop guard knows /uk/... was the source', () => {
    // content.ts called markAttempt(URL_UK) after hop 1 — simulate that.
    markAttempt(URL_UK);

    // We arrive at URL_RU (still `<html lang="ru">`). hreflang(uk) ranks:
    //   - uk → URL_UK → rank 2 → BUT in attempted set → skipped (the fix).
    //   - x-default → URL_RU → rank 3 → current URL → skipped (built-in).
    // No fallback navigates. The bounce dies here.
    const { ctx, navigate } = makeContext(URL_RU, {
      hreflangs: HREFLANGS,
      isAttemptedUrl: hasAttemptedNavTo,
    });
    const result = runHreflangFallback(ctx, ['uk']);
    expect(result.navigated).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('end-to-end: priority=[uk] makes /uk/... → /ru/... → STOP (was infinite)', () => {
    // Hop 1: load at /uk/...
    const hop1 = makeContext(URL_UK, {
      hreflangs: HREFLANGS,
      isAttemptedUrl: hasAttemptedNavTo,
    });
    expect(runHreflangFallback(hop1.ctx, ['uk']).navigated).toBe(true);
    expect(hop1.navigate).toHaveBeenCalledWith(URL_RU);
    markAttempt(URL_UK);

    // Hop 2: page reloads at /ru/... — same priority, same priority loop.
    // Pre-fix: hreflang(uk) would resolve to URL_UK (different URL) and
    //          navigate back, starting the infinite loop.
    // Post-fix: URL_UK is in the attempted set → skipped → no navigation.
    const hop2 = makeContext(URL_RU, {
      hreflangs: HREFLANGS,
      isAttemptedUrl: hasAttemptedNavTo,
    });
    expect(runHreflangFallback(hop2.ctx, ['uk']).navigated).toBe(false);
    expect(hop2.navigate).not.toHaveBeenCalled();
  });

  it('end-to-end: priority=[en,uk] settles after at most three hops', () => {
    // Worst case for this fixture: the priority list has enough fallbacks
    // that x-default keeps finding fresh targets. The bounce visits all
    // three locale URLs in succession; on the fourth wake-up every
    // hreflang resolves to a URL already in the attempted set, so the
    // chain terminates.
    const trace: string[] = [];
    const visit = (from: string, priority: readonly string[]): string | null => {
      const { ctx, navigate } = makeContext(from, {
        hreflangs: HREFLANGS,
        isAttemptedUrl: hasAttemptedNavTo,
      });
      const navigated = runHreflangFallback(ctx, priority).navigated;
      const next = navigated ? (navigate.mock.calls.at(-1)?.[0] ?? null) : null;
      if (next) {
        markAttempt(from);
        trace.push(`${from} → ${next}`);
      }
      return next;
    };

    let here: string | null = URL_UK;
    const priority = ['en', 'uk'] as const;
    // Bound to 6 hops so a regression that re-introduces the bug fails
    // fast with a clear "loop did not terminate" signal instead of
    // hanging the test runner.
    for (let i = 0; i < 6 && here !== null; i++) {
      here = visit(here, priority);
    }
    expect(trace.length).toBeLessThanOrEqual(3);
    // All visited URLs should be in the attempted set, and the chain
    // settled at one of the three real locale URLs.
    const attempted = getAttemptedUrls();
    expect(attempted.length).toBeGreaterThan(0);
    expect(attempted.every((u) => [URL_UK, URL_EN, URL_RU].includes(u))).toBe(true);
  });

  it('rescue path: even if a redirect slips through, the third hop bails', () => {
    // Models the worst case: somehow markAttempt happened but the pre-nav
    // skip didn't fire (e.g. a race with an older bundle during update).
    // The page genuinely bounced /uk/... → /ru/... → /uk/.... Now the
    // content script wakes up at /uk/... and runs the very first check
    // in tryHreflangRedirect: `if (recentlyAttemptedHere()) return false`.
    markAttempt(URL_UK);
    markAttempt(URL_RU);

    // Back at URL_UK. The single-URL guard in the pre-fix code would have
    // been overwritten to URL_RU by the second markAttempt and would NOT
    // catch us here — the original bug. The multi-URL set still contains
    // URL_UK, so the guard fires.
    expect(recentlyAttemptedHere(URL_UK)).toBe(true);
    expect(getAttemptedUrls()).toEqual([URL_UK, URL_RU]);
  });

  it('clearAttempt resets the history so future blocked pages can redirect again', () => {
    markAttempt(URL_UK);
    markAttempt(URL_RU);
    // content.ts calls clearAttempt() when applyOnce lands on a non-blocked
    // page on a non-enforce site — the redirect chain succeeded, so the
    // guard hands back the keys.
    clearAttempt();
    expect(getAttemptedUrls()).toEqual([]);
    expect(recentlyAttemptedHere(URL_UK)).toBe(false);
    expect(hasAttemptedNavTo(URL_RU)).toBe(false);
  });
});

describe('spizhenko.clinic regression — root cause: picker-active detection', () => {
  // The hreflang loop guard above keeps the page from bouncing forever, but
  // it still settles on a URL that doesn't match the user's preference. The
  // root-cause fix is to identify Ukrainian content correctly in the first
  // place: the picker's bare-text "UA" entry is the strongest signal that
  // the page is actually Ukrainian, even when <html lang="ru"> claims
  // otherwise. With this signal in place the extension never tries to
  // redirect and the user stays on /uk/... reading Ukrainian content.

  /** The picker block lifted verbatim from the live `/uk/...` page. The
   *  active entry is plain text "UA" — no element wraps it — while the
   *  switchable entries are anchors pointing at the sibling locale URLs. */
  const PICKER_HTML = `
    <div id="lang-picker">UA&nbsp;|&nbsp;<a href="${URL_RU}">RU</a>&nbsp;|&nbsp;<a href="${URL_EN}">EN</a></div>
  `;

  it('correctly detects /uk/... as Ukrainian despite <html lang="ru">', () => {
    document.documentElement.setAttribute('lang', 'ru');
    document.body.innerHTML = PICKER_HTML;
    const loc = {
      pathname: '/uk/konsultacija-vracha-onkologa',
      hostname: 'spizhenko.clinic',
      href: URL_UK,
    };
    expect(detectPageLanguage(document, loc)).toBe('uk');
    document.documentElement.removeAttribute('lang');
  });

  it('correctly detects /en/... as English despite <html lang="ru">', () => {
    // On the English page the picker's bare-text active entry is "EN".
    document.documentElement.setAttribute('lang', 'ru');
    document.body.innerHTML = `
      <div id="lang-picker">EN&nbsp;|&nbsp;<a href="${URL_UK}">UA</a>&nbsp;|&nbsp;<a href="${URL_RU}">RU</a></div>
    `;
    const loc = {
      pathname: '/en/konsul-tatsiya-vracha-onkologa-v-kieve-vtoroe-mnenie',
      hostname: 'spizhenko.clinic',
      href: URL_EN,
    };
    expect(detectPageLanguage(document, loc)).toBe('en');
    document.documentElement.removeAttribute('lang');
  });

  it('correctly detects / root as Russian via picker (matches <html lang> here)', () => {
    document.documentElement.setAttribute('lang', 'ru');
    document.body.innerHTML = `
      <div id="lang-picker">RU&nbsp;|&nbsp;<a href="${URL_UK}">UA</a>&nbsp;|&nbsp;<a href="${URL_EN}">EN</a></div>
    `;
    const loc = {
      pathname: '/konsul-tatsiya-vracha-onkologa-v-kieve-vtoroe-mnenie',
      hostname: 'spizhenko.clinic',
      href: URL_RU,
    };
    expect(detectPageLanguage(document, loc)).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });

  it('pre-fix detection would have returned the (wrong) <html lang> value', () => {
    // Same DOM, but the OLD detection priority started at <html lang>. This
    // case fixes the chain at the lang attribute and asserts the value that
    // would have come back — the "ru" detection that triggered the entire
    // redirect loop.
    document.documentElement.setAttribute('lang', 'ru');
    expect(oldStyleDetect()).toBe('ru');
    document.documentElement.removeAttribute('lang');
  });
});

describe('spizhenko.clinic regression — pre-fix behaviour proof', () => {
  it('without the loop guard, hop 2 navigates back — re-creating the loop', () => {
    // Same fixture, same priority — but the ctx omits isAttemptedUrl, the
    // way every call site looked before this fix. We expect hop 2 to
    // navigate, which is the broken behaviour the fix corrects.
    const hop1 = makeContext(URL_UK, { hreflangs: HREFLANGS });
    expect(runHreflangFallback(hop1.ctx, ['uk']).navigated).toBe(true);
    expect(hop1.navigate).toHaveBeenCalledWith(URL_RU);

    const hop2 = makeContext(URL_RU, { hreflangs: HREFLANGS });
    expect(runHreflangFallback(hop2.ctx, ['uk']).navigated).toBe(true);
    expect(hop2.navigate).toHaveBeenCalledWith(URL_UK);
    // ↑ That second navigate IS the bug. With the fix (ctx carrying
    //   isAttemptedUrl), the previous test case shows it doesn't fire.
  });
});
