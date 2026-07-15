import { isGoogleHost } from '@movar/host-match';
import type { LangStrategy, SiteModel, SiteRule } from '../types';

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
// Empty-SERP bug (fixed, see `stripParams` below): queries like "Реле
// напруги" appeared to return zero organic results once this rule
// appended `hl`/`lr`, and it looked like a classifier gap (Google not
// having tagged enough Ukrainian pages for a strict `lr` filter). Direct
// testing disproved that: `lr=lang_uk` alone returns ~1.4M results, and
// even the joined `lr=lang_uk|lang_en` this rule actually sends returns
// ~1M once Chrome's `gs_lcrp` is stripped. The real cause was `gs_lcrp` —
// an opaque per-omnibox-session context blob generated *before* this
// rewrite runs — surviving onto the rewritten URL and pinning Google's
// serving to a candidate set computed under the pre-rewrite
// (Russian-leaning) context, which then intersects with the `lr` filter
// down to zero.
// Re-testing a day later showed the pinning is session-bound: the very
// token that zeroed the query read clean ~24h on, and a fresh token from a
// healthy session read clean immediately. The strips below are cheap
// insurance against tokens minted under a bad session state, not a claim
// that any given value is permanently poisoned. Full audit and the
// live-test method: docs/google-search-url-params.md.
// One rule covers every google.* ccTLD via the shared predicate — the SERP
// rewrite is identical across ccTLDs — so `match` is only a label here.

/** Known members of the `gs_*` scrub family, enumerated by exact name for the
 *  DNR pre-request layer: `queryTransform.removeParams` (lib/dnr.ts) matches
 *  literal names only — no prefix support — so the network-side rule can shed
 *  just the members listed here. `gs_lcrp` is the confirmed offender (also
 *  strip-listed below); `gs_lp`/`gs_ssp` are its suggest-box/entity siblings;
 *  `gs_l` is the legacy AJAX-suggest token older entry surfaces still mint.
 *  A brand-new family member is still caught by the content-script
 *  `scrubPrefixes: ['gs_']` fallback in the strategy below. Tree-shaken out
 *  of the content bundle (only the background DNR layer imports it). */
export const GS_FAMILY_PARAMS: readonly string[] = ['gs_lcrp', 'gs_lp', 'gs_ssp', 'gs_l'];

/** The /search rewrite strategy, exported with the `searchParams` arm and its
 *  URL gates + token tiers statically REQUIRED: the DNR redirect layer
 *  (lib/dnr.ts) derives its rule condition from `onlyOnPath`/`onlyWhenParam`
 *  and its `removeParams` from the strip/scrub tiers, and a gate-less or
 *  tier-less strategy would silently produce a rule matching every google.*
 *  request / removing nothing. The narrowed type makes that unrepresentable
 *  instead of runtime-checked. (Costs ~30 content-bundle bytes vs inlining in
 *  googleRule — comfortably inside the budget; see wxt.config.ts.) */
export const googleSearchStrategy: Extract<LangStrategy, { type: 'searchParams' }> & {
  onlyOnPath: string;
  onlyWhenParam: string;
  onlyWhenParamValueIn: { name: string; values: readonly string[] };
  stripParams: readonly string[];
  scrubParams: readonly string[];
} = {
  type: 'searchParams',
  onlyOnPath: '/search',
  onlyWhenParam: 'q',
  // Scope to the plain results page for now: `/search` also serves Images
  // (udm=2), Videos (udm=7), AI Mode (udm=50), and other verticals Google has
  // added and keeps adding, none of which this rewrite has been vetted
  // against. Plain results carry either no `udm` at all or `udm=14` (the
  // explicit "Web" filter) — allowlisting that shape means a vertical Google
  // ships tomorrow is out of scope by default, not silently rewritten.
  // AI Mode specifically is also why this exists NOW: its chat turns update
  // the URL via history.replaceState on every turn, re-asserting Google's own
  // `sei` token — which, left in scope, forced a real reload on every turn
  // before this gate exempted the surface entirely (see
  // docs/google-search-url-params.md, "AI Mode chat").
  onlyWhenParamValueIn: { name: 'udm', values: ['14'] },
  // `lr` pipe-joins every preferred language (`lang_uk|lang_en`) so a
  // user with `[uk, en]` priority sees results in either language —
  // English speakers with Ukrainian #1 otherwise lose every English
  // result. `hl` stays single-valued (interface = one language). The
  // `lang_` prefix is uniform, so it rides `prefix` rather than a values map.
  params: [{ name: 'hl' }, { name: 'lr', prefix: 'lang_', joinPreferences: true }],
  // `sei` and `gs_lcrp` are Google/Chrome's opaque session tokens. `sei`
  // carries prior-session locale bias forward; `gs_lcrp` is generated by
  // the omnibox before this rewrite runs and can pin serving to a
  // candidate set computed under the pre-rewrite language context — down
  // to zero organic results once `lr` filters that pinned set (confirmed
  // by direct testing: removing only `gs_lcrp` took one query from 0 to
  // ~1M results with `hl`/`lr` unchanged). Drop both on every rewrite so
  // each query is judged on its own signals.
  stripParams: ['sei', 'gs_lcrp'],
  // Scrub tier — dropped only when a rewrite navigation is already
  // happening, never triggering one. `gs_*` is the omnibox/suggest-box
  // session-state namespace `gs_lcrp` belongs to (`gs_lp`, `gs_ssp`, …):
  // same token class as a confirmed offender, so shed the whole family
  // whenever we navigate anyway. Entry URLs (omnibox, homepage form)
  // never carry `lr`, so entry navigations always rewrite and always get
  // scrubbed; SERP-box refinements also carry `gs_lp` but arrive with
  // `hl`/`lr` intact, and a scrub alone must not cost a second page load
  // there — which is why these are scrubs, not strips. `aqs` is
  // `gs_lcrp`'s predecessor (older Chrome builds still send it); `rlz`
  // is the branded-install cohort token that encodes install-time
  // language. Neither is confirmed harmful — both are zero-cost
  // insurance against the bug class `sei`/`gs_lcrp` were confirmed
  // instances of.
  scrubPrefixes: ['gs_'],
  scrubParams: ['aqs', 'rlz'],
};

export const googleRule: SiteRule = {
  match: 'google',
  matchHost: isGoogleHost,
  enforce: true,
  strategy: googleSearchStrategy,
  // Residual case URL hygiene can't reach: the poisoned entry request is
  // served BEFORE any rewrite can act on a platform without the DNR
  // pre-request layer (lib/dnr.ts), and pins can be seeded by non-entry
  // vectors besides — so for a short hot window the pin rides Google's
  // server-side session state and a fully cleaned URL can still intersect
  // with `lr` down to zero organic results (observed live;
  // docs/google-search-url-params.md, finding #1). Detect-and-retry is
  // the durable fix: a settled SERP with `lr` present and a rendered-but-
  // empty results area is retried exactly once without `lr` (`hl` stays, so
  // the interface language holds). `#search` is the results area Google has
  // rendered for years; organic hits are the `<a><h3>` title links inside it
  // (same shape @movar/page-content's extractor keys on) — a DOM count, so
  // no localized "About 0 results" string parsing.
  emptyResultsRetry: {
    dropParam: 'lr',
    containerSelector: '#search',
    resultsSelector: '#search a h3',
  },
};

export const googleModel: SiteModel = { chunk: 'models/google.js', matches: isGoogleHost };
