import { useId } from 'react';
import { useI18n } from '../../lib/i18n';

interface ContentToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

/** Compact in-popup mirror of options-page PageContentSection. Same setting
 *  (`MovarSettings.contentModification`), surfaced here so users can flip it
 *  without digging into options. Sits above HiddenPanel because this toggle
 *  is the cause and the panel is the visible effect — when this is off, the
 *  panel never renders.
 *
 *  Label + description are wired via `aria-describedby` rather than dumped
 *  into one accessible name: screen readers read "Hide blocked-language
 *  content, checkbox, not checked" first and then announce the description
 *  separately, instead of one long run-on sentence. */
export function ContentToggle({ enabled, onChange }: ContentToggleProps) {
  const { t } = useI18n();
  const inputId = useId();
  const descId = useId();
  return (
    <section className="border-border border-t px-[18px] py-4">
      <label
        htmlFor={inputId}
        aria-label={t.contentToggle.label}
        className="flex cursor-pointer items-start gap-3"
      >
        <input
          id={inputId}
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            onChange(e.target.checked);
          }}
          aria-describedby={descId}
          className="accent-accent mt-0.5 size-4"
        />
        <span className="flex-1">
          <span className="text-ink-strong block text-[13px] leading-snug font-medium">
            {t.contentToggle.label}
          </span>
          <span id={descId} className="text-ink-soft mt-0.5 block text-[12px] leading-snug">
            {t.contentToggle.description}
          </span>
        </span>
      </label>
    </section>
  );
}
