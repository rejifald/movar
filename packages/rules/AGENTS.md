# Rules — `@movar/rules`

> Per-site language-rules database: maps hostnames to the strategy the extension uses to switch a site's language preference.

## What it does

Exports a typed `rules` array (`SiteRule[]`) and lookup/utility functions so the extension knows _how_ to ask each specific site for the user's preferred language. A strategy can set a cookie, write `localStorage`, rewrite a URL path segment or subdomain, add/replace query parameters, click an in-page element, follow `<link rel="alternate" hreflang>`, or chain any of the above as a `compound`. Search-engine rules (Google, Bing, DuckDuckGo, YouTube) set `enforce: true` so they fire on every page load, not only when Russian content is detected.

The Google rule covers every google.\* ccTLD via a `matchHost` predicate (`isGoogleHost`) rather than enumerating ccTLDs — `match: 'google'` is just a label and tie-break weight. The rule sets `hl` (interface, single value) and `lr` (result-language filter, pipe-joined across all preferred languages, mapped through `GOOGLE_LR`), gates on `/search`, strips the `sei` session-bias token, and never touches `/maps`.

## Boundaries & invariants

- **Data only, no DOM/browser APIs.** All exports are pure TypeScript values and functions; nothing here reads `document`, `window`, or `chrome.*`.
- **No translate logic.** Rules describe how to request the correct language; blocking/hiding Russian content is handled elsewhere.
- **`match` is always dot-anchored.** `getRuleForHost` accepts `host === match` or `host.endsWith('.'+match)`; an infix match (e.g. `fake-electrica-shop.com.ua`) never fires.
- **`enforce` strategies must be no-op-safe.** `searchParams` satisfies this; `cookie`/`localStorage` must not be marked `enforce` because they cannot detect their own current state.
- **`@movar/rules` is private** (`"private": true`, not published to npm), but it _is_ one of the packages run through `publint` by the root `pnpm publint` script (`@movar/brand`, `@movar/events`, `@movar/settings`, `@movar/rules`, `@movar/lang-detect`) to keep its `exports`/`types` hygiene clean.

## Public API / entry points

Single entry point: `packages/rules/src/index.ts` (re-exported as `"."` in `exports`).

| Symbol           | Kind               | Description                                                                                                                                                 |
| ---------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LangStrategy`   | `type`             | Discriminated union of all strategy shapes (`cookie`, `localStorage`, `pathSegment`, `subdomain`, `query`, `searchParams`, `click`, `hreflang`, `compound`) |
| `LangValues`     | `type`             | `Partial<Record<LanguageCode, string>>` — ISO code → site-specific token                                                                                    |
| `SiteRule`       | `interface`        | `{ match, matchHost?, strategy, enforce? }`                                                                                                                 |
| `rules`          | `const SiteRule[]` | The full database (electrica-shop, Google, Bing, DuckDuckGo, YouTube)                                                                                       |
| `getRuleForHost` | `function`         | `(host: string) => SiteRule \| undefined` — most-specific match, tie-broken by `match.length`                                                               |
| `isGoogleHost`   | `function`         | `(host: string) => boolean` — shared predicate used by the Google rule and `@movar/page-content`                                                            |
| `encodedValue`   | `function`         | `(values: LangValues \| undefined, target: LanguageCode) => string` — resolves a mapped token or falls back to the canonical code                           |

## Layout

```
packages/rules/
  src/
    index.ts          # entire module (types, constants, rules array, functions)
    index.test.ts     # Vitest unit tests (node env, no browser globals)
  package.json
  tsconfig.json       # extends ../../tsconfig.base.json, noEmit: true
  vitest.config.ts    # environment: node, coverage via v8
  eslint.config.mjs
  project.json        # nx targets: typecheck, lint, test
```

## Dependencies

| Package                          | Kind            | Why                                                                                 |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `@movar/lang-detect`             | `dependency`    | Provides `LanguageCode` (typed as `string`) used in `LangValues` and `encodedValue` |
| `@movar/eslint-config`           | `devDependency` | Workspace lint ruleset (`base`, `quality`, `tests`, `ukrainian` presets)            |
| `vitest` / `@vitest/coverage-v8` | `devDependency` | Test runner + v8 coverage; node environment, no browser shims needed                |

No runtime browser-specific dependencies — intentional, keeps the module testable in Node.

## Working on it

**Add a new site rule** — append a `SiteRule` literal to the `rules` array in `src/index.ts`. Pick the right strategy variant; use `compound` when you need to write state (cookie/localStorage) before navigating. If the site has `<link rel="alternate" hreflang>`, prefer `hreflang` (or `compound` + `hreflang`) over hard-coding URL shapes. Adding a rule ships as a data change — no extension-code change required, so it can land between extension releases.

**Run checks from the package directory:**

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run
```

Or via nx from the repo root: `nx run rules:test`.

**Cover your rule with tests** in `src/index.test.ts` — at minimum: exact-host match, subdomain match, no-match for an infix fake, and the expected strategy type/params.

## Gotchas

- **`matchHost` replaces the suffix test** when set. The `match` field on those rules is a label only — changing it does not change which hosts the rule fires on.
- **`encodedValue` falls back to the canonical code** when a `values` map has no entry for the target language. Omitting `values` entirely (e.g. Bing's `setlang`) means the ISO code is passed through as-is — correct for sites that accept BCP 47 codes natively.
- **`lr` on Google uses `joinPreferences: true`** — the user's full preference list is pipe-joined (`lang_uk|lang_en`). `hl` does _not_ join (interface is a single-value knob); conflating the two is a known mistake.
- **The Google rule path-gates on `/search`**, not `/maps` or `/images`. `lr=lang_*` can degrade or break Maps. Do not remove `onlyOnPath`.
- **No SERP selectors live here.** `GOOGLE_SERP_SELECTORS` is not exported from this package; the DOM-level selector logic lives in `packages/page-content/src/google.ts`, which imports only `isGoogleHost` from here.
