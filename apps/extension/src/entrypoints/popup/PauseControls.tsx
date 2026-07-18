import { PAUSE_DURATIONS } from '../../lib/pause';
import type { PauseDuration } from '../../lib/pause';
import { Button, Text } from '@movar/ui';
import type { PauseState } from '../../lib/pause';
import { useI18n } from '@movar/i18n';

interface PauseControlsProps {
  pause: PauseState;
  onPause: (duration: PauseDuration) => void;
  onResume: () => void;
  /** Snooze the active host (a timed per-site break). Omitted when there's no
   *  eligible page (non-web tab, already exempt, or already snoozed) — the
   *  snoozed host surfaces its own "Resume now" in the hero instead. */
  onSnoozeSite?: (() => void) | undefined;
  /** Permanently exempt the active host (adds it to the allowlist). Omitted when
   *  there's no eligible page (non-web tab, or already exempt). The permanent
   *  sibling of the timed snooze, rendered directly beneath it. */
  onExemptSite?: (() => void) | undefined;
}

export function PauseControls({
  pause,
  onPause,
  onResume,
  onSnoozeSite,
  onExemptSite,
}: Readonly<PauseControlsProps>) {
  const { t } = useI18n();

  if (pause.paused) {
    return (
      <section className="border-border border-t px-5 py-4">
        <Button fullWidth onClick={onResume}>
          {t.pause.resume}
        </Button>
      </section>
    );
  }

  return (
    <section className="border-border border-t px-5 py-4">
      <Text
        as="h5"
        variant="eyebrow"
        tone="faint"
        className="mb-3 flex items-center justify-between"
      >
        <span>{t.pause.title}</span>
      </Text>
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
      {onSnoozeSite === undefined ? null : (
        <Button variant="secondary" size="sm" fullWidth className="mt-2" onClick={onSnoozeSite}>
          {t.pause.snoozeSite}
        </Button>
      )}
      {onExemptSite === undefined ? null : (
        <Button variant="secondary" size="sm" fullWidth className="mt-2" onClick={onExemptSite}>
          {t.pause.exemptSite}
        </Button>
      )}
    </section>
  );
}
