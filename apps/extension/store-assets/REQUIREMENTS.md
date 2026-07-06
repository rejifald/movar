# Movar marketplace listing — requirements

Single source of truth for what we ship to AMO and the Chrome Web Store for
Movar **v1.0.0**. Drafted on `feat/amo-readiness`.

Sibling docs:

- [`README.md`](./README.md) — screenshot capture recipe.
- [`../STORE-LISTING.md`](../STORE-LISTING.md) — earlier copy draft; **superseded** by the copy plan in §4 below, kept until new copy files land.
- [`../../../deployment-checklist.md`](../../../deployment-checklist.md) — pre-submission checklist (icons, permission justifications, source map).

---

## 1. Decisions locked this round

| Question           | Decision                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Which stores?      | **AMO + Chrome Web Store + Edge Add-ons.** Edge ships from the same Chrome MV3 zip; Edge-specific listing copy / privacy form / asset checklist live under [`edge/`](./edge/). |
| Copy baseline      | **Rewrite from scratch.** [`STORE-LISTING.md`](../STORE-LISTING.md) is reference only; final copy lives in `copy/` (see §4).                                                   |
| Locales            | **English + Ukrainian.** No Russian.                                                                                                                                           |
| Roadmap            | [Priority-driven switching](../../../docs/priority-driven-switching.md) is teased as **"coming soon"** in one line at the bottom of the long description. Not the lead.        |
| Lead audience      | **Split per locale.** EN leads with multilingual-user framing; UK leads with the UA→RU pain. Same product, two arcs.                                                           |
| AMO default locale | **English.** UK serves uk-locale browsers; EN is the global fallback.                                                                                                          |
| Tone               | **Calm, neighbourly.** Keep "Keep the internet in your language." voice — matches the privacy policy.                                                                          |

## 2. Positioning per locale

Both locales describe the same product and the same v1 feature set. They
diverge in lead framing, opening hook, and emphasis. Body claims about what
Movar does must stay identical in substance — only the framing differs.

### English (default)

- **Lead audience**: multilingual users who want one preferred language enforced across search and content.
- **Headline**: _Keep the internet in your language._
- **Opening hook**: generic — search results that ignore your preferred language; sites that serve the wrong locale.
- **Pain example**: a sentence on Cyrillic searches surfacing the wrong language; UA→RU is _an_ example, not _the_ example.
- **Closing line**: roadmap teaser ("Priority-driven switching is coming.").

### Ukrainian

- **Lead audience**: Ukrainian speakers tired of UA sites defaulting to RU and Google surfacing RU results.
- **Headline**: _Налаштуйте інтернет на рідну мову._ (matches the marketing hero in [`apps/marketing/src/i18n.ts`](../../../apps/marketing/src/i18n.ts)).
- **Opening hook**: concrete — the UA site that flips to RU on the second click; the Google result page that pretends you can't read Ukrainian.
- **Pain example**: UA→RU is the primary example; multilingual framing is a secondary "and it works for other languages too" line.
- **Closing line**: roadmap teaser in Ukrainian.

> **Maintenance guard rail**: the two locales must agree on every factual
> claim (supported engines, supported languages, permissions, privacy
> guarantees). Edits to one are not finished until the other is verified.

## 3. Slot inventory per store

| Slot                           | AMO                                                                       | Chrome Web Store                                                                                       | Edge Add-ons                                                                                                                                               | Source / status                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Name                           | "Movar"                                                                   | "Movar"                                                                                                | "Movar" (sourced from manifest, read-only in Partner Center)                                                                                               | `__MSG_extName__`, both locales                                                                                            |
| Summary (short)                | ≤250, write to ~200                                                       | **≤132** (tight constraint)                                                                            | **≤132** (sourced from manifest `description` — read-only in Partner Center; same string as CWS)                                                           | `copy/summary.{en,uk}.md` ✅                                                                                               |
| Description (long)             | ≤15,000                                                                   | ≤16,000                                                                                                | **250–10,000**, plain text only                                                                                                                            | `copy/description.{en,uk}.md` ✅                                                                                           |
| Icon                           | 128×128 PNG                                                               | 128×128 PNG                                                                                            | 300×300 recommended, 128×128 minimum (1:1 PNG)                                                                                                             | reuse `chrome/icon-128.png`; 300×300 upgrade per [`edge/ASSETS.md`](./edge/ASSETS.md) §2                                   |
| Screenshots                    | up to 10, max 2400×1800                                                   | 1–5, **1280×800 or 640×400**                                                                           | 1–6, 1280×800 or 640×480 PNG                                                                                                                               | reuse `screenshots/{en,uk}/*.png` (already at 1280×800)                                                                    |
| Promo tile                     | n/a                                                                       | **440×280** required                                                                                   | 440×280 small (optional) + 1400×560 large (optional)                                                                                                       | reuse `chrome/promo-tile-440x280.png`; 1400×560 production noted in [`edge/ASSETS.md`](./edge/ASSETS.md) §5                |
| Default locale                 | English                                                                   | English (CWS shows one main body globally; UK reaches uk-locale users only via store translation pass) | English (multi-locale; "Add a language" dropdown is dynamically populated from the zip's `_locales/` folders)                                              | —                                                                                                                          |
| Category (primary)             | **Productivity** ✅                                                       | **Productivity** ✅                                                                                    | **Productivity** ✅                                                                                                                                        | locked                                                                                                                     |
| Category (secondary, AMO only) | **Privacy & Security** ✅                                                 | n/a                                                                                                    | n/a                                                                                                                                                        | locked                                                                                                                     |
| Tags / search terms            | AMO tags: `language`, `ukrainian`, `search`, `multilingual`, `privacy` ✅ | n/a                                                                                                    | Search terms field: ≤7 terms, ≤21 words total, ≤30 chars/term, per language (not user-visible) — draft pending per [`edge/ASSETS.md`](./edge/ASSETS.md) §5 | locked for AMO; Edge open                                                                                                  |
| Privacy policy URL             | `https://movar.fyi/privacy` ✅                                            | same                                                                                                   | same                                                                                                                                                       | live (HTTP 200)                                                                                                            |
| Homepage URL                   | `https://movar.fyi` ✅                                                    | same                                                                                                   | same                                                                                                                                                       | live (HTTP 200)                                                                                                            |
| Support contact                | `support@movar.fyi`                                                       | same                                                                                                   | same                                                                                                                                                       | also used in-product (`FEEDBACK_URL`) and in privacy policies                                                              |
| License                        | MIT                                                                       | n/a                                                                                                    | n/a                                                                                                                                                        | ✅                                                                                                                         |
| Data declaration               | `data_collection_permissions: ['none']` ✅                                | "User data" form: collects nothing                                                                     | Privacy page: no data-usage categories ticked + all certifications affirmed per [`edge/PRIVACY-FORM.md`](./edge/PRIVACY-FORM.md)                           | confirm against the live Partner Center form on submit (Microsoft's exact label strings are only shown in a UI screenshot) |
| Min browser version            | Firefox 113 (set) ✅                                                      | Chrome 109 (default MV3 floor)                                                                         | Edge 109 (Chromium-based, default MV3 floor)                                                                                                               | —                                                                                                                          |

## 4. Copy plan

New file layout under `store-assets/copy/` (to create):

```
store-assets/copy/
  summary.en.md       # both AMO (≤250) and CWS (≤132) variants in one file
  summary.uk.md       # same
  description.en.md   # long description, store-agnostic
  description.uk.md   # same
  teaser-roadmap.md   # the "coming soon" line in EN + UK, referenced by both descriptions
```

Each summary file holds two clearly marked variants:

```md
## CWS (≤132)

…line that fits 132…

## AMO (≤200 target / ≤250 hard cap)

…longer line that can breathe…
```

Long descriptions are written once per locale and reused across stores
verbatim — the char ceiling on AMO (15k) is the tighter one and both fit
comfortably under 3k. Section order, locked — kept in step with the
marketing site's section flow ([`apps/marketing/src/pages/index.astro`](../../../apps/marketing/src/pages/index.astro):
hero → How it works → Examples → Privacy):

1. One-paragraph value framing (locale-specific lead per §2).
2. **What it does** — bullets mirroring the marketing two-step model ([`HowItWorks`](../../../apps/marketing/src/i18n.ts)): declare your language to search engines (URL rewrites), switch multilingual sites to your language (auto / one-click redirect), and an optional content filter that conceals blocked-language posts/results — behind a curtain or hidden outright — and prunes unwanted on-site picker options (off by default, nothing translated — gated on `contentModification`, see [`packages/settings/src/index.ts`](../../../packages/settings/src/index.ts)).
3. **Examples** — four concrete before/after outcomes mirroring the marketing Examples section and the screenshot set (§5): Google Cyrillic search, Google summary card (_God of War_), YouTube recommendations, a multilingual shop. Framed illustratively in EN (UA→RU is _an_ example), concretely in UK.
4. **Supported search engines** — Google ccTLD list, Bing, DuckDuckGo, YouTube. Single source of truth: [`packages/host-match/src/index.ts`](../../../packages/host-match/src/index.ts).
5. **Languages offered** — UA, EN, DE, FR, ES, IT, PL. Same source as above.
6. **How it works** — three short bullets (pick language → applies automatically → popup for status/pause/settings; the content filter toggles here).
7. **Privacy** — no account, no telemetry, all local, nothing translated. Restate the privacy policy headline; link out.
8. **Open source** — MIT, link to repo once public.
9. **Coming soon** — one-line tease for priority-driven (ranked-list) switching — distinct from the now-shipped content filter in §2.

## 5. Screenshot set

Seven scenes, captured at **1280×800** (works for both AMO and CWS).
**All synthetic** — each scene composes the real Movar popup component
(or, for the website scenes, a Google / YouTube / shop-illustrative
frame) over a per-locale React backdrop that mocks a fictitious
third-party site. We never reproduce a real third-party brand verbatim,
never depend on a real site's HTML holding still, and never accidentally
leak personal browsing context.

Scene #5 (Knowledge Panel) is UK-only because its premise — Google
falling back to English without an `hl` hint — produces no observable
before/after delta when the user's priority language is already English
(see the row note below); the other scenes are bilingual. The website
scenes (#3 search-rewrite, #5 knowledge-panel, #6 youtube, #7 shop) also
emit a `-dark` sibling per locale, captured under
`prefers-color-scheme: dark`. A listing displays one theme at a time,
and the Chrome Web Store shows up to ~5 screenshots, so the seven-scene
set is curated per store (AMO allows more).

The pipeline lives in Storybook + Playwright per
[`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md). Per-locale
PNGs land under `screenshots/{en,uk}/`. The captured PNGs are committed
to git so PRs show the screenshot diff; the capture script
(`pnpm --filter @movar/extension capture:storybook-assets`) regenerates
them on demand.

| #   | File                        | Story                                     | Layout                                                                                   | Composition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `01-popup-on-news.png`      | Popup on a news page                      | full 1280×800 canvas, popup at bottom-right                                              | `news-{en,uk}.tsx` backdrop + real Movar popup (`App.tsx`) showing its live per-page status                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | `02-correction-applied.png` | Site language: before/after               | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half (no popup overlay) | `site-ru.tsx` (before) on the left; `site-{en,uk}.tsx` (after) on the right; "Without Movar" / "With Movar" captions                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | `03-search-rewrite.png`     | Google rewrite: before/after              | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half                    | Two `google-serp-frame.tsx` renders. Same UI language across halves (matches story locale), same Cyrillic query (`новини війни`), same chrome. Only the URL params (`&hl=…&lr=lang_…` highlighted on the After half) and the result list change.                                                                                                                                                                                                                                                                             |
| 4   | `04-language-dialog.png`    | Language dialog: before/after             | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half                    | `voya-frame.tsx` renders a fictitious travel site (_Voya_). Before half: site in Russian with a centered language-selection modal blocking the page. After half: same site at the same URL, in the user's locale, no modal — Movar's Accept-Language header let Voya skip the prompt.                                                                                                                                                                                                                                        |
| 5   | `05-knowledge-panel.png`    | Knowledge Panel: before/after _(UK only)_ | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half                    | Two `google-knowledge-frame.tsx` renders sharing the `google-god-of-war-{with,without}-movar` backdrops with the marketing diptych. Both halves: same Latin-script query (`God of War`), same UI chrome. Before half: bare `?q=…` URL, Google falls back to an English entity panel. After half: `&hl=uk&lr=lang_uk` highlighted in the URL bar, Knowledge Panel and results column localise to Ukrainian. **EN listing skips this scene** — its premise doesn't apply when the user's priority language is already English. |
| 6   | `06-youtube.png`            | YouTube recommendations: before/after     | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half                    | Two `youtube-frame.tsx` renders sharing the `youtube-{without,with}-movar` backdrops with the marketing pair. Same Ukrainian UI, same Cyrillic query (`новини`), same URL across halves — Movar steers YouTube via language/region hints, not a visible URL rewrite. Before half: Russian-leaning channels. After half: Ukrainian creators. YouTube wordmark is an editorial approximation (red play tile + plain "YouTube"), channels fictitious.                                                                           |
| 7   | `07-shop.png`               | Ukrainian online shop: before/after       | horizontal 1280×800 diptych via `BeforeAfterFrame`, captions per half                    | Two `shop-frame.tsx` renders of the fictitious shop _Крамко_ (`.example`) sharing the `shop-{without,with}-movar` backdrops with the marketing pair. Before half: Russian edition (`/ru/`, РУ pill active). After half: Movar's Accept-Language hint opens the Ukrainian edition (`/ua/` highlighted, УК pill active) and the whole page localises.                                                                                                                                                                          |

The picker-survivor scene was retired — its narrative ("Movar hid a
blocked-language option from a real picker") wasn't materially different
from the site-correction story for marketplace purposes, and the inline
tooltip surface didn't survive thumbnail-scale reproduction in the CWS /
AMO grids.

### Synthetic guard rails

- **No fake URLs that look like real domains** for the fictitious-site scenes — use the IANA-reserved `.example` TLD or transparent placeholders (e.g., `newssite.example`, `kramko.example/ua/…`). The exceptions are the real platforms the scenes illustrate: the search-rewrite and knowledge-panel URL bars (`google.com.ua/search?q=…`), where the point is that Movar appends `hl/lr` to a real Google query, and the YouTube scene (`youtube.com/results?search_query=…`), shown identically on both halves since Movar steers YouTube via request hints, not a URL rewrite.
- **No literal third-party logos.** The website scenes reuse editorial-illustration frames (`google-serp-frame.tsx`, `google-knowledge-frame.tsx`, `youtube-frame.tsx`) — approximated wordmarks (a coloured `Google`; a red play tile + plain `YouTube`), fictitious `.example` domains, no trademarked marks; the same approximations back the marketing pairs in `apps/marketing/src/components/Examples.astro`. The Knowledge Panel's "hero" strip and the YouTube thumbnails are abstract gradient tiles, not literal reproductions of any real artwork. The shop scene (`shop-frame.tsx`) is a wholly invented brand (_Крамко_).
- **Before/after diptychs hold UI variables constant.** Both halves of scenes #2 and #3 share the same site/Google UI language, same query, same chrome. Only the URL params and the resulting content language change between halves. The story is "same user did nothing different except install Movar," not "Movar redesigned the page."
- **Per-scene bespoke visual identity** (decision §7.4 option b). Scenes #1, #2, #4, and #7 are different fictitious brands (_Світанок_ news site, _Tochka24_ services site, _Voya_ travel site, _Крамко_ online shop) with their own typography + palette — the variety reads as the user's own browsing. The platform scenes (#3/#5 Google, #6 YouTube) are editorial approximations of the real services they illustrate.
- **Real Movar UI must stay real.** The popup-on-news scene's popup is the production `App` component from `src/entrypoints/popup/App.tsx`. The `withBrowserMock` decorator exercises the same `installBrowserMock` mock as the static-serve preview shim — no second copy of the mock surface exists.

### Popup-clip drift guard

Because the popup is the **real** production component, it changes height as
the product evolves — e.g. the conceal-mode (curtain vs. hide) picker landed
under the content filter and made the popup noticeably taller. Every scene that
embeds the popup pins it into a frame, and the fixed-size frames can crop a
grown popup (header off the top, footer off the bottom) without any obvious
error. The capture pipeline guards against this:

- The popup root carries `data-testid="popup-root"` (`src/entrypoints/popup/App.tsx`).
- `scripts/capture-storybook-assets.mts` measures that element's on-screen
  bounding box (post-`transform`, where it actually lands) after each
  fixed-canvas capture and asserts it sits inside the viewport. It's a geometry
  check, not `scrollHeight` vs. `clientHeight`: the frames clip via an ancestor
  `overflow: hidden` plus a CSS `scale()`, so the popup's own scroll/client
  heights stay equal even when it spills past the canvas.
- On overflow it prints a GitHub Actions `::error::` annotation per clipped
  scene and exits non-zero (after still writing every PNG, so the crop is
  visible in the diff). **Trigger:** any change that grows the popup past a
  frame fails the next `pnpm --filter @movar/extension screenshots` run.

**When it fires, re-fit the frame — don't shrink the popup more than needed:**

- **Landscape** (`storyboards/backdrops/news-{en,uk}.tsx`, the `.popup-slot`):
  fixed **1280×800** canvas (CWS/AMO accept only 1280×800 or 640×400). The
  popup renders at 100% anchored bottom-right; it currently fits with margin.
  If it grows past ~750px tall it can't fit at full size here — that's a
  product-design signal, not a frame tweak.
- **Marketing popup** (`storyboards/marketing/popup.stories.tsx`): the frame is
  flexible. It now self-fits via `useMeasuredHeight` — grow `FRAME_HEIGHT`
  before lowering the scale cap.
- **iOS / iPad single-panel** (`storyboards/backdrops/portrait-single-panel-frame.tsx`):
  fixed device sizes (below). The popup is scaled to ~62% of the canvas width
  but capped to `POPUP_MAX_HEIGHT_FRACTION` of the canvas height, measuring the
  popup so it tracks growth automatically — the height cap is what keeps the
  (wider) iPad from scaling the tall popup up until its header clips.

### iOS / iPad App Store portrait set

The same seven scenes also ship to the **Safari extension's App Store listing** in portrait, at Apple's fixed device sizes — **iPhone 6.9″ 1320×2868** and **iPad 13″ 2048×2732** (App Store rejects off-spec dimensions). The landscape 1280×800 set above is reused verbatim for the **macOS** App Store (1280×800 is a valid Mac size); only iOS/iPad need the portrait re-layout.

**Device-tier rule (enforced).** Every screenshot surface renders the fake website in the layout that matches its device — **phone screenshots show the phone layout, tablet the tablet layout, desktop the desktop layout**. It is not declared per scene: each frame derives the tier from its canvas width (`storyboards/device-tiers.ts`) and stamps `movar-device-{phone,tablet,desktop}` on the scaled-content wrapper, and every backdrop carries tier-scoped CSS (`.movar-device-phone .movar-backdrop-*`, …) that selects the matching layout — desktop is the base, phone/tablet are overrides. New scenes inherit this automatically; `storyboards/device-tiers.test.tsx` guards the width→tier map and the frame's class stamp. **When you add or edit a backdrop, give it phone + tablet layouts** — author the phone layout at ~520px and the tablet at ~1024px composition width so it scales to a dense phone / @2x iPad render, not a blown-up desktop page.

- **Frames** (`storyboards/backdrops/`): `portrait-before-after-frame.tsx` stacks the before/after vertically under a localized marketing hero (the six diptych scenes #2–#7); `portrait-single-panel-frame.tsx` does hero + page with an overlaid popup (scene #1). Both reuse the exact same backdrop components as the landscape scenes — only the surrounding frame and the hero headline differ.
- **Specs** (`storyboards/scenes/`): `portrait-diptych-scenes.tsx` holds the shared per-scene before/after spec consumed by both device sizes (the search-rewrite SERP content lives here too); `popup-on-news-scene.tsx` holds the popup scene's mock + render.
- **Stories**: thin per-device files under `storyboards/stories/{ios,ipad}/`, titled `Marketplace/{IOSScreenshots,IPadScreenshots}/<Scene>`, each feeding its device size into the shared spec. Story name `English`/`Ukrainian` → locale; `parameters.screenshotIndex` → `{NN}-slug` filename (mirrors the landscape convention).
- **Output**: `screenshots/ios/{en,uk}/` and `screenshots/ipad/{en,uk}/`. Capture with `pnpm --filter @movar/extension exec tsx scripts/capture-storybook-assets.mts --only=Marketplace/IOSScreenshots/` (then `--no-build --only=Marketplace/IPadScreenshots/`). The `--only=<title-prefix>` flag scopes a run to one prefix so iterating never rewrites the committed landscape/marketing PNGs.
- **Curation**: App Store allows up to 10 per device per localization; ship one theme per scene (light), keeping dark variants as alternates. Scene #5 stays UK-only for the same reason as the landscape set.

## 6. Assets to produce

Tracked here so nothing slips between this doc and the deployment checklist.

| Item                                                     | Path                                                                                                                                    | Owner       | Blocker?                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| Summary EN (CWS + AMO variants)                          | `copy/summary.en.md`                                                                                                                    | copy        | first draft ✅                                                                               |
| Summary UK (CWS + AMO variants)                          | `copy/summary.uk.md`                                                                                                                    | copy        | pending EN sign-off                                                                          |
| Long description EN                                      | `copy/description.en.md`                                                                                                                | copy        | first draft ✅                                                                               |
| Long description UK                                      | `copy/description.uk.md`                                                                                                                | copy        | pending EN sign-off                                                                          |
| Roadmap teaser EN + UK                                   | `copy/teaser-roadmap.md`                                                                                                                | copy        | first draft ✅                                                                               |
| Storybook pipeline (decorator, capture script)           | `STORYBOOK-PIPELINE-PLAN.md`, plus code                                                                                                 | design+code | ✅ PR1                                                                                       |
| UK backdrop components                                   | `storyboards/backdrops/{news,site-ru,site-uk,voya-uk}.tsx` + shared `before-after-frame.tsx`, `google-serp-frame.tsx`, `voya-frame.tsx` | design+code | ✅ PR1                                                                                       |
| EN backdrop components                                   | `storyboards/backdrops/{news,site,voya}-en.tsx`                                                                                         | design+code | ✅                                                                                           |
| Screenshot #1 popup-on-news (UK)                         | `screenshots/uk/01-popup-on-news.png`                                                                                                   | capture     | ✅ PR1                                                                                       |
| Screenshot #2 correction-applied (UK)                    | `screenshots/uk/02-correction-applied.png`                                                                                              | capture     | regenerate after diptych rebuild                                                             |
| Screenshot #3 search-rewrite (UK)                        | `screenshots/uk/03-search-rewrite.png`                                                                                                  | capture     | regenerate after diptych rebuild                                                             |
| Screenshot #4 language-dialog (UK)                       | `screenshots/uk/04-language-dialog.png`                                                                                                 | capture     | new — needs capture                                                                          |
| Screenshot #1 popup-on-news (EN)                         | `screenshots/en/01-popup-on-news.png`                                                                                                   | capture     | ✅                                                                                           |
| Screenshot #2 correction-applied (EN)                    | `screenshots/en/02-correction-applied.png`                                                                                              | capture     | regenerate after diptych rebuild                                                             |
| Screenshot #3 search-rewrite (EN)                        | `screenshots/en/03-search-rewrite.png`                                                                                                  | capture     | regenerate after diptych rebuild                                                             |
| Screenshot #4 language-dialog (EN)                       | `screenshots/en/04-language-dialog.png`                                                                                                 | capture     | new — needs capture                                                                          |
| Screenshot #5 knowledge-panel (UK)                       | `screenshots/uk/05-knowledge-panel.png`                                                                                                 | capture     | new — needs capture; UK-only (see §5)                                                        |
| Screenshot #6 youtube (UK + EN, + `-dark`)               | `screenshots/{uk,en}/06-youtube.png`                                                                                                    | capture     | new — needs capture                                                                          |
| Screenshot #7 shop (UK + EN, + `-dark`)                  | `screenshots/{uk,en}/07-shop.png`                                                                                                       | capture     | new — needs capture                                                                          |
| AMO pictogram 32                                         | `firefox/icon-32.png`                                                                                                                   | code        | ✅ PR1                                                                                       |
| AMO pictogram 64                                         | `firefox/icon-64.png`                                                                                                                   | code        | ✅ PR1                                                                                       |
| AMO pictogram 128                                        | `firefox/icon-128.png`                                                                                                                  | code        | ✅ PR1                                                                                       |
| CWS pictogram 128                                        | `chrome/icon-128.png`                                                                                                                   | code        | ✅ PR1                                                                                       |
| Chrome promo tile                                        | `chrome/promo-tile-440x280.png`                                                                                                         | capture     | ✅ (rendered from `Marketplace/Promo/ChromeTile` by `capture:storybook-assets`)              |
| Privacy policy live URL                                  | `https://movar.fyi/privacy`                                                                                                             | infra       | ✅ live (HTTP 200)                                                                           |
| Homepage live URL                                        | `https://movar.fyi`                                                                                                                     | infra       | ✅ live (HTTP 200)                                                                           |
| Public source repo URL                                   | GitHub                                                                                                                                  | infra       | repo currently private                                                                       |
| Edge listing copy (EN summary + long desc Edge variants) | `copy/summary.en.md` "Edge" section + `copy/description.en.md` reused                                                                   | copy        | ✅                                                                                           |
| Edge listing copy (UK summary + long desc)               | `copy/summary.uk.md` (all three variants) + `copy/description.uk.md`                                                                    | copy        | ✅                                                                                           |
| Edge Privacy page copy                                   | `edge/PRIVACY-FORM.md`                                                                                                                  | copy        | ✅ (data-category labels need on-form verification — see file open items)                    |
| Edge assets / manual-submission checklist                | `edge/ASSETS.md`                                                                                                                        | docs        | ✅                                                                                           |
| Edge logo (300×300 recommended upgrade)                  | `edge/icon-300.png`                                                                                                                     | code        | open — add `300` to `scripts/generate-icons.mts` per [`edge/ASSETS.md`](./edge/ASSETS.md) §2 |
| Edge large promotional tile (1400×560)                   | `edge/promo-tile-1400x560.png`                                                                                                          | capture     | open — new Storybook story per [`edge/ASSETS.md`](./edge/ASSETS.md) §5                       |
| Edge search terms (EN + UK)                              | Partner Center form (≤7 terms / ≤21 words / ≤30 chars per term, per language)                                                           | copy        | open — see [`edge/ASSETS.md`](./edge/ASSETS.md) §5                                           |

## 7. Open items / blockers

1. **`movar.fyi` DNS + Pages deploy.** _Resolved._ Privacy
   (<https://movar.fyi/privacy>), Homepage (<https://movar.fyi>), and UK
   privacy variant (<https://movar.fyi/uk/privacy>) all return HTTP 200.
   `support@movar.fyi` mailbox is provisioned (privateemail.com MX) and is
   used everywhere as the contact / feedback inbox (`FEEDBACK_URL`,
   marketing site, privacy policies, store listing).

2. **Public source repo.** AMO does not require source to be public.
   The privacy policy no longer makes a forward-looking promise about a
   GitHub link; when the repo opens, add the link to
   [`Footer.astro`](../../../marketing/src/components/Footer.astro)
   alongside Privacy / Download / Feedback. No privacy-policy edit
   needed at that point.

3. **Categories and tags confirmation.** _Resolved._ Locked at AMO
   primary **Productivity**, AMO secondary **Privacy & Security**, AMO
   tags `language`, `ukrainian`, `search`, `multilingual`, `privacy`;
   CWS primary **Productivity** (CWS exposes one category, no tags).

4. **Storyboard visual identity** — _resolved._ Picked option **(b)** —
   each backdrop is a different fictitious brand with its own typography
   and palette, so the four shots read as the user's own browsing across
   unrelated sites. Implemented in
   [`STORYBOOK-PIPELINE-PLAN.md`](./STORYBOOK-PIPELINE-PLAN.md); the
   five UK backdrop components land in PR1 (`storyboards/backdrops/*`),
   the four EN counterparts in PR2.

5. **Edge Add-ons.** _Resolved._ Now in scope. Edge ships from the same
   Chrome MV3 zip (`pnpm --filter @movar/extension zip`) and reuses the
   1280×800 screenshots + the 440×280 CWS promo tile. Edge-specific
   artifacts: listing copy "Edge" variants in
   [`copy/summary.{en,uk}.md`](./copy/) (CWS line reused — both stores
   share a 132-char cap), Privacy page copy at
   [`edge/PRIVACY-FORM.md`](./edge/PRIVACY-FORM.md), and the manual
   first-submission walkthrough + assets checklist at
   [`edge/ASSETS.md`](./edge/ASSETS.md). The release-edge job in
   [`.github/workflows/release.yml`](../../../.github/workflows/release.yml)
   auto-publishes subsequent versions via the Edge Add-ons API v1.1
   (API-key auth — see
   [`docs/release-credentials.md`](../../../docs/release-credentials.md)
   § Edge Add-ons). First submission must still be manual to mint
   `EDGE_PRODUCT_ID`.

## 8. Out of scope for v1 listing

- Russian-language listing.
- Options/settings screenshot — leaner positioning, configurability isn't the lead.
- Marketing-hero screenshot of the movar.fyi homepage (was in old spec).
- HiddenPanel screenshot (was optional in old spec).
- Priority-driven switching as a primary feature — teased only.
- A `/marketplace` page on movar.fyi (separate marketing-site work).

## 9. References in this repo

| What                                      | Where                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| Manifest config                           | [`apps/extension/wxt.config.ts`](../../wxt.config.ts)                                       |
| Locale strings                            | [`apps/extension/src/public/_locales/{en,uk}/messages.json`](../../src/public/_locales)     |
| Existing copy draft (to be superseded)    | [`apps/extension/STORE-LISTING.md`](../STORE-LISTING.md)                                    |
| Screenshot capture recipe                 | [`apps/extension/store-assets/README.md`](./README.md)                                      |
| Permission justifications                 | [`deployment-checklist.md`](../../../deployment-checklist.md)                               |
| Privacy policy source                     | [`apps/marketing/src/pages/privacy.astro`](../../../apps/marketing/src/pages/privacy.astro) |
| Source map for AMO reviewers              | [`apps/extension/SOURCE.md`](../../SOURCE.md)                                               |
| Rules & supported engines source of truth | [`packages/host-match/src/index.ts`](../../../packages/host-match/src/index.ts)             |
| Priority-driven switching proposal        | [`docs/priority-driven-switching.md`](../../../docs/priority-driven-switching.md)           |
