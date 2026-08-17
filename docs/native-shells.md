---
type: adr
id: native-shells
status: proposed
date: 2026-08-17
summary: Move every Movar app surface (Audit, Detector, Settings, About) from React-in-a-WebView to real platform components — SwiftUI on iOS/iPadOS/macOS, Compose on Android, WinUI 3 on Windows — while the audit itself keeps running in JavaScript inside a headless, never-displayed system WebView. Consistency is a property of `evaluate()` producing the same `Report` from the same `Evidence`, not of the two runtimes drawing the same pixels, so the kernel stays the single source of truth and the UI stops being one. Introduces `@movar/audit-engine` (the headless bundle), promotes the existing `ProbeRequest`/`ProbeReply` bridge to the cross-platform native contract, and routes settings mutations through the engine so `@movar/settings`' migrations and locked-language invariants are never reimplemented natively. iOS/macOS first; Android and Windows follow; Linux is designed for but deliberately not built. Appearance is each platform's canonical stock look — drift between platforms is the deliverable, not a defect — with the brand surface narrowed to one accent pair and the mark; the UI face is the system face, because a shipped font would undo the decision more visibly than any colour. All three stores permit this and recommend it; the binding store constraint is elsewhere, in the rule against runtime-downloaded code, which is what makes syncing the engine bundle into app resources load-bearing compliance rather than build convenience.
---

# Native shells over a headless audit engine

## Context

Every Movar app surface today is React rendered in a `WKWebView`. The tab bar is
`<div className="tabs" role="tablist">`
([HostLayout.tsx](../apps/safari-host-app/src/HostLayout.tsx)); the report is a
1,064-line React tree ([AuditReport.tsx](../apps/safari-host-app/src/tabs/AuditReport.tsx));
iOS Dynamic Type is approximated with `html.platform-ios { font: -apple-system-body }`.

That was the right call when the wrapper existed to satisfy Apple's Safari Web
Extension container requirement and the app screen was mostly a launcher. It no
longer is. The goal now is a tool a site owner runs to audit their site, on the
platform they already work on, and two things follow:

1. **A WebView cannot render platform components.** Liquid Glass, Fluent, and
   Material are not CSS. No amount of styling gets a real `UITabBar` or a real
   `NavigationSplitView`, and mimicry is most obvious precisely where users spend
   the most time.
2. **The report is a long list of expandable rule results** — the exact shape
   native list virtualization is built for, and the exact shape a deep DOM tree
   handles worst on mobile.

The counter-argument was that identical rendering across platforms is what proves
"same evidence, same answer." It is not. That invariant lives in `evaluate()`, a
pure function from `Evidence` to `Report`, enforced by
[purity.test.ts](../packages/audit/src/purity.test.ts). It is a property of the
data, and it survives any renderer.

## Decision

**Native UI on every platform. JavaScript for the audit only, in a headless
WebView.**

No exceptions for the report, the detector, the settings form, or the About
screen. Nothing web-shell-shaped survives — in particular Tauri, whose entire
value was rendering the existing React tree, is not adopted.

### The three layers

```
┌──────────────────────────────────────────────────────────────┐
│  Native UI          SwiftUI / Compose / WinUI 3              │
│                     renders Report, emits intents            │
├──────────────────────────────────────────────────────────────┤
│  Native host        HTTP (the probe), file export,           │
│                     App Group / storage, JSON transport      │
├──────────────────────────────────────────────────────────────┤
│  @movar/audit-engine    headless system WebView, never shown │
│                     collector + digest-dom + evaluate()      │
└──────────────────────────────────────────────────────────────┘
```

### Why a headless WebView and not an embedded JS engine

[digest-dom.ts](../packages/audit/src/collect/digest-dom.ts) needs a genuine
`Document`, and `@movar/lang-pickers` narrows with `instanceof HTMLAnchorElement`
on **globals** — the exact hazard
[digest.ts](../packages/audit/src/collect/digest.ts) installs jsdom to avoid under
Node. A DOM shim over QuickJS or JavaScriptCore that is subtly unfaithful returns
`not-applicable` on four rules instead of failing loudly, which is a false pass on
someone's audit. Every target platform ships a WebView (WKWebView, Android
WebView, WebView2, WebKitGTK); using one purely as a DOM plus JS host costs
nothing at render time because nothing renders.

The performance argument for going native points here rather than away from it:
the cost was never running the rules, it was drawing them.

### Why HTTP stays native

The WebView runs under `default-src 'self'`, so it cannot fetch. That is the
design, not an obstacle — it forces every byte of egress through one auditable
native file that owns the declared `User-Agent`, cold cookie state, the manual
redirect walk, and the request budget ([movar-audit.md](movar-audit.md) §9). Today
that file is [AuditProbe.swift](<../apps/extension/safari/Movar/Shared%20(App)/AuditProbe.swift>).
Keeping the probe native on every platform is what makes that a property of Movar
Audit rather than a property of Safari.

## The contract

`ProbeRequest` / `ProbeReply`, already proven against Swift in
[bridge.ts](../apps/safari-host-app/src/bridge.ts), is promoted to _the_
cross-platform native contract and moves into `@movar/audit-engine`. Three
consequences:

- **`Report` becomes a versioned published type.** `Evidence` already carries
  `EVIDENCE_SCHEMA_VERSION`; `Report` needs the same, because three native
  decoders will depend on its shape. Emit JSON Schema from the TS types and
  generate Swift `Codable` / Kotlin `@Serializable` / C# records, so a rule-shape
  change breaks a build instead of a user's report.
- **The collector id stops being hardcoded.** `COLLECTOR_ID = 'swift-urlsession'`
  is stamped into evidence for replay forensics; each host declares its own
  (`okhttp`, `winrt-http`) at engine init.
- **Every report names the engine that produced it.** `Report` carries an
  `EngineStamp` (`id` + `version`) written _during_ `evaluate()`, not patched on
  afterwards, and the audit surface displays it. A report is a document a site
  owner may re-adjudicate months later against a different build; without a build
  identity, "I got a different answer" is unresolvable. The stamp is optional on
  the type because `evaluate()` is pure and the CLI and tests call it too — but a
  report that lacks one must render as _unknown_, never as a default. Inventing a
  build identity in a replayable document is worse than admitting there isn't one.
  The version is baked in at bundle build (`__MOVAR_ENGINE_VERSION__`), mirroring
  how the host app already bakes `__MOVAR_VERSION__`, because a `file://` bundle
  under a strict CSP has no runtime to ask.

- **One probe conformance suite, run against every implementation.** Fixture-driven,
  covering redirect chains, challenge detection, budget accounting, and the
  `Accept-Language` matrix. Without it three probes drift, and drift here means
  different verdicts per platform — the one outcome the product cannot have.

## Platform scope

| Platform             | Stack                                 | Status                                                                       |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| iOS / iPadOS / macOS | SwiftUI                               | **first** — Xcode project, Swift probe, and App Store presence already exist |
| Android              | Compose, `LazyColumn`                 | after iOS/macOS                                                              |
| Windows              | WinUI 3, `ItemsRepeater` + `Expander` | after Android                                                                |
| Linux                | GTK4 / libadwaita, `AdwExpanderRow`   | **designed for, not built**                                                  |

Linux is deliberately deferred rather than designed out: nothing in the engine,
the contract, or the conformance suite is allowed to assume a platform, so a GTK
shell stays a shell-only exercise whenever it is worth doing. In the meantime that
audience is served better by the `movar-audit` CLI
([collect/cli.ts](../packages/audit/src/collect/cli.ts)) than by a GTK app, and
dropping it removes a quarter of the recurring UI tax.

## Appearance: canonical per-OS, one brand accent

**Start at each platform's stock appearance and change almost nothing.** Drift
between platforms is not a defect here, it is the deliverable — a report that
looks like a Files list on iOS and like a WinUI tree on Windows is a report that
looks _right_ on both.

The first pass therefore ships stock: standard navigation, standard list and
disclosure controls, the platform type ramp, the platform's own light and dark
palettes, SF Symbols / Material Symbols / Fluent icons in place of lucide. Brand
touch-ups are a **second, separate decision**, taken against a working stock build
rather than designed up front.

### What crosses the boundary

Almost nothing, and that is deliberate. Once the OS owns layout, the parts of
`@movar/theme` a native shell could consume are the parts it must not: `space`,
`radius`, `breakpoints`, `shadow`, `zIndex`, `duration`, `easing` and `fontSizeUi`
are all answers to questions the platform has already answered. Pushing them
across is how an app ends up looking like a web page wearing a native tab bar —
and that drift has already started, since the Safari host re-declares the whole
`fontSizeUi` ladder in `rem` to approximate iOS Dynamic Type. Native gets Dynamic
Type by asking for it.

The **brand core** is what survives:

- **The accent**, `--accent` (Forest 700, `#15803d`) plus `accent-on`. It becomes
  the SwiftUI tint, the Material seed, and the WinUI accent override. This is the
  whole of the "brand color change" and it is a first-class API on all three.
  **Caveat found in the first slice:** `.tint()` is macOS 12, and this app ships to
  a macOS 11.0 deployment target, so Apple needs an availability branch down to
  `accentColor`. Worth knowing before assuming a modern API is reachable — the
  Safari container's floor is older than the design language it is adopting.
- **The mark** — wordmark and app icon, already per-platform assets.

**Fonts do not cross.** Manrope as the UI face would undo the canonical decision
more visibly than any colour choice: it fights Dynamic Type (a custom face needs
explicit `UIFontMetrics` wiring and loses the system's optical sizing), and it
breaks the metric alignment that makes stock layouts sit right next to SF Symbols.
The same holds for Segoe UI Variable and Roboto. Two consequences:

- **UI text is the system face**, everywhere.
- **The brand face is for brand moments only** — the wordmark, and at most the
  About lede.
- **Monospace is the system mono** (SF Mono / Roboto Mono / Cascadia Mono) rather
  than IBM Plex Mono. The audit report's evidence rows are the one place mono
  carries meaning, and a platform-tuned mono reads better there than a shipped one.

This is narrower than "fonts and a brand colour": in practice it is one colour
pair and the mark.

### Where it lives

`@movar/theme` stays the single source and keeps its full token set — the
extension popup and options, and the marketing site, still need all of it. It
gains a narrow `brandCore` export and native emitters (Swift `Color`, a Compose
theme, WinUI resources) beside the existing `gen-theme-css.mts`, so one file
feeds both audiences.

Not a new package. `@movar/brand` is contact and identity constants (support
mail, source and site URLs, changelog paths) and stays that way; a third
brand-shaped package would leave three plausible homes for a colour and no rule
for picking one.

## Store constraints

Checked against the App Store Review Guidelines, Google Play policy, and the
Microsoft Store Policies. Guideline numbering drifts and Apple periodically sets
an SDK floor for new submissions, so re-check both at submission rather than
trusting the numbers here.

**Stock appearance with a brand accent is allowed on all three, and is the
recommended path rather than a tolerated one.** No store requires visual
distinctiveness. Apple's HIG argues for standard controls; tinting is
`.tint()` and, under Liquid Glass, `.glassEffect(.regular.tint(…))`. Material 3
is built to be themed from a seed colour. Microsoft documents Mica plus an accent
as the Windows 11 pattern. The scrutiny runs the other way: apps that override
system controls into something unrecognisable attract it, apps that use them do
not.

One Android nuance that is UX rather than policy: a fixed brand seed opts out of
Material You dynamic colour. Honour `dynamicColor` where the device offers it and
fall back to the seed.

**The engine bundle must ship inside the app bundle.** All three stores prohibit
downloading and executing code at runtime (Apple 2.5.2; Play's device-and-network-abuse
policy). `@movar/audit-engine` is built to one self-contained file and synced into
the app's resources — the mechanism
[`sync-safari-app.mts`](../apps/safari-host-app/scripts/sync-safari-app.mts) already
implements for `host-app.js`. **A build that fetched the engine from a CDN would be
a violation on every platform**, so that sync step is load-bearing compliance, not
a build convenience. It is also why the offscreen WebView is safe here where a
remote one would not be.

**Minimum functionality stays the live risk, and the migration reduces it.**
Apple's rule against apps that are "a repackaged website" (historically 4.2) is the
one this app has to keep clearing. A native app carrying an audit tool, a detector
and settings sits further from that line than React in a `WKWebView` does. What has
to be protected is that the container keeps doing real work rather than decaying
into "here is how to enable the extension in Safari."

**Accessibility is an upside, not just compliance.** The current tab bar is a
`<div role="tablist">` with hand-rolled arrow-key handling. Stock `TabView` /
`NavigationSplitView` gives VoiceOver, Dynamic Type, Full Keyboard Access and
Reduce Motion correctly by default.

## What survives the migration

### Audit — ports wholesale, and gains the most

[AuditTab.tsx](../apps/safari-host-app/src/tabs/AuditTab.tsx) (597 lines, composer
and progress) and `AuditReport.tsx` (1,064 lines) become SwiftUI `List` +
`DisclosureGroup`. This is the largest rewrite and the main payoff: an expandable
list of rule results is a native list, and it is what users spend their time in.

The export path does **not** move. The ADR's self-contained HTML artifact is a
_file_, not UI, so the engine keeps generating it headlessly and hands the string
to the native `exportReport` — identical output on every platform, for free.

### Detector — done; the closed set is visible and configurable

**Shipped as the second native slice, and the one that put the engine in the
app.** `Shared (App)/DetectorView.swift` renders it; the verdict comes from
`detect.run` in `@movar/audit-engine`, so it runs the same `classifyBySnippet`
the extension runs on real pages.

The tab used to present a **closed-set discriminator in open-set language**: a
hardcoded `[PROFILES.uk, PROFILES.ru, PROFILES.be]` and a "No Cyrillic language
detected" that reads as an answer about the text rather than about three
candidates. Being closed-set is correct — it is what the extension needs, and
langtell scores distinctiveness **candidate-relative** by design. The defect was
that the candidate set was invisible and fixed. What landed:

1. **The rung-1 distinctive set is derived, not hardcoded**
   ([distinctive.ts](../packages/lang-detect/src/distinctive.ts)), as the
   set-difference of `alphabet` + `marks` across the candidates in scope.

   **The hardcoded table was already wrong, and had been since Belarusian
   joined.** `SIGNAL_SETS`' uk entry claimed `і`, which Belarusian also has; its
   ru entry claimed `ы` and `ё`, which Belarusian has too — so among
   `{uk, ru, be}` the only letter Russian solely owns is `ъ`. langtell had been
   scoring this correctly the whole time (`tally` credits a sole owner only), so
   the verdicts were right and the **evidence under them described a
   two-candidate world**. That is the failure mode a derived set removes: not a
   wrong answer, a confidently wrong explanation.

2. **The candidate set is an input, and the reader owns it.** A roster editor
   adds and removes from `PROFILED_CODES`, which the shell asks for via
   `detect.catalogue` rather than duplicating natively — the same hand-synced
   list that produced (1). The floor is one candidate, not two, because a
   one-candidate roster is the clearest possible demonstration of what closed-set
   matching means and the result screen says so out loud.

The verdict states its own scope ("Closest of 3 · distinctive letters"), the
evidence lists **every** candidate including the ones that lost, and a
**"counted for nobody"** row shows the signals two candidates share — without
which a reader sees `і` in their Ukrainian text, no `і` in the Ukrainian
evidence, and concludes the tool is broken.

`SnippetVerdict.discriminating` is finally rendered. The React tab never read it,
though it had carried the flag all along: it is `false` exactly when one
candidate was in scope, which means the verdict was forced and any text in that
alphabet would have "matched".

### About — port first, needs no engine at all

321 lines that are static content, an enablement banner that is a pure function of
`HostState` (`platform`, `enabled`, `iosMajor`), and four buttons that **already**
call into Swift (`openFeedback`, `openSourceCode`, `openSafariPreferences`,
`openChangelog`). There is no JS to keep and no state to migrate.

It is therefore the correct first slice: lowest risk, no engine dependency, and it
collects the most per line — SF Symbols replace lucide, real Dynamic Type replaces
the `-apple-system-body` hack, stock `Link` replaces some bridge calls, and
standard SwiftUI navigation adopts Liquid Glass without being asked. It proves the
native shell before any audit code moves.

**Not every bridge call becomes a stock control, though.** `SettingsLink` opens
the app's _own_ Settings scene and cannot reach Safari's Extensions pane at all
(and is macOS 14+ regardless), so `SFSafariApplication.showPreferencesForExtension`
stays. External links likewise keep going through one native helper rather than
stock `Link`, so there is exactly one audited egress point for as long as any tab
is still web. The general rule the slice established: replace a bridge call with a
system control only where the system control does the same job, not merely where
one exists with a similar name.

### Settings — the transport already works; the invariants are the risk

The sync mechanism is native today and **does not change**: a shared App Group
(`group.fyi.movar.safari`) holding `settings` plus a monotonic `settingsRev`, with
`MovarAppGroup` duplicated across the host app and
[SafariWebExtensionHandler.swift](<../apps/extension/safari/Movar/Shared%20(Extension)/SafariWebExtensionHandler.swift>)
because the targets do not link. The extension's background worker pulls
(`getSettings`) on wake and pushes (`setSettings`) on edit, reconciling with
`browser.storage.sync`; highest `rev` wins. Going native _removes_ a hop — SwiftUI
reads and writes the App Group directly instead of through the WebView bridge.

The hazard is elsewhere. `@movar/settings` owns the schema, `migrateSettings`, and
the invariants — `enforceLockedLanguages`, `deriveBlocked(priority)`,
`normalizeAllowlist`, `DOMAIN_PATTERN`. Today the React tab writes _through_ that
code, so the invariants always hold. A SwiftUI form that constructs settings JSON
directly would hold them only as long as a Swift reimplementation stays in step —
and `LOCKED_BLOCKED_LANGUAGES` is not a cosmetic rule. Drift there means either a
state the extension rejects or, worse, a locked language silently unblocked.

**So settings mutations route through the engine, and native never builds settings
JSON.** The same headless WebView already loaded for the audit gains a second,
cheap responsibility:

- Native reads the App Group → hands the raw blob to the engine → engine runs
  `migrateSettings` → returns validated `MovarSettings`.
- Native emits an **intent** (`setPriority`, `toggleContentModification`,
  `addAllowlistDomain`) → engine applies it and re-runs
  `enforceLockedLanguages` → returns the next validated `MovarSettings` → native
  writes it to the App Group and bumps `rev`.

Native owns layout and controls; TypeScript stays the only place the settings
schema exists. Android and Windows inherit the guarantee without further work.

`LanguageSelector` stays unrendered, as today — the app's locale follows the
device.

## Consequences

- **Three UI implementations**, recurring rather than one-time. Roughly 2,500
  React-equivalent lines per platform across the four surfaces.
- **Three probe implementations** held together by the conformance suite.
- **i18n moves native.** [audit-rule-titles.ts](../apps/safari-host-app/src/i18n/audit-rule-titles.ts)
  and `audit-family-titles.ts` resolve in React today. The engine emits stable rule
  **IDs**; native owns the strings, generated from the TS catalogues into
  `.strings` / `strings.xml` / `.resx` at build time, so platform localization
  stays idiomatic and the engine stays presentation-free.
- **Theme tokens need native emitters.** `pnpm gen:theme` produces CSS; add Swift
  `Color`, Compose, and WinUI resource outputs from the same source so brand does
  not fork.
- **`apps/safari-host-app` is retired incrementally**, one tab at a time. About
  and Detector have moved; Audit and Settings remain, and both already have their
  engine requests defined (`audit.run`, `settings.load` / `settings.apply`).
- **The engine host is no longer hypothetical.** `Shared (App)/EngineHost.swift`
  loads `Resources/engine.js` into a `WKWebView` that is never added to a view
  hierarchy, under a `default-src 'none'` document with no origin, and routes the
  probe back out through `AuditProbe`. Both Safari build paths already rebuild
  the bundle first — but a bare `xcodebuild` does not, so an engine older than
  the request kind a shell sends produces no event at all and the feature simply
  looks absent. Rebuild the engine explicitly when iterating on it.

## Open questions

- Whether `Report` versioning should reject an unknown `schemaVersion` outright or
  render degraded. Rejecting is safer for a document that carries legal weight
  under the `ua` pack.
- ~~Whether the detector's default candidate set follows `priority` (diagnostic)
  or stays uk/ru/be (stable demo).~~ **Resolved: uk/ru/be, and `priority` is not
  a usable source.** `enforceLockedLanguages` strips locked codes from
  `priority`, so `ru` — the language the product exists to detect — is never in
  it; and the default `['uk', 'en']` is two scripts, so script scoping leaves one
  candidate and every Cyrillic text comes back "Ukrainian" by default. A
  priority-derived roster is not a weaker diagnostic, it is a broken one. The
  roster is instead the reader's, persisted in the host app's own `UserDefaults`
  — deliberately NOT the App Group, since it changes what this screen compares
  and nothing about what the extension hides.
- Whether Windows ships the probe in C#/.NET or reuses a Rust core shared with a
  future Linux shell.
- Whether the native tint tracks `--accent` unchanged in dark mode (as the web
  palette does — `accent` is one of the few colours `colorDarkOverrides` leaves
  alone) or lightens the way platform accents normally do. Forest 700 on a
  near-black background is thin for anything text-sized.

## References

- [movar-audit.md](movar-audit.md) — the audit ADR; §9 owns the egress posture
- [safari-deploy.md](safari-deploy.md) — the existing iOS/macOS release path
- [ROADMAP.md](ROADMAP.md) — Safari distribution status
