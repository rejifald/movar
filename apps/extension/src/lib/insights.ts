import type { CorrectionEvent, CorrectionMechanism } from '@movar/events';
import { DAY_MS } from './time';

/** How many top steered sites the insights view lists. Kept small so the
 *  options-page section stays a glance, not a table to scroll. */
export const TOP_SITES_LIMIT = 5;

/** Window for the "this week" count: corrections in the last 7 days. */
const DAYS_PER_WEEK = 7;
const WEEK_MS = DAYS_PER_WEEK * DAY_MS;

export interface SiteCount {
  domain: string;
  count: number;
}

/**
 * Read-only rollup of the local corrections log. Computed on the full log on
 * each read rather than maintained incrementally: the log is capped at 1,000
 * entries (see {@link MAX_EVENTS}), so this is O(n) over a tiny array and avoids
 * a second source of truth that could drift from the log itself.
 */
export interface CorrectionsInsights {
  /** Total corrections still in the retention window. */
  total: number;
  /** Corrections in the last 7 days (inclusive of the exact boundary). */
  thisWeek: number;
  /** Top steered sites, sorted by count desc, capped to {@link TOP_SITES_LIMIT}. */
  topSites: SiteCount[];
  /** Per-mechanism tally. Mechanisms with zero corrections are omitted. */
  byMechanism: Partial<Record<CorrectionMechanism, number>>;
  /** Per-detection-engine tally for corrections that carried an engine. */
  byEngine: Record<string, number>;
  /** Corrections driven by a sync-tier signal (no `detectionEngine`). */
  syncTier: number;
  /** True when the log is empty — drives the quiet empty state in the UI. */
  isEmpty: boolean;
}

/**
 * Aggregate a corrections log into display-ready counts. Pure: no `browser`,
 * no DOM, no clock — the caller threads `now` in (as `events.test.ts` does) so
 * the week boundary is deterministic in tests.
 *
 * `now` is the reference instant for the "this week" window; pass `Date.now()`
 * at the call site.
 */
export function aggregateCorrections(
  events: readonly CorrectionEvent[],
  now: number,
): CorrectionsInsights {
  const weekCutoff = now - WEEK_MS;

  let thisWeek = 0;
  let syncTier = 0;
  const byMechanism: Partial<Record<CorrectionMechanism, number>> = {};
  const byEngine: Record<string, number> = {};
  // Track per-site count and the most-recent timestamp, so ties between equal
  // counts break deterministically toward the more recently steered site.
  const siteStats = new Map<string, { count: number; lastSeen: number }>();

  for (const e of events) {
    if (e.timestamp >= weekCutoff) thisWeek++;

    byMechanism[e.mechanism] = (byMechanism[e.mechanism] ?? 0) + 1;

    if (e.detectionEngine == null) {
      syncTier++;
    } else {
      byEngine[e.detectionEngine] = (byEngine[e.detectionEngine] ?? 0) + 1;
    }

    const site = siteStats.get(e.domain);
    if (site) {
      site.count++;
      if (e.timestamp > site.lastSeen) site.lastSeen = e.timestamp;
    } else {
      siteStats.set(e.domain, { count: 1, lastSeen: e.timestamp });
    }
  }

  const topSites: SiteCount[] = [...siteStats.entries()]
    .toSorted(([, a], [, b]) => b.count - a.count || b.lastSeen - a.lastSeen)
    .slice(0, TOP_SITES_LIMIT)
    .map(([domain, { count }]) => ({ domain, count }));

  return {
    total: events.length,
    thisWeek,
    topSites,
    byMechanism,
    byEngine,
    syncTier,
    isEmpty: events.length === 0,
  };
}
