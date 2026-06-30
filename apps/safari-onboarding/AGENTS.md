# Safari Wrapper Onboarding — `@movar/safari-onboarding`

> React onboarding/enablement screen for the iOS/macOS Safari Web Extension wrapper app. Bundled by Vite to ONE CSP-safe JS + ONE CSS that the wrapper's `WKWebView` loads from the app bundle. The native Swift shell stays; this only replaces the old static `Main.html` / `Style.css` / `Script.js`.

## What it does

The Safari Web Extension ships inside a thin native app (`apps/extension/safari/Movar/`). When the user launches that app, a `WKWebView` (`Shared (App)/ViewController.swift`) shows a one-screen status/onboarding page: "turn Movar on in Settings/Safari" (setup) or "Movar is on" (macOS, enabled). This package is the React implementation of that screen, reusing `@movar/ui` and the shared design tokens.

It is **not** a React Native rewrite. The native Swift app, the `WKWebView` host, the navigation bridge, and the strict CSP are unchanged.

## Boundaries & invariants

- **One JS + one CSS, fully self-contained.** `vite.config.ts` is configured for a single chunk (`inlineDynamicImports`, no `manualChunks`), one stylesheet (`cssCodeSplit: false`), and inlined assets (the brand PNG → data URI). The output is `dist/onboarding.js` + `dist/onboarding.css` with **stable, hashless names** (the committed Xcode references depend on them).
- **CSP is `default-src 'self'` — do not loosen it.** No inline `<script>`, no remote/CDN assets, no web-font downloads. The shell loads the bundle same-origin from `file://`; the brand image is an inlined `data:` URI. The shell's CSP `<meta>` is written by `scripts/sync-safari-app.mts`.
- **No `@fontsource` web fonts.** Unlike the extension's `globals.css`, this screen uses the native system font (`-apple-system`), matching the original. Bundling subset fonts would bloat the single CSS with base64 for no benefit on a native-app screen.
- **The native bridge contract is frozen — with ONE additive action.** Swift calls a global `show(platform, enabled?, useSettings?)` via `evaluateJavaScript`, and the macOS button posts `'open-preferences'` to `webkit.messageHandlers.controller`. Both are preserved verbatim from the old `Script.js`. See `src/bridge.ts`. `window.show` is installed at **module eval** (before React mounts) and buffers the latest state, because Swift can fire `show()` at `didFinish` before React's first effect runs. The **"Send feedback" button** adds one new outbound action: it posts `'feedback'` to the same `controller` handler, expecting Swift to open `FEEDBACK_URL` (`mailto:support@movar.fyi?subject=Movar%20feedback`). Routing through the bridge (vs a `mailto:` anchor) is deliberate — the strict CSP makes a Swift hand-off the robust path, identical to how preferences open. **This needs a new Swift case — see the ⚠️ checklist item below.**
- **i18n lives in React now, not `.lproj`.** `en` + `uk` catalogues in `src/i18n/`; locale resolved from `navigator.language` (the wrapper app never switches language at runtime). All original strings are preserved 1:1. Both `Base.lproj/Main.html` and `uk.lproj/Main.html` are still emitted (identical shells) so the app stays a localized bundle and `navigator.language` reports the device locale.
- **Lucide icons only**, via `lucide-react` (the old inlined SVG `<symbol>` sprite is gone — icons ship inside the JS).
- **Generated output is gitignored.** `dist/` and the synced App-bundle artifacts (`onboarding.{js,css}`, both `Main.html` shells) are build output, like the extension's `Shared (Extension)/Resources/`. The committed source is this package. `Resources/Icon.png` stays tracked (static asset, still referenced by `project.pbxproj`, though the web layer no longer uses it).

## Public API / entry points

- `src/main.tsx` — Vite entry. Subscribes to the bridge, resolves locale, mounts `<App>`.
- `src/App.tsx` — the screen. Pure function of `(messages, state)`.
- `src/bridge.ts` — the only `webkit`/global touch point. `subscribe()`, `openSafariPreferences()`.
- `src/i18n/` — `messages-en.ts` (canonical shape) + `messages-uk.ts`, `resolveLocale()`.
- `scripts/sync-safari-app.mts` — copies the bundle into the App target's Resources and writes the localized `Main.html` shells.

## Commands

| Command                                                        | Does                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm --filter @movar/safari-onboarding build`                 | `vite build` + sync into the Xcode App Resources                                     |
| `pnpm --filter @movar/safari-onboarding build:bundle`          | Just the Vite build (→ `dist/`)                                                      |
| `pnpm --filter @movar/safari-onboarding sync`                  | Just the sync step (needs a prior build)                                             |
| `pnpm --filter @movar/safari-onboarding dev`                   | Vite dev server (browser preview; no native bridge — `openSafariPreferences` no-ops) |
| `pnpm --filter @movar/safari-onboarding {typecheck,lint,test}` | Standard per-project checks                                                          |

## Xcode integration — what the build touches, what you must verify in Xcode

The web/build side is fully wired; **Xcode itself was not run here** (no Xcode in CI/this env). The committed changes to `apps/extension/safari/Movar/Movar.xcodeproj/project.pbxproj`:

- **Removed** the `Style.css` and `Script.js` file references + build-file entries from both App targets (iOS + macOS).
- **Added** `onboarding.js` and `onboarding.css` as resources to both App targets.
- **Kept** the `Main.html` `PBXVariantGroup` (Base + uk) as the `WKWebView` entry, and `Icon.png`.

`ViewController.swift` needs **one additive change** for the new "Send feedback" button (the React→bundle wiring is otherwise unchanged — it still loads `Main.html` and calls `show(...)`; the shell references `../onboarding.{js,css}` at the Resources root, inside the existing `allowingReadAccessTo: Bundle.main.resourceURL`).

> ⚠️ **NEW Swift handler required — the user must add this in Xcode (not done here, no Xcode in this env).** The "Send feedback" button posts `'feedback'` to `webkit.messageHandlers.controller`. The existing `userContentController(_:didReceive:)` only handles `'open-preferences'`; add a `'feedback'` case that opens `FEEDBACK_URL` (`mailto:support@movar.fyi?subject=Movar%20feedback`). Suggested, mirroring the preferences case:
>
> ```swift
> // in userContentController(_:didReceive:), alongside the "open-preferences" case
> if message.body as? String == "feedback" {
>     let url = URL(string: "mailto:support@movar.fyi?subject=Movar%20feedback")!
> #if os(macOS)
>     NSWorkspace.shared.open(url)
> #elseif os(iOS)
>     // ViewController is a UIViewController on iOS; open via the app:
>     UIApplication.shared.open(url)
> #endif
> }
> ```
>
> Until this case exists, the button is a safe no-op on a real device (it just posts a message nothing consumes) — `openFeedback()` in `src/bridge.ts` also no-ops when the bridge is absent (dev server / preview). Confirm the exact `mailto:` string against `@movar/brand`'s `FEEDBACK_URL` so they never drift.

**Before an Xcode build, regenerate the bundle** (the synced files are gitignored, like the extension Resources):

```
pnpm --filter @movar/safari-onboarding build
```

**Verify in Xcode (could not be done in this environment):**

1. Open `apps/extension/safari/Movar/Movar.xcodeproj`; confirm `onboarding.js`, `onboarding.css`, `Base.lproj/Main.html`, `uk.lproj/Main.html`, and `Icon.png` resolve (not red) under **Shared (App) ▸ Resources**, and that `Style.css` / `Script.js` are gone.
2. Build + run **Movar (macOS)**. The onboarding screen should render the React UI (brand lockup, "One last step" / "Movar is on", Safari→Settings→Extensions chips, "Open Safari Settings" button, "Send feedback" button + trust footer). Click "Open Safari Settings" → Safari's Extensions settings open; switch back to the app → it updates to "Movar is on" (the `didBecomeActive` refresh). After adding the `'feedback'` Swift case (see ⚠️ above), click **Send feedback** → the default mail client opens a new message to `support@movar.fyi` with subject "Movar feedback".
3. On macOS 12 (or simulate `useSettings=false`), confirm the legacy "Preferences" wording appears.
4. Build + run **Movar (iOS)**. Confirm the iOS variant ("Turn on Movar in the Settings app", no button).
5. Switch the device/app language to Ukrainian and confirm the screen renders the `uk` copy (driven by `navigator.language`).
6. Confirm no CSP violations in the WebView console (the bundle is same-origin + inlined; there should be none).

```

```
