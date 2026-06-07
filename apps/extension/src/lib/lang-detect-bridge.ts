/**
 * Bridge from the content script to the background-worker franc.
 *
 * The content script holds NO franc — these helpers message the background
 * (which hosts the franc tables) and adapt the responses back into the
 * @movar/lang-detect shapes the orchestrator and content filter expect. Keeping
 * franc off the content thread is the whole point: it removes ~170 KB of trigram
 * tables from every page's content bundle. This module imports only types from
 * @movar/lang-detect, so it stays franc-free itself.
 */
import { browser } from 'wxt/browser';
import type {
  DetectContext,
  DetectedLanguage,
  LanguageCode,
  LanguageDetectionEngine,
  SnippetVerdict,
} from '@movar/lang-detect';
import type { ClassifySnippetsMessage, DetectTextMessage, WarmFrancMessage } from './messaging';

/** Resolve `p`, or `null` as soon as `signal` aborts. In-flight background work
 *  keeps running (warming franc for the next tick) — we just stop awaiting it. */
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
 * Tier-7 franc engine hosted in the background worker. Implements the standard
 * LanguageDetectionEngine contract so it drops into
 * `detectLanguageFromTextWith([chromeAiEngine, backgroundFrancEngine], …)`. The
 * id stays 'franc' so CorrectionEvent.detectionEngine telemetry is unchanged
 * from the in-process engine. Abstains (null) on abort, a rejected message, or
 * an unreachable worker — the orchestrator then falls through.
 */
export const backgroundFrancEngine: LanguageDetectionEngine = {
  id: 'franc',
  isAvailable(): boolean {
    return true;
  },
  async detect(text, ctx: DetectContext): Promise<DetectedLanguage | null> {
    const message: DetectTextMessage = { type: 'movar:detectText', text };
    if (ctx.maxChars != null) message.maxChars = ctx.maxChars;
    try {
      const raw: unknown = await raceAbort(browser.runtime.sendMessage(message), ctx.signal);
      return (raw as DetectedLanguage | null) ?? null;
    } catch {
      return null;
    }
  },
};

/**
 * Batched snippet classifier for the content filter. Sends every scanned card's
 * text (plus the candidate language codes) to the worker, which runs the full
 * classifier (rungs 1–3) and returns one verdict (or null) per text, in order —
 * keeping the language profiles + franc out of the content bundle. One message
 * per tick. On any failure every text resolves to null (abstain → keep the card).
 */
export async function classifySnippets(
  texts: readonly string[],
  candidateCodes: readonly LanguageCode[],
): Promise<readonly (SnippetVerdict | null)[]> {
  if (texts.length === 0) return [];
  const message: ClassifySnippetsMessage = {
    type: 'movar:classifySnippets',
    texts: [...texts],
    candidateCodes: [...candidateCodes],
  };
  try {
    const raw: unknown = await browser.runtime.sendMessage(message);
    return (raw as readonly (SnippetVerdict | null)[] | undefined) ?? texts.map(() => null);
  } catch {
    return texts.map(() => null);
  }
}

/** Wake the background worker and warm franc's tables (cold-start mitigation).
 *  Fire-and-forget — failures are ignored; the first real detect() will warm it. */
export async function warmBackgroundFranc(): Promise<void> {
  const message: WarmFrancMessage = { type: 'movar:warmFranc' };
  try {
    await browser.runtime.sendMessage(message);
  } catch {
    // Worker not ready / no receiver — first real detect() warms franc instead.
  }
}
