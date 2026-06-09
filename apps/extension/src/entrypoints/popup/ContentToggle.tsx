import { Switch } from '@movar/ui';
import type { ConcealMode } from '@movar/settings';
import { useI18n } from '../../lib/i18n';
import { ConcealModeField } from '../../components/ConcealModeField';

interface ContentToggleProps {
  enabled: boolean;
  concealMode: ConcealMode;
  onToggle: (next: boolean) => void;
  onConcealModeChange: (next: ConcealMode) => void;
}

/** Compact in-popup mirror of options-page PageContentSection. Same settings
 *  (`MovarSettings.contentModification` + `concealMode`), surfaced here so users
 *  can flip filtering and pick curtain-vs-hide without digging into options.
 *  Sits above HiddenPanel because this is the cause and the panel is the visible
 *  effect — when filtering is off, the panel never renders.
 *
 *  Label + description are wired via the shared {@link Switch} primitive,
 *  which auto-links the description through `aria-describedby` so screen
 *  readers announce "switch, off" first and then the description
 *  separately, instead of one long run-on sentence. The conceal-mode selector
 *  appears only while filtering is on — the mode is inert otherwise. */
export function ContentToggle({
  enabled,
  concealMode,
  onToggle,
  onConcealModeChange,
}: Readonly<ContentToggleProps>) {
  const { t } = useI18n();
  return (
    <section className="border-border border-t px-[18px] py-4">
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        label={t.contentToggle.label}
        description={
          // data-testid anchors the e2e test for the Ukrainian description
          // string to a stable selector instead of a raw UA literal.
          <span data-testid="content-toggle-description">{t.contentToggle.description}</span>
        }
        className="w-full"
      />
      {enabled ? (
        <div className="mt-3.5">
          <ConcealModeField value={concealMode} onChange={onConcealModeChange} />
        </div>
      ) : null}
    </section>
  );
}
