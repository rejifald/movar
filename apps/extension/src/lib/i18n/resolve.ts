import type { UiLanguage } from '@movar/shared';

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
