/**
 * Module-level i18n for the content script, where injected DOM curtains
 * (picker container, blur cards) can't read React context. The bootstrap in
 * entrypoints/content.ts calls {@link setContentLocale} once with the
 * resolved locale; curtain factories call {@link getContentMessages} when
 * they build pills.
 *
 * Defaults to English so:
 *  - Tests get deterministic strings without setup.
 *  - A miswired bootstrap fails open in a readable language rather than
 *    rendering catalogue keys.
 *
 * Locale changes after bootstrap don't retroactively re-render existing
 * curtains — the strings are baked in when the pill is built. The popup
 * setting is read at content-script init only; new curtains created after a
 * mid-session switch will reflect the new locale, existing ones won't. That's
 * an acceptable compromise vs. wiring a per-curtain subscription.
 */

import type { ResolvedLocale } from './resolve';
import { messagesEn, type Messages } from './messages-en';
import { messagesUk } from './messages-uk';

const CATALOGUES: Record<ResolvedLocale, Messages> = {
  en: messagesEn,
  uk: messagesUk,
};

let currentLocale: ResolvedLocale = 'en';

export function setContentLocale(locale: ResolvedLocale): void {
  currentLocale = locale;
}

export function getContentLocale(): ResolvedLocale {
  return currentLocale;
}

export function getContentMessages(): Messages {
  return CATALOGUES[currentLocale];
}
