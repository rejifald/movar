/**
 * franc engine — trigram-based body-text detection (franc, 187 languages).
 *
 * The heavy franc tables live in ./franc-core and load lazily on the first
 * detect(), then stay cached for the process. Importing this engine (e.g. into
 * the default roster, or a background worker that hosts franc) therefore does
 * NOT statically pull franc's tables — a consumer that never calls detect()
 * never loads them. Stays DOM/worker-agnostic and isomorphic.
 *
 * Always available — `isAvailable` returns a bare synchronous `true` so the
 * orchestrator can skip a promise round-trip; it must NOT touch the lazy core.
 */
import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from '../engine';

const ENGINE_ID = 'franc';

type FrancDetect = (text: string, ctx: DetectContext) => DetectedLanguage | null;

/** Cached franc detect fn — franc's trigram tables are evaluated once per
 *  process on the first load (first detect(), or an explicit warmFranc()). */
let cachedDetect: FrancDetect | null = null;

async function loadDetect(): Promise<FrancDetect> {
  cachedDetect ??= (await import('./franc-core')).detectWithFranc;
  return cachedDetect;
}

export const francEngine: LanguageDetectionEngine = {
  id: ENGINE_ID,
  isAvailable(): boolean {
    return true;
  },
  async detect(text, ctx: DetectContext): Promise<DetectedLanguage | null> {
    const detect = await loadDetect();
    return detect(text, ctx);
  },
};

/** Force the franc core to load now (cold-start mitigation for hosts that know
 *  a detect() is imminent — e.g. a background worker warming on startup). */
export async function warmFranc(): Promise<void> {
  await loadDetect();
}
