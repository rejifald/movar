import { Check } from 'lucide-react';
import { Fragment } from 'react';
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import { BrandMark, Pill, type PillTone } from '@movar/ui';
import type { PauseState } from '../../lib/pause';
import { useI18n, makeLanguageDisplay, type Messages, type ResolvedLocale } from '../../lib/i18n';

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
  if (state.until) return t.pausedUntilDate(new Date(state.until).toLocaleString(locale));
  return t.pausedNoEnd;
}

interface StatusHeaderProps {
  settings: MovarSettings;
  pause: PauseState;
  correctionsToday: number;
  onToggleEnabled: () => void;
}

/** Map the domain activity tri-state to the design system's tone vocabulary.
 *  Lives next to the consumer rather than in @movar/ui — the Pill primitive
 *  shouldn't know about "active vs. paused vs. off" semantics. */
const STATUS_TONE: Record<ActivityState, PillTone> = {
  active: 'accent',
  paused: 'neutral',
  off: 'muted',
};

const STATUS_LABELS: Record<ActivityState, (t: Messages) => string> = {
  active: (t) => t.status.active,
  paused: (t) => t.status.paused,
  off: (t) => t.status.off,
};

export function StatusHeader({
  settings,
  pause,
  correctionsToday,
  onToggleEnabled,
}: StatusHeaderProps) {
  const { t, locale } = useI18n();
  const state = getActivityState(settings.enabled, pause.paused);
  const statusLabel = STATUS_LABELS[state](t);
  const ariaLabel = settings.enabled ? t.status.turnOff : t.status.turnOn;

  return (
    <>
      <header className="border-border flex items-center justify-between border-b px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} className="text-ink-strong" title="Movar" />
          <span className="font-display text-ink-strong text-base font-bold tracking-tight">
            Movar
          </span>
        </div>
        <Pill
          tone={STATUS_TONE[state]}
          size="sm"
          dot
          onClick={onToggleEnabled}
          aria-label={ariaLabel}
          aria-pressed={settings.enabled}
        >
          {statusLabel}
        </Pill>
      </header>

      <ActivityBody
        state={state}
        pause={pause}
        correctionsToday={correctionsToday}
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
  correctionsToday: number;
  priority: LanguageCode[];
  locale: ResolvedLocale;
  t: Messages;
}

/** The lower band swaps between the active hero (count + priority chain) and
 *  a short paused/off message. Lifted out of `StatusHeader` so the parent
 *  reads as just "bar + body" without inline conditional rendering. */
function ActivityBody({ state, pause, correctionsToday, priority, locale, t }: ActivityBodyProps) {
  const active = state === 'active';
  const message = state === 'paused' ? formatPausedUntil(pause, t, locale) : t.offMessage;

  return (
    <section
      className="border-border border-b px-[18px] py-5"
      style={{
        background: active
          ? 'linear-gradient(180deg, var(--accent-surface), transparent)'
          : undefined,
      }}
    >
      {active ? (
        <ActiveHero
          count={correctionsToday}
          label={t.correctionsTodayLabel(correctionsToday)}
          priority={priority}
          priorityLabel={t.priorityLabel}
          languageName={makeLanguageDisplay(locale)}
          priorityAriaLabel={(names) => t.priority(names)}
        />
      ) : (
        <p className="text-ink-soft text-[13px] leading-relaxed">{message}</p>
      )}
    </section>
  );
}

interface ActiveHeroProps {
  count: number;
  label: string;
  priority: LanguageCode[];
  priorityLabel: string;
  languageName: (code: LanguageCode) => string;
  priorityAriaLabel: (names: string[]) => string;
}

/** Headline metric stacked above the priority chain so a glance answers both
 *  "is it working?" (the number) and "what's it preferring?" (the chain).
 *  The chain shows localised language names rather than ISO codes — `uk`
 *  ambiguates with the country code for the UK, and most users don't read
 *  ISO codes fluently anyway. */
function ActiveHero({
  count,
  label,
  priority,
  priorityLabel,
  languageName,
  priorityAriaLabel,
}: ActiveHeroProps) {
  const named = priority.map((code) => ({ code, name: languageName(code) }));

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="bg-accent text-accent-on flex size-7 flex-shrink-0 items-center justify-center rounded-full shadow-sm">
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-ink-strong text-[24px] leading-none font-bold tabular-nums">
            {count}
          </div>
          <div className="text-ink-soft mt-1 text-[12.5px] leading-snug">{label}</div>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-ink-faint mb-2 font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
          {priorityLabel}
        </div>
        <div
          className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5"
          role="group"
          aria-label={priorityAriaLabel(named.map((n) => n.name))}
        >
          {named.map(({ code, name }, i) => (
            <Fragment key={code}>
              {i > 0 ? (
                <span aria-hidden="true" className="text-ink-faint text-[11px]">
                  →
                </span>
              ) : null}
              {/* Primary chip echoes the options-page PriorityItem's accent so
               *  the popup chain reads as the same data, abbreviated. */}
              <Pill tone={i === 0 ? 'accent' : 'neutral'} size="md">
                {name}
              </Pill>
            </Fragment>
          ))}
        </div>
      </div>
    </>
  );
}
