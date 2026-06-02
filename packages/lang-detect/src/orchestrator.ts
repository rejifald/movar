/**
 * Tier-7 orchestrator: walks `ENGINES` in order, returns the first non-null
 * result. No registry API, no confidence floor, no error propagation —
 * engines that throw or return null are equivalent ("fall through").
 *
 * See docs/on-device-language-detection.md for the design.
 */

import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';
import { chromeAiEngine } from './engines/chrome-ai';
import { francMinEngine } from './engines/franc-min';

/** Order matters: chrome-ai (Gemini Nano on-device) when available beats
 *  franc-min on accuracy and language coverage. franc-min is the cross-
 *  browser baseline. New engines append. */
export const ENGINES: readonly LanguageDetectionEngine[] = [chromeAiEngine, francMinEngine];

/** Public surface: detect text language using the built-in engine roster. */
export function detectLanguageFromText(
  text: string,
  ctx: DetectContext = {},
): Promise<DetectedLanguage | null> {
  return detectLanguageFromTextWith(ENGINES, text, ctx);
}

/** Engine-agnostic dispatcher. Exposed for tests so they can pass synthetic
 *  engine arrays without going through vi.mock. The production
 *  `detectLanguageFromText` is a thin wrapper around this with `ENGINES`. */
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
