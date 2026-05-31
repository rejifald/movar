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

| Prefix                      | Output root                                |
| --------------------------- | ------------------------------------------ |
| `Marketplace/Screenshots/*` | `store-assets/screenshots/{en,uk}/`        |
| `Marketplace/Promo/*`       | `store-assets/` (path via `captureOutput`) |
| `Marketing/Screenshots/*`   | `apps/marketing/public/screenshots/`       |

See [`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md) for the
original design discussion (the script has since generalised beyond
that plan's per-marketplace scope). The pictograms come from Sharp via
[`../scripts/generate-icons.mts`](../scripts/generate-icons.mts) — that
remains the right tool for small-icon rasterisation (see decision #4 in
the plan).

### Capture recipe

```sh
# from repo root or apps/extension/
pnpm --filter @movar/extension capture:storybook-assets
```

That single command:

1. Builds the Storybook static bundle (`storybook build`).
2. Spins up a local static server on `127.0.0.1:4325`.
3. Reads `storybook-static/index.json`, filters stories under any of
   the three recognised prefixes, and skips any tagged `skip-capture`.
4. For each surviving story, reads its `parameters.viewport` and
   `parameters.captureOutput` from the running preview's storyStore,
   then launches Playwright Chromium at the story's viewport
   (`deviceScaleFactor: 1`, `colorScheme: 'light'`); awaits
   `document.fonts.ready` and a network-idle settle; writes a 24-bit
   no-alpha PNG to the resolved output path.

Add `--no-build` if you've just edited a scene and want to skip the
~30-second Storybook rebuild:

```sh
pnpm --filter @movar/extension capture:storybook-assets --no-build
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

| #   | File                        | Backdrop component                                                 | Layout                                |
| --- | --------------------------- | ------------------------------------------------------------------ | ------------------------------------- |
| 1   | `01-popup-on-news.png`      | `news-{en,uk}` (news article) + real popup `App` over it           | full canvas, popup at right-bottom    |
| 2   | `02-correction-applied.png` | `site-ru` (before) + `site-{en,uk}` (after) via `BeforeAfterFrame` | horizontal diptych, captions per half |
| 3   | `03-search-rewrite.png`     | Two `google-serp-frame` halves via `BeforeAfterFrame`              | horizontal diptych, captions per half |
| 4   | `04-language-dialog.png`    | `voya-frame` with dialog overlay (before) + `voya-{en,uk}` (after) | horizontal diptych, captions per half |

All four PNGs are 1280×800, 24-bit PNG (no alpha). The same file
satisfies both AMO and Chrome Web Store size constraints — see
[`REQUIREMENTS.md`](./REQUIREMENTS.md) §5.

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
