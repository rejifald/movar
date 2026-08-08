/*
 * Client-side wiring for the "store + guide" install handoff, shared by the two
 * surfaces that send a visitor to a marketplace: the CTA (DownloadButtons, in
 * the hero and on the guide itself) and the header's Download nav link.
 *
 * On the browsers `needsInstallGuide` flags, one click has to reach two places:
 * the marketplace AND the /install guide. Only one of those can be a scripted
 * navigation without meeting a popup blocker, so which destination gets which
 * mechanism is not arbitrary:
 *
 *   store → the link's OWN `target="_blank"` navigation. A real link activation
 *           is never popup-blocked (a `window.open` from the same handler would
 *           be, on Safari especially), and it opens in the foreground — so the
 *           page where the install actually happens is the one that keeps focus.
 *   guide → a same-tab `location.assign` on the tab we already own, which is
 *           never blocked either. It waits behind the store tab for the visitor
 *           to come back to it, which is exactly when its steps become useful.
 *
 * The same-tab navigation is deferred by one task on purpose. An <a>'s
 * activation behaviour runs after its click listeners, so navigating
 * synchronously here would start unloading this document before the browser had
 * opened the store tab at all. By the time a queued task runs, the new browsing
 * context exists and is independent of this one.
 */
import type { BrowserId } from './downloads';
import { needsInstallGuide } from './downloads';

/** True when the visitor is already reading the install guide — handing off
 *  would just reload the page they're on. Keyed off the guide's own marker
 *  rather than the path so trailing slashes and locale prefixes can't fool it. */
function onInstallGuide(): boolean {
  return document.querySelector('[data-install-guide]') !== null;
}

/** Modifiers that mean "put this somewhere other than the tab I'm looking at". */
const CLICK_MODIFIERS = ['metaKey', 'ctrlKey', 'shiftKey', 'altKey'] as const;

/**
 * A plain primary click. Anything else — cmd/ctrl/shift/alt, or a non-primary
 * button — is the visitor choosing for themselves where the store lands, so the
 * tab they deliberately chose to stay on must be left where it is.
 */
function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !CLICK_MODIFIERS.some((modifier) => event[modifier]);
}

/**
 * Point `link` at the guide as well as the store, for the browsers that need
 * both. No-op on the browsers whose store page is enough, and on the guide
 * itself. Call it only once the link is pointed at a LIVE store: the pending
 * listing state deliberately strips the href to make the click inert, and a
 * handoff there would give a "Soon" button something to do again.
 *
 * `newTabHint` is the screen-reader-only note that the store opens elsewhere —
 * required, because the `target="_blank"` added here is otherwise silent.
 */
export function wireInstallGuideHandoff(
  link: HTMLAnchorElement,
  id: BrowserId,
  guideHref: string,
  newTabHint: string,
): void {
  if (!needsInstallGuide(id) || onInstallGuide()) return;

  link.target = '_blank';
  link.rel = 'noopener';

  // `sr-only` is absolutely positioned, so it leaves no gap between the flex
  // children it sits among and no mark on the visual baselines.
  const hint = document.createElement('span');
  hint.className = 'sr-only';
  hint.textContent = ` (${newTabHint})`;
  link.append(hint);

  link.addEventListener('click', (event) => {
    if (!isPlainClick(event)) return;
    setTimeout(() => {
      globalThis.location.assign(guideHref);
    }, 0);
  });
}
