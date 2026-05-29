import { vi } from 'vitest';
import type { HreflangLink, StrategyContext } from './strategy';

export interface MakeContextOptions {
  /** Seed <link rel=alternate hreflang> entries returned from `getHreflangLinks`. */
  hreflangs?: HreflangLink[];
  /** When set, `setStorage` throws this error every call. Used by the
   *  error-safety tests to drive the catch path without inline casts. */
  setStorageThrows?: Error;
  /** When set, `setCookie` throws this error every call. */
  setCookieThrows?: Error;
}

export interface MockContext {
  ctx: StrategyContext;
  navigate: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  setCookie: ReturnType<typeof vi.fn>;
  setStorage: ReturnType<typeof vi.fn>;
  clickSelector: ReturnType<typeof vi.fn>;
}

/**
 * Build a mock {@link StrategyContext} for strategy unit tests. The URL is
 * mutable: a `navigate(next)` call updates what subsequent `getUrl()` reads,
 * so a compound strategy that navigates then reads stays consistent. Defaults
 * are no-op spies; pass `options` to drive the error-safety paths or seed
 * hreflangs without casting.
 */
export function makeContext(initialUrl: string, options: MakeContextOptions = {}): MockContext {
  const { hreflangs = [], setStorageThrows, setCookieThrows } = options;

  let url = initialUrl;
  const navigate = vi.fn((next: string) => {
    url = next;
  });
  const reload = vi.fn();
  const setCookie = vi.fn(() => {
    if (setCookieThrows) throw setCookieThrows;
  });
  const setStorage = vi.fn(() => {
    if (setStorageThrows) throw setStorageThrows;
  });
  const clickSelector = vi.fn(() => true);

  const ctx: StrategyContext = {
    getUrl: () => new URL(url),
    navigate,
    reload,
    getCookie: () => '',
    setCookie,
    getStorage: () => null,
    setStorage,
    clickSelector,
    getHreflangLinks: () => hreflangs,
  };

  return { ctx, navigate, reload, setCookie, setStorage, clickSelector };
}
