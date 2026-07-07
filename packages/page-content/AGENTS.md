# Page Content — `@movar/page-content`

> Pure DOM-reading model: site-specific extractors walk the live DOM and produce structured `ContentNode` lists; no concealment, no i18n, no settings.

## What it does

Provides the extraction half of the content-filtering pipeline. Each site extractor (`google.ts`, `youtube.ts`) queries the DOM for filterable card elements, serializes their visible text, and returns a `PageContentModel`. The model is later consumed by the app's concealment layer (`apps/extension/src/lib/content-conceal.ts`) which decides what to hide.

A central registry (`registry.ts`) maps hostnames to extractors at runtime. Extractors self-register on import, so callers activate them purely via side-effect imports of deep subpaths.

Text serialization (`serialize.ts`) handles hidden-subtree skipping (`aria-hidden`, `hidden` attr, `display:none`, `<script>/<style>/<noscript>`), nested-match deduplication (ancestor wins over descendant), and whitespace collapse. `serializeElementText` takes an optional `excludeSelector` that prunes whole subtrees. `serializeContentText` is the hybrid card serializer: it classifies a result's OWN content from an allow-list of selectors (title + snippet), so injected chrome — even chrome added later — never enters the language sample; it widens to a whole-card-minus-`excludeOnFallback` sample only when the allow-list yields less than `CONTENT_TEXT_MIN_CHARS` (an anchor rotated). Prefer the allow-list over a chrome block-list: an allow-list is a closed set with no ignore-list to grow.

## Boundaries & invariants

- **No concealment** — never mutates `el.style`, never adds overlays or curtains. That is `apps/extension/src/lib/content-conceal.ts`.
- **No i18n** — never imports the translation catalog or any i18n helpers.
- **No settings reads** — never reads `UserSettings` or the page-mode color singleton.
- **No `@movar/lang-detect`** — language classification of `ContentNode.text` happens upstream; this package only serializes the text.
- Related pure-model siblings: [`../lang-pickers/AGENTS.md`](../lang-pickers/AGENTS.md), [`../page-language/AGENTS.md`](../page-language/AGENTS.md), [`../page-mode/AGENTS.md`](../page-mode/AGENTS.md).
- **Pitfall when adding/maintaining an extractor** — serializing a card's whole text sweeps host-injected UI-language chrome (translate links, rating/annotation rows) into the language sample and mislabels short foreign results as the keep language. Serialize a content **allow-list**, not the container. See [`../../docs/pitfalls.md`](../../docs/pitfalls.md) §1.

## Public API / entry points

All symbols below are re-exported from `src/index.ts` (the `.` export, i.e. `@movar/page-content`):

| Export                   | Kind  | Description                                                                                                                              |
| ------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ContentNode`            | type  | Single filterable DOM card: `el`, `kind`, `hideMode`, `text`                                                                             |
| `PageContentModel`       | type  | Extraction result: `extractor` id + `nodes: ContentNode[]`                                                                               |
| `PageExtractor`          | type  | Strategy interface: `id`, `matches(host)`, `extract(root)`                                                                               |
| `FilteredCard`           | type  | Card that was newly concealed by `applyContentFilter`; `el`, `fromLang`, `kind`                                                          |
| `CardKind`               | type  | `'video' \| 'channel' \| 'playlist' \| 'shorts-shelf' \| 'shelf' \| 'post' \| 'result' \| 'ad' \| 'ai-answer'`                           |
| `HideMode`               | type  | `'blur' \| 'hide'`                                                                                                                       |
| `serializeNodeText`      | fn    | Concatenate text from CSS-selector matches inside a card, skipping hidden subtrees                                                       |
| `serializeElementText`   | fn    | Serialize whole-card `textContent` without selector targeting; optional `excludeSelector` prunes subtrees                                |
| `serializeContentText`   | fn    | Hybrid: serialize a content allow-list (title+snippet), falling back to whole-card-minus-chrome when too thin (used by Google extractor) |
| `ContentTextOptions`     | type  | `content` allow-list, `excludeOnFallback` chrome selector, `minChars` floor for `serializeContentText`                                   |
| `CONTENT_TEXT_MIN_CHARS` | const | Default length floor below which `serializeContentText` falls back to whole-card                                                         |
| `serializeModelText`     | fn    | Join all `node.text` values with newlines; produces a corpus string                                                                      |
| `registerExtractor`      | fn    | Add a `PageExtractor` to the registry                                                                                                    |
| `lookupExtractor`        | fn    | Return first extractor whose `matches(host)` is true, or `null`                                                                          |
| `buildModelForHost`      | fn    | Convenience: `lookupExtractor` + `extract(root)` in one call                                                                             |
| `GOOGLE_EXTRACTOR`       | const | Google SERP extractor (also self-registers on import)                                                                                    |
| `YOUTUBE_EXTRACTOR`      | const | YouTube extractor (also self-registers on import)                                                                                        |

**Deep subpath side-effect imports** (activate self-registering extractors):

- `@movar/page-content/google` — registers `GOOGLE_EXTRACTOR`; use `#rso h3 → [data-hveid]` for organic results, `div.related-question-pair` for People-also-ask rows, `[data-text-ad]` for sponsored text ads (kind `'ad'`). Classifies each organic result from a content allow-list (`h3` + `[data-sncf="1"]` snippet) so Google's injected UI-language chrome (the `[data-sncf="2"]` rich-annotation row, the `a[href*="translate.google.com"]` "Translate this page" link) never enters the language sample and new chrome needs no ignore-list; a whole-card-minus-chrome fallback covers a rotated snippet anchor. Sponsored ads follow the same principle but classify on their `[role="heading"]` headline ALONE with **no** whole-card fallback — Google injects a Search-UI-language location extension (address, weekday opening hours, visit count) that would otherwise flip a Russian ad to the interface language. Without this, a short foreign result/ad is mislabelled as the UI language. Product/shopping results carry **no `<h3>`** (their title is a `role="heading"` div), so the `#rso h3` anchor misses them entirely; they are recovered by the standard `lang` attribute Google tags them with (`#rso [lang]`, DECLARED_RESULT_SELECTOR), climbed to the result row and folded into the organic bucket carrying that declaration as `declaredLang` — the same declared-language evidence class as the AI Overview's `data-rl`, so the fused gate decides them on Google's own label rather than their date-contaminated snippet. AI Overview **source/citation cards** (the "N сайтів" list, rendered in both a hover popup and a persistent aside simultaneously — each rendering its own node, never deduped, so whichever is on screen stays covered) are recovered via `[data-crb-snippet-text]` climbed to the enclosing `[data-src-id]` card (kind `'ai-answer'`); classified on the snippet ALONE with **no** whole-card fallback, because the card's visible title has no durable anchor at all and the cover-`<a>`'s `aria-label` bakes that title together with Google's injected "opens in new tab" UI-language chrome with no separator
- `@movar/page-content/youtube` — registers `YOUTUBE_EXTRACTOR`; covers desktop (`ytd-*`) and mobile (`ytm-*`) renderers

## Layout

```
packages/page-content/
  src/
    types.ts          — ContentNode, PageContentModel, PageExtractor, FilteredCard, CardKind, HideMode
    serialize.ts      — serializeNodeText, serializeElementText, serializeContentText, serializeModelText
    registry.ts       — registerExtractor, lookupExtractor, buildModelForHost
    google.ts         — GOOGLE_EXTRACTOR (self-registers)
    youtube.ts        — YOUTUBE_EXTRACTOR (self-registers)
    index.ts          — barrel re-exporting everything above
    test-setup.ts     — beforeEach: clear body/head/lang attr
    serialize.test.ts — unit tests for all three serialize helpers
    youtube.test.ts   — unit tests for YOUTUBE_EXTRACTOR (host matching + all card shapes)
  fixtures/           — versioned corpus of trimmed real saved pages, one dir per verdict
                        surface (google-serp/, youtube/, pickers/, redirect-sites/), each a
                        NAME.fixture.html + NAME.expected.json manifest pair. See README.md.
                        The fs-backed harnesses that read it live in the extension app
                        (corpus-content.test.ts, corpus-pickers.test.ts) so this package
                        keeps no node types — its src stays pure.
  package.json        — exports: { ".": "./src/index.ts", "./*": "./src/*.ts" }
  vitest.config.ts    — environment: jsdom, setupFiles: test-setup.ts
  project.json        — nx targets: typecheck / lint / test
  tsconfig.json       — extends ../../tsconfig.base.json, noEmit
```

## Dependencies

| Dep                              | Why                                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `@movar/host-match` (workspace)  | `isGoogleHost` predicate used by `GOOGLE_EXTRACTOR.matches` — keeps host-matching logic consistent with the redirect layer |
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
- **Two fixture tiers**: the unit tests (`google.test.ts`, `youtube.test.ts`, `serialize.test.ts`) build their own DOM via `document.body.innerHTML = ...` inline — fast and synthetic. The **corpus** (`fixtures/`, run by `apps/extension/src/lib/corpus-content.test.ts`) holds trimmed _real_ saved pages and is the correctness gate `docs/pitfalls.md` §1 mandates: it's what catches sample-contamination and selector-rot. The harness lives in the extension app (which has node types for `fs`) so this package stays pure. Add a real capture to the corpus when a new extractor or chrome shape ships; see `fixtures/README.md` for the trim/PII/manifest recipe.
- **Google+conceal integration test** lives in the app at `apps/extension/src/lib/google-conceal.test.ts` because it requires the app's concealment layer.

## Gotchas

- **Self-registration is a side effect**: importing `@movar/page-content` (the barrel) does NOT register extractors — it re-exports `GOOGLE_EXTRACTOR` and `YOUTUBE_EXTRACTOR` but each module also calls `registerExtractor(...)` at module level. The barrel import happens to trigger both registrations as a byproduct of re-exporting, but the canonical consumer pattern is the explicit deep subpath `import '@movar/page-content/google'` so the intent is clear.
- **Google selector discipline**: `google.ts` deliberately avoids obfuscated CSS class names (`div.tF2Cxc`, `div.g`, etc.) which rotate without notice. The only anchors are `#rso h3` (title) → `[data-hveid]` (card container) and `div.related-question-pair` (People-also-ask). Do not add class-based fallbacks.
- **Nested card dedup in Google**: `extractGoogle` uses a `Set<HTMLElement>` and a post-filter to drop elements nested inside another selected element — prevents sitelinks (child `[data-hveid]`) from doubling up with their parent result.
- **`buildModelForHost` defaults `root` to `document`**: when called in jsdom tests always pass an explicit root or set `document.body.innerHTML` first.
- **`FilteredCard` is defined here but produced in the app**: the type lives in this package for co-location with `ContentNode`, but `applyContentFilter` in `apps/extension` is what creates `FilteredCard` instances. Don't expect this package to emit `FilteredCard` values itself.
