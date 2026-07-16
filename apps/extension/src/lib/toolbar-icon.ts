/**
 * Drives the browser toolbar / action button so it reflects Movar's state on the
 * tab in front of you — the visible half of the popup's status, on the button
 * that opens it.
 *
 * The MV3 service worker has no `OffscreenCanvas`, so it can't rasterise at
 * runtime; instead `scripts/generate-icons.mts` pre-renders each state
 * (`@movar/ui`'s `actionIconSvg`) to packaged PNGs under
 * `src/public/icon/state/`, and this module swaps them per tab via
 * `action.setIcon({ tabId, path })`. State is resolved through the shared
 * `resolveActionIconState`, the same logic the popup uses, so the button and the
 * popup can never disagree.
 *
 * The manifest `default_icon` stays the plain brand mark: a tab we haven't
 * resolved yet (or a non-web tab) shows Movar's identity without asserting a
 * state.
 */
import { browser } from 'wxt/browser';
import type { ActionIconState } from '@movar/ui/action-icon-svg';

import { concealedCount } from './messaging';
import type { HiddenSummary, MovarMessage } from './messaging';
import { getPauseState, isHostSnoozed } from './pause';
import { getSettings } from './settings';
import { resolveActionIconState } from './status-resolver';

/** Accent/forest for the count badge — matches the `blocking` badge disc. */
const BADGE_BG = '#15803d';

/** Packaged per-state PNG paths (written by scripts/generate-icons.mts into
 *  `src/public/icon/state/`, served at the extension root). Sizes mirror that
 *  script's `stateIconSizes`. */
function iconPaths(state: ActionIconState): Record<string, string> {
  return {
    '16': `icon/state/${state}-16.png`,
    '32': `icon/state/${state}-32.png`,
    '48': `icon/state/${state}-48.png`,
  };
}

/** The tab's http(s) URL, or null for a non-web tab (chrome://, store, new tab)
 *  — the same gate `active-tab.ts` applies, so the toolbar resolves state the way
 *  the popup does. */
function toHttpUrl(url: string | undefined): string | null {
  return url != null && /^https?:/i.test(url) ? url : null;
}

/** Ask a tab's content script what it's currently hiding. Null when nothing
 *  answers (non-web tab, or the content script hasn't run yet) — which
 *  `resolveActionIconState` reads as the `attention` (reload) posture. */
async function queryHidden(tabId: number): Promise<HiddenSummary | null> {
  try {
    return await browser.tabs.sendMessage(tabId, {
      type: 'movar:getHidden',
    } satisfies MovarMessage);
  } catch {
    return null;
  }
}

/** One-time badge colour. The badge TEXT is set per-tab in {@link refreshTabIcon};
 *  the engine auto-picks a contrasting text colour over this fill. */
export async function initBadgeStyle(): Promise<void> {
  try {
    await browser.action.setBadgeBackgroundColor({ color: BADGE_BG });
  } catch {
    // Non-fatal — the badge still shows with engine defaults.
  }
}

/**
 * Resolve and apply the toolbar icon + native count badge for one tab, from the
 * same inputs the popup composes. `hidden` may be supplied by the content-script
 * push (`movar:hiddenChanged`); when omitted it's pulled for an http tab.
 * Swallows the setIcon race a tab closing mid-resolve throws — a stale tab id
 * isn't worth surfacing.
 */
export async function refreshTabIcon(
  tabId: number,
  url: string | undefined,
  hidden?: HiddenSummary | null,
): Promise<void> {
  const target = toHttpUrl(url);
  const [settings, pause] = await Promise.all([getSettings(), getPauseState()]);
  const host = target == null ? null : new URL(target).hostname;
  const snoozedUntil = host == null ? null : await isHostSnoozed(host);
  // A push may supply `hidden`; when it didn't (`undefined`), pull it for an http
  // tab (a non-web tab has no content script to answer).
  let summary: HiddenSummary | null;
  if (hidden === undefined) {
    summary = target == null ? null : await queryHidden(tabId);
  } else {
    summary = hidden;
  }
  const state = resolveActionIconState(settings, pause.paused, summary, target, snoozedUntil);

  try {
    await browser.action.setIcon({ tabId, path: iconPaths(state) });
    // Native count badge only in the blocking state; cleared in every other.
    const count = state === 'blocking' && summary ? concealedCount(summary) : 0;
    await browser.action.setBadgeText({ tabId, text: count > 0 ? String(count) : '' });
  } catch {
    // Tab closed / navigated between resolve and apply — the id is now stale.
  }
}

/** Refresh one tab by id (looks up its URL) — for `tabs.onActivated`, which
 *  hands over only the id. */
export async function refreshTabById(tabId: number): Promise<void> {
  try {
    const tab = await browser.tabs.get(tabId);
    await refreshTabIcon(tabId, tab.url);
  } catch {
    // Tab vanished before we could read it.
  }
}

/** Refresh the active tab in every window — a global change (settings, pause,
 *  snooze) moved, so the currently-visible icons must catch up. Background tabs
 *  refresh lazily when next activated. */
export async function refreshActiveTabs(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true });
  const pending: Promise<void>[] = [];
  for (const tab of tabs) {
    if (tab.id != null) pending.push(refreshTabIcon(tab.id, tab.url));
  }
  await Promise.all(pending);
}
