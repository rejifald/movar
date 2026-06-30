import { StrictMode, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { subscribe } from './bridge';
import type { OnboardingState } from './bridge';
import { messagesFor, resolveLocale } from './i18n';
import './styles.css';

/**
 * Entry point for the Safari wrapper app's onboarding WebView. Bundled by
 * `vite.config.ts` into a single self-contained JS + CSS the WKWebView loads
 * from the app bundle under the `default-src 'self'` CSP.
 *
 * The locale is resolved once from `navigator.language` (WKWebView derives it
 * from the app's effective localization / device language) — the wrapper app
 * never changes language at runtime, so a single read mirrors the native
 * `.lproj` selection.
 */

/** Bridges Swift's `show()` calls into React state. `subscribe` replays the
 *  latest snapshot the host already pushed (the bridge installs `window.show`
 *  at module eval, so a `show()` fired at `didFinish` before this mounts is
 *  buffered, not lost) and forwards every later push — the macOS app re-pushes
 *  on each focus-regain, so this is a live feed, not a one-shot. */
function Root(): JSX.Element {
  const [state, setState] = useState<OnboardingState | null>(null);

  useEffect(() => subscribe(setState), []);

  const locale = resolveLocale(navigator.language);
  return <App messages={messagesFor(locale)} state={state} />;
}

const locale = resolveLocale(navigator.language);
// Reflect the resolved locale onto <html lang> so VoiceOver pronounces the
// (Ukrainian or English) chrome correctly — WCAG 3.1.1.
document.documentElement.lang = locale;

const container = document.querySelector('#root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Root />
    </StrictMode>,
  );
}
