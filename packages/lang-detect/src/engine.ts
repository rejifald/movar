/**
 * Engine contract for tier-7 body-text language detection.
 *
 * Engines are dispatched by `detectLanguageFromTextWith` (orchestrator). Each
 * engine is a self-contained module that owns its internal state (chrome-ai's
 * session, franc's trigram tables) and its own confidence threshold — the
 * orchestrator does not filter by confidence and does not retry across engines.
 * An engine may run in-process or off-thread: the extension hosts franc in its
 * background worker and reaches it through a thin messaging engine.
 *
 * See docs/on-device-language-detection.md for the full ADR.
 */

// `LanguageCode` (a BCP-47 tag, e.g. 'uk'/'ru'/'en'/'pt-BR') lives in lang-codes.ts — the
// canonical home, re-exported by the package index. Imported here only for the type below.
import type { LanguageCode } from './lang-codes';

export interface DetectedLanguage {
  language: LanguageCode;
  /** 0..1. Engines decide internally whether to return null vs result based on
   *  their own scoring. confidence is informational / telemetry only — the
   *  orchestrator does not filter by it. */
  confidence: number;
  /** Engine that produced this result. Surfaced via CorrectionEvent.detectionEngine. */
  engine: string;
}

export interface DetectContext {
  /** Cap text length sent to the engine. Default 2000 chars. */
  maxChars?: number;
  /** AbortSignal — orchestrator wires its 150 ms timeout here. */
  signal?: AbortSignal;
}

export interface LanguageDetectionEngine {
  /** Stable id used in telemetry and DetectedLanguage.engine. */
  readonly id: string;
  /** Whether this engine can run right now. Engines cache the result for the
   *  content-script lifetime themselves; the orchestrator does not. */
  isAvailable(): boolean | Promise<boolean>;
  /** Returns null if the engine isn't confident enough in its own result.
   *  Throwing is also fine and behaves identically — orchestrator falls
   *  through to the next engine. */
  detect(text: string, ctx: DetectContext): Promise<DetectedLanguage | null>;
}
