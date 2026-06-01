import { beforeEach, describe, expect, it } from 'vitest';
import { clearPickerChoice, getPickerChoice, recordPickerChoice } from './session-choice';

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
