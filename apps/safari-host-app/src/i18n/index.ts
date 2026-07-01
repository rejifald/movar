import { messagesEn } from './messages-en';
import type { HostMessages } from './messages-en';
import { messagesUk } from './messages-uk';

export type { HostMessages, RungKey } from './messages-en';

/** The two locales the wrapper app ships, mirroring the native `en` + `uk`
 *  `.lproj` catalogues this screen replaced. */
export type HostLocale = 'en' | 'uk';

const CATALOGUES: Record<HostLocale, HostMessages> = {
  en: messagesEn,
  uk: messagesUk,
};

/**
 * Look up the host-shell string catalogue (tab labels + the About enablement
 * copy) for a resolved locale.
 *
 * Locale resolution is NOT duplicated here — `main.tsx` resolves `HostLocale`
 * from `navigator.language` through the shared `@movar/i18n` `resolveLocale`,
 * the same resolver the Settings tab's provider uses, so the shell chrome and
 * the product copy stay in lock-step. `HostLocale` is structurally the shared
 * `ResolvedLocale` (`'en' | 'uk'`), so the resolved value maps straight in.
 */
export function messagesFor(locale: HostLocale): HostMessages {
  return CATALOGUES[locale];
}
