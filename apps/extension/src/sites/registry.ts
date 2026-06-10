/**
 * Eager site registry. Collects every per-site adapter and answers the two
 * questions the content script asks at `document_start`: which redirect rule
 * applies to this host ({@link getRuleForHost}), and which lazy page-content
 * model chunk — if any — this host needs ({@link resolveModelChunk}).
 *
 * This stays eager (and tiny) on purpose: the matchers must run before anything
 * is loaded, and the redirect rule fires even when content-modification is off.
 * Only the per-site extractor chunk it points at is loaded on demand.
 */
import type { ModelChunk, SiteModel, SiteRule } from './types';
import * as electricaShop from './electrica-shop';
import * as google from './google';
import * as bing from './bing';
import * as duckduckgo from './duckduckgo';
import * as youtube from './youtube';

// Order preserved from the original rules database; getRuleForHost sorts by
// match length, so this only fixes the stable order among equal-length matches.
export const rules: readonly SiteRule[] = [
  electricaShop.rule,
  google.rule,
  bing.rule,
  duckduckgo.rule,
  youtube.rule,
];

const models: readonly SiteModel[] = [google.model, youtube.model];

/** Find the most specific rule for `host`. A rule matches when its `matchHost`
 *  predicate accepts the host, or — with no predicate — when `match` equals the
 *  host or is a dot-anchored suffix of it. Ties break on `match` length so a
 *  specific suffix rule still beats a broad predicate. */
export function getRuleForHost(host: string): SiteRule | undefined {
  return rules
    .filter((r) =>
      r.matchHost ? r.matchHost(host) : host === r.match || host.endsWith(`.${r.match}`),
    )
    .toSorted((a, b) => b.match.length - a.match.length)[0];
}

/** The lazy page-content model chunk this host needs, or null when no site
 *  extractor matches. */
export function resolveModelChunk(host: string): ModelChunk | null {
  return models.find((m) => m.matches(host))?.chunk ?? null;
}
