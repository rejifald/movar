/**
 * Extractor registry — a flat list of PageExtractor instances keyed by their
 * host-matching predicate.
 *
 * registerExtractor — add an extractor (called at module load by each
 *                     site-specific module, e.g. youtube.ts).
 * lookupExtractor   — find the first extractor whose `matches()` returns true
 *                     for the given hostname; returns null when none matches.
 * buildModelForHost — convenience: lookup + extract in one call.
 */
import type { PageContentModel, PageExtractor } from './types';

const registry: PageExtractor[] = [];

/**
 * Register a PageExtractor. Typically called at the module level of a
 * site-specific module so the extractor is available as a side effect of
 * importing that module.
 */
export function registerExtractor(extractor: PageExtractor): void {
  registry.push(extractor);
}

/**
 * Find the first registered extractor whose `matches(host)` is true.
 * Returns null when no extractor covers the given host.
 */
export function lookupExtractor(host: string): PageExtractor | null {
  for (const ext of registry) {
    if (ext.matches(host)) return ext;
  }
  return null;
}

/**
 * Convenience wrapper: look up the extractor for `host` and, if found, run
 * its `extract(root)` to build the PageContentModel.
 *
 * Returns null when no extractor is registered for the host.
 */
export function buildModelForHost(
  host: string,
  root: ParentNode = document,
): PageContentModel | null {
  const extractor = lookupExtractor(host);
  if (!extractor) return null;
  return extractor.extract(root);
}
