# Host Match — `@movar/host-match`

> Shared host predicates (`isGoogleHost`, `isYouTubeHost`) used by the redirect layer and the `@movar/page-content` extractors. The per-site redirect-rule database lives in `apps/extension/src/sites/`.

## What it does

Exports pure boolean host predicates at two deliberate scopes (plus a derived domain list, see the API table):

- `isGoogleHost(host)` — returns `true` for every `google.*` ccTLD by finding a `google` label with a 1–2 label public suffix (so `google.com.ua`, which is _not_ a `.google.com` suffix, still matches). Used by the Google site adapter in `apps/extension/src/sites/google/` and by the `@movar/page-content` Google extractor to scope SERP content extraction.
- `isYouTubeHost(host)` — returns `true` for `youtube.com` and its `www.`/country subdomains. Used by the YouTube site adapter and the `@movar/page-content` YouTube extractor.
- `isGoogleSerpHost(host)` / `isYouTubeContentHost(host)` — the narrower _model-provisioning_ scope (issue #372): only hosts whose DOM the page-content models can actually parse (`google.<suffix>`±`www.`; `youtube.com`/`www.`/`m.`). Sibling frontends (`news.google.com`, `music.youtube.com`, …) stay inside the broad predicates — the redirect rules are path/param-gated so broad matching is harmless there — but are excluded from model-chunk provisioning, which would otherwise download an extractor that finds zero nodes.

Neither predicate imports any external package — the module has no runtime dependencies.

## Boundaries & invariants

- **Data only, no DOM/browser APIs.** Both exports are pure TypeScript functions; nothing here reads `document`, `window`, or `chrome.*`.
- **No rules or strategies.** Redirect strategies (`LangStrategy`, `SiteRule`, `getRuleForHost`) are extension-internal and live in `apps/extension/src/sites/types.ts` and `apps/extension/src/sites/registry.ts`.
- **`isGoogleHost` matches by registrable label, not suffix.** A single suffix can't express every `google.*` ccTLD (`google.com.ua` isn't a `.google.com` suffix), so it finds a `google` label with a 1–2 label public suffix — accepting `google.com`, `google.com.ua`, `google.co.uk`, `www.google.de` while rejecting `notgoogle.com` and `google.com.evil.com`. `isYouTubeHost` is the simpler dot-anchored check (`youtube.com` or `.youtube.com`).
- **`@movar/host-match` is private** (`"private": true`, not published to npm), but it _is_ one of the packages run through `publint` by the root `pnpm publint` script (`@movar/brand`, `@movar/events`, `@movar/settings`, `@movar/host-match`, `@movar/lang-detect`) to keep its `exports`/`types` hygiene clean.

## Public API / entry points

Single entry point: `packages/host-match/src/index.ts` (re-exported as `"."` in `exports`).

| Symbol                   | Kind       | Description                                                                                                                                                     |
| ------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `isGoogleHost`           | `function` | `(host: string) => boolean` — matches every `google.*` ccTLD, incl. `google.com.ua`, and any subdomain (redirect-layer scope)                                   |
| `isYouTubeHost`          | `function` | `(host: string) => boolean` — matches `youtube.com` and any subdomain (redirect-layer scope)                                                                    |
| `isGoogleSerpHost`       | `function` | `(host: string) => boolean` — model-provisioning scope (#372): `google.<suffix>` with optional `www.` only; `news.`/`scholar.`/`translate.` subdomains rejected |
| `isYouTubeContentHost`   | `function` | `(host: string) => boolean` — model-provisioning scope (#372): exactly `youtube.com`/`www.`/`m.`; `music.`/`studio.`/`kids.` rejected                           |
| `GOOGLE_REQUEST_DOMAINS` | `const`    | `readonly string[]` — every registrable `google.<suffix>` domain, for the extension's DNR `requestDomains` condition; derived from the same suffix set          |

## Layout

```
packages/host-match/
  src/
    index.ts          # isGoogleHost, isYouTubeHost
    index.test.ts     # Vitest unit tests (node env, no browser globals)
  package.json
  tsconfig.json       # extends ../../tsconfig.base.json, noEmit: true
  vitest.config.ts    # environment: node, coverage via v8
  eslint.config.mjs
  project.json        # nx targets: typecheck, lint, test
```

## Dependencies

| Package                          | Kind            | Why                                                                      |
| -------------------------------- | --------------- | ------------------------------------------------------------------------ |
| `@movar/eslint-config`           | `devDependency` | Workspace lint ruleset (`base`, `quality`, `tests`, `ukrainian` presets) |
| `vitest` / `@vitest/coverage-v8` | `devDependency` | Test runner + v8 coverage; node environment, no browser shims needed     |

No runtime dependencies — intentional, keeps the module testable in Node with zero imports.

## Consumers

- `@movar/page-content` — Google and YouTube extractors call `isGoogleHost` / `isYouTubeHost` from their `matches()` predicate to guard content-model activation.
- `apps/extension/src/sites/google/` and `apps/extension/src/sites/youtube/` — site adapters import these predicates for their `matchHost` field, keeping the ccTLD logic in one place.

## Working on it

**Run checks from the package directory:**

```sh
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run
```

Or via nx from the repo root: `nx run host-match:test`.

**Cover any change with tests** in `src/index.test.ts` — at minimum: exact-host match, subdomain match, and a no-match for an infix fake hostname.

## Gotchas

- **This package does NOT export `LangStrategy`, `SiteRule`, `getRuleForHost`, `encodedValue`, or any value maps.** Those are extension-internal; see `apps/extension/src/sites/types.ts` and `apps/extension/src/sites/registry.ts`.
- **No SERP selectors live here.** `GOOGLE_SERP_SELECTORS` is in `packages/page-content/src/google.ts`, which imports only `isGoogleHost` from here.
