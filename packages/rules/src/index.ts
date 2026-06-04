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
   *  `stripParams` lists query parameters the rewrite removes from the URL
   *  alongside writing the new ones. Used to drop opaque session-bias tokens
   *  (e.g. Google's `sei`, which carries prior-session locale signals
   *  forward) so each query is judged on its own `hl`/`lr` + Accept-Language. */
  | {
      type: 'searchParams';
      params: { name: string; values?: LangValues; joinPreferences?: boolean }[];
      onlyWhenParam?: string;
      onlyOnPath?: string;
      stripParams?: readonly string[];
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
}

/** DuckDuckGo region code per target language. DDG's `kl` param combines
 *  region + language (e.g. ua-uk = Ukraine, Ukrainian). For users whose top
 *  priority is `en`, default to UK English so we never bias toward US results
 *  for a user whose region we don't know. */
const DDG_REGION: LangValues = {
  uk: 'ua-uk',
  en: 'uk-en',
  de: 'de-de',
  fr: 'fr-fr',
  es: 'es-es',
  it: 'it-it',
  pl: 'pl-pl',
};

/** ISO 3166-1 country code per language for YouTube's `gl` param. A best-guess
 *  pairing — YouTube uses it as a recommendation/region hint, not a strict
 *  filter, so a reasonable default is enough. */
const YT_GL: LangValues = {
  uk: 'UA',
  en: 'US',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
};

/** Google's `lr` mapping (lang_<code>). Shared across every google.* domain
 *  rule so the ccTLD list below doesn't drift. */
const GOOGLE_LR: LangValues = {
  uk: 'lang_uk',
  en: 'lang_en',
  de: 'lang_de',
  fr: 'lang_fr',
  es: 'lang_es',
  it: 'lang_it',
  pl: 'lang_pl',
};

/** True when `host` is Google under any (cc)TLD — google.com, google.com.ua,
 *  google.co.uk — including subdomains (www., news.). Matches a registrable
 *  `google` label followed by a 1–2 label public suffix; rejects notgoogle.com
 *  (no `google` label) and google.com.evil.com (too many trailing labels).
 *
 *  Shared by the redirect rule below and the extension's SERP content filter so
 *  both layers agree on what a Google host is. A single `match` suffix can't
 *  express it (google.com.ua doesn't end with .google.com) — that's the reason
 *  {@link SiteRule.matchHost} exists. Tighter anti-spoofing (e.g. rejecting
 *  google.evil.com) would require the Public Suffix List. */
export function isGoogleHost(host: string): boolean {
  const labels = host.split('.');
  const i = labels.indexOf('google');
  if (i === -1) return false;
  const trailing = labels.length - 1 - i;
  return trailing >= 1 && trailing <= 2;
}

function googleRule(): SiteRule {
  return {
    // Google SERP: a Cyrillic query like `яблуко` (or even `картина`, which
    // is identical in UA & RU) routinely surfaces Russian-language results
    // because Google has no language hint and falls back to the larger
    // Russian corpus. Accept-Language alone doesn't constrain results —
    // `lr=lang_<code>` does. `hl` aligns the interface so the picker,
    // sidebar, related searches etc. also match. Path-gated to /search
    // because /maps and /images interpret `lr` differently (Maps can
    // outright break). Enforce-mode because the interface can be Ukrainian
    // while results are Russian — page-language alone wouldn't trigger.
    //
    // Known trade-off: `lr=lang_<code>` can over-filter for queries where
    // Google's per-page language classifier hasn't tagged the bilingual
    // Ukrainian sites' UA pages — e.g. "Реле напруги", "рецепт борщу" can
    // return zero organic results. The cost of strict filtering is
    // accepted here because the most common Cyrillic queries on
    // google.com.ua benefit from the filter, and the alternative
    // (interface-only via `hl`) provides no measurable result-language
    // lift. A smarter implementation that detects the empty-SERP state
    // and retries without `lr` is tracked separately.
    // One rule covers every google.* ccTLD via the shared predicate — the SERP
    // rewrite is identical across ccTLDs — so `match` is only a label here.
    match: 'google',
    matchHost: isGoogleHost,
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyOnPath: '/search',
      onlyWhenParam: 'q',
      // `lr` pipe-joins every preferred language (`lang_uk|lang_en`) so a
      // user with `[uk, en]` priority sees results in either language —
      // English speakers with Ukrainian #1 otherwise lose every English
      // result. `hl` stays single-valued (interface = one language).
      params: [{ name: 'hl' }, { name: 'lr', values: GOOGLE_LR, joinPreferences: true }],
      // `sei` is Google's opaque session-event token. It carries prior-session
      // locale bias forward and can pull subsequent results back toward the
      // earlier language even with `hl=uk&lr=lang_uk` set. Drop it on every
      // rewrite so each query is judged on its own signals.
      stripParams: ['sei'],
    },
  };
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
  googleRule(),
  {
    // Bing exposes `setlang` for the interface; `mkt` would also bound results
    // but combines language with a country code we don't have. setlang is the
    // honest, safe knob — interface aligned, results biased without forcing.
    // Path-gated to /search so non-SERP surfaces (maps, images) are left alone.
    match: 'bing.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyOnPath: '/search',
      onlyWhenParam: 'q',
      params: [{ name: 'setlang' }],
    },
  },
  {
    // DuckDuckGo's `kl` is the language+region selector. The DDG_REGION map
    // picks a sensible region per target language; unknown targets fall through
    // to the bare code, which DDG ignores rather than mishandling. No path
    // gate — DDG serves SERP at the root (`/?q=…`).
    match: 'duckduckgo.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyWhenParam: 'q',
      params: [{ name: 'kl', values: DDG_REGION }],
    },
  },
  {
    // YouTube has no equivalent of Google's `lr=lang_<code>` — there's no URL
    // knob that strictly filters out Russian-language videos. `hl` + `gl` are
    // the honest knobs: interface language + region hint. They nudge the
    // recommendation algorithm and the search ranking but don't strictly
    // bound results, so Russian videos can still leak through (the DOM-level
    // result-filter in lib/result-filter.ts is the actual filter).
    // Path-gated to /results so /watch, /shorts, etc. aren't rewritten —
    // YouTube's polymer router strips unknown params on those surfaces and
    // would otherwise drive a redirect loop.
    match: 'youtube.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyOnPath: '/results',
      onlyWhenParam: 'search_query',
      params: [{ name: 'hl' }, { name: 'gl', values: YT_GL }],
    },
  },
];

/** Encoded value a strategy should write for the given language. */
export function encodedValue(values: LangValues | undefined, target: LanguageCode): string {
  return values?.[target] ?? target;
}

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
