/**
 * The Movar version shown in the About tab.
 *
 * The WKWebView loads this bundle from `file://` under a strict `default-src
 * 'self'` CSP and has no `browser.runtime` — so unlike the extension's popup /
 * options (which read `browser.runtime.getManifest().version`), the host app
 * can't read its version at runtime. Instead Vite's `define` bakes it in at
 * build time: `vite.config.ts` replaces `__MOVAR_VERSION__` with the extension
 * package's version (the single product version that ships to the App Store).
 *
 * `vitest.config.ts` deliberately omits that `define` (it's a light unit-test
 * config, not a bundle build), so a bare read of `__MOVAR_VERSION__` would throw
 * `ReferenceError`. The `typeof` guard is the one safe way to reference a
 * possibly-undeclared global; it resolves to `'string'` in the built bundle and
 * `'undefined'` in tests / `vite dev` without the define, where we fall back to
 * `dev`. The shipped bundle always carries the real version.
 */
declare const __MOVAR_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __MOVAR_VERSION__ === 'string' && __MOVAR_VERSION__.length > 0 ? __MOVAR_VERSION__ : 'dev';
