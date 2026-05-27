import { PAUSE_DURATIONS, type PauseDuration } from '@movar/shared';
import type { PauseState } from '../../lib/pause';
import { useI18n } from '../../lib/i18n';

interface PauseControlsProps {
  pause: PauseState;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
}

export function PauseControls({ pause, onPause, onResume }: PauseControlsProps) {
  const { t } = useI18n();

  if (pause.paused) {
    return (
      <section className="border-border border-t px-[18px] py-4">
        <button
          type="button"
          onClick={onResume}
          className="bg-ink-strong text-bg hover:bg-ink w-full rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
        >
          {t.pause.resume}
        </button>
      </section>
    );
  }

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>{t.pause.title}</span>
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
            {t.pause.durations[value]}
          </button>
        ))}
      </div>
    </section>
  );
}
