/**
 * Site language-rules database.
 *
 * Generic Accept-Language rewriting only goes so far; the real fight is knowing
 * how each specific site stores its language preference. These rules are kept
 * as data (separate from extension code) so they can be community-maintained
 * and shipped without a new extension version.
 *
 * A rule specifies a `match` (domain or domain suffix) and a `strategy` —
 * one of the variants below, or a `compound` that runs several in order.
 * The extension's content script consumes these via `applyStrategy()` in
 * apps/extension/src/lib/strategy.ts.
 */

import type { LanguageCode } from '@movar/shared';

/** Values map: canonical ISO code → the string this site expects in URLs/storage. */
export type LangValues = Partial<Record<LanguageCode, string>>;

export type LangStrategy =
  /** Set a cookie (first-party, non-HttpOnly). Site must read it on next request. */
  | { type: 'cookie'; name: string; domain?: string; path?: string; values?: LangValues }
  /** Write to localStorage. Almost always requires a reload to take effect. */
  | { type: 'localStorage'; key: string; values?: LangValues }
  /** Rewrite a URL path segment (default: the first segment, e.g. /ua/foo). */
  | { type: 'pathSegment'; index?: number; values?: LangValues }
  /** Rewrite the URL's leftmost host label (e.g. ua.example.com ↔ ru.example.com). */
  | { type: 'subdomain'; values?: LangValues }
  /** Add/replace a URL query parameter (?lang=ua, ?hl=uk, ...). */
  | { type: 'query'; param: string; values?: LangValues }
  /** Universal fallback: click an in-site link/button matched by selector. */
  | { type: 'click'; selector: string }
  /** Follow the page's own <link rel="alternate" hreflang="..."> for the target. */
  | { type: 'hreflang' }
  /** Compose multiple strategies — writes run first, then a single navigation. */
  | { type: 'compound'; steps: LangStrategy[] };

export interface SiteRule {
  /** Domain or domain suffix this rule matches. */
  match: string;
  /** How to switch the language on this site. */
  strategy: LangStrategy;
}

export const rules: SiteRule[] = [
  {
    // Ukrainian e-commerce. RU is the default at the root path; UA lives under
    // /ua/. The site publishes <link rel="alternate" hreflang="..."> on every
    // page, so we follow that for the navigation — no per-URL guesswork. The
    // cookie is set first as a hint to any server-side preference logic.
    match: 'electrica-shop.com.ua',
    strategy: {
      type: 'compound',
      steps: [{ type: 'cookie', name: 'lang', values: { uk: 'ua' } }, { type: 'hreflang' }],
    },
  },
];

/** Encoded value a strategy should write for the given language. */
export function encodedValue(values: LangValues | undefined, target: LanguageCode): string {
  return values?.[target] ?? target;
}

/** Find the most specific rule whose `match` is a suffix of the given host. */
export function getRuleForHost(host: string): SiteRule | undefined {
  return rules
    .filter((r) => host === r.match || host.endsWith(`.${r.match}`))
    .sort((a, b) => b.match.length - a.match.length)[0];
}
