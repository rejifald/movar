import { afterEach, describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import {
  EVENT_TTL_MS,
  MAX_EVENTS,
  appendCorrectionEventsSerialized,
  getCorrectionEvents,
  logCorrection,
  logCorrections,
  pruneCorrectionEvents,
} from './events';

/** EVENTS_KEY is module-private in events.ts; mirror the literal here (as
 *  InsightsSection.test.tsx does) for the storage-mock concurrency test. */
const EVENTS_KEY = 'movar:events';

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
    expect(pruneCorrectionEvents(events, NOW)).toHaveLength(2);
  });

  it('drops events older than the TTL', () => {
    const events = [
      event(NOW - EVENT_TTL_MS - 1), // just over the floor
      event(NOW - 1000),
    ];
    const result = pruneCorrectionEvents(events, NOW);
    expect(result).toHaveLength(1);
    expect(result[0]!.timestamp).toBe(NOW - 1000);
  });

  it('keeps an event landing exactly at the TTL cutoff', () => {
    // Inclusive at the floor — `>= cutoff` not `> cutoff`.
    const events = [event(NOW - EVENT_TTL_MS)];
    expect(pruneCorrectionEvents(events, NOW)).toHaveLength(1);
  });

  it('respects MAX_EVENTS even when all are within the TTL', () => {
    const events = Array.from({ length: MAX_EVENTS + 50 }, (_, i) => event(NOW - i));
    const result = pruneCorrectionEvents(events, NOW);
    expect(result).toHaveLength(MAX_EVENTS);
  });

  it('keeps the newest entries when both axes prune', () => {
    // Mix: 5 stale entries followed by MAX_EVENTS + 3 fresh ones — TTL drops
    // the stale, cap drops the oldest fresh.
    const events: CorrectionEvent[] = [];
    for (let i = 0; i < 5; i++) events.push(event(NOW - EVENT_TTL_MS - 1000));
    for (let i = MAX_EVENTS + 3; i > 0; i--) events.push(event(NOW - i));
    const result = pruneCorrectionEvents(events, NOW);
    expect(result).toHaveLength(MAX_EVENTS);
    expect(result.at(-1)!.timestamp).toBe(NOW - 1);
  });

  it('returns a new array (does not mutate input)', () => {
    const events = [event(NOW)];
    const result = pruneCorrectionEvents(events, NOW);
    expect(result).not.toBe(events);
  });
});

// Storage isn't reset between tests, so assert on the DELTA rather than absolute
// counts (the cap test, which IS absolute, runs last).
const count = async (): Promise<number> => (await getCorrectionEvents()).length;

// The background serialized writer — the only writer of the log. These exercise
// the real fakeBrowser storage; the concurrency test below mocks it to force an
// interleaving window.
describe('appendCorrectionEventsSerialized', () => {
  it('appends a whole batch in one write', async () => {
    const before = await count();
    await appendCorrectionEventsSerialized([event(Date.now()), event(Date.now())]);
    expect(await count()).toBe(before + 2);
  });

  it('is a no-op for an empty batch', async () => {
    const before = await count();
    await appendCorrectionEventsSerialized([]);
    expect(await count()).toBe(before);
  });

  it('appends without clobbering existing events', async () => {
    const before = await count();
    await appendCorrectionEventsSerialized([event(Date.now())]);
    await appendCorrectionEventsSerialized([event(Date.now()), event(Date.now())]);
    expect(await count()).toBe(before + 3);
  });

  it('caps the stored log at MAX_EVENTS', async () => {
    const now = Date.now();
    await appendCorrectionEventsSerialized(
      Array.from({ length: MAX_EVENTS + 10 }, (_, i) => event(now - i)),
    );
    expect(await count()).toBe(MAX_EVENTS);
  });
});

// The fix for #310: concurrently-arriving appends must serialize their
// read-modify-write so none is lost. A naive per-tab RMW fired against this
// interleaving-capable storage mock would drop all but the last append.
describe('appendCorrectionEventsSerialized — no lost update under concurrency', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps every append (and prunes) when writes race with interleaving get/set', async () => {
    const now = Date.now();
    // Seed two stale events the serialized writer must prune on its first write —
    // proves the batch is pruned, not merely concatenated.
    let store: CorrectionEvent[] = [
      event(now - EVENT_TTL_MS - 1000),
      event(now - EVENT_TTL_MS - 2000),
    ];
    // Real async get/set: each yields a macrotask, so all synchronously-fired
    // appends reach their first `await` before any get resolves — the exact
    // window a non-serialized RMW loses updates in.
    const yieldTick = async (): Promise<void> => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    };
    // Retype the (heavily overloaded) storage.local methods to simple
    // promise-returning signatures so the async mocks don't trip
    // no-misused-promises against a void-returning overload. Same object at
    // runtime, so the spies replace the very methods getCorrectionEvents reads.
    const local = browser.storage.local as unknown as {
      get: (key?: string) => Promise<Record<string, CorrectionEvent[]>>;
      set: (items: Record<string, CorrectionEvent[]>) => Promise<void>;
    };
    vi.spyOn(local, 'get').mockImplementation(async () => {
      await yieldTick();
      return { [EVENTS_KEY]: [...store] };
    });
    vi.spyOn(local, 'set').mockImplementation(async (items) => {
      await yieldTick();
      store = items[EVENTS_KEY] ?? [];
    });

    const fresh = Array.from({ length: 20 }, (_, i) => event(now + i));
    // Fire all appends without awaiting between them — they race.
    await Promise.all(
      fresh.map(async (e) => {
        await appendCorrectionEventsSerialized([e]);
      }),
    );

    // Every fresh append survived (no lost update) and the stale seeds were
    // pruned out, so the final store is exactly the fresh set.
    expect(store).toHaveLength(20);
    expect(store.map((e) => e.timestamp).toSorted((a, b) => a - b)).toEqual(
      fresh.map((e) => e.timestamp),
    );
  });
});

// The content-script-facing API now funnels appends to the background writer via
// `movar:logCorrections` instead of writing storage in-tab. sendMessage is left
// calling through to fakeBrowser (which rejects "No listeners available" with no
// receiver registered) — exactly the swallow path logCorrections relies on — so
// we assert on the recorded call, not on a response.
describe('logCorrections send path (content → background)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the batch to the background as a movar:logCorrections message', async () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage');
    const batch = [event(Date.now()), event(Date.now() + 1)];
    await logCorrections(batch);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'movar:logCorrections', events: batch });
  });

  it('logCorrection sends a single-event batch', async () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage');
    const e = event(Date.now());
    await logCorrection(e);
    expect(send).toHaveBeenCalledWith({ type: 'movar:logCorrections', events: [e] });
  });

  it('does not send for an empty batch', async () => {
    const send = vi.spyOn(browser.runtime, 'sendMessage');
    await logCorrections([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows a send failure (fire-and-forget stats log)', async () => {
    vi.spyOn(browser.runtime, 'sendMessage').mockRejectedValue(new Error('no background'));
    await expect(logCorrections([event(Date.now())])).resolves.toBeUndefined();
  });
});
