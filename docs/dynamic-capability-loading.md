---
type: refactor-plan
id: dynamic-capability-loading
status: proposed
date: 2026-06-08
summary: Treat the content script as a composed agent — an always-on core loop plus capabilities ("tools") provisioned per (host, settings) from packaged, web-accessible chunks loaded via runtime.getURL. Splits #83's single coarse hide.js into independently loadable units along the axes that vary — per-site page-content models (models/<site>.js), the concealment presenter cluster (curtain + tooltip + page-mode watcher, gated entirely behind concealMode === 'curtain'), and per-locale strings — so a page loads only what it needs in one parallel batch (no waterfall, no SW round-trip on the load path, no remote code). Page-content models become first-class independent peers (consumable by future non-hiding features), not children of the hiding code. Centres on a tiny eager descriptor registry + a synchronous resolveNeeds(host, settings); requires inverting the conceal→curtain/i18n/page-mode imports to dependency injection so hide-mode loads zero presenter bytes. Conceal mode is global (the per-shape floor is dropped — see content-filtering-modes.md), so the presenter gate is pure settings. Builds on content-filtering-modes.md (concealMode), multi-shape-content-filter.md (the shape list), and the #83 lazy-load substrate. Not yet implementable on the current branch — see Prerequisites.
---

# Dynamic capability loading for the content script

## Context

Today the DOM-modifying "filtering" feature loads as one coarse chunk. PR #83 ([origin/main](../apps/extension/wxt.config.ts) `bundleHideChunk`) split the entire hiding subtree out of the always-on `content.js` into a single `hide.js`, loaded on first need via `import(runtime.getURL('hide.js'))` and gated by `settings.contentModification`. That chunk's entry is [`content-modification.ts`](../apps/extension/src/lib/content-modification.ts), whose static imports pull in **everything**: `picker-filter`, `tooltip`, `content-conceal`, `curtain`, `i18n/content`, **and every per-site page-content model** (`@movar/page-content/google`, `@movar/page-content/youtube`).

So the granularity is "all hiding code, or none." Two problems as the surface grows:

1. **Per-site models all ship together.** On any content-modified page, `hide.js` carries Google _and_ YouTube (and every future site) even though exactly one extractor — at most — matches the host. The roadmap (`prom.ua`, `rozetka`, the multi-language expansion) makes this an unbounded axis bundled into one chunk.
2. **Presentation ships even when unused.** The `curtain` / `tooltip` / `page-mode` overlay stack loads whenever `contentModification` is on — but `concealMode: 'hide'` ([content-filtering-modes.md](./content-filtering-modes.md)) renders no overlays at all. Plus [`installPageModeWatcher()`](../apps/extension/src/entrypoints/content.ts) runs eagerly on every enabled page, gated only by enabled/allowlist/pause — never by `concealMode` — though its only job is theming overlays that may never exist.

**Goal:** provision only what _this host_ under _these settings_ needs, in one parallel batch, from packaged chunks. No remote code, no load-path round-trip to the service worker, no regression to `document_start` timing.

This builds directly on:

- [content-filtering-modes.md](./content-filtering-modes.md) — the `concealMode` setting (currently WIP; see Prerequisites). **Note:** that ADR's per-shape `HideMode` floor is dropped — conceal mode is global (see §`concealMode is the sole axis`).
- [multi-shape-content-filter.md](./multi-shape-content-filter.md) — the per-site shape list (what to match). Its per-shape `hideMode` field is now vestigial.
- [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md) — the package split that made `page-content` / `lang-pickers` independent model packages.
- Constraint: [no-content-translation.md](./no-content-translation.md) — block-only; this plan is purely _how to load_ concealment, never _whether to translate_.

## Mental model: the content script is a composed agent

An always-on **core loop** (detect page state → decide → act) plus **capabilities** ("tools") provisioned per task, where _task = (host, settings)_. Each tool self-describes:

```ts
interface CapabilityDescriptor {
  id: string;
  needs(ctx: ResolveContext): boolean; // pure predicate — when is this tool part of the task?
  chunk: string; // packaged ESM file, loaded via runtime.getURL
  deps?: string[]; // tools/data it can't run without
}
```

Three layers:

1. **Registry** — the descriptors, eager and tiny, in `content.js`. The catalogue.
2. **Resolver** — `resolveNeeds(ctx)` → the transitive set of needed tools. Synchronous, local, no I/O.
3. **Provisioner** — one parallel `import(runtime.getURL(...))` batch to load the set, plus _seed_ each tool with live context (mirrors #83's `seedContext({colorScheme, locale})`).

**Local vs remote tools.** Not every capability is carried into the agent's context. **franc** is heavy and shared across all pages, so it lives "out of process" in the background worker and is _called_ via message (`movar:classifySnippets`), not loaded — an agent invoking a remote tool, not shipping it. Placement rule for any future capability: _heavy + shared → remote (worker, message); light + page-specific → local (chunk, getURL)._

## Hard constraints

- **No remote code.** Models are executable DOM logic; loading them from a server would be remote code execution — banned by Chrome Web Store / AMO and a breach of the network-silent guarantee. All chunks are packaged; new sites ship via the extension release, never a download endpoint.
- **`document_start` anti-flash.** Movar hides content; late injection flashes blocked content visible. Keep the always-on declared content script at `document_start`; the resolver must be synchronous and local (no SW round-trip to _decide_ the toolset); reject `chrome.scripting.executeScript({files})` for the critical path (it needs the `scripting` permission — a ~7-surface justification change — and injects _after_ navigation, regressing anti-flash).
- **`web_accessible_resources` ≠ permission warnings.** Exposing more packaged chunks adds no install warning (as #83 already established for `hide.js`), but scope match patterns sensibly.

## The boundary rule (load-bearing)

**Page-content models are independent peers, not children of the hiding feature.** Dependency arrows point _into_ a model (`models/<site>.js` exports `extract(root): PageContentModel` and imports nothing from curtain/i18n/page-mode/settings). The hiding feature is _a_ consumer; the model never imports it. This keeps the model reusable by future non-hiding consumers — a "highlight what's Russian" reading view, or the separate diagnostics build ([diagnostics-devtools-panel.md](./diagnostics-devtools-panel.md)) that must never ship in the product — without dragging concealment code along. Reinforces the pure-model-package discipline from [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md).

## The capability graph

Verified against `origin/main` (7dd415c). `home` = where the code lives after this plan.

```
ALWAYS-ON  content.js ─────────────────────────────────────────────────────
  orchestrator · language-switch (rules/enforce/hreflang/picker redirect) ·
  page-language · lang-pickers · picker-click · page-mode/context (trivial getter) ·
  [NEW] descriptor registry · resolveNeeds()
        │ gate: enabled & !allowlist & !paused
        ▼
REMOTE  background worker ── franc (movar:classifySnippets, movar:detectText) ·
                            content-strings catalogues (movar:contentStrings)
        ▲ called by core (detection) AND by hide-core (card classification)
        │
DEFERRED — gate: contentModification
  ├─ hide-core   content-conceal (structural) · cm-facade · model dispatcher
  │      ├─→ models/<site>.js     gate: + matches(host)         [per-site axis ∞]
  │      └─→ classifySnippets     (remote)
  └─ presenter   curtain · tooltip · page-mode (detect/observer/apply)
         gate: + concealMode === 'curtain'
         └─→ strings/<locale>.js  gate: + locale ≠ 'en'         [per-locale axis]
```

| Capability                                                 | Class              | Current home (main)   | Target home                          | Gate                           |
| ---------------------------------------------------------- | ------------------ | --------------------- | ------------------------------------ | ------------------------------ |
| language-switch, page-language, lang-pickers, picker-click | core               | `content.js`          | `content.js`                         | enabled & !allowlist & !paused |
| `page-mode/context` (getter)                               | core               | `content.js`          | `content.js`                         | —                              |
| franc detect / classify                                    | remote             | worker                | worker                               | always (warm on boot)          |
| content-strings catalogues                                 | remote             | worker                | worker (or `strings/*` — see Open Q) | presenter & locale≠en          |
| content-conceal (structural) + cm-facade                   | app-feature        | `hide.js`             | `features/conceal.js`                | contentModification            |
| page-content model                                         | pure-model-package | `hide.js` (all sites) | `models/<site>.js`                   | + matches(host)                |
| curtain + tooltip + page-mode watcher                      | app-feature        | `hide.js`             | `features/curtain-ui.js`             | + concealMode === 'curtain'    |

## `concealMode` is the sole axis

**Decision (2026-06-08):** the per-shape `HideMode` floor is **dropped**. `concealMode` applies uniformly — `'curtain'` curtains _every_ blocked card (and shows picker-filter chrome); `'hide'` is _pure silent removal everywhere_ (no curtains, no picker chips). A curtain on a Google result / channel link / Shorts shelf is accepted. This supersedes the floor / `effectiveHideMode` mechanism in [content-filtering-modes.md](./content-filtering-modes.md).

Consequences:

- **The presenter gate is pure settings:** `presenter = contentModification && concealMode === 'curtain'`. No per-site `canCurtain`, no picker-model lookup, no extraction-dependency — `resolveNeeds` collapses to a function of `(host, settings)` alone.
- **Site no longer matters for the presenter:** curtain-mode loads `features/curtain-ui.js` on every page with a model (Google included), not just curtainable sites. We trade the old "Google skips the presenter" win for one-stage simplicity.
- **More false-positive-forgiving:** a misdetected card that previously hard-hid on a `hide`-floor surface is now curtained (peekable, recoverable) in curtain mode.
- **Implementation caveat:** the curtain renderer has only ever run on `blur`-floor cards. Verify it renders sensibly on the shapes that were `hide`-only (Shorts shelves, channel cards, SERP results) when implementing.

## `resolveNeeds`

```ts
// Pure function of (host, settings) — no picker model, no extraction, no canCurtain.
function resolveNeeds(host, settings): Needs {
  if (!settings.contentModification) return {}; // off by default → nothing deferred
  const curtain = settings.concealMode === 'curtain'; // else 'hide' = silent removal
  return {
    model: lookupDescriptor(host)?.chunk ?? null, // { id, matches, chunk }
    presenter: curtain,
    locale:
      curtain && resolveLocale(settings.uiLanguage) !== 'en'
        ? resolveLocale(settings.uiLanguage)
        : null,
  };
}
```

The descriptor is `{ id, matches, chunk }` — no `canCurtain` (it went with the floor).

## Chunk topology

| Chunk                    | Contents                                                                                                                   | Gate                           | Axis            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------- |
| `content.js` (always-on) | orchestrator, language-switch, page-language, lang-pickers, picker-click, `page-mode/context`, **registry + resolveNeeds** | enabled & !allowlist & !paused | —               |
| background worker        | franc, profiles, content-strings                                                                                           | remote                         | —               |
| `features/conceal.js`    | `content-conceal` (structural), cm-facade, model dispatcher                                                                | contentModification            | —               |
| `models/<site>.js`       | one per site: extractor (+ shared `serialize`/`types` via esbuild splitting)                                               | + matches(host)                | **per-site ∞**  |
| `features/curtain-ui.js` | `curtain`, `tooltip`, `page-mode` detect/observer/apply                                                                    | + concealMode === 'curtain'    | per-concealMode |
| `strings/<locale>.js`    | i18n catalogue as a data module (optional — see Open Q)                                                                    | + presenter & locale≠en        | per-locale      |

## Required refactor: invert the structural → presentation edges

The presenter won't drop cleanly today because the **structural** modules statically import the **presentation** ones:

- [`content-conceal.ts`](../apps/extension/src/lib/content-conceal.ts) imports `./curtain`, `./i18n/content`, `@movar/page-mode/context`.
- [`picker-filter.ts`](../apps/extension/src/lib/picker-filter.ts) imports `./curtain`, `./tooltip`, `./i18n/content`, `@movar/page-mode/context`.

So `conceal` can't sit in `features/conceal.js` without dragging the whole presenter in. **Invert these to dependency injection:** the orchestrator passes a `presenter` handle (`attachCurtain` / `getMessages` / current color scheme) into `conceal`/`picker-filter`; in `hide` mode no presenter is injected, so no presenter code is referenced and the bundler keeps it out of `features/conceal.js`. Consistent with the project's inject-don't-couple preference.

**page-mode nuance:** `@movar/page-mode/context` is a trivial module-level getter/setter — fine to keep in core. The deferrable weight is `detect` + `observer` + `apply` (the watcher and overlay theming), which ride with `features/curtain-ui.js`. Move `installPageModeWatcher()` out of the eager bootstrap into presenter provisioning.

## Hydration batch (provisioner)

The orchestrator computes `needs` locally, then fires one parallel batch — latency = max(individual), not sum; all packaged; no SW on the load path:

```ts
const needs = resolveNeeds(location.hostname, settings);
const [model, presenter, strings] = await Promise.all([
  needs.model ? loadChunk(`models/${needs.model}.js`) : null,
  needs.presenter ? loadChunk('features/curtain-ui.js') : null,
  needs.locale ? loadStrings(needs.locale) : null, // see Open Q
]);
```

`loadChunk` memoizes (`Map<path, Promise<Module>>`) so each chunk loads at most once per content-script lifetime and concurrent `applyOnce` ticks dedupe; a failed import resolves to `null` (a model/presenter load failure must not break the apply pass). franc detection stays a separate, already-parallel remote path — hydration ≠ detection.

## Build mechanics

- **esbuild multi-entry splitting.** Generalize `bundleHideChunk` to one `build` with `entryPoints` = `{ 'features/conceal', 'features/curtain-ui', 'models/google', 'models/youtube', … }`, `splitting: true`, shared `outdir`. esbuild factors common `serialize`/`types`/`page-mode-apply` into shared chunks instead of duplicating them per model — this is what keeps N sites cheap. `features/conceal.js` must **not** statically import the extractor bodies or the presenter (post-inversion), or they collapse back in.
- **`web_accessible_resources`.** Add `models/*.js`, `features/*.js`, `strings/*.js`, and esbuild's shared-chunk glob. No new permission. Optional hardening: scope each `models/<site>.js` match to its own host instead of `<all_urls>`.
- **Budgets.** Add `assertModelBundlesSlim` (per-site cap, e.g. ~15 KB) and shrink the `features/*` budgets; `content.js` stays at 40 KB (it loses the eager page-mode watcher).
- **AMO lint.** Extend the existing `UNSAFE_VAR_ASSIGNMENT` acknowledgment in `scripts/verify-release.sh` to the new dynamic imports.
- **Testing.** Keep fake loaders in test code. Runtime loaders should expose production-shaped factories/dependency injection; jsdom tests can instantiate those factories or mock the loader module without adding `*ForTest` hooks to source modules.

## Cascade (validation)

| Context                             | Deferred chunks loaded                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| `contentModification` off           | **none** (core only)                                                                      |
| any site · `concealMode: 'hide'`    | `features/conceal` + `models/<site>` — **no presenter, no strings, no page-mode watcher** |
| any site · `concealMode: 'curtain'` | `features/conceal` + `models/<site>` + `features/curtain-ui` + `strings/<locale>`         |

The presenter is now a pure function of `concealMode`, site-independent. `concealMode: 'hide'` is provably minimal-footprint mode.

**Adding a site** = one descriptor row (`matches`, `chunk`) + one `*.extractor` file + one esbuild entry. **Adding a capability** = one descriptor + one chunk.

## Prerequisites (why this isn't implementable as-is)

The target sits at the intersection of two things that currently live on different refs:

- **`concealMode`** (the resolver's driver) is **uncommitted WIP** on the working branch (`ConcealMode` across `settings`, `content-conceal.ts`, `content-modification.ts`, `content.ts`) — the implementation of content-filtering-modes.md. Not on `origin/main`.
- **The `hide.js` lazy-load substrate** (#83/#84) is on `origin/main` but **not** on the working branch.

Implementation order:

- **PR 0 (prereq).** Land `concealMode` (content-filtering-modes.md, now global — drop `effectiveHideMode` and the per-shape `hideMode`) and rebase onto `main` so #83/#84 are present. Everything below assumes that merged base — building it on the stale branch will conflict with main.

## Phased rollout

- **PR 1 — registry + resolver (pure, branch-independent).** Add the `CapabilityDescriptor` registry (`{ id, matches, chunk }`) and `resolveNeeds`. Pure functions, fully unit-tested, no wiring. _(Safe to write before PR 0; touches no WIP files.)_
- **PR 2 — edge inversion (no behavior change).** Invert `content-conceal` / `picker-filter` to take an injected presenter; move `installPageModeWatcher` into presenter provisioning. Existing conceal/curtain/picker tests stay green.
- **PR 3 — build split.** esbuild multi-entry + splitting; `models/<site>.js`, `features/conceal.js`, `features/curtain-ui.js`; `web_accessible_resources`; budgets; AMO ack; loader + test seam.
- **PR 4 — wire the provisioner.** Replace the single `loadHideModule` with `resolveNeeds` + the parallel hydration batch; seed loaded tools; on live settings change, re-resolve and **revoke** dropped tools (disconnect the page-mode watcher, detach curtains/tooltips — the existing `detachAllCurtains` / `detachAllTooltips` are the revocation primitives; a leaked watcher keeps firing on torn-down overlays).
- **PR 5 — optional.** `strings/<locale>.js` as getURL data modules (removes the SW cold-start from the load path); per-host `web_accessible_resources` scoping.

## Tests

- `resolveNeeds` matrix: off → {}; `concealMode: 'hide'` → model only (no presenter); `concealMode: 'curtain'` → model + presenter + strings, for any site.
- Loader: memoization (one load per chunk), concurrent-tick dedupe, failed import → `null` (apply pass survives).
- Revocation: `curtain → hide` mid-session disconnects the page-mode watcher and detaches overlays.
- Cascade e2e: hide-mode loads no `features/curtain-ui`; curtain-mode loads presenter + strings (assert on Google and YouTube alike). Assert against built artifacts.
- Per-chunk byte budgets.

## Out of scope

- **Per-site composed bundles** (one import gets site + presenter) — only if RTT count ever matters; the parallel batch already gives single-RTT latency.
- **Remote model download** — banned (no-remote-code); models ship in the package.
- **The opt-in → opt-out default flip** for `contentModification` — separate decision (content-filtering-modes.md Open Q 1).
- **Picker-entry concealment redesign** — this plan only relocates picker-filter's presentation behind injection; its per-entry logic is untouched.

## Open questions

1. **Strings: worker message vs getURL data module.** Status quo (`movar:contentStrings`) works and keeps inactive locales out of the bundle — but it's a SW round-trip. Firing it _in parallel_ with the chunk loads already removes the waterfall; moving to `strings/<locale>.js` additionally removes the SW cold-start. **Recommendation:** parallelize now (PR 4), consider getURL strings as PR 5.
2. **Presenter granularity.** One `features/curtain-ui.js` (curtain + tooltip + page-mode), or split tooltip/curtain? They co-activate, so one chunk; don't over-split the bounded axis — only the per-site axis grows unboundedly.

## Relations to other docs

- **Builds on** [content-filtering-modes.md](./content-filtering-modes.md) (concealMode — this plan drops its per-shape floor; conceal mode is global), [multi-shape-content-filter.md](./multi-shape-content-filter.md) (the per-site shape list), [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md) (independent model packages).
- **Loading substrate** from #83 (`hide.js`) — generalized, not replaced.
- **Constrained by** [no-content-translation.md](./no-content-translation.md) (block-only).
- **Reuse target** [diagnostics-devtools-panel.md](./diagnostics-devtools-panel.md) — a non-hiding consumer of the now-independent models.
  </content>
