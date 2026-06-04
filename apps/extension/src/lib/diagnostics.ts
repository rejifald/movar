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
let queue: { text: string; verdict: SnippetVerdict; el?: HTMLElement }[] = [];
let scheduled = false;

/** id → the DOM element that produced a recorded divergence, weakly held so it
 *  never keeps a detached node alive. Powers the popup's "show on page"
 *  highlight; entries are dropped as their divergence ages out of the ring. */
const elements = new Map<string, WeakRef<Element>>();
let seq = 0;

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
export function queueSnippet(text: string, verdict: SnippetVerdict, el?: HTMLElement): void {
  if (verdict.language === 'unknown' || verdict.rung === null || verdict.rung === 3) return;
  queue.push({ text, verdict, ...(el ? { el } : {}) });
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
  for (const { text, verdict, el } of batch) {
    const oracle = francOracle(text, candidates);
    if (oracle === null) continue;
    if (classifyDivergence(verdict, oracle) !== 'contradict') continue;
    const id = `d${(seq += 1)}`;
    const div: DetectionDivergence = {
      id,
      timestamp: now,
      domain,
      candidates: candidates.map((c) => c.code),
      classifier: { language: verdict.language, margin: verdict.margin, rung: verdict.rung },
      oracle,
      sample: text.slice(0, SAMPLE_MAX),
      lengthBucket: lengthBucket(text.length),
    };
    if (el) elements.set(id, new WeakRef(el));
    found.push(div);
    ring.push(div);
    if (ring.length > RING_MAX) {
      const evicted = ring.shift();
      if (evicted) elements.delete(evicted.id);
    }
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

const HIGHLIGHT_MS = 1800;
const FADE_MS = 300;

/**
 * Highlight the on-page element a divergence came from (popup "show on page").
 * Returns false when the element has been garbage-collected or removed from the
 * DOM — the caller surfaces that as transient "couldn't find it" feedback.
 */
export function highlightDivergence(id: string): boolean {
  const el = elements.get(id)?.deref();
  if (!el || !el.isConnected) return false;
  flashElement(el);
  return true;
}

/**
 * Scroll `el` into view and lay a temporary highlight over it. The overlay is
 * absolutely positioned in document coordinates (so it stays put through
 * scroll) and never touches the target's own styles — non-invasive on any page.
 */
function flashElement(el: Element): void {
  const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }
  const rect = el.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.setAttribute('data-movar-highlight', 'true');
  overlay.style.cssText = [
    'position:absolute',
    'box-sizing:border-box',
    `left:${rect.left + globalThis.scrollX - 2}px`,
    `top:${rect.top + globalThis.scrollY - 2}px`,
    `width:${rect.width + 4}px`,
    `height:${rect.height + 4}px`,
    'border:2px solid #15803d',
    'border-radius:6px',
    'background:rgba(21,128,61,0.12)',
    'box-shadow:0 0 0 3px rgba(21,128,61,0.35)',
    'z-index:2147483647',
    'pointer-events:none',
    `transition:opacity ${reduce ? 0 : FADE_MS}ms ease`,
  ].join(';');
  document.body.append(overlay);
  globalThis.setTimeout(() => {
    overlay.style.opacity = '0';
  }, HIGHLIGHT_MS);
  globalThis.setTimeout(() => {
    overlay.remove();
  }, HIGHLIGHT_MS + FADE_MS);
}
