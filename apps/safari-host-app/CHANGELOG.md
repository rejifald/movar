# @movar/safari-host-app

## 0.1.1

### Patch Changes

- Updated dependencies [82a55ff]
- Updated dependencies [1463e3b]
- Updated dependencies [54f925d]
- Updated dependencies [eb7469c]
- Updated dependencies [a46a5cf]
- Updated dependencies [2d99090]
  - @movar/audit@0.2.0
  - @movar/audit-engine@0.1.1

## 0.1.0

### Minor Changes

- 0fc5446: Rebuild the Safari host app's Audit tab in SwiftUI, over the headless engine. Detector is the only web tab left.

  This was the slice `docs/native-shells.md` predicted would collect the most: "an expandable list of rule results is a native list, and it is what users spend their time in". 1,700 lines of React — a composer, a full-screen acknowledgement, and a 1,064-line report — become a stock `List` of `DisclosureGroup`s. The prediction held; what it did not anticipate is written up in the ADR.

  **Nothing native adjudicates anything.** `engine.js` now runs in a `WKWebView` that never draws, so every verdict, count and downgrade still comes out of `evaluate()`, the same pure kernel the CLI runs. That is what makes a native renderer safe at all: consistency was never a property of two runtimes drawing the same pixels, and a Swift reimplementation would have been a second adjudicator. The Swift side decodes a `Report` and lays it out.

  The engine had to answer two questions a `Report` cannot. A `RuleResult` carries no family, so a shell has no way to know which section `core/switch-bounces` belongs in — the React report reconstructed it by importing `CORE_RULESET`, and a native table hardcoding it would have silently mis-filed every rule added after this binary shipped, into no section at all. And a shell must never grow its own artifact renderer, because the exported file is the thing a site owner re-runs, so all of them and the CLI have to emit the same bytes. Hence `catalogue.describe` (structure, not strings — the ADR's line that native owns display copy still holds) and `audit.artifact`. Both additive; the protocol version did not move. `dispatch` also gained an unknown-kind branch: `handle` never rejects, so a request this build cannot answer must produce a stated refusal rather than no event at all, which would strand a caller on a reply that can never arrive.

  Three things the port taught about hosting an engine in a WebView. **It has to be IN the view hierarchy**, at zero size — a `WKWebView` with no window is a suspendable web process on iOS, and an audit stalled mid-matrix would read as a site that stopped answering, which is a false observation about a named company. "Never displayed" survives; "never attached" does not. **The two big payloads travel as text**: `audit.complete` hands `report` and `evidence` over pre-stringified, so Swift keeps exactly the bytes it re-sends for an export while decoding only the thin slice the screen draws — a bundle is mostly sampled text nodes, and materialising those per remembered run is the difference between a session of audits fitting on a phone and not. And **every request must end**: the engine failing to load, or its web process being jetsammed, both used to leave a button reading "Auditing…" until the app was force-quit. Both now fail loudly, and a crash costs the run in flight rather than the rest of the session.

  Two controls changed rather than ported. **Removal lost its confirmation**, correctly: the web list had to ask because its `×` was one stray tap from spending another full matrix of requests against somebody else's server, and swipe-to-delete charges that same deliberation without a second screen — the system control doing the same job, which is the only ground the About slice allowed for replacing a hand-rolled one. And **the filter pills became a `Menu`**, because the web bar wrapped and on a 390pt phone six pills hid their own last two options behind an invisible scrollbar; a menu states the active filter on its own row and keeps each option's count, which was always the useful part of a pill.

  i18n took its first generated step. The 46 Ukrainian rule titles and 6 family headings are written into `Localizable.strings` by `scripts/gen-audit-strings.mts`, which runs as part of the host app's build beside the bundle sync — those tables already carry a drift guard on the TypeScript side, and hand-copying the output would have put a second, unguarded copy one commit behind the guarded one. The ~70 prose strings stay hand-written: the native screen's wording deliberately differs from the web's in places (a filter row that needs a label, no per-row "Remove &lt;target&gt;" because swipe-to-delete names its own row), and a generator would have to encode which. Plurals are the one grammar rule still in Swift — English needs two forms and Ukrainian three, and a `.stringsdict` means a new localized variant group in the Xcode project for both app targets, which is a bigger change than the strings it would carry.

  `AuditTab.tsx` and `AuditReport.tsx` stay in `apps/safari-host-app` for the standalone web build, exactly as the Settings and About panels did. The bridge's `exportReport` case stays too, now delegating to the same `HostActions` the native button calls.

  Both schemes build clean, and the tab was exercised end to end on an iPhone 17 Pro simulator against a live site: the acknowledgement, a real run through the Swift prober, the response matrix, the Ukrainian rule titles, a disclosure's missing-capability sentence, the jurisdiction pack producing a cited finding under its own family heading, and an export rendering a 210 KB artifact into the share sheet.

- e0b947d: Rebuild the Safari host app's Settings tab in SwiftUI, and move About behind it. The tab bar goes from four tabs to three.

  Settings was the last web form pretending to be an app screen, and it had the same defect the About tab had before it: a `List` with no navigation bar has nothing to draw the scroll-edge material, so rows passed under the clock and the Dynamic Island at full contrast. It is now a stock grouped list with a real bar. Everything it hand-rolled has a stock counterpart doing the same job better — `↑ ↓ ×` typed as literal text glyphs become drag-to-reorder, swipe-to-delete and a row context menu; the `h3` headings sized off a web type ramp become section headers; the two grey "how it works" cards become the section footers they always wanted to be. The priority list is modelled on Settings ▸ General ▸ Language & Region, which is the same list with the same semantics.

  About is no longer a tab. Apple's tab-bar guidance weighs a tab against "the need for people to frequently access each section", and an About screen is a once-ever destination; across eighteen sampled iOS apps, not one carried About as a peer tab and every About screen was a push from Settings. So About keeps the screen it was rebuilt into last release and loses only the slot: it is the last row of Settings, pushed on iOS and presented as a sheet on macOS, where `NavigationView` is a split view and there is no stack to push onto.

  The enablement banner moved the other way, from About to the top of Settings. It is the one task standing between someone and a working install, and Settings is where you look when Movar is doing nothing — leaving it one push deep under "Legal" would have been the only real regression the merge could have caused.

  **The "Movar enabled" master switch is gone**, from the native screen and from the web panel behind it. Safari's own extension settings are the system-provided version of that control, and an app is not supposed to ship a redundant copy of a systemwide setting — least of all two sections below a card that teaches you where the real one is. No other browser's Movar had one: the extension's only live writer of that flag is the popup's off-state hero, which only ever turns it back on, which is also why removing it strands nobody.

  Two things did not have to cross into Swift. The native screen edits four keys of the stored settings object and passes the rest through untouched, so a field a newer extension added still survives a host write; and the block list stays derived on the web side, so the policy table behind it needs no Swift twin. The Ukrainian accusative-endonym table behind "Видалити українську" is not needed either — a context menu is already scoped to its row, so the verb stands alone.

  Both schemes build clean under Xcode 26.3, and the screen was exercised on an iPhone 17 Pro simulator: reorder, add and remove a language, the conceal-mode picker, domain normalisation (`https://WWW.Example.COM/path` → `example.com`), the push to About, and the setup banner's dismissal.

### Patch Changes

- 00d61b3: Start the native shells: render the About tab in SwiftUI, and move the audit into a headless engine every platform can host.

  The Safari wrapper app has been React in a `WKWebView` since it existed, which was right while it was mostly a launcher. It is becoming a tool a site owner runs against their own site, and two things follow. A WebView cannot render platform components — Liquid Glass, Fluent and Material are not CSS, and the tab bar was a `<div role="tablist">` with hand-rolled arrow keys. And an audit report is a long list of expandable rule results, which is the shape native list virtualization handles best and a deep DOM tree handles worst.

  The objection was that identical rendering across platforms is what proves "same evidence, same answer". It is not: that invariant lives in `evaluate()`, a pure function from `Evidence` to `Report` that `purity.test.ts` already enforces. It is a property of the data and it survives any renderer. So the UI goes native per platform and the kernel stays the single source of truth — the split is written up in `docs/native-shells.md`.

  `@movar/audit-engine` is the headless half: the collector, the DOM digest and the kernel in one bundle a shell loads into an offscreen WebView that never renders. It is a system WebView rather than an embedded JS engine because `digest-dom` needs a genuine `Document` — `@movar/lang-pickers` narrows with `instanceof HTMLAnchorElement` on globals, and a shim that is subtly unfaithful returns `not-applicable` on four rules instead of failing loudly, which is a false pass on somebody's audit. HTTP stays native, so `default-src 'self'` keeps forcing every byte of egress through one auditable file; that is now a property of Movar Audit on any platform rather than a quirk of Safari. Two things that were hardcoded to Safari became inputs: the probe is injected, and the collector id is declared by the host, because a run on Android has to say `okhttp` and mean it. The Safari host app is that engine's first consumer rather than a second copy of it: its Audit tab calls `runAudit`, so the collector, the probe contract and the collector's tests exist once — and its reports pick up the engine stamp for free, which a screen adjudicating on its own could not have done.

  Every report now names the build that produced it. `Report` gains an `EngineStamp`, written during `evaluate()` rather than patched on afterwards, because a report exists to be re-adjudicated and "run this evidence again" is unanswerable without knowing which engine judged it the first time. The stamp is optional on the type — `evaluate()` is pure and the CLI and its tests share no build identity, and a pure function cannot learn its own — so each runtime supplies it, which is also what lets one adopt it at a time. A report that carries none renders as _unknown_, never as a default: filling in the running build's version inside the one field whose job is to say which code to go back to would mint an identity nobody shipped, and a wrong answer that looks right sends a reader to the wrong commit.

  The bundle is built and synced into the app's resources by both Safari build paths, and referenced from the Xcode project. That is compliance, not convenience — every store forbids downloading and executing code at runtime, so a future change that fetched the engine from a CDN would be a violation on all three rather than an optimisation.

  Appearance is each platform's canonical stock look, and the drift between platforms is the deliverable rather than a defect. The brand surface that crosses is one accent and the mark; the UI face is the system face, because shipping Manrope would fight Dynamic Type and break the metric alignment stock layouts rely on next to SF Symbols. Two ADR assumptions did not survive contact: `.tint()` is macOS 12 against this app's macOS 11.0 floor, and `SettingsLink` cannot reach Safari's Extensions pane at all — both are corrected in the doc.

  Only About is native so far; Detector, Audit and Settings still render in the WebView behind a native `TabView`, and the web layer stopped drawing its own tab bar so the two do not both appear. **None of the Swift has been compiled or run** — it typechecks for macOS 11 and its localisation and project edits validate, but there is no Xcode on the machine this was written on, the iOS branches got syntax checking only, and re-parenting one `WKWebView` across three SwiftUI containers on tab change is unproven on a device. The VoiceOver announcement the web banner had via `aria-live` is dropped rather than hand-rolled, which is a real regression tracked separately.

- Updated dependencies [0fc5446]
- Updated dependencies [065f597]
- Updated dependencies [0150a77]
- Updated dependencies [deb7d72]
- Updated dependencies [00d61b3]
- Updated dependencies [4bb2e87]
  - @movar/audit-engine@0.1.0
  - @movar/theme@0.0.1
  - @movar/settings@0.0.2
  - @movar/options-ui@0.0.3
  - @movar/i18n@0.0.3
  - @movar/brand@0.0.1
  - @movar/audit@0.1.0
  - @movar/ui@0.0.1
  - @movar/app-shell@0.0.3

## 0.0.2

### Patch Changes

- Updated dependencies [1a5f277]
  - @movar/i18n@0.0.2
  - @movar/app-shell@0.0.2
  - @movar/options-ui@0.0.2

## 0.0.1

### Patch Changes

- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
- Updated dependencies [f558db5]
  - @movar/lang-detect@0.0.1
  - @movar/options-ui@0.0.1
  - @movar/ui@0.0.1
  - @movar/i18n@0.0.1
  - @movar/settings@0.0.1
  - @movar/app-shell@0.0.1
