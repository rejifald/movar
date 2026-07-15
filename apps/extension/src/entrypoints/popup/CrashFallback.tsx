import type { JSX } from 'react';
import { cn } from '@movar/ui';
import { ErrorBoundary } from '@movar/app-shell';
import { I18nProvider } from '@movar/i18n';
import { defaultSettings } from '@movar/settings';
import type { UiLanguage } from '@movar/settings';
import { StatusHeader } from './StatusHeader';
import { SafeCrashCard } from './SafeCrashCard';
import { POPUP_WIDTH_CLASS } from './popup-shell';
import type { PauseState } from '../../lib/pause';

/** Ignored in crash mode (StatusHeader short-circuits before reading it), but
 *  the prop is required — a crash may have corrupted the live pause state, so we
 *  pass a known-good default rather than thread anything through. */
const NOT_PAUSED: PauseState = { paused: false, until: null, indefinite: false };

/** The crash hero shows only a reload button; the other CTAs are never
 *  surfaced, so they're inert. */
const noop = (): void => {
  // no-op — see above
};

/**
 * The popup's crash screen. When the popup's React tree throws on first paint,
 * its ErrorBoundary renders this instead of the default panel, so a failed popup
 * still reads as Movar: the same brand bar + a muted "unexpected error" hero + a
 * reload button (a crashed {@link StatusHeader}), at the popup's own 360px width.
 *
 * Wrapped in its own {@link ErrorBoundary} as an ultimate net: StatusHeader
 * needs an {@link I18nProvider} + @movar/ui, and the outer boundary — which
 * already caught the app crash — can't catch an error in its own fallback. So if
 * THIS tree also throws, the inner boundary drops to {@link SafeCrashCard}, which
 * reproduces this card's look with dependency-free primitives (no StatusHeader,
 * no I18nProvider) and reads `document.documentElement.lang` directly.
 *
 * Locale follows `document.documentElement.lang` (seeded by mount-app, kept in
 * sync by I18nProvider) — the same signal the minimal panel's copy pick uses. We
 * feed the resolved locale straight into I18nProvider, which is pure (static
 * catalogue, no storage), so it's safe to mount on the crash path.
 */
export function PopupCrashFallback(): JSX.Element {
  const lang = document.documentElement.lang.toLowerCase();
  const locale: UiLanguage = lang.startsWith('uk') ? 'uk' : 'en';

  return (
    <ErrorBoundary fallback={<SafeCrashCard />}>
      <I18nProvider uiLanguage={locale} browserUiLanguage={locale}>
        <div
          className={cn(
            'bg-surface text-ink-strong text-ui-md max-w-full font-sans',
            POPUP_WIDTH_CLASS,
          )}
        >
          <StatusHeader
            crashed
            settings={defaultSettings}
            pause={NOT_PAUSED}
            hidden={null}
            exempt={false}
            hasPage={false}
            snoozedUntil={null}
            actions={{
              onReloadTab: () => {
                location.reload();
              },
              onEnableForSite: noop,
              onTurnOn: noop,
              onResumeSite: noop,
            }}
          />
        </div>
      </I18nProvider>
    </ErrorBoundary>
  );
}
