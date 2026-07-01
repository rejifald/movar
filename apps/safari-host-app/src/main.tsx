import { mountApp } from '@movar/app-shell';
import { resolveLocale } from '@movar/i18n';
import { App } from './App';
import { messagesFor } from './i18n';
import './styles.css';

/**
 * Entry point for the Safari wrapper app's unified host WebView. Bundled by
 * `vite.config.ts` into a single self-contained JS + CSS the WKWebView loads
 * from the app bundle under the `default-src 'self'` CSP.
 *
 * Mounts through the shared `@movar/app-shell`, so this surface gets the same
 * StrictMode + crash ErrorBoundary as the extension popup/options, and the shell
 * seeds `<html lang>` (for VoiceOver — WCAG 3.1.1) from the same resolved locale.
 *
 * The locale is resolved from `navigator.language` (WKWebView derives it from
 * the app's effective localization / device language) — the wrapper app never
 * changes language at runtime, so a single read mirrors the native `.lproj`
 * selection. It drives the host-shell chrome here (tab labels + the About copy);
 * the Settings tab's `@movar/i18n` provider resolves the same `navigator.language`
 * through the same shared `resolveLocale`, keeping the two in lock-step.
 *
 * Importing `./App` (which transitively pulls in `./bridge`) installs
 * `window.show` and `window.__movarReply` at module eval — before this mounts —
 * so a `show()` or a `__movarReply()` Swift fires at `didFinish` is captured,
 * not lost to React effect timing.
 */
const locale = resolveLocale('auto', navigator.language);

mountApp(<App messages={messagesFor(locale)} />, { browserUiLanguage: navigator.language });
