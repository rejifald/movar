/**
 * chrome-ai engine — wraps the browser's on-device LanguageDetector API
 * (Gemini Nano on Chrome 138+ / Edge). Opportunistic: never triggers a model
 * download. Users without the model fall through to franc.
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
import type { LanguageCode } from '../lang-codes';

const ENGINE_ID = 'chrome-ai';
const DEFAULT_MAX_CHARS = 2000;
/** Minimum confidence the top-language result must have to count as a
 *  confident detection. Below this we abstain and let the orchestrator try
 *  the next engine. Chrome's model returns full confidence arrays summing to
 *  1.0; a 0.6 floor keeps mixed-language pages from getting misclassified by
 *  a thin plurality. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * BCP-47 codes this engine treats as a real, recognized language. Mirrors the
 * target side of franc-core's `ISO_639_3_TO_BCP_47` map (./franc-core.ts) so
 * chrome-ai and franc agree on what counts as "known" — both engines are
 * validated against the same corpus (../../test/fixtures.ts's
 * `expectedEngineLanguage`). Duplicated as a plain list rather than imported
 * from franc-core: that module statically imports the ~170 KB `franc`
 * package (see its header comment), and importing anything from it — even a
 * constant — would drag franc's trigram tables into every chrome-ai
 * consumer, including the franc-free content-script bundle.
 *
 * Chrome's `LanguageDetector` can return `'und'` (undetermined) as a top,
 * confidently-scored result (issue #305) — `'und'` isn't a real language, so
 * it's deliberately absent here and falls through the same "unrecognized
 * code" branch as any other unknown value, exactly as franc rejects its own
 * `'und'` before returning (franc-core.ts).
 */
const KNOWN_LANGUAGE_CODES: ReadonlySet<LanguageCode> = new Set([
  'ar',
  'be',
  'bg',
  'bn',
  'bs',
  'ca',
  'cs',
  'cy',
  'da',
  'de',
  'el',
  'en',
  'es',
  'eu',
  'fi',
  'fr',
  'ga',
  'gl',
  'he',
  'hi',
  'hu',
  'hy',
  'id',
  'is',
  'it',
  'ja',
  'jv',
  'ka',
  'kk',
  'ko',
  'ky',
  'nl',
  'no',
  'pl',
  'pt',
  'ro',
  'ru',
  'sr',
  'sv',
  'th',
  'tr',
  'tt',
  'uk',
  'vi',
  'zh',
]);

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

function getApi(): LanguageDetectorApi | null {
  const globalRef = globalThis as unknown as { LanguageDetector?: LanguageDetectorApi };
  return globalRef.LanguageDetector ?? null;
}

/**
 * Resolve the top Chrome result into a validated language/confidence pair, or
 * null when it shouldn't count as a positive detection: no candidates,
 * confidence below threshold, or a code outside {@link KNOWN_LANGUAGE_CODES}
 * (which excludes Chrome's raw `'und'` — see that constant's doc comment).
 * Split out of `detect` so neither function's branching grows unbounded.
 */
function resolveDetection(
  results: LanguageDetectorResult[],
): Pick<DetectedLanguage, 'language' | 'confidence'> | null {
  const top = results[0];
  if (!top) return null;
  if (top.confidence < CONFIDENCE_THRESHOLD) return null;
  if (!KNOWN_LANGUAGE_CODES.has(top.detectedLanguage)) return null;
  return { language: top.detectedLanguage, confidence: top.confidence };
}

/**
 * Resolve `p`, or `null` as soon as `signal` aborts. In-flight work keeps
 * running past the deadline — we just stop awaiting it — so e.g. a session
 * creation that's still warming when the budget expires finishes anyway and
 * `getSession`'s cache picks it up on the next call (see the module doc
 * comment on `TIER7_TIMEOUT_MS` in content-runtime.ts). Mirrors
 * lang-detect-bridge.ts's `raceAbort` (the franc engine's abort handling);
 * duplicated here rather than imported because that module lives in
 * apps/extension — the wrong side of the package boundary for a package
 * under packages/lang-detect to depend on.
 */
async function raceAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T | null> {
  if (!signal) return p;
  if (signal.aborted) return null;
  return Promise.race([
    p,
    new Promise<null>((resolve) => {
      signal.addEventListener(
        'abort',
        () => {
          resolve(null);
        },
        { once: true },
      );
    }),
  ]);
}

/**
 * Races the model's own `detect()` call against `ctx.signal` and resolves the
 * result. Split out of the engine's `detect` so the abort short-circuit and
 * the result validation don't pile onto session/sample handling in one
 * function (same rationale as splitting out {@link resolveDetection}).
 */
async function raceDetect(
  session: LanguageDetectorSession,
  sample: string,
  signal: AbortSignal | undefined,
): Promise<Pick<DetectedLanguage, 'language' | 'confidence'> | null> {
  const results = await raceAbort(session.detect(sample), signal);
  if (!results) return null;
  return resolveDetection(results);
}

export function createChromeAiEngine(): LanguageDetectionEngine {
  /** Instance cache: once we've confirmed the API is available we keep saying
   *  so for the content-script lifetime; once we've confirmed it's not, we
   *  keep skipping. The orchestrator runs many times per tab, so per-call
   *  availability() calls would burn a meaningful chunk of the 150 ms budget. */
  let cachedAvailability: boolean | null = null;
  let cachedSession: LanguageDetectorSession | null = null;

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

  return {
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
      const session = await raceAbort(getSession(), ctx.signal);
      if (!session) return null;
      const sample = text.slice(0, ctx.maxChars ?? DEFAULT_MAX_CHARS);
      const resolved = await raceDetect(session, sample, ctx.signal);
      if (!resolved) return null;
      return { ...resolved, engine: ENGINE_ID };
    },
  };
}

export const chromeAiEngine: LanguageDetectionEngine = createChromeAiEngine();
