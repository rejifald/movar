/*
 * Bundle entry for the Safari host app's WKWebView (`Shared (App)/Resources`).
 *
 * The host screen is a no-build, hand-authored HTML/CSS/JS bundle under a strict
 * `default-src 'self'` CSP — it can't import ESM across origins or pull a bundler
 * at runtime. So we pre-bundle the *real* workspace logic it needs into a single
 * self-hosted IIFE (`movar-app.js`, global `Movar`) via `build-app-bundle.mts`:
 *
 *   - the language detector (feature: the standalone UA/RU check tool), and
 *   - the settings schema + validators (feature: the in-app settings panel),
 *
 * so neither feature re-implements logic that already lives — and is tested —
 * in `@movar/lang-detect` / `@movar/settings`. Drift is impossible: the host app
 * runs the same code the extension does.
 *
 * Everything re-exported here lands on `window.Movar.<name>`. The message
 * plumbing (postMessage to the native `controller` handler, the reply callback)
 * stays in the hand-written `Script.js`, not here — this module is pure logic.
 */
export { detectCyrillicLanguage, isRussian, isUkrainian } from '@movar/lang-detect';
export type { DetectionResult } from '@movar/lang-detect';

export {
  defaultSettings,
  enforceLockedLanguages,
  isLockedBlocked,
  LOCKED_BLOCKED_LANGUAGES,
  CONCEAL_MODES,
  UI_LANGUAGES,
} from '@movar/settings';
export type { MovarSettings, ConcealMode, UiLanguage } from '@movar/settings';

export { migrateSettings, coerceSettings } from '@movar/settings/migrate';

// Reuse the extension's own translated copy for the settings panel (feature #2)
// rather than maintaining a second, hand-written set. The host page reads
// window.Movar.messagesEn / .messagesUk (the same objects the popup/options use)
// and resolves language endonyms with makeLanguageDisplay — so the app and the
// extension can never drift, and Ukrainian grammar (declension, plurals) stays
// correct without re-deriving it here.
export { messagesEn } from '../../src/lib/i18n/messages-en';
export { messagesUk } from '../../src/lib/i18n/messages-uk';
export { makeLanguageDisplay } from '../../src/lib/i18n/display-names';
export type { Messages } from '../../src/lib/i18n/messages-en';
export type { ResolvedLocale } from '../../src/lib/i18n/resolve';
