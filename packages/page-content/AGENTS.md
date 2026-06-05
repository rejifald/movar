# Page Content — `@movar/page-content`

> Pure DOM-reading model: site-specific extractors walk the live DOM and produce structured `ContentNode` lists; no concealment, no i18n, no settings.

## What it does

Provides the extraction half of the content-filtering pipeline. Each site extractor (`google.ts`, `youtube.ts`) queries the DOM for filterable card elements, serializes their visible text, and returns a `PageContentModel`. The model is later consumed by the app's concealment layer (`apps/extension/src/lib/content-conceal.ts`) which decides what to hide.

A central registry (`registry.ts`) maps hostnames to extractors at runtime. Extractors self-register on import, so callers activate them purely via side-effect imports of deep subpaths.

Text serialization (`serialize.ts`) handles hidden-subtree skipping (`aria-hidden`, `hidden` attr, `display:none`, `<script>/<style>/<noscript>`), nested-match deduplication (ancestor wins over descendant), and whitespace collapse.

## Boundaries & invariants

- **No concealment** — never mutates `el.style`, never adds overlays or curtains. That is `apps/extension/src/lib/content-conceal.ts`.
- **No i18n** — never imports the translation catalog or any i18n helpers.
- **No settings reads** — never reads `UserSettings` or the page-mode color singleton.
- **No `@movar/lang-detect`** — language classification of `ContentNode.text` happens upstream; this package only serializes the text.
- Related pure-model siblings: [`../lang-pickers/AGENTS.md`](../lang-pickers/AGENTS.md), [`../page-language/AGENTS.md`](../page-language/AGENTS.md), [`../page-mode/AGENTS.md`](../page-mode/AGENTS.md).

## Public API / entry points

All symbols below are re-exported from `src/index.ts` (the `.` export, i.e. `@movar/page-content`):

| Export                 | Kind  | Description                                                                              |
| ---------------------- | ----- | ---------------------------------------------------------------------------------------- |
| `ContentNode`          | type  | Single filterable DOM card: `el`, `kind`, `hideMode`, `text`                             |
| `PageContentModel`     | type  | Extraction result: `extractor` id + `nodes: ContentNode[]`                               |
| `PageExtractor`        | type  | Strategy interface: `id`, `matches(host)`, `extract(root)`                               |
| `FilteredCard`         | type  | Card that was newly concealed by `applyContentFilter`; `el`, `fromLang`, `kind`          |
| `CardKind`             | type  | `'video' \| 'channel' \| 'playlist' \| 'shorts-shelf' \| 'shelf' \| 'post' \| 'result'`  |
| `HideMode`             | type  | `'blur' \| 'hide'`                                                                       |
| `serializeNodeText`    | fn    | Concatenate text from CSS-selector matches inside a card, skipping hidden subtrees       |
| `serializeElementText` | fn    | Serialize whole-card `textContent` without selector targeting (used by Google extractor) |
| `serializeModelText`   | fn    | Join all `node.text` values with newlines; produces a corpus string                      |
| `registerExtractor`    | fn    | Add a `PageExtractor` to the registry                                                    |
| `lookupExtractor`      | fn    | Return first extractor whose `matches(host)` is true, or `null`                          |
| `buildModelForHost`    | fn    | Convenience: `lookupExtractor` + `extract(root)` in one call                             |
| `GOOGLE_EXTRACTOR`     | const | Google SERP extractor (also self-registers on import)                                    |
| `YOUTUBE_EXTRACTOR`    | const | YouTube extractor (also self-registers on import)                                        |

**Deep subpath side-effect imports** (activate self-registering extractors):

- `@movar/page-content/google` — registers `GOOGLE_EXTRACTOR`; use `#rso h3 → [data-hveid]` for organic results, `div.related-question-pair` for People-also-ask rows
- `@movar/page-content/youtube` — registers `YOUTUBE_EXTRACTOR`; covers desktop (`ytd-*`) and mobile (`ytm-*`) renderers

## Layout

```
packages/page-content/
  src/
    types.ts          — ContentNode, PageContentModel, PageExtractor, FilteredCard, CardKind, HideMode
    serialize.ts      — serializeNodeText, serializeElementText, serializeModelText
    registry.ts       — registerExtractor, lookupExtractor, buildModelForHost
    google.ts         — GOOGLE_EXTRACTOR (self-registers)
    youtube.ts        — YOUTUBE_EXTRACTOR (self-registers)
    index.ts          — barrel re-exporting everything above
    test-setup.ts     — beforeEach: clear body/head/lang attr
    serialize.test.ts — unit tests for all three serialize helpers
    youtube.test.ts   — unit tests for YOUTUBE_EXTRACTOR (host matching + all card shapes)
  package.json        — exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
  vitest.config.ts    — environment: jsdom, setupFiles: test-setup.ts
  project.json        — nx targets: typecheck / lint / test
  tsconfig.json       — extends ../../tsconfig.base.json, noEmit
```

## Dependencies

| Dep                              | Why                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@movar/rules` (workspace)       | `isGoogleHost` predicate used by `GOOGLE_EXTRACTOR.matches` — keeps host-matching logic consistent with the redirect layer |
| `@movar/lang-detect` (workspace) | `LanguageCode` type used in `FilteredCard.fromLang`                                                                        |
| `jsdom` (devDep)                 | jsdom test environment for Vitest so DOM APIs are available in Node                                                        |

## Working on it

```sh
# From the package directory
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint .
pnpm test           # vitest run

# Or via nx (cached)
nx run page-content:typecheck
nx run page-content:lint
nx run page-content:test
```

- **Test environment**: jsdom (set in `vitest.config.ts`).
- **Setup file**: `src/test-setup.ts` — runs `beforeEach` to clear `document.body`, `document.head`, and `<html lang>`.
- **No fixtures directory**: tests build their own DOM via `document.body.innerHTML = ...` inline.
- **Google+conceal integration test** lives in the app at `apps/extension/src/lib/google-conceal.test.ts` because it requires the app's concealment layer.

## Gotchas

- **Self-registration is a side effect**: importing `@movar/page-content` (the barrel) does NOT register extractors — it re-exports `GOOGLE_EXTRACTOR` and `YOUTUBE_EXTRACTOR` but each module also calls `registerExtractor(...)` at module level. The barrel import happens to trigger both registrations as a byproduct of re-exporting, but the canonical consumer pattern is the explicit deep subpath `import '@movar/page-content/google'` so the intent is clear.
- **Google selector discipline**: `google.ts` deliberately avoids obfuscated CSS class names (`div.tF2Cxc`, `div.g`, etc.) which rotate without notice. The only anchors are `#rso h3` (title) → `[data-hveid]` (card container) and `div.related-question-pair` (People-also-ask). Do not add class-based fallbacks.
- **Nested card dedup in Google**: `extractGoogle` uses a `Set<HTMLElement>` and a post-filter to drop elements nested inside another selected element — prevents sitelinks (child `[data-hveid]`) from doubling up with their parent result.
- **`buildModelForHost` defaults `root` to `document`**: when called in jsdom tests always pass an explicit root or set `document.body.innerHTML` first.
- **`FilteredCard` is defined here but produced in the app**: the type lives in this package for co-location with `ContentNode`, but `applyContentFilter` in `apps/extension` is what creates `FilteredCard` instances. Don't expect this package to emit `FilteredCard` values itself.
