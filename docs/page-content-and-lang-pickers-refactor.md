---
type: refactor-plan
id: page-content-and-lang-pickers
status: completed
date: 2026-06-02
summary: Split today's monolithic picker.ts and content-filter.ts into two independent modules — page-content/ (per-site extractor + atomic conceal/reveal) and lang-pickers/ (picker discovery + per-entry filtering + active-language detection) — driven by site-specific extractors for YouTube and Google. Five-PR sequence; each PR behavior-equivalent end-to-end.
---

# `page-content/` + `lang-pickers/` refactor

## Goal

Split today's monolithic [picker.ts](../apps/extension/src/lib/picker.ts) and [content-filter.ts](../apps/extension/src/lib/content-filter.ts) into two independent modules:

- `apps/extension/src/lib/page-content/` — per-site content extractor + atomic per-node conceal/reveal. Drives the **content filter layer**.
- `apps/extension/src/lib/lang-pickers/` — picker discovery + per-entry filtering + active-language detection. Drives the **redirect layer**.

A small `apps/extension/src/lib/page-language.ts` consumes both registries to answer "what is the site claiming to serve?" — the input to redirect decisions.

## Background: two-layer language selection

Movar's language handling is two layers that run **sequentially**:

1. **Redirect layer** — asks the website to serve a different language (URL params, picker click, hreflang). Input: the picker's active marker (the site's own claim about what it's serving), falling back to `<html lang>` / URL signals.
2. **Content filter layer** — atomically conceals individual cards whose detected language is blocked. Per-node detection on the structured page-content model.

Layer 1 runs first. If it navigates away, layer 2 is skipped (page is unloading; DOM mutation would be wasted). If it doesn't navigate — because the picker says we're already in priority language, or layer 1 was loop-guarded, or no redirect path applies — layer 2 runs as the fallback that handles residual blocked content.

The content model **never** produces an aggregate verdict that feeds the redirect layer. If the picker says we're already in the user's priority language but the YouTube grid is RU, aggregating that into a "page is RU" verdict would trigger a redirect attempt the site would bounce — "hiccup mode."

## Invariant across all phases

Every PR keeps these tests green without modification:

- `apps/extension/src/lib/picker.*.test.ts`
- `apps/extension/src/lib/content-filter.test.ts`
- `apps/extension/src/lib/google-rule.integration.test.ts`
- `apps/extension/src/lib/bosch-regression.test.ts`
- `apps/extension/src/lib/spizhenko-regression.test.ts`
- `apps/extension/src/lib/strategy.test.ts`

They define the behavior contract; the refactor preserves it.

---

## PR 1 — `page-content/` foundation + YouTube extractor

### New files

```
apps/extension/src/lib/page-content/
  types.ts         # ContentNode, PageContentModel, PageExtractor
  serialize.ts     # serializeNodeText, serializeModelText
  conceal.ts       # concealNode, revealNode, revealAllNodes, isConcealed, isRevealed
  registry.ts      # registerExtractor, lookupExtractor(host)
  youtube.ts       # YOUTUBE_EXTRACTOR — lifts YOUTUBE_FILTER.shapes
```

### Types

```ts
// page-content/types.ts
interface ContentNode {
  el: HTMLElement;
  kind: string; // 'video' | 'channel' | 'playlist' | 'shorts-shelf' | ...
  hideMode: 'blur' | 'hide';
  text: string; // pre-serialized visible content text
}
interface PageContentModel {
  extractor: string;
  nodes: ContentNode[];
}
interface PageExtractor {
  id: string;
  matches(host: string): boolean;
  extract(root: ParentNode): PageContentModel;
}
```

### Logic moves

- `readShapeText` from [content-filter.ts:250](../apps/extension/src/lib/content-filter.ts:250) → `serializeNodeText(el, textSelectors)` in `serialize.ts`. Add hidden-subtree skip (`aria-hidden`, `display:none`, `visibility:hidden`, `<script>`/`<style>`), whitespace collapse, keep the nested-match dedupe.
- `attachBlurCurtain` + `hideCard` from [content-filter.ts:269](../apps/extension/src/lib/content-filter.ts:269) → `concealNode(node, language)` in `conceal.ts`. Dispatches on `node.hideMode`.
- `revealAllBlurred` + `clearAllContentMarks` → `revealAllNodes(root)` in `conceal.ts`.
- `YOUTUBE_FILTER.shapes` from [content-filter.ts:165](../apps/extension/src/lib/content-filter.ts:165) → `YOUTUBE_EXTRACTOR` in `youtube.ts`. Each shape becomes an extraction rule producing nodes.

### Wiring change

`applyContentFilter` in content-filter.ts collapses to:

```ts
export function applyContentFilter(blocked, root = document) {
  if (!blocked.includes('ru')) return [];
  const host = location.hostname;
  const extractor = lookupExtractor(host);
  if (!extractor) return [];
  const model = extractor.extract(root);
  const hits = [];
  for (const node of model.nodes) {
    if (isConcealed(node) || isRevealed(node)) continue;
    const lang = detectCyrillicLanguage(node.text).language;
    if (lang === 'unknown' || !blocked.includes(lang)) continue;
    if (concealNode(node, lang)) hits.push({ ...node, fromLang: lang });
  }
  return hits;
}
```

The old `SiteContentFilter` / `CardShape` / `scanShape` / `getFilterForHost` machinery deletes. `filterContentByLanguage` (Google's path) stays untouched — folded in PR 2.

### New tests

- `page-content/serialize.test.ts` — hidden-subtree skip; whitespace collapse; nested-match dedupe.
- `page-content/conceal.test.ts` — blur vs hide dispatch; idempotency; REVEALED skip; reveal-all sweep.
- `page-content/youtube.test.ts` — extractor produces expected nodes per shape; mobile (`ytm-*`) variants covered.

### Open decision (resolved)

`concealNode` reaches into `getContentMessages()` directly. Site-agnostic content-filter copy; no good reason to plumb labels through callers.

---

## PR 2 — Google content extractor

### New files

```
page-content/
  google.ts        # GOOGLE_EXTRACTOR — { kind: 'result', hideMode: 'hide' } nodes from GOOGLE_SERP_SELECTORS
```

### Wiring change

`filterContentByLanguage` from content-filter.ts deletes. Its call site routes through `applyContentFilter` → the same per-node conceal path as YouTube. Google nodes have `hideMode: 'hide'` so behavior matches today (no curtain on SERP cards).

### Tests

- `page-content/google.test.ts` — extractor against a Google SERP fixture.
- `google-rule.integration.test.ts` (existing) guards the integration behavior.

---

## PR 3 — `lang-pickers/` migration

Pure file moves. picker.ts becomes a barrel re-exporting from `lang-pickers/*`. Existing imports across the codebase and tests keep working without change.

### Migration map

| Today                                                                                                                                                                                                               | Lands in                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `classifyLanguageElement` + helpers                                                                                                                                                                                 | `lang-pickers/classify.ts` |
| `findLanguagePickers`, `deepQuerySelectorAll`, `dedupNested`, `dedupByLanguage`, `pruneOuterContainers`                                                                                                             | `lang-pickers/extract.ts`  |
| `activeLanguageFromPicker`, `bareTextLanguagesInContainer`, `languagesInText`                                                                                                                                       | `lang-pickers/active.ts`   |
| `filterPickers`, `filterPickerLinks`, `hideUselessDividers`, `trimOrphanSeparators`, `trimContainerTextSeparators`, `attachPickerContainerCurtain`, `annotateSurvivingLinks`, `restorePickerInPlace`, `hideElement` | `lang-pickers/filter.ts`   |
| `pickRedirectTarget`                                                                                                                                                                                                | `lang-pickers/redirect.ts` |
| Type definitions (`Picker`, `ClassifiedLink`, `FilterResult`, `FilterOptions`, `RedirectTarget`)                                                                                                                    | `lang-pickers/types.ts`    |

Type names unchanged in this PR — `Picker`/`ClassifiedLink`/`container`/`links` stay. Renames deferred to PR 4 to keep this PR a pure move.

### Tests

No new tests; existing `picker.*.test.ts` suite is the regression guard.

### Risk

Circular imports — `lang-pickers/active.ts` uses `classifyLanguageElement`; `filter.ts` uses both. Verify with `pnpm tsc --noEmit` after each move.

---

## PR 4 — `page-language.ts` + `detectPickerActiveLanguage`

### New files

```
apps/extension/src/lib/
  page-language.ts                    # detectPageLanguage + markup/URL tier helpers

lang-pickers/
  detect-page-language.ts             # detectPickerActiveLanguage(model)
```

### Logic moves

- `detectPageLanguage` from [picker.ts:1274](../apps/extension/src/lib/picker.ts:1274) → `page-language.ts`.
- Helpers `languageFromHtmlLang`, `languageFromSubdomain`, `languageFromPathSegments`, `languageFromSelfHreflang`, `languageFromBodyText` → `page-language.ts`.
- `languageFromActivePicker` aggregator from [picker.ts:1189](../apps/extension/src/lib/picker.ts:1189) becomes `detectPickerActiveLanguage(model)` in `lang-pickers/detect-page-language.ts`. Same semantics (multi-picker votes must agree).

### New: `PickerModel`

`lang-pickers/types.ts` adds `PickerModel` as a wrapper around today's `Picker[]` with a pre-computed `activeLanguage`:

```ts
interface PickerModel {
  extractor: string; // 'generic' for now
  pickers: Picker[];
  activeLanguage: LanguageCode | null;
}
```

Build helper: `buildPickerModel(pickers, currentHref): PickerModel`.

### Chain

```ts
export function detectPageLanguage(model: PickerModel, doc = document, loc = location) {
  return (
    detectPickerActiveLanguage(model) ??
    languageFromHtmlLang(doc) ??
    languageFromSubdomain(loc.hostname) ??
    languageFromPathSegments(loc.pathname) ??
    languageFromSelfHreflang(doc, loc.href) ??
    languageFromBodyText(doc)
  );
}
```

No content tier — per the two-layer principle, content never feeds the redirect chain.

### Wiring win

[`applyOnce`](../apps/extension/src/entrypoints/content.ts:445) currently calls `findLanguagePickers` twice — indirectly via `detectPageLanguage` and directly at line 454. With `buildPickerModel` cached for the tick, that collapses to one pass.

### Open decision (resolved)

`PickerModel` is the public passed-around type. Call sites that don't care about `activeLanguage` read `model.pickers`.

---

## PR 5 — Cleanup

- Update [content.ts](../apps/extension/src/entrypoints/content.ts) imports to point at `lang-pickers/` and `page-content/` directly (no shim).
- Delete `picker.ts` shim.
- Reduce content-filter.ts to a thin re-export of `applyContentFilter` from `page-content/conceal.ts`, or delete if no longer imported.
- Update all test files' imports.
- Run dead-code sweep; verify zero unused symbols.

No behavior change. Pure code hygiene.

---

## Out of scope

- **Tier-3 text-based detection** ([on-device-language-detection.md](on-device-language-detection.md)) — that's a different tier inside `page-language.ts` for sites without a content extractor. Independent ADR.
- **prom.ua / rozetka extractors** — straightforward additions in `page-content/` once the foundation lands. Follow-up PRs after PR 1.
- **YouTube/Google picker overrides** — only add when the generic heuristic in `lang-pickers/extract.ts` misses something specific. Not load-bearing for v1.
- **Picker-entry filtering folded into `page-content/`** — pickers have a structurally different concealment story (per-entry hide + divider trim + orphan-separator trim + optional container chip + active-marker concept). Keep separate.
