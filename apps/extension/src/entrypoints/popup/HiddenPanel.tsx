import type { HiddenSummary, LanguageCode } from '@movar/shared';
import { useI18n } from '../../lib/i18n';

interface HiddenPanelProps {
  hidden: HiddenSummary;
  onRestore: () => void;
}

export function HiddenPanel({ hidden, onRestore }: HiddenPanelProps) {
  const { t, locale } = useI18n();
  const hasHidden = hidden.languages.length > 0 || hidden.containers > 0;

  // Intl.DisplayNames takes a locale list — pass the resolved popup locale so
  // hidden-language labels render in the same language as the surrounding UI.
  const displayLanguage = (code: LanguageCode): string => {
    try {
      const names = new Intl.DisplayNames([locale], { type: 'language' });
      return names.of(code) ?? code;
    } catch {
      return code;
    }
  };

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>{t.hidden.title}</span>
      </h5>
      {hasHidden ? (
        <>
          <ul className="text-ink mb-3 space-y-1.5 text-[12.5px]">
            {hidden.languages.length > 0 ? (
              <li>
                {t.hidden.fromPickers}{' '}
                <span className="text-ink-strong font-medium">
                  {hidden.languages.map(displayLanguage).join(', ')}
                </span>
              </li>
            ) : null}
            {hidden.containers > 0 ? <li>{t.hidden.collapsed(hidden.containers)}</li> : null}
          </ul>
          <button
            type="button"
            onClick={onRestore}
            className="border-border bg-surface-2 text-ink-strong hover:bg-surface-3 w-full rounded-lg border px-3 py-2 text-[12.5px] font-medium transition-colors"
          >
            {t.hidden.show}
          </button>
          <p className="text-ink-faint mt-2 font-mono text-[10.5px]">{t.hidden.reload}</p>
        </>
      ) : (
        <p className="text-ink-soft text-[12.5px]">
          {hidden.userOverride ? t.hidden.restored : t.hidden.nothing}
        </p>
      )}
    </section>
  );
}
