import { Bug, Flag, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { FEEDBACK_URL, SUPPORT_EMAIL } from '@movar/brand';
import { I18nProvider, useI18n, uiLanguageFromPriority } from '../../lib/i18n';
import type { Messages } from '../../lib/i18n';
import type { PauseState } from '../../lib/pause';
import type { HiddenSummary } from '../../lib/messaging';
import { hostMatchesAllowlist } from '../../lib/host-match';
import { StatusHeader, resolveHero } from './StatusHeader';
import type { HeroState } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { PauseControls } from './PauseControls';
import { ContentToggle } from '../../components/ContentToggle';
import { browserInfo, buildReportMailto, osInfo } from './report-mailto';
import type { ReportContext } from './report-mailto';
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

/** Assemble the {@link ReportContext} both report affordances share (the footer
 *  link and the contextual blocked-site link), so the diagnostic snapshot can't
 *  drift between them. Pure — the module-level UA/version constants plus the
 *  live settings/pause/locale. */
function buildReportContext(args: {
  settings: MovarSettings;
  pause: PauseState;
  reportUrl: string | null;
  locale: string;
  exempt: boolean;
}): ReportContext {
  const { settings, pause, reportUrl, locale, exempt } = args;
  return {
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
  };
}

export function App() {
  const controller = usePopupController();

  return (
    <I18nProvider uiLanguage={uiLanguageFromPriority(controller.settings.priority)}>
      <PopupBody {...controller} />
    </I18nProvider>
  );
}

/** The popup's derived view state, computed once from the live snapshot. */
export interface PopupView {
  /** Active host is on the exempt (allowlist) list. */
  exempt: boolean;
  /** Resolved active-state hero, or null when paused/off (those build their own
   *  view in StatusHeader). Drives the contextual blocked-site report. */
  hero: HeroState | null;
  /** Whether to offer the per-site snooze affordance. */
  canSnooze: boolean;
}

/**
 * Derive the popup's view flags from the live snapshot. Pure + exported so the
 * branchy "what does the popup show" logic is unit-tested directly and
 * `PopupBody` stays a flat render.
 *
 * The contextual blocked-site report keys off `hero.kind === 'blocked'`; the
 * hero is resolved only while Movar is active (enabled and not globally paused),
 * so the paused/off hero StatusHeader renders never spawns a stray report. A
 * snooze is offerable only on a real page that isn't already exempt or snoozed.
 */
export function resolvePopupView(
  settings: MovarSettings,
  pause: PauseState,
  hidden: HiddenSummary | null,
  reportUrl: string | null,
  snoozedUntil: number | null,
): PopupView {
  const exempt =
    reportUrl == null
      ? false
      : hostMatchesAllowlist(new URL(reportUrl).hostname, settings.allowlist);
  const active = settings.enabled && !pause.paused;
  const hero = active
    ? resolveHero(hidden, exempt, reportUrl !== null, settings, snoozedUntil)
    : null;
  const canSnooze = reportUrl !== null && !exempt && snoozedUntil == null;
  return { exempt, hero, canSnooze };
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
  snoozedUntil,
  onTurnOn,
  onToggleContentModification,
  onConcealModeChange,
  onPause,
  onResume,
  onRestore,
  onReloadTab,
  onEnableForSite,
  onOpenSettings,
  onSnoozeSite,
  onResumeSite,
}: Readonly<PopupController>) {
  const { t, locale } = useI18n();
  const { exempt, hero, canSnooze } = resolvePopupView(
    settings,
    pause,
    hidden,
    reportUrl,
    snoozedUntil,
  );

  return (
    // `data-testid` is the stable hook the screenshot pipeline's clip guard
    // keys off (scripts/capture-storybook-assets.mts): any captured scene that
    // embeds the real popup is checked for the popup overflowing the canvas.
    <div
      data-testid="popup-root"
      className="bg-surface text-ink-strong w-[360px] font-sans text-sm"
    >
      <StatusHeader
        settings={settings}
        pause={pause}
        hidden={hidden}
        exempt={exempt}
        hasPage={reportUrl !== null}
        snoozedUntil={snoozedUntil}
        actions={{ onReloadTab, onEnableForSite, onTurnOn, onResumeSite }}
      />

      {hero?.kind === 'blocked' ? (
        <BlockedSiteReport
          t={t}
          ctx={buildReportContext({ settings, pause, reportUrl, locale, exempt })}
        />
      ) : null}

      <ContentToggle
        enabled={settings.contentModification}
        concealMode={settings.concealMode}
        onToggle={onToggleContentModification}
        onConcealModeChange={onConcealModeChange}
      />

      {hidden !== null && settings.contentModification ? (
        <HiddenPanel hidden={hidden} onRestore={onRestore} />
      ) : null}

      <PauseControls
        pause={pause}
        onPause={onPause}
        onResume={onResume}
        onSnoozeSite={canSnooze ? onSnoozeSite : undefined}
      />

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
  const reportHref = buildReportMailto(
    SUPPORT_EMAIL,
    t.report,
    buildReportContext({ settings, pause, reportUrl, locale, exempt }),
  );

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

/** Contextual "this site ignored my language" report — rendered only on a
 *  `blocked` hero (see PopupBody). Reuses {@link buildReportMailto} with the
 *  blocked-site prompt; still `mailto:`-only, no network. The footer keeps the
 *  generic report link for every other state. */
function BlockedSiteReport({ t, ctx }: Readonly<{ t: Messages; ctx: ReportContext }>) {
  const href = buildReportMailto(SUPPORT_EMAIL, t.report, ctx, {
    bodyPrompt: t.report.blockedSite.prompt,
  });
  return (
    <div className="border-border border-b px-[18px] py-2.5">
      <a
        href={href}
        className="text-ink-soft hover:text-ink-strong inline-flex items-center gap-1.5 text-[12.5px] transition-colors"
      >
        <Flag size={12} aria-hidden="true" className="flex-shrink-0" />
        {t.report.blockedSite.link}
      </a>
    </div>
  );
}
