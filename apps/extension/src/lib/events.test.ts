import { describe, expect, it } from 'vitest';
import type { CorrectionEvent } from '@movar/shared';
import { __internal } from './events';

const { prune, EVENT_TTL_MS, MAX_EVENTS } = __internal;

function event(timestamp: number): CorrectionEvent {
  return {
    timestamp,
    domain: 'example.com',
    mechanism: 'cookie',
    fromLang: 'ru',
    toLang: 'uk',
  };
}

describe('events prune', () => {
  const NOW = 1_700_000_000_000;

  it('keeps events younger than the TTL', () => {
    const events = [event(NOW - 100), event(NOW - 1000)];
    expect(prune(events, NOW)).toHaveLength(2);
  });

  it('drops events older than the TTL', () => {
    const events = [
      event(NOW - EVENT_TTL_MS - 1), // just over the floor
      event(NOW - 1000),
    ];
    const result = prune(events, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp).toBe(NOW - 1000);
  });

  it('keeps an event landing exactly at the TTL cutoff', () => {
    // Inclusive at the floor — `>= cutoff` not `> cutoff`.
    const events = [event(NOW - EVENT_TTL_MS)];
    expect(prune(events, NOW)).toHaveLength(1);
  });

  it('respects MAX_EVENTS even when all are within the TTL', () => {
    const events = Array.from({ length: MAX_EVENTS + 50 }, (_, i) => event(NOW - i));
    const result = prune(events, NOW);
    expect(result).toHaveLength(MAX_EVENTS);
  });

  it('keeps the newest entries when both axes prune', () => {
    // Mix: 5 stale entries followed by MAX_EVENTS + 3 fresh ones — TTL drops
    // the stale, cap drops the oldest fresh.
    const events: CorrectionEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(event(NOW - EVENT_TTL_MS - 1000));
    for (let i = MAX_EVENTS + 3; i > 0; i--) events.push(event(NOW - i));
    const result = prune(events, NOW);
    expect(result).toHaveLength(MAX_EVENTS);
    expect(result.at(-1)!.timestamp).toBe(NOW - 1);
  });

  it('returns a new array (does not mutate input)', () => {
    const events = [event(NOW)];
    const result = prune(events, NOW);
    expect(result).not.toBe(events);
  });
});
