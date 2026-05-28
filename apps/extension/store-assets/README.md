# Store-listing assets

PNG screenshots and pictogram artwork for the Chrome Web Store, Edge
Add-ons, and Firefox AMO submissions. This folder is the source of truth
for what ships to each marketplace.

## Layout

```
store-assets/
  screenshots/
    en/                       # English marketplace screenshots (PR2)
    uk/                       # Ukrainian marketplace screenshots
      01-popup-on-news.png    # Popup composed over a UA news article
      02-correction-applied.png  # Before / after diptych
      03-picker-survivor.png  # Language picker with RU dimmed
      04-search-rewrite.png   # SERP with hl=uk highlighted
  storyboards/                # React backdrops + scene stories (Storybook)
    backdrops/                # one .tsx per fictitious site
    stories/                  # Marketplace/Screenshots/* scenes
  chrome/                     # CWS pictogram + promo tile
    icon-128.png
    promo-tile-440x280.png    # designed image; out of scope here
  firefox/                    # AMO pictograms
    icon-32.png
    icon-64.png
    icon-128.png
  edge/                       # reuses Chrome shots
  shared/                     # legacy — empty until reaped
  copy/                       # marketplace copy (separate workstream)
```

## Pipeline

The screenshots are rendered by a Storybook composing the real popup
component over per-locale React backdrops, then captured by Playwright
against a `storybook build` output. See
[`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md) for the
full design discussion. The pictograms come from Sharp via
[`../scripts/generate-icons.mts`](../scripts/generate-icons.mts) (the
same script that rasterises the manifest icons).

### Capture recipe

```sh
# from repo root or apps/extension/
pnpm --filter @movar/extension capture:store-screenshots
```

That single command:

1. Builds the Storybook static bundle (`storybook build`).
2. Spins up a local static server on `127.0.0.1:4325`.
3. Reads `storybook-static/index.json`, filters stories under the
   `Marketplace/Screenshots/*` title prefix, and skips any tagged
   `skip-capture`.
4. For each surviving story, launches Playwright Chromium at exactly
   `1280×800`, `deviceScaleFactor: 1`; awaits `document.fonts.ready`
   and a network-idle settle; writes a 24-bit no-alpha PNG to
   `screenshots/{en,uk}/<index>-<scene>.png`.

Add `--no-build` if you've just edited a scene and want to skip the
~30-second Storybook rebuild:

```sh
pnpm --filter @movar/extension capture:store-screenshots --no-build
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

| #   | File                        | Backdrop component                | Popup overlay?                    |
| --- | --------------------------- | --------------------------------- | --------------------------------- |
| 1   | `01-popup-on-news.png`      | `news-uk` (UA news article)       | yes — corrections-today counter   |
| 2   | `02-correction-applied.png` | `site-ru` + `site-uk` diptych     | yes — over the UA after-state     |
| 3   | `03-picker-survivor.png`    | `picker-uk` (UA settings page)    | no — the picker is the foreground |
| 4   | `04-search-rewrite.png`     | `serp-uk` (UA SERP with `?hl=uk`) | no — the SERP is the foreground   |

All four PNGs are 1280×800, 24-bit PNG (no alpha). The same file
satisfies both AMO and Chrome Web Store size constraints — see
[`REQUIREMENTS.md`](./REQUIREMENTS.md) §5.

### English screenshots

PR1 ships the Ukrainian set only. The `English` story exports exist
but render a placeholder backdrop with the `skip-capture` tag so the
capture script ignores them. PR2 lands the four English backdrop
designs and drops the tag; the same `capture:store-screenshots` run
will then emit `screenshots/en/*.png`. The UK PNGs serve as the global
fallback on both stores in the meantime.

## Synthetic guard rails (from REQUIREMENTS.md §5)

- **No third-party brand logos.** All four backdrops are invented
  brands (_Світанок_, _Tochka24_, _Kolesnyk_, _Vector_) — see the
  per-backdrop file headers under `storyboards/backdrops/`.
- **No fake URLs that look like real domains.** Backdrop URLs use the
  IANA-reserved `.example` TLD.
- **Real Movar UI must stay real.** Each scene's popup is the
  production `App` component from
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
- `chrome/promo-tile-440x280.png` → Chrome Web Store promo tile (this
  is a designed image, not a screenshot — see REQUIREMENTS.md §6).
