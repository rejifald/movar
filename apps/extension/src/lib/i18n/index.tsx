import { createContext, use, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { browser } from 'wxt/browser';
import type { UiLanguage } from '@movar/settings';
import { messagesEn } from './messages-en';
import type { Messages } from './messages-en';
import { messagesUk } from './messages-uk';
import { resolveLocale } from './resolve';
import type { ResolvedLocale } from './resolve';

export { resolveLocale, uiLanguageFromPriority } from './resolve';
export type { ResolvedLocale } from './resolve';
export type { Messages } from './messages-en';
export { makeLanguageDisplay } from './display-names';

const CATALOGUES: Record<ResolvedLocale, Messages> = {
  en: messagesEn,
  uk: messagesUk,
};

interface I18nContextValue {
  locale: ResolvedLocale;
  t: Messages;
}

/** Default to English so a missing provider still renders something readable. */
const I18nContext = createContext<I18nContextValue>({
  locale: 'en',
  t: messagesEn,
});

interface I18nProviderProps {
  /** User's stored preference. `'auto'` resolves via `browser.i18n.getUILanguage()`. */
  uiLanguage: UiLanguage;
  children: ReactNode;
}

export function I18nProvider({ uiLanguage, children }: Readonly<I18nProviderProps>) {
  const locale = useMemo(
    () => resolveLocale(uiLanguage, browser.i18n.getUILanguage()),
    [uiLanguage],
  );
  const value = useMemo<I18nContextValue>(() => ({ locale, t: CATALOGUES[locale] }), [locale]);

  // Reflect the resolved UI locale onto <html lang> so screen readers pronounce
  // the (Ukrainian or English) chrome in the right language — WCAG 3.1.1 — and
  // so the ErrorBoundary, which sits above this provider and reads
  // document.documentElement.lang, picks the matching crash-screen catalogue.
  // Runs after first paint; mount-app seeds a best-effort lang before React
  // renders, covering the pre-effect window. This effect is the source of truth
  // once settings load.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n(): I18nContextValue {
  return use(I18nContext);
}
