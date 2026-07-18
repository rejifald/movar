import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { defaultSettings, isStorableDomain, normaliseDomain } from '@movar/settings';
import type { ConcealMode, MovarSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';
import { activeTabId, activeTabUrl, reloadActiveTab } from '../../lib/active-tab';
import {
  enableHostNow,
  getPauseState,
  isHostDisabledUntilUpdate,
  isHostSnoozed,
  pauseFor,
  resume,
  snoozeHost,
  unsnoozeHost,
} from '../../lib/pause';
import type { PauseDuration, PauseState } from '../../lib/pause';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { hostMatchesAllowlist } from '../../lib/host-match';

// openOptionsPage() naturally collapses the popup in Chrome and Firefox because
// focus shifts to the options surface — no explicit window.close() needed.
// Errors here aren't worth surfacing to the user; the link is a best-effort
// shortcut to a page they can also reach from the extension manager.
async function openSettings(): Promise<void> {
  try {
    await browser.runtime.openOptionsPage();
  } catch {
    // swallow — caller has no useful recovery path
  }
}

async function sendToActiveTab<T>(message: unknown): Promise<T | null> {
  const id = await activeTabId();
  if (id === undefined) return null;
  try {
    return await browser.tabs.sendMessage(id, message);
  } catch {
    // Content script not present (chrome://, store pages, fresh installs before reload).
    return null;
  }
}

// "Try switching again": clear the active tab's session guards (loop-guard
// history + this host's picker choice) via the content script, then reload so a
// fresh document_start pass re-runs the switch ladder. Module-scoped — closes
// over no component state; mirrors reloadActiveTab.
async function retrySwitchInActiveTab(): Promise<void> {
  await sendToActiveTab({ type: 'movar:retrySwitch' });
  await reloadActiveTab();
}

/** The popup's live read-model: the four state slots plus the setters the
 *  mutation layer writes through. Separated from the controller so the
 *  bootstrap-on-mount wiring is one cohesive unit and the handlers below read
 *  as a flat action list. */
interface PopupSnapshot {
  settings: MovarSettings;
  pause: PauseState;
  hidden: HiddenSummary | null;
  reportUrl: string | null;
  /** Epoch-ms the active host's snooze ends, or null when not snoozed. */
  snoozedUntil: number | null;
  /** Active host was turned off from the crash screen (cleared on the next
   *  Movar update). */
  disabledUntilUpdate: boolean;
  setSettings: (next: MovarSettings) => void;
  setPause: (next: PauseState) => void;
  setHidden: (next: HiddenSummary | null) => void;
  setSnoozedUntil: (next: number | null) => void;
  setDisabledUntilUpdate: (next: boolean) => void;
}

/** The active page's host, or null on a non-web tab. */
function hostOf(reportUrl: string | null): string | null {
  return reportUrl == null ? null : new URL(reportUrl).hostname;
}

/** State + bootstrap for the popup. Loads settings, pause state, and the active
 *  tab's per-page snapshot into independent slots on mount, and hands back the
 *  setters the controller's handlers refresh through. */
function usePopupSnapshot(): PopupSnapshot {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);
  const [pause, setPause] = useState<PauseState>({
    paused: false,
    until: null,
    indefinite: false,
  });
  const [hidden, setHidden] = useState<HiddenSummary | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(null);
  const [disabledUntilUpdate, setDisabledUntilUpdate] = useState(false);

  const refresh = useCallback(async () => {
    setSettings(await getSettings());
    setPause(await getPauseState());
    setHidden(await sendToActiveTab<HiddenSummary>({ type: 'movar:getHidden' }));
    const url = await activeTabUrl();
    setReportUrl(url);
    const host = hostOf(url);
    setSnoozedUntil(host == null ? null : await isHostSnoozed(host));
    setDisabledUntilUpdate(host == null ? false : await isHostDisabledUntilUpdate(host));
  }, []);

  useEffect(() => {
    // Initial load: pull settings, pause state, and the active tab's per-page
    // snapshot into React state on mount. The new react-hooks rule wants
    // useSyncExternalStore here, but that pattern doesn't fit the popup's
    // bootstrap (storage reads are async, several keys land into independent
    // state slots). Refactoring is tracked separately; the eslint bump
    // shouldn't block on it.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap reads several async storage keys into independent state slots on mount; useSyncExternalStore doesn't fit this shape (refactor tracked separately)
    void refresh();
  }, [refresh]);

  return {
    settings,
    pause,
    hidden,
    reportUrl,
    snoozedUntil,
    disabledUntilUpdate,
    setSettings,
    setPause,
    setHidden,
    setSnoozedUntil,
    setDisabledUntilUpdate,
  };
}

/** Everything `PopupBody` needs: the live popup state plus the void-returning
 *  callbacks its child surfaces invoke. The shape mirrors `PopupBodyProps` so
 *  `App` can spread it straight onto the view. */
export interface PopupController {
  settings: MovarSettings;
  pause: PauseState;
  hidden: HiddenSummary | null;
  reportUrl: string | null;
  /** Epoch-ms the active host's snooze ends, or null when not snoozed. */
  snoozedUntil: number | null;
  /** Active host was turned off from the crash screen (cleared on the next
   *  Movar update). */
  disabledUntilUpdate: boolean;
  onTurnOn: () => void;
  onToggleContentModification: (next: boolean) => void;
  onConcealModeChange: (next: ConcealMode) => void;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  onRestore: () => void;
  /** Clear the tab's session guards and reload so Movar re-attempts the switch. */
  onRetrySwitch: () => void;
  onReloadTab: () => void;
  onEnableForSite: () => void;
  /** Permanently exempt the active host (add it to the allowlist), then reload. */
  onExemptSite: () => void;
  onOpenSettings: () => void;
  /** Snooze the active host for a timed window (1h). */
  onSnoozeSite: () => void;
  /** End the active host's snooze now ("Resume now"). */
  onResumeSite: () => void;
}

/**
 * Owns the popup's state and the side-effecting handlers that mutate it. Lifted
 * out of `App` so the component is just `useController() → <PopupBody …/>`; the
 * async tab/settings plumbing the handlers lean on lives alongside the hook
 * here rather than cluttering the view module.
 */
export function usePopupController(): PopupController {
  const {
    settings,
    pause,
    hidden,
    reportUrl,
    snoozedUntil,
    disabledUntilUpdate,
    setSettings,
    setPause,
    setHidden,
    setSnoozedUntil,
  } = usePopupSnapshot();

  const updateSettings = async (next: MovarSettings): Promise<void> => {
    setSettings(next);
    await persistSettings(next);
  };

  // "Turn Movar on" from the off-state hero — enable globally, then reload so
  // the content script (which bailed at load while disabled) runs on this page.
  const handleTurnOn = async () => {
    await updateSettings({ ...settings, enabled: true });
    await reloadActiveTab();
  };

  const handlePause = async (duration: PauseDuration) => {
    await pauseFor(duration);
    setPause(await getPauseState());
  };

  const handleResume = async () => {
    await resume();
    setPause(await getPauseState());
  };

  const handleRestore = async () => {
    const next = await sendToActiveTab<HiddenSummary>({ type: 'movar:restoreHidden' });
    setHidden(next);
  };

  // "Turn on for this site": drop every exempt entry that matches the active
  // host (exact or pattern) AND any crash-screen disable, persist, then
  // reload — un-exempting alone does nothing until reload, since the content
  // script skips exempt/crash-disabled hosts at load.
  const handleEnableForSite = async () => {
    if (reportUrl == null || reportUrl === '') return;
    const host = new URL(reportUrl).hostname;
    const allowlist = settings.allowlist.filter((entry) => !hostMatchesAllowlist(host, [entry]));
    await updateSettings({ ...settings, allowlist });
    await enableHostNow(host);
    await reloadActiveTab();
  };

  // "Always skip this site": permanently exempt the active host — normalise it
  // to the canonical stored form, append it to the allowlist (the settings
  // boundary de-dupes + validates), then reload so the content script's
  // load-time allowlist gate goes inert. The reverse of handleEnableForSite.
  // No-op on a non-web tab or a host already covered by an existing entry (the
  // popup only surfaces this on an eligible page anyway — belt and suspenders).
  const handleExemptSite = async () => {
    const host = hostOf(reportUrl);
    if (host == null || hostMatchesAllowlist(host, settings.allowlist)) return;
    // Don't reload for a host the settings boundary would drop (a dotless
    // `localhost`/intranet name) — the popup already gates the affordance on
    // this, so this is the belt-and-suspenders match for that same rule.
    if (!isStorableDomain(host)) return;
    const domain = normaliseDomain(host);
    await updateSettings({ ...settings, allowlist: [...settings.allowlist, domain] });
    await reloadActiveTab();
  };

  // Per-site snooze: a timed break scoped to the active host. The content script
  // re-arms (or goes inert) via the snooze-map storage change without a reload;
  // the Accept-Language redirect applies on the next navigation.
  const handleSnoozeSite = async () => {
    const host = hostOf(reportUrl);
    if (host == null) return;
    await snoozeHost(host);
    setSnoozedUntil(await isHostSnoozed(host));
  };

  const handleResumeSite = async () => {
    const host = hostOf(reportUrl);
    if (host == null) return;
    await unsnoozeHost(host);
    setSnoozedUntil(null);
  };

  return {
    settings,
    pause,
    hidden,
    reportUrl,
    snoozedUntil,
    disabledUntilUpdate,
    onTurnOn: () => void handleTurnOn(),
    onToggleContentModification: (next) =>
      void updateSettings({ ...settings, contentModification: next }),
    onConcealModeChange: (next) => void updateSettings({ ...settings, concealMode: next }),
    onPause: (duration) => void handlePause(duration),
    onResume: () => void handleResume(),
    onRestore: () => void handleRestore(),
    onRetrySwitch: () => void retrySwitchInActiveTab(),
    onReloadTab: () => void reloadActiveTab(),
    onEnableForSite: () => void handleEnableForSite(),
    onExemptSite: () => void handleExemptSite(),
    onOpenSettings: () => void openSettings(),
    onSnoozeSite: () => void handleSnoozeSite(),
    onResumeSite: () => void handleResumeSite(),
  };
}
