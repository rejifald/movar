import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isGateSatisfied, markGateSatisfied } from './gate-latch';
import { SUPPRESSION_TTL_MS } from './time';

const STORAGE_KEY = 'movar:gateSatisfied';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('gate-latch — record/read', () => {
  it('reports an untouched host as unlatched', () => {
    expect(isGateSatisfied('example.com')).toBe(false);
  });

  it('round-trips a latch and reports that it stuck', () => {
    expect(markGateSatisfied('example.com')).toBe(true);
    expect(isGateSatisfied('example.com')).toBe(true);
  });

  it('scopes the latch per host', () => {
    markGateSatisfied('shop.example.com');
    expect(isGateSatisfied('shop.example.com')).toBe(true);
    expect(isGateSatisfied('help.example.com')).toBe(false);
  });

  it('survives a second latch on another host', () => {
    markGateSatisfied('a.example.com');
    markGateSatisfied('b.example.com');
    expect(isGateSatisfied('a.example.com')).toBe(true);
    expect(isGateSatisfied('b.example.com')).toBe(true);
  });
});

describe('gate-latch — expiry', () => {
  it('drops an entry past SUPPRESSION_TTL_MS', () => {
    vi.useFakeTimers();
    markGateSatisfied('example.com');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS + 1);
    expect(isGateSatisfied('example.com')).toBe(false);
  });

  it('keeps an entry just inside the window', () => {
    vi.useFakeTimers();
    markGateSatisfied('example.com');
    vi.advanceTimersByTime(SUPPRESSION_TTL_MS - 1);
    expect(isGateSatisfied('example.com')).toBe(true);
  });
});

describe('gate-latch — hostile storage', () => {
  it('reports failure when sessionStorage refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    // The false return is what stops the caller from clicking — without a
    // durable latch, a gate that survives the reload would be clicked forever.
    expect(markGateSatisfied('example.com')).toBe(false);
  });

  it('reports unlatched when sessionStorage refuses reads', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(isGateSatisfied('example.com')).toBe(false);
  });

  it('ignores a corrupt blob rather than throwing', () => {
    sessionStorage.setItem(STORAGE_KEY, '{not json');
    expect(isGateSatisfied('example.com')).toBe(false);
    expect(markGateSatisfied('example.com')).toBe(true);
  });

  it('ignores a non-object blob', () => {
    sessionStorage.setItem(STORAGE_KEY, '["example.com"]');
    expect(isGateSatisfied('example.com')).toBe(false);
  });

  it('ignores an entry whose timestamp is not a number', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 'example.com': 'yesterday' }));
    expect(isGateSatisfied('example.com')).toBe(false);
  });
});
