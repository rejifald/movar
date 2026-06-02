# Microsoft Edge Add-ons — assets checklist

The Edge-specific listing checklist for Movar. Edge accepts the same
Chrome MV3 zip as our upload artifact (confirmed in
[`deployment-checklist.md`](../../../../deployment-checklist.md)
§ Per-store accounts & artifacts), so this file is a thin Edge-specific
shim over the slot inventory rather than a parallel asset pipeline.

Sibling docs:

- [`../REQUIREMENTS.md`](../REQUIREMENTS.md) — single source of truth for slot inventory (§3) and assets-to-produce (§6).
- [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) — Edge Partner Center Privacy page copy (Single Purpose, Permission justifications, Remote Code, Data Usage, Privacy Policy URL).
- [`../../../../deployment-checklist.md`](../../../../deployment-checklist.md) — top-level pre-submission checklist (icons, zip, source map, permissions).
- [`../../../../docs/release-credentials.md`](../../../../docs/release-credentials.md) — `EDGE_*` GitHub secrets the release workflow consumes.

Authoritative store-side reference (read this before changing any of the
dimensions below):

- Edge Add-ons "Extension images and text" — <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension>
- Edge Add-ons "Publish an extension to Microsoft Edge Add-ons" (Properties + Availability + Privacy pages) — <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension>

---

## 1. Asset requirements

| Asset                      | Required                                               | Dimensions                                       | Format | Status                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------------------ | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension logo             | required (per language)                                | 300×300 recommended; 128×128 minimum; 1:1 aspect | PNG    | reused: [`../chrome/icon-128.png`](../chrome/icon-128.png) at the 128×128 minimum. Optional upgrade to 300×300 noted in §2.                                                                                                                                                     |
| Screenshots                | optional, max 6 per language                           | 1280×800 OR 640×480                              | PNG    | reused: [`../screenshots/en/*.png`](../screenshots/en/) (4 shots) and [`../screenshots/uk/*.png`](../screenshots/uk/) (5 shots) — already rendered at 1280×800                                                                                                                  |
| Small promotional tile     | optional                                               | 440×280                                          | PNG    | reused: [`../chrome/promo-tile-440x280.png`](../chrome/promo-tile-440x280.png) — Chrome's CWS small promo tile lands on Edge's exact dimensions                                                                                                                                 |
| Large promotional tile     | optional                                               | 1400×560                                         | PNG    | needs production via `pnpm --filter @movar/extension capture:storybook-assets` after a new `Marketplace/Promo/EdgeLargeTile` story is added — see §2 and §5                                                                                                                     |
| YouTube promo video URL    | optional                                               | n/a (URL only)                                   | n/a    | n/a for v1 — no video produced                                                                                                                                                                                                                                                  |
| Extension name             | required for ≥1 language                               | sourced from manifest `__MSG_extensionName__`    | text   | reused: [`../../src/public/_locales/{en,uk}/messages.json`](../../src/public/_locales/) `extName` — read-only in Partner Center, only editable via re-upload                                                                                                                    |
| Short description          | required for ≥1 language                               | ≤132 chars, plain text                           | text   | reused: manifest `__MSG_extensionDescription__` keyed via [`../copy/summary.en.md`](../copy/summary.en.md) "Edge" section (CWS line reused verbatim, 122 chars) and [`../copy/summary.uk.md`](../copy/summary.uk.md) — read-only in Partner Center, only editable via re-upload |
| Long description           | required per language                                  | 250–10,000 chars, plain text                     | text   | reused: [`../copy/description.en.md`](../copy/description.en.md), [`../copy/description.uk.md`](../copy/description.uk.md) — paste verbatim into Partner Center                                                                                                                 |
| Search terms               | optional, per language                                 | ≤7 terms / ≤21 words total / ≤30 chars per term  | text   | needs production — derive from REQUIREMENTS.md §3 AMO tags (`language`, `ukrainian`, `search`, `multilingual`, `privacy`); decision below in §5                                                                                                                                 |
| Category                   | required                                               | dropdown                                         | n/a    | locked: **Productivity** (matches CWS, per REQUIREMENTS.md §3)                                                                                                                                                                                                                  |
| Website URL                | optional                                               | plain URL                                        | n/a    | `https://movar.fyi`                                                                                                                                                                                                                                                             |
| Support contact            | optional                                               | URL or email                                     | n/a    | `support@movar.fyi`                                                                                                                                                                                                                                                             |
| Mature content             | optional                                               | checkbox                                         | n/a    | unchecked                                                                                                                                                                                                                                                                       |
| Privacy policy URL         | required (we collect host permission for `<all_urls>`) | plain URL                                        | n/a    | `https://movar.fyi/privacy`                                                                                                                                                                                                                                                     |
| Single Purpose Description | required (Privacy page)                                | free text                                        | n/a    | reused: [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) § Single Purpose                                                                                                                                                                                                               |
| Permission justification   | required per declared permission (Privacy page)        | free text                                        | n/a    | reused: [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) § Permission Justifications                                                                                                                                                                                                    |
| Are you using remote code? | required (Privacy page)                                | radio + free text if Yes                         | n/a    | reused: [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) § Remote Code — answer is "No" (MV3, no remote execution)                                                                                                                                                                      |
| Data usage disclosures     | required (Privacy page)                                | checkboxes + certification checkboxes            | n/a    | reused: [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) § Data Usage — none of the categories collected                                                                                                                                                                                |
| Visibility                 | required                                               | Public / Hidden                                  | n/a    | Public                                                                                                                                                                                                                                                                          |
| Markets                    | required                                               | dropdown (defaults to all)                       | n/a    | All markets (default)                                                                                                                                                                                                                                                           |
| Notes for certification    | optional                                               | free text                                        | n/a    | reuse the Chrome reviewer notes from [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) tail; add release notes here per-version since Edge has no dedicated "What's new" field (see §5)                                                                                                  |

---

## 2. Per-asset notes

### Extension logo

Edge wants **300×300** recommended, with **128×128** as the documented
minimum, at a strict 1:1 aspect ratio. Our existing CWS icon
[`../chrome/icon-128.png`](../chrome/icon-128.png) already meets the
minimum and is the same icon shipped inside the extension package —
ready to upload as-is.

Strongly recommended follow-up: render a 300×300 variant so the Edge
store card displays at full fidelity rather than a 2.34× upscale. The
rendering pipeline already exists — add `300` to the Chrome target's
`sizes` array (or split out a new `edge/` target) in
[`../../scripts/generate-icons.mts`](../../scripts/generate-icons.mts):

```ts
// In the existing `targets` array, append:
{
  outDir: path.resolve(here, '..', 'store-assets', 'edge'),
  filename: (size) => `icon-${size}.png`,
  sizes: [128, 300],
},
```

Then `pnpm --filter @movar/extension icons` emits
`apps/extension/store-assets/edge/icon-300.png` from the same master SVG
at `apps/extension/src/public/icon.svg`. Sharp → libvips → librsvg
renders at higher fidelity than any browser rasteriser, so it stays
consistent with the rest of our icon pipeline (decision in
[`../STORYBOOK-PIPELINE-PLAN.md`](../STORYBOOK-PIPELINE-PLAN.md)
decision #4).

### Screenshots

Edge accepts **1280×800** as one of two valid sizes (the other is
640×480). Our existing Chrome shots are already at 1280×800 and follow
the same synthetic-storyboard contract documented in
[`../REQUIREMENTS.md`](../REQUIREMENTS.md) §5, so they upload unchanged.

Edge allows **1–6 screenshots** per language. Our set fits within the
ceiling:

- **EN:** 4 shots from [`../screenshots/en/`](../screenshots/en/)
  - `01-popup-on-news.png`
  - `02-correction-applied.png`
  - `03-search-rewrite.png`
  - `04-language-dialog.png`
- **UK:** 5 shots from [`../screenshots/uk/`](../screenshots/uk/) (adds the UK-only Knowledge Panel)
  - `01-popup-on-news.png`
  - `02-correction-applied.png`
  - `03-search-rewrite.png`
  - `04-language-dialog.png`
  - `05-knowledge-panel.png`

Regenerate with `pnpm --filter @movar/extension capture:storybook-assets`
if any storyboard changes.

### Small promotional tile

Edge's small promotional tile is **440×280** — identical to the CWS
small promo tile dimension, so [`../chrome/promo-tile-440x280.png`](../chrome/promo-tile-440x280.png)
(rendered from `storyboards/promo/chrome-tile.stories.tsx` /
`Marketplace/Promo/ChromeTile`) ports across with no re-render.

If the Chrome and Edge tiles should diverge later (e.g., to swap copy
or accent the Edge wordmark), add a parallel
`storyboards/promo/edge-small-tile.stories.tsx` and capture it with
`pnpm --filter @movar/extension capture:storybook-assets`. Until then,
the Chrome tile is the canonical source.

### Large promotional tile

Edge has a **1400×560** large promotional tile slot that has no CWS
analog (CWS retired its marquee 1400×560 tile in 2022). We do not have
this asset yet.

Optional for v1 — Edge's docs describe it as "used to display the
extension more prominently at Microsoft Edge Add-ons (featured
placements)." We don't expect featured placement out of the gate, so
this can wait. When we want to produce it: add a
`storyboards/promo/edge-large-tile.stories.tsx` (1400×560 canvas, same
visual identity as the Chrome small tile, more breathing room for the
wordmark + tagline) and add an entry to
[`../../scripts/capture-storybook-assets.mts`](../../scripts/capture-storybook-assets.mts)
so `pnpm --filter @movar/extension capture:storybook-assets` writes
`apps/extension/store-assets/edge/promo-tile-1400x560.png`.

### YouTube video URL

Edge accepts a YouTube URL only — no direct video upload. v1 ships
without a video. If/when we produce one, paste the URL into Partner
Center; Edge requires that ads be disabled on the video and that the
content follow Edge Add-ons developer policies.

There is no marquee tile in the Edge schema (only Small and Large
promotional tiles), so nothing to mirror from CWS's retired 1400×560
marquee.

---

## 3. Locale handling

Edge's "Add a language" dropdown at Partner Center is **dynamically
populated from the locale folders detected inside the uploaded
extension package's `_locales/` directory** — not from a fixed list at
Partner Center. Our zip already ships
[`../../src/public/_locales/en/messages.json`](../../src/public/_locales/en/messages.json)
and [`../../src/public/_locales/uk/messages.json`](../../src/public/_locales/uk/messages.json),
with `default_locale: "en"` and `__MSG_extensionName__` /
`__MSG_extensionDescription__` placeholders wired through
[`../../wxt.config.ts`](../../wxt.config.ts), so both English (en-US)
and Ukrainian (uk-UA) appear in the dropdown after the first zip
upload. Ukrainian is a supported Partner Center culture (confirmed in
Microsoft's official Partner Center locales table: `Ukraine | UA | UKR
| uk-UA / en-US`).

Per-language required fields after the zip is parsed:

- **Description** (long, 250–10,000 chars) — paste from
  [`../copy/description.en.md`](../copy/description.en.md) /
  [`../copy/description.uk.md`](../copy/description.uk.md) verbatim.
- **Extension logo** — reuse [`../chrome/icon-128.png`](../chrome/icon-128.png) (or the 300×300 if we render it per §2).
- **Screenshots, promo tiles, YouTube URL, Search terms** — optional but
  recommended per language.

Read-only on the Details page, sourced from manifest:

- **Extension name** — `__MSG_extensionName__` → `Movar` in both locales.
- **Short description** — `__MSG_extensionDescription__` → the 122-char
  line from [`../copy/summary.{en,uk}.md`](../copy/) "CWS"/"Edge"
  section (the manifest description field has a ~132-char ceiling and
  is shared with CWS).

To change either, edit the locale `messages.json` files and re-upload
the zip — they cannot be edited in the Partner Center form directly.

---

## 4. Manual-submission steps (first product creation)

The first Edge submission must be done by hand at Partner Center to
mint the `EDGE_PRODUCT_ID` — subsequent versions go through the
[`release-edge`](../../../../.github/workflows/release.yml) job in
`.github/workflows/release.yml`, which talks directly to the Edge
Add-ons API v1.1 using the API-key auth flow (`Authorization: ApiKey` +
`X-ClientID` headers). The release workflow already handles the upload,
status polling, and publish-trigger — but the listing metadata
(description, screenshots, promo tile, privacy answers, category) lives
on the Partner Center side and is populated once here.

1. **Sign in** at <https://partner.microsoft.com/dashboard/microsoftedge>.
   Create a Partner Center account if not already done. Edge Add-ons
   developer registration is **free** — no fee like CWS's $5 one-time
   charge (confirmed in
   [`../../../../deployment-checklist.md`](../../../../deployment-checklist.md)
   § Per-store accounts & artifacts).
2. Click **"Create a new extension"** on the Edge Add-ons dashboard.
3. **Upload the Chrome MV3 zip**:
   `apps/extension/.output/movar-extension-<version>-chrome.zip`,
   produced by `pnpm --filter @movar/extension zip`. The same zip is
   accepted by Edge — no re-pack needed (confirmed in
   [`../../../../deployment-checklist.md`](../../../../deployment-checklist.md)
   § Per-store accounts & artifacts).
4. **Wait for Partner Center to parse the zip.** Both `en` and `uk`
   should appear under "Details for <language>" once parsed. Add both
   languages from the dropdown.
5. **Fill listing copy (per language):**
   - Short description: read-only, sourced from manifest. Confirm it
     shows the line from
     [`../copy/summary.{en,uk}.md`](../copy/) "Edge" /"CWS" section.
   - Long description: paste verbatim from
     [`../copy/description.en.md`](../copy/description.en.md) and
     [`../copy/description.uk.md`](../copy/description.uk.md). Plain
     text only — no Markdown, no HTML.
   - Search terms: see §5 open items below for the proposed values.
6. **Upload imagery (per language):**
   - Extension logo: [`../chrome/icon-128.png`](../chrome/icon-128.png)
     (or `edge/icon-300.png` once rendered per §2).
   - Screenshots: all four from
     [`../screenshots/en/`](../screenshots/en/) for the EN listing; all
     five from [`../screenshots/uk/`](../screenshots/uk/) for the UK
     listing.
   - Small promotional tile:
     [`../chrome/promo-tile-440x280.png`](../chrome/promo-tile-440x280.png)
     for both locales.
   - Large promotional tile and YouTube URL: skip for v1 (see §5).
7. **Fill the Properties page:**
   - Category: **Productivity**.
   - Website URL: `https://movar.fyi`.
   - Support contact: `support@movar.fyi`.
   - Mature content: unchecked.
   - Privacy policy requirements: **Yes** (legacy field; being phased
     out by end of May 2026 in favor of the dedicated Privacy page).
8. **Fill the Privacy page** from
   [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md):
   - Single Purpose Description.
   - Permission justifications (one box per manifest permission:
     `storage`, `declarativeNetRequest`, `alarms`, `tabs`,
     `<all_urls>`).
   - Remote code: **No, I am not using remote code** (MV3 enforces
     this).
   - Data usage checkboxes: none of the categories collected.
   - Data usage certification checkboxes: tick all three (limited-use
     equivalents — see PRIVACY-FORM.md for the exact text once captured
     from the live form, since Microsoft's docs only show them as a
     screenshot).
   - Privacy Policy URL: `https://movar.fyi/privacy`.
9. **Fill the Availability page:**
   - Visibility: Public.
   - Markets: All markets (default).
10. **Submit** (Notes for certification: include the Chrome reviewer
    notes from [`./PRIVACY-FORM.md`](./PRIVACY-FORM.md) tail and, since
    Edge has no dedicated "What's new" field, the v1.0.0 release notes
    here too).
11. **After approval:** open the extension's **Overview** page and copy
    the **Product ID** (a UUID). Save it as the `EDGE_PRODUCT_ID`
    GitHub secret per
    [`../../../../docs/release-credentials.md`](../../../../docs/release-credentials.md)
    § Edge Add-ons. Also visit Partner Center → **Publish API**, click
    **Enable** to switch the project to v1.1 (if not already enabled),
    then **Create API credentials** to mint the **Client ID** and
    **API key** (the API key is shown once — copy it now). Wire as
    `EDGE_CLIENT_ID` and `EDGE_API_KEY` GitHub secrets.
12. **Subsequent versions auto-publish.** Tagging
    `extension-v<version>` triggers
    [`.github/workflows/release.yml`](../../../../.github/workflows/release.yml)
    → `release-edge` job, which uploads the new Chrome MV3 zip via the
    Edge Add-ons API and triggers the publish operation. Per-language
    listing copy stays as set unless we edit it back at Partner Center
    or the manifest `__MSG_extensionDescription__` changes (a re-upload
    refreshes the read-only fields).

---

## 5. Open items

- **300×300 logo render.** Required to land before publish for
  full-fidelity store presentation; 128×128 is the documented minimum
  fallback. **Render:** add a `300` entry to the Chrome target (or a
  new `edge/` target) in
  [`../../scripts/generate-icons.mts`](../../scripts/generate-icons.mts)
  and run `pnpm --filter @movar/extension icons`. Output:
  `apps/extension/store-assets/edge/icon-300.png`.
- **Large promotional tile (1400×560).** Optional for v1, but recommended
  if Edge offers featured placement later. **Render:** create
  `apps/extension/store-assets/storyboards/promo/edge-large-tile.stories.tsx`
  (1400×560 canvas; reuse the wordmark + tagline composition from
  `storyboards/promo/chrome-tile.tsx` with more breathing room), then
  register a capture entry in
  [`../../scripts/capture-storybook-assets.mts`](../../scripts/capture-storybook-assets.mts)
  and run `pnpm --filter @movar/extension capture:storybook-assets`.
  Output: `apps/extension/store-assets/edge/promo-tile-1400x560.png`.
- **Edge-specific small promo tile.** Optional — current default is to
  reuse `chrome/promo-tile-440x280.png`. If we decide Edge needs its
  own variant, create `storyboards/promo/edge-small-tile.stories.tsx`
  and add a capture entry alongside the Chrome tile in
  [`../../scripts/capture-storybook-assets.mts`](../../scripts/capture-storybook-assets.mts).
- **Search terms (EN + UK).** Not yet drafted. Proposed values mirror
  the AMO tag set from REQUIREMENTS.md §3 (`language`, `ukrainian`,
  `search`, `multilingual`, `privacy`) plus a 6th and 7th term for
  Edge-specific discovery. **Decision needed:** confirm the per-locale
  list — translate the UK set or keep it identical to the EN set. Edge
  caps at 7 terms / 21 words total / 30 chars per term, per-language.
- **Exact data-category checkbox labels and certification checkbox
  sentences** on the Edge Privacy page. Microsoft's public docs only
  show them as a screenshot; the exact strings need to be captured
  from the live Partner Center submission when it is first opened, and
  the `./PRIVACY-FORM.md` file updated to mirror Chrome's labels
  exactly. Track this in PRIVACY-FORM.md.
- **YouTube promo video.** Optional, not produced for v1. Defer.
- **`EDGE_*` GitHub secrets.** Three required: `EDGE_PRODUCT_ID`,
  `EDGE_CLIENT_ID`, `EDGE_API_KEY`. Cannot be wired until the first
  manual submission mints the `EDGE_PRODUCT_ID` and Partner Center →
  Publish API issues the v1.1 API key. See step 11 above and
  [`../../../../docs/release-credentials.md`](../../../../docs/release-credentials.md)
  § Edge Add-ons.
