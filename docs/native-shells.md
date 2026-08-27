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

| Platform             | Stack                                 | Status                                                                               |
| -------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| iOS / iPadOS / macOS | SwiftUI                               | **shipped** — all three tabs and About are native; nothing displays the React bundle |
| Android              | Compose, `LazyColumn`                 | after iOS/macOS                                                                      |
| Windows              | WinUI 3, `ItemsRepeater` + `Expander` | after Android                                                                        |
| Linux                | GTK4 / libadwaita, `AdwExpanderRow`   | **designed for, not built**                                                          |

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

### What canonical macOS actually cost — the window, not the widgets

**The first macOS pass was stock iOS, and "stock" was the trap.** Every control
was the platform's own, so the tabs above read as done; what had not been ported
was the LAYOUT. The window opened 480×700 — phone-shaped, in three separate
places in `macOS (App)/Base.lproj/Main.storyboard` (the window's `contentRect`,
the view controller's view, and the webview inside it) — so a single column that
is right on a phone became a column stranded in a window: content stopping two
thirds of the way down, a full-width call to action pinned to the bottom edge
the way iOS pins one within thumb reach, and section footers clipped for want of
width sitting unused beside them. This is the same failure the section above
names for the web — "a web page wearing a native tab bar" — reached from iOS
instead.

What landed: the window is 940×640 with a 720×480 floor (declared twice, in the
storyboard and in `ViewController.viewWillAppear`, because the storyboard's value
is applied before the SwiftUI shell is installed). **Detector and Audit are
`HSplitView` workbenches; Settings is not.** Settings is a FORM — there is no
second pane's worth of content, so it takes `movarColumnMeasure()` (a 660pt cap,
centred, plus `.controlSize(.large)`), which is what System Settings does with a
short form. Splitting it would have been the pattern applied for its own sake.

**iPad had the same bug and was not in that title.** The seam above was written
as a phone/desktop branch whose iOS half was a bare `self` — "on iOS the list is
the screen", true of a phone and false of every iPad, which went on running the
phone layout at 1032pt: rows edge to edge, a toggle a screen-width from its
label, and a call to action 1380pt wide. The fix is the same 660pt ceiling, and
the thing worth keeping from it is that the ceiling is stated as a `maxWidth`
rather than as an idiom test. A cap is already a no-op at 402pt (phone) and at
320pt (Slide Over), so ONE rule covers every size class including the ones
multitasking invents at runtime — no view asks what device it is on, and none
watches for a size-class change. iPhone output is unchanged to the pixel.

Two corollaries, both of which a cap alone gets wrong. A `List` paints its
grouped fill inside its own frame, so the fill has to be painted behind the full
width with the column sitting on it — otherwise iPad shows a white gutter down
either side of a grey column, which is worse than the stretch. And an action bar
is two things: its material and hairline are chrome and reach both edges, while
its button is content and lines up with the column it acts on.

**iPad keeps the single column rather than gaining macOS's split**, and landscape
is the reason it is a decision rather than an oversight: at 1376pt there IS room
for two panes, but the same app is 1032pt in portrait and 320pt in Slide Over, so
a split would have to be conditional on size class — three layouts to keep true
instead of one, for a tab whose content is a form. The column is correct at every
width the platform can hand it, which the cap makes literally so. Verified at
1376×1032 across all three tabs: the margins grow from 186pt to 358pt and nothing
else moves. The Detector's pre-run emptiness is a form flowing from the top, not
a defect — a run fills the column to roughly 85% of the height.

Rotating a simulator is worth a note, because none of the obvious routes work:
`simctl ui` carries only `appearance`, `increase_contrast` and `content_size`,
and Simulator.app's saved `SimulatorWindowOrientation` is ignored on a cold boot
(and clobbered when it quits). Rotation has to come from the Simulator window
itself — and once it has, `simctl io screenshot` still returns the device's
NATIVE portrait framebuffer with the content rotated inside it, so the raster
needs a 90° turn to read and taps stay in portrait coordinates
(`x_native = y_landscape`, `y_native = 1376 - x_landscape`).

The two splits are **inverted from each other, deliberately**. On the Detector
the input is the big surface and the verdict is a line, so the box is left and
the rail is right. On Audit the composer is a URL, a switch and a button while
the report is a document with a matrix, so the composer is the narrow one. The
pane that needs the room gets it; a consistent divider position would have been
consistency bought with the report's legibility.

Three platform facts that no build catches, all found by looking at the running
window and all now carried by seams:

- **`.tint()` does not set `Color.accentColor`.** They are different environment
  values: `.tint` colours controls, while `Color.accentColor` is what a `Label`'s
  icon takes and what every `.foregroundColor(.accentColor)` resolves through. On
  iOS they agree closely enough that nothing shows; on macOS `Color.accentColor`
  fell through to the SYSTEM accent, so the Audit tab carried a blue
  `info.circle` beside a green run button. `movarTint()` now applies both. A
  plain `Button` carrying `.keyboardShortcut(.defaultAction)` has the same
  problem from the other side and needs `.movarProminentButtonStyle()` before the
  tint reaches it. And a SHEET is presented rather than nested, so neither value
  crosses that boundary on its own: About's `Label` icons were system blue inside
  a sheet whose own prominent button was correctly green. Every presentation —
  `movarDetailSheet`, the audit confirmation, both of Settings' add-sheets — is
  handed `.movarTint()` again. Three instances of one trap; if a fourth surface
  shows blue, this is the first thing to check.
- **macOS caps the height of a `Section` FOOTER.** At one line the sentence is cut
  mid-word; forced to wrap it lays out in full and is then clipped by a row that
  never grew, rendering the paragraph's middle with both ends missing. Ordinary
  rows do grow. So short footers take `movarWrapping()` and a real PARAGRAPH
  cannot be a macOS footer at all — `detector.amongFooter` is a row on macOS,
  rehomed into the "How it works" disclosure where `detector.rosterFooter`
  already lives for the same reason.
- **`InsetListStyle` reserves ~20pt above its first section header** — right when
  the list is the whole screen, wrong in a pane, where it reads as an unexplained
  band under the tab strip. Countered with negative top padding, and the constant
  is not portable: -14 on the Detector's rail, -6 on the Audit composer, which
  sits in a `VStack` and lost its first header off the pane edge at -14, and -6
  again on the Audit RESULTS pane — the one that was missed, so the first header
  in each pane sat 7pt out of step either side of one divider. Every list that
  opens directly under a divider needs this; a list that does not have it is the
  odd one out rather than the default.

### Three more the same way, found by sweeping every surface for crowded edges

A pass over all three tabs and all four sheets, at 940x640 and at the 720x480
floor, looking only for things overlapping, crowding a border or sitting on a
divider. The layout defects it turned up are in the changeset; these are the
platform facts under them, which is what generalises.

- **`HSplitView` does not read `idealWidth`.** Both splits declared their
  proportions with one and neither drew them: the Detector asked for 560/400 and
  shipped ~475/465, and raising or lowering the ideals moved nothing at all. The
  Audit split was worse, because `HSplitView` re-negotiates when a pane's content
  changes IDENTITY — which the results pane does twice in a normal reading — and
  each pass moved the divider the same way, 403 -> 470 -> 540pt, until the report
  stood on its 400pt floor. `minWidth` and `maxWidth` are the only child
  constraints that reach `NSSplitView`, so a proportion has to be said as a
  CEILING on the pane that should stay narrow. The cost is a narrower drag range
  than "the proportions are the reader's to set" implies, and it is the price of
  the split reading as a workbench rather than as two equal columns.
- **An AppKit sheet is not clipped by the window it is attached to.** It is a
  child window: at the 720x480 floor a 520pt sheet renders in FULL, overhanging
  the parent by ~40pt. So a sheet's height is chosen against its content, not
  against `contentMinSize` — the opposite of the assumption that would otherwise
  cap every sheet at the smallest window the app can be. What a sheet cannot do
  is size itself: a `List` has no intrinsic height, so `minHeight` IS the height,
  and one number for four sheets meant the two that are read lost their last row
  off the bottom while the two that are one field opened 190pt too tall.
- **macOS insets a row's separator to that row's CONTENT.** With centred content
  the rule therefore starts at the centre — About's masthead drew a hairline from
  the leading edge of its tagline, 182pt in on the left and 12pt from the right,
  which reads as an underline of the tagline rather than as a rule between
  sections. `listRowSeparator(.hidden)` is the fix and it is macOS 13, above this
  app's floor, so it takes an availability branch rather than a `#if os(iOS)` —
  and a `#if os(iOS)` is exactly how it came to be missing.

**The tab strip is a segmented `Picker` on macOS, not `TabView`'s.** This was
resisted for a while on the grounds that `TabView` is the accessibility win this
doc records, and that reasoning was half right: the win over the old hand-rolled
`role="tablist"` was roving tabindex and arrow-key handling written by hand, and
a segmented `Picker` is `NSSegmentedControl` — it brings all of that too. What
`TabView` also brought was ownership of the vertical rhythm, and on macOS it gets
that backwards for a window: the strip is pressed against the title bar with no
room above it while a bezel insets the content BELOW, so the space is entirely on
the wrong side of the control and no padding from outside can move it. That band
is what read as an unexplained gap through three rounds of trying to close it
from the outside.

What is actually given up is the tab ROLE — VoiceOver says "segmented control"
rather than "tab, 1 of 3". That is a real cost, priced against a defect visible
to every sighted user on every launch, and it is why iOS keeps `TabView`, where
the tab bar is the platform's idiom and its chrome is not in the way.

Nothing here restyles a `List`, a `Section` or a row background; the recessed
rail is the stock list surface, and it reads as a weaker separation in dark mode
than in light because that is what the system colours do.

**The Detector's text box has a chosen margin, because the platform's answer is
zero.** `TextEditor` gets no inset from AppKit — `textContainerInset` is `(0, 0)`
and the ~5pt of apparent leading is `NSTextContainer.lineFragmentPadding`, a
typesetting default rather than spacing — so stock here means glyphs on the
border. Apple publishes no inset for a text view either, and this doc keeps
`@movar/theme`'s spacing scale off native, so there is nothing to cite: ~16pt on
each edge, calibrated by eye against native text surfaces.

The margin also has to be part of the BOX. `TextEditor` paints its own opaque
backdrop, so padding it inward leaves the container showing through between the
border and the editor — a second, square-cornered box inset in the rounded one.
The padded frame is filled with `NSColor.textBackgroundColor`, the editor's own
colour, which closes the seam and follows the appearance. (`import AppKit` is
explicit there: SwiftUI re-exports it through some SDKs and not others, and that
class of missing import type-checks clean and fails the real build — #512.)

**The Detector's explainers are pinned to the rail's foot**, which a `List`
cannot do — there is no `Spacer` inside one — so they sit below it in the same
`VStack`, drawing their own `Divider` in place of the row separators they lose.
Their height is a function of what is OPEN rather than of their content:
collapsed, two rows; expanded, capped so the verdict above stays in view and the
block scrolls inside the cap.

**On the sketches.** A design canvas was drawn for the macOS Detector before this
landed. Two things first read as places the build should NOT follow it, and both
turned out to be wrong on inspection — worth recording, because both mistakes
have the same shape: a platform difference mistaken for a design constraint.

- The verdict looked too small beside the mockup, and "the type ramp is the
  decision" was the wrong answer: `.title` is another STEP of that ramp, and the
  ramps differ per platform (see `verdictFont` above). The mockup was right.
- The clue values were left unaligned on the theory that a wrapping run of up to
  six tokens would look broken pushed right. It does not: the run is one `Text`,
  and `multilineTextAlignment(.trailing)` keeps a wrapped one as a block against
  the right edge. The rail is wide enough to read as a table, so it now does.

Two departures remain and both are real. The explainers are not pinned to the
pane's foot: a `Spacer` needs a `ScrollView`/`VStack`, and the rail is a `List`
precisely so `rosterSection` and `reportSection` render as the same sections the
phone builds — and the difference only shows while the rail is EMPTY, since a
verdict pushes them down anyway. And the canvas's Settings artboard is an unbuilt
proposal: shipping is the capped column above, because Settings is a form.

Read the canvas for arrangement. Where it and this doc disagree about a value,
check whether the disagreement is really a platform difference before assuming
the canvas is wrong.

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

#### What shipped on iOS/macOS

`AuditView` (composer + acknowledgement), `AuditReportView` (the document) and
`AuditModels` (the wire types), over the **same `EngineHost` the Detector uses**.
The prediction above held: the report is a `List` of `DisclosureGroup`s and the
rule rows cost almost nothing per rule. What the port actually taught, beyond
that:

- **The engine had to answer two questions `Report` cannot.** A `RuleResult`
  carries no family, so a native shell has no way to know which section
  `core/switch-bounces` belongs in — the React report reconstructed it by
  importing `CORE_RULESET`. And a native shell must never grow its own artifact
  renderer, since the exported file is the thing a site owner re-runs. Hence
  `catalogue.describe` (structure, not strings — the ADR's line holds) and
  `audit.artifact`. Both are additive; the protocol version did not move.
- **One engine, not one per surface.** The Detector slice built `EngineHost`
  first; the audit runs on it rather than beside it. Two hosts would be two
  bundles parsed and — the part that matters — two request budgets, and
  `AuditProbeLimits`' ceiling on what Movar sends a third party's server would
  stop meaning what it says.
- **The offscreen WebView has to be IN the view hierarchy**, at zero size, which
  reverses what the Detector slice could afford. A `WKWebView` with no window is
  a suspendable web process on iOS. That is free to ignore for a classification
  returning in milliseconds and not for an audit that runs for minutes with
  native round-trips in between: one stalled mid-matrix reads as a site that
  stopped answering, which is a false observation about a named company. "Never
  displayed" survives; "never attached" does not.
- **Every request must end.** `handle` never rejects, so a caller learns an
  outcome only from an event — and two things produce no event at all: a build
  whose `engine.js` never ran, and a web process the system killed. Both used to
  leave a spinner running until the app was force-quit. `EngineHost` now probes
  its own bootstrap on load and fails everything outstanding when the content
  process dies.
- **The two big payloads travel as text.** `audit.complete` hands `report` and
  `evidence` over pre-stringified, so Swift keeps exactly the bytes it re-sends
  for an export while decoding only the thin slice the screen draws. A bundle is
  mostly sampled text nodes; materialising that per remembered run is the
  difference between a session of audits fitting on a phone and not.
- **Removal lost its confirmation, correctly.** The web list asked before
  discarding a row, because its `×` was one stray tap from spending another full
  matrix against somebody else's server. Swipe-to-delete charges the same
  deliberation without a second screen — the system control doing the same job,
  which is the only ground the About slice allowed for replacing a hand-rolled
  one.
- **The filter pills became a `Menu`.** The web bar wrapped, and on a 390pt phone
  six pills hid their own last two options; a menu states the active filter on
  its own row and keeps each option's count.
- **i18n took its first generated step.** 46 Ukrainian rule titles and 6 family
  headings are written into `Localizable.strings` by
  `pnpm --filter @movar/safari-host-app gen:audit-strings`, from the TS
  catalogues that already carry a drift guard. The ~70 prose strings stay
  hand-written, because the native screen's wording deliberately differs from the
  web's in places and a generator would have to encode which.
- **Plurals are the one grammar rule still in Swift.** English needs two forms
  and Ukrainian three, and a `.stringsdict` — the platform's real answer — means
  a new localized variant group in the Xcode project for both app targets. The
  interim lives in `HostStrings.pluralForm` and is shaped so the swap deletes
  code rather than rewriting call sites.

`AuditTab.tsx` and `AuditReport.tsx` stay in `apps/safari-host-app` for the
standalone web build, exactly as `SettingsTab.tsx` and `AboutTab.tsx` did.

**This was the last web tab.** `WebSurface` and `HostWebView` are gone with it,
as the previous slice's comment said they would be ("when Audit moves the whole
function goes with it"), and the tab bar is three native screens. What remains of
the retirement is the page itself: `ViewController` still loads the React bundle,
because that is what the `readSettings` / `writeSettings` bridge answers to, and
nothing displays it. Deleting that WebView — now that `EngineHost` is the engine
host — is the step this ADR already names as the last one.

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

**It also stopped being a tab.** Once Settings went native, About moved behind
it — the last row, pushed on iOS and presented as a sheet on macOS, where
`NavigationView` is a split view and there is no stack to push onto. The tab bar
is three tabs, not four. This is the tab-bar guidance applied literally ("weigh
the complexity of additional tabs against the need for people to **frequently
access each section**"): an About screen is a once-ever destination, and across
eighteen sampled iOS apps not one carried it as a peer tab while every About
screen was a push from Settings. The enablement banner did NOT go with it — a
setup prompt buried one push deep under "Legal" is a prompt nobody sees, so it
sits at the top of Settings, which is where someone whose Movar is doing nothing
actually looks. Android and Windows should reach the same place by their own
conventions rather than by copying this shape.

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

#### What actually shipped on iOS/macOS: passthrough, not intents

The engine-intent route above is **not** what the SwiftUI Settings screen does,
and this records the deviation rather than leaving the decision looking
unimplemented.

`HostSettings` wraps the stored object as a **raw dictionary** and mutates only
the four keys the screen edits — `priority`, `allowlist`, `contentModification`,
`concealMode` — carrying every other key through byte for byte. So native still
never _constructs_ settings JSON, which is the property the intent protocol was
introduced to guarantee, and it gets a second one free: a field a newer extension
build added, which this binary has never heard of, survives a host write. (The
two ship on different release trains — the extension through the browser, the app
through the App Store — so "a key this binary does not know" is the normal case.)

What native still mirrors is only what the UI needs to avoid _offering_ something
the boundary would undo: `LOCKED_BLOCKED_LANGUAGES` (one constant, so Russian is
never in the add-a-language list) and `normaliseDomain` / `DOMAIN_PATTERN` (so a
typed domain is validated before it is stored). `migrateSettings`,
`enforceLockedLanguages`, `deriveBlocked` and the `IMPOSED_OVER` policy table
have **no Swift twin** — `blocked` is left to go momentarily stale after a
priority edit and the extension re-derives it, because it runs the invariants at
every read and before every write.

The hazard the section above names — "a locked language silently unblocked" —
therefore cannot occur through this path: convergence at the extension's boundary
is what makes it safe, not fidelity in Swift. The residual risk is smaller and
different: a `normaliseDomain` that drifts drops an entry at the boundary, which
looks like "the Add button did nothing". That is the cost of not paying for a
headless WebView round-trip on a screen whose every control must feel immediate.

The intent route stays the right answer for **Android and Windows**, which have
no such mirror to inherit, and for any surface that needs to compute `blocked`
itself.

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
