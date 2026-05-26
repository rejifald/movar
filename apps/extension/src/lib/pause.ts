import { browser } from 'wxt/browser';
import type { PauseDuration } from '@movar/shared';

const PAUSED_UNTIL_KEY = 'movar:pausedUntil';
const PAUSED_SESSION_KEY = 'movar:pausedSession';
export const RESUME_ALARM = 'movar:resume';

const DURATION_MS: Record<Exclude<PauseDuration, 'session'>, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '1w': 7 * 24 * 60 * 60 * 1000,
};

export interface PauseState {
  paused: boolean;
  /** Epoch ms the timed pause ends, or null for session/no pause. */
  until: number | null;
  session: boolean;
}

export async function getPauseState(): Promise<PauseState> {
  const local = await browser.storage.local.get([PAUSED_UNTIL_KEY, PAUSED_SESSION_KEY]);
  const rawUntil = local[PAUSED_UNTIL_KEY];
  const until = typeof rawUntil === 'number' ? rawUntil : null;
  const session = Boolean(local[PAUSED_SESSION_KEY]);
  const timed = until !== null && Date.now() < until;
  return { paused: session || timed, until: timed ? until : null, session };
}

export async function pauseFor(duration: PauseDuration): Promise<void> {
  if (duration === 'session') {
    await browser.storage.local.set({ [PAUSED_SESSION_KEY]: true, [PAUSED_UNTIL_KEY]: null });
    return;
  }
  const until = Date.now() + DURATION_MS[duration];
  await browser.storage.local.set({ [PAUSED_UNTIL_KEY]: until, [PAUSED_SESSION_KEY]: false });
  await browser.alarms.create(RESUME_ALARM, { when: until });
}

export async function resume(): Promise<void> {
  await browser.storage.local.set({ [PAUSED_UNTIL_KEY]: null, [PAUSED_SESSION_KEY]: false });
  await browser.alarms.clear(RESUME_ALARM);
}

/** Clear a session pause (called on browser startup). */
export async function clearSessionPause(): Promise<void> {
  await browser.storage.local.set({ [PAUSED_SESSION_KEY]: false });
}
