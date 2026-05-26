import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/shared';

const EVENTS_KEY = 'movar:events';
const MAX_EVENTS = 1000;

export async function logCorrection(event: CorrectionEvent): Promise<void> {
  const stored = await browser.storage.local.get(EVENTS_KEY);
  const events = (stored[EVENTS_KEY] as CorrectionEvent[] | undefined) ?? [];
  events.push(event);
  const trimmed = events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events;
  await browser.storage.local.set({ [EVENTS_KEY]: trimmed });
}
