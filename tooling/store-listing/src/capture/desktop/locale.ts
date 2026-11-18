/**
 * What a capture locale means to each browser: the UI language (which is also
 * the extension's UI locale, `browser.i18n`), and the Accept-Language a fresh
 * install of that language sends.
 */
import type { Locale } from '../shots';

export interface DesktopLocale {
  /** BCP-47 tag of the browser UI. */
  readonly tag: string;
  /** Chrome `--lang`. */
  readonly chromeLang: string;
  /** Accept-Language list (Chrome `intl.accept_languages`, Firefox `intl.accept_languages`). */
  readonly acceptLanguages: string;
  /** Mozilla's localized build directory (`…/linux-x86_64/<build>/`). */
  readonly firefoxBuild: string;
  /** Firefox `intl.locale.requested` (must match the localized build). */
  readonly firefoxLocale: string;
  /** macOS `AppleLanguages` for Safari. */
  readonly appleLanguages: readonly string[];
}

export const DESKTOP_LOCALES: Readonly<Record<Locale, DesktopLocale>> = {
  uk: {
    tag: 'uk-UA',
    chromeLang: 'uk',
    acceptLanguages: 'uk-UA,uk,en-US,en',
    firefoxBuild: 'uk',
    firefoxLocale: 'uk',
    appleLanguages: ['uk-UA', 'en'],
  },
  en: {
    tag: 'en-US',
    chromeLang: 'en-US',
    acceptLanguages: 'en-US,en',
    firefoxBuild: 'en-US',
    firefoxLocale: 'en-US',
    appleLanguages: ['en-US'],
  },
};

export function parseLocale(value: string | undefined): Locale {
  if (value === 'uk' || value === 'en') return value;
  throw new Error('--locale must be uk or en');
}
