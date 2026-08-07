import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import { findGateOverlay } from '@movar/lang-pickers/gate';
import { pickRedirectTarget } from '@movar/lang-pickers/redirect';
import type { Picker, RedirectTarget } from '@movar/lang-pickers/types';

/**
 * Satisfy a *language gate* — a picker inside an overlay that blocks the page
 * until the visitor chooses a language — by activating the option they'd pick
 * anyway.
 *
 * Why this is a separate pass and not part of the redirect ladder: the ladder in
 * `language-switch.ts` is gated on the page being in a BLOCKED language, and a
 * gate's whole problem is that it fires on pages that are already in a fine one
 * (`<html lang="uk">` behind a «Оберіть мову / Выберите язык» modal). It also
 * navigates via `location.replace`, which is the wrong verb here: these gates do
 * their real work in a click handler that persists a cookie, and the `href` is
 * frequently the current URL, so following it skips the handler and the gate
 * returns on the next page. Clicking is what the visitor would do, so clicking
 * is what this does.
 *
 * The action is deliberately hedged in every direction, because a false positive
 * means Movar clicked a link nobody asked it to:
 *
 *   - only before the visitor has interacted with the page — a mobile drawer or
 *     a language menu is also a fixed full-viewport box, but it only exists
 *     because someone opened it;
 *   - only when the gate offers a BLOCKED language, which is what makes it
 *     Movar's business rather than a generic auto-clicker;
 *   - only when the gate also offers a language the visitor actually prefers;
 *   - never when they already picked a language on this host by hand;
 *   - at most once per host per session, and only when that latch is durable.
 */
export interface LanguageGateDeps {
  /** True once a trusted pointer/key event has reached the page. */
  hasUserInteracted(): boolean;
  /** True when a gate on this host was already satisfied this session. */
  isSatisfied(): boolean;
  /** Latch this host. Returns false when the record could not be persisted, in
   *  which case the caller must not click (nothing would stop a reload loop). */
  markSatisfied(): boolean;
  /** Language the visitor chose on this host by hand this session, if any. */
  sessionChoice(): LanguageCode | null;
  /** Toggle the "Movar is driving this click" flag, so the capture-phase picker
   *  listener doesn't log a synthetic click as the visitor's own preference. */
  setSimulatedClick(active: boolean): void;
  /** Log the correction to the on-device dashboard. */
  record(fromLang: LanguageCode, toLang: LanguageCode): Promise<void>;
}

/** A gate that both blocks the page and offers a way out. */
interface SatisfiableGate {
  target: RedirectTarget;
  /** The preferred language we're about to select. */
  language: LanguageCode;
  /** A blocked language the gate offered — what makes this Movar's business,
   *  and the `fromLang` of the logged correction (matching how picker filtering
   *  records "a blocked entry was taken away"). */
  blocked: LanguageCode;
}

/** First picker that is a blocking gate, offers a blocked language, and has a
 *  preferred option to activate. Pickers are checked in DOM order; a page with
 *  two simultaneous gates is not a shape worth modelling beyond "take the
 *  first". */
function findSatisfiableGate(pickers: Picker[], settings: MovarSettings): SatisfiableGate | null {
  for (const picker of pickers) {
    if (findGateOverlay(picker) === null) continue;
    const blocked = picker.links.find((link) => settings.blocked.includes(link.language));
    if (!blocked) continue;
    const picked = pickRedirectTarget([picker], settings.priority);
    if (!picked) continue;
    return { target: picked.target, language: picked.language, blocked: blocked.language };
  }
  return null;
}

/**
 * Returns true when a gate was satisfied — the click has been dispatched and the
 * page is most likely unloading, so the caller should skip the rest of its tick.
 */
export async function trySatisfyLanguageGate(
  deps: LanguageGateDeps,
  pickers: Picker[],
  settings: MovarSettings,
): Promise<boolean> {
  if (pickers.length === 0) return false;
  // Anything that appeared after a click or a keypress is something the visitor
  // opened. Clicking inside it would be Movar operating their UI, not clearing
  // an obstacle they never asked for.
  if (deps.hasUserInteracted()) return false;
  if (deps.isSatisfied()) return false;
  // They already told this site which language they want, by hand.
  if (deps.sessionChoice() !== null) return false;

  const gate = findSatisfiableGate(pickers, settings);
  if (gate === null) return false;
  // Latch BEFORE clicking, and bail if the latch didn't stick: the click can
  // navigate synchronously, so anything deferred past it may never run.
  if (!deps.markSatisfied()) return false;

  await deps.record(gate.blocked, gate.language);
  deps.setSimulatedClick(true);
  try {
    gate.target.click();
  } finally {
    deps.setSimulatedClick(false);
  }
  return true;
}
