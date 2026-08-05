import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import type { MovarMessage } from './messaging';
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

// ---------------------------------------------------------------------------
// Background serialized writer — the ONLY writer of EVENTS_KEY.
//
// `storage.local` is shared extension-wide, but content scripts are per-tab (and
// may be different origins), so a per-tab read-modify-write can interleave across
// tabs and drop an append: tab A get, tab B get, A set, B set → A's append lost
// (#310). An in-tab guard (`applyingInFlight` in content-runtime) only serializes
// within one tab. The background service worker is a single instance for the
// whole extension, so appends are funnelled here (via `movar:logCorrections`) and
// chained onto one promise so their read-modify-writes can't overlap.
// ---------------------------------------------------------------------------

/** Tail of the append promise-chain. Each append waits on the previous one's
 *  completed get→set before reading, so concurrently-arriving messages serialize
 *  instead of racing. Background-scoped: the SW is the single writer. Typed
 *  `unknown` because its resolved value is never read — it's only a sequencing
 *  anchor, and its rejection-swallowing tail resolves to `null`. */
let correctionWriteQueue: Promise<unknown> = Promise.resolve();

async function appendAndPrune(events: readonly CorrectionEvent[]): Promise<void> {
  const stored = await getCorrectionEvents();
  stored.push(...events);
  await browser.storage.local.set({ [EVENTS_KEY]: pruneCorrectionEvents(stored, Date.now()) });
}

/**
 * Serialized correction-log writer — runs in the background service worker and is
 * the ONLY writer of EVENTS_KEY. Chains each append onto {@link correctionWriteQueue}
 * so two `movar:logCorrections` messages arriving close together can't interleave
 * their read-modify-write and lose an append (the cross-tab race in #310). Empty
 * batches are a no-op.
 */
export async function appendCorrectionEventsSerialized(
  events: readonly CorrectionEvent[],
): Promise<void> {
  if (events.length === 0) return;
  const run = correctionWriteQueue.then(async () => {
    await appendAndPrune(events);
  });
  // A rejected append must not wedge the queue behind a permanently-rejected tail;
  // swallow on the chain only (mirrors capability-loader's `.catch(() => null)`).
  // Callers still observe the real rejection via the awaited `run` below.
  correctionWriteQueue = run.catch(() => null);
  await run;
}

/**
 * Append correction events to the on-device insights log. Runs in the per-tab
 * content script, so it does NOT read-modify-write storage locally (that races
 * across tabs, #310); it hands the batch to the background's single serialized
 * writer ({@link appendCorrectionEventsSerialized}) via `movar:logCorrections`.
 * Empty batches are a no-op. Fire-and-forget: the send is awaited so callers can
 * sequence off it, but a failure (SW asleep/mid-teardown, no receiver) only drops
 * a stats sample, so it's swallowed rather than surfaced.
 */
export async function logCorrections(events: readonly CorrectionEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    await browser.runtime.sendMessage({
      type: 'movar:logCorrections',
      events: [...events],
    } satisfies MovarMessage);
  } catch {
    // Background unreachable or no receiver — a dropped stats sample, nothing
    // user-facing. Mirrors the suspendRedirect swallow in content-runtime.
  }
}

export async function logCorrection(event: CorrectionEvent): Promise<void> {
  await logCorrections([event]);
}
