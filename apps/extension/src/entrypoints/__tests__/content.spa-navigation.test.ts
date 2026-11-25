import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { CapabilityNeeds } from '../../lib/capabilities';
import type { ProvisionedCapabilityModules } from '../../lib/capability-loader';
import type { ContentRuntime } from '../../lib/content-runtime';
import { clearAttempt, getAttemptedUrls, markAttempt } from '../../lib/loop-guard';
import { fakeConcealModule, installFakeChunks } from './content.test-utils';

const capabilityLoaderMock = vi.hoisted(() => ({
  provisionCapabilities: vi.fn<(needs: CapabilityNeeds) => Promise<ProvisionedCapabilityModules>>(),
}));

// page-text's sampleVisibleText reads `innerText`, which jsdom doesn't
// implement; the tier-7 text sniff is exercised by page-text's own suite, so
// here we stub it to "no sample" to keep applyOnce deterministic. vi.mock is
// hoisted above the `../content` import, so the stub is in place on load.
vi.mock('../../lib/page-text', () => ({ sampleVisibleText: () => '' }));
vi.mock('../../lib/capability-loader', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    provisionCapabilities: capabilityLoaderMock.provisionCapabilities,
  };
});

let runtime: ContentRuntime;

beforeEach(async () => {
  fakeBrowser.reset();
  capabilityLoaderMock.provisionCapabilities.mockReset();
  vi.resetModules();
  runtime = (await import('../../lib/content-runtime')).createContentRuntime();
  document.body.innerHTML = '';
  // installSettingsListener (since #79) resolves the UI locale via
  // browser.i18n.getUILanguage(), which fakeBrowser leaves unimplemented.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
  // Stand in fake dynamic chunks so the content-modification branch is
  // exercisable without resolving real runtime.getURL modules in jsdom.
  installFakeChunks();
});

afterEach(async () => {
  // restoreAll / a concealing applyOnce schedule the debounced live-region
  // announcement on a real 600ms timer; clear it so it can't fire after jsdom
  // is torn down (`document is not defined` crashing whatever file runs next).
  // Dynamic import on purpose: resetModules in beforeEach gives each test a
  // fresh live-region instance, and a static import would tear down a stale one.
  (await import('../../lib/live-region')).teardownLiveRegion();
  vi.restoreAllMocks();
});

/** Run `fn` with `globalThis.location` stubbed to `href` — the committed,
 *  post-navigation state a polling/history dispatch (and every dispatch whose
 *  navigation has already landed) arrives in. handleLocationChange's pre-commit
 *  discriminator compares the live location against the event's `newUrl`, so a
 *  test that models a post-commit dispatch must actually stand on `newUrl` —
 *  jsdom's default `localhost` location would read as pre-commit and defer.
 *  Returns the stub so callers can assert on `replace`/`reload`. */
function withCommittedLocation(
  href: string,
  fn: () => void,
): { replace: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> } {
  const url = new URL(href);
  const fakeLocation = {
    href,
    hostname: url.hostname,
    protocol: url.protocol,
    pathname: url.pathname,
    replace: vi.fn(),
    reload: vi.fn(),
  };
  const original = globalThis.location;
  Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: original });
  }
  return fakeLocation;
}

describe('SPA / history location-change re-trigger', () => {
  beforeEach(() => {
    clearAttempt();
  });

  it('re-runs applyOnce on a URL change, even when the body did not mutate', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const live = { current: { ...defaultSettings, contentModification: true } };

    // First apply runs the content pass once.
    await runtime.applyOnce(live.current);
    expect(mod.applyContentModification).toHaveBeenCalledOnce();

    // A "Show everything" override would normally make applyOnce a no-op...
    runtime.restoreAll();
    expect(await runtime.applyOnce(live.current)).toBe(false);
    expect(mod.applyContentModification).toHaveBeenCalledOnce();

    // ...but an SPA route change is a new page: it resets the override and
    // re-applies, so the content pass fires again.
    withCommittedLocation('https://example.com/new-route', () => {
      runtime.handleLocationChange(
        live,
        new URL('https://example.com/new-route'),
        new URL('https://example.com/old-route'),
      );
    });
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalledTimes(2);
    });
  });

  it('clears a prior "Show everything" override on an SPA path change', () => {
    const live = { current: { ...defaultSettings } };
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);

    withCommittedLocation('https://example.com/b', () => {
      runtime.handleLocationChange(
        live,
        new URL('https://example.com/b'),
        new URL('https://example.com/a'),
      );
    });
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });

  it('does NOT clear the loop guard on a same-path, query-only change (YouTube param strip)', () => {
    const live = { current: { ...defaultSettings } };
    // Arm the loop guard for the bare URL (as an enforce-mode redirect would).
    const bare = 'https://www.youtube.com/results?search_query=test';
    markAttempt(bare);
    expect(getAttemptedUrls()).toContain(bare);

    // YouTube's polymer router strips &hl=uk&gl=UA via replaceState — same path,
    // different query. The guard must survive so the bare→params→bare loop stays
    // broken.
    withCommittedLocation(bare, () => {
      runtime.handleLocationChange(
        live,
        new URL('https://www.youtube.com/results?search_query=test'),
        new URL('https://www.youtube.com/results?search_query=test&hl=uk&gl=UA'),
      );
    });
    expect(getAttemptedUrls()).toContain(bare);
  });

  it('clears the loop guard when the path actually changes (non-enforce host)', () => {
    const live = { current: { ...defaultSettings } };
    markAttempt('https://example.com/ru/page');
    expect(getAttemptedUrls()).toHaveLength(1);

    withCommittedLocation('https://example.com/uk/other', () => {
      runtime.handleLocationChange(
        live,
        new URL('https://example.com/uk/other'),
        new URL('https://example.com/ru/page'),
      );
    });
    expect(getAttemptedUrls()).toHaveLength(0);
  });

  // The other half of the aborted-click/blink class: applyRouteChange used to
  // clear the loop guard on EVERY pathname change, so clicking through to
  // /watch wiped the bare /results mark — and the RETURN to /results found the
  // guard empty, re-fired the enforce rewrite, and cost a full-reload blink on
  // every results↔watch round trip. Enforce-mode hosts must keep the guard
  // across pathname changes, mirroring applyOnceInner's OK-page exception.
  it('keeps the loop guard across pathname changes on an enforce-mode host (results ↔ watch)', () => {
    const live = { current: { ...defaultSettings } };
    const bare = 'https://www.youtube.com/results?search_query=test';
    const watch = 'https://www.youtube.com/watch?v=abc123';
    markAttempt(bare);

    // Click through to the video (committed).
    withCommittedLocation(watch, () => {
      runtime.handleLocationChange(live, new URL(watch), new URL(bare));
    });
    expect(getAttemptedUrls()).toContain(bare);

    // Return to the results page (committed traversal). With the guard intact
    // the bare URL still reads as recently-attempted, so the rewrite (and its
    // full-reload blink) never re-fires.
    withCommittedLocation(bare, () => {
      runtime.handleLocationChange(live, new URL(bare), new URL(watch));
    });
    expect(getAttemptedUrls()).toContain(bare);
  });

  // Reported bug: on YouTube, clicking a video is a same-document Navigation-API
  // push to /watch. WXT's location watcher dispatches wxt:locationchange from the
  // `navigate` event — BEFORE the navigation commits, while location.href still
  // reads the /results page. Acting then re-applied the enforce searchParams rule
  // to the still-current /results URL and location.replace()d to re-add hl/gl,
  // aborting the click: the page blinked and the video never opened. The reset +
  // re-apply must wait for the navigation to commit (location catches up to
  // /watch), where the /results-gated rule is a no-op.
  it('defers the reset + re-apply until a pre-commit SPA navigation lands (YouTube video click)', async () => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };
    const live = { current: settings };

    const resultsUrl = 'https://www.youtube.com/results?search_query=test';
    const watchUrl = 'https://www.youtube.com/watch?v=abc123';
    const fakeLocation = {
      // Still on /results: the navigate event fires before the push commits.
      href: resultsUrl,
      hostname: 'www.youtube.com',
      protocol: 'https:',
      pathname: '/results',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    // Arm the loop guard for the current page (the settled post-load state).
    // Clearing it is exactly what would let the enforce rewrite re-fire.
    markAttempt(resultsUrl);
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      // The video click: locationchange fires with the destination while
      // location.href is still /results.
      runtime.handleLocationChange(live, new URL(watchUrl), new URL(resultsUrl));

      // Pre-commit: nothing must fire yet. Pre-fix, the pathname-change branch
      // synchronously cleared the guard and re-ran applyOnce against /results,
      // re-adding hl/gl and aborting the navigation.
      expect(getAttemptedUrls()).toContain(resultsUrl);
      expect(fakeLocation.replace).not.toHaveBeenCalled();

      // The browser commits the same-document navigation to /watch.
      fakeLocation.href = watchUrl;
      fakeLocation.pathname = '/watch';
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Now the reset + re-apply run — against /watch, where the /results-gated
      // enforce rule is a no-op, so the video navigation is never clobbered.
      // The guard survives the pathname change too (enforce-mode retention):
      // it is what keeps the RETURN to /results from re-firing the rewrite.
      expect(getAttemptedUrls()).toContain(resultsUrl);
      expect(fakeLocation.replace).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe(watchUrl);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });

  it('skips the re-apply when a pre-commit navigation never lands (canceled nav)', async () => {
    sessionStorage.clear();
    const live = { current: { ...defaultSettings } };
    markAttempt('https://example.com/ru/page');

    // location stays on the old URL — a canceled/blocked navigation. The event
    // still arrived (WXT advanced its lastUrl), but nothing actually changed, so
    // no reset (guard kept) and no re-apply.
    const fakeLocation = {
      href: 'https://example.com/ru/page',
      hostname: 'example.com',
      protocol: 'https:',
      pathname: '/ru/page',
      replace: vi.fn(),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      runtime.handleLocationChange(
        live,
        new URL('https://example.com/uk/other'),
        new URL('https://example.com/ru/page'),
      );
      await new Promise((resolve) => setTimeout(resolve, 5));
      // Never committed — the guard survives and no rewrite fired.
      expect(getAttemptedUrls()).toContain('https://example.com/ru/page');
      expect(fakeLocation.replace).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });

  // WXT's watcher advances its `lastUrl` on every dispatched navigate event —
  // including navigations that are later CANCELED and never commit. The next
  // event's `oldUrl` then names a page we never visited, and the old
  // `location === oldUrl` pre-commit tell missed: the handler fell through to
  // the synchronous branch and ran applyOnce INSIDE the click's navigate
  // dispatch, against the still-current (and here unguarded) /results URL —
  // whose enforce rewrite would location.replace() and abort the click. The
  // discriminator must defer whenever location has not reached the
  // DESTINATION, regardless of what the watcher believes the old URL was.
  it('defers when the watcher oldUrl drifted after a canceled nav (no synchronous re-apply inside the dispatch)', async () => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    // Sync-detectable page language, so a synchronous fall-through would reach
    // the enforce ladder (and its location.replace) without awaiting.
    document.documentElement.lang = 'uk';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };
    const live = { current: settings };

    // The REAL current page: an UNGUARDED enforce-mode results URL — the state
    // a fresh search or a just-stripped return leaves behind.
    const resultsUrl = 'https://www.youtube.com/results?search_query=test';
    // What WXT recorded from a canceled click that never committed.
    const phantomOldUrl = 'https://www.youtube.com/watch?v=aborted';
    // The click being made now.
    const watchUrl = 'https://www.youtube.com/watch?v=chosen';

    const fakeLocation = {
      href: resultsUrl,
      hostname: 'www.youtube.com',
      protocol: 'https:',
      pathname: '/results',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      runtime.handleLocationChange(live, new URL(watchUrl), new URL(phantomOldUrl));

      // Nothing may fire synchronously inside the dispatch: no rewrite of the
      // still-current /results URL (that replace is exactly the aborted click).
      expect(fakeLocation.replace).not.toHaveBeenCalled();

      // The browser commits the click to /watch.
      fakeLocation.href = watchUrl;
      fakeLocation.pathname = '/watch';
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Deferred re-apply ran against the committed /watch, where the
      // /results-gated rule is a no-op — the click-through survives.
      expect(fakeLocation.replace).not.toHaveBeenCalled();
      expect(fakeLocation.href).toBe(watchUrl);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      document.documentElement.lang = '';
      sessionStorage.clear();
    }
  });

  it('keeps a prior "Show everything" override on a query-only SPA change', () => {
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
    runtime.handleLocationChange(
      { current: { ...defaultSettings } },
      new URL('https://www.youtube.com/results?search_query=test&hl=uk&gl=UA'),
      new URL('https://www.youtube.com/results?search_query=test'),
    );
    // A same-path query rewrite is not a new page — the override must survive so
    // content the user revealed is not silently re-concealed.
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
  });

  // #314: the override must NOT leak onto a DIFFERENT video at the same
  // /watch pathname. Pre-fix, applyRouteChange only cleared userOverride on a
  // pathname change, so this same-path-different-content nav left Movar
  // silenced on videoB until an unrelated pathname change, reload, or
  // settings toggle.
  it('resets a prior "Show everything" override on a same-pathname SPA nav to a new video (YouTube)', () => {
    const live = { current: { ...defaultSettings } };
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);

    withCommittedLocation('https://www.youtube.com/watch?v=videoB', () => {
      runtime.handleLocationChange(
        live,
        new URL('https://www.youtube.com/watch?v=videoB'),
        new URL('https://www.youtube.com/watch?v=videoA'),
      );
    });
    // Same pathname (/watch), a genuinely different video — Movar must
    // re-evaluate the new page rather than stay silenced.
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });

  // #314's other reported trigger: a same-pathname /search navigation to a
  // new query. hl/lr are Movar's own managed params (carried over unchanged
  // here, as a real rewrite would leave them); only `q` differs, which is
  // exactly the content-bearing signal the fix keys on.
  it('resets a prior "Show everything" override on a same-pathname SPA nav to a new query (Google)', () => {
    const live = { current: { ...defaultSettings } };
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);

    withCommittedLocation('https://www.google.com/search?q=queryB&hl=uk&lr=lang_uk', () => {
      runtime.handleLocationChange(
        live,
        new URL('https://www.google.com/search?q=queryB&hl=uk&lr=lang_uk'),
        new URL('https://www.google.com/search?q=queryA&hl=uk&lr=lang_uk'),
      );
    });
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });

  // Reported bug: Google's AI Mode chat calls history.replaceState() on every
  // turn, reissuing ITS OWN opaque `sei` token each time (confirmed live) even
  // though hl/lr are already correct. `googleSearchStrategy` now scopes the
  // rewrite to the plain results page via `onlyWhenParamValueIn: {name:
  // 'udm', values: ['14']}` (sites/google/index.ts), so AI Mode (`udm=50`)
  // never engages the ladder at all — not even the very first tick — and the
  // repeated reload that used to abort the chat (perceived as the extension
  // crashing and the page refreshing repeatedly) can't happen.
  it('never redirects on Google AI Mode (udm=50), not even on the first tick', async () => {
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };

    const fakeLocation = {
      href: 'https://www.google.com/search?q=rust&udm=50&sei=SEI1',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      // Turn 0 (document boot): hl/lr missing and a sei token present — on the
      // plain results page this would force the one-time enforce + strip
      // cleanup, but udm=50 gates it out entirely.
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).not.toHaveBeenCalled();

      // Turn 1: AI Mode's OWN history.replaceState reasserts `sei` on this
      // chat turn (its normal per-render bookkeeping) — a same-path
      // locationchange would re-enter applyOnce next. Still no redirect.
      const turn1 = new URL(fakeLocation.href);
      turn1.searchParams.set('sei', 'SEI1');
      turn1.searchParams.set('mstk', 'T1');
      fakeLocation.href = turn1.toString();
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).not.toHaveBeenCalled();

      // Turn 2: another chat turn, a longer mstk and a different sei value —
      // still no redirect, so the conversation is never interrupted.
      const turn2 = new URL(fakeLocation.href);
      turn2.searchParams.set('sei', 'SEI2');
      turn2.searchParams.set('mstk', 'T2-longer-conversation-state-token');
      fakeLocation.href = turn2.toString();
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });

  // The plain results page (no `udm`, or `udm=14`) still gets the full
  // enforce ladder, including the enforceCheckedOnce/ignoreStripParamsForTrigger
  // defense (content-runtime.ts) against a stray strip-listed token
  // reappearing on a repeat tick for reasons unrelated to AI Mode (e.g.
  // Google's own "instant SERP" query-box updates).
  it('suppresses a reissued sei on a repeat tick but still corrects a genuine hl/lr regression, on the plain results page', async () => {
    // Three-turn sequence, all on the plain results page (no udm gate to
    // short-circuit it), pinning enforceCheckedOnce's actual suppression path
    // — not just its unaffected fall-through:
    //   turn 0: settles (hl/lr missing, sei present) — the one-time cleanup.
    //   turn 1: sei reappears (a page-side "instant SERP" style update) with
    //     hl/lr still intact — must NOT navigate. This is the behaviour the
    //     fix exists for; before it, EVERY repeat tick like this navigated.
    //   turn 2: hl/lr regress for real — enforceCheckedOnce only silences a
    //     strip-listed token's mere reappearance, never a genuine params
    //     drift, so this must still navigate.
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };

    const fakeLocation = {
      href: 'https://www.google.com/search?q=rust&sei=SEI1',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      // Turn 0: settle.
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);
      const settled = new URL(fakeLocation.href);
      expect(settled.searchParams.get('hl')).toBe('uk');
      expect(settled.searchParams.get('lr')).toBe('lang_uk');
      expect(settled.searchParams.has('sei')).toBe(false);

      // Turn 1: sei reappears, hl/lr untouched — must be suppressed.
      const turn1 = new URL(fakeLocation.href);
      turn1.searchParams.set('sei', 'SEI2');
      fakeLocation.href = turn1.toString();
      expect(await runtime.applyOnce(settings)).toBe(false);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);

      // Turn 2: a later turn's URL is missing `lr` entirely (a real
      // regression, not just a reissued sei) — the loop guard hasn't seen
      // this exact URL before, so the ladder must correct it.
      const regressed = new URL(fakeLocation.href);
      regressed.searchParams.delete('lr');
      regressed.searchParams.set('mstk', 'T1');
      fakeLocation.href = regressed.toString();
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(2);
      expect(new URL(fakeLocation.href).searchParams.get('lr')).toBe('lang_uk');
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });

  it('re-arms the aggressive strip-cleanup on a genuine pathname change (enforceCheckedOnce reset)', async () => {
    // A same-path repeat tick suppresses a strip-listed token's mere
    // reappearance (see the test above) — but a genuine NEW page must still
    // get the full one-shot cleanup, even if hl/lr happen to already be
    // correct there (e.g. carried over) and only a fresh session token is
    // present. If the reset in handleLocationChange's pathname-change branch
    // regressed, this tick would be wrongly suppressed instead.
    sessionStorage.clear();
    document.body.innerHTML = '';
    const settings = { ...defaultSettings, priority: ['uk' as const], contentModification: false };
    const live = { current: settings };

    const fakeLocation = {
      href: 'https://www.google.com/search?q=rust&sei=SEI1',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      const oldUrl = new URL(fakeLocation.href);
      // Turn 0: settle on /search — arms enforceCheckedOnce.
      expect(await runtime.applyOnce(settings)).toBe(true);
      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);

      // A genuine new page — `onlyOnPath: '/search'` is a prefix match, so
      // /search/other still qualifies for the rule — with hl/lr ALREADY
      // correct (as if carried over) but a fresh session token present.
      const newUrl = new URL(
        'https://www.google.com/search/other?q=next&hl=uk&lr=lang_uk&sei=SEI2',
      );
      fakeLocation.href = newUrl.toString();
      fakeLocation.pathname = newUrl.pathname;
      runtime.handleLocationChange(live, newUrl, oldUrl);
      // A same-path repeat tick would suppress this (sei-only diff); the
      // pathname-change reset must instead force the one-shot cleanup again.
      await vi.waitFor(() => {
        expect(fakeLocation.replace).toHaveBeenCalledTimes(2);
      });
      expect(new URL(fakeLocation.href).searchParams.has('sei')).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      sessionStorage.clear();
    }
  });
});
