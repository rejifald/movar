import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectPageMode,
  modeFromColorSchemeAttr,
  modeFromColorSchemeMeta,
  modeFromComputedBackground,
  modeFromPrefersColorScheme,
} from './detect';

/** Build a minimally-configured Window-shaped object whose `matchMedia`
 *  answers prefers-color-scheme deterministically and whose
 *  `getComputedStyle` delegates to the real window's implementation (jsdom
 *  evaluates inline `style` attributes for backgroundColor and colorScheme).
 */
function fakeWin(opts: { prefersDark?: boolean; noMatchMedia?: boolean } = {}): Window {
  const w = {
    matchMedia: opts.noMatchMedia
      ? undefined
      : (query: string): MediaQueryList => {
          const matches = query.includes('prefers-color-scheme: dark') && opts.prefersDark === true;
          return {
            matches,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          } as unknown as MediaQueryList;
        },
    getComputedStyle: (el: Element) => globalThis.getComputedStyle(el),
  } as unknown as Window;
  return w;
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('class');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-bs-theme');
  document.documentElement.removeAttribute('data-color-mode');
  document.documentElement.removeAttribute('data-mode');
  document.documentElement.removeAttribute('data-color-scheme');
  document.documentElement.removeAttribute('color-scheme');
  document.documentElement.removeAttribute('dark');
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('class');
  document.body.removeAttribute('data-theme');
  document.body.removeAttribute('style');
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tier 1 — color-scheme attr ──────────────────────────────────────────────

describe('modeFromColorSchemeAttr', () => {
  it('returns "dark" when <html> has data-theme="dark"', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('returns "light" when <html> has data-theme="light"', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(modeFromColorSchemeAttr(document)).toBe('light');
  });

  it('falls through <html> to <body> when only <body> is themed', () => {
    document.body.setAttribute('data-theme', 'dark');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('recognises Bootstrap 5.3 data-bs-theme', () => {
    document.documentElement.setAttribute('data-bs-theme', 'dark');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('recognises GitHub data-color-mode', () => {
    document.documentElement.setAttribute('data-color-mode', 'dark');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('recognises a Tailwind-style "dark" class token', () => {
    document.documentElement.className = 'dark some-other-class';
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('matches class tokens, not substrings (does not false-positive "darken")', () => {
    document.documentElement.className = 'darken-bg';
    expect(modeFromColorSchemeAttr(document)).toBeNull();
  });

  it('recognises the bare "dark" attribute (YouTube)', () => {
    document.documentElement.setAttribute('dark', '');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('returns null for "auto" / "system" values (defers to next tier)', () => {
    document.documentElement.setAttribute('data-theme', 'auto');
    expect(modeFromColorSchemeAttr(document)).toBeNull();
    document.documentElement.setAttribute('data-theme', 'system');
    expect(modeFromColorSchemeAttr(document)).toBeNull();
  });

  it('is case-insensitive on attribute values', () => {
    document.documentElement.setAttribute('data-theme', 'DARK');
    expect(modeFromColorSchemeAttr(document)).toBe('dark');
  });

  it('returns null when no theme attribute is present', () => {
    expect(modeFromColorSchemeAttr(document)).toBeNull();
  });
});

// ─── Tier 2 — meta color-scheme + computed CSS ───────────────────────────────

describe('modeFromColorSchemeMeta', () => {
  it('returns "dark" for <meta name="color-scheme" content="dark">', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="dark">';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBe('dark');
  });

  it('returns null when meta declares "light dark" (no preference)', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="light dark">';
    // Some sites also set the computed style; clear it to isolate this tier.
    document.documentElement.style.colorScheme = '';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBeNull();
  });

  it('handles "only dark"', () => {
    document.head.innerHTML = '<meta name="color-scheme" content="only dark">';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBe('dark');
  });

  it('falls back to computed CSS color-scheme when no meta', () => {
    document.documentElement.style.colorScheme = 'dark';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBe('dark');
  });

  it('returns null when neither meta nor CSS sets color-scheme', () => {
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBeNull();
  });

  it('is case-insensitive on the meta name attribute', () => {
    document.head.innerHTML = '<meta name="Color-Scheme" content="dark">';
    expect(modeFromColorSchemeMeta(document, fakeWin())).toBe('dark');
  });
});

// ─── Tier 3 — computed background luminance ─────────────────────────────────

describe('modeFromComputedBackground', () => {
  it('returns "dark" for a black body background', () => {
    document.body.style.backgroundColor = 'rgb(0, 0, 0)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('dark');
  });

  it('returns "light" for a white body background', () => {
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('light');
  });

  it('classifies a near-black (#111) as dark', () => {
    document.body.style.backgroundColor = 'rgb(17, 17, 17)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('dark');
  });

  it('classifies an off-white (#f9fafb) as light', () => {
    document.body.style.backgroundColor = 'rgb(249, 250, 251)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('light');
  });

  it('falls through transparent body to <html> background', () => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    document.documentElement.style.backgroundColor = 'rgb(20, 20, 20)';
    expect(modeFromComputedBackground(document, fakeWin())).toBe('dark');
  });

  it('returns null when both body and html are transparent', () => {
    document.body.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    document.documentElement.style.backgroundColor = 'rgba(0, 0, 0, 0)';
    expect(modeFromComputedBackground(document, fakeWin())).toBeNull();
  });

  it('does not crash on unusual computed values (currentColor resolves via the engine)', () => {
    // Both browsers and jsdom resolve `currentColor` in getComputedStyle by
    // substituting the computed `color` value as RGB, so the parser sees a
    // valid `rgb(...)` either way. The assertion is just "doesn't throw" —
    // the concrete answer depends on the engine's `color` default.
    document.body.style.backgroundColor = 'currentColor';
    expect(() => modeFromComputedBackground(document, fakeWin())).not.toThrow();
  });
});

// ─── Tier 4 — prefers-color-scheme ──────────────────────────────────────────

describe('modeFromPrefersColorScheme', () => {
  it('returns "dark" when matchMedia reports prefers-color-scheme: dark', () => {
    expect(modeFromPrefersColorScheme(fakeWin({ prefersDark: true }))).toBe('dark');
  });

  it('returns "light" when matchMedia reports the opposite', () => {
    expect(modeFromPrefersColorScheme(fakeWin({ prefersDark: false }))).toBe('light');
  });

  it('returns "light" when matchMedia is unavailable (defensive default)', () => {
    expect(modeFromPrefersColorScheme(fakeWin({ noMatchMedia: true }))).toBe('light');
  });
});

// ─── Full chain ──────────────────────────────────────────────────────────────

describe('detectPageMode — chain priority', () => {
  it('attr beats meta beats computed-bg beats prefers-color-scheme', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.head.innerHTML = '<meta name="color-scheme" content="light">';
    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    expect(detectPageMode(document, fakeWin({ prefersDark: false }))).toBe('dark');
  });

  it('falls through "auto" attr to meta', () => {
    document.documentElement.setAttribute('data-theme', 'auto');
    document.head.innerHTML = '<meta name="color-scheme" content="dark">';
    expect(detectPageMode(document, fakeWin({ prefersDark: false }))).toBe('dark');
  });

  it('falls through unset meta to computed bg', () => {
    document.body.style.backgroundColor = 'rgb(10, 10, 10)';
    expect(detectPageMode(document, fakeWin({ prefersDark: false }))).toBe('dark');
  });

  it('falls all the way through to prefers-color-scheme when nothing else fires', () => {
    expect(detectPageMode(document, fakeWin({ prefersDark: true }))).toBe('dark');
    expect(detectPageMode(document, fakeWin({ prefersDark: false }))).toBe('light');
  });

  it('always returns a non-null PageMode (tier 4 is the floor)', () => {
    const result = detectPageMode(document, fakeWin({ noMatchMedia: true }));
    expect(['light', 'dark']).toContain(result);
  });
});
