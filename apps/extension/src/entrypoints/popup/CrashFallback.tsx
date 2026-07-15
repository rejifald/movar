import type { JSX } from 'react';
import { cn } from '@movar/ui';
import { ErrorBoundary } from '@movar/app-shell';
import { I18nProvider, useI18n } from '@movar/i18n';
import { defaultSettings } from '@movar/settings';
import type { UiLanguage } from '@movar/settings';
import { Button } from '@movar/ui';
import { activeTabUrl, reloadActiveTab } from '../../lib/active-tab';
import { disableHostUntilUpdate } from '../../lib/pause';
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
 * "Turn off for this site" from the crash screen — disables the active host
 * until Movar's next update (`disableHostUntilUpdate`, cleared from
 * background.ts's `onInstalled`), not for a fixed duration: the crash is
 * presumably a bug in the current build, so recovery should track a fix
 * shipping, not a calendar guess. With the crashed tree gone, so is the
 * popup's only other control (ContentToggle), so a reload-that-keeps-
 * crashing leaves the user with no way to stop Movar on the page they're
 * looking at. A no-op without a real http(s) active tab — there's no site to
 * disable, and this can't fall back to a global switch that no longer exists
 * in the live UI either (see onTurnOn's off-state-only counterpart).
 *
 * Writes directly to storage rather than the crashed component state, so it
 * works regardless of what caused the crash — `disableHostUntilUpdate`
 * tolerates a malformed/absent stored list on its own. Reloads the active tab
 * afterwards so the break applies immediately, mirroring onEnableForSite; the
 * site recovers on its own at the next update (or earlier, via "Turn on for
 * this site" on the exempt hero once the popup renders normally again).
 */
async function handleTurnOffSite(): Promise<void> {
  const url = await activeTabUrl();
  if (url == null) return;
  const host = new URL(url).hostname;
  await disableHostUntilUpdate(host);
  await reloadActiveTab();
}

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
        <CrashFallbackBody />
      </I18nProvider>
    </ErrorBoundary>
  );
}

/** Split from {@link PopupCrashFallback} so `useI18n()` resolves under the
 *  I18nProvider mounted above it — calling the hook from the same component
 *  that renders the provider would read the default context. */
function CrashFallbackBody(): JSX.Element {
  const { t } = useI18n();

  return (
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
      <div className="px-4.5 py-3.5">
        <Button variant="secondary" size="sm" fullWidth onClick={() => void handleTurnOffSite()}>
          {t.errorBoundary.turnOffSite}
        </Button>
      </div>
    </div>
  );
}
