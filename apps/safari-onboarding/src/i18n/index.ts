import { messagesEn } from './messages-en';
import type { OnboardingMessages } from './messages-en';
import { messagesUk } from './messages-uk';

export type { OnboardingMessages } from './messages-en';

/** The two locales the wrapper app ships, mirroring the native `en` + `uk`
 *  `.lproj` catalogues this screen replaced. */
export type OnboardingLocale = 'en' | 'uk';

const CATALOGUES: Record<OnboardingLocale, OnboardingMessages> = {
  en: messagesEn,
  uk: messagesUk,
};

/**
 * Resolve the onboarding locale from a BCP-47 language tag.
 *
 * The tag comes from the native side (`navigator.language`, which WKWebView
 * derives from the app's effective localization / the device language) — we
 * only care about the primary subtag, so `uk`, `uk-UA`, `en-US`, `en-GB` all
 * collapse to `uk` / `en`. Anything outside the supported set falls back to
 * English, matching the extension's `resolveLocale` and the app's `Base.lproj`
 * (English) default.
 *
 * Pure and dependency-free so it's trivially testable.
 */
export function resolveLocale(languageTag: string | null | undefined): OnboardingLocale {
  const primary = (languageTag ?? '').toLowerCase().split('-')[0];
  return primary === 'uk' ? 'uk' : 'en';
}

/** Look up the string catalogue for a resolved locale. */
export function messagesFor(locale: OnboardingLocale): OnboardingMessages {
  return CATALOGUES[locale];
}
