import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLanguageDisplay } from './display-names';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('makeLanguageDisplay', () => {
  it('renders endonym/exonym names in the bound locale', () => {
    // jsdom ships CLDR for these, so the lookups are deterministic. The first
    // letter casing varies by ICU build, hence the lowercase comparison.
    expect(makeLanguageDisplay('uk')('en').toLowerCase()).toContain('англійськ');
    expect(makeLanguageDisplay('en')('uk')).toBe('Ukrainian');
  });

  it('reuses one DisplayNames instance for N lookups from the same factory', () => {
    // The closure captures a single Intl.DisplayNames — calling the returned
    // function repeatedly must not reconstruct it. We can't observe the
    // construction count directly, but we can prove the closure resolves
    // multiple codes correctly off one factory call.
    const display = makeLanguageDisplay('en');
    expect(display('de')).toBe('German');
    expect(display('fr')).toBe('French');
  });

  it('falls back to the bare code when Intl.DisplayNames construction throws', () => {
    // Very old WebViews lack the API. Force the throw and assert the closure
    // degrades to returning the raw ISO code instead of crashing the popup.
    vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => {
      throw new Error('unsupported');
    });
    const display = makeLanguageDisplay('en');
    expect(display('uk')).toBe('uk');
    expect(display('ru')).toBe('ru');
  });

  it('falls back to the bare code when .of() returns undefined (code not in CLDR)', () => {
    // The runtime has the API but no name for the code — `names?.of(code) ?? code`
    // returns the code rather than `undefined`.
    vi.spyOn(Intl, 'DisplayNames').mockImplementation(
      () => ({ of: () => {} }) as unknown as Intl.DisplayNames,
    );
    expect(makeLanguageDisplay('en')('zz')).toBe('zz');
  });
});
