import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPickerChoice, getPickerChoice, recordPickerChoice } from './session-choice';
import { SUPPRESSION_TTL_MS } from './time';

const STORAGE_KEY = 'movar:pickerChoice';

beforeEach(() => {
  sessionStorage.clear();
});

describe('session-choice — record/read', () => {
  it('returns null for an untouched host', () => {
    expect(getPickerChoice('example.com')).toBeNull();
  });

  it('round-trips a recorded choice', () => {
    recordPickerChoice('example.com', 'ru');
    expect(getPickerChoice('example.com')).toBe('ru');
  });

  it('scopes choices per host', () => {
    recordPickerChoice('shop.example.com', 'ru');
    recordPickerChoice('help.example.com', 'en');
    expect(getPickerChoice('shop.example.com')).toBe('ru');
    expect(getPickerChoice('help.example.com')).toBe('en');
    expect(getPickerChoice('example.com')).toBeNull();
  });

  it('most-recent click wins on the same host', () => {
    recordPickerChoice('example.com', 'ru');
    recordPickerChoice('example.com', 'en');
    expect(getPickerChoice('example.com')).toBe('en');
  });

  it('clear drops the choice for one host without affecting others', () => {
    recordPickerChoice('a.example.com', 'ru');
    recordPickerChoice('b.example.com', 'en');
    clearPickerChoice('a.example.com');
    expect(getPickerChoice('a.example.com')).toBeNull();
    expect(getPickerChoice('b.example.com')).toBe('en');
  });
});

describe('session-choice — normalization at the boundary', () => {
  it('normalizes BCP47 aliases (`ua` → `uk`) on read', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 'example.com': 'ua' }));
    expect(getPickerChoice('example.com')).toBe('uk');
  });

  it('returns null for unknown codes', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 'example.com': 'zzz' }));
    expect(getPickerChoice('example.com')).toBeNull();
  });
});

describe('session-choice — persists migrated legacy entries (issue #304)', () => {
  it('writes a normalized {lang,ts} shape back to storage on first read of a legacy bare string', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 'example.com': 'ru' }));
    getPickerChoice('example.com'); // read-only call — should migrate AND persist as a side effect
    const raw = sessionStorage.getItem(STORAGE_KEY) ?? '';
    expect(JSON.parse(raw)).toEqual({ 'example.com': { lang: 'ru', ts: expect.any(Number) } });
  });

  it('does not re-write storage on a normal already-new-format read', () => {
    recordPickerChoice('example.com', 'ru');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    getPickerChoice('example.com');
    expect(setItemSpy).not.toHaveBeenCalled();
    setItemSpy.mockRestore();
  });

  it('a migrated legacy choice now expires after SUPPRESSION_TTL_MS instead of pinning the host forever', () => {
    vi.useFakeTimers();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 'example.com': 'ru' }));
      // First read migrates the legacy shape and persists a fixed timestamp.
      expect(getPickerChoice('example.com')).toBe('ru');
      // Pre-fix, `ts` was recomputed as `now` on every read (the bare-string
      // branch always re-stamps), so the pick would never expire and would
      // pin the host to 'ru' forever.
      vi.advanceTimersByTime(SUPPRESSION_TTL_MS);
      expect(getPickerChoice('example.com')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('session-choice — malformed storage', () => {
  it('returns null on invalid JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, '[not json');
    expect(getPickerChoice('example.com')).toBeNull();
  });

  it('returns null when storage holds an array, not an object', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(['uk']));
    expect(getPickerChoice('example.com')).toBeNull();
  });

  it('skips non-string entries in an otherwise valid map', () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'a.example.com': 42, 'b.example.com': 'ru' }),
    );
    expect(getPickerChoice('a.example.com')).toBeNull();
    expect(getPickerChoice('b.example.com')).toBe('ru');
  });
});

describe('session-choice — TTL expiry (never a permanent block)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps a choice within the TTL window', () => {
    recordPickerChoice('example.com', 'ru');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS - 1);
    expect(getPickerChoice('example.com')).toBe('ru');
  });

  it('drops a choice once the TTL elapses, so Movar re-asserts', () => {
    recordPickerChoice('example.com', 'ru');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS);
    expect(getPickerChoice('example.com')).toBeNull();
  });

  it('a fresh click within the window resets the clock', () => {
    recordPickerChoice('example.com', 'ru');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS - 1);
    recordPickerChoice('example.com', 'ru');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS - 1);
    expect(getPickerChoice('example.com')).toBe('ru');
  });
});
