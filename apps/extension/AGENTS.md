# Movar Extension — `@movar/extension`

> The published MV3 browser extension (Chrome, Firefox, Safari) that enforces
> the user's language preference — asking sites to serve Ukrainian/English AND
> atomically concealing Russian content cards and Russian entries in on-site
> language pickers.

## What it does

The extension runs a **two-layer pipeline** on every page:

1. **Redirect layer** (`applyStrategy` in `src/lib/strategy.ts`) — attempts to
   switch the site to the user's priority language using one or more strategies
   sourced from `@movar/rules`: `Accept-Language` header rewrite (via
   `declarativeNetRequest`), cookie mutation, `localStorage` write, search-param
   swap, or hreflang redirect. If any strategy causes a navigation the pipeline
   stops — layer 2 does not run after a redirect.

2. **Content-filter layer** — runs atomically only when layer 1 does not
   navigate. It has two sub-passes that execute back-to-back:
   - `applyContentFilter` (`src/lib/content-conceal.ts`) — scans the page
     through a host-specific `PageContentModel` (from `@movar/page-content`)
     and conceals Russian-language content cards with a blur curtain or
     `display:none` replacement.
   - `filterPickers` (`src/lib/picker-filter.ts`) — finds on-site language
     pickers (via `@movar/lang-pickers`) and hides their Russian/blocked-
     language entries, replacing removed text with a tooltip.

The background service worker (`src/entrypoints/background.ts`) owns the
persistent `declarativeNetRequest` rule lifecycle, pause/resume (via
`browser.alarms`), and settings initialisation. It never runs page-side logic.

## Boundaries & invariants

- All `@movar/*` **model packages** stay pure (no DOM writes, no overlays, no
  i18n). Everything that touches the DOM or injects UI lives in this package:
  `curtain.ts`, `tooltip.ts`, `content-conceal.ts`, `picker-filter.ts`, and
  the `i18n/` catalogue.
- The content-filter verdict is **never** fed back into the redirect layer.
  Layer 1 (`applyStrategy`) reads only `@movar/rules` and current URL state;
  it must not observe what layer 2 hid. See the memory note
  _Two-layer language selection_.
- The package depends on every `@movar/*` workspace package. Their own
  `AGENTS.md` files are the canonical reference for each package's public API:
  - `packages/lang-detect/AGENTS.md`
  - `packages/lang-pickers/AGENTS.md`
  - `packages/page-content/AGENTS.md`
  - `packages/page-language/AGENTS.md`
  - `packages/page-mode/AGENTS.md`
  - `packages/rules/AGENTS.md`
  - `packages/shared/AGENTS.md`
  - `packages/ui/AGENTS.md`

## Public API / entry points

All entry points live under `src/entrypoints/`:

| Entry           | What it does                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content.ts`    | Main content-script orchestrator. Bootstraps settings and locale, runs the two-layer pipeline via `applyOnce`, observes DOM mutations, handles color-scheme changes, and listens for popup→content messages (pause, settings change, "show all").                                                                                                                            |
| `background.ts` | MV3 service worker. Manages the single DNR `Accept-Language` rule (`src/lib/dnr.ts`), timed-pause alarms (`src/lib/pause.ts`), and calls `ensureSettingsInitialised` on install. Must use `type: 'module'` (Chrome ≥ late 2025 rejects SW without it).                                                                                                                       |
| `popup/`        | React 19 popup panel (`App.tsx`, `StatusHeader.tsx`, `PauseControls.tsx`, `ContentToggle.tsx`, `HiddenPanel.tsx`). Mounted via `src/lib/mount-app.tsx`. Reports the page's hidden-content summary and exposes pause/resume controls.                                                                                                                                         |
| `options/`      | React 19 options page (`App.tsx`, `AllowlistSection.tsx`, `BlockedSection.tsx`, `PageContentSection.tsx`, `PrioritySection.tsx`). Mounted via `src/lib/mount-app.tsx`. Exposes full settings editing including per-host allowlist and content-modification toggle. Also contains `report-mailto.ts` — the "report an issue" mailto builder (page URL + version; no backend). |

## Layout

```
src/
  entrypoints/
    background.ts         — service worker
    content.ts            — content-script orchestrator
    popup/                — React popup (App, StatusHeader, PauseControls, …)
    options/              — React options page (App, AllowlistSection, …)
  lib/
    content-conceal.ts    — applyContentFilter: card concealment
    picker-filter.ts      — filterPickers: picker-entry concealment
    curtain.ts            — DOM overlay primitive (cover/replace, pill/chip skins)
    tooltip.ts            — inline tooltip overlay for hidden picker entries
    is-touch.ts           — touch-device detection for curtain behaviour
    dom-test-helpers.ts   — test-only DOM utilities
    strategy.ts           — applyStrategy: consumes @movar/rules strategies
    dnr.ts                — declarativeNetRequest Accept-Language rule sync
    settings.ts           — getSettings/setSettings (browser.storage.sync)
    pause.ts              — getPauseState/pause/resume + RESUME_ALARM
    session-choice.ts     — per-host per-tab picker choice (sessionStorage)
    loop-guard.ts         — URL-scoped redirect loop prevention (sessionStorage)
    accept-language.ts    — Accept-Language header string builder
    events.ts             — logCorrection: structured correction-event emitter
    host-match.ts         — hostMatchesAllowlist
    page-text.ts          — sampleVisibleText
    mount-app.tsx         — shared React root mount helper
    error-boundary.tsx    — top-level React error boundary
    test-setup.ts         — global jsdom reset + curtain/tooltip teardown
    i18n/
      content.ts          — setContentLocale / getContentMessages (content script)
      resolve.ts          — resolveLocale (BCP-47 → catalogue key)
      messages-en.ts      — English i18n catalogue
      messages-uk.ts      — Ukrainian i18n catalogue
      index.tsx           — React i18n context + useMessages hook (popup/options)
      display-names.ts    — Language display-name helpers
  components/
    LanguageSelector.tsx  — shared React language-selector primitive
  test/
    browser-mock.ts       — WebExtension API mock (shared by Storybook + preview shim)
  styles/
    globals.css           — Tailwind v4 global styles
preview/
  preview-shim-entry.ts   — thin entry that calls installBrowserMock for static preview
  README.md
.storybook/
  main.ts
  preview.tsx / preview.css
  decorators/             — with-browser-mock.tsx and others
scripts/
  generate-icons.mts
  capture-storybook-assets.mts
  build-safari-app.mts
  sync-safari-resources.mts
  watch-safari-build.mts
store-assets/             — browser store screenshots, copy, storyboards
```

## Dependencies

| Dep                               | Role                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `@movar/lang-detect`              | Language detection + BCP-47 normalization used in content filter and strategy      |
| `@movar/rules`                    | Site strategy data (`getRuleForHost`, `LangStrategy`) consumed by `strategy.ts`    |
| `@movar/lang-pickers`             | Classify, extract, redirect, and build models for on-site language pickers         |
| `@movar/page-content`             | Host-specific content-node models (registry + Google + YouTube plug-ins)           |
| `@movar/page-language`            | Detects the language the page is actually serving                                  |
| `@movar/page-mode`                | Detects page mode (light/dark, page type) and drives `watchPageMode`               |
| `@movar/shared`                   | Cross-package types, `MovarSettings`, `defaultSettings`                            |
| `@movar/ui`                       | React UI primitives shared with popup/options                                      |
| `wxt` `@wxt-dev/module-react`     | Build system; auto-generates manifest, bundles entrypoints, drives `web-ext`       |
| `react` `react-dom`               | Popup and options UIs (v19)                                                        |
| `lucide-react` `lucide`           | Icons in React components (popup/options) and content-script overlays respectively |
| `tailwindcss` `@tailwindcss/vite` | Utility CSS (v4, Vite plugin) for popup, options, Storybook                        |

## Working on it

### Dev commands (run from `apps/extension/` or via `nx run extension:<target>`)

```bash
pnpm dev                      # Chrome dev mode (hot reload, ephemeral profile)
pnpm dev:chrome:installed     # Chrome with persistent profile (MOVAR_CHROMIUM_PERSIST=1)
pnpm dev:firefox              # Firefox dev mode
pnpm dev:firefox:installed    # Firefox with persistent .firefox-profile/
pnpm dev:safari               # Safari — watches and rebuilds via scripts/watch-safari-build.mts
```

### Build

```bash
pnpm build                    # all three browsers + Safari sync
pnpm build:chrome             # wxt build (Chromium MV3)
pnpm build:firefox            # wxt build -b firefox
pnpm build:safari             # wxt build -b safari + sync-safari-resources.mts
pnpm build:safari:app         # full Xcode app build via scripts/build-safari-app.mts
pnpm zip / pnpm zip:firefox   # produce store-ready zip (refuses if MOVAR_PREVIEW=1)
```

### Static preview (no real browser APIs)

```bash
pnpm preview:popup            # MOVAR_PREVIEW=1 build → serve popup on :4322
pnpm preview:options          # MOVAR_PREVIEW=1 build → serve options on :4323
# Navigate to http://localhost:4322/popup (not /popup.html — serve strips it)
# Add ?locale=uk to exercise the Ukrainian catalogue
```

The preview shim (`preview/preview-shim-entry.ts`) is bundled by `wxt.config.ts`
and inlined into `popup.html`/`options.html` only when `MOVAR_PREVIEW=1`. It
shares the same `src/test/browser-mock.ts` implementation as Storybook.
**Never zip a preview build** — the config hook enforces this.

### Storybook

```bash
pnpm storybook                # dev server on :6008
pnpm build-storybook          # static build → storybook-static/
pnpm capture:storybook-assets # Playwright screenshot pipeline for store assets
```

### Other

```bash
pnpm icons                    # regenerate icon PNGs via scripts/generate-icons.mts
pnpm typecheck                # tsc --noEmit (strict, verbatimModuleSyntax)
pnpm lint                     # ESLint 9 via @movar/eslint-config
pnpm test                     # Vitest 4 + WxtVitest plugin, jsdom environment
```

### Tests

`vitest.config.ts` uses `WxtVitest()` (which shims `wxt/browser` and
`wxt/utils/*` imports) and `environment: 'jsdom'`. Setup file is
`src/lib/test-setup.ts`: resets `document.body/head`, removes `<html lang>`,
and tears down any curtain/tooltip nodes after each test.

## Gotchas

**Release ritual** — do NOT use `changeset version` (changesets target the
workspace root, not this package). The correct ritual:

1. Hand-bump `"version"` in `apps/extension/package.json`.
2. `git tag extension-vX.Y.Z` — the tag must match the version exactly.
3. Push the tag; publishing the GitHub Release auto-submits to AMO + Chrome
   Web Store + Edge Add-ons.

**Preview vs. real browser** — `preview:*` is fast but has no real storage, no
background SW, and no content script. Use `dev:firefox:installed` (or
`dev:chrome:installed`) for anything that requires real persistence, DNR rules,
or inter-component messaging.

**`background.ts` must declare `type: 'module'`** — WXT ≤ 0.20.26 does not
auto-emit `"type": "module"` in the MV3 manifest's background entry. Without
it Chrome (late 2025+) rejects the service worker. The `wxt.config.ts`
`build:done` hook calls `assertBackgroundModuleType()` to fail fast if it goes
missing.

**Content script wiring** — `content.ts` side-effects `@movar/page-content/google`
and `@movar/page-content/youtube` via bare imports to register host plug-ins
into the `@movar/page-content/registry` before calling `buildModelForHost`. The
import order matters; adding a new host module requires a matching bare import.

**Observability is stripped from the published extension** — diagnostics/shadow-
oracle code must never ship inside this package even as a local-off-by-default
flag. Put it in the separate dev-only extension instead (see
`project_observability_separate_dev_extension` memory note).
