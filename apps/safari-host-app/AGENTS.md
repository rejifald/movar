# Safari Host App — `@movar/safari-host-app`

> Unified React host screen for the iOS/macOS Safari Web Extension wrapper app —
> the **Detector / Settings / About** tabs in one WKWebView. Bundled by Vite to
> ONE CSP-safe JS + ONE CSS the wrapper's `WKWebView` loads from the app bundle.
> The native Swift shell stays; this replaces the old static `Main.html` /
> `Style.css` / `Script.js` (and unifies what the #168 standalone onboarding
> screen did into the About tab).

## What it does

The Safari Web Extension ships inside a thin native app (`apps/extension/safari/Movar/`).
Launching that app opens a `WKWebView` (`Shared (App)/ViewController.swift`)
showing a three-tab host screen:

- **Detector** — an on-device Cyrillic-language checker (paste text → "Ukrainian"
  / "Russian" / "No Cyrillic language detected"). Runs entirely locally via
  `@movar/lang-detect`'s `detectCyrillicLanguage`; works with the extension off,
  nothing leaves the device.
- **Settings** — the extension's options surface re-hosted: the shared
  `@movar/options-ui` sections (`PrioritySection`, `PageContentSection`,
  `AllowlistSection`) under `@movar/i18n`'s `I18nProvider`, plus a host-only
  "Movar enabled" master switch and the "Russian is always blocked" note. Reads/
  writes `MovarSettings` through the native bridge into the shared App Group; the
  extension reconciles it.
- **About** — the demoted enablement step (iOS setup chips / macOS "Open Safari
  Settings" CTA / macOS "Movar is on") + the trust row, plus an iOS-only "Send
  feedback" button.

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
  global `show(platform, enabled?, useSettings?)` via `evaluateJavaScript`
  (installed at module eval, before React mounts, so a `show()` fired at
  `didFinish` is buffered not lost). The web layer posts structured
  `{ type, id, payload }` envelopes to `webkit.messageHandlers.controller` and
  awaits a reply via `window.__movarReply(id, json)`. Actions used:
  `readSettings` / `writeSettings` (Settings tab), `open-preferences` (macOS
  About CTA), and **`feedback`** / **`open-url`** (the About footer's feedback +
  source-code links, all platforms — see the ⚠️ below). All of
  `webkit`/global touching lives in `src/bridge.ts`.
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

Per the spec, the Settings tab deliberately omits the full `BlockedSection` (only
the locked-language note is shown) and the `LanguageSelector` (no UI-language
picker — the locale follows the device), and the About tab has **no brand
lockup** (that header was only in the #168 standalone onboarding screen).

## Public API / entry points

- `src/main.tsx` — Vite entry. Resolves locale, mounts `<App>`.
- `src/App.tsx` — the shell: the three-tab structure + bottom tab bar (roving
  tabindex + arrow-key nav) + the `<body>` platform class.
- `src/tabs/{DetectorTab,SettingsTab,AboutTab}.tsx` — the tab contents.
- `src/bridge.ts` — the only `webkit`/global touch point. `useHostState()`,
  `hostSettingsSource` (`SettingsSource`), `openSafariPreferences()`,
  `openFeedback()`.
- `src/i18n/` — `messages-en.ts` (canonical shape) + `messages-uk.ts`,
  `resolveLocale()`.
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

## Xcode integration — the `feedback` + `open-url` Swift handlers the Xcode pass MUST add

The web/build side is fully wired, but **Xcode itself was not run here** (no
Xcode in this environment). The About tab's footer carries two links, on every
platform, that post NEW outbound actions (both in `src/bridge.ts`):

- **"Send feedback"** — `openFeedback()` posts `{ type: 'feedback', id, payload: null }`.
- **"Source code"** — `openSourceCode()` posts `{ type: 'open-url', id, payload: SOURCE_URL }`
  (`@movar/brand` → `https://github.com/rejifald/movar`).

Both open an external URL the WKWebView can't reach on its own (its
`default-src 'self'` CSP + no external-navigation handling), so a native
hand-off is required.

> ⚠️ **NEW Swift handlers required (Phase-G / Xcode pass — not done here).** The
> existing `userContentController(_:didReceive:)` in `Shared (App)/ViewController.swift`
> only handles `open-preferences` (and `readSettings` / `writeSettings`). Add a
> **`feedback`** case (opens `FEEDBACK_URL` = `@movar/brand`'s
> `mailto:support@movar.fyi?subject=Movar%20feedback`) and an **`open-url`** case
> (opens `payload` as a URL). Both links are shown on iOS **and** macOS, so guard
> both platforms. The host bridge posts a **structured envelope** (`message.body`
> is a dictionary with a `type` key), NOT the bare string the #168 onboarding
> bridge posted — read `type` (and, for `open-url`, `payload`) off the body dict:
>
> ```swift
> // in userContentController(_:didReceive:), alongside the existing cases.
> // The host app posts { type, id, payload }; read `type` off the body dict.
> guard let body = message.body as? [String: Any],
>       let type = body["type"] as? String else { return }
>
> func openExternally(_ url: URL) {
> #if os(iOS)
>     UIApplication.shared.open(url)
> #elseif os(macOS)
>     NSWorkspace.shared.open(url)
> #endif
> }
>
> if type == "feedback" {
>     // Keep this string in sync with @movar/brand's FEEDBACK_URL.
>     if let url = URL(string: "mailto:support@movar.fyi?subject=Movar%20feedback") {
>         openExternally(url)
>     }
> } else if type == "open-url" {
>     // `payload` is the URL to open (currently @movar/brand's SOURCE_URL).
>     if let urlString = body["payload"] as? String, let url = URL(string: urlString) {
>         openExternally(url)
>     }
> }
> ```
>
> Until these cases exist, the links are safe no-ops on a real device (they post
> messages nothing consumes), and `openFeedback()` / `openSourceCode()` already
> no-op when the bridge is absent (dev server / preview / tests). Confirm the
> exact `mailto:` / repo strings against `@movar/brand`'s `FEEDBACK_URL` /
> `SOURCE_URL` so they never drift.

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
     "Send feedback" + "Source code" links work (after the Swift cases above).
3. Build + run **Movar (iOS)**. The About tab shows the iOS chip path and the
   footer links. After adding the `feedback` + `open-url` Swift cases (⚠️ above),
   "Send feedback" opens the mail composer to `support@movar.fyi` (subject "Movar
   feedback"), and "Source code" opens the GitHub repo.
4. Switch the device/app language to Ukrainian → the whole screen (chrome +
   Settings sections) renders the `uk` copy (driven by `navigator.language`).
5. Confirm no CSP violations in the WebView console.
