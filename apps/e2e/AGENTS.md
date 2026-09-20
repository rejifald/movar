# End-to-end test suite — `@movar/e2e`

> Playwright e2e suites that assert the built Movar MV3 extension's real browser behavior — popup, options page, content-script DOM mutations, and live-site four-part contract verification — plus appearance-parity visual baselines for the Safari host app, the diagnostics panel, and the Astro marketing site.

## What it does

Loads the WXT-built Chrome extension into a real Chromium persistent context (the only Playwright path that works with MV3) and drives it through three tiers of assertion:

1. **Offline/CI** — deterministic specs under `src/offline/` using `page.route()` HTML fixtures; no live network; gated on every PR.
2. **Live** — `src/live/sites.spec.ts` drives real sites (Google, Bing, DuckDuckGo, YouTube, electrica.shop.ua, uamade.com, 001.com.ua) verifying the four-part contract: opens in Russian → Movar recognises it → switches language → hides blocked content/picker entries.
3. **Compare** — `src/live/compare/runner.spec.ts` runs paired baseline (no Movar) vs treatment (Movar loaded) against real Google Search queries; manual/nightly only.

## Boundaries & invariants

- **No live network in CI.** The offline suite (`playwright.config.ts`) routes all navigations through `context.route()` against fixtures in `src/fixtures/html/`. Live and compare suites are strictly manual.
- **Built artifacts must be pre-built.** The offline `test`/`test:update` targets declare `dependsOn` on `extension:build:e2e` (loaded from `apps/extension/.output/chrome-mv3`), `safari-host-app:build` (the host bundle the visual suite loads from `file://`), and `diagnostics:build:harness` (the diagnostics panel harness). `test:marketing[:update]` depends on `marketing:build` (its `astro preview` webServer serves `dist/`).
- **`launchPersistentContext` only.** `chromium.launch()` does not load MV3 extensions. When headless, the fixture forces `channel: 'chromium'` to get the full Chromium binary (not `chromium-headless-shell`, which strips extension support).
- **Per-test storage isolation.** The `serviceWorker` fixture clears `chrome.storage.sync` and `chrome.storage.local` before each test and re-seeds from `E2E_SETTINGS` (default settings with `contentModification: true`).
- **No retries in offline or live suites.** Offline failures mean the surface changed; live failures usually mean a rule needs updating. The compare suite retries twice (for CAPTCHA/transient anti-bot noise).
- **e2e is excluded from `pnpm test`.** Root `pnpm test` runs `nx run-many -t test --exclude=e2e`; e2e has its own explicit commands.

## Public API / entry points

| Spec file                                               | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/offline/popup.spec.ts`                             | Popup structural render — manifest version shape, top-level landmarks, English copy in default state                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/offline/popup.visual.spec.ts`                      | Pixel baselines for popup states: `default` in en + uk, plus `off` / `paused-indefinite` / `content-toggle-off` in en — × light/dark (10 baselines). `paused-timed` is asserted as text, not pixels: its date is non-deterministic                                                                                                                                                                                                                                                                         |
| `src/offline/popup.behavior.spec.ts`                    | Click→storage round-trips: enabled toggle, pause buttons, content-modification checkbox, UI language follows `settings.priority`                                                                                                                                                                                                                                                                                                                                                                           |
| `src/offline/popup-crash.visual.spec.ts`                | Pixel baselines for the popup's two crash surfaces — the real `PopupCrashFallback` card and the minimal backstop panel its inner ErrorBoundary drops to — forced via the `?__e2eCrash=` probe that only exists in the MOVAR_E2E build, × en/uk × light/dark (8 baselines)                                                                                                                                                                                                                                  |
| `src/offline/options.spec.ts`                           | Options page structural render — visible section landmarks and deferred blocked/exempt editors absent                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/offline/options.visual.spec.ts`                    | Pixel baselines for options states: `default` in en + uk, plus `priority-three-langs` in en — × light/dark (6 baselines)                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/offline/options.behavior.spec.ts`                  | Click→storage round-trips: priority reorder (move-up/down/remove)                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/offline/onboarding.visual.spec.ts`                 | Pixel baselines for the first-run onboarding page, en/uk × light/dark (4 baselines). Locale resolves from `settings.priority`, not `settings.uiLanguage`; the access-step permission states and the Firefox/Safari flow variants are deliberately not covered (the e2e build always resolves to the Chromium flow)                                                                                                                                                                                         |
| `src/offline/content-script.spec.ts`                    | Content-script DOM mutations against `page.route()` fixtures: `data-movar-hidden` on picker anchors, `data-movar-curtain` on YouTube RU cards, clean-UK page receives zero modifications, bare-text picker triggers hreflang redirect, `settings.contentModification: false` disables filter, allowlisted domains are skipped                                                                                                                                                                              |
| `src/offline/conceal-chunk-loading.spec.ts`             | Live-browser counterpart to the static import-graph guard: proves the capability loader's lazy-split boundary by its DOM consequence — `concealMode: 'curtain'` mounts a curtain host (so `features/curtain-ui.js` loaded), `'hide'` mounts none (so it did not). Asserted through the rendered effect because Playwright cannot observe `chrome-extension://` imports                                                                                                                                     |
| `src/offline/google-declared-conceal.spec.ts`           | Roster scope of a Google language declaration: on an `hl=uk` SERP the extractor hands the filter a `declaredLang` for every non-Ukrainian card, and only the roster clause in `decideFused` stops English/Polish/etc. being curtained on Google's say-so. Priority is narrowed to `['uk']` so English is genuinely outside the roster — the shipped `['uk', 'en']` default would pass vacuously                                                                                                            |
| `src/offline/google-search-dnr.spec.ts`                 | Network-side proof of the `/search` DNR rewrite: Chrome's real matcher selects the rule for an omnibox-shaped URL and leaves /maps and q-less URLs alone, a raw entry navigation reaches the network layer already carrying `hl`/`lr` with session tokens stripped, and an already-rewritten URL loads exactly once (no redirect loop)                                                                                                                                                                     |
| `src/offline/curtain.visual.spec.ts`                    | One baseline over the cover curtain’s whole responsive-collapse ladder (full card → horizontal bar → drop secondary action → drop title → eye-only floor), driven by Russian YouTube cards at descending box sizes, × light/dark (2 baselines)                                                                                                                                                                                                                                                             |
| `src/offline/tooltip.visual.spec.ts`                    | Pixel baselines for the survivor tooltip an `inline` picker gets — the surface whose dark skin shipped a real defect the light rendering could not show — × light/dark (2 baselines)                                                                                                                                                                                                                                                                                                                       |
| `src/offline/picker.visual.spec.ts`                     | Pixel baselines for the in-row chip a `list` picker gets (`picker-listbox-ru`), × light/dark (2 baselines). The `inline` layout's survivor tooltip is pinned by `tooltip.visual.spec.ts`; the `native` layout draws nothing on the page and is pinned by `picker-native.behavior.spec.ts`                                                                                                                                                                                                                  |
| `src/offline/picker-listbox.behavior.spec.ts`           | List-shaped picker behaviour (the bigfive-test.com shape): no survivor tooltips at all, the chip stands in the hidden row’s own slot at the row’s measured height, every other row stays hit-testable, hide mode drops the row with no chip, a dropdown that opens with no DOM change still re-floors the chip, a group header is not mistaken for a row, and clicking the chip restores the row                                                                                                           |
| `src/offline/picker-native.behavior.spec.ts`            | Native `<select>` picker: the blocked `<option>` is disabled and relabelled IN PLACE — still in the list (so `options.length`, every `options[i]` index and `selectedIndex` are unchanged), unselectable, neutrally labelled, with `data-movar-hidden` intact so the popup summary still names the language; nothing is added to the page; hide mode removes it outright instead. DOM assertions because there is nothing to photograph — a `<select>`'s popup is drawn by the OS, not the page compositor |
| `src/offline/russian-browser-lang.spec.ts`              | Invariants when Chromium is launched with `--lang=ru-RU`: DNR rule contains no `ru` value, `settings.priority` excludes Russian, options page keeps blocked-language editing hidden, popup follows preferred-language order                                                                                                                                                                                                                                                                                |
| `src/offline/safari-host-app.visual.spec.ts`            | Pixel baselines for the Safari wrapper's React host app (loaded from its `file://` bundle via `fixtures/host.ts`): Detector / Settings / About / Audit tabs on **iOS (390px)** and **macOS (480px)**, with About split into the macOS setup and enabled states — 9 states × en/uk × light/dark (36 baselines)                                                                                                                                                                                              |
| `src/offline/safari-host-app.sticky-nav.visual.spec.ts` | Proves the host app's tab bar is pinned to the viewport rather than flowing after the content: the same fixed tall viewport (`fit: 'viewport'`) over a short state (About, pre-`show()`) and a tall one, where a hugged capture would look correct by construction (2 baselines)                                                                                                                                                                                                                           |
| `src/offline/diagnostics.visual.spec.ts`                | Pixel baselines for the diagnostics dev-extension panel, rendered by the `file://` harness (`fixtures/diagnostics.ts`, harness in `apps/diagnostics/e2e-harness/`): collapsed FAB + all four panel tabs (Content/Pickers/Page-mode/Page-lang) × light/dark (10 baselines)                                                                                                                                                                                                                                  |
| `src/offline/action-icon.visual.spec.ts`                | One baseline over the toolbar/action-icon state catalogue (`@movar/ui`'s `actionIconSvg`): every state (active/blocking/paused/off/exempt/attention) at 96/32/16px on light + dark chrome. `setContent`-only (no extension), Manrope inlined as base64 so the "r" renders deterministically                                                                                                                                                                                                                |
| `src/offline/toolbar-icon.behavior.spec.ts`             | Toolbar icon end-to-end in real Chromium with the built extension: spies the live SW's `chrome.action.setIcon`, scopes every assertion to the tab under test by `tabId` (a late onboarding-tab repaint races a global last-call read), and drives real scenarios — Russian feed (`curtain-tiers-ru`) → `blocking` + count badge (via real per-tab `getBadgeText`), clean page → `active`, disabled → `off`, allowlisted → `exempt`                                                                         |
| `src/marketing/marketing.visual.spec.ts`                | Full-page pixel baselines for the Astro marketing site, served by the `astro preview` webServer in `playwright.marketing.config.ts`: the 14 pages in `src/marketing/pages.ts` (10 bilingual, 4 Ukrainian-only — blog, blog-post, guide, guide-page) plus dedicated header / footer / post-CTA captures, × light/dark (58 baselines). Full-page shots are clipped above the footer so a footer edit does not invalidate every page; locale is pinned per page to defeat `BaseLayout`'s inline redirect      |
| `src/marketing/marketing.a11y-focus.spec.ts`            | Keyboard reachability the visual and contrast suites structurally cannot see: the skip link and the focus ring. Drives real keyboard input against a focused page and asserts on geometry, because `:focus-visible` only matches while the document itself has focus — so a hidden page makes a working skip link and a broken one look identical                                                                                                                                                          |
| `src/marketing/marketing.blog.spec.ts`                  | Ukrainian-only blog behaviour with no pixels: `BaseLayout`'s `navigator.languages` redirect must NOT fire for it (the blog has no English twin, so a re-enabled redirect bounces every English-preferring visitor to a nonexistent URL — and the visual suite pins `uk-UA`, which is exactly the condition that hides this), and the hand-escaped RSS feed must parse as well-formed XML                                                                                                                   |
| `src/marketing/marketing.contrast.spec.ts`              | WCAG AA text-contrast guard over the full visual matrix — every page in `pages.ts` × both locales × both schemes — measuring each rendered text node against the background actually painted behind it. Exists because a screenshot diff only notices _change_: the site was shipping 136 failing dark-mode elements that the visual suite had happily locked into its baselines                                                                                                                           |
| `src/marketing/marketing.guide.spec.ts`                 | Behaviour for the Ukrainian-only settings guide at `/uk/guide`: the same no-redirect assertions as the blog, plus the diagnosis reporting two INDEPENDENT faults (Ukrainian missing/misplaced, Russian present) rather than an ordered first match, and the fix being routed to the surface that owns the language list — driven through overridden `navigator.languages` and five user agents                                                                                                             |
| `src/marketing/marketing.install-cta.spec.ts`           | The install CTA's browser-conditional handoff: on Edge and Safari the click must reach the guide as well as the store. Pins that the two destinations are NOT symmetric — the store rides the link's own `target="_blank"` and the guide is the same-tab navigation — since a swap would still 'open both' on Chromium while silently losing the store tab on Safari                                                                                                                                       |
| `src/live/sites.spec.ts`                                | Four-part contract for each site in `SITES`: (1) baseline opens in Russian, (2) Movar logs a CorrectionEvent, (3) page switches to Ukrainian URL/lang, (4) Russian picker entries/content cards are hidden or curtained                                                                                                                                                                                                                                                                                    |
| `src/live/compare/runner.spec.ts`                       | Paired baseline vs treatment measurement on real Google Search — proves Russian content appears without Movar and is absent with it                                                                                                                                                                                                                                                                                                                                                                        |
| `src/demo/master.spec.ts`                               | Demo-video recording pipeline (manual, never CI): drives DuckDuckGo with a visible cursor follower and records the enforce rule rewriting a Cyrillic search to `kl=ua-uk` before the navigation lands. DuckDuckGo rather than Google because Google CAPTCHAs Playwright contexts reliably                                                                                                                                                                                                                  |

## Layout

```
apps/e2e/
  playwright.config.ts          # offline CI config (testDir: src/offline)
  playwright.marketing.config.ts # marketing CI config (testDir: src/marketing; astro preview webServer)
  playwright.live.config.ts     # live manual config (testDir: src/live, testMatch: sites.spec.ts)
  playwright.compare.config.ts  # compare manual config (testDir: src/live/compare)
  playwright.live.base.ts       # shared use block for live + compare (headless: false, timeouts)
  playwright.demo.config.ts     # demo-recording config (RUN_DEMO=1, video: on)
  playwright.budgets.ts         # E2E_SLOW_HOST time budgets for offline + marketing configs;
                                #   set only by scripts/e2e-baselines.sh (emulated regen)
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
      host.ts                   # Safari host-app fixture: hostContext (plain Chromium, file://),
                                #   openHostApp() (mock webkit bridge, show(), tab, width, colorScheme)
      diagnostics.ts            # diagnostics-harness fixture: diagnosticsContext (plain Chromium,
                                #   file://), openDiagnostics(), diagnosticsFab()/diagnosticsPanel()
      html/                     # static HTML fixtures for offline specs
        clean-uk.html           # Ukrainian-only page (negative case)
        cs-cart-ru.html         # CS-Cart shop with Russian picker anchor
        curtain-tiers-ru.html   # YouTube cards at each responsive curtain tier (visual)
        google-serp-declared-mix.html  # hl=uk SERP, "Перекласти цю сторінку" declared-lang links
        picker-bare-text.html   # bare-text picker with hreflang annotation
        picker-bare-text-trim.html  # bare-text picker without hreflang (trimOrphanSeparators)
        picker-button-ru.html   # button-style language picker
        picker-listbox-ru.html  # ARIA listbox of role="option" rows, rendered OPEN (react-aria)
        picker-listbox-dropdown-uk.html  # same, in a dropdown CLOSED at first filter pass
        picker-listbox-grouped-uk.html   # same, whose first child row is a group header
        picker-select-ru.html   # <select>-style language picker
        picker-select-uk.html   # <select> picker, uk page — in-place option mark (behaviour)
        picker-survivor-uk.html # survivor-tooltip visual baseline (light + dark)
        picker-value-attr-uk.html   # attribute-driven picker on a page already serving uk
        youtube-cards-ru.html   # YouTube search results with Russian video cards
    offline/                    # CI-gated deterministic specs + Linux PNG baselines
                                #   (popup/popup-crash/options/onboarding/curtain/tooltip/
                                #   picker/safari-host-app/safari-host-app.sticky-nav/
                                #   diagnostics/action-icon visuals + structural/behavior)
    marketing/                  # CI-gated marketing-site specs: full-page visual baselines
                                #   (pages.ts is the shared page matrix) + a11y-focus,
                                #   contrast, blog, guide and install-cta behaviour
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
nx run e2e:test                  # headless, all offline specs
nx run e2e:test:fast             # popup.spec.ts popup.behavior.spec.ts options.spec.ts options.behavior.spec.ts only
nx run e2e:test:fg               # headed (same specs)
nx run e2e:test:ui               # Playwright UI mode
nx run e2e:test:update           # regenerate offline visual baselines
nx run e2e:test:marketing        # marketing full-page visual suite (builds site + astro preview)
nx run e2e:test:marketing:update # regenerate marketing baselines
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

**Fixtures/saved pages:** static HTML files under `src/fixtures/html/` (enumerated in the tree above). No saved SERPs — live tests navigate real URLs. Visual baselines (PNG) live alongside each `*.visual.spec.ts` under `src/offline/*-snapshots/` as a single Linux set (`*-linux.png`, light + dark), generated in the pinned Playwright container via `pnpm e2e:baselines`.

## Gotchas

- **YouTube content-script test must route the real `youtube.com` domain.** The content-filter host check in the extension is an exact match on `youtube.com` / `*.youtube.com`. Routing a fake hostname silently skips the filter and the test passes for the wrong reason.
- **`mockSite()` hit counter must be asserted.** Every `content-script.spec.ts` test asserts `hits >= 1` after navigation to catch URL-pattern typos that leave the page on a 404 (the content script correctly does nothing, making an incorrect "no modifications" assertion appear to pass).
- **Visual baselines are Linux-only and container-generated.** A single `*-linux.png` set is committed; regenerate the offline set with `pnpm e2e:baselines` and the marketing set with `pnpm e2e:baselines:marketing` (both Docker — the same pinned Playwright image CI's `e2e-offline` job runs in), never with `nx run e2e:test:*:update` on your host, which bakes your OS's Chromium anti-aliasing into the PNG (a `*-darwin.png` CI never uses). Scope the offline regen to changed specs, e.g. `pnpm e2e:baselines -- safari-host-app.visual.spec.ts diagnostics.visual.spec.ts`, so unrelated popup/options baselines don't churn. `maxDiffPixelRatio: 0.005` (0.5%) absorbs residual variance.
- **Marketing visual specs pin `locale` per page.** `BaseLayout` ships an inline `navigator.languages` redirect (/ ↔ /uk/); each spec sets `test.use({ locale })` to match the page it loads (en-US for root, uk-UA for `/uk/…`) so the load never cross-redirects, and asserts the resulting pathname to catch a redirect that fires anyway.
- **Extension ID is not pinned.** The `extensionId` fixture parses the ID from the live service-worker URL at runtime; it changes on every `launchPersistentContext` call.
- **`browserUiLanguage` is a worker-scoped option.** Set via `test.use({ browserUiLanguage: 'ru-RU' })` at file scope in `russian-browser-lang.spec.ts`; defaults to `en-US` everywhere else so existing English-locale baselines remain stable.
- **Live tests skip when baseline is not Russian.** Tests 2 and 3 of `sites.spec.ts` call `test.skip()` if the clean-context baseline did not detect Russian — this means Movar's redirect path cannot be exercised from the current network environment (e.g. a UA-geolocated IP already receiving Ukrainian content), not a Movar regression.
