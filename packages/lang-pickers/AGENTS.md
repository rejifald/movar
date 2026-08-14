# Language Pickers — `@movar/lang-pickers`

> Pure DOM model for discovering on-site language pickers, classifying their entries, and choosing a redirect target — no concealment, no overlays, no i18n.

## What it does

Walks the live DOM to find every language-switcher widget on a page: it seeds
a broad CSS query (`SEED_SELECTORS`), classifies each candidate element via
hreflang / URL / data-attrs / class patterns / text / flag emoji, groups linked
elements into `Picker` containers, deduplicates nested candidates, and exposes
the active language and a clickable redirect target. Nothing is mutated; the
package only reads.

## Boundaries & invariants

- **Never imports** `@movar/page-mode`, `@movar/page-content`, `@movar/page-language`,
  or anything from `apps/extension` (overlays, i18n, concealment).
- DOM mutation (hiding picker entries, trimming orphan separators, inserting
  survivor tooltips) lives entirely in `apps/extension/src/lib/picker-filter.ts`
  (`filterPickers`). This package is the model layer that `filterPickers` consumes.
- `buildPickerModel` is in its own file to avoid a circular dependency:
  `extract.ts` → `active.ts` → (would need `extract.ts`); callers pass
  `Picker[]` in.
- `detectPickerActiveLanguage` is a thin named getter over `model.activeLanguage`;
  it exists so `@movar/page-language` can call it by name without touching the
  struct directly (room for future per-site overrides).
- Cross-links: `../page-language/AGENTS.md` (orchestrates the redirect layer),
  `../lang-detect/AGENTS.md` (`normalizeBCP47` / `normalizeLanguageCode` used
  by every classify path).

## Public API / entry points

All exported from `src/index.ts` (wildcard subpath `@movar/lang-pickers/*`
also works directly, e.g. `@movar/lang-pickers/extract`):

- **Types** — `Picker`, `ClassifiedLink`, `FilterResult`, `FilterOptions`,
  `RedirectTarget`, `PickedRedirect`, `PickerModel`; DOM-attribute constants `HIDDEN_ATTR`,
  `ORIGINAL_DISPLAY_ATTR`, `ORIGINAL_DISPLAY_PRIORITY_ATTR`, `ORIGINAL_TEXT_ATTR`,
  `RESTORED_ATTR`, `TEXT_DIVIDER_KIND`, `LEADING_SEPARATOR_RUN`,
  `TRAILING_SEPARATOR_RUN`; heuristic constants `MAX_LANG_TEXT`, `MAX_PICKER_DEPTH`,
  `QUERY_LANG_PARAMS`, `LABEL_SEPARATORS`, `COUNTRY_TO_LANG`, `CLASS_NOISE`,
  `SEED_SELECTORS`, `VALUE_CARRIER_TAGS`, `HREF_CARRIER_TAGS`.
- **classify** — `classifyToken(text)`, `classifyLanguageElement(el)`.
- **active** — `languagesInText(text)`, `bareTextLanguagesInContainer(picker, excludeLangs)`,
  `activeLanguageFromPicker(picker, currentHref?)`.
- **extract** — `deepQuerySelectorAll(root, selector)`, `dedupNested(items)`,
  `classifyContainerChildren(container, preClassified)`, `pruneOuterContainers(containers)`,
  `findLanguagePickers(root?)`.
- **build-model** — `buildPickerModel(pickers, currentHref)`.
- **detect-page-language** — `detectPickerActiveLanguage(model)`.
- **redirect** — `pickRedirectTarget(pickers, priority)`. Returns the first
  priority language with an _activatable_ entry; disclosure controls (dropdown
  toggles) never qualify, and a priority language that is present but inert
  stops the search rather than falling through to a worse one.
- **gate** — `findGateOverlay(picker, viewport?)`, `MIN_GATE_COVERAGE`, type
  `GateViewport`. Answers "is this picker inside an overlay that blocks the page
  until you choose?" — the interstitial-modal pattern. Pure geometry + computed
  style; the decision to act on a `true` lives in
  `apps/extension/src/lib/language-gate.ts`.
- `@movar/lang-pickers/picker.test-utils` — shared test helpers (`setBody`,
  `elFromHtml`, `expectSinglePickerWithLangs`, `setup001ComUaPicker`,
  `setupTwoLanguagePicker`, `setupFlagPickerUA_RU`, `setupDeeplyNestedPicker`,
  `setupSelectPicker`, `expectContainerCurtained`, `getTooltipHosts`). Imported
  by `apps/extension/src/lib/picker.filter.test.ts` and `picker.find.test.ts`.

## Layout

```
packages/lang-pickers/
  src/
    types.ts                  # Interfaces, DOM-attr constants, heuristic tables
    classify.ts               # classifyToken / classifyLanguageElement
    active.ts                 # languagesInText / bareTextLanguagesInContainer / activeLanguageFromPicker
    extract.ts                # deepQuerySelectorAll / findLanguagePickers (+ helpers)
    build-model.ts            # buildPickerModel — above active+extract to avoid cycle
    detect-page-language.ts   # detectPickerActiveLanguage (thin getter)
    redirect.ts               # pickRedirectTarget
    gate.ts                   # findGateOverlay — blocking-interstitial detection
    index.ts                  # Re-exports everything above
    picker.test-utils.ts      # DOM fixture helpers (exported via subpath)
    picker.classify.test.ts   # classifyLanguageElement unit tests
    picker.redirect.test.ts   # pickRedirectTarget + findLanguagePickers tests
    picker.gate.test.ts       # findGateOverlay geometry/visibility matrix
    test-setup.ts             # beforeEach: clears body/head/<html lang>
  vitest.config.ts            # environment: jsdom, setupFiles: test-setup.ts
  package.json / tsconfig.json / project.json / eslint.config.mjs
```

## Dependencies

| Package              | Why                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@movar/lang-detect` | `normalizeBCP47` (BCP-47 tags, query params, hreflang) and `normalizeLanguageCode` (alias table: `ua`→`uk`, `ru`, etc.) — the authoritative language normalizer for the monorepo; also `LanguageCode` (a plain `string` alias) used throughout interfaces and constants. |
| `jsdom` (devDep)     | Vitest `environment: 'jsdom'` — full DOM API needed to test element classification and tree walking.                                                                                                                                                                     |

## Working on it

```bash
# from the package directory
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run

# or via nx from the repo root
nx run lang-pickers:typecheck
nx run lang-pickers:test
```

Test environment: jsdom (no browser needed). `src/test-setup.ts` runs a
`beforeEach` that resets `document.body.innerHTML`, `document.head.innerHTML`,
and `<html lang>` so DOM state never leaks between cases.

## Gotchas

- **`findLanguagePickers` requires ≥ 2 distinct language links** under a common
  ancestor to form a picker; a lone `/uk/` anchor with no language siblings is
  not classified as a picker.
- **The page-root guard resolves through `el.ownerDocument`, never the global
  `document`.** `<html>`/`<body>` often carry page-level locale metadata
  (UMI.CMS stamps `data-lang="ru"` on `<html>`, which `SEED_SELECTORS` matches),
  and `isPageRoot` exists to keep that from being seeded — otherwise it becomes
  the ancestor of every real candidate and `dedupNested` discards them all in
  its favour, yielding **zero pickers on a page that plainly has one**. In the
  content script the two documents are the same object, so this looks like a
  distinction without a difference; it is not. Movar Audit's WebView collector
  runs this model against a `DOMParser` document while the global `document` is
  the host app's own UI, and a global comparison is simply always false there.
  The failure is silent — it reads downstream as "this site has no language
  picker", a false `not-applicable` on four audit rules. Guarded by the
  cross-document case in `src/picker.extract.test.ts`.
- **Separator-split only fires on leaf elements** (`el.children.length === 0`)
  to prevent a container's joined `textContent` (`"UA | RU"`) from classifying
  as one of its children's languages and shadowing per-child detection.
- **Path-segment URL classification requires corroboration** (matching class,
  label, or img alt) because `/ru/` appears on logo links too, not just picker
  items.
- **`TEXT_DIVIDER_KIND` sentinel** — `classifyContainerChildren` skips elements
  whose `data-movar-kind` equals `"text-divider"` (wrappers inserted by
  `filterPickers` around orphan separator text nodes). Without this guard, those
  structural spans re-classify as language links on subsequent MutationObserver
  passes.
- **`findGateOverlay` needs layout, which jsdom doesn't have** — every
  `getBoundingClientRect` there is a zero box, so unit tests must stub the rect
  per element (see `src/picker.gate.test.ts`). The native-`<dialog>` branch is
  gated on `:modal`, which jsdom throws on, so that path is e2e-only.
- **Gate geometry measures OVERLAP with the viewport, not box size.** A closed
  off-canvas drawer (`position:fixed` + full size + `translateX(-100%)`) is a
  full-viewport-sized box that blocks nothing, and mobile drawers routinely
  carry the switcher — so the rect is clamped to the viewport before the
  `MIN_GATE_COVERAGE` comparison. Stub `left`/`top` in tests, not just w/h.
- **A collapsed switcher's toggle wears the CURRENT language.** On a page
  already serving the preferred language, `<button class="dropdown-toggle">УКР`
  is the picker's only `uk` entry, so `pickRedirectTarget` would hand it back
  and activating it just opens the menu. It is rejected via
  `DISCLOSURE_SELECTOR` (`aria-haspopup` ≠ false, `aria-expanded`,
  `data-toggle`/`data-bs-toggle="dropdown"`, `role="combobox"`). Only
  `trySatisfyLanguageGate` acts on an already-correct page, which is why the
  symptom showed up there.
- **A framework picker can carry NO conventional signal at all.** stls.store's
  switcher hashes every class (`sc-b53f1be3-1`), renders its active entry as a
  `<span href="/uk/">` and its switch as an `<a>` with **no href**, and puts the
  language in a non-standard `value="UA"` attribute. `a[href]` and the
  `[class*="lang"]` hints all miss it, so the picker was never found and the
  Russian option survived filtering. `SEED_SELECTORS` therefore also seeds
  `VALUE_CARRIER_TAGS`/`HREF_CARRIER_TAGS` — measured on the live page, this
  adds exactly the two picker entries out of ~1090 seeded elements. Two limits
  are load-bearing: form controls are NOT value carriers (an `<input value="ru">`
  is user data), and `languageFromValueAttr` refuses any element that CONTAINS
  another `[value]` — a custom-select root stamps its own selection, and
  classifying the root would make `dedupNested` (outermost wins) discard every
  real option.
- **`resolveSwitcher` (active.ts) counts only `a[href], button` as interactive
  — deliberately, don't "fix" it to match the href carriers.** It decides which
  entry is the "you are here" marker, and it wants NATIVE interactivity: a
  `<span href>` is inert, which is exactly why stls.store uses one for the
  active language. Teaching it about `span[href]` would flip that site's active
  detection.
- **Key test files**: `src/picker.classify.test.ts` (element-level signal
  matrix), `src/picker.redirect.test.ts` (redirect + bosch-style form-POST
  fallback); real-site regression tests live in
  `apps/extension/src/lib/picker.find.test.ts` and `picker.filter.test.ts`.
