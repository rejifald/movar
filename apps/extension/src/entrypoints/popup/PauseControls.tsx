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
      <section className="border-border border-t px-[18px] py-4">
        <button
          type="button"
          onClick={onResume}
          className="bg-ink-strong text-bg hover:bg-ink w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
        >
          Resume now
        </button>
      </section>
    );
  }

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>Pause Movar</span>
      </h5>
      <div className="grid grid-cols-2 gap-2">
        {PAUSE_DURATIONS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              onPause(value);
            }}
            className="border-border bg-surface-2 text-ink hover:bg-surface-3 hover:text-ink-strong rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors"
          >
            {PAUSE_LABELS[value]}
          </button>
        ))}
      </div>
    </section>
  );
}
