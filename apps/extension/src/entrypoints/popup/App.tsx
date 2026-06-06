import { Bug, Settings } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { FEEDBACK_URL, SUPPORT_EMAIL } from '@movar/brand';
import type { HiddenSummary } from '../../lib/messaging';
import { getEvents } from '../../lib/events';
import { I18nProvider, useI18n, uiLanguageFromPriority } from '../../lib/i18n';
import { getPauseState, pauseFor, resume } from '../../lib/pause';
import type { PauseDuration, PauseState } from '../../lib/pause';
import { getSettings, setSettings as persistSettings } from '../../lib/settings';
import { hostMatchesAllowlist } from '../../lib/host-match';
import { StatusHeader } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { PauseControls } from './PauseControls';
import { ContentToggle } from './ContentToggle';
import { browserInfo, buildReportMailto, osInfo } from './report-mailto';

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

// Short browser + OS labels for the report email, parsed once from the UA.
// Best-effort tokens ("Chrome 120", "macOS"); see report-mailto.ts.
const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const browserLabel = browserInfo(userAgent);
const osLabel = osInfo(userAgent);

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

export function App() {
  const [settings, setSettings] = useState<MovarSettings>(defaultSettings);
  const [pause, setPause] = useState<PauseState>({
    paused: false,
    until: null,
    indefinite: false,
  });
  const [correctionsToday, setCorrectionsToday] = useState(0);
  const [hidden, setHidden] = useState<HiddenSummary | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);

  const refreshHidden = useCallback(async () => {
    const summary = await sendToActiveTab<HiddenSummary>({ type: 'movar:getHidden' });
    setHidden(summary);
  }, []);

  const refresh = useCallback(async () => {
    const next = await getSettings();
    setSettings(next);
    setPause(await getPauseState());

    const events = await getEvents();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    setCorrectionsToday(events.filter((e) => e.timestamp >= startOfDay.getTime()).length);

    await refreshHidden();
    setReportUrl(await activeTabUrl());
  }, [refreshHidden]);

  useEffect(() => {
    // Initial load: pull settings, pause state, and corrections from browser
    // storage into React state on mount. The new react-hooks rule wants
    // useSyncExternalStore here, but that pattern doesn't fit the popup's
    // bootstrap (storage reads are async, several keys land into independent
    // state slots). Refactoring is tracked separately; the eslint bump
    // shouldn't block on it.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap reads several async storage keys into independent state slots on mount; useSyncExternalStore doesn't fit this shape (refactor tracked separately)
    void refresh();
  }, [refresh]);

  const updateSettings = async (next: MovarSettings): Promise<void> => {
    setSettings(next);
    await persistSettings(next);
  };

  const toggleEnabled = async () => updateSettings({ ...settings, enabled: !settings.enabled });
  const setContentModification = async (next: boolean) =>
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
    <I18nProvider uiLanguage={uiLanguageFromPriority(settings.priority)}>
      <PopupBody
        settings={settings}
        pause={pause}
        correctionsToday={correctionsToday}
        hidden={hidden}
        reportUrl={reportUrl}
        onToggleEnabled={() => void toggleEnabled()}
        onToggleContentModification={(next) => void setContentModification(next)}
        onPause={(duration) => void handlePause(duration)}
        onResume={() => void handleResume()}
        onRestore={() => void handleRestore()}
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
  reportUrl: string | null;
  onToggleEnabled: () => void;
  onToggleContentModification: (next: boolean) => void;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  onRestore: () => void;
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
  reportUrl,
  onToggleEnabled,
  onToggleContentModification,
  onPause,
  onResume,
  onRestore,
  onOpenSettings,
}: Readonly<PopupBodyProps>) {
  const { t, locale } = useI18n();

  // Active site's allowlist state — only meaningful when there's a page.
  const exempt =
    reportUrl == null
      ? false
      : hostMatchesAllowlist(new URL(reportUrl).hostname, settings.allowlist);
  const reportHref = buildReportMailto(SUPPORT_EMAIL, t.report, {
    pageUrl: reportUrl,
    version,
    browser: browserLabel,
    os: osLabel,
    locale,
    enabled: settings.enabled,
    paused: pause.paused,
    hiding: settings.contentModification,
    priority: settings.priority,
    blocked: settings.blocked,
    exempt,
  });

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
          {/* Replaces the old UI-language picker — the popup now follows the
              user's preferred-language order. Always shown; on a non-web tab
              `reportUrl` is null and the mailto omits the page line. */}
          <a
            href={reportHref}
            className="hover:text-ink-strong inline-flex items-center gap-1 transition-colors"
          >
            <Bug size={12} aria-hidden="true" className="flex-shrink-0" />
            {t.report.link}
          </a>
        </div>
      </footer>
    </div>
  );
}

/** lucide Settings cog. Decorative — paired with the visible "Settings"
 *  label, so `aria-hidden`; sized at 12px to read cleanly next to the
 *  11.5-px footer text without dominating it. */
function GearIcon() {
  return <Settings size={12} aria-hidden="true" className="flex-shrink-0" />;
}
