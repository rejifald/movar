import { hasConcealment } from '../../lib/messaging';
import type { HiddenSummary } from '../../lib/messaging';
import { Button } from '@movar/ui';
import { useI18n, makeLanguageDisplay } from '@movar/i18n';
import type { Messages, ResolvedLocale } from '@movar/i18n';

interface HiddenPanelProps {
  hidden: HiddenSummary;
  onRestore: () => void;
}

/** Roll the concealment summary (or the post-reveal outcome) into one terse
 *  sentence for the polite live region. Built from the same locale strings the
 *  visible panel uses, so screen-reader and visual readouts stay in sync.
 *  Returns '' when there is nothing to announce (no concealment, no reveal yet)
 *  — an empty live region is silent. */
function announcement(hidden: HiddenSummary, t: Messages, locale: ResolvedLocale): string {
  if (!hasConcealment(hidden)) return hidden.userOverride ? t.hidden.restored : '';
  const displayLanguage = makeLanguageDisplay(locale);
  const parts: string[] = [];
  if (hidden.languages.length > 0) {
    parts.push(`${t.hidden.fromPickers} ${hidden.languages.map(displayLanguage).join(', ')}`);
  }
  if (hidden.containers > 0) parts.push(t.hidden.collapsed(hidden.containers));
  if (hidden.feedCurtained > 0) parts.push(t.hidden.feedCurtained(hidden.feedCurtained));
  if (hidden.feedHidden > 0) parts.push(t.hidden.feedHidden(hidden.feedHidden));
  return parts.join('. ');
}

export function HiddenPanel({ hidden, onRestore }: Readonly<HiddenPanelProps>) {
  const { t, locale } = useI18n();
  const hasHidden = hasConcealment(hidden);

  return (
    <section className="border-border border-t px-[18px] py-4">
      {/* Polite live region: announces the concealment summary and the
          "Show everything" reveal outcome to assistive tech without stealing
          focus. aria-atomic so the whole rolled-up sentence is re-read on
          change rather than just the delta. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announcement(hidden, t, locale)}
      </div>
      <h5 className="text-ink-faint mb-3 flex items-center justify-between font-mono text-[0.65625rem] font-medium tracking-[0.1em] uppercase">
        <span>{t.hidden.title}</span>
      </h5>
      {hasHidden ? (
        <HiddenList hidden={hidden} t={t} locale={locale} onRestore={onRestore} />
      ) : (
        <p className="text-ink-soft text-[0.78125rem]">
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
function HiddenList({ hidden, t, locale, onRestore }: Readonly<HiddenListProps>) {
  const displayLanguage = makeLanguageDisplay(locale);

  return (
    <>
      <ul className="text-ink mb-3 space-y-1.5 text-[0.78125rem]">
        {hidden.languages.length > 0 ? (
          <li>
            {t.hidden.fromPickers}{' '}
            <span className="text-ink-strong font-medium">
              {hidden.languages.map(displayLanguage).join(', ')}
            </span>
          </li>
        ) : null}
        {hidden.containers > 0 ? <li>{t.hidden.collapsed(hidden.containers)}</li> : null}
        {hidden.feedCurtained > 0 ? <li>{t.hidden.feedCurtained(hidden.feedCurtained)}</li> : null}
        {hidden.feedHidden > 0 ? <li>{t.hidden.feedHidden(hidden.feedHidden)}</li> : null}
      </ul>
      <Button variant="secondary" size="sm" fullWidth onClick={onRestore}>
        {t.hidden.show}
      </Button>
      <p className="text-ink-faint mt-2 font-mono text-[0.65625rem]">{t.hidden.reload}</p>
    </>
  );
}
