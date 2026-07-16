# Contributing a site rule

This is the worked-example guide for adding a **redirect rule** — a per-site
recipe that asks one site to serve your language instead of Russian. It assumes
you have the repo set up; if not, start at the root [`CONTRIBUTING.md`](../../../../CONTRIBUTING.md).

A site rule is the highest-value external contribution to Movar, and adding one
is a good first issue: if you have a Ukrainian (or any non-Russian) site that
defaults to Russian and ignores your preference, you can teach Movar to fix it.

> **Read this risk note first.** Redirect rules run inside the content script on
> **`<all_urls>`** ([`../entrypoints/content.ts`](../entrypoints/content.ts)) and
> can trigger real navigations, behind the loop-guard in
> [`../lib/loop-guard.ts`](../lib/loop-guard.ts). A wrong rule can bounce users
> or mis-target locales site-wide. Every new rule needs strong test gates and
> maintainer review before it ships. See [Risks](#risks-read-before-you-pr) below.

## The two pieces of a rule

Everything lives in [`./types.ts`](./types.ts). A rule is a `SiteRule`
(`types.ts`, the `SiteRule` interface) that pairs **what host it matches** with
**how to switch the language** (a `LangStrategy`).

### `SiteRule`: what host it matches

```ts
export interface SiteRule {
  match: string; // exact host or dot-anchored suffix; also the label + specificity weight
  matchHost?: (host: string) => boolean; // optional predicate that REPLACES the match suffix test
  strategy: LangStrategy; // how to switch the language (below)
  enforce?: boolean; // fire on every page load, not just when the page is already Russian
}
```

- **`match`** is normally the registrable host (`electrica-shop.com.ua`). It is
  matched as an exact host **or a dot-anchored suffix**, so `www.electrica-shop.com.ua`
  and any other subdomain resolve, but `fake-electrica-shop.com.ua` does **not**
  (the dot boundary is what stops infix collisions). It also doubles as the
  rule's **label** and **specificity weight** — when two rules match a host,
  [`getRuleForHost`](./registry.ts) breaks the tie by `match` length, so a longer
  (more specific) suffix wins.
- **`matchHost`** is for coverage a single suffix can't express — most often a
  site spread across many ccTLDs. Use a shared predicate from
  [`@movar/host-match`](../../../../packages/host-match/AGENTS.md)
  (`isGoogleHost` / `isYouTubeHost`) so the same "is this host site X" answer is
  used by the redirect layer **and** the page-content extractors. When `matchHost`
  is set, `match` is **only** the label/weight.
- **`enforce`** makes the rule fire on every page load instead of only when the
  page-language signal says the page is already Russian. It's required for search
  engines: the interface can be Ukrainian while results bleed in from Russian, so
  the trigger can't rely on the page-language signal. **An `enforce: true`
  strategy MUST be no-op-safe when already at the target state** — re-running it
  on an already-correct page must change nothing and must not navigate.
  `searchParams` is no-op-safe (it rewrites params idempotently); **`cookie` and
  `localStorage` are not** (re-writing them can drive a reload loop). This is
  spelled out on the `enforce` doc comment in `types.ts`.

### `LangStrategy`: how to switch the language

The `LangStrategy` discriminated union (`types.ts`) is the menu. Reach for:

| Strategy       | When                                                                             |
| -------------- | -------------------------------------------------------------------------------- |
| `cookie`       | Site reads a first-party, non-HttpOnly language cookie on the next request.      |
| `localStorage` | Site reads a `localStorage` key (almost always needs a reload to take effect).   |
| `pathSegment`  | Language lives in a URL path segment (`/ua/foo` vs `/ru/foo`).                   |
| `subdomain`    | Language lives in the leftmost host label (`ua.example.com` ↔ `ru.example.com`). |
| `query`        | A single query param selects language (`?lang=ua`).                              |
| `searchParams` | **Search engines** — several params (interface + result language) set together.  |
| `click`        | Universal fallback: click an in-site link/button matched by a selector.          |
| `hreflang`     | Follow the page's own `<link rel="alternate" hreflang="…">` for the target.      |
| `compound`     | Compose several strategies — writes run first, then a single navigation.         |

Most per-language differences (the value a site expects in its URL or storage)
go in a strategy's `values` map: canonical ISO code → the site's string, e.g.
`{ uk: 'ua' }`. Encode it with `encodedValue` (`types.ts`), which falls back to
the canonical code when there's no mapping.

## Worked example: `electrica-shop`

[`./electrica-shop/index.ts`](./electrica-shop/index.ts) is the simplest full
example — a `compound` strategy:

```ts
export const electricaRule: SiteRule = {
  match: 'electrica-shop.com.ua',
  strategy: {
    type: 'compound',
    steps: [{ type: 'cookie', name: 'lang', values: { uk: 'ua' } }, { type: 'hreflang' }],
  },
};
```

This Ukrainian e-commerce site serves RU at the root and UA under `/ua/`. It
publishes `<link rel="alternate" hreflang="…">` on every page, so the rule:

1. sets a `lang` cookie (`{ uk: 'ua' }`) as a hint to any server-side preference
   logic, then
2. follows the page's own `hreflang` alternate to navigate to the UA URL — no
   per-URL guesswork.

No `enforce`: the page-language signal alone is enough to trigger it (the page is
genuinely serving Russian), and the strategy is not no-op-safe (the cookie write
would re-run), so `enforce` would be wrong here.

### Other patterns to copy

- **Multi-ccTLD via predicate + `searchParams` + `enforce`:**
  [`./google/index.ts`](./google/index.ts) — one rule covers every `google.*`
  ccTLD through `matchHost: isGoogleHost`, sets `hl` (interface) and `lr`
  (result-language filter) together, gates the rewrite to `/search` with
  `onlyOnPath` and to real queries with `onlyWhenParam: 'q'`, and strips
  opaque session-bias tokens (`sei`, `gs_lcrp`). `enforce: true` because
  results can be Russian even when the interface is Ukrainian.
- **Scoping to one param value on `searchParams`:** `onlyWhenParamValueIn`
  restricts the rewrite to requests where a param, if PRESENT, holds one of a
  set of allowed values (absence still passes). Google's rule uses it to stay
  on the plain results page — `{ name: 'udm', values: ['14'] }` — since
  `/search` also serves Images, Videos, AI Mode, and other verticals sharing
  the same path; allowlisting the one vetted shape keeps every other surface,
  including ones Google hasn't shipped yet, out of scope by default. See
  [`docs/google-search-url-params.md`](../../../../docs/google-search-url-params.md)'s
  "AI Mode chat" section for why this was needed.
- **Two strip tiers on `searchParams`:** `stripParams` is for tokens
  _confirmed_ to corrupt results — their mere presence forces a rewrite, so
  a stuck URL gets cleaned even when the language params already match.
  `scrubParams`/`scrubPrefixes` are zero-cost hygiene — dropped only when a
  navigation is already happening, never triggering one — safe for whole
  namespaces (Google's `gs_*`) and for suspected-but-unconfirmed tokens.
  Never strip or scrub user-facing state (`pws`, `tbs`, `udm`, `start`, …);
  see [`docs/google-search-url-params.md`](../../../../docs/google-search-url-params.md)
  for the audit that drew this line and the method for vetting a new suspect.
- **Single interface param:** [`./bing/index.ts`](./bing/index.ts) — one
  `setlang` param, path-gated to `/search`.
- **Region+language combined param:** [`./duckduckgo/index.ts`](./duckduckgo/index.ts)
  — a `kl` param with a per-language `values` map (`DDG_REGION`).

## Wiring steps

1. **Create the adapter.** Add `sites/<site>/index.ts` and export a named
   `SiteRule` (e.g. `export const acmeRule: SiteRule = { … }`). Add a top
   comment explaining what the site does wrong and why the strategy is the
   honest knob — the existing adapters are the template.
2. **Register it.** Import and append your rule to the `rules` array in
   [`./registry.ts`](./registry.ts). Order only matters among equal-length
   `match` values (the resolver sorts by `match` length), so appending is fine.
3. **Add a fixture/sample host and a test.** Add your rule's representative host
   to the `SAMPLE_HOSTS` map in
   [`./registry.invariants.test.ts`](./registry.invariants.test.ts) — this is
   the lightweight "fixture" the registry invariants iterate, and CI **fails**
   if a rule has no entry. The invariants then automatically assert your rule
   resolves for its sample host, rejects a faked-prefix lookalike, and does not
   overlap another suffix rule. Add a focused behavioural test too (assert the
   strategy shape, params, and any `enforce`/path gates) alongside the existing
   per-engine tests.
4. **For an extractable site only** (page-content content-filter layer): also
   export a `model` descriptor and add a lazy `model.ts` chunk — see
   `./google/` and `./youtube/`. Most redirect-only rules do not need this.

## Risks: read before you PR

- **Runs on `<all_urls>`.** The content script is matched on every site
  (`../entrypoints/content.ts`). Your rule's matcher must be tight: prefer an
  exact registrable host as `match`, or a vetted `@movar/host-match` predicate.
  A loose `match` (e.g. a bare TLD-ish suffix) can hijack unrelated hosts.
- **It drives navigations behind a loop-guard.** A redirect that lands on a page
  the rule still considers "wrong" will try to redirect again;
  [`../lib/loop-guard.ts`](../lib/loop-guard.ts) caps the bounce, but a
  mis-targeted rule still degrades the page. Verify the post-redirect URL is a
  fixed point (re-running the rule there is a no-op).
- **`enforce: true` must be no-op-safe.** See the `enforce` section above — only
  use it with idempotent strategies (`searchParams`), never raw
  `cookie`/`localStorage`.
- **No Russian engines, ever.** Movar blocks Russian; it never adds a redirect
  rule that would route users to a Russian search engine. The invariant test
  keeps a guard for the well-known ones.

When in doubt, open an issue describing the site's behavior before writing the
rule — maintainers can point you at the right strategy and the riskier edges.
