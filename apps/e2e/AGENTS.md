# End-to-end test suite — `@movar/e2e`

> Playwright e2e suites that assert the built Movar MV3 extension's real browser behavior — popup, options page, content-script DOM mutations, and live-site four-part contract verification.

## What it does

Loads the WXT-built Chrome extension into a real Chromium persistent context (the only Playwright path that works with MV3) and drives it through three tiers of assertion:

1. **Offline/CI** — deterministic specs under `src/offline/` using `page.route()` HTML fixtures; no live network; gated on every PR.
2. **Live** — `src/live/sites.spec.ts` drives real sites (Google, Bing, DuckDuckGo, YouTube, electrica.shop.ua, uamade.com, 001.com.ua) verifying the four-part contract: opens in Russian → Movar recognises it → switches language → hides blocked content/picker entries.
3. **Compare** — `src/live/compare/runner.spec.ts` runs paired baseline (no Movar) vs treatment (Movar loaded) against real Google Search queries; manual/nightly only.

## Boundaries & invariants

- **No live network in CI.** The offline suite (`playwright.config.ts`) routes all navigations through `context.route()` against fixtures in `src/fixtures/html/`. Live and compare suites are strictly manual.
- **Extension must be pre-built.** All Nx targets declare `dependsOn: [{ projects: ['extension'], target: 'build' }]`; the extension is loaded from `apps/extension/.output/chrome-mv3`.
- **`launchPersistentContext` only.** `chromium.launch()` does not load MV3 extensions. When headless, the fixture forces `channel: 'chromium'` to get the full Chromium binary (not `chromium-headless-shell`, which strips extension support).
- **Per-test storage isolation.** The `serviceWorker` fixture clears `chrome.storage.sync` and `chrome.storage.local` before each test and re-seeds from `E2E_SETTINGS` (default settings with `contentModification: true`).
- **No retries in offline or live suites.** Offline failures mean the surface changed; live failures usually mean a rule needs updating. The compare suite retries twice (for CAPTCHA/transient anti-bot noise).
- **e2e is excluded from `pnpm test`.** Root `pnpm test` runs `nx run-many -t test --exclude=e2e`; e2e has its own explicit commands.

## Public API / entry points

| Spec file                                  | What it covers                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/offline/popup.spec.ts`                | Popup structural render — manifest version shape, top-level landmarks, English copy in default state                                                                                                                                                                                                                          |
| `src/offline/popup.visual.spec.ts`         | Pixel baselines for popup states (default, off, paused-indefinite, content-toggle-off, with-corrections) across en/uk × light/dark                                                                                                                                                                                            |
| `src/offline/popup.behavior.spec.ts`       | Click→storage round-trips: enabled toggle, pause buttons, content-modification checkbox, UI language follows `settings.priority`                                                                                                                                                                                              |
| `src/offline/options.spec.ts`              | Options page structural render — locked-Russian signals, section landmarks                                                                                                                                                                                                                                                    |
| `src/offline/options.visual.spec.ts`       | Pixel baselines for options states (default, populated allowlist, three-lang priority) across en/uk × light/dark                                                                                                                                                                                                              |
| `src/offline/options.behavior.spec.ts`     | Click→storage round-trips: allowlist add/remove (keyboard + click), validation errors, priority reorder (move-up/down/remove)                                                                                                                                                                                                 |
| `src/offline/content-script.spec.ts`       | Content-script DOM mutations against `page.route()` fixtures: `data-movar-hidden` on picker anchors, `data-movar-curtain` on YouTube RU cards, clean-UK page receives zero modifications, bare-text picker triggers hreflang redirect, `settings.contentModification: false` disables filter, allowlisted domains are skipped |
| `src/offline/russian-browser-lang.spec.ts` | Invariants when Chromium is launched with `--lang=ru-RU`: DNR rule contains no `ru` value, `settings.priority` excludes Russian, options page shows locked-Russian signals, popup falls back to English (not Ukrainian)                                                                                                       |
| `src/live/sites.spec.ts`                   | Four-part contract for each site in `SITES`: (1) baseline opens in Russian, (2) Movar logs a CorrectionEvent, (3) page switches to Ukrainian URL/lang, (4) Russian picker entries/content cards are hidden or curtained                                                                                                       |
| `src/live/compare/runner.spec.ts`          | Paired baseline vs treatment measurement on real Google Search — proves Russian content appears without Movar and is absent with it                                                                                                                                                                                           |

## Layout

```
apps/e2e/
  playwright.config.ts          # offline CI config (testDir: src/offline)
  playwright.live.config.ts     # live manual config (testDir: src/live, testMatch: sites.spec.ts)
  playwright.compare.config.ts  # compare manual config (testDir: src/live/compare)
  playwright.live.base.ts       # shared use block for live + compare (headless: false, timeouts)
  playwright.demo.config.ts     # demo-recording config (RUN_DEMO=1, video: on)
  src/
    fixtures/
      extension.ts              # load-bearing fixture: launchPersistentContext, serviceWorker,
                                #   extensionId, movarPage, cleanPage, getCorrections,
                                #   setMovarSettings, readMovarSettings, browserUiLanguage option
      content-mock.ts           # mockSite() helper: page.route() + hit counter
      lang-detect.ts            # readPageLanguage(): htmlLang + @movar/lang-detect body score
      movar-state.ts            # readMovarDomState(), waitForMovarSettled()
      popup.ts                  # openPopup(), seedPause()
      options.ts                # openOptions()
      html/                     # 7 static HTML fixtures for offline specs
        clean-uk.html           # Ukrainian-only page (negative case)
        cs-cart-ru.html         # CS-Cart shop with Russian picker anchor
        picker-bare-text.html   # bare-text picker with hreflang annotation
        picker-bare-text-trim.html  # bare-text picker without hreflang (trimOrphanSeparators)
        picker-button-ru.html   # button-style language picker
        picker-select-ru.html   # <select>-style language picker
        youtube-cards-ru.html   # YouTube search results with Russian video cards
    offline/                    # 8 CI-gated deterministic specs + PNG baselines
    live/
      sites/                    # 7 site fixture modules + index.ts + types.ts
      sites.spec.ts             # live four-part contract runner
      compare/                  # runner.spec.ts + scenarios.ts + measure/ helpers
    demo/                       # Playwright-driven demo video recording pipeline
```

## Dependencies

| Package              | Why                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@playwright/test`   | Test runner, assertions, browser launch, `page.route()` interception                                                                                         |
| `@movar/settings`    | `defaultSettings`, `MovarSettings` — same shapes the extension uses in `chrome.storage`                                                                      |
| `@movar/events`      | `CorrectionEvent` type — same shape the extension persists in `chrome.storage`                                                                               |
| `@movar/lang-detect` | `readPageLanguage` fixture calls the same language-detection logic the extension uses (and provides `LanguageCode`), so live tests verify the real algorithm |
| `@types/chrome`      | Type-checks `chrome.storage.*` / `chrome.runtime.*` calls inside `serviceWorker.evaluate()`                                                                  |

## Working on it

**Offline (CI — deterministic, no network):**

```
nx run e2e:test             # headless, all offline specs
nx run e2e:test:fast        # popup.spec.ts popup.behavior.spec.ts options.spec.ts options.behavior.spec.ts only
nx run e2e:test:fg          # headed (same specs)
nx run e2e:test:ui          # Playwright UI mode
nx run e2e:test:update      # regenerate visual baselines
```

From repo root: `pnpm test:e2e:fast` maps to `nx run e2e:test:fast`.

**Live (manual — real network, headed):**

```
nx run e2e:test:live          # headless: false, sites.spec.ts only
nx run e2e:test:live:headed   # explicit --headed flag (same effect)
```

From repo root: `pnpm test:e2e:live` / `pnpm test:e2e:live:headed`.

**Compare (manual/nightly):**

```
pnpm --filter @movar/e2e test:compare         # runner.spec.ts, retries: 2
pnpm --filter @movar/e2e test:compare:headed
```

**How the extension is loaded:** `src/fixtures/extension.ts` calls `chromium.launchPersistentContext('', { args: ['--load-extension=<path>', '--disable-extensions-except=<path>'] })`. The path resolves to `apps/extension/.output/chrome-mv3` relative to the fixture file.

**Fixtures/saved pages:** 7 static HTML files under `src/fixtures/html/`. No saved SERPs — live tests navigate real URLs. Visual baselines (PNG) live alongside each `*.visual.spec.ts` under `src/offline/*-snapshots/`, with per-platform variants (`darwin` / `linux`) for both light and dark modes.

## Gotchas

- **YouTube content-script test must route the real `youtube.com` domain.** The content-filter host check in the extension is an exact match on `youtube.com` / `*.youtube.com`. Routing a fake hostname silently skips the filter and the test passes for the wrong reason.
- **`mockSite()` hit counter must be asserted.** Every `content-script.spec.ts` test asserts `hits >= 1` after navigation to catch URL-pattern typos that leave the page on a 404 (the content script correctly does nothing, making an incorrect "no modifications" assertion appear to pass).
- **Visual baselines are platform-specific.** `darwin` and `linux` PNG snapshots are stored separately due to Chromium anti-aliasing variance. `maxDiffPixelRatio: 0.005` (0.5%) absorbs residual variance; use `nx run e2e:test:update` on the target platform to regenerate.
- **Extension ID is not pinned.** The `extensionId` fixture parses the ID from the live service-worker URL at runtime; it changes on every `launchPersistentContext` call.
- **`browserUiLanguage` is a worker-scoped option.** Set via `test.use({ browserUiLanguage: 'ru-RU' })` at file scope in `russian-browser-lang.spec.ts`; defaults to `en-US` everywhere else so existing English-locale baselines remain stable.
- **Live tests skip when baseline is not Russian.** Tests 2 and 3 of `sites.spec.ts` call `test.skip()` if the clean-context baseline did not detect Russian — this means Movar's redirect path cannot be exercised from the current network environment (e.g. a UA-geolocated IP already receiving Ukrainian content), not a Movar regression.
