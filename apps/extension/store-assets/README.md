# Store-listing assets

PNG screenshots and pictogram artwork for the Chrome Web Store, Edge
Add-ons, and Firefox AMO submissions. This folder is the source of truth
for what ships to each marketplace.

## Layout

```
store-assets/
  screenshots/
    en/                       # English marketplace screenshots
    uk/                       # Ukrainian marketplace screenshots
      01-popup-on-news.png       # Popup composed over a news article
      02-correction-applied.png  # Site language: before / after diptych
      03-search-rewrite.png      # Google SERP: before / after diptych
      04-language-dialog.png     # Language-selection modal: before / after diptych
  storyboards/                # React backdrops + scene stories (Storybook)
    backdrops/                # one .tsx per fictitious site (marketplace + marketing)
    stories/                  # Marketplace/Screenshots/* scenes
    promo/                    # Marketplace/Promo/* — Chrome promo tile
    marketing/                # Marketing/Screenshots/* — movar.fyi assets
  chrome/                     # CWS pictogram + promo tile
    icon-128.png
    promo-tile-440x280.png    # rendered from Marketplace/Promo/ChromeTile
  firefox/                    # AMO pictograms
    icon-32.png
    icon-64.png
    icon-128.png
  edge/                       # reuses Chrome shots
  shared/                     # legacy — empty until reaped
  copy/                       # marketplace copy (separate workstream)
```

## Pipeline

Every PNG sourced from the extension's Storybook — marketplace
screenshots, the Chrome promo tile, and the marketing-site screenshots
that ship to `apps/marketing/public/screenshots/` — comes through one
script: [`../scripts/capture-storybook-assets.mts`](../scripts/capture-storybook-assets.mts).
Stories are routed to outputs by their title prefix:

| Prefix                      | Output root                                | Story directory          |
| --------------------------- | ------------------------------------------ | ------------------------ |
| `Marketplace/Screenshots/*` | `store-assets/screenshots/{en,uk}/`        | `storyboards/stories/`   |
| `Marketplace/Promo/*`       | `store-assets/` (path via `captureOutput`) | `storyboards/promo/`     |
| `Marketing/Screenshots/*`   | `apps/marketing/public/screenshots/`       | `storyboards/marketing/` |

See [`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md) for the
original design discussion (the script has since generalised beyond
that plan's per-marketplace scope). The pictograms come from Sharp via
[`../scripts/generate-icons.mts`](../scripts/generate-icons.mts) — that
remains the right tool for small-icon rasterisation (see decision #4 in
the plan).

### Adding a new before/after use case

Both marketplace and marketing surfaces narrate the same "what Movar
fixes" use cases — they just deliver them in different shapes:

- **Marketplace** ships one composed 1280×800 diptych PNG per scene
  (the diptych frame is in the PNG). One numbered file per locale lands
  in `screenshots/{en,uk}/`.
- **Marketing** ships two single-half PNGs per pair (each captured
  light + `-dark`, at natural content height); the Astro layer
  ([apps/marketing/src/components/Examples.astro](../../marketing/src/components/Examples.astro))
  composes them at runtime — full-width and stacked — swapping
  light↔dark with `<picture>` + `prefers-color-scheme`.

**The rule: every new use case is wired into BOTH surfaces unless the
demo's premise excludes one** (scene #5 / Knowledge-Panel is the
documented exception — see the §"Required shots" footnote and
[`REQUIREMENTS.md`](./REQUIREMENTS.md) §5). The dual wiring keeps the
marketplace carousel and the marketing diptych section telling the
same story, and reuses the same backdrop components across both.

**Procedure** (also encoded as the local
[`.claude/skills/add-before-after-case/SKILL.md`](../../../.claude/skills/add-before-after-case/SKILL.md)
checklist):

1. Build the shared backdrop(s) under `storyboards/backdrops/`. Make
   them accept `hideChrome?: boolean` and forward it to the inner
   frame component — the marketplace diptych supplies its own chrome
   at the half level, the marketing single-half does not.
2. Add the marketing single-half stories under `storyboards/marketing/`
   with title `Marketing/Screenshots/<Name>{With,Without}` and
   `parameters: { captureOutput: { path: '<file>.png' }, naturalHeight: true, darkVariant: true }`.
   Two stories per pair (with / without). `naturalHeight` captures the
   whole page instead of a fixed 800px crop; `darkVariant` emits the
   `-dark` sibling. Output → `apps/marketing/public/screenshots/`.
3. Add the marketplace diptych story under `storyboards/stories/` with
   title `Marketplace/Screenshots/<Scene>` and the next free
   `screenshotIndex`. Compose the two backdrops inside
   `BeforeAfterFrameWithFrame`, passing `hideChrome` on each. Set
   `darkVariant: true` when the backdrops have a dark theme (the website
   scenes do — the diptych frame repaints under
   `prefers-color-scheme: dark`); leave it off for the fixed light
   scenes. Export `English` and `Ukrainian` stories — or document, in
   the file header, why one locale is intentionally skipped and use
   `tags: ['skip-capture']` (or omit the export entirely).
4. Wire the pair into `Examples.astro`'s `imagePairs` (keyed by the
   matching `examples.entries` index in `i18n.ts`), gated on PNG
   existence; the `-dark` siblings are picked up automatically.
5. Add a row to the §"Required shots" table here, a row to
   §5 of [`REQUIREMENTS.md`](./REQUIREMENTS.md), entries to §6's asset
   table, and a row to
   [`apps/marketing/public/screenshots/README.md`](../../marketing/public/screenshots/README.md)'s
   filename table.
6. Run `pnpm capture:storybook-assets` and commit the PNG diff
   alongside the source changes.

### Capture recipe

```sh
# from repo root
pnpm capture:storybook-assets

# or, from anywhere
pnpm --filter @movar/extension capture:storybook-assets
```

That single command:

1. Builds the Storybook static bundle (`storybook build`).
2. Spins up a local static server on `127.0.0.1:4325`.
3. Reads `storybook-static/index.json`, filters stories under any of
   the three recognised prefixes, and skips any tagged `skip-capture`.
4. For each surviving story, reads its `parameters` (`viewport`,
   `captureOutput`, `darkVariant`, `naturalHeight`) from the running
   preview's storyStore, then launches Playwright Chromium at
   `deviceScaleFactor: 2`; awaits `document.fonts.ready` and a
   network-idle settle; writes a 24-bit no-alpha PNG. Stories with
   `naturalHeight` are captured at full content height (not the fixed
   viewport); stories with `darkVariant` are captured a second time
   under `colorScheme: 'dark'` to a `-dark.png` sibling.

Add `--no-build` if you've just edited a scene and want to skip the
~30-second Storybook rebuild:

```sh
pnpm capture:storybook-assets --no-build
```

### Iterating on a scene

Run Storybook locally to see the canvas the capture script sees:

```sh
pnpm --filter @movar/extension storybook
# open http://localhost:6008
```

The four marketplace scenes live under
`Marketplace/Screenshots/*` in the Storybook sidebar. Each scene
file exports both `English` and `Ukrainian` stories.

### Pictograms

```sh
pnpm --filter @movar/extension icons
```

Re-rasterises the manifest icons under `src/public/icon/` and the
per-store pictograms in `chrome/` and `firefox/`. Source SVG:
[`../src/public/icon.svg`](../src/public/icon.svg).

## Required shots

Numbered to match the capture script's filename prefixes (which come
from `parameters.screenshotIndex` on each scene's `meta`):

| #   | File                        | Locales | Backdrop component                                                                                  | Layout                                |
| --- | --------------------------- | ------- | --------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | `01-popup-on-news.png`      | EN + UK | `news-{en,uk}` (news article) + real popup `App` over it                                            | full canvas, popup at right-bottom    |
| 2   | `02-correction-applied.png` | EN + UK | `site-ru` (before) + `site-{en,uk}` (after) via `BeforeAfterFrame`                                  | horizontal diptych, captions per half |
| 3   | `03-search-rewrite.png`     | EN + UK | Two `google-serp-frame` halves via `BeforeAfterFrame`                                               | horizontal diptych, captions per half |
| 4   | `04-language-dialog.png`    | EN + UK | `voya-frame` with dialog overlay (before) + `voya-{en,uk}` (after)                                  | horizontal diptych, captions per half |
| 5   | `05-knowledge-panel.png`    | UK only | `google-god-of-war-{without,with}-movar` (shared with the marketing diptych) via `BeforeAfterFrame` | horizontal diptych, captions per half |
| 6   | `06-youtube.png`            | EN + UK | `youtube-{without,with}-movar` (shared with the marketing pair) via `BeforeAfterFrame`              | horizontal diptych, captions per half |
| 7   | `07-shop.png`               | EN + UK | `shop-{without,with}-movar` (shared with the marketing pair) via `BeforeAfterFrame`                 | horizontal diptych, captions per half |

All PNGs are 1280×800, 24-bit PNG (no alpha). The same file satisfies
both AMO and Chrome Web Store size constraints — see
[`REQUIREMENTS.md`](./REQUIREMENTS.md) §5.

### Host-app UI shots (iOS + iPad App Store, scenes #8 and #9)

Two App Store screenshots show the **actual host-app UI** — the native
SwiftUI app, not an extension-in-Safari mockup:

| #   | File                    | Screen                                                                                                               |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 8   | `08-host-app-about.png` | About — brand lede, version, licence, support and legal links                                                        |
| 9   | `09-host-app-setup.png` | Settings with the "One last step" banner: Settings ▸ Apps ▸ Safari ▸ Extensions ▸ Movar — the Guideline 4.2 evidence |

These were one shot while About was a React tab carrying both the lede
and the enable path. Going native ([`../../../docs/native-shells.md`](../../../docs/native-shells.md))
split them: About kept the lede, and the enable path became the setup
banner on Settings. One screenshot can't show both any more.

They come from the app running in a **simulator**, because the React
bundle they used to be rendered from no longer draws any tab — nothing
displays it, so a picture of it was a picture of a screen no reviewer can
reach. Build the simulator app first (see the bootstrap below), then:

```sh
# boot + reinstall + launch in one locale (reinstall resets the setup
# banner's "I've done this" flag, which otherwise hides scene #9)
pnpm --filter @movar/extension capture:host-app-screenshots --prepare --device=ios --locale=uk
# …navigate to the scene in the simulator…
pnpm --filter @movar/extension capture:host-app-screenshots --device=ios --locale=uk --scene=09-host-app-setup
```

`simctl` has no tap primitive, so **navigating to each screen is a manual
step**; the script owns everything around it — booting, reinstalling,
launching in a locale, grabbing native device pixels, refusing a raster
that is not an App Store size for that device, and flattening alpha to
match the 24-bit set. A UI-test target driving
`XCUIScreen.main.screenshot()` is the durable way to automate the taps.

Sizes are Apple's: **1320×2868** (iPhone 6.9″, `iPhone 17 Pro Max`) and
**2064×2752** (iPad 13″, `iPad Pro 13-inch (M5)`; the older 2048×2732
12.9″ raster is equally valid). For the iPad `en` shots set the DEVICE
language too, not just the app's — the iPad status bar carries a date,
and a device left in Ukrainian stamps «Чт 27 серп.» across an English
screenshot:

```sh
xcrun simctl spawn <udid> defaults write ".GlobalPreferences" AppleLanguages -array en-US
xcrun simctl shutdown <udid> && xcrun simctl boot <udid>
```

Bootstrap for the simulator app — the same web build the `.app` copy
phase needs, then the iOS scheme:

```sh
pnpm gen:theme
pnpm --filter @movar/extension build:safari
pnpm --filter @movar/safari-host-app build
pnpm --filter @movar/audit-engine build
cd apps/extension && xcodebuild build \
  -project "safari/Movar/Movar.xcodeproj" -scheme "Movar (iOS)" \
  -configuration Debug -destination "id=<udid>" \
  -derivedDataPath "safari/Movar/DerivedData" CODE_SIGNING_ALLOWED=NO
```

Scenes 3, 5, 6, and 7 (the website scenes) set `darkVariant: true`, so
each also emits a `-dark` sibling per locale (e.g.
`uk/06-youtube-dark.png`) for an optional dark-themed listing. A store
listing displays one theme at a time, so the light and dark sets are not
shipped together. Note the Chrome Web Store shows up to ~5 screenshots,
so the seven-scene set needs curating for the CWS listing (AMO allows
more).

Scene #5 is UK-only by design: the Knowledge-Panel demo's premise
(Google falls back to English when no `hl` hint is in flight) collapses
to a no-op for an EN-locale user — Movar's appended `hl=en&lr=lang_en`
is what Google would have served anyway. The EN listing ships four
shots; the UK listing ships five.

### English screenshots

Both locales are wired and committed. Each scene file exports an
`English` and a `Ukrainian` story; both render their real backdrop
and emit a 1280×800 PNG under `screenshots/{en,uk}/` on every
`capture:storybook-assets` run. The original PR phasing
(UK first via PR1, EN via PR2) is preserved in
[`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md) §6 for
posterity.

## Synthetic guard rails (from REQUIREMENTS.md §5)

- **Site backdrops are invented brands** (_Світанок_, _Tochka24_,
  _Voya_) — see the per-backdrop file headers under
  `storyboards/backdrops/`. The search-rewrite scene is the exception:
  it reuses `google-serp-frame.tsx` (the editorial-illustration Google
  approximation also rendered by the marketing diptych) so the
  screenshot demonstrates the exact `hl/lr` rewrite Movar performs on
  google.com.ua queries.
- **No fake URLs that look like real domains** outside the search
  scene. Backdrop URLs use the IANA-reserved `.example` TLD; the only
  real domain rendered anywhere is `google.com.ua` in the search-
  rewrite URL bar.
- **Before/after diptychs hold UI variables constant** — both halves
  share the same site/Google UI language, same query, same chrome.
  Only the URL params and the resulting content language change. The
  story is "same user did nothing different except install Movar," not
  "Movar redesigned the page."
- **Real Movar UI must stay real.** The popup-on-news scene's popup is
  the production `App` component from
  `apps/extension/src/entrypoints/popup/App.tsx`, composed via the
  scene story's `render` field. The `withBrowserMock` decorator
  exercises the _same_ `installBrowserMock` mock as the static-serve
  preview shim, so the popup behaves identically in both surfaces.

## Verification claims to keep honest

Per [`../../../deployment-checklist.md`](../../../deployment-checklist.md),
every screenshot must reflect functionality the extension actually
delivers as of the listing version. Each scene's seed values
(`_seed.ts`) and backdrop markup are reviewed alongside any
manifest / feature change so a captured PNG never advertises
something we don't ship.

## When ready to submit

- `screenshots/uk/*.png` → AMO + CWS upload UIs (until PR2 adds EN
  variants; same files cover both stores' UA-locale fallback).
- `screenshots/en/*.png` → AMO + CWS upload UIs (after PR2).
- `chrome/icon-128.png` → Chrome Web Store listing pictogram.
- `firefox/icon-{32,64,128}.png` → AMO listing pictograms.
- `chrome/promo-tile-440x280.png` → Chrome Web Store promo tile,
  rendered from the `Marketplace/Promo/ChromeTile` Storybook story.
