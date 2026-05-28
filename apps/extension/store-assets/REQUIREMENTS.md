# Movar marketplace listing — requirements

Single source of truth for what we ship to AMO and the Chrome Web Store for
Movar **v1.0.0**. Drafted on `feat/amo-readiness`.

Sibling docs:

- [`README.md`](./README.md) — screenshot capture recipe.
- [`../STORE-LISTING.md`](../STORE-LISTING.md) — earlier copy draft; **superseded** by the copy plan in §4 below, kept until new copy files land.
- [`../../../deployment-checklist.md`](../../../deployment-checklist.md) — pre-submission checklist (icons, permission justifications, source map).

---

## 1. Decisions locked this round

| Question           | Decision                                                                                                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which stores?      | **AMO + Chrome Web Store**, in parallel. Edge inherits Chrome assets but is not a v1 focus.                                                                             |
| Copy baseline      | **Rewrite from scratch.** [`STORE-LISTING.md`](../STORE-LISTING.md) is reference only; final copy lives in `copy/` (see §4).                                            |
| Locales            | **English + Ukrainian.** No Russian.                                                                                                                                    |
| Roadmap            | [Priority-driven switching](../../../docs/priority-driven-switching.md) is teased as **"coming soon"** in one line at the bottom of the long description. Not the lead. |
| Lead audience      | **Split per locale.** EN leads with multilingual-user framing; UK leads with the UA→RU pain. Same product, two arcs.                                                    |
| AMO default locale | **English.** UK serves uk-locale browsers; EN is the global fallback.                                                                                                   |
| Tone               | **Calm, neighbourly.** Keep "Keep the internet in your language." voice — matches the privacy policy.                                                                   |

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
- **Headline**: _Залиште інтернет вашою мовою._
- **Opening hook**: concrete — the UA site that flips to RU on the second click; the Google result page that pretends you can't read Ukrainian.
- **Pain example**: UA→RU is the primary example; multilingual framing is a secondary "and it works for other languages too" line.
- **Closing line**: roadmap teaser in Ukrainian.

> **Maintenance guard rail**: the two locales must agree on every factual
> claim (supported engines, supported languages, permissions, privacy
> guarantees). Edits to one are not finished until the other is verified.

## 3. Slot inventory per store

| Slot                           | AMO                                                                    | Chrome Web Store                                                                                       | Source / status                                               |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Name                           | "Movar"                                                                | "Movar"                                                                                                | `__MSG_extName__`, both locales                               |
| Summary (short)                | ≤250, write to ~200                                                    | **≤132** (tight constraint)                                                                            | `copy/summary.{en,uk}.md` — to produce                        |
| Description (long)             | ≤15,000                                                                | ≤16,000                                                                                                | `copy/description.{en,uk}.md` — to produce                    |
| Icon                           | 128×128 PNG                                                            | 128×128 PNG                                                                                            | `src/public/icon/128.png` ✅                                  |
| Screenshots                    | up to 10, max 2400×1800                                                | 1–5, **1280×800 or 640×400**                                                                           | `shared/*.png` — 1 of 4 captured strategy in §5               |
| Promo tile                     | n/a                                                                    | **440×280** required                                                                                   | `chrome/promo-tile-440x280.png` — to produce                  |
| Default locale                 | English                                                                | English (CWS shows one main body globally; UK reaches uk-locale users only via store translation pass) | —                                                             |
| Category (primary)             | **Productivity** (proposed)                                            | **Productivity** (proposed)                                                                            | confirm before submit                                         |
| Category (secondary, AMO only) | **Privacy & Security** (proposed)                                      | n/a                                                                                                    | confirm before submit                                         |
| Tags (AMO only)                | proposed: `language`, `ukrainian`, `search`, `multilingual`, `privacy` | n/a                                                                                                    | confirm before submit                                         |
| Privacy policy URL             | `https://movar.fyi/privacy`                                            | same                                                                                                   | **blocked** — DNS + Cloudflare Pages deploy pending           |
| Homepage URL                   | `https://movar.fyi`                                                    | same                                                                                                   | **blocked** on the same DNS unblock                           |
| Support contact                | `support@movar.fyi`                                                    | same                                                                                                   | also used in-product (`FEEDBACK_URL`) and in privacy policies |
| License                        | MIT                                                                    | n/a                                                                                                    | ✅                                                            |
| Data declaration               | `data_collection_permissions: ['none']` ✅                             | "User data" form: collects nothing                                                                     | confirm form on submit                                        |
| Min browser version            | Firefox 113 (set) ✅                                                   | Chrome 109 (default MV3 floor)                                                                         | —                                                             |

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
comfortably under 2k. Section order, locked:

1. One-paragraph value framing (locale-specific lead per §2).
2. **What it does** — bullets: search-engine rewrites, on-page language detection + one-click switch, on-page picker filtering (survivor rework).
3. **Supported search engines** — Google ccTLD list, Bing, DuckDuckGo, YouTube. Single source of truth: [`packages/rules/src/index.ts`](../../../packages/rules/src/index.ts).
4. **Languages offered** — UA, EN, DE, FR, ES, IT, PL. Same source as above.
5. **How it works** — three short bullets (pick language → applies automatically → popup for pause/counter/settings).
6. **Privacy** — no account, no telemetry, all local. Restate the privacy policy headline; link out.
7. **Open source** — MIT, link to repo once public.
8. **Coming soon** — one-line tease for priority-driven switching.

## 5. Screenshot set

Four shots, captured at **1280×800** (works for both AMO and CWS). **All
synthetic** — we render mock websites as HTML files under `storyboards/`
so we never display a third-party brand, never depend on a real site's
HTML holding still, and never accidentally leak personal browsing
context. The real Movar popup (and any in-extension UI) is captured from
the actual built extension and composited over the storyboard. Final
PNGs live in `shared/`. Numbering matches CWS upload order.

| #   | File                        | Story                     | Backdrop                                                                                                | Foreground                                       |
| --- | --------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1   | `01-popup.png`              | Popup on a generic page   | `storyboards/news.html` — fictitious news article                                                       | Real Movar popup: status header + pause controls |
| 2   | `02-correction-applied.png` | Before / after correction | `storyboards/site-before.html` + `…-after.html` — same fictitious site in RU and UA states              | Popup with today's correction counter ticking    |
| 3   | `03-picker-survivor.png`    | Picker survivor rework    | `storyboards/picker.html` — fictitious site with a multilingual picker open                             | Picker with some items dimmed / removed by Movar |
| 4   | `04-search-rewrite.png`     | Search rewrite            | `storyboards/serp.html` — fictitious SERP, styled distinct from any real engine; URL bar shows `?hl=uk` | Results visibly in Ukrainian                     |

### Synthetic guard rails

- **No third-party brand logos** of any kind (Google, Bing, YouTube, etc.). The popup may name "your search engine" generically; the SERP storyboard is invented.
- **No fake URLs that look like real domains.** Use the IANA-reserved `.example` TLD or transparent placeholders (e.g., `newssite.example`).
- **Consistent visual identity across storyboards.** All four mock sites share typography + token palette so the four shots read as one product story, not four unrelated tests. See open item §7.4.
- **Real Movar UI must stay real.** Popup and any in-extension UI are captured from the actual built extension, not redrawn — drift risk on hand-redrawn UI is too high.

The Chrome promo tile (`chrome/promo-tile-440x280.png`) is separate and is
a designed image, not a screenshot.

The capture recipe in [`README.md`](./README.md) still describes the
real-website workflow and needs a rewrite once the storyboard pipeline
exists — tracked as part of the storyboard work in §6.

## 6. Assets to produce

Tracked here so nothing slips between this doc and the deployment checklist.

| Item                                                            | Path                               | Owner       | Blocker?                                         |
| --------------------------------------------------------------- | ---------------------------------- | ----------- | ------------------------------------------------ |
| Summary EN (CWS + AMO variants)                                 | `copy/summary.en.md`               | copy        | first draft ✅                                   |
| Summary UK (CWS + AMO variants)                                 | `copy/summary.uk.md`               | copy        | pending EN sign-off                              |
| Long description EN                                             | `copy/description.en.md`           | copy        | first draft ✅                                   |
| Long description UK                                             | `copy/description.uk.md`           | copy        | pending EN sign-off                              |
| Roadmap teaser EN + UK                                          | `copy/teaser-roadmap.md`           | copy        | first draft ✅                                   |
| Storyboard backdrops (4 mock HTML pages)                        | `storyboards/*.html`               | design+code | needs visual-identity call (§7.4)                |
| Storyboard capture pipeline (update [`README.md`](./README.md)) | `README.md`                        | design+code | needs storyboards landed first                   |
| Screenshot #1 popup                                             | `shared/01-popup.png`              | capture     | needs storyboard #1 + built extension            |
| Screenshot #2 correction applied                                | `shared/02-correction-applied.png` | capture     | needs storyboards before/after + built extension |
| Screenshot #3 picker survivor                                   | `shared/03-picker-survivor.png`    | capture     | needs storyboard #3                              |
| Screenshot #4 search rewrite                                    | `shared/04-search-rewrite.png`     | capture     | needs storyboard #4                              |
| Chrome promo tile                                               | `chrome/promo-tile-440x280.png`    | design      | —                                                |
| Privacy policy live URL                                         | `https://movar.fyi/privacy`        | infra       | **DNS + Pages deploy**                           |
| Homepage live URL                                               | `https://movar.fyi`                | infra       | same                                             |
| Public source repo URL                                          | GitHub                             | infra       | repo currently private                           |

## 7. Open items / blockers

1. **`movar.fyi` DNS + Pages deploy.** Blocks the Privacy URL and Homepage
   URL. Not a code change — track in
   [`deployment-checklist.md`](../../../deployment-checklist.md). The
   `support@movar.fyi` mailbox is already provisioned and is used
   everywhere as the contact / feedback inbox (`FEEDBACK_URL`, marketing
   site, privacy policies, store listing).

2. **Public source repo.** AMO does not require source to be public.
   The privacy policy no longer makes a forward-looking promise about a
   GitHub link; when the repo opens, add the link to
   [`Footer.astro`](../../../marketing/src/components/Footer.astro)
   alongside Privacy / Download / Feedback. No privacy-policy edit
   needed at that point.

3. **Categories and tags confirmation.** Proposed in §3 but not signed
   off. AMO requires 1 primary + 1 secondary at form time.

4. **Storyboard visual identity.** The four synthetic backdrops in §5
   share typography + token palette. Pick one of: (a) reuse marketing-site
   tokens (looks like a Movar-family product); (b) generic neutral design
   unrelated to Movar (looks like the user's own browser); (c) explicitly
   Movar-branded demo frame (the storyboard wears a "Movar demo" badge).
   Changes how the four shots read as a set.

5. **Edge Add-ons.** Not a v1 focus. If we later submit to Edge, it uses
   the Chrome screenshots (same 1280×800) and a Chrome-equivalent
   description with no Mozilla-specific phrasing. Decide later.

## 8. Out of scope for v1 listing

- Russian-language listing.
- Options/settings screenshot — leaner positioning, configurability isn't the lead.
- Marketing-hero screenshot of the movar.fyi homepage (was in old spec).
- HiddenPanel screenshot (was optional in old spec).
- Priority-driven switching as a primary feature — teased only.
- A `/marketplace` page on movar.fyi (separate marketing-site work).
- Edge Add-ons submission.

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
| Rules & supported engines source of truth | [`packages/rules/src/index.ts`](../../../packages/rules/src/index.ts)                       |
| Priority-driven switching proposal        | [`docs/priority-driven-switching.md`](../../../docs/priority-driven-switching.md)           |
