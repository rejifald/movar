# Safari Host App — `@movar/safari-host-app`

> Unified React host screen for the iOS/macOS Safari Web Extension wrapper app —
> the **Detector / Audit / Settings / About** tabs in one WKWebView. Bundled by Vite to
> ONE CSP-safe JS + ONE CSS the wrapper's `WKWebView` loads from the app bundle.
> The native Swift shell stays; this replaces the old static `Main.html` /
> `Style.css` / `Script.js` (and unifies what the #168 standalone onboarding
> screen did into the About tab).

## What it does

The Safari Web Extension ships inside a thin native app (`apps/extension/safari/Movar/`).
Launching that app opens a `WKWebView` (`Shared (App)/ViewController.swift`)
showing a four-tab host screen:

- **Detector** — an on-device Cyrillic-language checker (paste text → "Ukrainian"
  / "Russian" / "No Cyrillic language detected"). Runs entirely locally via
  `@movar/lang-detect`'s `detectCyrillicLanguage`; works with the extension off,
  nothing leaves the device.
- **Audit** — [Movar Audit](../../docs/movar-audit.md)'s app surface. Type a
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

  The tab is **two screens**: a composer (URL + the pack opt-in + a list of
  previous checks) and a report screen. A language conformance report is a
  document, not a form's output — and rendering it inline buried the previous
  run the moment a new one started. Previous checks are **session-only, in
  memory** (`MAX_REMEMBERED_RUNS`); nothing about an audit is written to disk,
  which the UI states next to the list rather than leaving to discovery. The
  report screen can re-run its own target and **export** itself.

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

- **Settings** — the extension's options surface re-hosted: the shared
  `@movar/options-ui` sections (`PrioritySection`, `PageContentSection`,
  `AllowlistSection`) under `@movar/i18n`'s `I18nProvider`, plus a host-only
  "Movar enabled" master switch and the "Russian is always blocked" note. Reads/
  writes `MovarSettings` through the native bridge into the shared App Group; the
  extension reconciles it.
- **About** — the demoted enablement step (iOS setup chips / macOS "Open Safari
  Settings" CTA / macOS "Movar is on") + the trust row, plus a footer of
  external links — "Send feedback", "Source code", and the `v<version>` stamp
  (which opens this build's entry on the public changelog) — on every platform.

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
- **i18n lives in React now, not `.lproj`.** Host-shell chrome (tab labels, the
  detector copy + verdicts, the About enablement copy, the master-switch label)
  is the `en` + `uk` catalogues in `src/i18n/`. The **Settings tab's section
  copy comes from `@movar/i18n`** (so it can never drift from the extension).
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
  `readSettings` / `writeSettings` (Settings tab), `open-preferences` (macOS
  About CTA), **`feedback`** / **`open-url`** (the About footer's feedback,
  source-code, and changelog links, all platforms — see the Xcode-integration
  section below), and **`probe`** (the Audit tab — see below). All of
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

Verify a Swift change here without the full pnpm+WXT+xcodebuild bootstrap —
pass every file you changed, since they compile as one module:

```bash
cd "apps/extension/safari/Movar" && xcrun swiftc -typecheck -sdk "$(xcrun --sdk macosx --show-sdk-path)" -target arm64-apple-macos12.0 "Shared (App)/ViewController.swift" "Shared (App)/AuditProbe.swift"
```

…and the same with `--sdk iphoneos` / `-target arm64-apple-ios15.0`. Both
platforms must be checked: the `#if os(…)` branches mean a macOS-clean file can
still be broken on iOS.

All three web-side helpers no-op when the bridge is absent (dev server /
preview / tests), so the About footer stays clickable outside the app.

**Before an Xcode build, regenerate the bundle** (the synced files are
gitignored): `pnpm --filter @movar/safari-host-app build`.

**Verify in Xcode (could not be done in this environment):**

1. Confirm `host-app.js`, `host-app.css`, and the `Main.html` shell(s) resolve
   (not red) under **Shared (App) ▸ Resources**, and that the old `Style.css` /
   `Script.js` are gone.
2. Build + run **Movar (macOS)**. The host screen renders the three tabs.
   - **Detector**: paste Ukrainian text → the "Ukrainian [uk]" verdict + an
     Evidence report (distinctive letters / function + common words / letter
     patterns per matched language); paste Russian → "Russian [ru]"; paste Latin
     → "No Cyrillic language detected".
   - **Settings**: toggling the "Movar enabled" master switch, reordering
     priority, toggling page-content, and adding an allowlist domain all persist
     (reopen the app / extension to confirm reconciliation). The Russian-locked
     note is shown; there's no UI-language picker.
   - **About**: the lede + "What Movar does" features render; "Open Safari
     Settings" opens Safari's Extensions settings; switch back to the app → it
     updates to "Movar is on" (the `didBecomeActive` refresh). On macOS ≤ 12 (or
     `useSettings=false`) the legacy "Preferences" wording appears. The footer's
     "Send feedback", "Source code", and `v<version>` links each open in the
     default mail client / browser (the `feedback` + `open-url` cases above).
3. Build + run **Movar (iOS)**. The About tab shows the iOS chip path and the
   footer links: "Send feedback" opens the mail composer to `support@movar.fyi`
   (subject "Movar feedback"), "Source code" opens the GitHub repo, and the
   version stamp opens `movar.fyi/changelog` scrolled to this release.
4. Switch the device/app language to Ukrainian → the whole screen (chrome +
   Settings sections) renders the `uk` copy (driven by `navigator.language`).
5. Confirm no CSP violations in the WebView console.
