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
 * Resolve the host-shell locale from a BCP-47 language tag.
 *
 * The tag comes from the native side (`navigator.language`, which WKWebView
 * derives from the app's effective localization / the device language) — we
 * only care about the primary subtag, so `uk`, `uk-UA`, `en-US`, `en-GB` all
 * collapse to `uk` / `en`. Anything outside the supported set falls back to
 * English, matching the app's `Base.lproj` (English) default.
 *
 * This governs the host SHELL chrome only (tab labels + the About enablement
 * copy). The shared `@movar/i18n` resolves its own locale for the Settings tab
 * from the same `navigator.language`, so the two stay in lock-step. Pure and
 * dependency-free so it's trivially testable.
 */
export function resolveLocale(languageTag: string | null | undefined): HostLocale {
  const primary = (languageTag ?? '').toLowerCase().split('-')[0];
  return primary === 'uk' ? 'uk' : 'en';
}

/** Look up the host-shell string catalogue for a resolved locale. */
export function messagesFor(locale: HostLocale): HostMessages {
  return CATALOGUES[locale];
}
