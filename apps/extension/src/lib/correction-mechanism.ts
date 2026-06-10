import type { CorrectionEvent } from '@movar/events';
import type { SiteRule } from '@movar/host-match';

/** Maps a strategy step type to the dashboard's coarse `mechanism` label. Steps
 *  with no entry (e.g. `hreflang`, `picker`) fall back to `'redirect'`. */
const STRATEGY_MECHANISM: Record<string, CorrectionEvent['mechanism']> = {
  cookie: 'cookie',
  localStorage: 'localStorage',
  searchParams: 'search',
};

/**
 * Best-effort `mechanism` label for the corrections dashboard. A compound
 * strategy reports its dominant (first) step; everything without an explicit
 * mapping is reported as a plain `'redirect'`. Pure — no DOM, no side effects —
 * so it's the cohesive unit the content script's `record()` leans on.
 */
export function mechanismForStrategy(rule: SiteRule): CorrectionEvent['mechanism'] {
  const s = rule.strategy;
  const head = s.type === 'compound' ? s.steps[0]?.type : s.type;
  return (head && STRATEGY_MECHANISM[head]) ?? 'redirect';
}
