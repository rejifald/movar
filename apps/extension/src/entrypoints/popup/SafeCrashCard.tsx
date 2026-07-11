import type { JSX } from 'react';
import { TriangleAlert } from 'lucide-react';
import { BrandMark, Button } from '@movar/ui';
import { messagesEn, messagesUk } from '@movar/i18n';

/** Crash copy picked from `document.documentElement.lang` WITHOUT the i18n
 *  context. This renders when the primary crash card — which needs an
 *  I18nProvider — has itself thrown, so it must call into nothing. Mirrors
 *  app-shell's `pickFallbackCopy`; falls back to English when lang isn't `uk`. */
function crashCopy(): typeof messagesEn.errorBoundary {
  const lang = document.documentElement.lang.toLowerCase();
  return lang.startsWith('uk') ? messagesUk.errorBoundary : messagesEn.errorBoundary;
}

/**
 * The popup's ultimate crash backstop, rendered by {@link PopupCrashFallback}'s
 * inner ErrorBoundary if the primary crash card (a crashed StatusHeader) throws
 * too. It reproduces that card's LOOK — brand bar + a muted warning badge + hero
 * + full-width reload — but using ONLY dependency-free primitives: no
 * StatusHeader, no I18nProvider, no settings read. The markup deliberately
 * mirrors `StatusHeader`'s crash hero so the two crash surfaces read identically;
 * kept in sync by hand (the crash screen is stable, and coupling this to the
 * i18n-dependent StatusHeader is exactly what it exists to avoid).
 *
 * `role="alert"` matches the minimal panel it replaces, so assistive tech still
 * announces the crash.
 */
export function SafeCrashCard(): JSX.Element {
  const copy = crashCopy();

  return (
    <div role="alert" className="bg-surface text-ink-strong w-[360px] max-w-full font-sans text-sm">
      {/* Brand bar — mirrors StatusHeader's. */}
      <header className="border-border flex items-center gap-2.5 border-b px-[18px] py-3.5">
        <BrandMark size={20} className="text-ink-strong" title="Movar" />
        <span className="font-display text-ink-strong text-base font-bold tracking-tight">
          Movar
        </span>
      </header>

      {/* Hero — mirrors StatusHeader's muted HeroBody: badge + title + subtitle,
          then a full-width reload button. */}
      <section className="border-border border-b px-[18px] py-5">
        <div className="flex items-center gap-3">
          <div className="bg-surface-3 text-ink-soft flex size-7 flex-shrink-0 items-center justify-center rounded-full">
            <TriangleAlert size={14} strokeWidth={2.5} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-ink-strong text-[0.9375rem] leading-snug font-bold">
              {copy.title}
            </div>
            <div className="text-ink-soft mt-0.5 text-[0.78125rem] leading-snug">
              {copy.description}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => {
              location.reload();
            }}
          >
            {copy.reload}
          </Button>
        </div>
      </section>
    </div>
  );
}
