# Page Mode — `@movar/page-mode`

> Detects whether a page is rendering light or dark, watches for live switches, and applies a matching color scheme to Movar's injected overlays.

## What it does

Sites use a dozen different conventions to signal their color scheme (data attributes, CSS classes, meta tags, computed backgrounds, OS preference). This package provides a four-tier detection chain that resolves to a `PageMode` (`'light' | 'dark'`) for any document, always non-null. It also watches both the DOM and the OS `prefers-color-scheme` media query for mid-session flips, maintains a per-tab singleton holding the live scheme, and exposes DOM sweep helpers that re-theme or detach all overlay host elements when the mode changes. The extension content script consumes it at bootstrap; the diagnostics app uses it for standalone detection.

## Boundaries & invariants

- **No `@movar/*` runtime deps.** This is a pure leaf; `devDependencies` contains only `@movar/eslint-config` (tooling). It must never import from `../page-content`, `../lang-detect`, `../shared`, etc.
- **No overlays, no i18n, no settings.** `apply.ts` writes a DOM attribute (`data-movar-color-scheme`) onto existing host elements — it does not create curtains or tooltips. Those live in `apps/extension`.
- **No side effects at import time** except the `context.ts` module-level `let` initialised to `'light'`. The registry array starts empty.
- Related pure-model siblings: [`../page-content/AGENTS.md`](../page-content/AGENTS.md), [`../lang-detect/AGENTS.md`](../lang-detect/AGENTS.md).

## Public API / entry points

All exports surface through `src/index.ts` (the `.` export):

- `PageMode` — `'light' | 'dark'` string union type
- `PageModeDetector` — interface for host-specific detector strategy (`id`, `matches(host)`, `detect(doc, win)`)
- `modeFromColorSchemeAttr(doc)` — Tier 1: explicit theme attribute/class/bare-dark on `<html>`/`<body>`
- `modeFromColorSchemeMeta(doc, win)` — Tier 2: `<meta name="color-scheme">` or computed CSS `color-scheme`
- `modeFromComputedBackground(doc, win)` — Tier 3: WCAG luminance of painted `<body>`/`<html>` background
- `modeFromPrefersColorScheme(win)` — Tier 4: OS `prefers-color-scheme` media query (always non-null)
- `detectPageMode(doc?, win?)` — runs the full four-tier chain; always returns `PageMode`
- `watchPageMode(detect, onChange, doc?, win?)` — MutationObserver + matchMedia watcher; returns a stop function (idempotent)
- `registerModeDetector(detector)` / `lookupModeDetector(host)` / `detectModeForHost(host, doc?, win?)` / `clearModeDetectorsForTesting()` — per-host registry
- `getCurrentColorScheme()` / `setCurrentColorScheme(next)` / `resetColorSchemeForTesting()` — module singleton (default `'light'`)
- `COLOR_SCHEME_ATTR` — the string `'data-movar-color-scheme'` written on overlay host elements
- `applyColorSchemeToAll(root, hostSelector, colorScheme)` — sets `COLOR_SCHEME_ATTR` on every matching host under `root`
- `detachAllBySelector(root, hostSelector, handleKey)` — invokes `handle.detach()` on every matched host

Deep subpath imports (`@movar/page-mode/context`, `/detect`, `/apply`, etc.) are supported via the `"./*": "./src/*.ts"` exports map.

## Layout

| File                   | Contents                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/types.ts`         | `PageMode` union; `PageModeDetector` interface                                                                                                      |
| `src/detect.ts`        | Four-tier chain: `modeFromColorSchemeAttr`, `modeFromColorSchemeMeta`, `modeFromComputedBackground`, `modeFromPrefersColorScheme`, `detectPageMode` |
| `src/observer.ts`      | `watchPageMode` — MutationObserver on `<html>`/`<body>` + `matchMedia` change listener                                                              |
| `src/registry.ts`      | Per-host detector registry; `detectModeForHost` delegates to generic chain on miss or null-defer                                                    |
| `src/context.ts`       | Module singleton `currentColorScheme`; default `'light'`; set once at bootstrap, re-set on live flips                                               |
| `src/apply.ts`         | `COLOR_SCHEME_ATTR` constant; `applyColorSchemeToAll`; `detachAllBySelector`                                                                        |
| `src/index.ts`         | Barrel re-exporting everything above                                                                                                                |
| `src/test-setup.ts`    | `beforeEach` clears `body.innerHTML`, `head.innerHTML`, and `<html lang>`                                                                           |
| `src/detect.test.ts`   | Per-tier and chain-priority tests; uses `fakeWin` helper                                                                                            |
| `src/observer.test.ts` | `watchPageMode` tests; uses controllable MQL + `flush()` microtask helper                                                                           |
| `src/registry.test.ts` | Registry lookup, first-match, null-defer, and `clearModeDetectorsForTesting`                                                                        |
| `src/context.test.ts`  | Singleton default, set/get, reset                                                                                                                   |

## Dependencies

| Dep                          | Why                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `jsdom ^29` (dev)            | Test environment — provides `document`/`window` for jsdom Vitest environment |
| `vitest ^4` (dev)            | Test runner                                                                  |
| `@movar/eslint-config` (dev) | Shared ESLint flat config                                                    |

No runtime dependencies.

## Working on it

```sh
# From packages/page-mode
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run

# Or via nx (cached)
nx run page-mode:test
```

- Test environment: **jsdom** (`vitest.config.ts` `environment: 'jsdom'`, `globals: false`)
- Setup file: `src/test-setup.ts` — runs `beforeEach` to reset `body`/`head`/`<html lang>` between tests
- Tests import functions directly from their module file, not from the barrel

## Gotchas

- **Tier 3 is not watched.** `watchPageMode` observes attribute mutations and `matchMedia`; a CSS-only theme switch (background colour only, no attribute) won't be caught mid-session. This is intentional — such sites don't ship live switchers in practice.
- **`context.ts` is module-level mutable state.** Tests must call `resetColorSchemeForTesting()` in `afterEach` or state leaks across cases (default `'light'` is restored).
- **Registry is also mutable module state.** Tests must call `clearModeDetectorsForTesting()` in `afterEach`. Currently zero detectors are registered in production.
- **`detect.ts` has `fallow-ignore-next-line complexity` comments** on several functions — these suppress the custom `fallow` complexity linter. Do not remove them without adjusting the functions.
- **`watchPageMode` coalesces** synchronous multi-attribute writes into one callback tick via MutationObserver batching; tests use a `flush()` (`setTimeout(resolve, 0)`) helper to let the microtask queue drain.
- Key test files: `src/detect.test.ts` (chain priority), `src/observer.test.ts` (stop idempotency, coalescing, MQL wiring).
