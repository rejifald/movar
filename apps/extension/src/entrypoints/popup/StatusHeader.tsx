import type { MovarSettings } from '@movar/shared';
import type { PauseState } from '../../lib/pause';
import { buildAcceptLanguage } from '../../lib/accept-language';

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

  return (
    <>
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-base font-semibold">Movar</h1>
        <button
          type="button"
          onClick={onToggleEnabled}
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
    </>
  );
}
