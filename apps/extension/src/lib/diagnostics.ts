/* eslint-disable no-console -- diagnostics module: structured console IS the devtools surface */
/**
 * On-device shadow-oracle diagnostics (see docs/per-snippet-language-detection.md).
 *
 * Verifies the per-snippet classifier's rung-1/2 decisions against an off-path
 * franc oracle — idle-scheduled and batched, off the hot path — and records only
 * confident *contradictions*. Local-only: a bounded in-memory ring buffer plus
 * structured console output exposed on `globalThis.__movar.diagnostics`. Nothing
 * is ever persisted or sent over the network.
 */
import {
  classifyDivergence,
  francOracle,
  type LanguageProfile,
  type SnippetVerdict,
} from '@movar/lang-detect';
import type { DetectionDivergence, DiagnosticsSummary } from '@movar/shared';

const RING_MAX = 200;
const SAMPLE_MAX = 120;

const ring: DetectionDivergence[] = [];
let queue: { text: string; verdict: SnippetVerdict }[] = [];
let scheduled = false;

const RECENT_MAX = 25;

/** Snapshot for the popup diagnostics surface: total recorded + the most recent
 *  few (newest first). Read via the `movar:getDiagnostics` message. */
export function getDiagnosticsSummary(): DiagnosticsSummary {
  return { total: ring.length, recent: ring.slice(-RECENT_MAX).toReversed() };
}

function lengthBucket(n: number): DetectionDivergence['lengthBucket'] {
  if (n < 16) return 'xs';
  if (n < 40) return 's';
  if (n < 120) return 'm';
  return 'l';
}

/**
 * Queue a classified snippet for off-path oracle verification. Only confident
 * rung-1/2 decisions are worth checking — rung 3 *is* franc, and 'unknown' is
 * not a decision.
 */
export function queueSnippet(text: string, verdict: SnippetVerdict): void {
  if (verdict.language === 'unknown' || verdict.rung === null || verdict.rung === 3) return;
  queue.push({ text, verdict });
}

function exposeRing(): void {
  const g = globalThis as typeof globalThis & {
    __movar?: { diagnostics?: readonly DetectionDivergence[] };
  };
  g.__movar = { ...g.__movar, diagnostics: ring };
}

/**
 * Synchronous oracle pass over the queued snippets. Records only confident
 * contradictions; returns those recorded this drain. Exported for testing —
 * production calls it via {@link scheduleOracleDrain} on idle.
 */
export function drainQueue(
  candidates: readonly LanguageProfile[],
  domain: string,
  now: number = Date.now(),
): DetectionDivergence[] {
  const batch = queue;
  queue = [];
  const found: DetectionDivergence[] = [];
  for (const { text, verdict } of batch) {
    const oracle = francOracle(text, candidates);
    if (oracle === null) continue;
    if (classifyDivergence(verdict, oracle) !== 'contradict') continue;
    const div: DetectionDivergence = {
      timestamp: now,
      domain,
      candidates: candidates.map((c) => c.code),
      classifier: { language: verdict.language, margin: verdict.margin, rung: verdict.rung },
      oracle,
      sample: text.slice(0, SAMPLE_MAX),
      lengthBucket: lengthBucket(text.length),
    };
    found.push(div);
    ring.push(div);
    if (ring.length > RING_MAX) ring.shift();
    console.groupCollapsed(
      `[movar:detect] divergence — classifier ${div.classifier.language} (rung ${div.classifier.rung}) vs oracle ${div.oracle.language}`,
    );
    console.log('sample:', div.sample);
    console.log('record:', div);
    console.groupEnd();
  }
  if (found.length > 0) exposeRing();
  return found;
}

/** Schedule a drain on idle (off the hot path). Coalesces overlapping ticks. */
export function scheduleOracleDrain(candidates: readonly LanguageProfile[], domain: string): void {
  if (scheduled || queue.length === 0) return;
  scheduled = true;
  const run = (): void => {
    scheduled = false;
    drainQueue(candidates, domain);
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
}
