# @movar/diagnostics — language-detection diagnostics (dev only)

A **private, never-published** browser extension for maintainers. It shows what
the product's **own detection models** see on the page you're browsing — content
cards and language pickers — classified with `@movar/lang-detect`, so you can
confirm detection works and spot misclassifications.

It is the separate home for the diagnostics surface that v1.1.0 stripped out of
the published `@movar/extension`. See the ADR:
[docs/diagnostics-devtools-panel.md](../../docs/diagnostics-devtools-panel.md).

> **Boundary invariant.** The published `@movar/extension` carries **zero**
> diagnostics surface, and this extension does not read the running product (no
> `externally_connectable`, no hook in the shipped artifact). It reuses the
> product's **pure DOM models as library code** — now ordinary `@movar/*`
> workspace packages (`@movar/page-content`, `@movar/lang-pickers`,
> `@movar/page-language`, `@movar/page-mode`), never the product's rendering
> (`conceal`/`curtain`/`tooltip`/`i18n`). That "pure models only" boundary is
> machine-enforced by the `src/lib/page-diagnostics.purity.test.ts` contract
> test. The product is unchanged. Never zipped, signed, or submitted; CI
> typechecks/lints/tests it like any workspace app, but the release workflow
> only builds `@movar/extension`.

## What it does

On each sweep, the content script runs the product's own models over the live
DOM and classifies what they find:

- **Page-content model** (`buildModelForHost` — Google & YouTube today) →
  content cards. Each card's pre-serialized text is classified with
  `classifyBySnippet` and marked **blocked** when its language is in the blocked
  set (i.e. the product would conceal it).
- **Language-picker model** (`findLanguagePickers` + `buildPickerModel` — any
  site) → the on-site switcher's languages, with **active** and **blocked**
  flags.
- Confident card verdicts also get a **franc cross-check** (✓ agrees / ⚠
  disagrees) — the original shadow-oracle calibration signal, now per card.
- **Page-mode model** (`detectPageMode` — any site) → the page's light/dark
  verdict and which signal in the chain decided it.
- **Page-language model** (`detectPageLanguageFromModel` — the sync
  redirect-signal chain) → the page's detected language and each input
  (active picker, `<html lang>`, subdomain, path, self-hreflang).

The result shows in an **in-page FAB + floating panel** (a 🔬 button bottom-right,
badged with how many items would be blocked), split into **tabs** — Content,
Pickers, Page mode, Page lang. **Show on page** flashes the source
element; **Copy as test fixture** copies a card as a `LanguageFixture` for
[`packages/lang-detect/test/fixtures.ts`](../../packages/lang-detect/test/fixtures.ts).

The UI mounts into a **shadow root**, so the host page's styles can't bleed in
and the product models never see the tool's own UI. Everything is on-device — it
**sends nothing**.

### Why reuse the product models (not a generic sampler, not coupling)

An earlier draft sampled visible text generically; it missed `<div>`-based text
(Google's results) and didn't reflect what the product actually extracts.
Reusing the product's models as **library code** is faithful (same extraction +
classification the product ships) and stays independent — it imports pure DOM
modules at build time, it does **not** talk to the running product extension
(which would need a cross-extension hook in the shipped artifact — explicitly
out of bounds).

## Run it

```sh
nx run diagnostics:dev      # launches a browser with HMR
# or
nx run diagnostics:build    # writes .output/{chrome-mv3,firefox-mv3,safari-mv3}
```

Or let the dev stack supervise it: `pnpm dev` brings it up (it's wired into
process-compose as `extension-diagnostics`). For a one-off build, load
`.output/chrome-mv3` via `chrome://extensions` → **Load unpacked** (Chrome/Edge),
`.output/firefox-mv3/manifest.json` via `about:debugging` (Firefox), or wrap
`safari-mv3` with `xcrun safari-web-extension-converter` (Safari).

## Use it

1. Open a **Google search** or **YouTube** page (content cards), or any site with
   a language switcher (pickers). The 🔬 FAB appears bottom-right.
2. The badge counts what the product would block here. Click the FAB to open the
   panel: content cards (kind + detected language + block badge + franc mark) and
   the language picker (offered languages, active, blocked).
3. **Show on page** to locate an item; **Copy as test fixture** to capture a card
   for `fixtures.ts`. (The console also logs a collapsed `[movar:diag] …` group.)

## Caveats

- **Re-run fidelity.** It runs the product's models and classifier itself; it does
  not read the running product's actual decisions. Because the code is shared,
  results match what the product would do — it won't catch
  product-integration-specific quirks.
- **Content cards are host-scoped.** `buildModelForHost` only has extractors for
  Google & YouTube; on other hosts the Content section is empty (the picker
  model still runs everywhere). This mirrors the product.
- **Candidate set.** Classifies across `priority ∪ blocked` from the product's
  `defaultSettings` (`uk` ∪ `ru`), and flags `blocked` (`ru`). Edit in
  [`src/entrypoints/content.tsx`](src/entrypoints/content.tsx) to tune.
- **Reuse is via `@movar/*` workspace packages** — `@movar/page-content`,
  `@movar/lang-pickers`, `@movar/page-language`, `@movar/page-mode`, and
  `@movar/lang-detect` (with the franc oracle behind the `/franc` subpath).
  The historical `@product` source alias into `apps/extension` was removed once
  those models became proper packages (ADR decision 7). The "pure models only,
  no rendering" boundary is enforced by `src/lib/page-diagnostics.purity.test.ts`
  (ADR decision 10).

## Layout

```
src/
  types.ts                 DiagCard / DiagPicker / PageDiagnostics view-model shapes
  lib/
    page-diagnostics.ts    run product models → classify → snapshot + highlight + store
    language-name.ts       English language names
    fixture-snippet.ts     card → LanguageFixture snippet
  ui/
    App.tsx                subscribe to the snapshot store, wire highlight/refresh
    Widget.tsx             FAB (block-count badge) + floating panel shell
    Panel.tsx              tabbed: Content / Pickers / Page mode / Page lang
  entrypoints/
    content.tsx            sweep (refresh) + mount the shadow-root UI
  styles/globals.css       Tailwind + design tokens scoped to :host (shadow root)
```
