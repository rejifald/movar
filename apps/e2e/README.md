# @movar/e2e — end-to-end suites

This package ships two assertion suites and one recording pipeline,
each owning its own subdirectory + Playwright config. The directory
layout makes the side-effect boundary obvious at a glance: deterministic
specs live under `src/offline/`, live-website specs under `src/live/`,
demo recording under `src/demo/`.

| Suite       | Config                      | Tests                    | Network? | When                                   | Run with                             |
| ----------- | --------------------------- | ------------------------ | -------- | -------------------------------------- | ------------------------------------ |
| **default** | `playwright.config.ts`      | `src/offline/*.spec.ts`  | no       | automatic (CI gate, lefthook pre-push) | `pnpm --filter @movar/e2e test`      |
| **live**    | `playwright.live.config.ts` | `src/live/sites.spec.ts` | yes      | manual only                            | `pnpm --filter @movar/e2e test:live` |
| **demo**    | `playwright.demo.config.ts` | `src/demo/*.spec.ts`     | yes      | manual only (records video)            | `pnpm --filter @movar/e2e demo`      |

All three configs load the extension via the shared fixture at
[`src/fixtures/extension.ts`](src/fixtures/extension.ts) and seed
`E2E_SETTINGS` into `chrome.storage.sync` before each test. The shared
fixture pins the browser UI language (default `--lang=en-US`, overridable
per spec via `test.use({ browserUiLanguage })`) and `deviceScaleFactor: 1`
so locale-derived UI and pixel scale are deterministic across runners.

## Default suite (offline, auto)

The CI gate. Covers four spec categories, each addressing a different
surface or shape of failure:

| Category | Specs                                                | What it proves                                                                 |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| popup    | `popup.spec.ts`, `popup.visual.spec.ts`              | popup mounts + renders each distinguishable state pixel-perfect                |
| options  | `options.spec.ts`, `options.visual.spec.ts`          | options page mounts + renders each distinguishable state pixel-perfect         |
| behavior | `popup.behavior.spec.ts`, `options.behavior.spec.ts` | clicks round-trip through `chrome.storage.*` and survive a popup reopen        |
| content  | `content-script.spec.ts`                             | content script reacts to mocked HTML (picker filter, curtain, no-op, redirect) |
| locale   | `russian-browser-lang.spec.ts`                       | locked-Russian invariants hold under `--lang=ru-RU`                            |

Subset runs via Nx targets or `--grep`:

```bash
pnpm --filter @movar/e2e test                   # full default suite (what CI runs)
pnpm --filter @movar/e2e test:popup             # popup specs only (--grep popup)
pnpm --filter @movar/e2e test:fast              # popup+options structural+behavior (what lefthook runs)
pnpm --filter @movar/e2e test -- --grep options # any --grep filter against the default config
pnpm --filter @movar/e2e test:update            # regenerate ALL baselines
```

The whole suite runs in ≈15 s on a warm cache, fully offline. Its config
writes its report to `playwright-report/`.

### Visual state matrix — popup

| State                        | Baseline?      | Axes exercised                              |
| ---------------------------- | -------------- | ------------------------------------------- |
| default-en                   | yes            | active UI in English                        |
| default-uk                   | yes            | i18n catalogue, RU/UK glyph metrics         |
| off                          | yes            | `settings.enabled: false` — pill + message  |
| paused-indefinite-en         | yes            | indefinite pause — "Resume now" CTA         |
| content-toggle-off-en        | yes            | `contentModification: false` — unchecked    |
| with-corrections-en          | yes            | 47-event hero count + priority chain        |
| paused-timed-en              | no (text-only) | timed pause — non-deterministic date string |
| default-en — dark            | yes            | canonical state, token flip on dark         |
| default-uk — dark            | yes            | i18n + UA glyphs on dark surface            |
| off — dark                   | yes            | off pill tone on dark                       |
| paused-indefinite-en — dark  | yes            | paused pill + Resume CTA on dark            |
| content-toggle-off-en — dark | yes            | unchecked toggle in dark mode               |
| with-corrections-en — dark   | yes            | hero count + priority chain on dark         |

### Visual state matrix — options

| State                       | Baseline? | Axes exercised                               |
| --------------------------- | --------- | -------------------------------------------- |
| default-en                  | yes       | canonical visible options layout, en strings |
| default-uk                  | yes       | every translated string + UA glyph metrics   |
| priority-three-langs        | yes       | reorder enable state at head/middle/tail     |
| default-en — dark           | yes       | token flip across every options section      |
| default-uk — dark           | yes       | i18n + UA glyphs on dark surface             |
| priority-three-langs — dark | yes       | accent surface role-flip in dark mode        |

Dark-mode baselines are generated via `page.emulateMedia({ colorScheme: 'dark' })` —
the extension's design tokens ([`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css))
flip on `@media (prefers-color-scheme: dark)`, so neither surface needs a settings
flip or a class toggle to render in dark mode. Every light baseline has a dark
counterpart so a dark-only regression (a token whose contrast collapsed, a state
that didn't account for the surface flip) can't hide behind a passing light test.

### Behavior coverage

`popup.behavior.spec.ts` — five interactions:

| Interaction                          | Storage that must change                                         |
| ------------------------------------ | ---------------------------------------------------------------- |
| Click "Turn Movar off"               | `settings.enabled: false` (and survives popup reopen)            |
| Click "1 hour" pause                 | `movar:pausedUntil = now + 1h`, `movar:pausedIndefinitely=false` |
| Click "Resume now" (from indefinite) | both pause keys cleared                                          |
| Toggle content-modification          | `settings.contentModification` flips in both directions          |
| Change UI language to Ukrainian      | `settings.uiLanguage = 'uk'`; popup re-renders in place          |

`options.behavior.spec.ts` — priority interactions:

| Interaction                          | Storage that must change                 |
| ------------------------------------ | ---------------------------------------- |
| Remove Polish from a 3-lang priority | `settings.priority = ['uk', 'en']`       |
| Move Ukrainian down                  | `settings.priority = ['en', 'uk', 'pl']` |
| Add Polish to priority               | `settings.priority = ['uk', 'en', 'pl']` |

### Mocked-sites approach

`content-script.spec.ts` proves the content script's user-facing
behaviour without touching the network. Every navigation is fulfilled
by a `context.route()` handler that serves a fixed HTML body from
`src/fixtures/html/`:

| Fixture                                                            | Mocked URL                                                | What the test asserts                                               |
| ------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------- |
| [`cs-cart-ru.html`](src/fixtures/html/cs-cart-ru.html)             | `https://mocked-cs-cart.example.test/**`                  | `data-movar-hidden` lands on `<a hreflang="ru">`                    |
| [`youtube-cards-ru.html`](src/fixtures/html/youtube-cards-ru.html) | `https://www.youtube.com/**` (must be real)               | ≥2 cards carry `data-movar-content-blurred="ru"`; UK card untouched |
| [`clean-uk.html`](src/fixtures/html/clean-uk.html)                 | `https://uk-content.example.test/**`                      | zero `data-movar-*` attrs; zero correction events                   |
| [`picker-bare-text.html`](src/fixtures/html/picker-bare-text.html) | `https://mocked-001.example.test/delux**` + `/uk/delux**` | navigation arrives at the UK destination                            |

The YouTube test is the only one that mocks a real domain — the
content-filter host check
([`apps/extension/src/lib/content-filter.ts:120`](../extension/src/lib/content-filter.ts)) is exact (`'youtube.com'` or `.youtube.com`),
so a fake hostname would silently skip the filter. The HTML fixtures
don't need the real YouTube web components registered — the filter's
selectors are CSS attribute matchers, so plain `<ytd-video-renderer>`
elements with the right `id="video-title"` shape match.

### Browser-locale coverage

The shared fixture pins Chromium's `--lang` so every test boots into a
known UI locale. Default is `en-US`; specs opt into a different locale
via `test.use({ browserUiLanguage: '<bcp47>' })`.

[`russian-browser-lang.spec.ts`](src/offline/russian-browser-lang.spec.ts)
is the one spec that opts in today, set to `'ru-RU'`. It asserts four
independent properties of the "user runs Movar in a Russian-language
Chrome" path:

| Invariant              | Surface                        | Assertion                                                                                |
| ---------------------- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| `Accept-Language` rule | `chrome.declarativeNetRequest` | Header value is `"uk,en;q=0.9"`; does NOT contain `ru`                                   |
| Settings shape         | `chrome.storage.sync.settings` | `priority` excludes `ru`; `blocked` contains `ru`                                        |
| Deferred editor        | options page                   | blocked-language editor is absent, including locked-Russian controls                     |
| Priority-driven UI     | popup                          | Ukrainian copy renders from the preferred-language order, despite Russian browser locale |

The popup follows the preferred-language order for its catalogue, so the
default Ukrainian-first settings render Ukrainian even when Chromium itself is
launched with `--lang=ru-RU`. The options page still resolves its own
`uiLanguage: 'auto'` through
[`resolveLocale`](../extension/src/lib/i18n/resolve.ts), so the deferred-editor
absence is asserted against the English fallback strings.

### Baseline workflow

```bash
# Run the default suite — what CI runs.
pnpm --filter @movar/e2e test

# A baseline diff shows up in playwright-report/ with actual,
# expected, and diff PNGs side-by-side:
pnpm --filter @movar/e2e exec playwright show-report playwright-report

# Regenerate ALL baselines (popup + options) after an intentional UI
# change. Review the resulting `git status` diff to confirm only the
# expected files moved.
pnpm --filter @movar/e2e test:update

# Options-only regeneration: scope the run with --grep.
pnpm --filter @movar/e2e test:update -- --grep options
```

When updating baselines, treat the resulting PNG diffs the same way you'd
treat snapshot changes in a unit test: a stranger reviewing the PR should
be able to look at the new image and agree it matches the intended
design. Don't bulk-accept.

### Determinism guards

Every offline spec depends on the same setup steps to keep snapshots and
DOM assertions stable. If you add a new spec and it flakes, check these
first:

- `openPopup()` / `openOptions()` inject `animation-duration: 0` /
  `transition-duration: 0` on every element AND emulate
  `prefers-reduced-motion: reduce`.
- `document.fonts.ready` is awaited before any assertion.
- Browser UI language defaults to `en-US` (the `browserUiLanguage`
  worker option, threaded into Chromium's `--lang` flag by the shared
  fixture). Specs that need a different locale opt in with
  `test.use({ browserUiLanguage: '<bcp47>' })` at file scope —
  `russian-browser-lang.spec.ts` is the canonical example.
- `deviceScaleFactor: 1` regardless of the host display.
- Seeded state is written via `setMovarSettings` / `seedPause` /
  `seedTodayEvents` BEFORE the popup or options page is opened — both
  pages read each value once on mount, so a post-mount mutation race
  would silently produce a wrong-state snapshot.
- Content-script specs: `await waitForMovarSettled(page)` before
  asserting on the presence OR absence of `data-movar-*` attributes.
  The "no-op on UK" assertion in particular needs the settle window
  to give the content script a chance to NOT modify the page.

## Live suite (manual)

> Run against the real internet. **Manual only**; not gated on PRs.

This suite verifies the four-part contract for every site that ships a
rule (or that we want generic-fallback coverage on):

1. **Opens in Russian** — the start URL serves RU content (`<html lang>`
   - body-text Cyrillic detection agree).
2. **Recognised** — Movar's `detectPageLanguage` logged `fromLang: 'ru'`
   for the domain in its correction-event store.
3. **Switched** — the final URL matches the fixture's `afterMovar.url`
   pattern, and `<html lang>` is `uk`.
4. **Hidden** — `data-movar-hidden` is populated on picker items
   (and/or `data-movar-curtain` for the YouTube content-filter blur).

### Sites covered

| Site                    | Kind   | What it tests                                           |
| ----------------------- | ------ | ------------------------------------------------------- |
| `electrica-shop.com.ua` | site   | `cookie + hreflang` rule + class-name picker classify   |
| `uamade.ua`             | site   | Generic hreflang fallback + CS-Cart `ty-select` picker  |
| `001.com.ua`            | site   | Generic hreflang fallback + bare-text `UA \| RU` picker |
| `duckduckgo.com`        | search | Enforce-mode `kl=ua-uk` URL rewrite                     |
| `bing.com`              | search | Enforce-mode `setlang=uk` URL rewrite                   |
| `google.com`            | search | Enforce-mode `hl + lr` URL rewrite                      |
| `youtube.com`           | search | Enforce `hl + gl` + DOM content-filter blur on RU cards |

To add another rule-bearing site: copy any file under `src/live/sites/`,
adjust the fixture, and re-export from `src/live/sites/index.ts`. The
spec picks it up automatically.

## Demo recording (manual)

The `src/demo/` directory hosts the recording pipeline that captures the
extension in action for marketing material (YouTube master, README GIF,
social cuts). See [`src/demo/README.md`](src/demo/README.md) for the
shotlist, ffmpeg derivations, and how to add a new beat.

```bash
pnpm --filter @movar/e2e demo            # record + derive all outputs
pnpm --filter @movar/e2e demo:record     # just the Playwright capture
pnpm --filter @movar/e2e demo:derive     # just the ffmpeg passes
```

## Running

```bash
# One-time
pnpm install
pnpm --filter @movar/e2e install:browsers

# Build the extension and run the DEFAULT (offline) suite — what CI runs
pnpm --filter @movar/e2e test

# Build the extension and run the LIVE suite (manual only)
pnpm test:e2e:live

# Foreground (visible window) for debugging — the default offline suite
# runs in Chromium's new headless mode so it doesn't strobe the desktop.
# `test:fg` flips back to a visible window.
pnpm --filter @movar/e2e test:fg
pnpm --filter @movar/e2e test:live:headed

# Playwright UI mode (default suite only)
pnpm --filter @movar/e2e test:ui
```

Every `test*` Nx target declares `extension:build` as a dependency, so
the WXT production output is always fresh before tests run.

## A note on running the live suite from Ukraine

The three Ukrainian e-com sites (`electrica-shop`, `uamade`, `001`) all
server-side geolocate UA visitors to the UA version regardless of
`Accept-Language` or the `lang=ru` preCookie. From a Ukrainian IP, the
live suite reports:

- Test 1 (baseline opens in Russian) — **skipped via tolerant fixture**:
  the `initial` expectations accept `uk` as a valid baseline. Movar's
  redirect path has nothing to fix here, which is correct.
- Test 2/3 (recognise + switch) — **explicitly skipped** with a clear
  message. The skip is honest: nothing to redirect from.
- Test 4 (hide blocked options) — **runs and passes**. The picker filter
  fires regardless of starting state, and is the user-facing UX you
  most want to verify on every run.

To fully exercise the redirect path, run the live suite from a non-UA
exit point — either a VPN/proxy or a CI runner in another region.
Playwright's `launchPersistentContext` accepts a `proxy` option;
threading it into `src/fixtures/extension.ts` is a one-line change if
you want a `MOVAR_E2E_PROXY` env knob.

The search-engine tests (`google`, `youtube`, `bing`, `duckduckgo`)
are not affected by this — the enforce-mode rule fires unconditionally
on `/search` regardless of IP.

The default suite isn't affected either — `mocked-cs-cart.example.test`
doesn't resolve to anything, so there's no geolocation to react to.
Everything is served from `context.route()` against fixed HTML.

## Flake handling

Real sites flake. The live suite mitigates rather than denies:

- **One worker, no parallelism.** A flaky Google CAPTCHA on worker 1
  doesn't poison worker 2.
- **No retries.** A failure usually means the site changed (rule needs
  updating); silent retries would hide that.
- **`SKIP_GOOGLE=1` / `SKIP_YOUTUBE=1` env vars.** When anti-bot is up,
  bypass those specific sites without skipping the whole run.
- **Traces + video on failure.** Open `playwright-report-live/` after a
  failed run to see exactly what Movar's content script did.

The default suite is deterministic by construction — no live network,
no live time, no live fonts. If it flakes, the most likely culprit is
the determinism-guards checklist above; check that first before
suspecting Playwright.

If a site's `initial: { bodyDetected }` set says `['ru', 'uk', 'unknown']`,
that's the live fixture telling you "this site geolocates and sometimes
serves UA from a UA IP — accept either as a starting state". The
post-Movar assertion still demands `uk`, which is the property under
test.

## Picker-filter assertion tolerance

The live picker-filter test (test 4) asserts on Movar's DOM signals:

- `data-movar-hidden` count ≥ `minHiddenLinks`.
- Each `hiddenSelectors` entry resolved to a node with `display:none` or
  `aria-hidden="true"`.
- Each `visibleSelectors` entry is **either** visible **or** its picker
  container has a Movar curtain (`data-movar-curtain` +
  `data-movar-kind="picker-container"`) immediately preceding an
  ancestor.

The two-mode tolerance is intentional: `filterPickers` collapses a
picker container into a chip overlay in strict mode (when no `blocked`
array is provided and only ≤1 language survives), but in production —
where `settings.blocked` is always populated — survives stay visible
with a tooltip. The fixture accepts both because the user-facing
property ("Movar reacted, the user still has access to the language they
want") is satisfied either way.

The default-suite picker-filter test
([`content-script.spec.ts`](src/offline/content-script.spec.ts)) uses a
narrower fixture shape and asserts the strict signal directly — `<a
hreflang="ru">` has `data-movar-hidden` within 5 seconds. No
two-mode tolerance needed because the fixture is controlled.

## What these suites are NOT

- The live suite does not measure rule-bearing-site result quality (e.g.
  "are Google's results mostly UA after `lr=lang_uk`"). That's a hard
  signal-vs-noise problem; the rule's job is just to write the URL
  knob.
- The default suite does not exercise live anti-bot, IP geolocation,
  or third-party-script regressions — by design. Those are the live
  suite's job. The default suite trades coverage breadth for CI
  reliability.
- Neither suite runs on Firefox. Manual Firefox verification lives at
  `pnpm --filter @movar/extension dev:firefox:installed`.
- Neither suite covers the Storybook → PNG pipeline
  (`apps/extension/scripts/capture-storybook-assets.mts`); that's a
  separate path that produces store-listing and marketing-site assets,
  not regression baselines.
