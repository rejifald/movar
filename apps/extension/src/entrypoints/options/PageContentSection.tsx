import type { MovarSettings } from '@movar/settings';
import { useI18n } from '../../lib/i18n';
import { ContentToggle } from '../../components/ContentToggle';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PageContentSection({ settings, onChange }: Readonly<Props>) {
  const { t } = useI18n();

  return (
    <section>
      <h3 className="font-display text-ink-strong mb-1.5 text-[22px] font-bold tracking-tight">
        {t.options.pageContent.title}
      </h3>

      <ContentToggle
        className="mt-4 max-w-md"
        enabled={settings.contentModification}
        concealMode={settings.concealMode}
        onToggle={(next) => {
          onChange({ ...settings, contentModification: next });
        }}
        onConcealModeChange={(next) => {
          onChange({ ...settings, concealMode: next });
        }}
      />
    </section>
  );
}
