import type { ConcealMode } from '@movar/settings';
import { Checkbox } from '@movar/ui';
import { useI18n } from '../../lib/i18n';

interface ContentToggleProps {
  enabled: boolean;
  mode: ConcealMode;
  onChange: (next: boolean) => void;
}

/** Compact in-popup mirror of options-page PageContentSection. Same setting
 *  (`MovarSettings.contentModification`), surfaced here so users can flip it
 *  without digging into options. Sits above HiddenPanel because this toggle
 *  is the cause and the panel is the visible effect — when this is off, the
 *  panel never renders.
 *
 *  Label + description are wired via the shared {@link Checkbox} primitive,
 *  which auto-links the description through `aria-describedby` so screen
 *  readers announce "checkbox, not checked" first and then the description
 *  separately, instead of one long run-on sentence. */
export function ContentToggle({ enabled, mode, onChange }: Readonly<ContentToggleProps>) {
  const { t } = useI18n();
  const description = enabled ? t.contentToggle.mode[mode] : t.contentToggle.description;
  return (
    <section className="border-border border-t px-[18px] py-4">
      <Checkbox
        checked={enabled}
        onCheckedChange={onChange}
        label={t.contentToggle.label}
        description={
          // data-testid anchors the e2e test for the Ukrainian description
          // string to a stable selector instead of a raw UA literal.
          <span data-testid="content-toggle-description">{description}</span>
        }
        className="w-full"
      />
    </section>
  );
}
