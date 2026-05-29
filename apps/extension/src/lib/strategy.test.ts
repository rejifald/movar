import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LangStrategy } from '@movar/rules';
import { applyStrategy, type StrategyContext } from './strategy';
import { makeContext } from './strategy.test-utils';

/**
 * Helper for no-op tests: execute strategy and verify no navigation occurred.
 */
function expectNoOp(navigate: ReturnType<typeof vi.fn>, out: ReturnType<typeof applyStrategy>) {
  expect(navigate).not.toHaveBeenCalled();
  expect(out.appliedSteps).toBe(0);
}

/** Default URL the strategy.test.ts cases use when one isn't specified —
 *  matches the previous in-file `makeContext` default. */
const DEFAULT_TEST_URL = 'https://example.com/ru/foo?bar=1';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyStrategy — cookie', () => {
  it('writes the mapped value, default path, max-age, SameSite', () => {
    const { ctx, setCookie } = makeContext(DEFAULT_TEST_URL);
    const out = applyStrategy(
      { type: 'cookie', name: 'lang', values: { uk: 'ua', ru: 'ru' } },
      'uk',
      ctx,
    );
    expect(setCookie).toHaveBeenCalledTimes(1);
    const written = setCookie.mock.calls[0]![0] as string;
    expect(written).toContain('lang=ua');
    expect(written).toContain('path=/');
    expect(written).toContain('max-age=');
    expect(written).toContain('SameSite=Lax');
    expect(out).toEqual({ navigated: false, needsReload: true, appliedSteps: 1 });
  });

  it('falls back to the canonical code when no values map', () => {
    const { ctx, setCookie } = makeContext(DEFAULT_TEST_URL);
    applyStrategy({ type: 'cookie', name: 'lang' }, 'en', ctx);
    expect(setCookie.mock.calls[0]![0] as string).toContain('lang=en');
  });

  it('appends domain when provided', () => {
    const { ctx, setCookie } = makeContext(DEFAULT_TEST_URL);
    applyStrategy({ type: 'cookie', name: 'lang', domain: '.example.com' }, 'uk', ctx);
    expect(setCookie.mock.calls[0]![0] as string).toContain('domain=.example.com');
  });
});

describe('applyStrategy — localStorage', () => {
  it('writes the mapped value', () => {
    const { ctx, setStorage } = makeContext(DEFAULT_TEST_URL);
    applyStrategy({ type: 'localStorage', key: 'i18n', values: { uk: 'uk_UA' } }, 'uk', ctx);
    expect(setStorage).toHaveBeenCalledWith('i18n', 'uk_UA');
  });
});

describe('applyStrategy — pathSegment', () => {
  it('replaces the first path segment by default', () => {
    const { ctx, navigate } = makeContext('https://example.com/ru/foo');
    applyStrategy({ type: 'pathSegment', values: { uk: 'ua', ru: 'ru' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/ua/foo');
  });

  it('respects a non-zero index', () => {
    const { ctx, navigate } = makeContext('https://example.com/store/ru/foo');
    applyStrategy({ type: 'pathSegment', index: 1, values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/store/ua/foo');
  });

  it('inserts a new segment when the existing one is not a language code', () => {
    const { ctx, navigate } = makeContext('https://example.com/error404.htm');
    applyStrategy({ type: 'pathSegment', values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/ua/error404.htm');
  });

  it('inserts when the path is just "/"', () => {
    const { ctx, navigate } = makeContext('https://example.com/');
    applyStrategy({ type: 'pathSegment', values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/ua/');
  });

  it('inserts (does not overwrite) at a non-zero index past a non-lang prefix', () => {
    const { ctx, navigate } = makeContext('https://example.com/store/product123');
    applyStrategy({ type: 'pathSegment', index: 1, values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/store/ua/product123');
  });
});

describe('applyStrategy — hreflang', () => {
  it('navigates to the link whose hreflang matches the target', () => {
    const { ctx, navigate } = makeContext('https://example.com/error404.htm', {
      hreflangs: [
        { hreflang: 'ru', href: 'https://example.com/error404.htm' },
        { hreflang: 'uk', href: 'https://example.com/ua/error404.htm' },
        { hreflang: 'x-default', href: 'https://example.com/ua/error404.htm' },
      ],
    });
    const out = applyStrategy({ type: 'hreflang' }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/ua/error404.htm');
    expect(out).toEqual({ navigated: true, needsReload: false, appliedSteps: 1 });
  });

  it('honors hreflang BCP47 region suffixes (en-US matches en)', () => {
    const { ctx, navigate } = makeContext('https://example.com/', {
      hreflangs: [{ hreflang: 'en-US', href: 'https://example.com/en/' }],
    });
    applyStrategy({ type: 'hreflang' }, 'en', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/en/');
  });

  it('is a no-op when no hreflang link matches the target', () => {
    const { ctx, navigate } = makeContext('https://example.com/', {
      hreflangs: [{ hreflang: 'ru', href: 'https://example.com/' }],
    });
    const out = applyStrategy({ type: 'hreflang' }, 'uk', ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(out).toEqual({ navigated: false, needsReload: false, appliedSteps: 0 });
  });

  it('is a no-op when the matching hreflang link is the current URL', () => {
    const { ctx, navigate } = makeContext('https://example.com/ua/foo', {
      hreflangs: [
        { hreflang: 'uk', href: 'https://example.com/ua/foo' },
        { hreflang: 'ru', href: 'https://example.com/foo' },
      ],
    });
    const out = applyStrategy({ type: 'hreflang' }, 'uk', ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });
});

describe('applyStrategy — self-navigation guard', () => {
  it('pathSegment is a no-op when the rewritten URL equals the current URL', () => {
    const { ctx, navigate } = makeContext('https://example.com/ua/foo');
    const out = applyStrategy({ type: 'pathSegment', values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('query is a no-op when the param is already at the target value', () => {
    const { ctx, navigate } = makeContext('https://example.com/?lang=ua');
    const out = applyStrategy({ type: 'query', param: 'lang', values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).not.toHaveBeenCalled();
    expect(out.appliedSteps).toBe(0);
  });

  it('subdomain is a no-op when the host is already at the target label', () => {
    const { ctx, navigate } = makeContext('https://ua.example.com/');
    const out = applyStrategy({ type: 'subdomain', values: { uk: 'ua' } }, 'uk', ctx);
    expectNoOp(navigate, out);
  });
});

describe('applyStrategy — subdomain', () => {
  it('replaces the leftmost host label', () => {
    const { ctx, navigate } = makeContext('https://ru.example.com/foo');
    applyStrategy({ type: 'subdomain', values: { uk: 'ua', ru: 'ru' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://ua.example.com/foo');
  });
});

describe('applyStrategy — query', () => {
  it('adds or replaces the query parameter', () => {
    const { ctx, navigate } = makeContext('https://example.com/?lang=ru');
    applyStrategy({ type: 'query', param: 'lang', values: { uk: 'ua' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/?lang=ua');
  });
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
});

describe('applyStrategy — click', () => {
  it('reports navigated when the selector matches', () => {
    const { ctx } = makeContext(DEFAULT_TEST_URL);
    const out = applyStrategy({ type: 'click', selector: 'a.lang-uk' }, 'uk', ctx);
    expect(out.navigated).toBe(true);
    expect(out.appliedSteps).toBe(1);
  });

  it('reports no-op when the selector does not match', () => {
    const { ctx, clickSelector } = makeContext(DEFAULT_TEST_URL);
    clickSelector.mockReturnValueOnce(false);
    const out = applyStrategy({ type: 'click', selector: 'a.lang-uk' }, 'uk', ctx);
    expect(out.navigated).toBe(false);
    expect(out.appliedSteps).toBe(0);
  });
});

describe('applyStrategy — error safety', () => {
  it('does not throw when setStorage throws (quota exceeded)', () => {
    const { ctx } = makeContext(DEFAULT_TEST_URL, {
      setStorageThrows: new DOMException('Quota exceeded', 'QuotaExceededError'),
    });
    expect(() =>
      applyStrategy({ type: 'localStorage', key: 'i18n', values: { uk: 'uk' } }, 'uk', ctx),
    ).not.toThrow();
  });

  it('reports appliedSteps=0 when setStorage throws', () => {
    const { ctx } = makeContext(DEFAULT_TEST_URL, {
      setStorageThrows: new Error('disabled'),
    });
    const out = applyStrategy({ type: 'localStorage', key: 'i18n' }, 'uk', ctx);
    expect(out.appliedSteps).toBe(0);
    expect(out.needsReload).toBe(false);
  });

  it('does not throw when setCookie throws (sandboxed iframe)', () => {
    const { ctx } = makeContext(DEFAULT_TEST_URL, {
      setCookieThrows: new Error('blocked by browser'),
    });
    expect(() =>
      applyStrategy({ type: 'cookie', name: 'lang', values: { uk: 'ua' } }, 'uk', ctx),
    ).not.toThrow();
  });

  it('reports appliedSteps=0 when setCookie throws', () => {
    const { ctx } = makeContext(DEFAULT_TEST_URL, {
      setCookieThrows: new Error('blocked'),
    });
    const out = applyStrategy({ type: 'cookie', name: 'lang' }, 'uk', ctx);
    expect(out.appliedSteps).toBe(0);
  });
});

describe('applyStrategy — subdomain edge cases', () => {
  it('is a no-op for 2-label hosts (does not overwrite the apex)', () => {
    // example.com has no language subdomain to replace — rewriting the first
    // label produces 'ua.com', which is a different (broken) URL.
    const { ctx, navigate } = makeContext('https://example.com/foo');
    const out = applyStrategy({ type: 'subdomain', values: { uk: 'ua' } }, 'uk', ctx);
    expectNoOp(navigate, out);
  });

  it('handles eTLD+1 with multi-part TLD (example.co.uk)', () => {
    // 'example.co.uk' is a registrable domain — overwriting `example` produces
    // 'ua.co.uk', also broken.
    const { ctx, navigate } = makeContext('https://example.co.uk/foo');
    const out = applyStrategy({ type: 'subdomain', values: { uk: 'ua' } }, 'uk', ctx);
    expectNoOp(navigate, out);
  });

  it('replaces the existing language subdomain on a multi-part TLD host', () => {
    // ru.example.co.uk → ua.example.co.uk (legitimate rewrite)
    const { ctx, navigate } = makeContext('https://ru.example.co.uk/foo');
    applyStrategy({ type: 'subdomain', values: { uk: 'ua', ru: 'ru' } }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://ua.example.co.uk/foo');
  });
});

describe('applyStrategy — hreflang region preference', () => {
  it('prefers a fully-qualified BCP47 match over a region-only match', () => {
    // Multiple en-* alternates; if the user's full priority hints en-GB,
    // we should prefer that over en-US.
    const { ctx, navigate } = makeContext('https://example.com/', {
      hreflangs: [
        { hreflang: 'en-US', href: 'https://example.com/en-us/' },
        { hreflang: 'en-GB', href: 'https://example.com/en-gb/' },
        { hreflang: 'en-AU', href: 'https://example.com/en-au/' },
      ],
    });
    const strategy: LangStrategy = { type: 'hreflang', region: 'GB' };
    applyStrategy(strategy, 'en', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/en-gb/');
  });

  it('falls back to any en-* match when the preferred region is absent', () => {
    const { ctx, navigate } = makeContext('https://example.com/', {
      hreflangs: [{ hreflang: 'en-US', href: 'https://example.com/en-us/' }],
    });
    const strategy: LangStrategy = { type: 'hreflang', region: 'GB' };
    applyStrategy(strategy, 'en', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/en-us/');
  });

  it('treats x-default hreflang as a fallback target', () => {
    // x-default is the publisher's hint for "no language matched" —
    // currently we skip it. If no targeted match exists, it should be used.
    const { ctx, navigate } = makeContext('https://example.com/ru/', {
      hreflangs: [
        { hreflang: 'ru', href: 'https://example.com/ru/' },
        { hreflang: 'x-default', href: 'https://example.com/' },
      ],
    });
    applyStrategy({ type: 'hreflang' }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/');
  });

  it('targeted match beats x-default when both are present', () => {
    // Mirror of the test above: with `uk` available AND `x-default`, the
    // targeted match wins. Pins the rank ordering — a refactor that
    // accidentally normalised x-default to rank 0 would silently prefer
    // it for every target.
    const { ctx, navigate } = makeContext('https://example.com/', {
      hreflangs: [
        { hreflang: 'uk', href: 'https://example.com/ua/' },
        { hreflang: 'x-default', href: 'https://example.com/' },
      ],
    });
    applyStrategy({ type: 'hreflang' }, 'uk', ctx);
    expect(navigate).toHaveBeenCalledWith('https://example.com/ua/');
  });
});

describe('applyStrategy — compound', () => {
  it('writes before navigating, in that order', () => {
    const order: string[] = [];
    const ctx: StrategyContext = {
      getUrl: () => new URL('https://example.com/ru/foo'),
      navigate: vi.fn(() => order.push('navigate')),
      reload: vi.fn(),
      getCookie: () => '',
      setCookie: vi.fn(() => order.push('cookie')),
      getStorage: () => null,
      setStorage: vi.fn(() => order.push('storage')),
      clickSelector: vi.fn(() => true),
      getHreflangLinks: () => [],
    };
    const strategy: LangStrategy = {
      type: 'compound',
      steps: [
        { type: 'pathSegment', values: { uk: 'ua' } },
        { type: 'cookie', name: 'lang', values: { uk: 'ua' } },
        { type: 'localStorage', key: 'i18n' },
      ],
    };
    const out = applyStrategy(strategy, 'uk', ctx);
    expect(order).toEqual(['cookie', 'storage', 'navigate']);
    expect(out).toEqual({ navigated: true, needsReload: true, appliedSteps: 3 });
  });

  it('only navigates once when multiple navigate-class steps are present', () => {
    const { ctx, navigate } = makeContext('https://example.com/ru');
    applyStrategy(
      {
        type: 'compound',
        steps: [
          { type: 'pathSegment', values: { uk: 'ua' } },
          { type: 'query', param: 'lang', values: { uk: 'ua' } },
        ],
      },
      'uk',
      ctx,
    );
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('flattens nested compounds', () => {
    const { ctx, setCookie, setStorage, navigate } = makeContext('https://example.com/ru');
    applyStrategy(
      {
        type: 'compound',
        steps: [
          {
            type: 'compound',
            steps: [
              { type: 'cookie', name: 'lang' },
              { type: 'localStorage', key: 'i18n' },
            ],
          },
          { type: 'pathSegment', values: { uk: 'ua' } },
        ],
      },
      'uk',
      ctx,
    );
    expect(setCookie).toHaveBeenCalledTimes(1);
    expect(setStorage).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
