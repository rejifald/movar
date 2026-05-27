import { UI_LANGUAGES, type UiLanguage } from '@movar/shared';
import { useI18n, resolveLocale } from '../../lib/i18n';
import { browser } from 'wxt/browser';

interface LanguageSelectorProps {
  value: UiLanguage;
  onChange: (next: UiLanguage) => void;
}

/** Native <select> tuned to feel like a footer chip. Three options — Auto plus
 *  the two translated locales. Whatever 'Auto' resolves to is shown in the
 *  tooltip so the current choice is discoverable without opening the menu. */
export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const { t } = useI18n();

  const labelFor = (option: UiLanguage): string => {
    switch (option) {
      case 'auto': {
        const resolved = resolveLocale('auto', browser.i18n.getUILanguage());
        const resolvedLabel = resolved === 'uk' ? t.languageSelector.uk : t.languageSelector.en;
        return `${t.languageSelector.auto} (${resolvedLabel})`;
      }
      case 'en': {
        return t.languageSelector.en;
      }
      case 'uk': {
        return t.languageSelector.uk;
      }
    }
  };

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">{t.languageSelector.label}</span>
      <select
        value={value}
        onChange={(e) => {
          onChange(e.target.value as UiLanguage);
        }}
        aria-label={t.languageSelector.label}
        className="hover:text-ink-strong cursor-pointer border-none bg-transparent text-[11.5px] transition-colors focus:outline-none"
      >
        {UI_LANGUAGES.map((option) => (
          <option key={option} value={option}>
            {labelFor(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
