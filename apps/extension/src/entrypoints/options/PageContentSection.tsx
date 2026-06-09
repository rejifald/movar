import type { ConcealMode, MovarSettings } from '@movar/settings';
import { Checkbox, Select } from '@movar/ui';
import type { SelectOption } from '@movar/ui';
import { useI18n } from '../../lib/i18n';

interface Props {
  settings: MovarSettings;
  onChange: (next: MovarSettings) => void;
}

export function PageContentSection({ settings, onChange }: Readonly<Props>) {
  const { t } = useI18n();
  const modeOptions: readonly SelectOption<ConcealMode>[] = [
    {
      value: 'curtain',
      label: t.options.pageContent.concealMode.options.curtain.label,
    },
    {
      value: 'hide',
      label: t.options.pageContent.concealMode.options.hide.label,
    },
  ];

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

      <div className="mt-5 max-w-md space-y-2">
        <label
          htmlFor="movar-conceal-mode"
          className="text-ink-strong block text-[13px] font-semibold"
        >
          {t.options.pageContent.concealMode.label}
        </label>
        <Select<ConcealMode>
          id="movar-conceal-mode"
          value={settings.concealMode}
          onChange={(concealMode) => {
            onChange({ ...settings, concealMode });
          }}
          options={modeOptions}
          variant="form"
          className="w-full"
        />
        <p className="text-ink-soft text-[12.5px]">
          {t.options.pageContent.concealMode.options[settings.concealMode].description}
        </p>
      </div>
    </section>
  );
}
