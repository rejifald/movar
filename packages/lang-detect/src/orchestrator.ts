/**
 * Tier-7 dispatcher: walks an engine roster in order, returns the first
 * non-null result. No registry API, no confidence floor, no error propagation —
 * engines that throw or return null are equivalent ("fall through").
 *
 * Franc-free by construction: this module imports no engines, so importing the
 * dispatcher never pulls franc. The batteries-included roster + entry point
 * (`ENGINES`/`detectLanguageFromText`) live in ./default-roster, which imports
 * the franc engine. A host that supplies its own engines — e.g. the extension's
 * background-worker franc, reached by message — calls this directly.
 *
 * See docs/on-device-language-detection.md for the design.
 */

import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';

/** Engine-agnostic dispatcher. Tests and alternative hosts pass their own engine
 *  arrays; the production `detectLanguageFromText` (./default-roster) is a thin
 *  wrapper around this with the built-in `ENGINES`. */
export async function detectLanguageFromTextWith(
  engines: readonly LanguageDetectionEngine[],
  text: string,
  ctx: DetectContext = {},
): Promise<DetectedLanguage | null> {
  for (const engine of engines) {
    try {
      if (!(await engine.isAvailable())) continue;
      const result = await engine.detect(text, ctx);
      if (result) return result;
    } catch {
      // fall through to the next engine
    }
  }
  return null;
}
