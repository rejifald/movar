import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';

/** Order-sensitive equality for a `priority`/`blocked` language list. Order
 *  matters for `priority` (reordering changes which language wins the
 *  ladder); for `blocked` a same-set reorder is a semantic no-op, but
 *  comparing positionally is simpler than a dedicated set-compare and only
 *  costs one harmless extra rebuild. */
function sameLanguageList(a: readonly LanguageCode[], b: readonly LanguageCode[]): boolean {
  return a.length === b.length && a.every((code, i) => code === b[i]);
}

/** What the content script must do to the page after a settings change. The
 *  caller (`installSettingsListener`) applies these against module state + DOM. */
export interface SettingsReaction {
  /** New value for the page-scoped "Show everything" override (`userOverride`). */
  userOverride: boolean;
  /** Tear every Movar concealment off the page first. */
  teardown: boolean;
  /** Re-run the content-modification pass (which reloads the active locale's
   *  curtain strings before rebuilding). */
  apply: boolean;
}

/**
 * Decide how the page reacts to a settings change — pure, so the branching is
 * unit-tested without a DOM or module state. `installSettingsListener` feeds in
 * whether the resolved UI locale changed and the current `userOverride`, then
 * applies the returned actions.
 *
 * Curtains exist only while content filtering is on, so that's the only state
 * worth rebuilding:
 *  - filtering just turned OFF → tear everything down so the user sees the
 *    original site immediately; a concurrent locale change is moot with nothing
 *    concealed.
 *  - filtering ON and (it just turned on OR the locale changed OR the conceal
 *    mode changed OR the priority/blocked language lists changed) → rebuild.
 *    A locale change or a priority/blocked edit tears the stale concealment
 *    down first so applyOnce re-evaluates every card from scratch: both
 *    `collectScannableCards` (content-conceal.ts) and `filterPickerLinks`
 *    (picker-filter.ts) only ever *add* concealment on a pass — a card marked
 *    "checked, not blocked" or a picker link already hidden is skipped forever
 *    without a teardown first, which is exactly why a settled/static page
 *    otherwise never reflects the new lists. A plain turn-on or a conceal-mode
 *    flip just applies (the content pass enforces the new mode — escalating
 *    existing curtains to hidden under 'hide', leaving already-hidden cards
 *    alone under 'curtain', which is the safe, lazy de-escalation).
 *  - turning filtering on is an explicit opt-in that clears a prior page-scoped
 *    "Show everything"; while that override is active there's nothing to rebuild.
 */
export function reactToSettingsChange(
  previous: MovarSettings,
  next: MovarSettings,
  localeChanged: boolean,
  userOverride: boolean,
): SettingsReaction {
  const filteringOn = next.contentModification;
  const toggled = previous.contentModification !== filteringOn;
  if (!filteringOn) {
    return { userOverride, teardown: toggled, apply: false };
  }
  const override = toggled ? false : userOverride;
  const modeChanged = previous.concealMode !== next.concealMode;
  const languagesChanged =
    !sameLanguageList(previous.priority, next.priority) ||
    !sameLanguageList(previous.blocked, next.blocked);
  const rebuild = !override && (toggled || localeChanged || modeChanged || languagesChanged);
  const teardown = rebuild && (localeChanged || languagesChanged);
  return { userOverride: override, teardown, apply: rebuild };
}
