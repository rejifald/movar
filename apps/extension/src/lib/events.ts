import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import { DAY_MS } from './time';

const EVENTS_KEY = 'movar:events';
export const MAX_EVENTS = 1000;
/** Time-based retention floor. The 1,000-entry cap is the privacy-policy
 *  commitment; this TTL is a second pruning axis for users whose corrections
 *  ramp up slowly (a few per week). Without it a months-old event would sit
 *  in storage waiting for the cap to kick in. 30 days comfortably covers
 *  "today" + "this week" + "this month" UI surfaces. */
const RETENTION_DAYS = 30;
export const EVENT_TTL_MS = RETENTION_DAYS * DAY_MS;

export function pruneCorrectionEvents(
  events: readonly CorrectionEvent[],
  now: number,
): CorrectionEvent[] {
  const cutoff = now - EVENT_TTL_MS;
  // Apply the time cutoff first, then the count cap — flipping the order
  // could let the cap drop fresh events behind a wall of stale ones if the
  // stored log was huge before TTL pruning shipped.
  const fresh = events.filter((e) => e.timestamp >= cutoff);
  return fresh.length > MAX_EVENTS ? fresh.slice(-MAX_EVENTS) : [...fresh];
}

export async function getCorrectionEvents(): Promise<CorrectionEvent[]> {
  const stored = await browser.storage.local.get(EVENTS_KEY);
  return (stored[EVENTS_KEY] as CorrectionEvent[] | undefined) ?? [];
}

/**
 * Append correction events to the rolling log in ONE read-modify-write. Empty
 * batches are a no-op.
 *
 * This is safe against the lost-update hazard not by locking but by design: the
 * only writers are the orchestrator's `record`/content-modification paths, which
 * run inside the per-tick `applyingInFlight` guard, and the content-modification
 * pass now RETURNS its corrections to be logged here once — never inline per item.
 * So there is exactly one write per tick; nothing races this read-modify-write.
 */
export async function logCorrections(events: readonly CorrectionEvent[]): Promise<void> {
  if (events.length === 0) return;
  const stored = await getCorrectionEvents();
  stored.push(...events);
  await browser.storage.local.set({ [EVENTS_KEY]: pruneCorrectionEvents(stored, Date.now()) });
}

export async function logCorrection(event: CorrectionEvent): Promise<void> {
  await logCorrections([event]);
}
