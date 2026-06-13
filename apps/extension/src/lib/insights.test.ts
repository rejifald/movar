import { describe, expect, it } from 'vitest';
import type { CorrectionEvent, CorrectionMechanism } from '@movar/events';
import { DAY_MS } from './time';
import { TOP_SITES_LIMIT, aggregateCorrections } from './insights';

const NOW = 1_700_000_000_000;
const WEEK_MS = 7 * DAY_MS;

function event(overrides: Partial<CorrectionEvent> = {}): CorrectionEvent {
  return {
    timestamp: NOW,
    domain: 'example.com',
    mechanism: 'cookie',
    fromLang: 'ru',
    toLang: 'uk',
    ...overrides,
  };
}

describe('aggregateCorrections — empty log', () => {
  it('reports isEmpty and zeroes everything', () => {
    const result = aggregateCorrections([], NOW);
    expect(result.isEmpty).toBe(true);
    expect(result.total).toBe(0);
    expect(result.thisWeek).toBe(0);
    expect(result.topSites).toEqual([]);
    expect(result.byMechanism).toEqual({});
    expect(result.byEngine).toEqual({});
    expect(result.syncTier).toBe(0);
  });
});

describe('aggregateCorrections — totals + week window', () => {
  it('counts the full log in total', () => {
    const events = [event(), event({ timestamp: NOW - WEEK_MS - DAY_MS })];
    expect(aggregateCorrections(events, NOW).total).toBe(2);
    expect(aggregateCorrections(events, NOW).isEmpty).toBe(false);
  });

  it('counts only the last 7 days in thisWeek', () => {
    const events = [
      event({ timestamp: NOW - DAY_MS }), // in window
      event({ timestamp: NOW - WEEK_MS - 1 }), // just outside
    ];
    expect(aggregateCorrections(events, NOW).thisWeek).toBe(1);
  });

  it('includes an event landing exactly on the week boundary (>= cutoff)', () => {
    const events = [event({ timestamp: NOW - WEEK_MS })];
    expect(aggregateCorrections(events, NOW).thisWeek).toBe(1);
  });

  it('reports a zero week when every event is older than 7 days', () => {
    const events = [event({ timestamp: NOW - WEEK_MS - 1 })];
    const result = aggregateCorrections(events, NOW);
    expect(result.thisWeek).toBe(0);
    expect(result.total).toBe(1);
  });
});

describe('aggregateCorrections — top sites', () => {
  it('sorts by count descending', () => {
    const events = [
      event({ domain: 'a.com' }),
      event({ domain: 'b.com' }),
      event({ domain: 'b.com' }),
      event({ domain: 'c.com' }),
      event({ domain: 'c.com' }),
      event({ domain: 'c.com' }),
    ];
    expect(aggregateCorrections(events, NOW).topSites).toEqual([
      { domain: 'c.com', count: 3 },
      { domain: 'b.com', count: 2 },
      { domain: 'a.com', count: 1 },
    ]);
  });

  it(`caps the list at ${TOP_SITES_LIMIT} sites`, () => {
    const events = Array.from({ length: TOP_SITES_LIMIT + 3 }, (_, i) =>
      event({ domain: `site-${i}.com` }),
    );
    expect(aggregateCorrections(events, NOW).topSites).toHaveLength(TOP_SITES_LIMIT);
  });

  it('breaks count ties toward the most recently steered site', () => {
    const events = [
      event({ domain: 'older.com', timestamp: NOW - DAY_MS }),
      event({ domain: 'newer.com', timestamp: NOW }),
    ];
    const top = aggregateCorrections(events, NOW).topSites;
    expect(top[0]!.domain).toBe('newer.com');
    expect(top[1]!.domain).toBe('older.com');
  });
});

describe('aggregateCorrections — mechanism tally', () => {
  it('tallies each mechanism and omits zero buckets', () => {
    const mechanisms: CorrectionMechanism[] = ['cookie', 'cookie', 'header', 'dom'];
    const events = mechanisms.map((mechanism) => event({ mechanism }));
    expect(aggregateCorrections(events, NOW).byMechanism).toEqual({
      cookie: 2,
      header: 1,
      dom: 1,
    });
  });
});

describe('aggregateCorrections — engine split', () => {
  it('splits engine-tagged from sync-tier (engine-less) corrections', () => {
    const events = [
      event({ detectionEngine: 'cld3' }),
      event({ detectionEngine: 'cld3' }),
      event({ detectionEngine: 'franc' }),
      event(), // no detectionEngine → sync tier
      event(), // no detectionEngine → sync tier
    ];
    const result = aggregateCorrections(events, NOW);
    expect(result.byEngine).toEqual({ cld3: 2, franc: 1 });
    expect(result.syncTier).toBe(2);
  });

  it('reports zero syncTier when every event carries an engine', () => {
    const events = [event({ detectionEngine: 'cld3' })];
    const result = aggregateCorrections(events, NOW);
    expect(result.syncTier).toBe(0);
    expect(result.byEngine).toEqual({ cld3: 1 });
  });
});
