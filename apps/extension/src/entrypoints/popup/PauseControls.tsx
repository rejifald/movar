import { PAUSE_DURATIONS, type PauseDuration } from '@movar/shared';
import type { PauseState } from '../../lib/pause';

const PAUSE_LABELS: Record<PauseDuration, string> = {
  '1h': '1 hour',
  '24h': '24 hours',
  session: 'Session',
  '1w': '1 week',
};

interface PauseControlsProps {
  pause: PauseState;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
}

export function PauseControls({ pause, onPause, onResume }: PauseControlsProps) {
  if (pause.paused) {
    return (
      <button
        type="button"
        onClick={onResume}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700"
      >
        Resume now
      </button>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {PAUSE_DURATIONS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            onPause(value);
          }}
          className="rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
        >
          Pause {PAUSE_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
