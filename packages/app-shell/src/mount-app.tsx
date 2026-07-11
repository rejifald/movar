import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLocale } from '@movar/i18n';
import { AppShell } from './app-shell';

export interface MountOptions {
  /**
   * The host's UI language — the extension threads `browser.i18n.getUILanguage()`
   * in, the Safari host app `navigator.language`. Injected rather than read here
   * so the shell stays free of any `wxt`/`browser` dependency and can be mounted
   * by a non-extension host.
   *
   * When provided, seeds `<html lang>` from the resolved locale BEFORE React
   * renders. The ErrorBoundary sits above `I18nProvider`, whose lang-setting
   * effect hasn't run yet — so a crash on the very first render would otherwise
   * read the static `en` and show the English fallback even to a Ukrainian user.
   * This is a best-effort heuristic for the pre-React window; `I18nProvider`'s
   * effect (keyed on the resolved settings locale) takes over once settings
   * load. Omit it (e.g. the static-serve preview where `browser.i18n` is
   * absent) to leave the document's default lang in place.
   */
  browserUiLanguage?: string;
  /**
   * Forwarded to the shell's {@link AppShell}/{@link ErrorBoundary} as
   * `fallback` — a surface-specific crash panel that replaces the default one.
   * The extension popup passes a StatusHeader-based crash card so a crashed popup
   * still reads as Movar; options/Safari host omit it and get the default panel.
   */
  fallback?: ReactNode;
}

/**
 * Mount a React tree into the page's `#root` element, wrapped in the shared
 * {@link AppShell} (StrictMode + ErrorBoundary). No-op if `#root` is absent —
 * the static-serve preview and the offline e2e specs rely on this silent bail.
 */
export function mountApp(app: ReactNode, options: Readonly<MountOptions> = {}): void {
  const root = document.querySelector('#root');
  if (!root) return;
  const { browserUiLanguage, fallback } = options;
  if (browserUiLanguage !== undefined) {
    document.documentElement.lang = resolveLocale('auto', browserUiLanguage);
  }
  createRoot(root).render(<AppShell fallback={fallback}>{app}</AppShell>);
}
