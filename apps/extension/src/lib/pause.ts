import { browser } from 'wxt/browser';
import { HOUR_MS } from './time';

/**
 * Two pause options today: a short timed break and an indefinite "until you
 * resume" pause. We deliberately don't offer multi-day timed pauses — if you
 * want Movar gone for that long, toggle the extension off instead.
 *
 * `'indefinite'` survives browser restarts (it really is paused *until you
 * resume*); the timed variant auto-expires via a chrome.alarms entry.
 */
export type PauseDuration = '1h' | 'indefinite';

export const PAUSE_DURATIONS: readonly PauseDuration[] = ['1h', 'indefinite'];

const PAUSED_UNTIL_KEY = 'movar:pausedUntil';
const PAUSED_INDEFINITELY_KEY = 'movar:pausedIndefinitely';
export const RESUME_ALARM = 'movar:resume';

/** Per-host timed-snooze map: `host → epoch-ms the snooze ends`. Distinct from
 *  the global pause keys and from the permanent `settings.allowlist`. */
const SNOOZED_HOSTS_KEY = 'movar:snoozedHosts';
/** One sweeping alarm, armed at the earliest live snooze's expiry; on fire we
 *  prune expired entries and re-arm at the next one. One alarm beats one per
 *  host (chrome.alarms is a small shared pool). */
export const SNOOZE_ALARM = 'movar:snooze-sweep';

/** Default snooze window — a per-site break of one hour. */
export const SNOOZE_DURATION_MS = HOUR_MS;

const DURATION_MS: Record<Exclude<PauseDuration, 'indefinite'>, number> = {
  '1h': HOUR_MS,
};

export interface PauseState {
  paused: boolean;
  /** Epoch ms the timed pause ends, or null for indefinite/no pause. */
  until: number | null;
  /** True when the user paused with no end — only a manual resume clears it. */
  indefinite: boolean;
}

export async function getPauseState(): Promise<PauseState> {
  const local = await browser.storage.local.get([PAUSED_UNTIL_KEY, PAUSED_INDEFINITELY_KEY]);
  const rawUntil = local[PAUSED_UNTIL_KEY];
  const until = typeof rawUntil === 'number' ? rawUntil : null;
  const indefinite = Boolean(local[PAUSED_INDEFINITELY_KEY]);
  const timed = until !== null && Date.now() < until;
  return { paused: indefinite || timed, until: timed ? until : null, indefinite };
}

export async function pauseFor(duration: PauseDuration): Promise<void> {
  if (duration === 'indefinite') {
    await browser.storage.local.set({ [PAUSED_INDEFINITELY_KEY]: true, [PAUSED_UNTIL_KEY]: null });
    return;
  }
  const until = Date.now() + DURATION_MS[duration];
  // Independent writes — persist the pause window and arm the auto-resume alarm
  // concurrently.
  await Promise.all([
    browser.storage.local.set({ [PAUSED_UNTIL_KEY]: until, [PAUSED_INDEFINITELY_KEY]: false }),
    browser.alarms.create(RESUME_ALARM, { when: until }),
  ]);
}

export async function resume(): Promise<void> {
  // Independent — clear the pause window and the auto-resume alarm concurrently.
  await Promise.all([
    browser.storage.local.set({ [PAUSED_UNTIL_KEY]: null, [PAUSED_INDEFINITELY_KEY]: false }),
    browser.alarms.clear(RESUME_ALARM),
  ]);
}

/**
 * Self-heal a timed pause whose window has already elapsed but whose artifacts
 * (the `pausedUntil` value and the `chrome.alarms` auto-resume entry) are still
 * present — e.g. the resume alarm was dropped while the MV3 service worker slept
 * past the deadline, which would otherwise leave the DNR rule off indefinitely.
 * Clears the pause via {@link resume} so the caller can reinstall the rule.
 * No-op for an indefinite pause or a still-active timed pause. Returns whether
 * it resumed, and is idempotent (the `>=` guard never fights a live pause).
 */
export async function resumeIfExpired(): Promise<boolean> {
  const local = await browser.storage.local.get([PAUSED_UNTIL_KEY, PAUSED_INDEFINITELY_KEY]);
  const until = local[PAUSED_UNTIL_KEY];
  const indefinite = Boolean(local[PAUSED_INDEFINITELY_KEY]);
  if (indefinite || typeof until !== 'number' || Date.now() < until) return false;
  await resume();
  return true;
}

/** Subscribe to pause state changes (timed or indefinite). Returns an
 *  unsubscribe function. The handler receives the freshly-read PauseState
 *  rather than a raw diff — pause changes always require a follow-up
 *  read anyway (timed expiry vs explicit set) so this keeps callers simple. */
export function onPauseChange(handler: (next: PauseState) => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local') return;
    if (!(PAUSED_UNTIL_KEY in changes || PAUSED_INDEFINITELY_KEY in changes)) return;
    void getPauseState().then(handler);
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}

// ─── Per-site snooze ────────────────────────────────────────────────────────

/** One live (non-expired) host snooze. */
export interface SnoozedHost {
  host: string;
  /** Epoch ms the snooze ends. */
  until: number;
}

type SnoozeMap = Record<string, number>;

async function readSnoozeMap(): Promise<SnoozeMap> {
  const local = await browser.storage.local.get(SNOOZED_HOSTS_KEY);
  const raw = local[SNOOZED_HOSTS_KEY];
  // Tolerate a malformed/absent value (storage.local can hold anything).
  if (raw == null || typeof raw !== 'object') return {};
  const out: SnoozeMap = {};
  for (const [host, until] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof until === 'number') out[host] = until;
  }
  return out;
}

/** Drop entries whose window has elapsed. Pure. */
function pruneExpired(map: SnoozeMap, now: number): SnoozeMap {
  const out: SnoozeMap = {};
  for (const [host, until] of Object.entries(map)) {
    if (until > now) out[host] = until;
  }
  return out;
}

/** Arm (or clear) the single sweeping alarm at the earliest live expiry. */
async function armSnoozeAlarm(): Promise<void> {
  const live = await getSnoozedHosts();
  if (live.length === 0) {
    await browser.alarms.clear(SNOOZE_ALARM);
    return;
  }
  const earliest = Math.min(...live.map((s) => s.until));
  await browser.alarms.create(SNOOZE_ALARM, { when: earliest });
}

/** The active (non-expired) host snoozes, stale entries filtered out on read. */
export async function getSnoozedHosts(): Promise<SnoozedHost[]> {
  const now = Date.now();
  return Object.entries(await readSnoozeMap())
    .filter(([, until]) => until > now)
    .map(([host, until]) => ({ host, until }));
}

/** The epoch-ms a host's snooze ends, or null when it isn't snoozed / expired. */
export async function isHostSnoozed(host: string): Promise<number | null> {
  const until = (await readSnoozeMap())[host];
  return typeof until === 'number' && until > Date.now() ? until : null;
}

/** Snooze `host` for a timed window (default 1h). Persists the entry and arms
 *  the sweep alarm so the host auto-recovers at expiry. */
export async function snoozeHost(
  host: string,
  durationMs: number = SNOOZE_DURATION_MS,
): Promise<void> {
  const map = pruneExpired(await readSnoozeMap(), Date.now());
  map[host] = Date.now() + durationMs;
  await browser.storage.local.set({ [SNOOZED_HOSTS_KEY]: map });
  await armSnoozeAlarm();
}

/** Resume a snoozed host now (explicit "Resume now"). No-op if not snoozed. */
export async function unsnoozeHost(host: string): Promise<void> {
  const map = await readSnoozeMap();
  if (!(host in map)) return;
  const without = Object.fromEntries(Object.entries(map).filter(([h]) => h !== host));
  await browser.storage.local.set({ [SNOOZED_HOSTS_KEY]: without });
  await armSnoozeAlarm();
}

/** Prune expired snoozes and re-arm the alarm — the {@link SNOOZE_ALARM}
 *  handler, and a self-heal on every worker wake (the alarm may have been
 *  dropped while the SW slept). Returns whether anything was pruned (so callers
 *  can skip a redundant DNR resync). */
export async function sweepExpiredSnoozes(): Promise<boolean> {
  const map = await readSnoozeMap();
  const pruned = pruneExpired(map, Date.now());
  const changed = Object.keys(pruned).length !== Object.keys(map).length;
  if (changed) await browser.storage.local.set({ [SNOOZED_HOSTS_KEY]: pruned });
  await armSnoozeAlarm();
  return changed;
}

/** Subscribe to snooze-map changes (a host snoozed or resumed/swept). Returns an
 *  unsubscribe function. The handler re-reads the map itself — like
 *  {@link onPauseChange}, a change always needs a follow-up read. */
export function onSnoozeChange(handler: () => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'local' || !(SNOOZED_HOSTS_KEY in changes)) return;
    handler();
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
