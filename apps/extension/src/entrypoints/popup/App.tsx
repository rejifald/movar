import { Bug, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { FEEDBACK_URL, SUPPORT_EMAIL } from '@movar/brand';
import { I18nProvider, useI18n, uiLanguageFromPriority } from '../../lib/i18n';
import type { PauseState } from '../../lib/pause';
import { hostMatchesAllowlist } from '../../lib/host-match';
import { StatusHeader } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { PauseControls } from './PauseControls';
import { ContentToggle } from './ContentToggle';
import { browserInfo, buildReportMailto, osInfo } from './report-mailto';
import { usePopupController } from './use-popup-controller';
import type { PopupController } from './use-popup-controller';

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

export function App() {
  const controller = usePopupController();

  return (
    <I18nProvider uiLanguage={uiLanguageFromPriority(controller.settings.priority)}>
      <PopupBody {...controller} />
    </I18nProvider>
  );
}

/**
 * Split out so `useI18n()` resolves under the provider above — calling it from
 * the same component that mounts `I18nProvider` would read the default context.
 */
function PopupBody({
  settings,
  pause,
  hidden,
  reportUrl,
  onTurnOn,
  onToggleContentModification,
  onPause,
  onResume,
  onRestore,
  onReloadTab,
  onEnableForSite,
  onOpenSettings,
}: Readonly<PopupController>) {
  // Active site's allowlist state — only meaningful when there's a page.
  const exempt =
    reportUrl == null
      ? false
      : hostMatchesAllowlist(new URL(reportUrl).hostname, settings.allowlist);

  return (
    <div className="bg-surface text-ink-strong w-[360px] font-sans text-sm">
      <StatusHeader
        settings={settings}
        pause={pause}
        hidden={hidden}
        exempt={exempt}
        hasPage={reportUrl !== null}
        actions={{ onReloadTab, onEnableForSite, onTurnOn }}
      />

      <ContentToggle
        enabled={settings.contentModification}
        onChange={onToggleContentModification}
      />

      {hidden !== null && settings.contentModification ? (
        <HiddenPanel hidden={hidden} onRestore={onRestore} />
      ) : null}

      <PauseControls pause={pause} onPause={onPause} onResume={onResume} />

      <PopupFooter
        settings={settings}
        pause={pause}
        reportUrl={reportUrl}
        exempt={exempt}
        onOpenSettings={onOpenSettings}
      />
    </div>
  );
}

interface PopupFooterProps {
  settings: MovarSettings;
  pause: PauseState;
  reportUrl: string | null;
  exempt: boolean;
  onOpenSettings: () => void;
}

/** The two footer rows: feedback + settings, then version + the contextual
 *  "report an issue" mailto. Split from `PopupBody` so the report-mailto
 *  assembly (which needs the live locale via `useI18n`) sits next to the markup
 *  that consumes it, and the body reads as a flat stack of panels. */
function PopupFooter({
  settings,
  pause,
  reportUrl,
  exempt,
  onOpenSettings,
}: Readonly<PopupFooterProps>) {
  const { t, locale } = useI18n();
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
  );
}

/** lucide Settings cog. Decorative — paired with the visible "Settings"
 *  label, so `aria-hidden`; sized at 12px to read cleanly next to the
 *  11.5-px footer text without dominating it. */
function GearIcon() {
  return <Settings size={12} aria-hidden="true" className="flex-shrink-0" />;
}
