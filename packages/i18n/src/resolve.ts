import type { LanguageCode } from '@movar/lang-detect';
import type { UiLanguage } from '@movar/settings';

/** Resolved locale used to pick a string catalogue. */
export type ResolvedLocale = 'en' | 'uk';

/**
 * Resolve the popup's UI locale from the user's stored preference and the
 * browser UI language. 'auto' follows the browser; anything outside the
 * supported set falls back to 'en'.
 *
 * Pure so it's trivially testable — callers thread `browser.i18n.getUILanguage()`
 * in, we don't reach for it here.
 */
export function resolveLocale(setting: UiLanguage, browserUiLanguage: string): ResolvedLocale {
  if (setting === 'en' || setting === 'uk') return setting;
  // 'auto' — match by primary subtag. getUILanguage() may return 'uk', 'uk-UA',
  // 'en-US', etc.; we only care about the first segment.
  const primary = browserUiLanguage.toLowerCase().split('-')[0];
  return primary === 'uk' ? 'uk' : 'en';
}

/**
 * Did the *resolved* content-script locale change between two settings
 * snapshots? Each curtain bakes its catalogue strings into shadow DOM when it's
 * built (the content script only refetches the worker's strings when the locale
 * actually changes), so when this returns true the live concealment has to be
 * torn down and rebuilt to switch language. Compares the resolved locale, not
 * the raw `uiLanguage`, so an 'auto' → 'auto' edit (or any change that still
 * resolves to the same catalogue) is correctly a no-op.
 *
 * Pure — the caller threads `browser.i18n.getUILanguage()` in.
 */
export function contentLocaleChanged(
  previous: UiLanguage,
  next: UiLanguage,
  browserUiLanguage: string,
): boolean {
  return resolveLocale(previous, browserUiLanguage) !== resolveLocale(next, browserUiLanguage);
}

/**
 * Pick the popup's UI language from the user's content-language priority order
 * (`MovarSettings.priority`) rather than a separate picker: the popup speaks the
 * first priority language it has a catalogue for. Falls back to 'auto' (follow
 * the browser, via {@link resolveLocale}) when no priority language is a
 * supported UI locale.
 *
 * Pure + testable; the caller feeds the result straight into `I18nProvider`.
 */
export function uiLanguageFromPriority(priority: readonly LanguageCode[]): UiLanguage {
  return priority.find((code): code is 'en' | 'uk' => code === 'en' || code === 'uk') ?? 'auto';
}
