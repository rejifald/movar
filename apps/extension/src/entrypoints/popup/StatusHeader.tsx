import {
  Check,
  CircleSlash,
  EyeOff,
  Globe,
  Info,
  Pause,
  Power,
  RotateCw,
  TriangleAlert,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import { BrandMark, Button, Text } from '@movar/ui';
import type { HiddenSummary } from '../../lib/messaging';
import type { PauseState } from '../../lib/pause';
import { getActivityState, resolveHero } from '../../lib/status-resolver';
import type { ActivityState, HeroState } from '../../lib/status-resolver';
import { useI18n, makeLanguageDisplay } from '@movar/i18n';
import type { Messages, ResolvedLocale } from '@movar/i18n';

// `resolveHero`/`HeroState` (and the `getActivityState`/`ActivityState` used
// below) moved to the shared, React-free `status-resolver` so the background can
// reuse them to drive the toolbar icon without bundling React. Re-exported here
// so the popup's existing importers (App, tests) keep their `./StatusHeader`
// import path unchanged.
export { resolveHero } from '../../lib/status-resolver';
export type { HeroState } from '../../lib/status-resolver';

/** Localised "paused until X" line — used in the body when paused, lifted out
 *  of the component so the JSX path stays linear. Date is formatted in the
 *  popup locale rather than the browser's implicit Intl default so weekday/
 *  month names match the surrounding UI. */
function formatPausedUntil(state: PauseState, t: Messages, locale: ResolvedLocale): string {
  if (state.indefinite) return t.pausedIndefinitely;
  if (state.until != null) return t.pausedUntilDate(new Date(state.until).toLocaleString(locale));
  return t.pausedNoEnd;
}

/** Actions a terminal hero state's CTA can trigger. */
export interface HeroActions {
  /** Reload the active tab (so the content script runs / re-runs). */
  onReloadTab: () => void;
  /** Remove the active site from the exempt list, then reload it. */
  onEnableForSite: () => void;
  /** Turn Movar on globally (off-state CTA), then reload so it runs here. */
  onTurnOn: () => void;
  /** End the active host's snooze now ("Resume now" on the snoozed hero). */
  onResumeSite: () => void;
}

interface HeroView {
  icon: LucideIcon;
  /** `accent` = Movar actively did something good here; `muted` = informational
   *  (nothing to do, can't act, or inert). Drives the badge colour. */
  tone: 'accent' | 'muted';
  title: string;
  detail?: string;
  /** Primary action for a terminal state (reload, un-exempt). Mutually
   *  exclusive with the priority chain — when Movar isn't acting on the page,
   *  the next step is the point, not the preference order. */
  cta?: { label: string; onClick: () => void };
  /** Show the preferred-language chain. True for the working/informational
   *  states; false when a CTA replaces it or the chain is irrelevant (noPage). */
  showChain: boolean;
}

interface HeroViewCtx {
  t: Messages;
  displayName: (code: LanguageCode) => string;
  actions: HeroActions;
  /** Popup locale — formats the snoozed hero's "until" date in the UI locale. */
  locale: ResolvedLocale;
}

/** Per-kind hero-view builders. The `satisfies` clause keeps this exhaustive (a
 *  missing `HeroState['kind']` is a compile error, like the old switch) and
 *  narrows each builder's `hero` to its own variant — so the table replaces the
 *  switch without losing either guarantee, and the dispatch stays branch-free. */
const HERO_VIEWS = {
  served: (hero, { t, displayName }) => ({
    icon: Check,
    tone: 'accent',
    title: t.pageStatus.servedIn(displayName(hero.language)),
    showChain: true,
  }),
  hiding: (hero, { t, displayName }) => ({
    icon: EyeOff,
    tone: 'accent',
    title: t.pageStatus.hiding(hero.languages.map(displayName)),
    showChain: true,
  }),
  blocked: (hero, { t, displayName }) => ({
    icon: Info,
    tone: 'muted',
    title: t.pageStatus.blockedTitle(displayName(hero.language)),
    detail: t.pageStatus.blockedDetail,
    showChain: true,
  }),
  clean: (_hero, { t }) => ({
    icon: Check,
    tone: 'muted',
    title: t.pageStatus.clean,
    showChain: true,
  }),
  reload: (_hero, { t, actions }) => ({
    icon: RotateCw,
    tone: 'muted',
    title: t.pageStatus.reload,
    cta: { label: t.pageStatus.reloadCta, onClick: actions.onReloadTab },
    showChain: false,
  }),
  exempt: (hero, { t, actions }) => ({
    icon: CircleSlash,
    tone: 'muted',
    title: t.pageStatus.exemptTitle,
    detail: hero.untilUpdate ? t.pageStatus.exemptUntilUpdateDetail : t.pageStatus.exemptDetail,
    cta: { label: t.pageStatus.enableSiteCta, onClick: actions.onEnableForSite },
    showChain: false,
  }),
  snoozed: (hero, { t, actions, locale }) => ({
    icon: Pause,
    tone: 'muted',
    title: t.pageStatus.snoozedTitle,
    detail: t.pausedUntilDate(new Date(hero.until).toLocaleString(locale)),
    cta: { label: t.pause.resume, onClick: actions.onResumeSite },
    showChain: false,
  }),
  noPage: (_hero, { t }) => ({
    icon: Globe,
    tone: 'muted',
    title: t.pageStatus.noPage,
    showChain: false,
  }),
} satisfies {
  [K in HeroState['kind']]: (hero: Extract<HeroState, { kind: K }>, ctx: HeroViewCtx) => HeroView;
};

/** Resolve copy + iconography + action for a hero state via the exhaustive
 *  per-kind table above. The cast bridges the indexed union of builders to a
 *  single call signature — sound because `hero.kind` selects its own builder. */
function heroView(
  hero: HeroState,
  t: Messages,
  displayName: (code: LanguageCode) => string,
  actions: HeroActions,
  locale: ResolvedLocale,
): HeroView {
  const build = HERO_VIEWS[hero.kind] as (hero: HeroState, ctx: HeroViewCtx) => HeroView;
  return build(hero, { t, displayName, actions, locale });
}

function badgeClass(tone: HeroView['tone']): string {
  const base = 'flex size-7 flex-shrink-0 items-center justify-center rounded-full';
  return tone === 'accent'
    ? `${base} bg-accent text-accent-on shadow-sm`
    : `${base} bg-surface-3 text-ink-soft`;
}

/** Hero view for the paused state — same icon + title + subtitle shape as the
 *  active states (muted, since Movar isn't acting). Subtitle carries the
 *  resume timing via `formatPausedUntil`. */
function pausedView(pause: PauseState, t: Messages, locale: ResolvedLocale): HeroView {
  return {
    icon: Pause,
    tone: 'muted',
    title: t.pausedTitle,
    detail: formatPausedUntil(pause, t, locale),
    showChain: false,
  };
}

/** Hero view for the off (globally disabled) state — carries the "Turn Movar
 *  on" CTA, since the corner no longer has a toggle. */
function offView(t: Messages, actions: HeroActions): HeroView {
  return {
    icon: Power,
    tone: 'muted',
    title: t.offTitle,
    detail: t.offMessage,
    cta: { label: t.status.turnOn, onClick: actions.onTurnOn },
    showChain: false,
  };
}

/** Hero view for the crash fallback — modelled on the `reload` hero (muted
 *  badge + a single terminal CTA, no language chain), but carries the crash copy
 *  and reloads the popup itself rather than the active tab. Rendered by a crashed
 *  StatusHeader; see popup/CrashFallback. */
function crashView(t: Messages, onReload: () => void): HeroView {
  return {
    icon: TriangleAlert,
    tone: 'muted',
    title: t.errorBoundary.title,
    detail: t.errorBoundary.description,
    cta: { label: t.errorBoundary.reload, onClick: onReload },
    showChain: false,
  };
}

/** Brand-only top bar. Rendered only by the crash fallback now: the live popup
 *  opens straight onto the status hero (identity is redundant there — the user
 *  just clicked the Movar toolbar icon; see StatusHeader), but a crashed popup
 *  keeps a brand band so it still reads as Movar when its status hero can't
 *  render. */
function BrandBar() {
  return (
    <header className="border-border flex items-center gap-3 border-b px-5 py-4">
      <BrandMark size={20} className="text-ink-strong" title="Movar" />
      <span className="font-display text-ink-strong tracking-display text-base font-bold">
        Movar
      </span>
    </header>
  );
}

export interface StatusHeaderProps {
  /** Render the crash hero instead of the live status — the popup's
   *  ErrorBoundary fallback (popup/CrashFallback) mounts a crashed StatusHeader
   *  so a failed popup still reads as Movar. Short-circuits before any of the
   *  live-snapshot props below are read, since a crash may have left them
   *  unreadable. */
  crashed?: boolean;
  settings: MovarSettings;
  pause: PauseState;
  /** Live per-page snapshot from the active tab, or null when no content
   *  script answered (non-web tab, exempt site, fresh install before reload). */
  hidden: HiddenSummary | null;
  /** Active tab's host is on the exempt (allowlist) list, or turned off from
   *  the crash screen. */
  exempt: boolean;
  /** Whether `exempt` is true because of a crash-screen disable (cleared on
   *  the next update) rather than the permanent allowlist — picks the exempt
   *  hero's detail copy. Ignored unless `exempt`. Defaults false so callers
   *  that never set a site inert this way (crash fallback, most tests) don't
   *  need to pass it. */
  disabledUntilUpdate?: boolean;
  /** There's an http(s) page in the active tab (vs chrome://, store, new tab). */
  hasPage: boolean;
  /** Epoch-ms the active host's snooze ends, or null when not snoozed. */
  snoozedUntil: number | null;
  /** CTAs surfaced by terminal hero states (reload, un-exempt, turn on, resume). */
  actions: HeroActions;
}

export function StatusHeader({
  crashed = false,
  settings,
  pause,
  hidden,
  exempt,
  disabledUntilUpdate = false,
  hasPage,
  snoozedUntil,
  actions,
}: Readonly<StatusHeaderProps>) {
  const { t, locale } = useI18n();

  // Crash fallback: the popup's ErrorBoundary mounts a crashed StatusHeader (see
  // popup/CrashFallback) so a failed popup still reads as Movar. Render the crash
  // hero WITHOUT touching settings/pause/hidden — a render crash may have left
  // those unreadable, so this branch stays as inert as the minimal panel it
  // replaces. Uniquely keeps the brand band the live states dropped — a crash
  // leaves no working status hero to carry the Movar identity.
  if (crashed) {
    return (
      <>
        <BrandBar />
        <section className="border-border border-b px-5 py-5">
          <HeroBody
            view={crashView(t, actions.onReloadTab)}
            priority={[]}
            displayName={makeLanguageDisplay(locale)}
            t={t}
          />
        </section>
      </>
    );
  }

  const state = getActivityState(settings.enabled, pause.paused);

  // No brand bar: the popup opens straight onto the status hero. Identity is
  // redundant here (the user just clicked the Movar toolbar icon), and dropping
  // it reclaims the vertical space for the status the popup exists to show.
  return (
    <ActivityBody
      state={state}
      pause={pause}
      hero={
        state === 'active'
          ? resolveHero(hidden, exempt, hasPage, settings, snoozedUntil, disabledUntilUpdate)
          : null
      }
      actions={actions}
      priority={settings.priority}
      locale={locale}
      t={t}
    />
  );
}

interface ActivityBodyProps {
  state: ActivityState;
  pause: PauseState;
  /** Resolved active-state hero; null when paused/off (those build their own
   *  view here). */
  hero: HeroState | null;
  actions: HeroActions;
  priority: LanguageCode[];
  locale: ResolvedLocale;
  t: Messages;
}

/** The lower band. Every activity state — active, paused, off — renders through
 *  the same `HeroBody` (icon + title + subtitle) so they read consistently;
 *  only active states add a CTA or the priority chain beneath. The accent
 *  gradient stays reserved for the active state. */
/** Pick the hero view for the current activity state. active+hero, paused, and
 *  off are mutually exclusive, so a flat guard chain keeps each branch shallow
 *  (and `ActivityBody` itself trivial) instead of a chained ternary. */
function resolveActivityView(
  state: ActivityState,
  hero: HeroState | null,
  pause: PauseState,
  displayName: (code: LanguageCode) => string,
  actions: HeroActions,
  t: Messages,
  locale: ResolvedLocale,
): HeroView {
  if (state === 'active' && hero) return heroView(hero, t, displayName, actions, locale);
  if (state === 'paused') return pausedView(pause, t, locale);
  return offView(t, actions);
}

function ActivityBody({
  state,
  pause,
  hero,
  actions,
  priority,
  locale,
  t,
}: Readonly<ActivityBodyProps>) {
  const active = state === 'active';
  const displayName = makeLanguageDisplay(locale);
  const view = resolveActivityView(state, hero, pause, displayName, actions, t, locale);

  return (
    <section
      className="border-border border-b px-5 py-5"
      style={{
        background: active
          ? 'linear-gradient(180deg, var(--accent-surface), transparent)'
          : undefined,
      }}
    >
      <HeroBody view={view} priority={priority} displayName={displayName} t={t} />
    </section>
  );
}

interface HeroBodyProps {
  view: HeroView;
  priority: LanguageCode[];
  displayName: (code: LanguageCode) => string;
  t: Messages;
}

/** Renders one hero: icon badge + title + optional subtitle, then either a CTA
 *  (terminal states), the preferred-language chain (working states), or nothing
 *  (paused/off). Shared by every activity state so all three read alike. */
function HeroBody({ view, priority, displayName, t }: Readonly<HeroBodyProps>) {
  const Icon = view.icon;

  // CTA (terminal states) and the priority chain (working states) are mutually
  // exclusive; pick the single footer up front so the JSX below stays a flat
  // list rather than a nested ternary (sonarjs/no-nested-conditional).
  let footer: ReactNode = null;
  if (view.cta) {
    footer = (
      <div className="mt-4">
        <Button variant="secondary" size="sm" fullWidth onClick={view.cta.onClick}>
          {view.cta.label}
        </Button>
      </div>
    );
  } else if (view.showChain) {
    footer = <PriorityChain priority={priority} displayName={displayName} t={t} />;
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className={badgeClass(view.tone)}>
          <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <Text as="div" variant="title" tone="strong">
            {view.title}
          </Text>
          {view.detail != null && (
            <Text as="div" variant="body" tone="soft" className="mt-1">
              {view.detail}
            </Text>
          )}
        </div>
      </div>

      {footer}
    </>
  );
}

interface PriorityChainProps {
  priority: LanguageCode[];
  displayName: (code: LanguageCode) => string;
  t: Messages;
}

/** The preferred-language chain shown beneath working hero states, as a single
 *  soft text line: "Priority: Ukrainian › English", primary first. One line
 *  (vs the old eyebrow label + pill row) keeps the hero compact, and plain text
 *  matches its altitude — the hero title is the claim, the order is quiet
 *  metadata. No tone accents either: in the popup, accent means "active on this
 *  page" (see HeroView.tone), and the page may be served by any chain position
 *  — or none. The chevrons are aria-hidden, so screen readers hear the label
 *  and names as one plain sentence. Shows localised language names rather than
 *  ISO codes — `uk` ambiguates with the country code for the UK, and most
 *  users don't read ISO codes fluently anyway. */
function PriorityChain({ priority, displayName, t }: Readonly<PriorityChainProps>) {
  return (
    <Text as="p" variant="body" tone="soft" className="mt-3">
      {t.priorityLabel}:{' '}
      {priority.map((code, i) => (
        <Fragment key={code}>
          {i > 0 ? (
            <span aria-hidden="true" className="text-ink-faint">
              {' › '}
            </span>
          ) : null}
          <span className="text-ink">{displayName(code)}</span>
        </Fragment>
      ))}
    </Text>
  );
}
