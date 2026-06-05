---
type: adr
id: diagnostics-devtools-panel
status: proposed
date: 2026-06-05
summary: Ship the shadow-oracle diagnostics as a SEPARATE, never-published dev extension (`apps/diagnostics`) rather than inside the product. It is **self-contained**: its own content script re-runs `@movar/lang-detect`'s classifier + franc oracle on pages, records `DetectionDivergence`s, and surfaces them in an **in-page FAB + floating panel** mounted into a shadow root by that same content script — no background, no relay, no DevTools page, so it works in every browser (Safari included). The published `@movar/extension` carries ZERO diagnostics surface — v1.1.0 already stripped it — and the dev extension does NOT reach into it (no `externally_connectable`, which would just move the surface back into the shipped artifact). Loaded unpacked, wired into process-compose, excluded from the release workflow. Supersedes [per-snippet-language-detection.md](./per-snippet-language-detection.md) decision 11 and replaces this ADR's original in-extension-panel proposal. (Filename/id are historical — the surface is an in-page panel, not a DevTools panel; see "Revised".)
---

# Diagnostics as a separate, unpublished dev extension

## Why this was rewritten

The first draft of this ADR put the diagnostics DevTools panel **inside** the published extension (a `devtools_page` in the product manifest, a background relay in the product's service worker, recording in the product content script). That was rejected: shipping content-sample _retention_ + an analysis _oracle_ in the trust-critical, MIT-open-source artifact is indefensible against the "doesn't track / sends nothing / can't read your content" promise — regardless of it being local-only and off by default — and it is dead weight for the ~all users who never open it. The standing rule that follows: observability that retains or analyses content ships separately, never in the product — even local-only and off by default. This rewrite moves the whole thing out of the product.

## Revised (2026-06-05): in-page surface, not a DevTools panel

The first separate-app draft (below) used a **DevTools panel** as the surface. That was changed during implementation, for one reason: **a DevTools panel locks out Safari** (`devtools.panels.create` is Chromium + Firefox only), and "cross-browser" is the whole point of a maintainer tool meant to mirror what the product does everywhere. The DevTools panel also forced a three-hop **panel ↔ background ↔ content relay** (a DevTools page can't message a content script directly, and is keyed by `inspectedWindow.tabId`).

The surface is now an **in-page FAB + floating panel** injected by the content script into a shadow root. Because the UI lives in the content script's own world, it reads the ring buffer and triggers highlights with **direct calls** — deleting the background service worker, the relay, the DevTools page, the `tabId` keying, and the entire message protocol. It works in Chrome, Firefox, **and Safari**. Decisions 1–3, 7–9 are unchanged; decision 4 (and the architecture/protocol sections) are rewritten below. The filename and `id` (`diagnostics-devtools-panel`) are kept as the stable identifier but are historical.

## Revised (2): reuse the product's models, not generic sampling

The first separate-app draft sampled the page's visible text with a generic walker (decision 5, original). In practice that under-sampled — it used a fixed tag allowlist with no `<div>`, so it missed Google's result text entirely — and, more importantly, it showed "divergences" (classifier-vs-oracle _disagreements_, i.e. errors), which read as "0" on a correctly-classified page and never answered "is it detecting the content?".

The fix keeps the extension **independent** (the standing rule holds: no reaching into the running product, no hook in the shipped artifact) while making it **faithful**: it reuses the product's own **page-content model** (`buildModelForHost`) and **language-picker model** (`findLanguagePickers` + `buildPickerModel`) as **library code** — the pure DOM files only, via a dev-only `@product` source alias. The panel now shows what those models extract on the page (content cards + picker options), each classified and marked blocked/active, with the franc cross-check as a per-card ✓/⚠. Decision 5 is rewritten and decision 2 clarified ("self-contained" = no _runtime_ coupling; a build-time source import of pure models is fine). Decision 7 records the alias and the shared-package path it defers.

## Context

- **v1.1.0 already stripped diagnostics from the product** (commit `b03e9da`): removed the popup viewer, options toggle, `apps/extension/src/lib/diagnostics.ts`, `MovarSettings.diagnostics`, the `content.ts` oracle wiring, i18n, and e2e specs.
- **Kept, and reused here:** the pure detection + oracle in `@movar/lang-detect` (`classifyBySnippet`, `francOracle`, `classifyDivergence`, `shadow.ts`) and the inert `onSnippet?` seam in [`conceal.ts`](../apps/extension/src/lib/page-content/conceal.ts:172). The `DetectionDivergence` / `DiagnosticsSummary` record types still sit in `@movar/shared` and should relocate (decision 7).
- The calibration goal is unchanged ([per-snippet ADR](./per-snippet-language-detection.md): thresholds "oracle-calibrated post-launch"). Networked telemetry was always forbidden, so calibration was always local hand-tuning — this just moves the surface to a tool maintainers install deliberately.

## Decisions

1. **Diagnostics is a new, private, never-published extension: `apps/diagnostics`** (`@movar/diagnostics`, `private: true`), its own WXT app alongside `apps/extension`.
2. **Self-contained — it re-runs detection, it does not read the running product.** Its own content script imports `@movar/lang-detect` and the product's **pure DOM models as library code** (the page-content extractor + the language-picker model, via a build-time `@product` path alias), classifies what they find, and snapshots it. "Self-contained" means no _runtime_ coupling — nothing read from the running product extension, no cross-extension hook in the shipped artifact. The product source is unchanged. _(v1 sampled text generically with no product code; revised to reuse the models — see "Revised (2)".)_
3. **No `externally_connectable` in the product.** A companion that reached into `@movar/extension` would require a cross-extension hook _in the shipped manifest_ — defeating the entire point. The boundary is hard: the published artifact has zero diagnostics surface, full stop.
4. **Surface = an in-page FAB + floating panel** ("Movar Diagnostics"), mounted by the content script into a **shadow root** (`createShadowRootUi`, style-isolated both ways). Because the UI runs in the content script's own world alongside the ring buffer + `WeakRef<Element>` highlight map, it reads the summary and triggers highlights with direct calls — **no background, no relay, no DevTools page, no `tabId` keying, no message protocol**. This is what makes it cross-browser (Chrome, Firefox, **Safari** — which has no DevTools-panel API). _(Originally a Chrome/Firefox DevTools panel; see "Revised".)_
5. **Text source = the product's own models** (revised from generic sampling — see "Revised (2)"). The content script runs `buildModelForHost` (page-content cards; Google & YouTube today) and `findLanguagePickers` + `buildPickerModel` (language pickers; any site), then classifies each card/option with `@movar/lang-detect` and marks it blocked/active. This is faithful (it shows exactly what the product extracts and would conceal) and was the original "card-scoped path"; generic sampling missed `<div>`-based text (Google results) and didn't reflect the product. Confident card verdicts still get a per-card franc cross-check (the calibration signal).
6. **Recording is on whenever the extension is loaded** (you only load it to tune). The FAB is always present (count badge); the panel is collapsed until clicked. The extension itself is the opt-in.
7. **Package boundaries.** `@movar/lang-detect` keeps pure detection + oracle (incl. `DivergenceKind` in `shadow.ts`). The view-model types (`DiagCard` / `DiagPicker` / `PageDiagnostics`) live in `apps/diagnostics` (`src/types.ts`); `@movar/shared` stays product-only. The reused models (`page-content/` extractor + `lang-pickers/` model) are imported from the product source via a **dev-only `@product` alias** (`wxt.config.ts` / `tsconfig.json` / `vitest.config.ts`) — only the _pure_ model files (no `conceal`/`curtain`/`tooltip`/`i18n` rendering). The clean long-term path is promoting those models into a shared package both apps depend on; the alias is the pragmatic interim that leaves the trust-critical product untouched (and avoids dragging `lang-codes`, used widely across the product, into a package right now).
8. **Excluded from release + publish.** [`release.yml`](../.github/workflows/release.yml) builds only `@movar/extension`; the dev extension is never zipped, signed, or submitted. No store assets, no i18n (English-only).
9. **Privacy invariant holds trivially.** Everything is local: the dev extension records on-device, shows in an on-device in-page panel, sends nothing. It is also never in a user's hands.

## Architecture (all inside `apps/diagnostics`, one world)

Everything runs in the content script's isolated world — no background, no relay, no cross-context messaging:

```
 Tab (content script, isolated world)
   ┌──────────────────────────────────────────────────────────────────┐
   │  @product page-content model (buildModelForHost) → cards            │
   │  @product picker model (findLanguagePickers + buildPickerModel)     │
   │     → classifyBySnippet + francOracle (@movar/lang-detect)          │
   │     → PageDiagnostics snapshot + WeakRef<Element> map + console     │
   │            ▲ getCurrent() │ highlightNode(id)                       │
   │            │ subscribe(rerender)  ▼ (direct calls)                  │
   │  ┌──────────────────────────────────────────────────────────────┐ │
   │  │  shadow root (createShadowRootUi): 🔬 FAB + floating panel     │ │
   │  │   • Content cards (kind · language · block · franc ✓/⚠)        │ │
   │  │   • Language picker (offered langs · active · blocked)         │ │
   │  │   • show-on-page highlight / copy-as-fixture                   │ │
   │  └──────────────────────────────────────────────────────────────┘ │
   └──────────────────────────────────────────────────────────────────┘
```

`page-diagnostics.ts` runs the reused product models, classifies their output, builds the snapshot, and owns the highlight map + a current-snapshot store. The panel (`Panel.tsx`) renders it. **There is no intra-extension message protocol** — the UI calls `getCurrent()` / `highlightNode(id)` directly and re-renders via the store's `subscribe` hook. (Style isolation: the UI mounts in a shadow root, and design tokens are scoped to `:host` since `:root` doesn't match inside a shadow tree. The reused models are imported via a dev-only `@product` alias — pure model files only, never the product's rendering.)

## process-compose & build

- A supervised `wxt dev` process for `apps/diagnostics` joins the dev stack (opt-in / disabled by default so a normal `pnpm dev` doesn't open a second browser); or `nx run diagnostics:build` and load `.output/{chrome-mv3,firefox-mv3,safari-mv3}` unpacked.
- `nx` targets mirror `apps/extension` (`dev`, `build` [chrome+firefox+safari], `typecheck`, `lint`, `test`) minus `zip`/release. CI typechecks/lints/tests it like any workspace app; it is never part of a release artifact.

## Browser support

All browsers. The UI is plain content-script DOM in a shadow root — Chrome/Edge, Firefox, and **Safari** (which has no DevTools-panel API, the reason the surface is in-page). Safari still needs the unpacked `safari-mv3` wrapped via `xcrun safari-web-extension-converter` to load, same manual step as the product.

## Migration / sequencing

- **Done (v1.1.0):** product stripped of diagnostics (`b03e9da`).
- **Phase 1 — scaffold `apps/diagnostics`:** WXT app, content-script-only manifest (`<all_urls>`; no `tabs`, no `devtools_page`, no background), nx/project.json, process-compose entry.
- **Phase 2 — detection + recording:** content script samples text and runs `classifyBySnippet` + `francOracle`; port the ring/queue/drain/highlight (`diagnostics.ts`); relocate `DetectionDivergence`/`DiagnosticsSummary` per decision 7.
- **Phase 3 — UI:** FAB + floating panel in a shadow root (port the recovered panel list), live feed via the recorder's `setOnRecorded` hook, show-on-page highlight, copy-as-`fixtures.ts`.
- **Phase 4 — polish:** confirmed divergences graduate to `packages/lang-detect/test/fixtures.ts`; README + a maintainer note in the deployment/dev docs.

> **Note (implemented):** the surface shipped as the in-page FAB from the start (the "Revised" pivot), not a DevTools panel — so no relay/background/devtools-page was ever built.

## Test strategy

- **Unchanged:** `@movar/lang-detect` oracle unit tests stay (the detection logic is untouched).
- **New unit:** `page-diagnostics` over a synthetic DOM (the reused product picker model finds a known-good picker, languages classified + blocked/active flagged, highlight by id), the fixture-snippet builder, and a `Widget` component test (FAB block-count/toggle + the Content/Picker sections over a `PageDiagnostics`). No relay to test — it doesn't exist.
- **Honest gap:** no automated end-to-end test in a real extension context (would need Playwright loading the unpacked extension and driving the in-page FAB). Covered by the component test + a manual smoke step. Acceptable for an unpublished dev tool.

## Risks

- **Re-run fidelity.** The dev extension observes its _own_ classification, not the product's actual decisions. Because the classifier is the shared `@movar/lang-detect`, profile/threshold divergences reproduce identically (the calibration target). It won't catch product-integration-specific quirks — which the oracle was never meant to. Acceptable; note in the README.
- **Second app to maintain** (manifest, WXT config, UI). Mitigated by reusing all detection + the page/picker models from the product (no duplication).
- **Smaller calibration pool** — maintainers' local browsing only, not power users. Already implied by the no-telemetry rule.
- **`@product` source alias is a soft boundary.** A build-time import of `apps/extension` source (pure model files) couples the dev tool to the product's internals — if those move, diagnostics breaks at build (acceptable; it _wants_ to track them). The clean fix is a shared package (decision 7). nx doesn't see the cross-import as a dependency, so its cache graph is slightly inaccurate for this app — fine for a never-released tool.

## Considered alternatives

- **In-extension panel (this ADR's first draft).** Rejected — ships retain-and-analyse code in the trust-critical product. The motivation for the rewrite.
- **DevTools panel in the separate dev extension (this ADR's second draft).** Rejected during implementation — `devtools.panels.create` is Chromium + Firefox only (**no Safari**), and it forces a panel ↔ background ↔ content relay keyed by `inspectedWindow.tabId`. The in-page FAB drops all of that and works everywhere. (See "Revised".)
- **Companion that reads the product via `externally_connectable`.** Rejected — leaves a cross-extension surface in the shipped manifest; not self-contained.
- **Production build-flag that tree-shakes diagnostics out.** Considered; rejected in favor of a separate app because the boundary is a build flag (less legible to an auditor) vs. an obviously-separate, never-published extension.
- **Keep it console-only, no panel.** The interim state until this lands; loses the click-to-highlight tuning workflow that is the panel's value.
- **Networked divergence telemetry.** Rejected — violates the on-device invariant ([per-snippet ADR](./per-snippet-language-detection.md) decision 10).

## Open questions

- **Card-scoped vs generic sampling** (decision 5) — start generic; promote `page-content/` to a shared package only if card-fidelity proves necessary.
- **Where do `DetectionDivergence`/`DiagnosticsSummary` land** — _resolved:_ inside `apps/diagnostics` (`src/types.ts`); no message protocol means no need for a shared core package.
- **FAB intrusiveness** — the FAB is on every page in the dev browser. If that proves noisy, add a session-dismiss or a keyboard toggle. Always-on recording is unchanged (decision 6).
- **Repo placement of this ADR + the new app** — _resolved:_ `feat/diagnostics-extension`, branched off the v1.1.0 release tip (inherits the post-strip state); not the release branch itself.

## Out of scope

- The classifier, oracle, profiles, thresholds — owned by [per-snippet-language-detection.md](./per-snippet-language-detection.md).
- The page-language redirect path — [on-device-language-detection.md](./on-device-language-detection.md).
- Any change to the published `@movar/extension` beyond the completed v1.1.0 strip.
- Network telemetry of any kind.
