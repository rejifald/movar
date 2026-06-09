import { describe, expect, it } from 'vitest';
import type { CorrectionEvent } from '@movar/events';
import { __internal, logCorrection, logCorrections } from './events';

const { prune, getEvents, EVENT_TTL_MS, MAX_EVENTS } = __internal;

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

// Storage isn't reset between tests, so assert on the DELTA rather than absolute
// counts (the cap test, which IS absolute, runs last).
const count = async (): Promise<number> => (await getEvents()).length;

describe('logCorrections', () => {
  it('appends a whole batch in one write', async () => {
    const before = await count();
    await logCorrections([event(Date.now()), event(Date.now())]);
    expect(await count()).toBe(before + 2);
  });

  it('is a no-op for an empty batch', async () => {
    const before = await count();
    await logCorrections([]);
    expect(await count()).toBe(before);
  });

  it('appends without clobbering existing events', async () => {
    const before = await count();
    await logCorrections([event(Date.now())]);
    await logCorrections([event(Date.now()), event(Date.now())]);
    expect(await count()).toBe(before + 3);
  });

  it('logCorrection logs a single event via the batch path', async () => {
    const before = await count();
    await logCorrection(event(Date.now()));
    expect(await count()).toBe(before + 1);
  });

  it('caps the stored log at MAX_EVENTS', async () => {
    const now = Date.now();
    await logCorrections(Array.from({ length: MAX_EVENTS + 10 }, (_, i) => event(now - i)));
    expect(await count()).toBe(MAX_EVENTS);
  });
});
