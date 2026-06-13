# Contributing to Movar

Welcome! Movar is a cross-browser MV3 extension that keeps the internet in your
language — it asks sites to serve your preferred language (Ukrainian-first,
English fallback) and hides Russian content. This guide is the human entry point
for contributors. The deep, per-package detail lives in the
[`AGENTS.md`](AGENTS.md) tree; this file links **into** it rather than restating
it, so the docs don't drift.

The single highest-value external contribution is **a new site rule** (teaching
Movar to fix one more site that defaults to Russian). That has its own worked
guide: [`apps/extension/src/sites/CONTRIBUTING-A-SITE.md`](apps/extension/src/sites/CONTRIBUTING-A-SITE.md).

## Setup

Requires Node ≥22 and pnpm (see [`AGENTS.md`](AGENTS.md) "Toolchain & commands").

```bash
git clone https://github.com/rejifald/movar.git
cd movar
pnpm install
pnpm --filter @movar/extension build   # or `pnpm dev` for the dev server
```

Then load the unpacked build into a Chromium browser:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select **`apps/extension/.output/chrome-mv3`**.

(The Chromium output directory is `chromiumOutputDir` in
[`apps/extension/wxt.config.ts`](apps/extension/wxt.config.ts). Firefox/Safari
loading steps are in [`apps/extension/AGENTS.md`](apps/extension/AGENTS.md).)

For fast popup/options iteration without loading into a browser, see the static
preview in [`apps/extension/AGENTS.md`](apps/extension/AGENTS.md) ("Static
preview"). For anything touching real `chrome.storage`, the background worker, or
content scripts, use `pnpm --filter @movar/extension dev:firefox:installed`.

## The mental model (two sequential layers)

Movar runs two layers in order on each page: a **redirect layer** (ask the site
to serve another language via URL params, picker click, hreflang, or
cookie/localStorage) and, only if the page didn't navigate, a
**content-filter layer** (atomically conceal individual Russian content cards
behind a curtain). A key invariant: **the content layer's verdict never feeds
back into the redirect layer** (that would cause redirect/bounce hiccups), and
Movar **blocks, never translates**.

That's the one-paragraph version. The authoritative description — including the
exact layer boundaries and the "verdict never feeds back" invariant — is in
[`AGENTS.md`](AGENTS.md) under **"The mental model: two sequential layers."** New
to the jargon (SERP, curtain, rung)? Start at [`docs/glossary.md`](docs/glossary.md).

## Where a site rule lives

Site rules are co-located per site under
[`apps/extension/src/sites/`](apps/extension/src/sites/). Adding one touches four
things:

- **Adapter** — `apps/extension/src/sites/<site>/index.ts` exports a `SiteRule`
  (the strategy + value maps).
- **Registry entry** — append the rule to the `rules` array in
  [`apps/extension/src/sites/registry.ts`](apps/extension/src/sites/registry.ts).
- **Host predicate** — match by the `match` suffix, or a `matchHost` predicate
  from [`@movar/host-match`](packages/host-match/AGENTS.md) for multi-ccTLD
  coverage.
- **Fixture + test** — a representative sample host in the registry invariants
  (`apps/extension/src/sites/registry.invariants.test.ts`) plus a focused
  behavioural test.

The full walkthrough, the `SiteRule`/`LangStrategy` shape, the `electrica-shop`
worked example, and the safety caveats are in
[`apps/extension/src/sites/CONTRIBUTING-A-SITE.md`](apps/extension/src/sites/CONTRIBUTING-A-SITE.md).
**Note:** redirect rules run in the content script on `<all_urls>` and drive
real navigations, so they get strong test gates and maintainer review.

## Running diagnostics

[`apps/diagnostics`](apps/diagnostics/AGENTS.md) is the private, never-published
maintainer dev extension (the "shadow oracle"): it re-runs the product's own
models on a live page and shows classifier-vs-franc divergences in an in-page
panel. It's the fastest way to see what Movar sees on a page you're adding a rule
for.

```bash
pnpm --filter @movar/diagnostics dev   # load .output/chrome-mv3 as above
```

Its content-card panel has a **"copy as test fixture"** button that formats a
real-page snippet for `packages/lang-detect/test/fixtures.ts` — handy when a
card is mis-detected and you want a regression case.

## Validation & gate commands

Run these before opening a PR (the pre-commit hook and CI run them too):

```bash
pnpm validate       # typecheck + lint + test + publint + check:readme + check:suppressions
pnpm test           # the test suites (excludes e2e)
pnpm check:readme    # README tagline + monorepo-layout + product-promise parity guard
pnpm metrics         # refresh the code-health / coverage / bundle-size snapshots
```

Scoped runs while iterating: `pnpm --filter @movar/extension test` (one package),
`nx run extension:typecheck`. The complete command reference is in
[`AGENTS.md`](AGENTS.md) ("Toolchain & commands").

## Conventions

A few repo-wide rules worth knowing up front (full list in [`AGENTS.md`](AGENTS.md)
"Conventions & invariants"):

- **The extension stays network-silent** — it sends nothing off-device; issue
  reporting is a `mailto`, never a backend.
- **User-facing strings need both `en` and `uk`** (`apps/extension/src/lib/i18n/`).
- **On-page content filtering is off by default**; Russian is a permanently
  locked-blocked language.
- **Icons are lucide** everywhere; never hand-inline SVG paths.
- **Don't commit observability into the published extension** — it lives in the
  separate `apps/diagnostics` dev extension.
- **Don't run `changeset version`** — the release ritual is a hand-bump + tag
  (see [`AGENTS.md`](AGENTS.md)).

Thanks for contributing!
