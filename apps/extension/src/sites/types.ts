/**
 * Site language-rule types and the value encoder.
 *
 * Each per-site adapter (`./<site>/index.ts`) describes how to switch that
 * site's language as a {@link SiteRule}; the content-script applier
 * (`lib/strategy.ts`) reads {@link LangStrategy} and {@link encodedValue}. The
 * redirect rules used to live in `@movar/host-match` — only the host predicates
 * (`isGoogleHost`/`isYouTubeHost`, shared with the page-content extractors)
 * remain there now; the rule data is co-located with each site.
 */
import type { LanguageCode } from '@movar/lang-detect';

/** Lazy page-content model chunk, emitted per site that has an extractor. */
export type ModelChunk = 'models/google.js' | 'models/youtube.js';

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
  /** Add/replace several URL query parameters in a single navigation. Used for
   *  search engines where multiple params (interface + result language) must be
   *  set together — e.g. Google's hl + lr. `onlyWhenParam` gates the rewrite to
   *  pages where that param exists (e.g. 'q' for a SERP), so the homepage
   *  doesn't get rewritten. `onlyOnPath` further restricts by URL path prefix,
   *  so a shared host like google.com applies the rewrite to /search but not
   *  /maps, where `lr=lang_*` can degrade or invalidate the search.
   *
   *  Per-param `joinPreferences: true` joins every preferred-language code with
   *  `|`, so a user whose priority is `[uk, en]` ends up with
   *  `lr=lang_uk|lang_en` and can see results in either language. Without it
   *  the param uses the top preference only (the right default for `hl`, where
   *  the interface is a "pick one" knob).
   *
   *  Per-param `prefix` is prepended to each encoded value (Google's `lr` wants
   *  `lang_<code>`), so a uniform transform stays out of the per-language
   *  `values` map — `values` carries only genuine per-language data.
   *
   *  `stripParams` lists query parameters the rewrite removes from the URL
   *  alongside writing the new ones. Used to drop opaque session-bias tokens
   *  (e.g. Google's `sei`, which carries prior-session locale signals
   *  forward) so each query is judged on its own `hl`/`lr` + Accept-Language.
   *  A lingering strip-listed param makes the rewrite non-no-op by itself, so
   *  a URL otherwise at the target still gets cleaned — reserve this list for
   *  tokens *confirmed* to corrupt results, because that trigger costs a
   *  navigation wherever the token appears.
   *
   *  `scrubParams`/`scrubPrefixes` are the second, weaker tier: hygiene
   *  params dropped only when a navigation is already happening for another
   *  reason (language params off-target, or a strip-listed token present).
   *  They never trigger a navigation by themselves, so scrub-listing a param
   *  that rides every SERP-internal URL costs nothing — strip-listing the
   *  same param would force a reload on every pagination and query
   *  refinement. Entry navigations (omnibox, homepage form) never carry the
   *  language params and therefore always rewrite, so scrubs reliably cover
   *  the URLs where pre-rewrite session tokens are born. Audit and method:
   *  docs/google-search-url-params.md. */
  | {
      type: 'searchParams';
      params: { name: string; values?: LangValues; joinPreferences?: boolean; prefix?: string }[];
      onlyWhenParam?: string;
      onlyOnPath?: string;
      stripParams?: readonly string[];
      scrubParams?: readonly string[];
      scrubPrefixes?: readonly string[];
    }
  /** Universal fallback: click an in-site link/button matched by selector. */
  | { type: 'click'; selector: string }
  /** Follow the page's own <link rel="alternate" hreflang="..."> for the
   *  target. `region` (ISO 3166-1 alpha-2) prefers a fully-qualified match
   *  like `en-GB` over a region-bare `en` match. Falls back to
   *  `hreflang="x-default"` when nothing else matched. */
  | { type: 'hreflang'; region?: string }
  /** Compose multiple strategies — writes run first, then a single navigation. */
  | { type: 'compound'; steps: LangStrategy[] };

/** Empty-results fallback for enforce-mode search rules whose strategy adds a
 *  hard result filter (Google's `lr`). A stale server-side session pin can
 *  intersect that filter down to zero organic results even on a fully cleaned
 *  URL (docs/google-search-url-params.md, finding #1) — URL rewriting cannot
 *  reach it. When the settled page carries `dropParam` and shows a rendered
 *  results area with zero organic hits, the runtime retries the same query
 *  exactly once with `dropParam` removed (everything else, notably `hl`,
 *  stays). The retry itself is the test: a legitimately-empty query stays
 *  empty and is never retried again (loop-guard marker), while a pinned one
 *  recovers. */
export interface EmptyResultsRetry {
  /** Query param whose presence marks the page as result-filtered; the retry
   *  drops exactly this param and nothing else. */
  dropParam: string;
  /** Results-area container that must EXIST before a verdict — an absent
   *  container means "not rendered / not a results page", never "empty". */
  containerSelector: string;
  /** Selector whose match count is the organic-result count; 0 = empty. */
  resultsSelector: string;
}

export interface SiteRule {
  /** Exact host or dot-anchored suffix this rule matches. Also the rule's label
   *  and its specificity weight — {@link getRuleForHost} breaks ties by `match`
   *  length, so a longer (more specific) suffix wins. */
  match: string;
  /** Optional host predicate that *replaces* the `match` suffix test when set —
   *  for coverage a single suffix can't express (e.g. every google.* ccTLD).
   *  `match` then serves only as the label and specificity weight. */
  matchHost?: (host: string) => boolean;
  /** How to switch the language on this site. */
  strategy: LangStrategy;
  /** Fire on every page load (not just when the detected page language is
   *  blocked). Required for search engines: their interface can be Ukrainian
   *  while results bleed in from Russian, so the trigger can't rely on the
   *  page-language signal. The strategy MUST be no-op-safe when already at
   *  the target state — `searchParams` is; cookie/localStorage are not. */
  enforce?: boolean;
  /** Retry a zero-organic-result page once without the result-filter param.
   *  See {@link EmptyResultsRetry}; applied by `lib/empty-results-retry.ts`. */
  emptyResultsRetry?: EmptyResultsRetry;
}

/** A site that ships a lazy page-content extractor chunk, plus the host
 *  predicate that gates loading it. Consumed by the capability resolver. */
export interface SiteModel {
  chunk: ModelChunk;
  matches: (host: string) => boolean;
}

/** Encoded value a strategy should write for the given language. */
export function encodedValue(values: LangValues | undefined, target: LanguageCode): string {
  return values?.[target] ?? target;
}
