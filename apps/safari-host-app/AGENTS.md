# Safari Host App — `@movar/safari-host-app`

> React host screen for the iOS/macOS Safari Web Extension wrapper app. Bundled
> by Vite to ONE CSP-safe JS + ONE CSS the wrapper's `WKWebView` loads from the
> app bundle. It replaces the old static `Main.html` / `Style.css` / `Script.js`
> (and unified what the #168 standalone onboarding screen did).
>
> **IT NO LONGER RENDERS ANY TAB.** The Swift shell was retired onto native
> SwiftUI one tab at a time (`docs/native-shells.md`), and the last one — Audit —
> has gone: `AboutView.swift`, `SettingsView.swift`, `DetectorView.swift` and
> `AuditView.swift` + `AuditReportView.swift`, the last two over the same
> `EngineHost.swift` the Detector uses, with About a row at the bottom of Settings
> rather than a tab of its own. `WebSurface` and `HostWebView` went with the last
> web tab; nothing displays this bundle any more.
>
> It is still BUILT and still shipped, for two reasons that have nothing to do
> with tabs: `ViewController` loads it because that is what the `readSettings` /
> `writeSettings` bridge answers to, and the panels here still serve the
> standalone web build (dev server, `vite preview`, their own tests) — plus
> About, which `capture-host-app-screenshots.mts` renders for an App Store shot.
> Deleting the page is the ADR's own named last step, not this one.
>
> **The Audit tab's copy is now the native screen's too.** `messages-{en,uk}.ts`
> is still where a wording change lands first, but `audit.*` is mirrored by hand
> into `Shared (App)/Resources/{en,uk}.lproj/Localizable.strings`. The two
> catalogue tables — `audit-rule-titles.ts` and `audit-family-titles.ts` — are
> NOT hand-copied: `scripts/gen-audit-strings.mts` writes them into those files,
> and it runs as part of `build`, beside `sync-safari-app.mts` and for the same
> reason. A rule title added to the TS map therefore reaches the native report on
> the next build rather than whenever someone remembers; `pnpm --filter
@movar/safari-host-app gen:audit-strings` runs it alone.

## What it does

The Safari Web Extension ships inside a thin native app (`apps/extension/safari/Movar/`).
Launching that app opens a native `TabView` (`Shared (App)/MovarRootView.swift`)
with **three** tabs, all of them SwiftUI. The tab list below still describes the
screens, because this package is where their copy and their behaviour were
designed — but none of them is rendered from here any more:

- **Detector** — **retired from this app.** It renders natively now
  (`Shared (App)/DetectorView.swift`) over `@movar/audit-engine`'s `detect.run`,
  and `MovarRootView` no longer routes that tab to the WebView.
  `src/tabs/DetectorTab.tsx` and the `detector.*` catalogue entries are still
  here and still build, but nothing reaches them — unlike `AboutTab.tsx`, which
  is also ported yet stays live because `capture-host-app-screenshots.mts`
  renders it for the `08-host-app-about` store screenshot. **Wording changes
  belong in `Shared (App)/Resources/{en,uk}.lproj/Localizable.strings`, not
  here**; the React copy is the version that shipped before the closed-set
  rework and states the verdict differently on purpose-defeating terms ("No
  Cyrillic language found here" is an open-set claim). Deleting the tab is a
  separate cleanup that also drops `detector.*` from `messages-{en,uk}.ts`.
- **Audit** — **retired from this app.** It renders natively now
  (`Shared (App)/AuditView.swift` + `AuditReportView.swift`) over
  `@movar/audit-engine`'s `audit.run`, `audit.artifact` and `catalogue.describe`,
  in the same `EngineHost` the Detector uses. `src/tabs/AuditTab.tsx`,
  `src/tabs/AuditReport.tsx` and the `audit.*` catalogue entries are still here
  and still tested — the catalogue is where a wording change lands first, and
  `gen-audit-strings.mts` carries the two rule/family tables across. The
  description below is the design the native screen inherited; two controls
  deliberately differ, and both are noted where they appear.

  [Movar Audit](../../docs/movar-audit.md)'s app surface. Type a
  URL; the tab runs the response matrix (the same URL fetched once per
  `Accept-Language`, everything else identical), digests each response, and
  adjudicates it against `@movar/audit`'s rule catalogue. **macOS first** per
  ADR §9, though nothing here is macOS-gated. Three invariants:
  - **It does not judge.** Verdicts come from `evaluate()`, the pure kernel the
    CLI runs — this tab renders a `Report`, never decides one. That is what lets
    a site owner re-run the same evidence and get the same answer.
  - **It does not fetch.** `default-src 'self'` makes that structural: every
    request goes through the `probe` bridge into `AuditProbe.swift`.
  - **The `ua` jurisdiction pack is opt-in**, off by default. Applying Law
    2704-VIII to a site outside its scope would be a false legal accusation.

  The tab is **two screens**: a composer (URL + the pack opt-in + "What Movar
  Audit is" + a list of previous audits) and a report screen. A language
  conformance report is a document, not a form's output — and rendering it
  inline buried the previous run the moment a new one started. Previous audits
  are **session-only, in memory** (`MAX_REMEMBERED_RUNS`); nothing about an
  audit is written to disk, which the UI states next to the list rather than
  leaving to discovery. **Every row can be removed** — the list is "sites this
  person chose to investigate", so being unable to take one back off it is a
  privacy defect. The web row asks first, because its `×` is one stray tap from
  spending another full matrix of requests against somebody else's server to
  rebuild what it destroyed; **the native row does not**, because swipe-to-delete
  already charges that deliberation and a second screen on top of it would put
  the speed bump on the privacy affordance instead of on the destructive act. The
  web row is two sibling controls under one `<li>` frame, never a button inside a
  button, and its remove control's accessible name carries the target — every
  row's would otherwise read "Remove". The native row needs neither: the gesture
  is scoped to the row it acts on. The report screen can re-run its own target and
  **export** itself; its two actions are stacked full width, because side by
  side they read as one split control and the app is a single narrow column
  everywhere it runs (the macOS window is 480pt).

  **Vocabulary is load-bearing, and the UI holds one line.** A run is an
  **audit**; one catalogue entry is a **rule**; "check" survives only as the
  verb for what a rule does to evidence (the `not-collected` verdict reads "not
  checked", deliberately — see `messages-en.ts`). Nothing user-facing calls a
  run "a check": the product is Movar Audit, and a tab that offered to "run a
  check" undersold the document it produces. The composer also **says what
  Movar Audit is** before anyone points it at a site — `audit.about`, three
  claims mirroring the exported artifact's "What this proves — and what it does
  not", said up front rather than after the fact.

  **The copy is written for someone auditing their own site, and stays true for
  someone who is not.** Nothing here can establish who opened the tab, so copy
  that picks a side is wrong on its face — a draft that closed on "hand it to
  the people who build it" told the site's own developer the tool was not for
  them. The claim was always neutral; only the report's disposal assumed a
  stranger. So: address the reader as the person who can fix what it finds,
  keep "yours or anyone else's" so the advocate's case stays open, and let the
  shareable artifact be a clause rather than the point. `docs/movar-audit.md`
  §10 still sequences **advocacy first** — that governs who gets recruited, not
  who this tab talks to, and it is unchanged. **The one thing this stance may
  never reach is `audit.confirm`**: the outbound-request acknowledgement has to
  go on assuming you might not own what you are about to contact, because
  nothing can verify that you do.

  Three rules the report's layout is bound by — each fixes a way an earlier
  version misled a reader, so check them before changing `AuditReport.tsx`:
  - **One card per rule, not per finding.** A rule reports once per page, so a
    flat list turns twelve problems on two pages into twenty-five cards that
    differ only by a URL. The card states the problem once and lists the pages
    under it, **deduplicated** — "on 4 pages" over two URLs is a false claim
    about a named company.
  - **Severity is never carried by colour alone.** The palette is one accent
    plus danger red (`design-brief.md`), so there is no hue to spend on
    "warning": every verdict names itself in a word, and the rail behind it
    varies in colour _and_ pattern (`not-collected` is dashed). Before this,
    `warn` and `not-collected` both inherited `--ink-faint` — literally the same
    colour, and each paler than a pass.
  - **Findings are sectioned by the kernel's rule families**, resolved through
    `src/i18n/audit-family-titles.ts`. The composer's intro promises three
    questions ("what it declares, what it serves, whether its switcher works");
    the sections are how the report answers them. Family IDs contain dots, which
    is why they live beside the rule titles rather than in `HostMessages` — the
    catalogue-parity guard addresses that object by dotted path.
  - **Every coverage row opens, and says WHY it holds its verdict.**
    `evaluate()` records `missingCapabilities` per `not-collected` rule and
    `notApplicableReason` per `not-applicable` one; the report rendered neither,
    so a row could say "not checked" and stop there. All thirty-five rows are
    disclosures now — uniformly, because a list where only the rows that found
    something respond teaches a reader that the quiet ones hold nothing, which
    is backwards for exactly the rows that admit a blind spot. The jump to a
    rule's card is an action INSIDE the disclosure, not the row's own tap.
  - **An unscored card leads with the measurement.** `observation` / `info`
    rule titles are questions ("what language loads with no stated
    preference"), so the card promotes the kernel's own sentence onto its face;
    a scored card keeps its title, whose wording already states what is wrong.
    Both are deduplicated — two pages measuring identically are one fact.
  - **The response matrix is rendered, and it is a real `<table>`.** What each
    leg asked for and what came back was collected and never shown. For a
    language audit that IS the behaviour under examination. The table was a
    `<ul>` of per-row grids, which meant every row sized its own columns: the
    widest leg ("no preference") shoved its language out of line with the four
    under it, so tabular data read as a broken table. **Anything laid out in
    columns down a list needs one layout context, not one per row** — a table
    here, since it also gives a screen reader the row/column pairing nested
    spans cannot express. The frame is a wrapper because `border-collapse` and
    `border-radius` do not cooperate. Right-aligned trailing content in a list
    of prose rows (`.audit-rule-summary`, `.audit-run`) is NOT this bug and
    needs no table.
  - **The matrix carries no mechanism — no status codes, no redirect chain, no
    path segments, and no language tags.** Two columns, both naming languages:
    "asked for" and "served". Those other things answer _how the answer was
    reached_, and this document answers _what you get if you ask in this
    language_; a `uk` beside "Ukrainian" was one table speaking two
    vocabularies. **Nothing is lost that a reader needed**: a bounce or an error
    that matters is a rule finding with a sentence, and the chain, the statuses
    and the `Location`s stay in the evidence bundle and the exported artifact —
    which is where a site owner disputing a finding goes. The one number that
    still reaches a decision is the status: at ≥ 400 the cell says "an error
    page" rather than naming the error page's `<html lang>`, because reporting a
    404 as "the site serves Ukrainian here" is a false statement about a named
    company. (`hopLabel` went with the chain; the untrusted-`Location` concern
    went with it, since no server-supplied text reaches this DOM any more.)
  - **`core/serving-default-language` gets no card**, because the matrix renders
    it in full: its entire content is "the leg that stated no preference came
    back in language X", which is the table's first row, in context with the
    other four. Keeping both made the observations section a restatement of the
    table directly above it. Its coverage row jumps to the matrix and carries
    the kernel's own sentence, so no finding's wording leaves the screen.
  - **Each fact appears once.** A report that says the same thing twice reads as
    padding and trains a reader to skim past the line that mattered. Three
    removals, each a duplicate the plain two-column table exposed: a prose line
    above the matrix naming the default language (that IS the table's first
    row); an empty-state under the matrix saying nothing was found (the verdict
    panel already says it, larger — and it contradicted the observations section
    right below it whenever a clean report still had something to observe); and
    a caption under "Open the site in Safari" explaining that a link to a site
    shows the site now. The coverage line and `notCollectedNote` sit next to
    each other and are NOT a duplicate pair: one is a count, the other is the
    policy that stops "0 broken promises" reading as all-clear.

  **There are no screenshots, and that is structural.** `Finding` carries a
  `screenshot?: { assetId, region }` slot, nothing sets it, and `Evidence` has
  no asset store for an `assetId` to resolve against. This collector fetches
  HTML and parses it with `DOMParser` — no script runs and no subresource
  loads, which is what makes it safe to point at a hostile page. Rendering for
  a snapshot would load third-party subresources, present a browser UA and blow
  the request budget, contradicting three of the four promises the composer
  prints above its own button. The report offers the live site instead
  (`openAuditedSite`), labelled as the site NOW rather than as it was.

  **An audit is the one thing in Movar that leaves the device**, so the first
  run of a session is gated behind an acknowledgement screen naming the host,
  what the request does and does not carry, and that the site's owner will see
  it. Session-scoped and in memory, like the run history: asked once, never
  written to disk. It is a SCREEN rather than a panel under the composer
  because its buttons landed under the fold on a phone, and a confirmation
  whose Cancel is off screen is not a confirmation.

- **Settings** (NATIVE — `SettingsView.swift`) — the extension's options
  surface: language priority, page-content filtering with its conceal mode, and
  the exempt-site list. The React version here composes the shared
  `@movar/options-ui` sections under `@movar/i18n`'s `I18nProvider`; the native
  one is a stock grouped `List` reading the same App Group through
  `SettingsStore.swift`. **Neither has a "Movar enabled" master switch any
  more** — Safari's own extension settings are the system-provided version of
  that control, and it was the only place in the whole product that could write
  `enabled: false`.
- **About** (NATIVE — `AboutView.swift`) — **not a tab**: the last row of
  Settings, pushed on iOS and presented as a sheet on macOS. A masthead plus
  App / Support / Legal groups of links. The enablement step (iOS setup path /
  macOS "Open Safari Settings" CTA) is NOT on it — that moved to the top of
  Settings (`SetupBanner.swift`), where someone whose Movar is doing nothing
  actually looks.

It is **not** a React Native rewrite. The native Swift app, the `WKWebView` host,
the navigation bridge, and the strict CSP are unchanged.

## Boundaries & invariants

- **One JS + one CSS, fully self-contained.** `vite.config.ts` emits a single
  chunk + one stylesheet (`cssCodeSplit: false`) with **stable, hashless names**
  (`dist/host-app.js` + `dist/host-app.css`) — the committed Xcode references
  depend on them. Assets (the brand PNG) inline to `data:` URIs.
- **CSP is `default-src 'self'` — do not loosen it.** No inline `<script>`, no
  remote/CDN assets, no web-font downloads. The shell loads the bundle
  same-origin from `file://`.
- **No `@fontsource` web fonts.** The screen uses the native system font
  (`-apple-system`), matching the original.
- **Every size is `rem`, on a 4px grid, anchored to the system text size.** Not
  just type — the whole surface (spacing, gaps, padding, icon sizes, radii, the
  app-bar height, the content cap) is `rem` in `src/styles.css`, so the UI scales
  as ONE unit off the root instead of the text outgrowing fixed-px chrome. Every
  spacing/sizing value is a multiple of `0.25rem` (4px at the base root),
  matching `@movar/theme`'s `space` scale; `--radius` / `--radius-lg` /
  `--appbar-h` / `--control-h` / `--content-max` are tokenized. The **type ramp
  (`--text-ui-*`) is deliberately NOT on the 4px grid** — a type scale follows a
  modular ratio, not a spacing grid; it's the shared `@movar/theme` UI scale
  re-declared in `rem` here (the former private `--fs-*` ladder was folded in,
  contributing its `2xs`/`2xl` steps). **Don't reintroduce `px` for type OR
  layout, and don't add off-grid spacing.**
- **The root tracks the system, per platform.** `html.platform-ios` uses
  `font: -apple-system-body` (then re-asserts the brand face) so `1rem` tracks
  the user's Text Size / Accessibility "Larger Text" — live, and deliberately
  NOT floored (someone who picks the smallest size means it). **macOS** also
  adopts the system body size but floored at the 16px base
  (`max(-apple-system-body, 16px)`), because its `-apple-system-body` is the
  native ~13px AppKit size and would shrink this fully-rem UI ~19%. CSS can't
  floor a font keyword (`em`/`rem` in a root `font-size` resolve against the
  browser's initial 16px, not the keyword), so `App.tsx`'s
  `useSystemRootFontSize` measures it once and sets the root inline — safe on
  macOS precisely because it has no Dynamic Type slider, so the value can't go
  stale. Today the floor always wins → macOS renders at a flat 16px. The shell
  reflects the platform onto **`<html>`** as well as `<body>`
  (`useReflectPlatform`) so this anchor can key off the root element. Chromium
  (e2e visual + `vite preview`) ignores the Safari-only keyword and falls back to
  the 16px root, keeping baselines deterministic; Dynamic Type is verified
  on-device.
- **The only `px` left are physical.** Values that must NOT scale with text:
  hairline `1px` borders, `2px` focus rings, shadow/blur radii, the `.sr-only`
  clip hack, the `env()` safe-area insets, and the 16px root anchor itself.
- **One control height — `--control-h`.** Every single-line control on the
  screen (this file's `.btn` / `.link` / `.open-preferences` AND the shared
  `@movar/ui` Button/Select/Input the Settings tab mounts) resolves to
  `--control-h`, so a row of mixed controls lines up. The host sets
  `max(2.75rem, 44px)`: it scales with the type but never drops under the 44px
  HIG tap minimum. The popup/options don't set it and take @movar/ui's 2.5rem
  (40px) desktop default — see `packages/ui/AGENTS.md`.
- **i18n lives in React, and is mirrored back into `.lproj` for the native
  screens.** Host-shell chrome (tab labels, the detector copy + verdicts, the
  About copy) is the `en` + `uk` catalogues in `src/i18n/`. The **Settings
  copy comes from `@movar/i18n`** (so it can never drift from the extension).
  Both are hand-mirrored, key for key, into `Shared (App)/Resources/*.lproj/
Localizable.strings` for the two native screens — `HostStrings.swift` records
  which catalogue each key tracks. `docs/native-shells.md` ends with those being
  generated; until that generator exists a drift is meant to be a `diff`.
  Locale resolves from `navigator.language` (the wrapper never switches language
  at runtime); the Settings tab's `I18nProvider` resolves the same
  `navigator.language` (`uiLanguage: 'auto'`), keeping the two in lock-step.
- **Lucide icons only**, via `lucide-react` (the old inlined SVG `<symbol>`
  sprite is gone — icons ship inside the JS).
- **The native bridge contract — `show()` in, `callNative` out.** Swift calls a
  global `show(platform, enabled?, useSettings?, iosMajor?)` via
  `evaluateJavaScript` (installed at module eval, before React mounts, so a
  `show()` fired at `didFinish` is buffered not lost). macOS sends
  `enabled`/`useSettings`; iOS sends `iosMajor` (its 4th arg) so the About
  banner shows the version-correct Settings path — the "Apps" hop exists only on
  iOS 18+. The web layer posts structured
  `{ type, id, payload }` envelopes to `webkit.messageHandlers.controller` and
  awaits a reply via `window.__movarReply(id, json)`. Actions used:
  `readSettings` / `writeSettings` (the React Settings panel only — the native
  screen reaches the same App Group directly through `SettingsStore.swift`
  rather than round-tripping through a renderer), `open-preferences`,
  **`feedback`** / **`open-url`** (external links from whatever is still web —
  the native screens call `HostActions` directly), and **`probe`** (the Audit
  tab — see below). All of
  `webkit`/global touching lives in `src/bridge.ts`.
- **`callNative`'s reply timeout is per-call.** It defaults to 4000 ms, which is
  right for actions answering from local state. `probe` passes
  `PROBE_TIMEOUT_MS` (180 s) instead, because one probe is up to 10 real
  requests at a 15 s timeout each. Timing a probe out at 4 s would abandon a
  request Swift is still making and report a merely-slow site as unreachable —
  a false observation about a named company.
- **All audit egress is Swift, and that is load-bearing.** The WebView cannot
  `fetch` under `default-src 'self'`, so the network posture ADR §6 specifies
  (declared non-browser `User-Agent`, manual redirect walk, cold cookies, hard
  request budget, challenge → `blocked`) lives in ONE reviewable file rather
  than being spread across the web layer. Don't relax the CSP to "simplify"
  this; the constraint is the design.
- **Generated output is gitignored.** `dist/` and the synced App-bundle
  artifacts are build output; the committed source is this package.

## Appearance drift accepted (component reuse)

The Settings tab composes the shared `@movar/options-ui` sections rather than
re-implementing the static `Script.js` markup. Two pre-approved, minor visual
differences from magical-snyder's static screen result:

- **Conceal-mode picker.** The static HTML used plain radio buttons; the reused
  `ConcealModeField` renders the shared `@movar/ui` `SegmentedControl` (with the
  curtain/hide mini-previews). Functionally identical (writes `concealMode`).
- The shared sections keep their own Tailwind layout (headings, chips, move
  buttons) inside the host's dense `.panel` column, rather than the static
  screen's `.row`/`.field` rows for every control. The host CSS still provides
  the master-switch `.row`, the `.locked-note`, and the page/tab-bar chrome.

Per the spec, the Settings tab shows no blocked-language UI at all — Russian stays
blocked by the `enforceLockedLanguages` invariant in the settings port, and since #89
the block list is derived from `priority` rather than edited (the `BlockedSection`
component was deleted). It likewise omits the `LanguageSelector` (no UI-language
picker — the locale follows the device), and the About tab has **no brand lockup**
(that header was only in the #168 standalone onboarding screen).

## Public API / entry points

- `src/main.tsx` — Vite entry. Resolves locale, mounts `<App>`.
- `src/App.tsx` — the shell: the three-tab structure + bottom tab bar (roving
  tabindex + arrow-key nav) + the `<body>` platform class.
- `src/tabs/{DetectorTab,SettingsTab,AboutTab}.tsx` — the tab contents.
- `src/bridge.ts` — the only `webkit`/global touch point. `useHostState()`,
  `hostSettingsSource` (`SettingsSource`), `openSafariPreferences()`,
  `openFeedback()`, `openSourceCode()`, `openChangelog(locale, version)`.
  The URL the version stamp opens is **not** built here — `openChangelog` calls
  `@movar/brand`'s `changelogUrl(locale, version)`, the one builder the
  extension's popup/options footers and the marketing site's own footer link all
  read too. Only the _opening mechanism_ is host-specific (the native bridge,
  not an anchor).
- `src/tabs/AuditTab.tsx` — the Audit tab's composer + `normalizeAuditUrl`.
- `src/tabs/AuditReport.tsx` — the report screen: grouping, family sections, the
  verdict system, the coverage index.
- `src/audit/collect.ts` — the WebView collector: `collectMatrix()` turns
  `bridge.probe()` replies into `Evidence`. Deliberately small — it owns only
  what is different about a WebView (HTTP goes native, the DOM is real), and
  shares the `Link` grammar and page identity with the Node collector via
  `@movar/audit/collect/assemble`. The Swift reply is treated as **untrusted**:
  a malformed field degrades to a recorded `error` probe, never a crash and
  never a finding. Its `onProgress` reports each settled leg — a matrix can run
  for minutes, and the composer counts the legs off rather than swapping a label.
- `src/i18n/` — `messages-en.ts` (canonical shape) + `messages-uk.ts`,
  `resolveLocale()`, plus the two catalogues keyed by the kernel's own
  identifiers: `audit-rule-titles.ts` (rule IDs) and `audit-family-titles.ts`
  (family IDs).
- `scripts/sync-safari-app.mts` — copies the bundle into the App target's
  Resources and writes the localized `Main.html` shells.

## Commands

| Command                                                      | Does                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `pnpm --filter @movar/safari-host-app build`                 | `vite build` + sync into the Xcode App Resources                           |
| `pnpm --filter @movar/safari-host-app build:bundle`          | Just the Vite build (→ `dist/host-app.{js,css}`)                           |
| `pnpm --filter @movar/safari-host-app sync`                  | Just the sync step (needs a prior build)                                   |
| `pnpm --filter @movar/safari-host-app dev`                   | Vite dev server (browser preview; no native bridge — bridge actions no-op) |
| `pnpm --filter @movar/safari-host-app {typecheck,lint,test}` | Standard per-project checks                                                |

## Xcode integration — the external-link hand-off (`feedback` + `open-url`)

The About tab's footer carries three controls, on every platform, that open
something the WKWebView can't reach on its own (`default-src 'self'` + no
external-navigation handling), so each posts an outbound action `src/bridge.ts`
owns and the Swift shell fulfils:

- **"Send feedback"** — `openFeedback()` posts `{ type: 'feedback', id, payload: null }`.
- **"Source code"** — `openSourceCode()` posts `{ type: 'open-url', id, payload: SOURCE_URL }`
  (`@movar/brand` → `https://github.com/rejifald/movar`).
- **The version stamp** — `openChangelog(locale, version)` posts
  `{ type: 'open-url', id, payload: changelogUrl(…) }`, the public changelog on
  `SITE_URL` (`/changelog` or `/uk/changelog`, anchored `#v<version>`).

Both cases now exist in `Shared (App)/ViewController.swift`'s
`userContentController(_:didReceive:)`, alongside `open-preferences` /
`readSettings` / `writeSettings`. They read the **structured envelope**
(`message.body` is a dictionary with a `type` key), not the bare string the #168
onboarding bridge posted, and share one `openExternally(_:)` helper —
`UIApplication.shared.open` on iOS, `NSWorkspace.shared.open` on macOS — because
both links show on iOS **and** macOS.

Two deliberate asymmetries between the cases:

- **`feedback` carries no payload.** The `mailto:` is a Swift-side constant
  (`feedbackURLString`), hand-synced with `@movar/brand`'s `FEEDBACK_URL` — the
  Swift target can't import the TS package. Keep the two literally identical.
- **`open-url` validates its payload.** `httpsURL(from:)` accepts only an
  absolute `https` URL with a host; anything else is dropped. The payloads we
  send are baked-in `@movar/brand` constants, but they arrive as untrusted
  strings over the JS bridge, and that check is what keeps the case from being a
  launcher for `file:` / custom app schemes if a script ever ran in the WebView.
  A new link that needs a non-`https` scheme gets its own payload-free case, the
  way `feedback` did — do not widen this one.

## Localizing what the kernel says

`@movar/audit` is **not** translated, on purpose: its rule titles and finding
summaries are the wording an exported artifact carries and the CLI reproduces,
and a report whose text depends on who generated it is not replayable. So the
app localizes at the **display** layer — `src/i18n/audit-rule-titles.ts` maps
rule ID → Ukrainian title, and `ruleTitleFor()` falls back to the kernel's
English when an ID is missing.

Keying on the rule ID is what makes this safe: the ADR names rule IDs as
permanent public API, so they can be depended on, while the English wording
stays free to be reworded. `audit-rule-titles.test.ts` is the drift guard — it
fails the build when the kernel gains or loses a rule the catalogue does not
match, because a missing entry would otherwise render English forever and a
stale one would sit unnoticed. Each finding's own **Details** disclosure shows
the kernel's exact sentence verbatim, so a reader comparing the app against a
published report finds the same string.

## Xcode integration — the `probe` case (Movar Audit)

The Audit tab's only escape is `probe`, handled by **`Shared (App)/AuditProbe.swift`**
(`AuditProber`), which `ViewController` holds for its lifetime — the request
budget spans an audit run, not one message. It is a **conformer to an existing
contract**: the reply shape is what `packages/audit/src/collect/probe.ts`
already emits, so the same `Evidence` comes out of the CLI and out of this app.

Three things about it that are easy to "fix" wrongly:

- **`responseHeaders` is the FIRST response's, not the redirect destination's.**
  A locale-autodetect `302` at `/` is the response a shared cache stores for
  `/`, so it is the one that must carry `Vary: Accept-Language`; the `/uk/` page
  it points at is a fixed-locale URL that correctly does not vary. Reading the
  destination's headers makes `core/serving-vary-missing` ask about the wrong
  resource — a bug the Node collector shipped, caught only against a live site.
- **Redirects are refused, then walked by hand.**
  `willPerformHTTPRedirection` answers `completionHandler(nil)`. Letting
  `URLSession` follow them transparently would erase the chain that
  `core/switch-bounces` — the rule this product exists for — is adjudicated
  from.
- **Two constant sets are hand-synced with `probe.ts`**, the way
  `feedbackURLString` is with `@movar/brand`: `AuditProbeLimits.userAgent`
  (↔ `AUDIT_USER_AGENT`) and the challenge markers (↔ `CHALLENGE_BODY_MARKERS` /
  `CHALLENGE_HEADERS`). The Swift target cannot import the TS package. There is
  no guard — if you edit one, edit the other. Never add `server: cloudflare` to
  the markers: a large share of the web sits behind Cloudflare serving ordinary
  pages, and treating the header as a challenge signal would report most of the
  internet as unauditable.

The Audit tab's other native escape is **`exportReport`** (`{ filename, html }`),
which writes the self-contained artifact and hands it to the system: an
`UIActivityViewController` share sheet on iOS, an `NSSavePanel` on macOS — the
platforms want opposite things and the code does not pretend otherwise. The
filename is reduced to a bare extension-checked leaf before it touches the
filesystem (`safeReportFilename`), because it arrives over the JS bridge as an
untrusted string; the HTML is written as a **file** and never loaded into a
WebView here.

**Adding a Swift file needs a `project.pbxproj` edit** — the project uses
explicit file references, not Xcode 16 synchronized groups. `AuditProbe.swift`
needed six entries: one `PBXFileReference`, one `PBXGroup` child, and a
`PBXBuildFile` + `PBXSourcesBuildPhase` entry for **each** app target (iOS and
macOS — the two Extension targets must NOT get it). Verify with
`xcodebuild -list -project Movar.xcodeproj` (the project still parses) and
`plutil -convert xml1 -o /dev/null Movar.xcodeproj/project.pbxproj`.

A `swiftc -typecheck` against the Command Line Tools SDK will tell you about
most mistakes without the full pnpm+WXT+xcodebuild bootstrap — pass every file
you changed, since they compile as one module, and check BOTH platforms (the
`#if os(…)` branches mean a macOS-clean file can still be broken on iOS).

**It has one blind spot that has already shipped a broken `main`.** The CLT SDK
re-exports `Combine` transitively; the iOS/macOS 26 SDK does not. A file using
`ObservableObject` or `@Published` without `import Combine` therefore typechecks
CLEAN here and fails the real Xcode build with "does not conform to protocol
'ObservableObject'" (#512 → #513). **If your change touches a Combine or SwiftUI
property wrapper, do the real build** — and the real build is cheap now:

```bash
cd "apps/extension/safari/Movar" && xcodebuild -project Movar.xcodeproj -scheme "Movar (macOS)" -configuration Debug -destination 'platform=macOS' build CODE_SIGNING_ALLOWED=NO
```

…and the same with `-scheme "Movar (iOS)" -destination 'platform=iOS Simulator,name=iPhone 17 Pro'`.
Both need the three package builds below first, or the Extension target fails on
missing `Shared (Extension)/Resources`.

All three web-side helpers no-op when the bridge is absent (dev server /
preview / tests), so the About footer stays clickable outside the app.

**Before an Xcode build, regenerate every synced artifact** — all three are
gitignored, and a missing one fails the build rather than degrading:

```bash
pnpm --filter @movar/audit-engine build      # → Shared (App)/Resources/engine.js
pnpm --filter @movar/safari-host-app build   # → host-app.{js,css} + Main.html
pnpm --filter @movar/extension build:safari  # → Shared (Extension)/Resources/*
```

**Verify in Xcode:**

1. Confirm `host-app.js`, `host-app.css`, and the `Main.html` shell(s) resolve
   (not red) under **Shared (App) ▸ Resources**, and that the old `Style.css` /
   `Script.js` are gone.
2. Build + run **Movar (macOS)**. The shell renders the three tabs.
   - **Detector**: paste Ukrainian text → the "Ukrainian [uk]" verdict + an
     Evidence report (distinctive letters / function + common words / letter
     patterns per matched language); paste Russian → "Russian [ru]"; paste Latin
     → "No Cyrillic language detected".
   - **Settings** (native): the setup banner is at the top until the extension
     is on; reordering priority (Edit, or a row's context menu), adding a
     language, toggling page-content, picking a conceal mode, and adding an
     allowlist domain all persist (reopen the app / extension to confirm
     reconciliation). `https://WWW.Example.COM/path` must land in the list as
     `example.com`. There is no master switch and no UI-language picker.
     "Open Safari Settings" opens Safari's Extensions settings; switch back to
     the app → the banner disappears (the `didBecomeActive` refresh, which also
     re-reads settings). On macOS ≤ 12 (or `useSettings=false`) the legacy
     "Preferences" wording appears.
   - **About**: opened from the last row of Settings — a sheet on macOS, a push
     titled "‹ Settings" on iOS. Every row opens in the default mail client /
     browser.
3. Build + run **Movar (iOS)**. The setup banner shows the iOS chip path, and
   "I've done this" dismisses it for good (it is stored under
   `about.setupCardDismissed`; **uninstall the app to see it again** — clearing
   it is what a fresh install does).
4. Switch the device/app language to Ukrainian → the whole app renders `uk`
   copy. The native screens read `.lproj`; the web tabs read
   `navigator.language`.
5. Confirm no CSP violations in the WebView console.

**A synthetic tap does not drive a `UISwitch`.** Automating the simulator
(`simctl`, or the iOS-simulator MCP), a zero-duration tap on a SwiftUI `Toggle`
is silently ignored while `Button`, `NavigationLink` and list rows all respond —
so the page-content switch looks broken when it is not. Drive it with a touch
path that dwells (~140 ms) instead, and do not "fix" a Toggle that fails only
under automation.
