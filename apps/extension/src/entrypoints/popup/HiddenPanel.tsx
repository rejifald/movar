import type { HiddenSummary } from '@movar/shared';
import { Button } from '@movar/ui';
import { useI18n, makeLanguageDisplay, type Messages, type ResolvedLocale } from '../../lib/i18n';

interface HiddenPanelProps {
  hidden: HiddenSummary;
  onRestore: () => void;
}

export function HiddenPanel({ hidden, onRestore }: HiddenPanelProps) {
  const { t, locale } = useI18n();
  const hasHidden = hidden.languages.length > 0 || hidden.containers > 0;

  return (
    <section className="border-border border-t px-[18px] py-4">
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
        <span>{t.hidden.title}</span>
      </h5>
      {hasHidden ? (
        <HiddenList hidden={hidden} t={t} locale={locale} onRestore={onRestore} />
      ) : (
        <p className="text-ink-soft text-[12.5px]">
          {hidden.userOverride ? t.hidden.restored : t.hidden.nothing}
        </p>
      )}
    </section>
  );
}

interface HiddenListProps {
  hidden: HiddenSummary;
  t: Messages;
  locale: ResolvedLocale;
  onRestore: () => void;
}

/** Populated branch — list of what's hidden plus the "show everything" CTA
 *  and the reload hint. Extracted so the parent `HiddenPanel` reads as just
 *  "has-hidden ? list : empty-message" without two stacked conditionals. */
function HiddenList({ hidden, t, locale, onRestore }: HiddenListProps) {
  const displayLanguage = makeLanguageDisplay(locale);

  return (
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
      <Button variant="secondary" size="sm" fullWidth onClick={onRestore}>
        {t.hidden.show}
      </Button>
      <p className="text-ink-faint mt-2 font-mono text-[10.5px]">{t.hidden.reload}</p>
    </>
  );
}
