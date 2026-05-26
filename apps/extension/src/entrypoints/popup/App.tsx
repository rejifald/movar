import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import {
  defaultSettings,
  PAUSE_DURATIONS,
  type CorrectionEvent,
  type HiddenSummary,
  type LanguageCode,
  type MovarSettings,
  type PauseDuration,
} from '@movar/shared';
import { getPauseState, pauseFor, resume, type PauseState } from '../../lib/pause';
import { buildAcceptLanguage } from '../../lib/accept-language';

const PAUSE_LABELS: Record<PauseDuration, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  session: 'Session',
  '1w': '1 week',
};

function formatUntil(state: PauseState): string {
  if (state.session) return 'until you restart the browser';
  if (state.until) return `until ${new Date(state.until).toLocaleString()}`;
  return '';
}

/** Map an ISO code to a human display name via Intl, falling back to the code. */
function displayLanguage(code: LanguageCode): string {
  try {
    const names = new Intl.DisplayNames(undefined, { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

async function activeTabId(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id;
}

async function sendToActiveTab<T>(message: unknown): Promise<T | null> {
  const id = await activeTabId();
  if (id === undefined) return null;
  try {
    return (await browser.tabs.sendMessage(id, message)) as T;
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
    const synced = await browser.storage.sync.get('settings');
    if (synced.settings) setSettings(synced.settings as MovarSettings);
    setPause(await getPauseState());

    const local = await browser.storage.local.get('movar:events');
    const events = (local['movar:events'] as CorrectionEvent[] | undefined) ?? [];
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
    await browser.storage.sync.set({ settings: next });
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

  const active = settings.enabled && !pause.paused;
  const hasHidden = hidden !== null && (hidden.languages.length > 0 || hidden.containers > 0);

  return (
    <div className="w-80 p-4 font-sans text-sm text-slate-900">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold">Movar</h1>
        <button
          type="button"
          onClick={() => void toggleEnabled()}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            settings.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
          }`}
        >
          {settings.enabled ? 'On' : 'Off'}
        </button>
      </header>

      <div
        className={`mb-3 rounded-md px-3 py-2 text-xs ${
          active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}
      >
        {active
          ? `Active — sending Accept-Language: ${buildAcceptLanguage(settings.priority)}`
          : pause.paused
            ? `Paused ${formatUntil(pause)}`
            : 'Turned off'}
      </div>

      <p className="mb-3 text-xs text-slate-500">Priority: {settings.priority.join(' → ')}</p>

      <div className="mb-3 rounded-lg bg-slate-50 p-3">
        <div className="text-2xl font-semibold">{correctionsToday}</div>
        <div className="text-xs text-slate-500">corrections today</div>
      </div>

      {hidden !== null && (
        <section className="mb-3 rounded-lg border border-slate-200 p-3">
          <h2 className="mb-1 text-xs font-semibold text-slate-700">On this page</h2>
          {hasHidden ? (
            <>
              <ul className="mb-2 space-y-0.5 text-xs text-slate-600">
                {hidden.languages.length > 0 && (
                  <li>
                    Hidden from pickers:{' '}
                    <span className="font-medium">
                      {hidden.languages.map(displayLanguage).join(', ')}
                    </span>
                  </li>
                )}
                {hidden.containers > 0 && (
                  <li>
                    Collapsed{' '}
                    <span className="font-medium">
                      {hidden.containers} {hidden.containers === 1 ? 'picker' : 'pickers'}
                    </span>{' '}
                    with only one option left
                  </li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => void handleRestore()}
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Show everything on this page
              </button>
              <p className="mt-1 text-[10px] text-slate-400">Reload the page to re-apply Movar.</p>
            </>
          ) : (
            <p className="text-xs text-slate-500">
              {hidden.userOverride
                ? 'Restored on this page — reload to re-apply.'
                : 'Nothing hidden here.'}
            </p>
          )}
        </section>
      )}

      {pause.paused ? (
        <button
          type="button"
          onClick={() => void handleResume()}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
        >
          Resume now
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {PAUSE_DURATIONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => void handlePause(value)}
              className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
            >
              Pause {PAUSE_LABELS[value]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
