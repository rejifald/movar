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
import { StatusHeader } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { LanguageSelector } from './LanguageSelector';
import { PauseControls } from './PauseControls';

async function activeTabId(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
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
  const [pause, setPause] = useState<PauseState>({ paused: false, until: null, session: false });
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
    void refresh();
  }, [refresh]);

  const updateSettings = async (next: MovarSettings): Promise<void> => {
    setSettings(next);
    await persistSettings(next);
  };

  const toggleEnabled = () => updateSettings({ ...settings, enabled: !settings.enabled });
  const setUiLanguage = (next: UiLanguage) => updateSettings({ ...settings, uiLanguage: next });

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
        onPause={(duration) => void handlePause(duration)}
        onResume={() => void handleResume()}
        onRestore={() => void handleRestore()}
        onChangeUiLanguage={(next) => void setUiLanguage(next)}
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
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  onRestore: () => void;
  onChangeUiLanguage: (next: UiLanguage) => void;
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
  onPause,
  onResume,
  onRestore,
  onChangeUiLanguage,
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

      {hidden !== null && settings.contentModification ? (
        <HiddenPanel hidden={hidden} onRestore={onRestore} />
      ) : null}

      <PauseControls pause={pause} onPause={onPause} onResume={onResume} />

      <footer className="border-border text-ink-faint flex items-center justify-between border-t px-[18px] py-3 text-[11.5px]">
        <a href={FEEDBACK_URL} className="hover:text-ink-strong transition-colors">
          {t.feedback}
        </a>
        <LanguageSelector value={settings.uiLanguage} onChange={onChangeUiLanguage} />
      </footer>
    </div>
  );
}
