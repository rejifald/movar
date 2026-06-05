import type { MovarSettings } from '@movar/settings';
import { Checkbox } from '@movar/ui';
import { useI18n } from '../../lib/i18n';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PageContentSection({ settings, onChange }: Props) {
  const { t } = useI18n();

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.pageContent.title}
      </h3>
      <p className="text-ink-soft mb-4 text-sm">{t.options.pageContent.intro}</p>

      <Checkbox
        className="max-w-md"
        checked={settings.contentModification}
        onCheckedChange={(next) => {
          onChange({ ...settings, contentModification: next });
        }}
        label={t.options.pageContent.toggleLabel}
      />
    </section>
  );
}
