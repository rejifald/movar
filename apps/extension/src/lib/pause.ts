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
