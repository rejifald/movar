import type { JSX } from 'react';
import type { MovarSettings } from '@movar/settings';
import { Text } from '@movar/ui';
import { useI18n } from '@movar/i18n';
import { ContentToggle } from './ContentToggle';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PageContentSection({ settings, onChange }: Readonly<Props>): JSX.Element {
  const { t } = useI18n();

  return (
    <section>
      <Text as="h3" variant="heading" tone="strong" className="mb-1.5">
        {t.options.pageContent.title}
      </Text>

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
