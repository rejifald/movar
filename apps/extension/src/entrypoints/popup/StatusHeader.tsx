import { Check, CircleSlash, EyeOff, Globe, Info, Pause, Power, RotateCw } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import { BrandMark, Button, Pill } from '@movar/ui';
import { hasConcealment } from '../../lib/messaging';
import type { HiddenSummary } from '../../lib/messaging';
import type { PauseState } from '../../lib/pause';
import { useI18n, makeLanguageDisplay } from '../../lib/i18n';
import type { Messages, ResolvedLocale } from '../../lib/i18n';

type ActivityState = 'active' | 'paused' | 'off';

/** Three mutually exclusive states drive the entire header — enabled-and-not-
 *  paused, paused, or off. Centralising the calculation here keeps the JSX
 *  branching shallow downstream. */
function getActivityState(enabled: boolean, paused: boolean): ActivityState {
  if (enabled && !paused) return 'active';
  return paused ? 'paused' : 'off';
}

/** Localised "paused until X" line — used in the body when paused, lifted out
 *  of the component so the JSX path stays linear. Date is formatted in the
 *  popup locale rather than the browser's implicit Intl default so weekday/
 *  month names match the surrounding UI. */
function formatPausedUntil(state: PauseState, t: Messages, locale: ResolvedLocale): string {
  if (state.indefinite) return t.pausedIndefinitely;
  if (state.until != null) return t.pausedUntilDate(new Date(state.until).toLocaleString(locale));
  return t.pausedNoEnd;
}

/**
 * The popup hero's active state, resolved from the live per-page snapshot.
 * Replaced the old cross-site "corrections today" count: every variant maps
 * to one claim the user can verify by looking at the tab in front of them.
 */
export type HeroState =
  | { kind: 'served'; language: LanguageCode }
  | { kind: 'blocked'; language: LanguageCode }
  | { kind: 'hiding'; languages: LanguageCode[] }
  | { kind: 'clean' }
  | { kind: 'reload' }
  | { kind: 'exempt' }
  | { kind: 'noPage' };

/**
 * Map the live snapshot to a hero variant. Pure — the Storybook showcase and
 * any future test exercise every branch by passing inputs directly.
 *
 * Ordering is deliberate: site-level reasons Movar is inert (exempt, non-web
 * tab, no content script yet) win over any page-content read, and an active
 * concealment outranks the passive "what language is this page" status.
 */
export function resolveHero(
  hidden: HiddenSummary | null,
  exempt: boolean,
  hasPage: boolean,
  settings: MovarSettings,
): HeroState {
  if (exempt) return { kind: 'exempt' };
  if (!hasPage) return { kind: 'noPage' };
  if (!hidden) return { kind: 'reload' };
  return resolveActiveHero(hidden, settings);
}

/** Hero for a tab that answered and isn't exempt: an active concealment outranks
 *  the passive page-language read. Split from `resolveHero` so each half stays a
 *  short, flat chain. */
function resolveActiveHero(hidden: HiddenSummary, settings: MovarSettings): HeroState {
  if (hasConcealment(hidden)) return { kind: 'hiding', languages: hidden.languages };
  return pageLangVerdict(hidden.pageLang, settings) ?? { kind: 'clean' };
}

/** Classify the detected page language against the user's sets: blocked (Movar
 *  would steer away) or served (a preferred language). Null = neither, so the
 *  caller falls through to the "clean" hero. */
function pageLangVerdict(lang: LanguageCode | null, settings: MovarSettings): HeroState | null {
  if (lang == null) return null;
  if (settings.blocked.includes(lang)) return { kind: 'blocked', language: lang };
  if (settings.priority.includes(lang)) return { kind: 'served', language: lang };
  return null;
}

/** Actions a terminal hero state's CTA can trigger. */
export interface HeroActions {
  /** Reload the active tab (so the content script runs / re-runs). */
  onReloadTab: () => void;
  /** Remove the active site from the exempt list, then reload it. */
  onEnableForSite: () => void;
  /** Turn Movar on globally (off-state CTA), then reload so it runs here. */
  onTurnOn: () => void;
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
  exempt: (_hero, { t, actions }) => ({
    icon: CircleSlash,
    tone: 'muted',
    title: t.pageStatus.exemptTitle,
    detail: t.pageStatus.exemptDetail,
    cta: { label: t.pageStatus.enableSiteCta, onClick: actions.onEnableForSite },
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
): HeroView {
  const build = HERO_VIEWS[hero.kind] as (hero: HeroState, ctx: HeroViewCtx) => HeroView;
  return build(hero, { t, displayName, actions });
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

export interface StatusHeaderProps {
  settings: MovarSettings;
  pause: PauseState;
  /** Live per-page snapshot from the active tab, or null when no content
   *  script answered (non-web tab, exempt site, fresh install before reload). */
  hidden: HiddenSummary | null;
  /** Active tab's host is on the exempt (allowlist) list. */
  exempt: boolean;
  /** There's an http(s) page in the active tab (vs chrome://, store, new tab). */
  hasPage: boolean;
  /** CTAs surfaced by terminal hero states (reload, un-exempt, turn on). */
  actions: HeroActions;
}

export function StatusHeader({
  settings,
  pause,
  hidden,
  exempt,
  hasPage,
  actions,
}: Readonly<StatusHeaderProps>) {
  const { t, locale } = useI18n();
  const state = getActivityState(settings.enabled, pause.paused);

  return (
    <>
      {/* Brand-only bar. On/off doesn't live here — it's a rare, heavy action
          that belongs in Options; the hero owns status and the off-state hero
          carries the "Turn Movar on" CTA. */}
      <header className="border-border flex items-center gap-2.5 border-b px-[18px] py-3.5">
        <BrandMark size={20} className="text-ink-strong" title="Movar" />
        <span className="font-display text-ink-strong text-base font-bold tracking-tight">
          Movar
        </span>
      </header>

      <ActivityBody
        state={state}
        pause={pause}
        hero={state === 'active' ? resolveHero(hidden, exempt, hasPage, settings) : null}
        actions={actions}
        priority={settings.priority}
        locale={locale}
        t={t}
      />
    </>
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
  if (state === 'active' && hero) return heroView(hero, t, displayName, actions);
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
      className="border-border border-b px-[18px] py-5"
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
 *  (paused/off). Shared by every activity state so all three read alike. The
 *  chain shows localised language names rather than ISO codes — `uk` ambiguates
 *  with the country code for the UK, and most users don't read ISO codes
 *  fluently anyway. */
function HeroBody({ view, priority, displayName, t }: Readonly<HeroBodyProps>) {
  const Icon = view.icon;
  const named = priority.map((code) => ({ code, label: displayName(code) }));

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
    footer = (
      <div className="mt-4">
        <div className="text-ink-faint mb-2 font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
          {t.priorityLabel}
        </div>
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
          role="group"
          aria-label={t.priority(named.map((n) => n.label))}
        >
          {named.map(({ code, label }, i) => (
            <Fragment key={code}>
              {i > 0 ? (
                <span aria-hidden="true" className="text-ink-faint text-[11px]">
                  →
                </span>
              ) : null}
              {/* Primary chip echoes the options-page PriorityItem's accent so
               *  the popup chain reads as the same data, abbreviated. */}
              <Pill tone={i === 0 ? 'accent' : 'neutral'} size="md">
                {label}
              </Pill>
            </Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <div className={badgeClass(view.tone)}>
          <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-ink-strong text-[15px] leading-snug font-bold">
            {view.title}
          </div>
          {view.detail != null && (
            <div className="text-ink-soft mt-0.5 text-[12.5px] leading-snug">{view.detail}</div>
          )}
        </div>
      </div>

      {footer}
    </>
  );
}
