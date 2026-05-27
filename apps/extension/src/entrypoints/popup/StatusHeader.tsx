import { Fragment } from 'react';
import type { LanguageCode, MovarSettings } from '@movar/shared';
import type { PauseState } from '../../lib/pause';
import { useI18n } from '../../lib/i18n';
import { BrandMark } from '../../components/BrandMark';

interface StatusHeaderProps {
  settings: MovarSettings;
  pause: PauseState;
  correctionsToday: number;
  onToggleEnabled: () => void;
}

export function StatusHeader({
  settings,
  pause,
  correctionsToday,
  onToggleEnabled,
}: StatusHeaderProps) {
  const { t, locale } = useI18n();
  const active = settings.enabled && !pause.paused;
  const statusLabel = active ? t.status.active : pause.paused ? t.status.paused : t.status.off;

  // Localise the date for paused-until via the resolved popup locale so the
  // weekday/month names match the rest of the UI rather than the browser's
  // implicit Intl default.
  const formatUntil = (state: PauseState): string => {
    if (state.session) return t.pausedUntilSession;
    if (state.until) return t.pausedUntilDate(new Date(state.until).toLocaleString(locale));
    return t.pausedNoEnd;
  };

  return (
    <>
      <header className="border-border flex items-center justify-between border-b px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} className="text-ink-strong" title="Movar" />
          <span className="font-display text-ink-strong text-base font-bold tracking-tight">
            Movar
          </span>
        </div>
        <StatusPill
          state={active ? 'active' : pause.paused ? 'paused' : 'off'}
          label={statusLabel}
          ariaLabel={settings.enabled ? t.status.turnOff : t.status.turnOn}
          onClick={onToggleEnabled}
        />
      </header>

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
            priority={settings.priority}
            priorityAriaLabel={t.priority(settings.priority)}
          />
        ) : (
          <p className="text-ink-soft text-[13px] leading-relaxed">
            {pause.paused ? formatUntil(pause) : t.offMessage}
          </p>
        )}
      </section>
    </>
  );
}

type StatusState = 'active' | 'paused' | 'off';

interface StatusPillProps {
  state: StatusState;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}

/** The status indicator doubles as the on/off toggle. Styling it as a proper
 *  rounded pill (border + tinted bg + hover) signals the click affordance —
 *  the previous bare-text version read as a label, not a control.
 *
 *  Active uses `text-accent-deep` (not `text-accent`) so the foreground reads
 *  in both modes: deep forest on light pastel in light, light forest on dark
 *  green tint in dark. `text-accent` is the same forest both ways and would
 *  fail AA-small on either surface. */
function StatusPill({ state, label, ariaLabel, onClick }: StatusPillProps) {
  const tone: Record<StatusState, string> = {
    active:
      'border-accent/30 bg-accent-surface text-accent-deep hover:border-accent/50 hover:bg-accent-soft',
    paused: 'border-border bg-surface-2 text-ink hover:border-border-strong hover:bg-surface-3',
    off: 'border-border bg-surface-2 text-ink-soft hover:text-ink hover:border-border-strong',
  };
  const dotTone: Record<StatusState, string> = {
    active: 'bg-accent',
    paused: 'bg-ink-soft',
    off: 'bg-ink-faint',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase transition-colors ${tone[state]}`}
    >
      <span className={`inline-block size-1.5 rounded-full ${dotTone[state]}`} />
      {label}
    </button>
  );
}

interface ActiveHeroProps {
  count: number;
  label: string;
  priority: LanguageCode[];
  priorityAriaLabel: string;
}

/** Headline metric flanked by the priority chip chain so a glance answers both
 *  "is it working?" (the number) and "what's it preferring?" (the chain). */
function ActiveHero({ count, label, priority, priorityAriaLabel }: ActiveHeroProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="bg-accent text-accent-on flex size-7 flex-shrink-0 items-center justify-center rounded-full shadow-sm">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-ink-strong text-[24px] leading-none font-bold tabular-nums">
            {count}
          </div>
          <div className="text-ink-soft mt-1 text-[12.5px] leading-snug">{label}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-1.5" role="group" aria-label={priorityAriaLabel}>
        {priority.map((code, i) => (
          <Fragment key={code}>
            {i > 0 ? (
              <span aria-hidden="true" className="text-ink-faint text-[11px]">
                →
              </span>
            ) : null}
            <PriorityChip code={code} primary={i === 0} />
          </Fragment>
        ))}
      </div>
    </>
  );
}

interface PriorityChipProps {
  code: LanguageCode;
  primary: boolean;
}

/** Visual echo of the options-page PriorityItem: primary chip carries the
 *  accent, secondaries stay neutral. Mono caps keep ISO codes legible in a
 *  small footprint and align with the eyebrow labels elsewhere in the popup. */
function PriorityChip({ code, primary }: PriorityChipProps) {
  const tone = primary
    ? 'border-accent/30 bg-accent-surface text-accent-deep'
    : 'border-border bg-surface-2 text-ink';
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] font-medium uppercase ${tone}`}
    >
      {code}
    </span>
  );
}
