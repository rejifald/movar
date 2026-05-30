import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  defaultSettings,
  FEEDBACK_URL,
  type HiddenSummary,
  type MovarSettings,
  type PauseDuration,
  type UiLanguage,
} from '@movar/shared';
import { getEvents } from '../../lib/events';
import { I18nProvider, useI18n } from '../../lib/i18n';
import { getPauseState, pauseFor, resume, type PauseState } from '../../lib/pause';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { LanguageSelector } from '../../components/LanguageSelector';
import { StatusHeader } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { PauseControls } from './PauseControls';
import { ContentToggle } from './ContentToggle';

// Resolved at module load, but guarded so the bundle still evaluates when
// previewed via static-serve (no chrome.runtime). In the real extension
// context this hits `getManifest()` exactly once per popup open.
const version = ((): string => {
  try {
    return browser.runtime.getManifest().version;
  } catch {
    return 'preview';
  }
})();

async function activeTabId(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
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

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);
  const [pause, setPause] = useState<PauseState>({
    paused: false,
    until: null,
    indefinite: false,
  });
  const [correctionsToday, setCorrectionsToday] = useState(0);
  const [hidden, setHidden] = useState<HiddenSummary | null>(null);

  const refreshHidden = useCallback(async () => {
    const summary = await sendToActiveTab<HiddenSummary>({ type: 'movar:getHidden' });
    setHidden(summary);
  }, []);

  const refresh = useCallback(async () => {
    setSettings(await getSettings());
    setPause(await getPauseState());

    const events = await getEvents();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setCorrectionsToday(events.filter((e) => e.timestamp >= startOfDay.getTime()).length);

    await refreshHidden();
  }, [refreshHidden]);

  useEffect(() => {
    // Initial load: pull settings, pause state, and corrections from browser
    // storage into React state on mount. The new react-hooks rule wants
    // useSyncExternalStore here, but that pattern doesn't fit the popup's
    // bootstrap (storage reads are async, several keys land into independent
    // state slots). Refactoring is tracked separately; the eslint bump
    // shouldn't block on it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const updateSettings = async (next: MovarSettings): Promise<void> => {
    setSettings(next);
    await persistSettings(next);
  };

  const toggleEnabled = () => updateSettings({ ...settings, enabled: !settings.enabled });
  const setUiLanguage = (next: UiLanguage) => updateSettings({ ...settings, uiLanguage: next });
  const setContentModification = (next: boolean) =>
    updateSettings({ ...settings, contentModification: next });

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

  return (
    <I18nProvider uiLanguage={settings.uiLanguage}>
      <PopupBody
        settings={settings}
        pause={pause}
        correctionsToday={correctionsToday}
        hidden={hidden}
        onToggleEnabled={() => void toggleEnabled()}
        onToggleContentModification={(next) => void setContentModification(next)}
        onPause={(duration) => void handlePause(duration)}
        onResume={() => void handleResume()}
        onRestore={() => void handleRestore()}
        onChangeUiLanguage={(next) => void setUiLanguage(next)}
        onOpenSettings={() => void openSettings()}
      />
    </I18nProvider>
  );
}

interface PopupBodyProps {
  settings: MovarSettings;
  pause: PauseState;
  correctionsToday: number;
  hidden: HiddenSummary | null;
  onToggleEnabled: () => void;
  onToggleContentModification: (next: boolean) => void;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  onRestore: () => void;
  onChangeUiLanguage: (next: UiLanguage) => void;
  onOpenSettings: () => void;
}

/**
 * Split out so `useI18n()` resolves under the provider above — calling it from
 * the same component that mounts `I18nProvider` would read the default context.
 */
function PopupBody({
  settings,
  pause,
  correctionsToday,
  hidden,
  onToggleEnabled,
  onToggleContentModification,
  onPause,
  onResume,
  onRestore,
  onChangeUiLanguage,
  onOpenSettings,
}: PopupBodyProps) {
  const { t } = useI18n();

  return (
    <div className="bg-surface text-ink-strong w-[360px] font-sans text-sm">
      <StatusHeader
        settings={settings}
        pause={pause}
        correctionsToday={correctionsToday}
        onToggleEnabled={onToggleEnabled}
      />

      <ContentToggle
        enabled={settings.contentModification}
        onChange={onToggleContentModification}
      />

      {hidden !== null && settings.contentModification ? (
        <HiddenPanel hidden={hidden} onRestore={onRestore} />
      ) : null}

      <PauseControls pause={pause} onPause={onPause} onResume={onResume} />

      <footer className="border-border text-ink-faint border-t px-[18px] py-3 text-[11.5px]">
        <div className="flex items-center justify-between">
          <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
            {t.feedback}
          </a>
          <button
            type="button"
            onClick={onOpenSettings}
            className="hover:text-ink-strong inline-flex items-center gap-1 transition-colors"
          >
            <GearIcon />
            {t.settings}
          </button>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="font-mono text-[10.5px] tracking-wide">v{version}</span>
          <LanguageSelector value={settings.uiLanguage} onChange={onChangeUiLanguage} />
        </div>
      </footer>
    </div>
  );
}

/** Heroicons-style mini cog. Decorative — paired with the visible "Settings"
 *  label, so `aria-hidden`; sized at 12px to read cleanly next to the
 *  11.5-px footer text without dominating it. */
function GearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="12"
      height="12"
      fill="currentColor"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 0 1-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 0 1 .947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 0 1 2.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 0 1 2.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 0 1 .947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 0 1-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 0 1-2.287-.947zM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
      />
    </svg>
  );
}
