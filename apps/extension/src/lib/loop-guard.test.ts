import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAttempt,
  getAttemptedUrls,
  hasAttemptedNavTo,
  markAttempt,
  recentlyAttemptedHere,
} from './loop-guard';

const URL_A = 'https://example.com/uk/foo';
const URL_B = 'https://example.com/en/foo';
const URL_C = 'https://example.com/foo';
const ATTEMPT_KEY = 'movar:redirectedFrom';
const LEGACY_BINARY_KEY = 'movar:redirected';

beforeEach(() => {
  sessionStorage.clear();
});

describe('loop-guard — single attempt', () => {
  it('returns true on the URL we marked, false elsewhere', () => {
    markAttempt(URL_A);
    expect(recentlyAttemptedHere(URL_A)).toBe(true);
    expect(recentlyAttemptedHere(URL_B)).toBe(false);
  });

  it('hasAttemptedNavTo reads the same set', () => {
    markAttempt(URL_A);
    expect(hasAttemptedNavTo(URL_A)).toBe(true);
    expect(hasAttemptedNavTo(URL_B)).toBe(false);
  });
});

describe('loop-guard — multi-URL oscillation (spizhenko.clinic case)', () => {
  it('catches A → B → A bouncing on the third visit', () => {
    // First load at A: not yet seen.
    expect(recentlyAttemptedHere(URL_A)).toBe(false);
    markAttempt(URL_A);
    // Redirect lands at B: not yet seen.
    expect(recentlyAttemptedHere(URL_B)).toBe(false);
    markAttempt(URL_B);
    // Redirect bounces back to A: SHOULD trip the guard.
    expect(recentlyAttemptedHere(URL_A)).toBe(true);
  });

  it('blocks navigation to a previously attempted-from URL', () => {
    markAttempt(URL_A);
    // From B, the hreflang would point at A — pre-check refuses it.
    expect(hasAttemptedNavTo(URL_A)).toBe(true);
    expect(hasAttemptedNavTo(URL_C)).toBe(false);
  });

  it('handles three-way cycles too', () => {
    markAttempt(URL_A);
    markAttempt(URL_B);
    markAttempt(URL_C);
    expect(recentlyAttemptedHere(URL_A)).toBe(true);
    expect(recentlyAttemptedHere(URL_B)).toBe(true);
    expect(recentlyAttemptedHere(URL_C)).toBe(true);
  });
});

describe('loop-guard — bounds and dedup', () => {
  it('does not duplicate the same URL', () => {
    markAttempt(URL_A);
    markAttempt(URL_A);
    expect(getAttemptedUrls()).toEqual([URL_A]);
  });

  it('caps the history at 8 entries (FIFO eviction)', () => {
    for (let i = 0; i < 12; i++) {
      markAttempt(`https://example.com/p${i}`);
    }
    const urls = getAttemptedUrls();
    expect(urls.length).toBe(8);
    // The earliest entries dropped out.
    expect(urls).not.toContain('https://example.com/p0');
    expect(urls).toContain('https://example.com/p11');
  });
});

describe('loop-guard — clear', () => {
  it('drops the whole history', () => {
    markAttempt(URL_A);
    markAttempt(URL_B);
    clearAttempt();
    expect(getAttemptedUrls()).toEqual([]);
    expect(recentlyAttemptedHere(URL_A)).toBe(false);
  });

  it('also sweeps the legacy binary flag from older builds', () => {
    sessionStorage.setItem(LEGACY_BINARY_KEY, '1');
    clearAttempt();
    expect(sessionStorage.getItem(LEGACY_BINARY_KEY)).toBeNull();
  });
});

describe('loop-guard — legacy single-URL format migration', () => {
  it('reads a bare URL string written by older builds', () => {
    sessionStorage.setItem(ATTEMPT_KEY, URL_A);
    expect(getAttemptedUrls()).toEqual([URL_A]);
    expect(recentlyAttemptedHere(URL_A)).toBe(true);
  });

  it('appending to legacy data upgrades the format to JSON', () => {
    sessionStorage.setItem(ATTEMPT_KEY, URL_A);
    markAttempt(URL_B);
    const raw = sessionStorage.getItem(ATTEMPT_KEY) ?? '';
    expect(raw.startsWith('[')).toBe(true);
    expect(getAttemptedUrls()).toEqual([URL_A, URL_B]);
  });
});

describe('loop-guard — malformed storage', () => {
  it('returns [] on invalid JSON', () => {
    sessionStorage.setItem(ATTEMPT_KEY, '[not json');
    expect(getAttemptedUrls()).toEqual([]);
  });

  it('filters out non-string entries from an otherwise valid array', () => {
    sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify([URL_A, 42, URL_B, null]));
    expect(getAttemptedUrls()).toEqual([URL_A, URL_B]);
  });
});
