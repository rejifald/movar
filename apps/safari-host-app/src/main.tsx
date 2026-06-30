import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { messagesFor, resolveLocale } from './i18n';
import './styles.css';

/**
 * Entry point for the Safari wrapper app's unified host WebView. Bundled by
 * `vite.config.ts` into a single self-contained JS + CSS the WKWebView loads
 * from the app bundle under the `default-src 'self'` CSP.
 *
 * The locale is resolved ONCE from `navigator.language` (WKWebView derives it
 * from the app's effective localization / device language) — the wrapper app
 * never changes language at runtime, so a single read mirrors the native
 * `.lproj` selection. The resolved locale drives the host-shell chrome here
 * (tab labels + the About copy); the Settings tab's `@movar/i18n` provider
 * resolves the same `navigator.language` independently, keeping the two in
 * lock-step.
 *
 * Importing `./bridge` (transitively, via `App`) installs `window.show` and
 * `window.__movarReply` at module eval — before this mounts — so a `show()` or
 * a `__movarReply()` Swift fires at `didFinish` is captured, not lost to React
 * effect timing.
 */

const locale = resolveLocale(navigator.language);

// Reflect the resolved locale onto <html lang> so VoiceOver pronounces the
// (Ukrainian or English) chrome correctly — WCAG 3.1.1.
document.documentElement.lang = locale;

const container = document.querySelector('#root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App messages={messagesFor(locale)} />
    </StrictMode>,
  );
}
