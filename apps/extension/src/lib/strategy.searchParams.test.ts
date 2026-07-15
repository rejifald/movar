import { beforeEach, describe, expect, it } from 'vitest';
import { applyStrategy } from './strategy';
import type { LangStrategy } from '../sites/types';
import { makeContext } from './strategy.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyStrategy — searchParams', () => {
  it('sets all params on a single navigation', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
    const out = applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('hl')).toBe('uk');
    expect(target.searchParams.get('lr')).toBe('lang_uk');
    expect(target.searchParams.get('q')).toBe('apple');
    expect(out).toEqual({ navigated: true, needsReload: false, appliedSteps: 1 });
  });

  it('preserves unrelated query params', () => {
    const { ctx, navigate } = makeContext(
      'https://www.google.com/search?q=apple&oq=apple&sourceid=chrome',
    );
    applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('oq')).toBe('apple');
    expect(target.searchParams.get('sourceid')).toBe('chrome');
  });

  it('overwrites an existing param when its value differs', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&hl=ru');
    applyStrategy({ type: 'searchParams', params: [{ name: 'hl' }] }, 'uk', ctx);
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('hl')).toBe('uk');
  });

  it('is a no-op when every param is already at the target value', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&hl=uk&lr=lang_uk');
    const out = applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'hl' }, { name: 'lr', values: { uk: 'lang_uk' } }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('is a no-op when onlyWhenParam is absent (e.g. homepage)', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/');
    const out = applyStrategy(
      {
        type: 'searchParams',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('applies when onlyWhenParam is present', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
    applyStrategy(
      {
        type: 'searchParams',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when onlyOnPath does not match the current pathname', () => {
    // google.com/maps shares the host with /search but `lr=lang_uk` can break
    // Maps. The rule must skip non-/search paths.
    const { ctx, navigate } = makeContext('https://www.google.com/maps?q=київ');
    const out = applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('applies when onlyOnPath matches the current pathname', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search?q=київ');
    applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('onlyOnPath uses a prefix match (allows deeper subpaths under the gate)', () => {
    const { ctx, navigate } = makeContext('https://www.google.com/search/foo?q=test');
    applyStrategy(
      {
        type: 'searchParams',
        onlyOnPath: '/search',
        onlyWhenParam: 'q',
        params: [{ name: 'hl' }],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('falls back to the bare target code when no values map matches', () => {
    const { ctx, navigate } = makeContext('https://duckduckgo.com/?q=apple');
    applyStrategy(
      {
        type: 'searchParams',
        params: [{ name: 'kl', values: { uk: 'ua-uk' } }],
      },
      // 'xx' has no mapping — encodedValue returns the raw target.
      'xx',
      ctx,
    );
    const target = new URL(navigate.mock.calls[0]![0] as string);
    expect(target.searchParams.get('kl')).toBe('xx');
  });

  describe('joinPreferences', () => {
    it('pipe-joins every preferred language when targets is an array', () => {
      // Google's `lr` joins per-language codes so a `[uk, en]` user sees
      // results in either language. `hl` (single-valued) stays at the top.
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
      applyStrategy(
        {
          type: 'searchParams',
          params: [
            { name: 'hl' },
            { name: 'lr', values: { uk: 'lang_uk', en: 'lang_en' }, joinPreferences: true },
          ],
        },
        ['uk', 'en'],
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('hl')).toBe('uk');
      expect(target.searchParams.get('lr')).toBe('lang_uk|lang_en');
    });

    it('emits a single value for joinPreferences when targets has length 1', () => {
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'lr', values: { uk: 'lang_uk' }, joinPreferences: true }],
        },
        ['uk'],
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('lr')).toBe('lang_uk');
    });

    it('single-string target backward-compat: behaves as a 1-element list', () => {
      // Existing callers that pass a bare LanguageCode (e.g. hreflang
      // fallback) still get the top-preference single-value behaviour.
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'lr', values: { uk: 'lang_uk' }, joinPreferences: true }],
        },
        'uk',
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('lr')).toBe('lang_uk');
    });

    it('only joins on params with joinPreferences=true; others use the top preference', () => {
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple');
      applyStrategy(
        {
          type: 'searchParams',
          params: [
            { name: 'hl' },
            { name: 'lr', values: { uk: 'lang_uk', en: 'lang_en' }, joinPreferences: true },
          ],
        },
        ['uk', 'en', 'de'],
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('hl')).toBe('uk');
      // `de` has no entry in this values map, so it falls back to the bare
      // code per encodedValue — the join still works, it just gets `de`.
      expect(target.searchParams.get('lr')).toBe('lang_uk|lang_en|de');
    });

    it('joined lr survives the no-op check (existing URL holds joined value)', () => {
      // A user already on the joined URL must not trigger a redirect loop.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&lr=lang_uk%7Clang_en',
      );
      const out = applyStrategy(
        {
          type: 'searchParams',
          params: [
            { name: 'hl' },
            { name: 'lr', values: { uk: 'lang_uk', en: 'lang_en' }, joinPreferences: true },
          ],
        },
        ['uk', 'en'],
        ctx,
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(out.appliedSteps).toBe(0);
    });
  });

  describe('stripParams', () => {
    it('strips named params on every rewrite', () => {
      // `sei` is Google's session-event token: it carries prior-session locale
      // bias forward and must be dropped or `hl`/`lr` can be overridden.
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&sei=ABC123DEF');
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          stripParams: ['sei'],
        },
        'uk',
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.has('sei')).toBe(false);
      expect(target.searchParams.get('hl')).toBe('uk');
      expect(target.searchParams.get('q')).toBe('apple');
    });

    it('triggers a rewrite when the only diff is a stripped param', () => {
      // hl is already at the target but sei must still be removed.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&sei=stale',
      );
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          stripParams: ['sei'],
        },
        'uk',
        ctx,
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.has('sei')).toBe(false);
    });

    it('is a no-op when none of the stripped params are present and params already match', () => {
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&hl=uk');
      const out = applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          stripParams: ['sei'],
        },
        'uk',
        ctx,
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(out.appliedSteps).toBe(0);
    });

    it('strips multiple params', () => {
      // `zx` is a deliberately boring second token — NOT `pws`, which is a
      // real user-facing toggle (Google's "Try without personalization"
      // emits `pws=0`) that a production rule must never strip.
      const { ctx, navigate } = makeContext('https://www.google.com/search?q=apple&sei=x&zx=1');
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          stripParams: ['sei', 'zx'],
        },
        'uk',
        ctx,
      );
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.has('sei')).toBe(false);
      expect(target.searchParams.has('zx')).toBe(false);
    });
  });

  describe('ignoreStripParamsForTrigger (repeat same-document ticks)', () => {
    // Google's AI Mode reissues its own opaque `sei` token via
    // history.replaceState on every chat turn even when hl/lr are already
    // correct — content-runtime.ts sets this flag on every tick after the
    // page's first, so a strip-listed token's mere reappearance stops forcing
    // a fresh `location.replace` (and aborting the in-progress chat) on every
    // turn. See apps/extension/src/lib/content-runtime.ts's `enforceCheckedOnce`.
    it('does not navigate when params already match and only a strip-listed token differs', () => {
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&sei=stale',
      );
      const out = applyStrategy(
        { type: 'searchParams', params: [{ name: 'hl' }], stripParams: ['sei'] },
        'uk',
        { ...ctx, ignoreStripParamsForTrigger: true },
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(out).toEqual({ navigated: false, needsReload: false, appliedSteps: 0 });
    });

    it('still navigates when a core param is off-target, even with the flag set', () => {
      // A genuine hl/lr regression must still be corrected on a repeat tick —
      // the flag only silences the strip-listed-token trigger, never a real
      // params drift.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=ru&sei=stale',
      );
      applyStrategy(
        { type: 'searchParams', params: [{ name: 'hl' }], stripParams: ['sei'] },
        'uk',
        { ...ctx, ignoreStripParamsForTrigger: true },
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('hl')).toBe('uk');
      expect(target.searchParams.has('sei')).toBe(false);
    });

    it('defaults to the existing (unconditional) strip-triggers-navigation behaviour when unset', () => {
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&sei=stale',
      );
      applyStrategy(
        { type: 'searchParams', params: [{ name: 'hl' }], stripParams: ['sei'] },
        'uk',
        ctx,
      );
      expect(navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('scrubParams / scrubPrefixes', () => {
    it('drops scrub-listed and scrub-prefixed params when a rewrite already navigates', () => {
      // Entry-style URL: `hl` is missing, so the rewrite must navigate — the
      // scrub tier rides that navigation for free.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&gs_lp=Abc&aqs=chrome.69i57&oq=apple',
      );
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          scrubPrefixes: ['gs_'],
          scrubParams: ['aqs'],
        },
        'uk',
        ctx,
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.has('gs_lp')).toBe(false);
      expect(target.searchParams.has('aqs')).toBe(false);
      // Non-matching params survive the scrub untouched.
      expect(target.searchParams.get('oq')).toBe('apple');
      expect(target.searchParams.get('hl')).toBe('uk');
    });

    it('never triggers a navigation on its own (URL already at target)', () => {
      // A SERP-box refinement carries `gs_lp` but arrives with `hl` already
      // correct. Scrubbing must NOT cost the user a reload here — this
      // non-triggering behaviour is the entire difference between the scrub
      // tier and stripParams.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&gs_lp=Abc',
      );
      const out = applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          scrubPrefixes: ['gs_'],
        },
        'uk',
        ctx,
      );
      expect(navigate).not.toHaveBeenCalled();
      expect(out.appliedSteps).toBe(0);
    });

    it('rides a stripParams-forced rewrite', () => {
      // `sei` present → the rewrite fires even though `hl` matches; the
      // scrub tier cleans `gs_lp` on that same navigation.
      const { ctx, navigate } = makeContext(
        'https://www.google.com/search?q=apple&hl=uk&sei=stale&gs_lp=Abc',
      );
      applyStrategy(
        {
          type: 'searchParams',
          params: [{ name: 'hl' }],
          stripParams: ['sei'],
          scrubPrefixes: ['gs_'],
        },
        'uk',
        ctx,
      );
      expect(navigate).toHaveBeenCalledTimes(1);
      const target = new URL(navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.has('sei')).toBe(false);
      expect(target.searchParams.has('gs_lp')).toBe(false);
    });

    it('derives each rewrite solely from the current URL — no cross-call memory', () => {
      // Two consecutive queries through the SAME strategy object: nothing
      // from the first URL (its query, its scrubbed token) may leak into the
      // second rewrite. Guards against the strategy ever accumulating state
      // across navigations, so a user changing their query can never inherit
      // stale params from the previous one.
      const strategy: LangStrategy = {
        type: 'searchParams',
        params: [{ name: 'hl' }],
        scrubPrefixes: ['gs_'],
      };
      const first = makeContext('https://www.google.com/search?q=first&gs_lp=TokenA');
      applyStrategy(strategy, 'uk', first.ctx);
      const second = makeContext('https://www.google.com/search?q=second');
      applyStrategy(strategy, 'uk', second.ctx);
      expect(second.navigate).toHaveBeenCalledTimes(1);
      const target = new URL(second.navigate.mock.calls[0]![0] as string);
      expect(target.searchParams.get('q')).toBe('second');
      expect([...target.searchParams.keys()].toSorted()).toEqual(['hl', 'q']);
      expect(target.toString()).not.toContain('TokenA');
    });
  });
});
