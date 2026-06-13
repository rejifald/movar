/**
 * Single polite ARIA live region for the content script.
 *
 * Concealment is silent to assistive technology — a curtain attaching or a "Show
 * everything" reveal changes the page with no announcement. This module owns one
 * visually-hidden `[data-movar-live]` `role="status"` region (appended to
 * `document.body` lazily, once) and a debounced {@link announce}. The debounce is
 * the point: on an infinite-scroll feed Movar conceals cards in bursts, and one
 * `aria-live` message per card would flood a screen reader. Callers fire freely;
 * the region speaks at most once per quiet window, with the latest message.
 *
 * Count-agnostic by design — the caller passes a terse, locale-correct rolled-up
 * sentence (see `ContentStrings.liveRegion`), not a per-card running total.
 */

const LIVE_ATTR = 'data-movar-live';

/** Quiet window before the latest pending message is spoken. Long enough to
 *  coalesce a scroll burst's worth of conceal passes into one announcement. */
export const ANNOUNCE_DEBOUNCE_MS = 600;

let region: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string | null = null;

/** Visually-hidden, but present in the a11y tree (not `display:none`, which AT
 *  ignores). The standard clip pattern. */
function ensureRegion(): HTMLElement {
  if (region?.isConnected === true) return region;
  const el = document.createElement('div');
  el.setAttribute(LIVE_ATTR, '');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  el.style.cssText =
    'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;';
  document.body.append(el);
  region = el;
  return el;
}

/**
 * Announce `message` politely, debounced. The first call in a quiet window
 * schedules the write; later calls within the window replace the pending text
 * (latest wins) without rescheduling — so a burst collapses to one spoken
 * message reflecting the final state. Writing identical text is a no-op for AT
 * (no content change), which is the desired "don't repeat myself on every
 * scroll" behaviour.
 */
export function announce(message: string, debounceMs: number = ANNOUNCE_DEBOUNCE_MS): void {
  pending = message;
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    const next = pending;
    pending = null;
    if (next === null) return;
    ensureRegion().textContent = next;
  }, debounceMs);
}

/** Drop the region and any pending announcement. Called when concealment is torn
 *  down (feature off, or paused) so a quiet page holds no live region. */
export function teardownLiveRegion(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  pending = null;
  region?.remove();
  region = null;
}
