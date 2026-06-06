/**
 * chrome-ai engine — wraps the browser's on-device LanguageDetector API
 * (Gemini Nano on Chrome 138+ / Edge). Opportunistic: never triggers a model
 * download. Users without the model fall through to franc-min.
 *
 * Availability semantics (per Chrome docs):
 *  - 'available'    — model loaded, ready. We're available.
 *  - 'downloadable' — model could be fetched on demand. We treat as
 *                     unavailable so we never initiate a ~2 MB download the
 *                     user hasn't consented to. If Chrome ever begins the
 *                     download on its own (because another feature triggered
 *                     it), the next isAvailable() recheck would see 'available'
 *                     and flip — that's the cache-once-true policy below.
 *  - 'downloading'  — same reasoning; wait for the model to land.
 *  - 'unavailable'  — Chrome's flat-out no. Skip permanently.
 *
 * See docs/on-device-language-detection.md (open question on
 * 'downloadable' semantics).
 */

import type { DetectContext, DetectedLanguage, LanguageDetectionEngine } from '../engine';

const ENGINE_ID = 'chrome-ai';
const DEFAULT_MAX_CHARS = 2000;
/** Minimum confidence the top-language result must have to count as a
 *  confident detection. Below this we abstain and let the orchestrator try
 *  the next engine. Chrome's model returns full confidence arrays summing to
 *  1.0; a 0.6 floor keeps mixed-language pages from getting misclassified by
 *  a thin plurality. */
const CONFIDENCE_THRESHOLD = 0.6;

type AvailabilityState = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LanguageDetectorResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorSession {
  detect(text: string): Promise<LanguageDetectorResult[]>;
}

interface LanguageDetectorApi {
  availability(): Promise<AvailabilityState>;
  create(): Promise<LanguageDetectorSession>;
}

/** Module-scoped cache: once we've confirmed the API is available we keep
 *  saying so for the content-script lifetime; once we've confirmed it's not,
 *  we keep skipping. The orchestrator runs many times per tab, so per-call
 *  availability() calls would burn a meaningful chunk of the 150 ms budget. */
let cachedAvailability: boolean | null = null;
let cachedSession: LanguageDetectorSession | null = null;

function getApi(): LanguageDetectorApi | null {
  const globalRef = globalThis as unknown as { LanguageDetector?: LanguageDetectorApi };
  return globalRef.LanguageDetector ?? null;
}

async function checkAvailability(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;
  const api = getApi();
  if (!api) {
    cachedAvailability = false;
    return false;
  }
  const state = await api.availability();
  cachedAvailability = state === 'available';
  return cachedAvailability;
}

async function getSession(): Promise<LanguageDetectorSession> {
  if (cachedSession) return cachedSession;
  const api = getApi();
  if (!api) throw new Error('chrome-ai: LanguageDetector API missing');
  cachedSession = await api.create();
  return cachedSession;
}

/** Test-only: reset the module-scoped state so each test starts cold. Exported
 *  with a double-underscore prefix to signal "not part of the public API". */
export function __resetChromeAiCacheForTests(): void {
  cachedAvailability = null;
  cachedSession = null;
}

export const chromeAiEngine: LanguageDetectionEngine = {
  id: ENGINE_ID,
  // eslint-disable-next-line sonarjs/function-return-type -- intentional boolean | Promise<boolean> per the LanguageDetectionEngine.isAvailable contract: the cached/no-API fast paths return synchronously so the orchestrator skips without a promise round-trip; only the live availability() check is async
  isAvailable(): boolean | Promise<boolean> {
    if (cachedAvailability !== null) return cachedAvailability;
    // No API at all — return false synchronously so the orchestrator can skip
    // without paying for a promise round-trip in the common (non-Chrome) case.
    if (!getApi()) {
      cachedAvailability = false;
      return false;
    }
    return checkAvailability();
  },
  async detect(text, ctx: DetectContext): Promise<DetectedLanguage | null> {
    const session = await getSession();
    const sample = text.slice(0, ctx.maxChars ?? DEFAULT_MAX_CHARS);
    const results = await session.detect(sample);
    const top = results[0];
    if (!top) return null;
    if (top.confidence < CONFIDENCE_THRESHOLD) return null;
    return {
      language: top.detectedLanguage,
      confidence: top.confidence,
      engine: ENGINE_ID,
    };
  },
};
