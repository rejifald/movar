/**
 * Default tier-7 engine roster + the convenience entry point that uses it.
 *
 * Kept out of orchestrator.ts (the franc-free dispatcher) so that importing
 * `detectLanguageFromTextWith` does not statically pull the franc engine. A
 * consumer that wants the batteries-included `detectLanguageFromText` opts into
 * franc by importing it from here (or the `@movar/lang-detect/franc` subpath);
 * a consumer that hosts franc elsewhere (e.g. the extension's background
 * worker) builds its own roster and calls `detectLanguageFromTextWith`.
 */
import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from './engine';
import { chromeAiEngine } from './engines/chrome-ai';
import { francEngine } from './engines/franc';
import { detectLanguageFromTextWith } from './orchestrator';

/** Order matters: chrome-ai (Gemini Nano on-device) when available beats franc
 *  on accuracy and language coverage. franc is the cross-browser baseline.
 *  New engines append. */
export const ENGINES: readonly LanguageDetectionEngine[] = [chromeAiEngine, francEngine];

/** Public surface: detect text language using the built-in engine roster. */
export async function detectLanguageFromText(
  text: string,
  ctx: DetectContext = {},
): Promise<DetectedLanguage | null> {
  return detectLanguageFromTextWith(ENGINES, text, ctx);
}
