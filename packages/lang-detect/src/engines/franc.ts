/**
 * franc engine — trigram-based body-text detection (franc, 187 languages).
 *
 * `./franc-core` (the ~170 KB of franc trigram tables) is imported STATICALLY
 * here, on purpose and load-bearing. A *lazy* `import('./franc-core')` gets
 * code-split into its own chunk, and Vite then wraps the dynamic import in its
 * `__vitePreload` helper — which reads the DOM
 * (`document.getElementsByTagName`, the CSP-nonce `<meta>`,
 * `document.head.appendChild`) to inject `<link rel=modulepreload>` tags. WXT
 * bundles the MV3 background service worker in the same DOM-assuming multi-page
 * Vite build as the extension's HTML pages, so a lazy franc load there made the
 * worker throw `ReferenceError: document is not defined` on every wake
 * (`warmFranc` runs at SW boot) — surfacing as the extension "crashing" in
 * chrome://extensions. A static import keeps franc-core in the importer's own
 * chunk: no split, no preload helper, no DOM access. See wxt.config's
 * `assertContentFrancFree` note for the counterpart size/isolation guards.
 *
 * Bundle isolation is unchanged: the franc-free barrel (`@movar/lang-detect`)
 * still never imports this module, so the content script — which reaches franc
 * only through the background message bridge — stays franc-free (enforced by the
 * content-bundle guards). Every consumer of this wrapper (the background worker,
 * the diagnostics + Safari host apps) already loads franc eagerly via
 * `classify-franc`, so eager franc-core adds no real weight to any of them.
 *
 * Always available — `isAvailable` returns a bare synchronous `true` so the
 * orchestrator can skip a promise round-trip.
 */
import { detectWithFranc } from './franc-core';
import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from '../engine';

const ENGINE_ID = 'franc';

export const francEngine: LanguageDetectionEngine = {
  id: ENGINE_ID,
  isAvailable(): boolean {
    return true;
  },
  // franc itself is synchronous; the async signature satisfies the engine
  // contract's Promise return. A franc throw surfaces to the orchestrator, which
  // falls through to the next engine — matching the interface's documented
  // "throwing behaves identically to null" semantics.
  // eslint-disable-next-line @typescript-eslint/require-await -- sync in-process detector behind the async LanguageDetectionEngine.detect contract; nothing to await
  async detect(text, ctx: DetectContext): Promise<DetectedLanguage | null> {
    return detectWithFranc(text, ctx);
  },
};

/** No-op retained for API compatibility. franc-core is now statically bundled
 *  with this module (see the header), so it is already parsed by the time this
 *  module evaluates — there is nothing left to pre-load. Kept so the call sites
 *  that warm franc before a known-imminent detect() (the background worker at
 *  boot, `movar:warmFranc`) and their tests keep working unchanged; the message
 *  itself still usefully wakes the service worker early. */
// eslint-disable-next-line @typescript-eslint/require-await -- retained no-op behind the Promise<void> warmFranc contract; franc-core is statically bundled, nothing left to load
export async function warmFranc(): Promise<void> {
  // Intentionally empty — see the doc comment above.
}
