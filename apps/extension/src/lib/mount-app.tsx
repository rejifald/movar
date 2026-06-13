import { StrictMode } from 'react';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { ErrorBoundary } from './error-boundary';
import { resolveLocale } from './i18n/resolve';

/** Mount a React app into the `#root` element. No-op if the element is absent.
 *  The `ErrorBoundary` wraps every surface so a storage read that throws
 *  mid-render or a deep TypeError surfaces as a calm "Reload" panel instead
 *  of a blank popup. */
export function mountApp(App: ComponentType): void {
  const root = document.querySelector('#root');
  if (!root) return;
  // Seed <html lang> from the browser UI language BEFORE React renders. The
  // ErrorBoundary sits above I18nProvider, whose lang-setting effect hasn't run
  // yet — so a crash on the very first render would otherwise read the static
  // `en` and show the English fallback even to a Ukrainian user. This is a
  // best-effort heuristic for the pre-React window; I18nProvider's effect (keyed
  // on the resolved settings locale) takes over once settings load. Guarded for
  // the static-serve preview where `browser.i18n` is absent.
  try {
    document.documentElement.lang = resolveLocale('auto', browser.i18n.getUILanguage());
  } catch {
    // No browser.i18n (preview) — leave the document's default lang in place.
  }
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
