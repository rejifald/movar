import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/shared';

const EVENTS_KEY = 'movar:events';
const MAX_EVENTS = 1000;
/** Time-based retention floor. The 1,000-entry cap is the privacy-policy
 *  commitment; this TTL is a second pruning axis for users whose corrections
 *  ramp up slowly (a few per week). Without it a months-old event would sit
 *  in storage waiting for the cap to kick in. 30 days comfortably covers
 *  "today" + "this week" + "this month" UI surfaces. */
const EVENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function prune(events: readonly CorrectionEvent[], now: number): CorrectionEvent[] {
  const cutoff = now - EVENT_TTL_MS;
  // Apply the time cutoff first, then the count cap — flipping the order
  // could let the cap drop fresh events behind a wall of stale ones if the
  // stored log was huge before TTL pruning shipped.
  const fresh = events.filter((e) => e.timestamp >= cutoff);
  return fresh.length > MAX_EVENTS ? fresh.slice(-MAX_EVENTS) : [...fresh];
}

export async function getEvents(): Promise<CorrectionEvent[]> {
  const stored = await browser.storage.local.get(EVENTS_KEY);
  return (stored[EVENTS_KEY] as CorrectionEvent[] | undefined) ?? [];
}

export async function logCorrection(event: CorrectionEvent): Promise<void> {
  const events = await getEvents();
  events.push(event);
  const trimmed = prune(events, Date.now());
  await browser.storage.local.set({ [EVENTS_KEY]: trimmed });
}

/** Test seam — exposes the pruning policy for unit tests without forcing
 *  them through `chrome.storage.local`. Not part of the public runtime API. */
export const __internal = { prune, EVENT_TTL_MS, MAX_EVENTS };
