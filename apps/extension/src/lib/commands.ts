import { browser } from 'wxt/browser';
import { getPauseState, pauseFor, resume } from './pause';
import type { MovarMessage } from './messaging';

/** Reveal everything Movar concealed on the active tab — the keyboard-shortcut
 *  twin of the popup's "Show everything". Reuses the existing content handler;
 *  no new message type. A tab without a content script (chrome://, store, …)
 *  rejects sendMessage, which we swallow — there's nothing to reveal there. */
async function revealActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return;
  try {
    await browser.tabs.sendMessage(tab.id, { type: 'movar:restoreHidden' } satisfies MovarMessage);
  } catch {
    // No receiver in the active tab — nothing concealed there to reveal.
  }
}

/** Dispatch a manifest `commands` keyboard shortcut to its action. The ids
 *  match the `commands` block in wxt.config.ts. toggle-pause flips the GLOBAL
 *  pause (timed 1h ↔ resume); reveal-all reuses the content script's restore
 *  handler on the active tab. */
export async function handleCommand(command: string): Promise<void> {
  if (command === 'toggle-pause') {
    const { paused } = await getPauseState();
    await (paused ? resume() : pauseFor('1h'));
  } else if (command === 'reveal-all') {
    await revealActiveTab();
  }
}
