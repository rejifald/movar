import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  defaultSettings,
  type HiddenSummary,
  type MovarSettings,
  type PauseDuration,
} from '@movar/shared';
import { getEvents } from '../../lib/events';
import { getPauseState, pauseFor, resume, type PauseState } from '../../lib/pause';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { StatusHeader } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
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

  const toggleEnabled = async () => {
    const next: MovarSettings = { ...settings, enabled: !settings.enabled };
    setSettings(next);
    await persistSettings(next);
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

  return (
    <div className="bg-surface text-ink-strong w-[360px] font-sans text-sm">
      <StatusHeader
        settings={settings}
        pause={pause}
        correctionsToday={correctionsToday}
        onToggleEnabled={() => void toggleEnabled()}
      />

      {hidden !== null && settings.contentModification ? (
        <HiddenPanel hidden={hidden} onRestore={() => void handleRestore()} />
      ) : null}

      <PauseControls
        pause={pause}
        onPause={(duration) => void handlePause(duration)}
        onResume={() => void handleResume()}
      />
    </div>
  );
}
