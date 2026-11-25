import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSessionMap, writeSessionMap } from './session-map';

const KEY = 'movar:test-map';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readSessionMap', () => {
  it('returns {} when the key is absent', () => {
    expect(readSessionMap(KEY)).toEqual({});
  });

  it('returns {} for an empty string', () => {
    sessionStorage.setItem(KEY, '');
    expect(readSessionMap(KEY)).toEqual({});
  });

  it('returns {} for corrupt JSON', () => {
    sessionStorage.setItem(KEY, '{not json');
    expect(readSessionMap(KEY)).toEqual({});
  });

  it.each(['null', '[1,2]', '"str"', '42', 'true'])('returns {} for non-object JSON %s', (raw) => {
    sessionStorage.setItem(KEY, raw);
    expect(readSessionMap(KEY)).toEqual({});
  });

  it('returns {} when the store throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readSessionMap(KEY)).toEqual({});
  });

  it('returns the parsed host map', () => {
    sessionStorage.setItem(KEY, JSON.stringify({ 'example.com': { lang: 'uk' } }));
    expect(readSessionMap(KEY)).toEqual({ 'example.com': { lang: 'uk' } });
  });
});

describe('writeSessionMap', () => {
  it('round-trips through readSessionMap', () => {
    writeSessionMap(KEY, { 'a.com': 1, 'b.com': 2 });
    expect(sessionStorage.getItem(KEY)).toBe('{"a.com":1,"b.com":2}');
    expect(readSessionMap(KEY)).toEqual({ 'a.com': 1, 'b.com': 2 });
  });

  it('overwrites the previous value', () => {
    writeSessionMap(KEY, { old: true });
    writeSessionMap(KEY, { next: true });
    expect(readSessionMap(KEY)).toEqual({ next: true });
  });

  it('swallows a store that throws on write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => {
      writeSessionMap(KEY, { a: 1 });
    }).not.toThrow();
  });
});
