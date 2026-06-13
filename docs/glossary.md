# Glossary

Movar's docs lean on a lot of shorthand — `SERP`, `curtain`, `rung`, `the redirect
layer`. This page defines every term a newcomer needs to read the rest of `docs/`,
the per-package `AGENTS.md` files, and the code comments without getting stuck.

It is grouped by theme so you can read it top-to-bottom to learn the domain, but it
is also just a flat list of terms — use your browser/editor find (Ctrl-F) to jump to
any word. Terms a working developer already knows — generic programming words and
mainstream tooling (pnpm, ESLint, Storybook, the DOM) — are deliberately left out;
only things specific to Movar, browser extensions, or language detection are listed.

**Deep-linking.** Every entry has a stable anchor matching its primary term, so other
docs can link straight to a definition — e.g. `[SERP](glossary.md#serp)` or
`[the redirect layer](glossary.md#redirect-layer)`. The package and app tables are
anchored per row (`#movar-lang-detect`, `#apps-extension`).

If you add a coined term to the docs or code that a newcomer wouldn't know, add an
entry here (with its anchor) in the same change.

---

## Core concepts & architecture

The one mental model to learn first. Movar handles language in **two sequential
layers** that run in order on every page; the first that succeeds stops the second.

- <a id="redirect-layer"></a>**Redirect layer** — Layer 1. Asks the site to serve a
  different language version (via URL params, a language-picker click, `hreflang`, a
  cookie, or `localStorage`). If it causes the page to navigate, the content-filter
  layer is skipped.
- <a id="content-filter-layer"></a>**Content-filter layer** — Layer 2. When the
  redirect layer didn't navigate, this conceals individual content cards whose detected
  language is blocked, one card at a time, behind a "curtain". It is **off by default**.
- <a id="two-layer-language-selection"></a>**Two-layer language selection** — The
  invariant that these two layers stay independent: the content-filter layer never
  produces an aggregate "the page is Russian" verdict that feeds back into the redirect
  layer. Mixing them causes redirect/bounce "hiccups". See
  [page-content-and-lang-pickers-refactor.md](page-content-and-lang-pickers-refactor.md).
- <a id="never-translate"></a>**Block-only / never translate** — A product rule: Movar
  hides or switches away from blocked-language content but never machine-translates it.
  Translating Russian would launder it into trusted Ukrainian and remove its
  provenance. See [no-content-translation.md](no-content-translation.md).
- <a id="priority-list"></a>**Priority list** (a.k.a. **priority**) — The user's
  ordered list of wanted languages (default `UA → EN → browser`). Drives both which
  language the redirect layer requests and which languages the content filter keeps.
- <a id="block-list"></a>**Block list** / **blocked languages** — Languages whose
  content gets concealed. Surfaced in the UI as "blocked languages".
- <a id="locked-language-invariant"></a>**Locked-language invariant** — Russian (`ru`)
  is permanently on the block list and cannot be removed by the user. It is Movar's core
  mission and is enforced at the settings boundary by `enforceLockedLanguages()`.
- <a id="allowlist"></a>**Allowlist** / **exempt sites** — Hostnames the user has
  marked so Movar does nothing on them (no redirect, no filtering). "Allowlist" is the
  code identifier; "exempt sites" is the UI label. (Movar avoids the words
  whitelist/blacklist.)
- <a id="correction"></a>**Correction** — One language action Movar applied to a page
  (a redirect or a concealment). The options-page insights section counts them
  ("7 corrections this week").
- <a id="correction-event"></a>**Correction event** / **correction log** — The local,
  on-device record of each correction (domain, mechanism, languages — never the full URL
  or page text), stored in browser storage and read back (read-only, no network) by the
  options-page insights section. Types live in `@movar/events`.
- <a id="correction-mechanism"></a>**Correction mechanism** — How a correction was
  applied: `header`, `cookie`, `localStorage`, `redirect`, `dom`, or `search`.
- <a id="network-silent-guarantee"></a>**Network-silent guarantee** — Movar sends
  nothing off-device: no analytics, no telemetry, no backend. Even "report an issue" is
  a `mailto:` link, not an API call.
- <a id="pure-model-package"></a>**Pure model package** vs **app orchestration** — An
  architecture split. "Model" packages (`@movar/page-content`, `@movar/lang-pickers`,
  `@movar/page-language`, `@movar/page-mode`) only **read** the DOM and build data
  structures; they never mutate the page, show overlays, or touch i18n. The DOM-mutating
  concealment, overlays, and translations live in `apps/extension` (the
  "orchestration").

## Content filtering & UI

How blocked content actually gets hidden, and what the user sees.

- <a id="content-card"></a>**Content card** (a.k.a. **card** / **content node**) — One
  filterable item on a page: a search result, a YouTube video tile, a channel, a
  playlist, a post. Each is classified and concealed independently. Modelled as a
  `ContentNode`.
- <a id="cardkind"></a>**CardKind** — The structural type of a card (`video`,
  `channel`, `playlist`, `shorts-shelf`, `post`, …). Drives the curtain wording and the
  dashboard breakdown.
- <a id="cardshape"></a>**CardShape** — The config that tells an extractor how to find
  and handle one card type on a site (its selector, which sub-elements hold text, how to
  conceal it, whether it's experimental). See
  [multi-shape-content-filter.md](multi-shape-content-filter.md).
- <a id="conceal"></a>**Conceal / concealment** — The umbrella action of hiding a
  blocked-language card. Has two shapes, below.
- <a id="curtain"></a>**Curtain** — The reversible conceal mode: a **blur** overlay with
  "Show" and "Hide all" actions covering the card. The default, because it's auditable —
  you can see something was hidden and reveal it. Used for high-false-positive surfaces
  like YouTube videos. Its wording is governed by [copy.md](copy.md).
- <a id="hide"></a>**Hide** — The irreversible conceal mode: `display: none` on the
  card, no overlay.
- <a id="conceal-mode"></a>**Conceal mode** — The user setting that picks `curtain`
  (blur) or `hide` globally. See [content-filtering-modes.md](content-filtering-modes.md).
- <a id="content-modification"></a>**Content modification** (`contentModification`) —
  The master setting that gates _all_ DOM mutation (curtains, hiding, picker filtering).
  **Off by default** — the safe baseline ships with only header/URL-level redirecting
  active.
- <a id="filter"></a>**Filter / filtering** — The user-facing word for concealment;
  honest because it spans both reversible (curtain) and irreversible (hide).
- <a id="language-picker"></a>**Language picker** (a.k.a. **picker**) — A site's own
  language switcher (dropdown, buttons, flags). Movar reads it to learn the active
  language and can hide blocked-language entries from it.
- <a id="picker-filter"></a>**Picker-filter** — Hiding blocked-language entries inside a
  site's language picker (as opposed to concealing content cards). A hidden entry's text
  is replaced by a small inline tooltip naming the language that was hidden.
- <a id="active-picker"></a>**Active picker / active language** — The option currently
  selected in a site's picker. It's the most reliable signal of what language the site
  is actually serving, because the picker state and the rendered content are set
  together.
- <a id="orphan-separators"></a>**Orphan separators** — Leftover punctuation (`|`, `/`)
  stranded in a picker after Movar hides the language links around them; the
  picker-filter trims these.

## Language detection

How Movar decides what language a card or page is in. The hard part, because Cyrillic
text is easy to mis-attribute (see
[per-snippet-language-detection.md](per-snippet-language-detection.md) and
[on-device-language-detection.md](on-device-language-detection.md)).

- <a id="snippet"></a>**Snippet** — A short sample of text taken from one content card,
  classified on its own (as opposed to sampling a whole page).
- <a id="snippet-classifier"></a>**Snippet classifier** (`classifyBySnippet`) — Movar's
  auditable, deterministic language detector. It walks a ladder of "rungs" and returns
  the first confident answer.
- <a id="rung"></a>**Rung** — One tier of the snippet classifier ladder. Rung 1 =
  **distinctive alphabet** letters; rung 2a = **function words**; rung 2b = **frequent
  words**; rung 3 = **franc** (statistical backstop). Higher rungs are more precise and
  win first.
- <a id="candidate-set"></a>**Candidate set** — The languages the classifier is choosing
  between for a given page (roughly: enabled languages plus blocked overlays).
  "Distinctiveness" is computed relative to this set.
- <a id="distinctive"></a>**Distinctive / distinctiveness** — A letter or word that
  belongs to exactly one language in the candidate set (e.g. `і ї є ґ` are
  Ukrainian-distinctive against Russian). Distinctive signals are what the early rungs
  rely on.
- <a id="function-words"></a>**Function words** — Small grammatical words (conjunctions,
  prepositions, particles) that rarely cross languages, so they're highly reliable.
  Rung 2a.
- <a id="frequent-words"></a>**Frequent words** — Common corpus-frequent content words
  per language. Rung 2b.
- <a id="franc"></a>**franc** — A third-party trigram language detector (the `franc`
  package, ~187 languages, ~170 KB of trigram tables) used as the statistical backstop —
  rung 3 of the snippet classifier — and as the diagnostics oracle. Because the tables
  are heavy, franc runs in the **background worker** (reached by message via
  `lang-detect-bridge`), not in the injected content script, so `content.js` stays under
  budget. The engine adapter is named `francEngine` in the code (`engines/franc.ts`), with
  the trigram detect body and ISO 639-3→BCP-47 map in `franc-core.ts`.
- <a id="chrome-ai"></a>**Chrome AI / LanguageDetector / Gemini Nano** — Chrome's
  built-in on-device language-detection API (powered by the Gemini Nano model). Used
  opportunistically when present; Movar falls back to franc when it isn't, and never
  triggers a model download.
- <a id="margin"></a>**Margin** — A confidence measure: the gap between the top-scoring
  language and the runner-up. A bigger margin means a more confident verdict.
- <a id="verdict"></a>**Verdict** — A detection result. A **snippet verdict** is
  `{ language, margin, rung }`. An **unknown verdict** is the safe outcome when nothing
  is confident — and a card with an `unknown` verdict is always kept, never hidden.
- <a id="page-language-verdict"></a>**Page-language verdict** — The redirect layer's
  answer to "what language is this site serving?", produced by `@movar/page-language`
  from a synchronous chain of signals: active picker → `<html lang>` → subdomain → URL
  path → self-referential `hreflang`. (Slower async body-text detection is deliberately
  kept _out_ of this chain — see two-layer selection.)
- <a id="cyrillic-language"></a>**Cyrillic language** — One of the four Cyrillic-script
  languages the cheap heuristic distinguishes: Ukrainian (`uk`), Russian (`ru`),
  Belarusian (`be`), Bulgarian (`bg`), or `unknown`.
- <a id="cheap-heuristic"></a>**Cheap heuristic** (`detectCyrillicLanguage`) — A fast
  single-pass letter counter used on hot paths, before the heavier classifier.
- <a id="shadow-oracle"></a>**Shadow oracle** — A diagnostics-only cross-check: after
  the classifier decides, franc re-runs off to the side and any disagreement is logged.
  It calibrates the detector and **never ships in the published extension** — it lives in
  `apps/diagnostics`. See [diagnostics-devtools-panel.md](diagnostics-devtools-panel.md).
- <a id="divergence"></a>**Divergence** — A logged disagreement between the classifier
  and the shadow oracle, classified as `confirm` / `contradict` / `abstain`.
- <a id="language-profile"></a>**LanguageProfile** — The declarative data for one
  language used by the classifier: its alphabet, function words, and frequent words. No
  neural weights — fully auditable.

## Browser-extension & web platform

Extension- and domain-specific vocabulary that shows up constantly. (Plain web
standards — `DOM`, `SPA`, `MutationObserver`, `navigator.language` — are assumed
knowledge and not listed.)

- <a id="serp"></a>**SERP** — **S**earch **E**ngine **R**esults **P**age: the page of
  results a search engine (Google, Bing, DuckDuckGo) returns for a query. Movar has a
  dedicated SERP extractor that treats each organic result as a content card.
- <a id="mv3"></a>**MV3 / Manifest V3** — The current browser-extension platform
  standard (service workers, `declarativeNetRequest`, stricter permissions). Movar is an
  MV3 extension.
- <a id="manifest"></a>**Manifest** — `manifest.json`, the file declaring the
  extension's permissions, scripts, and metadata. Movar's is generated by WXT.
- <a id="content-script"></a>**Content script** — Extension code injected into web pages
  to read and modify the DOM. Movar's content script runs the redirect and
  content-filter layers. Its size is budgeted (`content.js` badge in the README).
- <a id="background-worker"></a>**Background worker** (a.k.a. **service worker**) — The
  extension's background process. Movar keeps heavy detection assets (franc, language
  profiles) here, off the per-page content script.
- <a id="accept-language"></a>**Accept-Language** — The HTTP request header listing the
  user's preferred languages. Movar rewrites it to match the priority list so servers
  serve the right language version.
- <a id="declarativenetrequest"></a>**declarativeNetRequest** (a.k.a. **DNR**) — The MV3
  API for rewriting requests via declarative rules. Movar uses a single rule to rewrite
  `Accept-Language`; it never reads request or response bodies.
- <a id="host-permissions"></a>**host permissions** / `<all_urls>` — The manifest
  permission to run on any site. Movar needs it so the content script can correct
  whatever page you're on; no page data leaves the device.
- <a id="storage-alarms"></a>**`storage` / `alarms`** — The other two permissions Movar
  requests: `storage` persists settings, pause state, and the corrections log; `alarms`
  auto-resumes Movar when a timed pause expires.
- <a id="hreflang"></a>**hreflang** — An HTML `<link rel="alternate" hreflang="x"
href="…">` tag by which a site advertises its other-language URLs. Movar reads it (a
  detection signal) and uses it (a redirect strategy).
- <a id="page-mode"></a>**Page mode** — Movar's term for a page's color scheme (`light`
  or `dark`), detected by `@movar/page-mode` so injected overlays match the page.
- <a id="google-url-params"></a>**`hl=` / `lr=` / `cr=`** — Google search URL parameters
  for interface language (`hl`), result language (`lr`), and country (`cr`). Movar sets
  these to steer search results toward your language.
- <a id="webextension-api"></a>**WebExtension API** — The cross-browser extension API
  (storage, alarms, messaging, DNR) shared by Chrome, Firefox, Edge, and Safari.

## Locale & language codes

Two-letter [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes)
codes appear everywhere in the code; `UA`/`EN` appear in product copy and settings.

| Code | Language   | Role in Movar                                         |
| ---- | ---------- | ----------------------------------------------------- |
| `uk` | Ukrainian  | The default preferred language (promote)              |
| `ru` | Russian    | Permanently blocked (the locked-language invariant)   |
| `en` | English    | Default fallback language                             |
| `be` | Belarusian | Cyrillic neighbour; first planned next deployment     |
| `bg` | Bulgarian  | Cyrillic; distinguished by the detector               |
| `pl` | Polish     | Candidate for a future PL deployment                  |
| `kk` | Kazakh     | Cyrillic; alphabet nests Russian (detector edge case) |
| `ka` | Georgian   | Future deployment candidate                           |
| `ca` | Catalan    | Future deployment candidate                           |

Related terms:

- <a id="bcp-47"></a>**BCP-47** — The internet standard for language tags (`uk`,
  `en-US`, `zh-Hans-CN`). Movar normalizes these to bare ISO 639-1 codes
  (`normalizeBCP47` / `normalizeLanguageCode`) before comparing them.
- <a id="languagecode"></a>**LanguageCode** — Movar's internal string type for a
  normalized language code, defined once in `@movar/lang-detect` and used across every
  layer.
- <a id="ua-en"></a>**UA / EN** — Product-copy shorthand for Ukrainian and English, both
  of which are canonical UI languages (see [copy.md](copy.md)). Note `UA` here means the
  _language_ Ukrainian, not the country code.

## Workspace packages

The reusable libraries under `packages/`. (Source of truth for these descriptions is
the root [`AGENTS.md`](../AGENTS.md) map — update it there first; this table mirrors it
for newcomers.)

| Package                                                | What it is                                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| <a id="movar-page-mode"></a>`@movar/page-mode`         | Page color-scheme (light/dark) detect / observe / apply — a self-contained leaf              |
| <a id="movar-page-content"></a>`@movar/page-content`   | Per-site content-extractor **model** (DOM → `ContentNode` list); self-registering extractors |
| <a id="movar-lang-pickers"></a>`@movar/lang-pickers`   | On-site language-picker discovery / classify / active-language / redirect-target **model**   |
| <a id="movar-page-language"></a>`@movar/page-language` | Redirect-layer verdict: "what language is the site serving?" (consumes the picker model)     |
| <a id="movar-lang-detect"></a>`@movar/lang-detect`     | UA-vs-RU (+be/bg) text detection **and** BCP-47 code normalization                           |
| <a id="movar-rules"></a>`@movar/rules`                 | Per-site language-switch **strategy database** (header/cookie/localStorage/redirect/search)  |
| <a id="movar-brand"></a>`@movar/brand`                 | Zero-dependency brand constants leaf (`SUPPORT_EMAIL`, `FEEDBACK_URL`, `SOURCE_URL`)         |
| <a id="movar-settings"></a>`@movar/settings`           | Settings types/defaults + the locked-language policy (`MovarSettings`, `defaultSettings`)    |
| <a id="movar-events"></a>`@movar/events`               | Correction-event types (`CorrectionMechanism`, `CorrectionEvent`)                            |
| <a id="movar-ui"></a>`@movar/ui`                       | React design-system primitives (+ `tokens.css`) shared by the extension and marketing site   |

## Apps

The runnable end-products and test/dev tooling under `apps/`.

| App                                             | What it is                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| <a id="apps-extension"></a>`apps/extension`     | **The published product** — the WXT MV3 extension (Chrome/Firefox/Safari): orchestration, concealment, overlays, i18n, popup/options |
| <a id="apps-marketing"></a>`apps/marketing`     | The Astro marketing site (movar.fyi); its hero headline is the source of truth for the README tagline                                |
| <a id="apps-e2e"></a>`apps/e2e`                 | Playwright end-to-end suites (offline CI + manual live) asserting visible-vs-curtained behaviour                                     |
| <a id="apps-diagnostics"></a>`apps/diagnostics` | **Private, never-published** maintainer dev extension hosting the shadow oracle                                                      |

## Tooling & infrastructure

Only the non-obvious or Movar-specific pieces. (The mainstream stack — pnpm, nx, Astro,
Tailwind, Vitest, Playwright, Storybook, ESLint, lefthook, commitlint, changesets — is
listed in the README's Tech stack section and isn't redefined here.)

- <a id="wxt"></a>**WXT** — The web-extension framework that builds `apps/extension` for
  every browser target (Chrome/Firefox/Safari/Edge) and generates the manifest.
- <a id="process-compose"></a>**process-compose** — The dev supervisor `pnpm dev` runs
  to keep the marketing site (`:4321`) and the Storybook processes (`:6006`/`:6007`) up
  together.
- <a id="fallow"></a>**fallow** — The code-health/maintainability scorer (0–100 with an
  A–F grade over complexity, duplication, dead code, and churn). Drives the README "code
  health" badge and the pre-push **metrics gate**. `fallow-ignore` is its inline opt-out.
- <a id="metrics-gate"></a>**Metrics gate** — The PR-time check that fails on
  coverage/quality regressions, with an `accept-metrics-regression` override. See
  [metrics-gate.md](metrics-gate.md).
- <a id="lucide"></a>**lucide** — The icon library, used everywhere via a fixed
  convention: `lucide-astro` in Astro, `lucide-react` in React, `lucide` core in vanilla
  content scripts. Icons are never hand-inlined as SVG paths.
- <a id="extension-stores"></a>**Extension stores — AMO / CWS / Edge Add-ons** — Where
  Movar is published: **AMO** = [addons.mozilla.org](https://addons.mozilla.org)
  (Firefox), **CWS** = the Chrome Web Store (Chromium browsers), and Microsoft's **Edge
  Add-ons**. Publishing a GitHub Release auto-submits the built extension to all three.
  See [firefox-amo-listing-guidelines.md](firefox-amo-listing-guidelines.md).
