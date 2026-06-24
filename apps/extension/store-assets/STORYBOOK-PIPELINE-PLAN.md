# Marketplace screenshot pipeline — implementation plan

Implementation spec for the Storybook + Playwright pipeline that produces
the per-locale screenshots and per-marketplace pictograms shipped to AMO
and the Chrome Web Store.

Supersedes the static-HTML storyboard pipeline that previously lived
under `storyboards/*.html` (deleted in PR1). Implements
[`REQUIREMENTS.md`](./REQUIREMENTS.md) §5 (screenshot set) and §6 (assets
to produce). Resolves [`REQUIREMENTS.md`](./REQUIREMENTS.md) §7.4
(storyboard visual identity) in favour of option **(b)** — bespoke
per-scene design.

> **Drafted on `feat/marketplace-screenshot-pipeline`** following a
> design grilling session. Decisions are recorded as locked; if any need
> reopening, do it in a docs PR before changing implementation.
>
> **2026-05 update** — the script has since generalised beyond marketplace
> screenshots. `scripts/capture-store-screenshots.mts` was renamed to
> `scripts/capture-storybook-assets.mts` and now also captures the Chrome
> promo tile (`Marketplace/Promo/*`) and the marketing-site screenshots
> (`Marketing/Screenshots/*`) into `apps/marketing/public/screenshots/`.
> Per-story `parameters.viewport` and `parameters.captureOutput` drive
> the new prefixes. The body of this plan still describes the original
> marketplace-screenshot pass; the new script is a superset. PR1 (UK
> backdrops + pipeline plumbing) and PR2 (EN backdrops) have both
> landed — see [`README.md`](./README.md) for the current-state recipe.
>
> **2026-06 update** — the pipeline now also produces the **iOS + iPad
> App Store** screenshots (the Safari listing) in portrait at Apple's
> fixed sizes (iPhone 1320×2868, iPad 2048×2732). New title prefixes
> `Marketplace/IOSScreenshots/*` and `Marketplace/IPadScreenshots/*` route
> to `store-assets/screenshots/{ios,ipad}/{en,uk}/`; two portrait frames
> (`portrait-before-after-frame.tsx`, `portrait-single-panel-frame.tsx`)
> plus shared scene specs under `storyboards/scenes/` re-lay-out the same
> seven scenes vertically. A new `--only=<title-prefix>` capture flag
> scopes a run to one prefix. See [`REQUIREMENTS.md`](./REQUIREMENTS.md) §5
> "iOS / iPad App Store portrait set".

---

## 1. Decisions locked

| #   | Decision                                                                                      | Why it matters                                                                |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | Storybook **replaces** the static HTML storyboards                                            | Single source for per-locale rendering and real-popup composition.            |
| 2   | New Storybook in `apps/extension`                                                             | Popup lives here; sibling to `packages/ui` and `apps/marketing` configs.      |
| 3   | **1280×800 PNG** for both AMO and Chrome                                                      | One composition; AMO accepts ≤ 2400×1800 (no minimum).                        |
| 4   | Pictograms via extended `generate-icons.mts`; **not** Storybook                               | Sharp→libvips beats browser rasterisation for small icons.                    |
| 5   | Real popup component + `browser.*` mock decorator; **no drift between stories and prod ever** | General rule across the repo: stories import real production components.      |
| 6   | Per-locale backdrops; **RU is the always-bad "before" villain**                               | EN listing → EN scenes; UK listing → UA scenes; Scene #2 "before" is RU both. |
| 7   | Direct Playwright against static `storybook build`; story discovery via `index.json`          | Playwright already in workspace; fewer moving parts than `test-runner`.       |
| 8   | Output: `store-assets/screenshots/{en,uk}/` (shared); per-store `{chrome,firefox}/` for icons | Honors existing `shared/` convention; identical files aren't duplicated.      |
| 9   | Bespoke per-scene design (§7.4 option **b**); inline `<style>` blocks in JSX                  | Each backdrop is a fictitious third-party site; isolation is the feature.     |
| 10  | `parameters.browserMock` + meta-level `withBrowserMock` decorator                             | Storybook-idiomatic; mock state visible in the Storybook UI.                  |
| 11  | Captured PNGs are **committed** to git                                                        | PRs show screenshot diffs; PNGs are the deliverable.                          |
| 12  | **Two PRs**: PR1 pipeline + UK; PR2 EN design                                                 | Reversible plumbing first; design work concentrated separately.               |

### Smaller calls baked in

- **Format**: PNG (no alpha) for both stores. Playwright's `screenshot()` on opaque scenes emits RGB PNG, satisfying Chrome's "24-bit PNG no alpha" constraint naturally.
- **Locale parameterisation**: per-story args matching marketing precedent. Each scene file exports `English` and `Ukrainian` named stories. Capture script iterates all stories under the `Marketplace/Screenshots/*` title prefix.
- **Shared mock module**: refactor [`preview/preview-shim.js`](../preview/preview-shim.js) into a shared TypeScript module + a vanilla-JS facade that the existing static-serve consumer keeps using. Decorator and shim both call `installBrowserMock(state)`. No second copy of the mock surface.

---

## 2. Asset inventory

### Backdrops (React components, one per locale per scene)

Marketplace pass — totals: **9 backdrop components**, **8 stories**, **8 screenshot PNGs** committed per-locale, **4 pictogram PNGs** committed per-store. The post-2026-05 superset adds 3 Google-SERP backdrops, 4 marketing stories, and 1 promo story (catalogued at the end of this section).

```
apps/extension/store-assets/storyboards/        # NEW LOCATION — replaces .html
  backdrops/
    news-en.tsx                       # EN news article (fictitious brand)
    news-uk.tsx                       # UK news article ("Світанок")
    site-frame.tsx                    # shared layout, two halves of the correction diptych
    site-ru.tsx                       # shared RU before-state ("Tochka24")
    site-en.tsx                       # EN after-state
    site-uk.tsx                       # UK after-state ("Tochka24")
    google-serp-frame.tsx             # shared Google SERP frame (marketing + scene #3)
    voya-frame.tsx                    # shared Voya travel site frame + lang-dialog overlay (scene #4)
    voya-en.tsx                       # EN after-state
    voya-uk.tsx                       # UK after-state
    before-after-frame.tsx            # horizontal diptych frame for scenes #2, #3, #4
  stories/
    popup-on-news.stories.tsx         # 2 stories — popup over news article
    correction-applied.stories.tsx    # 2 stories — site language diptych
    search-rewrite.stories.tsx        # 2 stories — Google SERP diptych
    language-dialog.stories.tsx       # 2 stories — language-selection modal diptych
```

#### 2026-05 additions (Marketplace/Promo and Marketing/Screenshots)

```
apps/extension/store-assets/storyboards/
  backdrops/
    google-serp-frame.tsx       # shared frame for the marketing diptych
    google-without-movar.tsx    # synthesised RU-dominated SERP
    google-with-movar.tsx       # synthesised UA-dominated SERP (?hl=uk&lr=lang_uk)
  promo/
    chrome-tile.tsx             # 440×280 CWS promo tile composition
    chrome-tile.stories.tsx     # Marketplace/Promo/ChromeTile (1 story)
  marketing/
    popup.stories.tsx               # Marketing/Screenshots/Popup (480×360)
    options.stories.tsx             # Marketing/Screenshots/Options (1280×800)
    google-serp-without.stories.tsx # Marketing/Screenshots/GoogleSerpWithout
    google-serp-with.stories.tsx    # Marketing/Screenshots/GoogleSerpWith
```

Both new prefixes (`Marketplace/Promo/*`, `Marketing/Screenshots/*`)
are captured by the same `capture-storybook-assets.mts` pass and
route to disk via per-story `parameters.captureOutput.path`. See
[`README.md`](./README.md) for the full prefix → output-root table.

### Screenshots (Storybook → Playwright → PNG)

```
apps/extension/store-assets/screenshots/
  en/
    01-popup-on-news.png
    02-correction-applied.png
    03-search-rewrite.png
    04-language-dialog.png
  uk/
    01-popup-on-news.png
    02-correction-applied.png
    03-search-rewrite.png
    04-language-dialog.png
```

Each PNG is 1280×800, RGB (no alpha), PNG. Same byte content uploaded to
both AMO and CWS dashboards.

### Pictograms (Sharp → PNG)

```
apps/extension/store-assets/
  firefox/
    icon-32.png       # NEW — AMO
    icon-64.png       # NEW — AMO
    icon-128.png      # NEW — AMO
  chrome/
    icon-128.png      # NEW — CWS
    promo-tile-440x280.png   # separate design work, out of scope here
```

[`generate-icons.mts`](../scripts/generate-icons.mts) is extended to:

- Add **64** to the manifest-side rasterisation pass (still useful in-extension).
- Emit a second pass parameterised by `{ store, sizes }` for the store-asset paths above.
- Keep `src/public/icon/{16,32,48,128}.png` unchanged — those are loaded by the manifest.

---

## 3. Decorator API

```tsx
// apps/extension/.storybook/decorators/with-browser-mock.tsx
import type { Decorator } from '@storybook/react';
import { installBrowserMock, type BrowserMockState } from '../../src/test/browser-mock';

export const withBrowserMock: Decorator = (Story, ctx) => {
  const state = ctx.parameters.browserMock as BrowserMockState | undefined;
  if (state) installBrowserMock(state);
  return <Story />;
};
```

```ts
// apps/extension/src/test/browser-mock.ts  (the shared mock)
export interface BrowserMockState {
  /** Drives `browser.i18n.getUILanguage()`. */
  uiLanguage: string;
  storage: {
    sync?: Record<string, unknown>;
    local?: Record<string, unknown>;
  };
  paused?: { mode: 'until'; until: number } | { mode: 'indefinite' } | false;
}

export function installBrowserMock(state: BrowserMockState): void {
  /* writes window.browser surface; called by both the Storybook decorator
     and the existing preview-shim's JS facade */
}
```

The legacy `preview/preview-shim.js` becomes a thin wrapper that bundles
`installBrowserMock` for the static-serve consumer. Both popups (real
build and Storybook story) end up exercising the same mock code path.

### Per-story usage

```tsx
// stories/popup-on-news.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { NewsBackdropEN } from '../backdrops/news-en';
import { NewsBackdropUK } from '../backdrops/news-uk';
import App from '../../../src/entrypoints/popup/App';

const meta = {
  title: 'Marketplace/Screenshots/PopupOnNews',
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    /** Capture-script ordering. Mirrors REQUIREMENTS.md §5 ordering. */
    screenshotIndex: 1,
  },
} satisfies Meta;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'en-US',
      storage: {
        sync: {
          settings: {
            /* enforced priority list, no exempt sites, etc. */
          },
        },
        local: {
          events: [
            /* ~47 events spread over today for the counter */
          ],
        },
      },
    },
  },
  render: () => (
    <NewsBackdropEN>
      <App />
    </NewsBackdropEN>
  ),
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: {
      uiLanguage: 'uk',
      storage: {
        /* UK preferences */
      },
    },
  },
  render: () => (
    <NewsBackdropUK>
      <App />
    </NewsBackdropUK>
  ),
};
```

---

## 4. Capture script

`apps/extension/scripts/capture-store-screenshots.mts`:

1. `storybook build -o storybook-static` (skip when invoked with `--no-build`).
2. Spin up a local static server on port 4325 against `storybook-static/`.
3. Read `storybook-static/index.json`; filter entries whose `title` starts with `Marketplace/Screenshots/`.
4. For each entry: launch Playwright Chromium at `viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1`, navigate to `http://localhost:4325/iframe.html?viewMode=story&id=${entry.id}`, `await page.evaluate(() => document.fonts.ready)`, wait for network idle, screenshot.
5. Filename derivation:
   - `Marketplace/Screenshots/PopupOnNews` story `English` → `screenshots/en/01-popup-on-news.png`
   - The numeric prefix comes from `parameters.screenshotIndex` on the scene's `meta`.
   - The slug comes from the scene title kebab-cased: `PopupOnNews` → `popup-on-news`.
   - The locale comes from the story name (`English` → `en`, `Ukrainian` → `uk`).
6. Cleanup: stop server, `browser.close()`.

Not added to `verify:release` — on-demand only. Future-us can lift this
into CI once the pipeline is proven; baking it in from the start risks
gating PRs on Manrope font availability in the CI image.

---

## 5. Package scripts

```jsonc
// apps/extension/package.json (additions)
"storybook":                  "storybook dev -p 6008 --no-open",
"build-storybook":            "storybook build -o storybook-static",
"capture:store-screenshots":  "tsx scripts/capture-store-screenshots.mts",
```

`generate-icons.mts` keeps the existing `icons` script name; the
store-asset pass is folded into the same invocation (or split as a
`--emit=store` flag — implementer's call, but a single script with one
output target is preferred).

---

## 6. PR phasing

> **Status (2026-05):** PR1 and PR2 have both shipped. PR3 generalised
> the capture script beyond the marketplace prefix (see the 2026-05
> note at the top). This section is preserved as the original sequencing
> record.

### PR1 — pipeline + UK ports

Land everything that does not depend on new EN design work.

- New `apps/extension/.storybook/` config (mirror `apps/marketing/.storybook/`).
- Refactor [`preview/preview-shim.js`](../preview/preview-shim.js) → shared TS mock at `src/test/browser-mock.ts` + a vanilla-JS facade preserving the static-serve consumer.
- `withBrowserMock` decorator at `.storybook/decorators/with-browser-mock.tsx`.
- Port 5 existing HTML backdrops → React: `news-uk`, `site-ru`, `site-uk`, `picker-uk`, `serp-uk`. Inline `<style>` blocks, 1:1 markup from the existing HTML.
- 4 UK-only stories. Each scene file declares both `English` and `Ukrainian` exports; `English` is wired to a placeholder (e.g. a `TODO` backdrop) and marked `tags: ['skip-capture']` so the capture script ignores it until PR2.
- Extended [`generate-icons.mts`](../scripts/generate-icons.mts) emits the per-store pictograms.
- New `capture-store-screenshots.mts` script.
- Delete [`storyboards/*.html`](./storyboards/) and the `preview:storyboards` package script.
- Rewrite [`README.md`](./README.md) (current screenshot capture recipe) and update [`REQUIREMENTS.md`](./REQUIREMENTS.md) §5 / §6 to describe the new pipeline.
- Commit: **4 UK screenshot PNGs + 4 store-pictogram PNGs**.

After PR1, the repo is in a shippable state — UK PNGs serve as the
global screenshot set on AMO and CWS via their default-locale fallback,
matching the _current_ REQUIREMENTS.md plan (all UA scenes).

### PR2 — EN design

- 4 new EN backdrop components: `news-en`, `site-en`, `picker-en`, `serp-en`. Each is a different fictitious brand with its own typography + palette (per §7.4 option b).
- Replace each scene's `English` story render (drop `skip-capture`).
- Re-run capture; commit 4 EN screenshot PNGs.
- Update REQUIREMENTS.md §6 status table to mark EN deliverables green.

---

## 7. References

| What                                         | Where                                                                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketplace listing requirements             | [`REQUIREMENTS.md`](./REQUIREMENTS.md)                                                                                                                                                                     |
| Current capture recipe                       | [`README.md`](./README.md)                                                                                                                                                                                 |
| Existing static-serve preview pattern        | [`../preview/README.md`](../preview/README.md), [`../preview/preview-shim.js`](../preview/preview-shim.js)                                                                                                 |
| Existing icon rasteriser                     | [`../scripts/generate-icons.mts`](../scripts/generate-icons.mts)                                                                                                                                           |
| Marketing Storybook config (pattern to copy) | [`../../marketing/.storybook/main.ts`](../../marketing/.storybook/main.ts)                                                                                                                                 |
| UI Storybook config (pattern to copy)        | [`../../../packages/ui/.storybook/main.ts`](../../../packages/ui/.storybook/main.ts)                                                                                                                       |
| Popup entry point                            | [`../src/entrypoints/popup/App.tsx`](../src/entrypoints/popup/App.tsx)                                                                                                                                     |
| WebExtension API surface used by popup       | [`../src/lib/settings.ts`](../src/lib/settings.ts), [`../src/lib/pause.ts`](../src/lib/pause.ts), [`../src/lib/events.ts`](../src/lib/events.ts), [`../src/lib/i18n/index.tsx`](../src/lib/i18n/index.tsx) |
| AMO listing guidelines (vendored)            | [`../../../docs/firefox-amo-listing-guidelines.md`](../../../docs/firefox-amo-listing-guidelines.md)                                                                                                       |
