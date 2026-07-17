import type { JSX } from 'react';
import { Select } from '@movar/ui';
import type { SelectOption } from '@movar/ui';
import { UI_LANGUAGES } from '@movar/settings';
import type { UiLanguage } from '@movar/settings';
import { useI18n, resolveLocale } from '@movar/i18n';

interface LanguageSelectorProps {
  value: UiLanguage;
  onChange: (next: UiLanguage) => void;
  /**
   * The host's UI language (the extension threads
   * `browser.i18n.getUILanguage()` in). Injected rather than read here so this
   * package stays free of any `wxt`/`browser` dependency. Only consulted to
   * label the "Auto" option with the language it currently resolves to.
   */
  browserUiLanguage: string;
}

/** Cross-entrypoint UI-language picker used by both the popup and the options
 *  page footer. Composes the shared {@link Select} primitive with the i18n
 *  catalogue labels, and resolves the "Auto" option's parenthetical against the
 *  injected {@link browserUiLanguage}.
 *
 *  Shared between the popup and the options page footer — both consume it
 *  equally, which is why it lives in this package rather than next to either
 *  entrypoint. */
export function LanguageSelector({
  value,
  onChange,
  browserUiLanguage,
}: Readonly<LanguageSelectorProps>): JSX.Element {
  const { t } = useI18n();

  // Lifted out of the option-build loop so the labelling logic stays linear:
  // auto goes through the resolver, explicit choices map straight to their
  // catalogue entry. The previous 3-arm switch tripped the complexity bar.
  const nameOf = (locale: 'en' | 'uk'): string =>
    locale === 'uk' ? t.languageSelector.uk : t.languageSelector.en;

  const labelFor = (option: UiLanguage): string => {
    if (option === 'auto') {
      const resolved = resolveLocale('auto', browserUiLanguage);
      return `${t.languageSelector.auto} (${nameOf(resolved)})`;
    }
    return nameOf(option);
  };

  const options: readonly SelectOption<UiLanguage>[] = UI_LANGUAGES.map((option) => ({
    value: option,
    label: labelFor(option),
  }));

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t.languageSelector.label}</span>
      <Select<UiLanguage>
        value={value}
        onChange={onChange}
        options={options}
        variant="inline"
        aria-label={t.languageSelector.label}
      />
    </label>
  );
}
