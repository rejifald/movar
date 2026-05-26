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
   *  doesn't get rewritten. */
  | {
      type: 'searchParams';
      params: Array<{ name: string; values?: LangValues }>;
      onlyWhenParam?: string;
    }
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
  {
    // Google SERP: a Cyrillic query like `яблуко` (or even `картина`, which is
    // identical in UA & RU) routinely surfaces Russian-language results because
    // Google has no language hint and falls back to the larger Russian corpus.
    // Accept-Language alone doesn't constrain results — `lr=lang_<code>` does.
    // `hl` aligns the interface so the picker, sidebar, related searches etc.
    // also match. Gated on `q` so the homepage isn't rewritten. Enforce-mode
    // because the interface can be Ukrainian while results are Russian — the
    // page-language signal alone wouldn't trigger this rule.
    match: 'google.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyWhenParam: 'q',
      params: [
        { name: 'hl' },
        {
          name: 'lr',
          values: {
            uk: 'lang_uk',
            en: 'lang_en',
            de: 'lang_de',
            fr: 'lang_fr',
            es: 'lang_es',
            it: 'lang_it',
            pl: 'lang_pl',
          },
        },
      ],
    },
  },
  {
    // Same issue on the UA ccTLD (google.com.ua) — the suffix-matcher won't fold
    // this into the google.com rule because the host ends in .com.ua, not .com.
    match: 'google.com.ua',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyWhenParam: 'q',
      params: [
        { name: 'hl' },
        {
          name: 'lr',
          values: {
            uk: 'lang_uk',
            en: 'lang_en',
            de: 'lang_de',
            fr: 'lang_fr',
            es: 'lang_es',
            it: 'lang_it',
            pl: 'lang_pl',
          },
        },
      ],
    },
  },
  {
    // Bing exposes `setlang` for the interface; `mkt` would also bound results
    // but combines language with a country code we don't have. setlang is the
    // honest, safe knob — interface aligned, results biased without forcing.
    match: 'bing.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyWhenParam: 'q',
      params: [{ name: 'setlang' }],
    },
  },
  {
    // DuckDuckGo's `kl` is the language+region selector. The DDG_REGION map
    // picks a sensible region per target language; unknown targets fall through
    // to the bare code, which DDG ignores rather than mishandling.
    match: 'duckduckgo.com',
    enforce: true,
    strategy: {
      type: 'searchParams',
      onlyWhenParam: 'q',
      params: [{ name: 'kl', values: DDG_REGION }],
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
