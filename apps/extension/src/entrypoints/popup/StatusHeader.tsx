import type { MovarSettings } from '@movar/shared';
import type { PauseState } from '../../lib/pause';
import { buildAcceptLanguage } from '../../lib/accept-language';
import { BrandMark } from '../../components/BrandMark';

function formatUntil(state: PauseState): string {
  if (state.session) return 'until you restart the browser';
  if (state.until) return `until ${new Date(state.until).toLocaleString()}`;
  return '';
}

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
  const active = settings.enabled && !pause.paused;
  const statusLabel = active ? 'Active' : pause.paused ? 'Paused' : 'Off';
  const statusTone = active ? 'text-accent' : 'text-ink-faint';
  const dotTone = active ? 'bg-accent' : 'bg-ink-faint';
  const acceptLanguage = buildAcceptLanguage(settings.priority);

  return (
    <>
      <header className="border-border flex items-center justify-between border-b px-[18px] py-3.5">
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} className="text-ink-strong" title="Movar" />
          <span className="font-display text-ink-strong text-base font-bold tracking-tight">
            Movar
          </span>
        </div>
        <button
          type="button"
          onClick={onToggleEnabled}
          aria-label={settings.enabled ? 'Turn Movar off' : 'Turn Movar on'}
          className={`flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.1em] uppercase ${statusTone}`}
        >
          <span className={`inline-block size-1.5 rounded-full ${dotTone}`} />
          {statusLabel}
        </button>
      </header>

      <div
        className="border-border border-b px-[18px] py-4"
        style={{
          background: active
            ? 'linear-gradient(180deg, var(--accent-surface), transparent)'
            : undefined,
        }}
      >
        <div className="text-ink-faint font-mono text-[10.5px] tracking-[0.1em] uppercase">
          accept-language
        </div>
        <div className="text-ink mt-1.5 truncate font-mono text-[12.5px]">{acceptLanguage}</div>

        {active ? (
          <div className="mt-4 flex items-center gap-3">
            <div className="bg-accent text-accent-on flex size-[22px] flex-shrink-0 items-center justify-center rounded-full">
              <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
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
            <div className="flex-1">
              <div className="text-ink-strong text-[15px] font-medium">
                <span className="tabular-nums">{correctionsToday}</span>{' '}
                {correctionsToday === 1 ? 'correction' : 'corrections'} today
              </div>
              <div className="text-ink-soft mt-0.5 text-[12.5px]">
                Priority {settings.priority.join(' → ')}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-ink-soft mt-3 text-[12.5px]">
            {pause.paused ? `Paused ${formatUntil(pause)}` : 'Movar is off — toggle on to resume.'}
          </div>
        )}
      </div>
    </>
  );
}
