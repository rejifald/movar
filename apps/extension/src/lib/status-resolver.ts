/**
 * The shared status model — pure, React-free, importable from any runtime.
 *
 * `resolveHero` + `getActivityState` were lifted out of the popup's
 * `StatusHeader.tsx` (which imports React + lucide) so the **background service
 * worker** can reuse the exact same logic to drive the toolbar icon without
 * bundling React. `StatusHeader.tsx` re-exports `resolveHero`/`HeroState` so the
 * popup's public surface is unchanged.
 *
 * `resolveActionIconState` is the toolbar's entry point: it collapses the
 * popup's 8-way `HeroState` × 3-way activity into the 6 `ActionIconState`s the
 * toolbar button can actually distinguish (`@movar/ui`), mirroring the popup's
 * own `resolvePopupView` composition so the button and the popup can never
 * disagree about what Movar is doing on a tab.
 */
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import type { ActionIconState } from '@movar/ui/action-icon-svg';

import { hostMatchesAllowlist } from './host-match';
import { hasConcealment } from './messaging';
import type { HiddenSummary } from './messaging';

/** Enabled-and-not-paused, paused, or off — the three mutually exclusive
 *  top-level activity states. */
export type ActivityState = 'active' | 'paused' | 'off';

/** The activity state from the two global flags. Centralised so the popup JSX
 *  and the toolbar resolver branch the same way. */
export function getActivityState(enabled: boolean, paused: boolean): ActivityState {
  if (enabled && !paused) return 'active';
  return paused ? 'paused' : 'off';
}

/**
 * The popup hero's active state, resolved from the live per-page snapshot. Every
 * variant maps to one claim the user can verify by looking at the tab in front
 * of them.
 */
export type HeroState =
  | { kind: 'served'; language: LanguageCode }
  | { kind: 'blocked'; language: LanguageCode }
  | { kind: 'hiding'; languages: LanguageCode[] }
  | { kind: 'clean' }
  | { kind: 'reload' }
  | {
      kind: 'exempt';
      /** True when the active host was turned off from the crash screen
       *  (cleared on the next Movar update) rather than permanently
       *  allowlisted — picks the exempt hero's detail copy. */
      untilUpdate: boolean;
    }
  | { kind: 'snoozed'; until: number }
  | { kind: 'noPage' };

/**
 * Map the live snapshot to a hero variant. Pure — the Storybook showcase and
 * any test exercise every branch by passing inputs directly.
 *
 * Ordering is deliberate: site-level reasons Movar is inert (exempt, non-web
 * tab, no content script yet) win over any page-content read, and an active
 * concealment outranks the passive "what language is this page" status.
 */
export function resolveHero(
  hidden: HiddenSummary | null,
  exempt: boolean,
  hasPage: boolean,
  settings: MovarSettings,
  /** Epoch-ms the active host's snooze ends, or null when it isn't snoozed.
   *  Outranks the page-content read (a timed site-level reason Movar is inert),
   *  just under the permanent `exempt`. */
  snoozedUntil: number | null = null,
  /** Whether `exempt` is true because of a crash-screen disable rather than
   *  the permanent allowlist. Ignored unless `exempt`. */
  disabledUntilUpdate = false,
): HeroState {
  if (exempt) return { kind: 'exempt', untilUpdate: disabledUntilUpdate };
  if (snoozedUntil != null) return { kind: 'snoozed', until: snoozedUntil };
  if (!hasPage) return { kind: 'noPage' };
  if (!hidden) return { kind: 'reload' };
  return resolveActiveHero(hidden, settings);
}

/** Hero for a tab that answered and isn't exempt: an active concealment outranks
 *  the passive page-language read. */
function resolveActiveHero(hidden: HiddenSummary, settings: MovarSettings): HeroState {
  if (hasConcealment(hidden)) return { kind: 'hiding', languages: hidden.languages };
  return pageLangVerdict(hidden.pageLang, settings) ?? { kind: 'clean' };
}

/** Classify the detected page language against the user's sets: blocked (Movar
 *  would steer away) or served (a preferred language). Null = neither. */
function pageLangVerdict(lang: LanguageCode | null, settings: MovarSettings): HeroState | null {
  if (lang == null) return null;
  if (settings.blocked.includes(lang)) return { kind: 'blocked', language: lang };
  if (settings.priority.includes(lang)) return { kind: 'served', language: lang };
  return null;
}

/** Collapse a resolved active-state hero to a toolbar posture. The popup draws
 *  eight distinct heroes; the 16px button can't, so several fold together:
 *  served/clean/blocked/noPage all read as the plain "on" badge (Movar is on and
 *  fine here — nothing to hide, or nothing more it can do), a live concealment is
 *  `blocking`, a per-host snooze reuses `paused`, and the reload/exempt heroes
 *  keep their own badges. */
function heroToActionIconState(hero: HeroState): ActionIconState {
  switch (hero.kind) {
    case 'hiding': {
      return 'blocking';
    }
    case 'reload': {
      return 'attention';
    }
    case 'exempt': {
      return 'exempt';
    }
    case 'snoozed': {
      return 'paused';
    }
    case 'served':
    case 'clean':
    case 'blocked':
    case 'noPage': {
      return 'active';
    }
  }
}

/**
 * The single toolbar-icon entry point, composed from the same inputs the popup's
 * `resolvePopupView` reads: global off / paused short-circuit first (they hold on
 * every tab), then per-tab `exempt`/`hasPage`/`hidden` drive the active-state
 * badge. `url` is the tab's http(s) URL, or null for a non-web tab.
 */
export function resolveActionIconState(
  settings: MovarSettings,
  paused: boolean,
  hidden: HiddenSummary | null,
  url: string | null,
  snoozedUntil: number | null,
  /** Active host was turned off from the crash screen (cleared on the next
   *  Movar update) — folds into `exempt` alongside the permanent allowlist,
   *  exactly like the popup's `resolvePopupView`. */
  disabledUntilUpdate = false,
): ActionIconState {
  const activity = getActivityState(settings.enabled, paused);
  if (activity === 'off') return 'off';
  if (activity === 'paused') return 'paused';
  const exempt =
    url != null &&
    (hostMatchesAllowlist(new URL(url).hostname, settings.allowlist) || disabledUntilUpdate);
  return heroToActionIconState(
    resolveHero(hidden, exempt, url !== null, settings, snoozedUntil, disabledUntilUpdate),
  );
}
