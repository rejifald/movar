import { Select, type SelectOption } from '@movar/ui';
import { browser } from 'wxt/browser';
import { UI_LANGUAGES, type UiLanguage } from '@movar/shared';
import { useI18n, resolveLocale } from '../lib/i18n';

interface LanguageSelectorProps {
  value: UiLanguage;
  onChange: (next: UiLanguage) => void;
}

/** Cross-entrypoint UI-language picker used by both the popup and the options
 *  page footer. Composes the shared {@link Select} primitive with extension-
 *  specific concerns: resolving "Auto" against `browser.i18n.getUILanguage()`,
 *  and pulling labels from the i18n catalogue.
 *
 *  Lives under `components/` rather than next to either entrypoint because
 *  both consume it equally — the previous cross-entrypoint reach from
 *  `options/App.tsx` into `popup/LanguageSelector` was the smell that
 *  motivated the move. */
export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const { t } = useI18n();

  // Lifted out of the option-build loop so the labelling logic stays linear:
  // auto goes through the resolver, explicit choices map straight to their
  // catalogue entry. The previous 3-arm switch tripped the complexity bar.
  const nameOf = (locale: 'en' | 'uk'): string =>
    locale === 'uk' ? t.languageSelector.uk : t.languageSelector.en;

  const labelFor = (option: UiLanguage): string => {
    if (option === 'auto') {
      const resolved = resolveLocale('auto', browser.i18n.getUILanguage());
      return `${t.languageSelector.auto} (${nameOf(resolved)})`;
    }
    return nameOf(option);
  };

  const options: readonly SelectOption<UiLanguage>[] = UI_LANGUAGES.map((option) => ({
    value: option,
    label: labelFor(option),
  }));

  return (
    <label className="flex items-center gap-1.5">
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
