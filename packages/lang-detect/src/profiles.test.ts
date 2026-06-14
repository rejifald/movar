import { describe, expect, it } from 'vitest';
import { getProfiles, PROFILES } from './profiles';
import { hasProfile, PROFILED_CODES } from './profile-codes';

describe('PROFILED_CODES', () => {
  it('mirrors the keys of PROFILES exactly (lightweight set must not drift)', () => {
    // PROFILED_CODES is declared by hand (so hasProfile doesn't drag the profile
    // data into the content bundle); this pins it to the real registry.
    expect(PROFILED_CODES).toEqual(new Set(Object.keys(PROFILES)));
  });
});

describe('hasProfile', () => {
  it('is true for every shipped profile (Cyrillic uk/ru/be/bg + en)', () => {
    for (const code of ['uk', 'ru', 'be', 'bg', 'en'] as const) {
      expect(hasProfile(code)).toBe(true);
    }
  });

  it('is false for the Latin diaspora targets we ship no profile for', () => {
    // These are valid redirect-layer targets (#125) but the detector can't tell
    // them apart, so the content filter must not treat them as recognizable.
    for (const code of ['de', 'fr', 'es', 'it', 'pl'] as const) {
      expect(hasProfile(code)).toBe(false);
    }
  });
});

describe('getProfiles', () => {
  it('resolves only the codes with a shipped profile, dropping the rest', () => {
    expect(getProfiles(['uk', 'de', 'ru', 'pl']).length).toBe(2); // de, pl dropped
  });
});
