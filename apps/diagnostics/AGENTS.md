# Movar Diagnostics — `@movar/diagnostics`

> A private, never-published, maintainer-only dev extension that re-runs the product's own page-content and language-picker models on visited pages and surfaces classifier-vs-franc-oracle divergences in an in-page FAB + floating panel.

## What it does

The content script calls `buildModelForHost` (`@movar/page-content`) and `findLanguagePickers` + `buildPickerModel` (`@movar/lang-pickers`) to extract the same cards and picker options the product sees. Each card is run through `classifyBySnippet` (`@movar/lang-detect`) and cross-checked against the `francOracle` on confident rung-1/2 verdicts. The resulting `PageDiagnostics` snapshot (cards, pickers, page-mode, page-language, `blockedCount`) is stored in a module-level current-snapshot store with a single subscriber.

A shadow-root UI (`createShadowRootUi`) renders a Microscope FAB badged with `blockedCount`, toggling a floating panel with four tabs: Content cards (kind · language · rung · franc ✓/⚠ · block), Language pickers (active/blocked), Page mode (light/dark signal chain), and Page language (sync redirect-signal chain). Cards have click-to-highlight (a green `flashElement` overlay on the host page, outside the shadow root) and a "copy as test fixture" button that formats a `LanguageFixture`-shaped snippet for `packages/lang-detect/test/fixtures.ts`.

The snapshot is rebuilt on `document_idle` and re-debounced (300 ms) on `MutationObserver` to track SPA navigations and infinite feeds. Nothing is persisted or networked; all state is in-memory for the tab lifetime.

## Boundaries & invariants

**Key invariant:** Observability ships separately and never in the published `@movar/extension`, even off-by-default. The product carries zero diagnostics surface; `@movar/diagnostics` is self-contained and reaches into nothing at runtime. See `docs/diagnostics-devtools-panel.md`.

- `private: true` — never published to any store, never submitted to AMO (Firefox add-on id `diagnostics@movar.fyi` is for stable temporary-install identity only).
- No background script, no devtools page, no relay, no `externally_connectable`. Content-script-only. This is what makes it cross-browser including Safari, which has no DevTools-panel API.
- No import of product rendering code: `conceal`, `curtain`, `tooltip`, i18n, and storage are all forbidden. Only pure model packages are imported.
- No `@product/*` alias. The historical alias (documented in the ADR as the interim approach) was removed when the models became proper workspace packages. All model imports are normal `@movar/*` workspace deps.
- The UI mounts in a shadow root (`movar-diagnostics`), style-isolated from the host page. `WeakRef<Element>` IDs are stable within a snapshot; monotonically-incremented `seq` prevents stale IDs resolving to the wrong node.

## Public API / entry points

**Content-script entrypoint:** `src/entrypoints/content.tsx` — WXT `defineContentScript`, matches `<all_urls>`, `runAt: 'document_idle'`, `cssInjectionMode: 'ui'`. Calls `refresh()` on load and on debounced mutations; mounts `<App />` into the shadow root.

**In-page panel/FAB:** `src/ui/Widget.tsx` — the FAB (Microscope icon, danger badge when `blockedCount > 0`) toggles a fixed `<section>` rendering `<Panel />`. `src/ui/Panel.tsx` is the read-only four-tab panel. `src/ui/App.tsx` wires the store's `subscribe` hook to React state.

**Store API** (`src/lib/page-diagnostics.ts`, used only within the content script's world):

- `refresh(opts)` — rebuild snapshot, log to console, notify subscriber
- `refreshNow()` — re-run the last `refresh` (panel's manual refresh button)
- `getCurrent()` — return the current `PageDiagnostics`
- `subscribe(cb | null)` — register/deregister the single panel subscriber
- `highlightNode(id, gutterRem?)` — flash the DOM element behind a snapshot id

## Layout

```
apps/diagnostics/
  src/
    entrypoints/content.tsx   # sole WXT entrypoint
    lib/
      page-diagnostics.ts     # snapshot builder, store, highlight logic
      fixture-snippet.ts      # "copy as test fixture" formatter
      language-name.ts        # code → display name helper
      *.test.ts               # Vitest unit tests
    ui/
      App.tsx                 # store → React bridge
      Widget.tsx              # FAB + panel shell
      Panel.tsx               # four-tab read-only panel
      Widget.test.tsx
    types.ts                  # DiagCard, DiagPicker, PageDiagnostics, …
    styles/globals.css        # Tailwind CSS v4 (injected into shadow root)
    public/icon/{16,32,48,128}.png
  e2e-harness/                # standalone visual-test harness (NOT in the shipped extension)
    index.html               # file://-loadable shell (built to dist/harness/)
    main.tsx                 # renders the real <Widget> with the fixture
    fixture.ts               # hand-pinned PageDiagnostics populating all four tabs
    harness.css              # mirrors globals.css + light-DOM base (@source the ui/)
  wxt.config.ts               # MV3-forced, manifest name + Firefox gecko id
  vite.harness.config.ts      # standalone Vite build for e2e-harness/ (esbuild JSX, base './')
  tsconfig.json               # @movar/* path mappings (no @product alias); includes e2e-harness
  vitest.config.ts            # WxtVitest plugin, jsdom environment
  project.json                # nx targets: dev, build, build:harness, typecheck, lint, test
  package.json                # private:true, @movar/* workspace deps
```

## Dependencies

| Dep                    | Why                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@movar/lang-detect`   | `classifyBySnippet`, `francOracle`, `classifyDivergence`, `getProfiles` — the detection engine being calibrated |
| `@movar/page-content`  | `buildModelForHost` + Google/YouTube extractors — identical card extraction as the product                      |
| `@movar/lang-pickers`  | `findLanguagePickers`, `buildPickerModel`, `detectPickerActiveLanguage` — picker model as the product uses it   |
| `@movar/page-mode`     | `detectPageMode` + individual signal functions — page-mode tab shows the full signal chain                      |
| `@movar/page-language` | `detectPageLanguageFromModel` + individual signal functions — page-language tab shows the sync redirect chain   |
| `@movar/settings`      | `defaultSettings` — seeds `candidates`/`blocked` to mirror the product's default config                         |
| `react` / `react-dom`  | Panel UI                                                                                                        |
| `lucide-react`         | Icons (Microscope FAB, RefreshCw, Crosshair, etc.) — repo-wide icon library                                     |
| `tailwindcss` v4       | Styling, scoped into the shadow root via `cssInjectionMode: 'ui'`                                               |
| `wxt`                  | Extension build + `createShadowRootUi`, `defineContentScript`                                                   |

## Working on it

```bash
# Dev (live reload, Chrome by default)
pnpm --filter @movar/diagnostics dev
# or
pnpm dev:firefox          # from apps/diagnostics

# Build all three targets
pnpm --filter @movar/diagnostics build
# Outputs: .output/chrome-mv3/, .output/firefox-mv3/, .output/safari-mv3/

# Individual targets
pnpm build:chrome / build:firefox / build:safari

# nx equivalents (from repo root)
nx run diagnostics:build
nx run diagnostics:build:harness   # standalone e2e visual harness → dist/harness/
nx run diagnostics:typecheck
nx run diagnostics:lint
nx run diagnostics:test

# Standard per-app commands (from apps/diagnostics)
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint .
pnpm test         # vitest run
```

Load unpacked in Chrome: `chrome://extensions` → Load unpacked → `.output/chrome-mv3`
Load in Firefox: `about:debugging` → Load Temporary Add-on → `.output/firefox-mv3/manifest.json`
Safari: requires `xcrun safari-web-extension-converter .output/safari-mv3` (same manual step as the product).

Tests run in jsdom via `WxtVitest` — component tests (`Widget.test.tsx`, `page-diagnostics.test.ts`, `fixture-snippet.test.ts`). Appearance parity is covered by `@movar/e2e`'s `diagnostics.visual.spec.ts`, which loads the `dist/harness/` bundle (`nx run diagnostics:build:harness`) from `file://` and pixel-compares the FAB + all four panel tabs in light/dark; there is no automated test in a real injected-content-script context (that path is covered by a manual smoke step).

## Gotchas

- **Firefox add-on id `diagnostics@movar.fyi` is for local stability only** — it is never submitted to AMO. The `browser_specific_settings.gecko` block in `wxt.config.ts` keeps the same extension id across temporary-install reloads.
- **MV3 forced on all browsers** (`manifestVersion: 3` in `wxt.config.ts`). WXT would default Firefox to MV2 otherwise.
- **`@product` alias is gone.** The ADR (`docs/diagnostics-devtools-panel.md`) describes it as the interim approach; it was removed once the models became packages. If you see a reference to `@product/*` it is stale.
- **Highlight overlay lives in the light DOM**, not the shadow root — `flashElement` appends a `div[data-movar-highlight]` to `document.body` so it can use absolute coordinates against `getBoundingClientRect()`. The shadow root only holds the FAB and panel.
- **One subscriber at a time.** `page-diagnostics.ts` holds a single `subscriber` slot. `App.tsx` registers/deregisters via `useEffect`. Do not add a second consumer without converting the store to a set.
- **`nx` does not see the cross-package dep graph correctly** for this app (tsconfig `paths` are not nx-native edges). `nx run diagnostics:build` works but nx's cache graph is slightly inaccurate — acceptable for a never-released tool.
- **Excluded from release.** `release.yml` builds only `@movar/extension`. This app has no `zip`/publish target, no store assets, and no i18n (English-only UI).
