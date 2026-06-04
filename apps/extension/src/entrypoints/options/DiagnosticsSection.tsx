import type { MovarSettings } from '@movar/shared';
import { Checkbox } from '@movar/ui';
import { useI18n } from '../../lib/i18n';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

/**
 * Opt-in for the on-device shadow-oracle diagnostics (see
 * docs/per-snippet-language-detection.md). The viewer lives in the popup; this
 * is just the enable switch. Off by default — a dev / power-user feature, kept
 * out of the popup's everyday surface so it doesn't clutter it.
 */
export function DiagnosticsSection({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.diagnostics.title}
      </h3>
      <p className="text-ink-soft mb-4 text-sm">{t.options.diagnostics.intro}</p>

      <Checkbox
        className="max-w-md"
        checked={settings.diagnostics}
        onCheckedChange={(next) => {
          onChange({ ...settings, diagnostics: next });
        }}
        label={t.options.diagnostics.toggleLabel}
      />
    </section>
  );
}
