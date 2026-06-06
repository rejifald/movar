import { PAUSE_DURATIONS } from '../../lib/pause';
import type { PauseDuration } from '../../lib/pause';
import { Button } from '@movar/ui';
import type { PauseState } from '../../lib/pause';
import { useI18n } from '../../lib/i18n';

interface PauseControlsProps {
  pause: PauseState;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
}

export function PauseControls({ pause, onPause, onResume }: Readonly<PauseControlsProps>) {
  const { t } = useI18n();

  if (pause.paused) {
    return (
      <section className="border-border border-t px-[18px] py-4">
        <Button fullWidth onClick={onResume}>
          {t.pause.resume}
        </Button>
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
          <Button
            key={value}
            variant="secondary"
            size="sm"
            onClick={() => {
              onPause(value);
            }}
          >
            {t.pause.durations[value]}
          </Button>
        ))}
      </div>
    </section>
  );
}
