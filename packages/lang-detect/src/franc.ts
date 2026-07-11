/**
 * `@movar/lang-detect/franc` — the opt-in franc subpath.
 *
 * Importing anything here statically pulls `franc`'s trigram tables — the engine
 * wrapper (`francEngine`/`warmFranc`) imports franc-core statically to keep the
 * MV3 service worker off Vite's DOM-reading preload helper (see ./engines/franc),
 * and `francOracle`/`francRung3Resolver` import the tables eagerly too. The
 * main barrel (`@movar/lang-detect`) is deliberately franc-free; consumers that
 * genuinely need franc in-process — the default roster, the extension's
 * background worker, diagnostics, tests — reach it through this entry so the
 * franc dependency is explicit and never leaks into a franc-free bundle.
 */
export { francEngine, warmFranc } from './engines/franc';
export { detectWithFranc, FRANC_ENGINE_ID } from './engines/franc-core';
export { francOracle, francRung3Resolver, francResidualVerdict } from './classify-franc';
export { ENGINES, detectLanguageFromText } from './default-roster';
