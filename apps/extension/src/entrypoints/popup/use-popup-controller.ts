import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';
import { getPauseState, pauseFor, resume } from '../../lib/pause';
import type { PauseDuration, PauseState } from '../../lib/pause';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { hostMatchesAllowlist } from '../../lib/host-match';

async function activeTabId(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

// The active tab's URL, but only when it's an http(s) page worth attaching to a
// report. chrome://, the Web Store, the new-tab page, and PDF/file viewers
// return null — the report link still shows, but sends a page-less report.
async function activeTabUrl(): Promise<string | null> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  return url != null && /^https?:/i.test(url) ? url : null;
}

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

// Reload the active tab so the content script runs / re-runs, then close the
// popup — the user reopens to see the refreshed state. Module-scoped: closes
// over no component state.
async function reloadActiveTab(): Promise<void> {
  const id = await activeTabId();
  if (id !== undefined) {
    try {
      await browser.tabs.reload(id);
    } catch {
      // chrome:// / store tabs can't always be reloaded by the extension; the
      // setting change still persisted, so Movar runs on the next web page.
    }
  }
  window.close();
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
  setSettings: (next: MovarSettings) => void;
  setPause: (next: PauseState) => void;
  setHidden: (next: HiddenSummary | null) => void;
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

  const refresh = useCallback(async () => {
    setSettings(await getSettings());
    setPause(await getPauseState());
    setHidden(await sendToActiveTab<HiddenSummary>({ type: 'movar:getHidden' }));
    setReportUrl(await activeTabUrl());
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

  return { settings, pause, hidden, reportUrl, setSettings, setPause, setHidden };
}

/** Everything `PopupBody` needs: the live popup state plus the void-returning
 *  callbacks its child surfaces invoke. The shape mirrors `PopupBodyProps` so
 *  `App` can spread it straight onto the view. */
export interface PopupController {
  settings: MovarSettings;
  pause: PauseState;
  hidden: HiddenSummary | null;
  reportUrl: string | null;
  onTurnOn: () => void;
  onToggleContentModification: (next: boolean) => void;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  onRestore: () => void;
  onReloadTab: () => void;
  onEnableForSite: () => void;
  onOpenSettings: () => void;
}

/**
 * Owns the popup's state and the side-effecting handlers that mutate it. Lifted
 * out of `App` so the component is just `useController() → <PopupBody …/>`; the
 * async tab/settings plumbing the handlers lean on lives alongside the hook
 * here rather than cluttering the view module.
 */
export function usePopupController(): PopupController {
  const { settings, pause, hidden, reportUrl, setSettings, setPause, setHidden } =
    usePopupSnapshot();

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
  // host (exact or pattern), persist, then reload — un-exempting alone does
  // nothing until reload, since the content script skips exempt hosts at load.
  const handleEnableForSite = async () => {
    if (reportUrl == null || reportUrl === '') return;
    const host = new URL(reportUrl).hostname;
    const allowlist = settings.allowlist.filter((entry) => !hostMatchesAllowlist(host, [entry]));
    await updateSettings({ ...settings, allowlist });
    await reloadActiveTab();
  };

  return {
    settings,
    pause,
    hidden,
    reportUrl,
    onTurnOn: () => void handleTurnOn(),
    onToggleContentModification: (next) =>
      void updateSettings({ ...settings, contentModification: next }),
    onPause: (duration) => void handlePause(duration),
    onResume: () => void handleResume(),
    onRestore: () => void handleRestore(),
    onReloadTab: () => void reloadActiveTab(),
    onEnableForSite: () => void handleEnableForSite(),
    onOpenSettings: () => void openSettings(),
  };
}
