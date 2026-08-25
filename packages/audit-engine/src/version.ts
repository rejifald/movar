/**
 * The engine build stamped into every `Report` this package produces.
 *
 * Same mechanism, and the same reason, as the host app's `APP_VERSION`
 * (`apps/safari-host-app/src/version.ts`). This bundle is loaded from the app's
 * own resources into an offscreen WebView under a strict `default-src 'self'`
 * CSP and has no `browser.runtime` — so it cannot read its version at runtime,
 * and fetching one is not merely inconvenient but the thing every store
 * prohibits (`docs/native-shells.md`, "Store constraints"). Instead Vite's
 * `define` bakes it in at build time, replacing `__MOVAR_ENGINE_VERSION__` in
 * the shipped bundle.
 *
 * The test and typecheck configs deliberately omit that `define` (they are unit
 * configs, not bundle builds), so a bare read of `__MOVAR_ENGINE_VERSION__`
 * would throw `ReferenceError`. The `typeof` guard is the one safe way to
 * reference a possibly-undeclared global; it resolves to `'string'` in the
 * built bundle and `'undefined'` in tests or a dev run without the define,
 * where we fall back to `dev`. The shipped bundle always carries the real
 * version.
 *
 * `dev` is an answer, not a placeholder standing in for one: it says a report
 * came out of an unversioned tree, which is a fact a re-adjudicating reader can
 * act on. It is also why `Report.engine` stays absent rather than defaulted
 * when nobody declares a stamp — `dev` is what an unversioned **engine** says
 * about itself, and no other runtime may borrow it.
 */
declare const __MOVAR_ENGINE_VERSION__: string | undefined;

export const ENGINE_VERSION: string =
  typeof __MOVAR_ENGINE_VERSION__ === 'string' && __MOVAR_ENGINE_VERSION__.length > 0
    ? __MOVAR_ENGINE_VERSION__
    : 'dev';

/**
 * The engine's stable identity, paired with {@link ENGINE_VERSION} in the
 * report's stamp.
 *
 * Constant because it names the producer, not the platform: iOS, Android and
 * Windows all host this same bundle, and which one they are is already stamped
 * separately, as the collector the host declares at engine init. A report that
 * conflated the two would lose the ability to say that three platforms reached
 * one verdict — the entire point of keeping the kernel in one place.
 */
export const ENGINE_ID = 'movar-audit-engine';
