/**
 * Per-host PageModeDetector registry. Same shape as
 * `page-content/registry.ts` — site modules register at import time, the
 * orchestrator looks up by hostname.
 *
 * Zero detectors register today: the generic chain in `detect.ts` covers
 * every site we've seen. The registry exists so a future site whose theme
 * switch ignores every signal in the chain can be added without changing
 * the call sites.
 */

import { detectPageMode } from './detect';
import type { PageMode, PageModeDetector } from './types';

const registry: PageModeDetector[] = [];

export function registerModeDetector(detector: PageModeDetector): void {
  registry.push(detector);
}

export function lookupModeDetector(host: string): PageModeDetector | null {
  for (const d of registry) {
    if (d.matches(host)) return d;
  }
  return null;
}

/**
 * Look up a host-specific detector and run it; fall back to the generic
 * chain when no detector matches or the matched detector returns null
 * (defer). Tier 4 of the generic chain always answers, so the return is
 * non-null.
 */
export function detectModeForHost(
  host: string,
  doc: Document = document,
  // eslint-disable-next-line unicorn/prefer-global-this -- defaulting to `window` keeps the param typed as Window.
  win: Window = window,
): PageMode {
  const detector = lookupModeDetector(host);
  if (detector) {
    const hit = detector.detect(doc, win);
    if (hit) return hit;
  }
  return detectPageMode(doc, win);
}

/**
 * Test-only — drop every registered detector. Production never calls this;
 * tests use it to scrub state between cases.
 */
export function clearModeDetectorsForTesting(): void {
  registry.length = 0;
}
