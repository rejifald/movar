import { Bug, Flag, RotateCw, Settings } from 'lucide-react';
import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { FEEDBACK_URL, SUPPORT_EMAIL } from '@movar/brand';
import { I18nProvider, useI18n, uiLanguageFromPriority } from '@movar/i18n';
import type { Messages } from '@movar/i18n';
import { cn } from '@movar/ui';
import type { PauseState } from '../../lib/pause';
import type { HiddenSummary } from '../../lib/messaging';
import { hostMatchesAllowlist } from '../../lib/host-match';
import { StatusHeader, resolveHero } from './StatusHeader';
import type { HeroState } from './StatusHeader';
import { HiddenPanel } from './HiddenPanel';
import { PauseControls } from './PauseControls';
import { POPUP_WIDTH_CLASS } from './popup-shell';
import { ContentToggle } from '@movar/options-ui';
import { Button } from '@movar/ui';
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

// iOS wraps the popup in its own native sheet (title bar + "Done" button) and
// expects the content to fill it, unlike Chrome/Firefox/macOS Safari, which
// auto-size a floating popup window around the fixed-width box below. A
// percentage width/height only has something to resolve against once
// html/body actually carry a height, so that's set up before the fill class
// below takes effect. Safari Web Extensions are iOS's only extension popup
// surface, so the OS check alone identifies this surface.
/** iOS Dynamic Type's default body point size (17pt), and the ~15% uplift the
 *  native popup sheet needs (it renders at non-Retina resolution) — see the
 *  isIOS block. */
const IOS_BODY_PT_DEFAULT = 17;
const IOS_TYPE_UPLIFT_PCT = 115;

const isIOS = osLabel === 'iOS';
if (isIOS && typeof document !== 'undefined') {
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';

  // Respect the system text size (Dynamic Type) while keeping the ~15% uplift the
  // native iOS sheet needs — it renders the popup at non-Retina resolution, where
  // desktop px read cramped (see #179). Measure the current `-apple-system-body`
  // point size (it tracks the user's Text Size / Accessibility "Larger Text"),
  // then set the root font-size to that relative to the 17pt default, times 115%.
  // Every size in the popup is rem- or `--text-ui-*`-relative, so the whole UI
  // starts comfortable AND grows with the system setting. Falls back to the flat
  // 115% (17pt) if the keyword can't be measured.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;font:-apple-system-body';
  document.body.appendChild(probe);
  const bodyPt = Number.parseFloat(getComputedStyle(probe).fontSize) || IOS_BODY_PT_DEFAULT;
  probe.remove();
  document.documentElement.style.fontSize = `${(bodyPt / IOS_BODY_PT_DEFAULT) * IOS_TYPE_UPLIFT_PCT}%`;

  // `--text-ui-*` are fixed px in tokens.css, so root scaling doesn't reach them;
  // set them in rem here so the shared @movar/ui controls scale with the root.
  const root = document.documentElement.style;
  root.setProperty('--text-ui-micro', '0.72rem');
  root.setProperty('--text-ui-xs', '0.76rem');
  root.setProperty('--text-ui-sm', '0.8rem');
  root.setProperty('--text-ui-base', '0.9rem');
  root.setProperty('--text-ui-md', '0.96rem');
}

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
    <I18nProvider
      uiLanguage={uiLanguageFromPriority(controller.settings.priority)}
      browserUiLanguage={browser.i18n.getUILanguage()}
    >
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
  onRetrySwitch,
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
      className={cn(
        'bg-surface text-ink-strong text-ui-md font-sans',
        isIOS ? 'min-h-full w-full' : POPUP_WIDTH_CLASS,
      )}
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
          switchSuppressed={hidden?.switchSuppressed ?? false}
          onRetrySwitch={onRetrySwitch}
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
    <footer className="border-border text-ink-faint text-ui-xs border-t px-4.5 py-3">
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
        <span className="text-ui-micro font-mono tracking-wide">v{version}</span>
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

/** Contextual band rendered only on a `blocked` hero (see PopupBody). When a
 *  session guard is actively suppressing the switch (`switchSuppressed`), it
 *  leads with a "Try switching again" button that clears the guard and reloads
 *  the tab; the site simply having no target language leaves only the mailto
 *  report. The report reuses {@link buildReportMailto} with the blocked-site
 *  prompt — still `mailto:`-only, no network. The footer keeps the generic
 *  report link for every other state. */
function BlockedSiteReport({
  t,
  ctx,
  switchSuppressed,
  onRetrySwitch,
}: Readonly<{
  t: Messages;
  ctx: ReportContext;
  switchSuppressed: boolean;
  onRetrySwitch: () => void;
}>) {
  const href = buildReportMailto(SUPPORT_EMAIL, t.report, ctx, {
    bodyPrompt: t.report.blockedSite.prompt,
  });
  return (
    <div className="border-border flex flex-col gap-2.5 border-b px-4.5 py-2.5">
      {switchSuppressed ? (
        <Button variant="secondary" size="sm" fullWidth onClick={onRetrySwitch}>
          <RotateCw size={13} aria-hidden="true" className="flex-shrink-0" />
          {t.pageStatus.retrySwitch}
        </Button>
      ) : null}
      <a
        href={href}
        className="text-ink-soft hover:text-ink-strong text-ui-base inline-flex items-center gap-1.5 transition-colors"
      >
        <Flag size={12} aria-hidden="true" className="flex-shrink-0" />
        {t.report.blockedSite.link}
      </a>
    </div>
  );
}
