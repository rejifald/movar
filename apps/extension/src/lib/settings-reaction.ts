import type { MovarSettings } from '@movar/settings';

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
 *    mode changed) → rebuild. A locale change tears the stale-language
 *    concealment down first so applyOnce re-renders it; a plain turn-on or a
 *    conceal-mode flip just applies (the content pass enforces the new mode —
 *    escalating existing curtains to hidden under 'hide', leaving already-hidden
 *    cards alone under 'curtain', which is the safe, lazy de-escalation).
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
  const rebuild = !override && (toggled || localeChanged || modeChanged);
  return { userOverride: override, teardown: rebuild && localeChanged, apply: rebuild };
}
