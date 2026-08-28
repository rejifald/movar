# @movar/extension

## 1.8.0

### Minor Changes

- 8db51e6: Fold the Detector's roster editor into the tab it describes, and stop the list reordering under the reader's finger.

  The roster shipped as a summary row that opened a sheet: a title bar, a Done button and a two-section editor — "In the comparison" over "Not compared" — with a ⊖ button on every row of the first and a ⊕ on every row of the second. That is a faithful copy of what apps do for a LONG catalogue; Airbnb's "Languages you speak" opens a searchable modal over a hundred entries. This catalogue is five codes. A modal over five rows puts a presentation, a title bar and a Done button between a reader and a claim the screen made two lines earlier, and the closed set is exactly the claim this screen exists to make checkable.

  It is now a `DisclosureGroup` — the widget the two explainers at the foot of the same tab already use. Collapsed it is the identical one-line statement it always was; open, it is the editor, with the verdict still on screen beneath it. `RosterView` and the `movarSheetChrome` seam are deleted outright, which also removes one of the places iOS and macOS had to diverge: `NavigationView` is a split view on macOS, so the sheet needed a hand-laid title row there and a navigation bar on iOS to say the same thing.

  **One list, not two, and the checkmark carries membership.** Wispr Flow, Airbnb and Apple's own language list all do this; nothing in the surveyed corpus uses a ⊖-over-⊕ split. The whole row is the control, which is what lets a checkmark be a checkmark rather than a button with its own hit target and its own accessible name sitting beside a label that already said the language. It is trailing, where iOS puts selection in a list — a leading mark would rhyme with the evidence section's leading `checkmark.circle.fill` two sections down, which means "won", not "in the set".

  **The order is fixed and alphabetical, which the first draft got wrong.** Listing the roster first and the rest after reads well until someone taps: the row they just touched jumps out from under their finger to the far end of the list, and a second tap to undo lands on whatever slid up to take its place. A picker whose order is a function of its own state cannot be tapped twice in a row. Sorted by displayed name, a tap changes exactly one thing — the checkmark — and the roster's own meaningful order (preferred first, then the ones Movar hides) is still stated in full on the line above. The comparison is locale-aware against the locale the BUNDLE settled on, not `Locale.current`, for the reason `LanguageNames` already documents.

  Two colour facts had to be written down rather than inherited, because a build cannot catch either. A `Button` label in a `List` inherits the accent tint on iOS, so an unstated colour paints the language names green and the roster reads as five links; and an explicit colour in turn outranks the dimming `.disabled` applies, so the last candidate standing has to name its own grey. Both went wrong on the simulator before they went right.

  Copy: "Follow my Movar languages" becomes "Reset to my settings" in both locales. `detector.rosterTitle`, `detector.rosterIn` and `detector.rosterOut` die with the sheet. `detector.rosterFooter` — the one piece of real explanation on the screen, which used to be read in a footer by someone who had asked the question by opening the sheet — moves into the "How it works" disclosure, unchanged; with no sheet there is no such moment, and "why is the list closed, and what does changing it change" is a how-it-works question.

  The forced-verdict caution stays where it was, on the result. Moving it to a precondition was considered and rejected: `detector.forcedBody` is written in the past tense ("%@ _was_ the only candidate"), and the only at-rest case is a roster of one, which `detector.rosterLast` already occupies.

  Both schemes build clean, and the editor was exercised end to end on an iPhone 17 Pro simulator: collapse and expand, adding a language, removing down to the locked last candidate and its explanation, toggling one row twice without it moving, and reset restoring the derived set and disabling itself again.

  **The label stops reading its own state, which is the same rule one level up.** Fixing the row ORDER left the geometry of the SUMMARY still a function of the selection: measured on an iPhone 17 Pro, adding a fourth language wraps it to a second line and drops every row — including the one under the reader's finger — by 21pt, while a fifth fits on that line and moves nothing. A shift that fires on some taps and not others reads as flakiness rather than as a rule. Open, the disclosure now carries a static title, `detector.rosterLabel`; collapsed, it is the same sentence it always was. Nothing is lost by the swap: open, the checkmarks one row below already state the set, so the title says the thing only the open list cannot — that these five are all of them, which is the closed-set claim the screen exists to make checkable. Every inline-expanding row in the surveyed corpus does this (Rocket Money, IKEA Home smart, DailyArt, DICK'S); the summary-value shape belongs to rows that NAVIGATE, which MacroFactor uses on exactly those and not on its expanding ones.

  `detector.rosterLast` moves out of `if !model.canRemove` for the same reason: appearing only on arrival, it inserted a row and shoved the reset button — the identical defect, reached by the identical tap. Its wording was already a rule rather than a complaint, so it needed none.

  **What still moves, moves on purpose.** A roster edit re-runs the detector, so the verdict and evidence below legitimately resize — that is the editor working. The re-run is now debounced by 300ms, because a burst of taps is one thought and not four, and roster mutations run inside `withAnimation`, with the outcome itself animated off `outcomeRevision` through a `movarAnimated` seam (`animation(_:value:)` is iOS 15 / macOS 12; this app still builds for macOS 11).

  **Copy: the screen detects among a set, it does not compare.** Comparison is how the ENGINE reaches an answer; what the SCREEN does is name one of a closed set, and the header was making the wrong promise. It now reads "Визначаємо серед цих мов" / "Detecting among these", and the roster's membership strings say "перелік" / "the list" rather than "порівняння" / "the comparison". The strings that genuinely describe the mechanism — the cost argument in the section footer, `forcedTitle`, `noMatchHelp` — are left alone, and so are the doc comments about what the classifier does.

  The symbols follow the copy: `detector.comparing` / `detector.comparingFooter` become `detector.among` / `detector.amongFooter`, `comparingSection` becomes `rosterSection`, and "the comparison set" in the surrounding comments becomes "the roster" — the name the model, the strings and the changeset were already using for it.

- a9d7151: Give the macOS host app its own layout, instead of the phone screen rendered in a window.

  The SwiftUI port that shipped in v1.7.0 (#517–#519) made every control native, and that made the tab bar look done — but the LAYOUT under it was still iOS's: a phone-shaped 480×700 window declared in three places in `Main.storyboard` (the window's `contentRect`, the view controller's view, and the webview inside it), a single scrolling column, and a full-width call to action pinned to the bottom edge the way iOS pins one within thumb reach. On a phone that column is right. Stranded in a resizable window it read as unfinished: content stopping two thirds of the way down, and section footers clipped for want of width sitting unused beside them.

  The window is now 940×640 with a 720×480 floor, declared in both the storyboard and `ViewController.viewWillAppear` (the storyboard's value applies before the SwiftUI shell installs). **Detector and Audit are `HSplitView` workbenches; Settings is a capped, centred column** — a form has no second pane's worth of content, so splitting it would have been the pattern applied for its own sake, which is what System Settings avoids for a short form too. The two splits are inverted from each other on purpose: the Detector's input is the big surface and the verdict a line, so the box is left and the rail is right; Audit's composer is a URL, a switch and a button while the report is a document with a matrix, so the composer is the narrow one. The pane that needs the room gets it.

  The tab strip is a segmented `Picker` now, not `TabView`'s own — `NSSegmentedControl` carries the same accessibility win (VoiceOver, Full Keyboard Access, Dynamic Type) the doc already credits `TabView` with, but `TabView` also owned the vertical rhythm on macOS and got it backwards for this window: the strip pressed against the title bar with no room above it while a bezel inset the content below, so the gap was on the wrong side of the control and no padding from outside could move it. The trade is real — VoiceOver now says "segmented control" rather than "tab, 1 of 3" — and it is priced against a defect every sighted user saw on every launch.

  Three platform facts found only by looking at the running window, none of them catchable by a build:
  - `.tint()` colours controls but not `Color.accentColor` — what a `Label`'s icon and every `.foregroundColor(.accentColor)` resolve through. It fell through to the SYSTEM accent on macOS, so the Audit tab's "What is Movar Audit" carried a blue icon beside a green run button, and every sheet presentation (About, both confirmation sheets, both of Settings' add-sheets) showed the same blue where it should have been green — a sheet is presented, not nested, so the tint has to be handed to it again. `movarTint()` now sets both channels, and every presentation re-applies it.
  - macOS caps the height of a `Section` footer: at one line a long sentence is cut mid-word, and forced to wrap it renders the paragraph's middle with both ends clipped, because the row never grows to fit it — ordinary rows do. Every footer that could wrap to two lines now insets itself top and bottom (`movarWrapping()`), and the Detector's six-line explanation of the roster moved out of the rail entirely, into the "How it works" disclosure where a shorter explanation of the same kind already lived.
  - `TextEditor` gives itself no margin — `textContainerInset` is `(0, 0)`, and the platform publishes no inset to fall back on — so the Detector's input box had text on its own border. It now carries a ~16pt inset on each edge, with the padding filled in the editor's own `NSColor.textBackgroundColor` rather than left as a gap the container shows through.

  The Detector's verdict also takes `.title` on macOS rather than `.title2`: the two type ramps are not the same ramp (`.title2` is 22pt on iOS, 17pt on macOS), so the size #540 chose for the phone was shrinking the verdict by a quarter in a window. This is a different step of the same ramp, not an override of it. Clue values are right-aligned on macOS into the table the wider rail can afford, which the narrower phone layout cannot.

  iOS is unchanged — every edit here sits behind `#if os(macOS)`, re-verified on an iPhone 17 Pro simulator after each change.

- df9394b: Make the Detector's verdict and its evidence one card, and give the Audit tab's rule-pack switch a line to sit on.

  The Detector split its outcome across two sections — "Результат" and "Що видало мову" — and a gap under a heading promises a new subject. It is not a new subject. A closed-set verdict cannot be read apart from the comparison that produced it; that is the same argument the roster already wins by sitting above the input rather than under the answer, and the split reproduced in layout the very separation the screen exists to deny. `verdictSection` and `evidenceSection` are now one `reportSection`: the verdict leads at `.title2` in the accent beside a filled `checkmark.seal`, `detector.evidence` survives as a caption row rather than a second header, and the losing candidates and the "не зараховано нікому" row are untouched — they are half the reason the winner won.

  **The emphasis is type and accent, never a container.** `docs/native-shells.md` rules out a tinted or otherwise restyled row, and is right to: the highlight has to survive Dynamic Type and both colour schemes, which a hand-painted fill would not. Nothing here restyles a `List`, a `Section` or a row background.

  **The seal and the accent stand down when the verdict was forced, which the simulator caught and no build could.** With one candidate in scope there is nothing to lose to, and `forcedBanner` says so in orange directly beneath — so the first cut of this change put a confident green seal and an accent-green language name immediately above their own retraction. That is worse than the unemphasised verdict the screen showed before. `result.isForced` now drops the seal and returns the name to the primary label colour; the size is kept either way, because the verdict is still what the screen is for and `.title2` is prominence without assertion.

  **The Audit tab's jurisdiction opt-in had the opposite problem: a decision that read as an accident.** Ukrainian spends 31 characters on a name English says in 23, so `audit.uaPack` wraps to two lines on a phone — and a stock `Toggle` centres its switch against the label as a whole, leaving it hanging between the two lines with nothing to align to, while the footer separately carried the citation the row was already implying. `audit.uaPackLaw` splits the statute out of the hint and gives that second line a job: it is the description the title always implied. The row is assembled by hand so `.top` alignment pins the switch to the title's line, where the eye looks for the control that answers it, and the footer keeps only the advisory. The switch stays the platform's own — `labelsHidden()` drops the label visually and keeps it as the accessible name — and the two texts combine into one element so VoiceOver reads the pack and its statute as one statement rather than two loose strings beside a switch.

  Splitting the label off the row rather than styling a `ToggleStyle` was deliberate: a custom style would own the switch, and the point of the surveyed pattern (Clue, Opal) is a stock control with the copy arranged around it. Keeping the full name was also deliberate — "набір правил" is the term of art, and the shorter one-line label that would have fitted spends it to buy a line the description now uses better.

  `audit.uaPackLaw` is mirrored by hand into both `.lproj/Localizable.strings`, as `audit.*` copy always is; the generator only owns the block between its own markers and leaves these alone. The React Audit tab recomposes the two halves into the single sentence it rendered before, so the standalone web build is unchanged.

  Also: `eslint.config.mjs` now ignores `safari/**/build/**` and `safari/**/DerivedData/**`. Xcode output lands inside the extension project, so `extension:lint` was linting the compiled, minified `background.js` out of an iOS build and reporting hundreds of errors in generated code — which the repo's own documented `build:safari:app` would have triggered just as readily.

  Verified on an iPhone 17 Pro simulator across all three states the change touches: a discriminating verdict (Українська, accent and seal, four candidates below it in the same card), a forced one (Англійська, unsealed and label-black above its orange caution), and the rule-pack row with the switch on the title's line.

### Patch Changes

- b05c3fa: Measure the iPad's column, instead of running the phone layout at 1032pt.

  #551 gave macOS its own layout and said so in its own title; iPad was left out of both, and it is the surface where the omission showed worst. The seam that decides this — `movarFormMeasure`, now `movarColumnMeasure` — was written as a phone/desktop branch whose iOS half was a bare `self`, on the reading that "on iOS the list is the screen". That is true of a phone and false of every iPad: rows ran edge to edge across 1032pt in portrait, the "Hide content in blocked languages" toggle sat a full screen-width from the label naming it, the Detector's explainer paragraph gained about eleven words per line over anything it was written for, and the call to action was a 1380pt green slab pinned across the bottom.

  **It is now stated as a `maxWidth`, not as an idiom test.** 660pt, which is within a few points of what UIKit's own `readableContentGuide` resolves to on a 1024pt iPad — the platform's answer rather than a taste, and the reason macOS did not need a second number. Saying it as a ceiling rather than as `if iPad` is what makes it correct at every size class _including the ones multitasking invents at runtime_: at 402pt (phone) or 320pt (Slide Over) a 660pt cap is already a no-op, so no view has to ask what device it is on, and none has to watch for a size-class change. iPhone output is provably untouched — a pixel diff of the Settings screen before and after differs only in the status-bar clock, 1610 of 3.8M pixels, all of them in rows 78–117.

  Applied to the five iOS surfaces that are a whole screen: the Detector and Audit composers, the audit report (the longest read in the app), Settings, and About. About takes it at the `NavigationLink` DESTINATION rather than inside `AboutView`, because the measure is a fact about where the screen is being shown — pushed on iOS it owns an iPad, while macOS hands the same view to a sheet that is already sized.

  Two things came with it that a width cap alone would have got wrong:
  - **The background.** A `List` paints its grouped fill inside its own frame, so a capped list on its own leaves a white gutter down both sides of a grey column — worse than the stretched layout it replaces. The fill is painted behind the full width and the column sits on it, which is the relationship the macOS branch already gets from the window. Verified in dark mode too, where the gutter would have been the more obvious failure.
  - **The action bar is two things, not one.** Its material and hairline are chrome and have to reach both edges of the surface; the button is content, and content that does not line up with the column it acts on reads as belonging to a different screen. Only the actions are capped. iOS only — the macOS surfaces using this bar are sheets and split panes, both already narrower than the cap and both measured by hand in #552.

  The Detector's pre-run emptiness is not a defect and is left alone: a form flows from the top, and running a detection fills the column to roughly 85% of an iPad's height.

  macOS is unchanged — `movarColumnMeasure`'s macOS branch is `movarFormMeasure`'s verbatim, and the bar's cap is behind `#if os(iOS)`. Both schemes rebuilt; the iPad screenshots in `store-assets/screenshots/ipad/` are re-shot against the fixed layout.

- 33b5693: Stop macOS surfaces from clipping their content against an edge, and make the two splits draw the proportions they were designed with.

  A sweep of every macOS screen at both window sizes — three tabs, four sheets, 940×640 and the 720×480 floor — for elements overlapping, crowding a border, or sitting on a divider. Seven defects, all of them layout rather than logic, and all invisible to a build.

  **Sheets were one height regardless of what was in them.** `MovarSheetContainer` set `minHeight: 360`, and a `List` has no intrinsic height — it takes whatever it is offered and scrolls the rest — so 360 was the height of every sheet in the app. It was wrong in both directions at once: About and "What Movar Audit is" opened with their last row sliced through the middle at the sheet's bottom edge, no scroll indicator and no partial row to say the list continued, while ~300pt of window sat unused below; the two sheets that are one field and a button opened as a control, 190pt of white, and a control. Each sheet now declares its own shape (`MovarSheetMeasure`: form / confirmation / explainer / reference), and the caller chooses, because the shape of a sheet is the thing the caller knows and the container does not. The assumption worth writing down is the one that turned out to be false: an AppKit sheet is **not** clipped by the window it is attached to — it is a child window, and at the 720×480 floor the tallest measure renders in full, overhanging the parent by ~40pt. So the numbers are measured against the content, and that overhang at the smallest window is the accepted price of About never losing two rows at the size it actually opens.

  **The Detector's explainers were capped when there was nothing to protect.** The 300pt ceiling exists so a reader who opens both still has the verdict above in view. It applied whether or not there was a verdict: with an empty rail, an opened explainer scrolled inside 300pt while ~215pt of white sat directly above it, and the line at the cap was shaved through its descenders by the window's bottom edge. The ceiling is now 300 while the rail carries an answer (a result, or "Movar cannot answer this" — an outcome a reader came for, not an empty state) and otherwise whatever the rail can spare once the roster keeps its row. Knowing what the rail can spare needs its height, so the rail is measured; `max` against the old constant means this can only ever be looser, never tighter.

  **Neither split drew its intended proportions, and `idealWidth` is why.** `HSplitView` does not read one. The Detector asked for 560 and 400 and shipped ~475/465 — near half and half, the one proportion that split exists not to be — and raising or lowering the ideals moved nothing. Worse on Audit, where the pane beside the composer changes identity twice in a normal reading (composer to report, report back to the list of audits) and each re-negotiation moved the divider right: 403 → 470 → 540pt, until the report stood on its 400pt floor and a URL, a switch and a button had the wider half. `minWidth` and `maxWidth` are the only constraints that reach `NSSplitView`, so the asymmetry is said with those: the Detector's rail is capped at 400 and the box takes the rest, and the Audit composer is capped at 420 so whatever it does not take is the document's. The reader keeps a narrower drag range than before, which is the price of the splits reading as workbenches rather than as two equal columns.

  Four smaller ones, same sweep:
  - **A sheet's action bar sat 8pt from the bottom edge and 16 from the sides.** 8 is an iOS number — the home indicator's safe area supplies the rest of the margin there. macOS has no such inset, so 8 was literally 8, on the one edge of three that disagreed. It is 16 on macOS now.
  - **About's masthead drew a rule that read as an underline of the tagline.** `movarPlainRow()` hid the row separator behind `#if os(iOS)`, because `listRowSeparator` is macOS 13 and this app's floor is 11 — and the consequence was not the missing hairline anyone would have predicted. macOS insets a row's separator to that row's content, and this row's content is centred, so the rule started at the tagline's leading edge: 182pt in on the left, 12pt from the right. An availability branch now covers both platforms, so macOS 13+ gets the masthead iOS has and 11–12 keeps today's behaviour rather than blocking the fix on a deployment-target bump.
  - **Audit's two panes started their first section header 7pt out of step.** The composer's list pulls `InsetListStyle`'s ~20pt reservation up and the results pane's did not, so "Аудит сайту" and "Попередні аудити" — the first thing in each pane, either side of one divider — did not line up. Same pull, same amount.
  - **The Detector's input box sat 8pt under the tab strip's hairline while holding 14 from the window's own edge.** The 4pt top padding was priced against `TabView`'s bezel, and that inset has been gone since the macOS tab strip became a segmented `Picker` — the justification outlived the thing it was justifying. 10 lands the box's border level with where the rail's first header sits, so the two panes start on the same line.

  iOS is unchanged: every edit is either behind `#if os(macOS)` or an availability branch that resolves to today's behaviour there, and the iOS scheme was rebuilt after each change.

- 54f925d: Stop the Safari collector throwing away a redirect chain that one of its ceilings cut short, so the app and the CLI adjudicate the same site the same way.

  #482 fixed this in the Node collector: falling out of `walk`'s hop loop used to answer no response at all, which `resolveOutcome` read as `error` and `adjudicableProbes` dropped before anything — capability derivation included — saw it. Eleven requests spent against a live third-party site, the whole chain sitting in `redirectChain`, and `core/switch-bounces` — the rule the walk exists for — handed nothing. `AuditProbe.swift` is a conformer to the same wire contract and still did the old thing, so the same site audited from the app and from the CLI produced different verdicts on the most pathological chain there is, and neither report said which collector's ceiling was responsible.

  What made it plainly a bug rather than a policy is unchanged from #482 and holds identically in Swift: a **cyclic** chain exits through the `seen` check with a live response and stays fully adjudicable, so a 2-hop loop was evidence and an 11-hop chain was discarded.

  The ceiling now keeps the last 3xx the walk actually got — `status` is that 3xx rather than a `0` claiming no response at all, which is false of eleven of them — sets `outcome: "ok"`, and emits `redirectChainTruncated`. A challenge asserted by that last redirect still wins and yields `blocked`, matching what `resolveOutcome` does with the same headers. The flag is written only when true, as `omittableFields` writes it: absent is already the wire's "this chain reached its own end", and a `false` on every other probe would say the same thing at the cost of a field on every bundle ever stored.

  **The request budget running out mid-chain is the same fact and now exits the same way.** It is the walk's other stopping condition, and it used to record `error` / `status: 0` on the grounds that `probe.ts` raised `RequestBudgetExhaustedError` out of the whole probe and left nothing to conform to. #500 ended that: `hops.length > 0 && spent >= budget` now returns through the same `finish(lastResponse, null, { truncated: true })` the hop cap does, because throwing out of a hop nobody could have predicted killed a run that had already collected most of a site. A chain the budget ended is precisely the shape the hop cap already had — a chain with an end this probe never reached — and which ceiling stopped the walk is a difference between two audits, not between two sites, which is why **one flag answers both** and the wire has never had a field naming the ceiling.

  That is not an edge case here. `MATRIX_HEADERS` is five legs against an `AUDIT_BUDGET` of 40, and a chain of `h` hops costs `h + 1` requests per leg, so `5(h + 1) > 40` stops an ordinary site from **eight** hops on — under a `maxHops` of ten, where the hop cap never fires at all. Left as it was, the app would have gone on dropping exactly the chains the CLI keeps, and `outcome: 'error'` there is what `adjudicableProbes` drops before capability derivation, which is how a probe becomes `null` and a rule reasoning about a chain that never finished accuses instead.

  **A probe whose FIRST request the budget cannot pay for still refuses outright**, matching the only case `probe.ts` still throws for: that is a caller that did not read `remaining()`, not an observation about a site. It cannot reach the branch above. `claim()` grants only when `spent < budget` and sets `inFlight` inside the same serial `state` queue that `spendOne()` mutates from, so nothing can spend between the grant and the walk's first spend and a concurrent probe is refused rather than queued — the first `spendOne()` after a grant always succeeds. Failing it therefore implies `depth >= 1`, with a 3xx already in `redirectChain`, `status` already holding it and `lastRedirectHeaders` already its headers, which is exactly Node's `hops.length > 0`.

  **The kernel needed no change, but the bridge did.** `core/switch-bounces` already keys on the flag rather than on the schema version, so it publishes a truncated chain as an `observed` `warn` naming the hops it did see — never saying where the chain lands, never grading it a bounce, never letting it settle into `pass`. But `@movar/audit-engine`'s `collect.ts` narrows every field off the native reply before it reaches `Evidence`, and an unlisted field is dropped: a probe emitting the flag natively and a bridge silently discarding it is the same silence one layer further out. It is narrowed on `=== true` rather than on truthiness, because the reply is untrusted and a host sending `"false"` has not said the chain was cut short.

  This closes the last capability divergence behind `EVIDENCE_SCHEMA_VERSION` 5: Safari stamps 5 and can now carry every field 5 promises. Safari's old behaviour degraded in the SAFE direction — the chain was dropped, never misread — which is why this was not urgent the way #482 was.

  Verified by compiling `AuditProbe.swift` against the Command Line Tools SDK and driving the real `URLSession` walk at a loopback server: an endless chain records 11 hops with `status` 302, `outcome` `ok` and the flag set, pointing at the URL nobody fetched; a chain that closes its own loop and one that reaches a real page both leave the flag absent; and an endless chain behind a `cf-mitigated` header comes back `blocked` and truncated. The budget branch was driven the same way, with a budget of 5 against the same endless chain so it stops well before `maxHops`: 5 hops, `status` 301, `outcome` `ok`, the flag set and `finalUrl` naming the sixth URL nobody fetched — `blocked` instead when the same chain answers `cf-mitigated` — while a second probe on the same spent `runId` still comes back `error` / `status: 0` with `refused: "budget-exhausted"` and no flag.

## 1.7.0

### Minor Changes

- 3b6da10: Rebuild the Safari host app's About tab around identity and links, and give it the navigation bar it was missing.

  The screen scrolled its rows under the status bar at full contrast, because a `List` sitting directly in a `TabView` has no navigation bar and therefore nothing to draw the scroll-edge material. It now has one, inline-titled so it does not compete with the lockup.

  What the tab says changed more than how it looks. It used to carry a four-line summary and three capability rows explaining what Movar does — store-listing copy, read by someone who had already installed from that listing — and a row of trust claims that were not tappable. Both are gone. In their place are the things the tab could not previously reach: the privacy policy, Movar's own MIT licence, the dependency licence notices required by the 41 MIT/ISC packages the extension bundles, and an App Store review link. Every claim that survived is now a link to the document that proves it.

  The rest is grouping and repair. Rows are sorted into App / Support / Legal; the version and the changelog became one row rather than a masthead line and a separate link; footer rows are label-coloured instead of tinted, with an external-link mark rather than a chevron; and the "one last step" card is a single row instead of five, so `List` stops drawing separators through the middle of one message. The card now hides itself — off `SFSafariExtensionManager` on macOS, and off an explicit "I've done this" control on iOS, which has no API to know.

  Ukrainian body copy no longer hyphenates mid-word. SwiftUI hyphenates tight paragraphs on its own and ignores a bridged `NSParagraphStyle`, so the words are joined with U+2060; the web original this screen was ported from has never hyphenated.

- 0fc5446: Rebuild the Safari host app's Audit tab in SwiftUI, over the headless engine. Detector is the only web tab left.

  This was the slice `docs/native-shells.md` predicted would collect the most: "an expandable list of rule results is a native list, and it is what users spend their time in". 1,700 lines of React — a composer, a full-screen acknowledgement, and a 1,064-line report — become a stock `List` of `DisclosureGroup`s. The prediction held; what it did not anticipate is written up in the ADR.

  **Nothing native adjudicates anything.** `engine.js` now runs in a `WKWebView` that never draws, so every verdict, count and downgrade still comes out of `evaluate()`, the same pure kernel the CLI runs. That is what makes a native renderer safe at all: consistency was never a property of two runtimes drawing the same pixels, and a Swift reimplementation would have been a second adjudicator. The Swift side decodes a `Report` and lays it out.

  The engine had to answer two questions a `Report` cannot. A `RuleResult` carries no family, so a shell has no way to know which section `core/switch-bounces` belongs in — the React report reconstructed it by importing `CORE_RULESET`, and a native table hardcoding it would have silently mis-filed every rule added after this binary shipped, into no section at all. And a shell must never grow its own artifact renderer, because the exported file is the thing a site owner re-runs, so all of them and the CLI have to emit the same bytes. Hence `catalogue.describe` (structure, not strings — the ADR's line that native owns display copy still holds) and `audit.artifact`. Both additive; the protocol version did not move. `dispatch` also gained an unknown-kind branch: `handle` never rejects, so a request this build cannot answer must produce a stated refusal rather than no event at all, which would strand a caller on a reply that can never arrive.

  Three things the port taught about hosting an engine in a WebView. **It has to be IN the view hierarchy**, at zero size — a `WKWebView` with no window is a suspendable web process on iOS, and an audit stalled mid-matrix would read as a site that stopped answering, which is a false observation about a named company. "Never displayed" survives; "never attached" does not. **The two big payloads travel as text**: `audit.complete` hands `report` and `evidence` over pre-stringified, so Swift keeps exactly the bytes it re-sends for an export while decoding only the thin slice the screen draws — a bundle is mostly sampled text nodes, and materialising those per remembered run is the difference between a session of audits fitting on a phone and not. And **every request must end**: the engine failing to load, or its web process being jetsammed, both used to leave a button reading "Auditing…" until the app was force-quit. Both now fail loudly, and a crash costs the run in flight rather than the rest of the session.

  Two controls changed rather than ported. **Removal lost its confirmation**, correctly: the web list had to ask because its `×` was one stray tap from spending another full matrix of requests against somebody else's server, and swipe-to-delete charges that same deliberation without a second screen — the system control doing the same job, which is the only ground the About slice allowed for replacing a hand-rolled one. And **the filter pills became a `Menu`**, because the web bar wrapped and on a 390pt phone six pills hid their own last two options behind an invisible scrollbar; a menu states the active filter on its own row and keeps each option's count, which was always the useful part of a pill.

  i18n took its first generated step. The 46 Ukrainian rule titles and 6 family headings are written into `Localizable.strings` by `scripts/gen-audit-strings.mts`, which runs as part of the host app's build beside the bundle sync — those tables already carry a drift guard on the TypeScript side, and hand-copying the output would have put a second, unguarded copy one commit behind the guarded one. The ~70 prose strings stay hand-written: the native screen's wording deliberately differs from the web's in places (a filter row that needs a label, no per-row "Remove &lt;target&gt;" because swipe-to-delete names its own row), and a generator would have to encode which. Plurals are the one grammar rule still in Swift — English needs two forms and Ukrainian three, and a `.stringsdict` means a new localized variant group in the Xcode project for both app targets, which is a bigger change than the strings it would carry.

  `AuditTab.tsx` and `AuditReport.tsx` stay in `apps/safari-host-app` for the standalone web build, exactly as the Settings and About panels did. The bridge's `exportReport` case stays too, now delegating to the same `HostActions` the native button calls.

  Both schemes build clean, and the tab was exercised end to end on an iPhone 17 Pro simulator against a live site: the acknowledgement, a real run through the Swift prober, the response matrix, the Ukrainian rule titles, a disclosure's missing-capability sentence, the jurisdiction pack producing a cited finding under its own family heading, and an export rendering a 210 KB artifact into the share sheet.

- 00d61b3: Start the native shells: render the About tab in SwiftUI, and move the audit into a headless engine every platform can host.

  The Safari wrapper app has been React in a `WKWebView` since it existed, which was right while it was mostly a launcher. It is becoming a tool a site owner runs against their own site, and two things follow. A WebView cannot render platform components — Liquid Glass, Fluent and Material are not CSS, and the tab bar was a `<div role="tablist">` with hand-rolled arrow keys. And an audit report is a long list of expandable rule results, which is the shape native list virtualization handles best and a deep DOM tree handles worst.

  The objection was that identical rendering across platforms is what proves "same evidence, same answer". It is not: that invariant lives in `evaluate()`, a pure function from `Evidence` to `Report` that `purity.test.ts` already enforces. It is a property of the data and it survives any renderer. So the UI goes native per platform and the kernel stays the single source of truth — the split is written up in `docs/native-shells.md`.

  `@movar/audit-engine` is the headless half: the collector, the DOM digest and the kernel in one bundle a shell loads into an offscreen WebView that never renders. It is a system WebView rather than an embedded JS engine because `digest-dom` needs a genuine `Document` — `@movar/lang-pickers` narrows with `instanceof HTMLAnchorElement` on globals, and a shim that is subtly unfaithful returns `not-applicable` on four rules instead of failing loudly, which is a false pass on somebody's audit. HTTP stays native, so `default-src 'self'` keeps forcing every byte of egress through one auditable file; that is now a property of Movar Audit on any platform rather than a quirk of Safari. Two things that were hardcoded to Safari became inputs: the probe is injected, and the collector id is declared by the host, because a run on Android has to say `okhttp` and mean it. The Safari host app is that engine's first consumer rather than a second copy of it: its Audit tab calls `runAudit`, so the collector, the probe contract and the collector's tests exist once — and its reports pick up the engine stamp for free, which a screen adjudicating on its own could not have done.

  Every report now names the build that produced it. `Report` gains an `EngineStamp`, written during `evaluate()` rather than patched on afterwards, because a report exists to be re-adjudicated and "run this evidence again" is unanswerable without knowing which engine judged it the first time. The stamp is optional on the type — `evaluate()` is pure and the CLI and its tests share no build identity, and a pure function cannot learn its own — so each runtime supplies it, which is also what lets one adopt it at a time. A report that carries none renders as _unknown_, never as a default: filling in the running build's version inside the one field whose job is to say which code to go back to would mint an identity nobody shipped, and a wrong answer that looks right sends a reader to the wrong commit.

  The bundle is built and synced into the app's resources by both Safari build paths, and referenced from the Xcode project. That is compliance, not convenience — every store forbids downloading and executing code at runtime, so a future change that fetched the engine from a CDN would be a violation on all three rather than an optimisation.

  Appearance is each platform's canonical stock look, and the drift between platforms is the deliverable rather than a defect. The brand surface that crosses is one accent and the mark; the UI face is the system face, because shipping Manrope would fight Dynamic Type and break the metric alignment stock layouts rely on next to SF Symbols. Two ADR assumptions did not survive contact: `.tint()` is macOS 12 against this app's macOS 11.0 floor, and `SettingsLink` cannot reach Safari's Extensions pane at all — both are corrected in the doc.

  Only About is native so far; Detector, Audit and Settings still render in the WebView behind a native `TabView`, and the web layer stopped drawing its own tab bar so the two do not both appear. **None of the Swift has been compiled or run** — it typechecks for macOS 11 and its localisation and project edits validate, but there is no Xcode on the machine this was written on, the iOS branches got syntax checking only, and re-parenting one `WKWebView` across three SwiftUI containers on tab change is unproven on a device. The VoiceOver announcement the web banner had via `aria-live` is dropped rather than hand-rolled, which is a real regression tracked separately.

- e0b947d: Rebuild the Safari host app's Settings tab in SwiftUI, and move About behind it. The tab bar goes from four tabs to three.

  Settings was the last web form pretending to be an app screen, and it had the same defect the About tab had before it: a `List` with no navigation bar has nothing to draw the scroll-edge material, so rows passed under the clock and the Dynamic Island at full contrast. It is now a stock grouped list with a real bar. Everything it hand-rolled has a stock counterpart doing the same job better — `↑ ↓ ×` typed as literal text glyphs become drag-to-reorder, swipe-to-delete and a row context menu; the `h3` headings sized off a web type ramp become section headers; the two grey "how it works" cards become the section footers they always wanted to be. The priority list is modelled on Settings ▸ General ▸ Language & Region, which is the same list with the same semantics.

  About is no longer a tab. Apple's tab-bar guidance weighs a tab against "the need for people to frequently access each section", and an About screen is a once-ever destination; across eighteen sampled iOS apps, not one carried About as a peer tab and every About screen was a push from Settings. So About keeps the screen it was rebuilt into last release and loses only the slot: it is the last row of Settings, pushed on iOS and presented as a sheet on macOS, where `NavigationView` is a split view and there is no stack to push onto.

  The enablement banner moved the other way, from About to the top of Settings. It is the one task standing between someone and a working install, and Settings is where you look when Movar is doing nothing — leaving it one push deep under "Legal" would have been the only real regression the merge could have caused.

  **The "Movar enabled" master switch is gone**, from the native screen and from the web panel behind it. Safari's own extension settings are the system-provided version of that control, and an app is not supposed to ship a redundant copy of a systemwide setting — least of all two sections below a card that teaches you where the real one is. No other browser's Movar had one: the extension's only live writer of that flag is the popup's off-state hero, which only ever turns it back on, which is also why removing it strands nobody.

  Two things did not have to cross into Swift. The native screen edits four keys of the stored settings object and passes the rest through untouched, so a field a newer extension added still survives a host write; and the block list stays derived on the web side, so the policy table behind it needs no Swift twin. The Ukrainian accusative-endonym table behind "Видалити українську" is not needed either — a context menu is already scoped to its row, so the verb stands alone.

  Both schemes build clean under Xcode 26.3, and the screen was exercised on an iPhone 17 Pro simulator: reorder, add and remove a language, the conceal-mode picker, domain normalisation (`https://WWW.Example.COM/path` → `example.com`), the push to About, and the setup banner's dismissal.

### Patch Changes

- 1084d73: Stop calling Belarusian text Ukrainian when Belarusian isn't on the roster.

  Both detectors counted only what a candidate uniquely **owns** — evidence that can only argue _for_ someone. Against the roster a Ukrainian reader gets by default (`{uk, ru}` after script scoping), Belarusian spent its `і`s electing Ukrainian, while `ы`, `ў` and `э` — letters Ukrainian does not have at all — were owned by nobody, counted for nobody, and stopped nothing. `Мова і культура Беларусі маюць багатую гісторыю` came back `uk` at rung 1; `Гэта цікавая кніга і добры фільм` came back `uk` 5-to-1.

  langtell 0.6.1 adds the missing half: a winner whose own alphabet cannot account for 2% of the text's letters loses to `unknown`, in `classifyBySnippet` and in the `detectCyrillicLanguage` fast path alike. The runner-up is not promoted — a set that cannot spell the text does not get a second guess at it. Adding Belarusian to the Detector's roster still resolves the same snippets to `be`.

  It was never Cyrillic-only: German, French, Polish and Turkish prose all came back `en` against the same roster, and now abstain too.

  Incidental foreignness is left alone: an article quoting its neighbour runs 0.3–0.9% and a borrowed proper noun 1.4–1.5%, both well under the line, so a Ukrainian page quoting Russian is still Ukrainian and a Russian page about Kazakhstan is still Russian.

- 065f597: Stop the conceal curtain rendering two different collapse tiers on cards a reader sees as the same size, and fix the overflow the old fold could not express.

  Reported on YouTube's watch-page right rail: two visually identical cards, one showing the full vertical card and its neighbour the compact bar. The rail is the reason. It does not hold one card size — measured at a 980px window it holds both 320×120 and 320×113, a 7px difference between siblings — and its height tracks the window, running a content box of 93px at 980 through 125 at 1100 to 130 at 1280 and up. The fold sat at 104px, inside that range, so at the width where the rail's two variants straddled it they rendered as different tiers side by side.

  Widening the gap around the old value cannot fix this, because there is no gap: measured across surfaces and window widths, YouTube's cards are a continuum — rail 93–130, search results 149–217, home grid 235–291. Every `@container movar-cover` threshold now snaps to `containerBand`, a new power-of-two ladder in `@movar/theme` (16 → 1024), and the fold moves up to the `lg` rung (256) so it clears that whole distribution instead of sitting inside it. The rail is now the same tier at every window width, and the width rungs (`xl`/`lg`/`md` = 512/256/128) sit well clear of real card widths.

  The move also closes a shipped overflow bug. The vertical card is not a fixed height — 87px normally, 113px once the description wraps to two lines, 129px once the actions wrap too — so a `max-height` fold was approximating a fit constraint that depends on width, and a 132×135 target rendered a 129px card into a 113px box. Sweeping 399 target sizes against the real stylesheet: the shipped rungs clip 4 of them, the new rungs clip none. Folding at 256 puts the card tier's floor an order above the card's own tallest form, so nothing that reaches that tier can be too short to seat it, whatever its width.

  Trade-off worth knowing: with the fold at 256, YouTube cards render the compact bar rather than the vertical card, so the "Російською мовою" reason line now appears only on targets taller than ~278px. A size container is queried on its content box, so every rung fires at the rung plus the curtain's 20px padding — the numbers in the CSS are not the target sizes. A unit test pins each threshold to a ladder rung so none can drift back to a hand-measured value, and the `curtain-tiers` visual baselines were regenerated (the fixture's full-card tile grew to 320×320, since a 220px card is a bar by design now).

- 0150a77: settings: derive the block list from the priority list instead of storing it as a user-editable set. Closes #89.

  Which language is imposed over which is product policy, not a preference — and it could not be exposed safely. Detection distinctiveness is candidate-set-relative: `ы` cleanly separates Russian from Ukrainian, and goes inert the moment Belarusian joins the candidate set. A user adding a language to a free-form block list therefore weakened rung-1 Russian detection, and the failure mode was under-concealing Russian with no visible signal.

  `blocked` is now `deriveBlocked(priority)` — `((⋃ IMPOSED_OVER[priority].imposed) ∪ ['ru']) \ priority` — recomputed at every settings read and before every write, so a value synced from an older build or hand-edited in storage converges on its own. Russian stays unconditionally locked and can never enter the priority list; every other imposer is overridable by putting it in `priority`. The four runtime consumers (redirect trigger, picker stripping, conceal candidates, popup hero) keep reading `settings.blocked` unchanged — only its provenance moved. Behaviour for the shipped default profile is identical.

  The unmounted `BlockedSection` component and its now-unused copy are deleted rather than restored.

- deb7d72: Link the Safari host app's version stamp to the changelog, and teach the native shell to open external URLs at all.

  The previous change linked the version stamp in the extension's popup and options footers. The host app's About tab shows the same stamp and was left as plain text, because it could not have been anything else: its `WKWebView` runs under `default-src 'self'`, so every external link routes through the native bridge, and `ViewController.swift` had no case for opening one. The "Send feedback" and "Source code" buttons already in that footer were posting messages nothing consumed — silent no-ops on a real device. Adding a third dead control would not have been an improvement, so the native side comes first.

  `userContentController(_:didReceive:)` gains the two cases the host bridge has been posting all along. `feedback` opens the support `mailto:` from a Swift-side constant and carries no payload, so the address can never be chosen by the page. `open-url` opens its payload — but validates it first through `httpsURL(from:)`, which accepts only an absolute `https` URL with a host. Everything we send is a baked-in `@movar/brand` constant, yet it arrives as an untrusted string over a JS bridge, and that check is what keeps the case from becoming a launcher for `file:` or a custom app scheme if a script ever ran in that WebView. A future link needing another scheme gets its own payload-free case, the way `feedback` did. Both share one `openExternally(_:)` — `UIApplication.shared.open` on iOS, `NSWorkspace.shared.open` on macOS — since the footer shows on both platforms.

  The stamp then becomes a button posting `open-url`, labelled `v1.6.2 — what's new` in the same shape as the extension's `versionLink`, so the accessible name leads with the visible text (WCAG 2.5.3). Its resting appearance is unchanged: it carries `.link` for the button reset, tap target and focus ring, and keeps `.version` for the mono build-stamp look. Measured against the span it replaces, the box is the same width, the same left edge, and the text sits on the same baseline, so the About tab's visual baselines are untouched.

  With three surfaces now linking to the same page, `changelogUrl` moves into `@movar/brand` alongside the `SITE_URL` it is built from, and gains a `changelogPath` companion. The extension's `src/lib/changelog-url.ts` is gone; the host app never grew its own copy; and `localeChangelogHref` in the marketing site's `i18n.ts` — which is where the `/uk` prefix rule otherwise lives, one helper per page — now delegates to `changelogPath`, keeping its name, signature and call sites. Four surfaces, one definition of both the route and the `#v<version>` anchor. That anchor is a contract with `Changelog.astro`'s per-release ids that nothing enforces: if it drifts, the link silently lands at the top of the page, so both sides move together.

  This widens `@movar/brand` past "constants only" for the second time — `FEEDBACK_URL` was always derived — so the boundary is now written down explicitly: a function may live there only if it takes primitives, returns a URL or path, needs no workspace dependency, and exists because more than one app would otherwise write the same shape by hand. The seven `locale*Href` siblings meet none of that last test and stay in the marketing app.

- 5cdab46: Stop reading a language switcher's first entry as the current one, and stop a wrong reading from taking your URL with it.

  On hotline.ua every page — Ukrainian ones included — came back Russian. Its switcher renders both entries as bare, href-less `<div>`s (the framework owns the click), so the rule "this entry can't switch anywhere, therefore it must be the one we're on" fired on **both**, and the first in DOM order won. The entry that really is current is marked `--disabled`, an inverted convention no `active`/`current`/`selected` pattern sees.

  The damage wasn't the wrong label. Russian is a blocked language, so the switch ladder engaged, and hotline publishes a canonical, query-less `uk-UA` alternate — following it replaced the URL and dropped the query. Product, tab and sort links that carried one silently stopped working, which is why it was reported as "some links don't open".

  Every active-entry pass now has to single one language out or abstain, so an ambiguous switcher falls through to `<html lang>` instead of reading DOM order as evidence — the same rule that already applies when two pickers disagree. Doing that revealed `<option selected>` was never read at all, so `<select>` switchers now get their own marker rather than relying on the selected option happening to be listed first.

  Separately, and independent of detection being right: on a site with no hand-written rule, Movar no longer redirects when the page's own `<html lang>` already declares the language you asked for. There's nothing to gain — you're on the best version on offer — and a redirect there costs you whatever query or anchor you were looking at. yato.com.ua lost live search results to the same shape in July.

- 0439e93: Import Combine in the Safari host app's `HostState`, so both app targets archive again.

  `ObservableObject` and `@Published` are Combine's types. Some SDKs re-export them transitively through SwiftUI; the iOS/macOS 26 SDK does not, so `HostStateModel` failed to compile the moment a real Xcode saw it — `type 'HostStateModel' does not conform to protocol 'ObservableObject'`, plus `init(wrappedValue:) is not available due to missing import of defining module 'Combine'`. Both schemes failed to archive.

  A local `swiftc -typecheck` against the Command Line Tools SDK does not reproduce it, which is why this shipped: the native shell landed having been typechecked but never built, and the gap was known and recorded at the time. The import carries a comment saying exactly that, so nobody on a machine where it looks redundant tidies it back out.

  Only `HostState.swift` declares the conformance. `@ObservedObject` in `AboutView` and `MovarRootView` is SwiftUI's own property wrapper and needs nothing.

- 4bb2e87: Make the version stamp in the popup and options footers a link to the public changelog, anchored at the version the user is actually running.

  The stamp was inert text on both surfaces. It is the only place in the UI that names a release, so it is where someone goes after noticing the number changed — and it went nowhere. The store listings are no answer either: Chrome has no release-notes field at all, and the Firefox and App Store listings only ever show the newest version's notes. `movar.fyi/changelog` renders `apps/extension/store-assets/RELEASE-NOTES.md` — the same file those listings read — so it is the one surface that holds the whole history, in both languages.

  `changelogUrl(locale, version)` (`apps/extension/src/lib/changelog-url.ts`) builds `https://movar.fyi/changelog#v1.6.2`, or `/uk/changelog` when the resolved UI locale is Ukrainian, mirroring the site's own `localeChangelogHref`. The anchor is emitted only for a real semver: the static-serve preview renders `version = 'preview'` (no `browser.runtime.getManifest()`), and an anchor for that would resolve to nothing, so it opens the top of the page — the newest release — instead. Each release in `Changelog.astro` now carries the matching `id`, plus `scroll-mt-24`; the site's header is sticky and measures 73px, so without the offset a jump would land the release underneath it.

  Both footers render one shared `VersionLink`, so the two surfaces cannot drift into linking differently. Resting appearance is unchanged — same type ramp, no underline — and it opens in a new tab (`noopener`), since navigating in place would throw away the popup the user is standing in. The new `versionLink` catalogue string starts with the visible stamp (`v1.6.2 — what's new`) so the accessible name contains the visible label, as WCAG 2.5.3 requires.

  `@movar/brand` gains `SITE_URL` — the origin only. The `/uk` prefix is the marketing site's own routing concern, and that package is constants without logic, so callers compose the path they need.

  Not covered here: the Safari host app's About tab shows the same stamp as plain text. Its WKWebView runs under `default-src 'self'`, so external links route through the native bridge, and the `open-url` case does not exist in `ViewController.swift` yet — the existing "Source code" button is already a no-op on device. Linking the stamp there needs that native pass first.

- Updated dependencies [065f597]
- Updated dependencies [0150a77]
- Updated dependencies [38f5c06]
- Updated dependencies [deb7d72]
- Updated dependencies [5cdab46]
- Updated dependencies [4bb2e87]
  - @movar/theme@0.0.1
  - @movar/settings@0.0.2
  - @movar/options-ui@0.0.3
  - @movar/i18n@0.0.3
  - @movar/page-content@0.1.1
  - @movar/brand@0.0.1
  - @movar/lang-pickers@0.0.3
  - @movar/ui@0.0.1
  - @movar/app-shell@0.0.3
  - @movar/page-language@0.0.3

## 1.6.2

### Patch Changes

- c58e24f: extension: fail the build on any network-egress primitive in the EMITTED bundle, not just in our own source. `assertNoNetworkEgress` (wxt.config.ts `build:done`) scans every emitted `.js`/`.html` for `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource`, closing the gap its source-side companion (`scanForEgress` in scripts/lib/promises.mts) can't reach: a dependency could bundle a request into the shipped package without a line of our code changing. It asserts absence with no allowlist, which is why `vite.build.modulePreload.polyfill` is now `false` — that polyfill's cache-warming `fetch()` was the single (benign) egress call in the artifact, and every browser Movar targets has native modulepreload well below its MV3 floor, so dropping it costs a preload hint at worst.
- 005744f: Fix a crash that disabled Movar entirely on Google in Firefox.

  `scrubSearchParams` iterated `url.searchParams.keys()`. A Firefox content script is an Xray-wrapped sandbox where `URLSearchParams`'s WebIDL iterator methods do not survive the wrapper, so that `for…of` threw `TypeError: searchParams.keys() is not iterable` — out of `applyStrategy`, out of `applyOnce`, out of the content-script bootstrap. On Google (the only host whose rule scrubs params) Firefox users therefore got no `hl`/`lr` rewrite — so Google served the Russian corpus — and no content filtering at all, while the popup kept answering normally because its message bridge is installed before the throw. Now uses `forEach`, and a `no-restricted-syntax` guard bans these iterator methods repo-wide: Chromium and jsdom both iterate them fine, so no unit test or Chromium e2e run can catch a reintroduction. Note `Array.from(searchParams.keys())` does not throw in that sandbox — it silently returns `[]`, which would have scrubbed nothing while looking correct.

## 1.6.1

### Patch Changes

- 2fdc552: Recover from a failed capability-chunk load instead of disabling concealment for the page's life, and leave a diagnosable mark when it happens.

  A dynamic `import()` that failed was memoized as `null`, so one transient miss (cold service worker, a chunk fetch racing a navigation) permanently switched content filtering off in that tab — and the facade's `!contentModel` early return left no trace, producing a DOM identical to a clean, fully-scanned page. Failures are no longer cached, and each retry gets a distinct module specifier (`?retry=N`), because the realm's module map replays a stored import failure without issuing a new fetch — so evicting only our own cache would have retried straight into the cached error. A tick that still cannot provision what concealment needs now stamps `data-movar-capability-gap` on `<html>` with the missing chunk paths, cleared as soon as a later tick succeeds.

## 1.6.0

### Minor Changes

- 48d65c1: extension: YouTube filtering works again on today's markup — including the redesigned watch sidebar, Shorts shelves, playlist pages and channel tabs — and now also covers channel community Posts. Clicking a video from search results can no longer be aborted by the language rewrite (a canceled navigation used to poison the deferral's old-URL check), and returning from a video to the results page no longer costs a full-page reload blink. Google's own "Web" filter tab (`udm=web`) gets the language enforcement it was silently missing, and model chunks stop loading on sibling frontends they cannot parse (YouTube Music/Studio/Kids, Google News/Scholar/Translate).

### Patch Changes

- 1a5f277: onboarding: stop delivering the privacy guarantee as fine print. The reassurance was a faint, centred trailing line under the steps — arriving exactly where the reader has just handed over access to every site, in the one typographic register that reads as "safe to skip". It is now a titled card with a shield mark and a link to the public source, so the answer to "why is this safe to grant?" reads as part of the guide.

  The copy picks up the two claims it was missing (no accounts, no analytics — already the wording carried by the marketing privacy section) and closes on the source being public.

  Mirrors the same change to the marketing site's `/install` guide, which the onboarding page is deliberately kept in step with.

- Updated dependencies [48d65c1]
- Updated dependencies [1a5f277]
- Updated dependencies [48d65c1]
  - @movar/host-match@0.2.0
  - @movar/i18n@0.0.2
  - @movar/page-content@0.1.0
  - @movar/app-shell@0.0.2
  - @movar/options-ui@0.0.2

## 1.5.3

### Patch Changes

- onboarding: draw the real browser UI the install steps point at.

  The first-run page's step illustrations were four abstract grey-bar shapes shared across every browser, so a Firefox user was shown a Chrome menu and an iPhone user a desktop one. Each flow now gets a recreation of the interface it actually points at — Chrome's toolbar and site-access menu, Firefox's unified-extensions panel and about:addons permissions, the macOS Safari Extensions pane, the iOS Settings screen — drawn from each platform's own palette and metrics, in the page's language, light and dark.

  The same illustrations render on the marketing site's install guide, so the pre-install and post-install guidance now show the same picture for the same step instead of being kept in step by hand.

- Updated dependencies [a52de05]
- Updated dependencies
  - @movar/lang-pickers@0.0.2
  - @movar/browser-ui@0.0.1
  - @movar/page-language@0.0.2

## 1.5.2

### Patch Changes

- 0fb400a: content-conceal: don't add a spurious empty curtain over already-emptied containers when switching conceal mode from hide to curtain. Closes #296.
- b3cfa7f: content-conceal: don't leave cards marked CHECKED when a scan is superseded, so a subsequent scan correctly re-evaluates them instead of permanently skipping cards that should be (re-)assessed for blocking. Closes #289.
- 8e0d860: content-runtime: don't memoize a failed content-locale/message load, so a retry can re-attempt loadContentMessages instead of permanently pinning hide-mode live-region strings to English after a transient first-load failure. Closes #316.
- 9ba179a: content-runtime: re-apply concealment after a UI-language change, so previously-hidden/blocked content is re-concealed in the new locale instead of being revealed and left permanently visible until reload. Closes #288.
- 1c32637: content-runtime: reset the per-page "Show everything on this page" override on SPA navigations instead of letting it leak across a same-pathname route change, so Movar isn't silently disabled on the new page. Closes #314.
- 480dec1: events: funnel correction-log appends through a single serialized writer in the background service worker, fixing a cross-tab lost-update race where two tabs recording corrections concurrently could drop one tab's append (undercounting the on-device insights dashboard). The previous per-tab `applyingInFlight` guard only serialized within a single tab. Closes #310.
- 5922433: curtain: snapshot and restore a site's inline `overflow-x`/`overflow-y` longhands individually when covering/revealing content, so revealing a cover-curtain no longer permanently strips an element's own single inline overflow longhand (e.g. `overflow-y: auto`). Closes #302.
- 529c7d0: background/dnr: on service-worker wake, respect an active empty-SERP-retry suspension instead of unconditionally re-installing the Google redirect rule — so a SW restart mid-retry no longer re-rewrites the retry request and defeats the empty-SERP recovery. Closes #301.
- f8e7d41: onboarding: derive the pin-step browser label from the resolved onboarding flow so Firefox users see "Firefox" (and Safari its own label) instead of a hardcoded "Chrome". Closes #294.
- 6b94de6: fix(google): count `data-hveid` result cards, not `<h3>` titles, for the empty-SERP retry — a shopping/product-only SERP (title rendered as a `role="heading"` div, no `<h3>` anywhere on the page) was misread as zero results, firing a spurious retry that suspended the Google redirect rule, stripped the `lr` language filter, and forced an unwanted navigation on an already-healthy page.
- 66b3a50: hidden-summary: exclude empty-container cleanup wrappers from the "N hidden" count so it reflects the real number of concealed content items instead of being inflated. Closes #297.
- 8254dcb: lang-pickers: treat regional variants of a blocked language as blocked (e.g. `pt-BR` when `pt` is blocked), so a blocked language no longer leaks through a picker's regional-variant links. Closes #293.
- 4ca7dca: language-switch: record the correct target language on a picker-based redirect, so the local corrections/insights dashboard no longer attributes the switch to the wrong language. Closes #299.
- 98735d8: security: validate the language-switch redirect target's scheme before navigating — Movar now only follows `http:`/`https:` alternates from a page's `hreflang`/picker links, closing a confused-deputy open-redirect where an injected `<link rel="alternate">` could force an off-site navigation. Closes #306.
- 93616c2: loop-guard/session-choice: persist migrated legacy storage entries with a fixed timestamp on first read, so a pre-#184 legacy entry can finally cross SUPPRESSION_TTL_MS and TTL-expire. Previously each read re-derived `ts: now`, keeping migrated entries immortal — a bounced language switch could bail forever and a stale session pick could pin a host to a blocked language indefinitely. Closes #304.
- 85f1160: native-settings (Safari): advance `seenRev` only after the `storage.sync` write succeeds during host-app settings adoption, so a rejected sync write (quota, rate-limit, transient iCloud unavailability) no longer silently drops the host app's change — the reconcile now catches the failure, leaves `seenRev` behind, and re-adopts on the next wake. Closes #315.
- 5cdc65a: picker-filter: restore a hidden picker link's original inline `display` (and its priority) on reveal/teardown instead of unconditionally removing it — previously `removeProperty('display')` wiped an element's own inline display, shifting layout or leaving CSS-`display:none` elements invisible after "Show hidden options"/"Show everything". Closes #300.
- 967a884: popup: clear a host's active snooze when escalating to "Always skip this site" or "Turn on for this site", so later un-exempting the host resumes Movar immediately instead of leaving it inert until the stale snooze window expires. Closes #298.
- 90e70ca: settings-reaction: re-apply priority/blocked language changes to already-open tabs instead of only affecting future evaluations, so changing your languages updates open pages without a manual reload. Closes #290.
- de23856: tooltip: detach a surviving link's tooltip (host + registry entry) when the link later becomes hidden or is SPA-replaced, instead of skipping it — fixing a bounded per-session detached-DOM / registry leak that accumulated on dynamic picker sites until the feature was turned off. Closes #303.
- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
- Updated dependencies [afa3888]
- Updated dependencies [f558db5]
- Updated dependencies [55b2740]
  - @movar/lang-detect@0.0.1
  - @movar/host-match@0.1.1
  - @movar/options-ui@0.0.1
  - @movar/ui@0.0.1
  - @movar/page-content@0.0.2
  - @movar/events@0.0.1
  - @movar/i18n@0.0.1
  - @movar/lang-pickers@0.0.1
  - @movar/page-language@0.0.1
  - @movar/settings@0.0.1
  - @movar/app-shell@0.0.1

## 1.5.1

### Patch Changes

- ffb6b07: Fix video clicks being aborted on YouTube search results. Clicking a video on `/results` is a same-document Navigation API push to `/watch`, and the browser fires the location-change event _before_ the navigation commits — while `location.href` still reads `/results`. Movar re-applied its `hl`/`gl` search-params rewrite to that stale URL and `location.replace()`d, clobbering the click, so the page blinked and the video never opened. The re-evaluation after a client-side URL change now waits for the navigation to commit before resetting guards or re-running, so the enforce-mode rewrite can no longer abort an in-flight click.

## 1.5.0

### Minor Changes

- 7a43390: Manage exempt sites (the allowlist) directly from the extension. The options page now shows an "Exempt sites" editor to add, review, and remove domains where Movar takes no action, and the popup gains an "Always skip this site" action that exempts the current site in one click. Exempt domains are normalised to one canonical form — a bare `example.com`, with `www.`/scheme/path stripped — so a site you exempt from the popup is matched consistently by both the content script and the network-level rewrite, and covers its subdomains.

### Patch Changes

- f342354: Hide the popup's "Always skip this site" action on hosts that can't be stored as an exempt domain. A dotless host such as `localhost` or an intranet name is dropped by the allowlist's canonicaliser at the storage boundary, so offering the action there previously reloaded the tab without exempting anything. The popup now gates the affordance on `isStorableDomain`, matching the rule the settings boundary applies.
- 1256077: Re-apply Movar's Google language switch after you solve a Google captcha (the "unusual traffic" / `/sorry` interstitial). Previously the results came back in the blocked language: the page you were returned to still counted as recently-redirected, so Movar treated the captcha detour as a redirect loop and skipped the switch. Movar now recognises the `/sorry` interstitial as an external interruption and re-applies the `hl`/`lr` switch on the search page you land back on.
- 1256077: Hide Google's "Схожі запитання" (People also ask) section heading when every question inside it is concealed, instead of leaving the label dangling over an empty box. The empty-container cleanup now treats a lone section heading as a passive label rather than content that keeps the section alive — while still preserving functional controls beside an emptied list, such as the AI Overview "5 сайтів" sources toggle. "Show everything" brings the whole section back together with its rows.
- d4d4edc: Fix broken on-site search on Ukrainian OpenCart shops (reported on yato.com.ua). Their language switcher renders each option as a `<li>` wrapping a dead-href (`href="#"`) JavaScript switcher anchor, and the extractor keeps the `<li>` wrappers as the picker's classified links. The active-language detector treated the first non-anchor entry as the "you are here" marker, so a Ukrainian page (`<html lang="uk">`) was read as Russian — its first option is `Русский`. The extension then tried to "correct" the page: the site's own `uk` hreflang is self-referential (a no-op), so it followed the Ukrainian switcher anchor, which — with `<base href>` plus `href="#"` — resolves to the homepage, discarding the user's search results. Active-language detection now judges a wrapper element by the lone switcher it contains instead of assuming any non-anchor entry is the active one, so these pickers correctly abstain and detection falls through to `<html lang>`.

## 1.4.3

### Patch Changes

- 893f392: Skip declarativeNetRequest writes whose outcome is already installed. The background resync — which re-runs on every service-worker wake, settings change, pause/snooze flip, and alarm expiry — previously rewrote both dynamic rules (Accept-Language, Google /search redirect) unconditionally. Each sync now reads the installed rules via `getDynamicRules`, deep-compares against the rule it would write, and skips the `updateDynamicRules` call when they already match (including "should be absent and is absent"). Every dynamic-rules write rewrites the browser's on-disk rules store, and on Safari ≤ 26.4 that store can crash the whole browser at launch (WebKit bug 305585) — so redundant writes were exposure, not just waste. Any doubt (failed read, platform-added keys, structural mismatch) falls back to the exact write behaviour shipped before.
- Open a freshly-selected tab in the macOS and iOS companion app at its top. The app's tabs share one scroll position, so switching away from a tab you had scrolled down (a long Detector report, or the Settings list on a small screen) left the next tab opened mid-page. Selecting a tab now resets it to the top — whether by click or arrow key — matching how native tab bars behave.
- Give the toolbar icon a consistent border in every state. The static fallback icon — shown on tabs Movar hasn't evaluated yet, such as a background tab, a still-loading or non-web page, or any tab after the browser suspended Movar's background worker — was the plain brand mark with no status ring, so it looked border-less next to the ringed active, paused, and off looks and could read as a state that had lost its outline. The fallback now wears a neutral resting ring matching the rest of the icon family, so an unevaluated tab always looks intentional. The brand logo used elsewhere (store artwork, the Safari app icon) is unchanged.
- Stop the toolbar icon flashing its red "needs attention" look for a frame on page load. While a tab was still loading, a momentary gap in the hidden-content signal made the icon paint the attention posture before settling into its normal state — a visible red→green flicker on every navigation. Movar now holds the icon steady while a tab is loading and repaints it once the page finishes, so the flash is gone.

## 1.4.2

### Patch Changes

- 7b8ee85: Fix Movar failing to find a site's language switcher at all — automatic switching silently did nothing, with no error — on sites that stamp a `data-lang`/`data-locale` attribute on `<html>` (a common CMS pattern for page-level locale metadata; UMI.CMS shops like ds-electronics.com.ua do this as `data-lang="ru"`). Movar's picker scan seeds candidates on `data-lang`/`data-locale`, meant for individual switcher items, but `<html>` matched too — and being the ancestor of every other element on the page, it crowded out the real switcher from consideration entirely. Movar now ignores `<html>` and `<body>` as switcher candidates; they're never legitimate switcher items themselves.

## 1.4.1

### Patch Changes

- a448116: Fix Movar giving up on Ukrainian shops that run on UMI.CMS and model language as a prefix-less URL for Ukrainian (e.g. `/rele/`) versus `/ru/…` for Russian. These sites advertise a language link that actually 301-redirects straight back to the Russian page; Movar followed it, got bounced, and — as a side effect of the bounce-loop protection — also stopped trying the shop's own, correct on-page language switcher. That switcher was separately going undetected because its link was labeled "UKR" in Latin letters, which language detection previously only recognized in the Cyrillic spelling "укр". Movar now recognizes the Latin label and will still try the shop's own switcher after a broken language link bounces, while still refusing to retry a link that bounces on its own.

## 1.4.0

### Minor Changes

- cc98c70: Reflect Movar's state in the browser toolbar icon instead of always showing the same static mark. The icon now shows distinct looks for: active, actively hiding content on the current page (with a count badge), paused, turned off, exempted for this site, and needing attention. It is driven by the same state the popup renders, so the two can never disagree.

### Patch Changes

- cc98c70: Let the popup's crash screen turn Movar off for the current site. The crash screen previously offered only a Reload button, leaving no way out if reloading didn't fix the crash short of digging through the browser's extension settings. It now offers "Turn off for this site" — and the exemption lasts only until Movar's next update, after which the site is automatically retried, so a since-fixed crash doesn't leave the site disabled forever. The popup's messaging distinguishes this temporary "off until update" state from a permanent exemption set in settings.
- cc98c70: Recolor the concealment curtain (the cover shown over hidden content) from a cool blue-grey palette onto the warm stone tones the rest of Movar uses, so it matches the tooltip and the product's other UI. Purely a color change — same layout and behavior.
- cc98c70: Stop Google's AI Mode chat from forcing a full page reload after every message. Google updates the page's URL after each chat turn without an actual navigation, and Movar mistook that URL change for a mistranslated search and hard-reloaded to correct it — interrupting the conversation. Movar now recognizes normal AI Mode chat activity and leaves it alone, reloading only when the page's language settings are genuinely wrong.
- cc98c70: Stop the MV3 service worker crashing on every page load. The background process crashed with an error on each navigation — surfacing an "Errors" badge in chrome://extensions — because the language-detection library touched the page's DOM from a background context that has none. It was most noticeable on sites where Movar doesn't otherwise act, since the console error was the only sign anything was wrong. Language detection behaves exactly as before.
- cc98c70: Rebuild the popup's crash screen to look like part of Movar. When the popup failed to render, it showed a cramped, broken-looking error panel with a wrapping heading and clipped text; it now shows the same brand bar as the rest of the popup, a muted "unexpected error" message, and a reload button, properly sized to fit.
- cc98c70: Compact the popup's language-priority display from a row of pills into one neutral text line (e.g. "Priority: Ukrainian › English"). The old pills always highlighted the first entry regardless of which language was actually active on the page, which read as a status indicator it wasn't; the plain line drops that false signal and frees up popup space.
- cc98c70: Remove the redundant "Movar" logo bar from the popup and most tabs of the macOS and iOS companion apps — it only repeated context the OS already shows (the toolbar icon just clicked, or the app's window title). The popup now opens straight onto the status view, and the affected screens gain back roughly 44–50px of space. The iOS app's About tab is unchanged.
- cc98c70: Fix dark-mode styling of the tooltip shown on a language-switcher link that survived filtering. In dark mode the tooltip card blended into the page background and its "Show hidden options" button rendered in light-mode colors, making it nearly invisible; it now has proper dark styling matching the rest of Movar's dark-mode UI.
- cc98c70: Unify text styling — font sizes, weights, spacing, and letter-spacing — across the extension and companion apps onto one shared type scale, replacing scattered one-off values. Nearly invisible day to day; the one visible change is the Safari host app's Settings tab, whose text sizes shift slightly to match the rest of the app.

## 1.3.0

### Minor Changes

- e3fea6a: Rewrite Google search URLs BEFORE the request leaves the browser, via a `declarativeNetRequest` dynamic redirect rule (Chrome/Firefox).

  The `/search` language rewrite (`hl`, pipe-joined `lr`, plus stripping Google's opaque session tokens `sei`/`gs_lcrp`/`aqs`/`rlz` and the enumerated `gs_*` family) previously ran only in the content script — after the raw entry request had already been served. That cost a visible double load on every omnibox/homepage search, and the raw request, carrying Chrome's pre-rewrite `gs_lcrp` context token, could seed the server-side "pinned candidate set" that intersects with the `lr` filter down to zero organic results. The new dynamic rule (id 2, generated from the same site-rule gates and regenerated on every settings/pause/snooze change like the Accept-Language rule) redirects the navigation network-side with `queryTransform`: one page load per search, and the poisoned request never reaches Google. The transform is idempotent (same-URL redirects are skipped, pinned by e2e), `/maps` and q-less URLs never match, and the content-script rewrite stays as the fallback for Safari (excluded: known `queryTransform` bugs), denied host permission, and prefix-scrubbing new `gs_*` tokens; the empty-SERP retry keeps covering pins seeded by vectors the rule can't see.

- 623abba: Pipe-join Google's `lr` parameter across every preferred language. A user whose priority is `[uk, en]` now ends up with `lr=lang_uk|lang_en` on `/search`, so results can come from either language. Previously only the top preference reached `lr`, which made English speakers with Ukrainian as their #1 lose every English result they'd otherwise expect.

  `hl` continues to take the top preference only — it's the UI + AI Overview language, a "pick one" knob.

  Adds an optional per-param `joinPreferences?: boolean` field to the `searchParams` strategy. The Google rule sets it on `lr`; `hl` keeps the existing single-value behaviour. Other rules (Bing `setlang`, DDG `kl`, YouTube `hl`/`gl`) are unchanged — none of them have a documented OR-join syntax.

  `applyStrategy` now accepts `LanguageCode | readonly LanguageCode[]` as its target; single-value callers (tests, the hreflang fallback) keep working unchanged.

  Policy assertion: the rewrite is driven only by the user's stored preferences (already `ru`-free via `enforceLockedLanguages`). Browser locale and inbound URL state — including a stale `hl=ru&lr=lang_ru` from a Google referrer — are overwritten, never inherited.

- b631c62: Make the Google SERP content filter actually hide Russian on the current layout, and extend it to "People also ask".

  The extractor matched only `div.g` / `div[data-snhf]`, which hit zero nodes on today's Google markup — so Russian organic results and the "Схожі запитання" (People also ask) questions leaked through unfiltered. Organic results are now found by a layout-stable anchor (each `#rso` result `<h3>` climbed to its enclosing `data-hveid` card) instead of obfuscated styling classes (`div.tF2Cxc`, …) that rotate and silently stop matching. No rotating-class fallbacks are kept — a stale fallback is just a deferred silent-miss; the fix for an uncovered layout is another reliable anchor. People-also-ask questions are filtered per row (`div.related-question-pair`), so a Russian question is hidden while a Ukrainian one in the same block stays. Nested result cards (sitelinks) collapse to the outermost container so a result is never hidden twice.

  The content filter now also runs on any `google.*` ccTLD (matched structurally on the SERP shape), not just a fixed seven-domain allowlist.

### Patch Changes

- 5447501: Center the content curtain's pill within the concealed card (both axes), and render the secondary "Hide all" action as borderless text so the hierarchy against the primary "Show" button reads more clearly. Tall blocks still top-anchor the pill so a viewport-collapsed block (e.g. Google's AI Overview) keeps the reveal control on screen.
- 523c2b3: Keep the conceal curtain over content a site streams in after it attaches (e.g. Google's AI Overview).

  A cover-mode curtain only blurred and made `inert` the children that existed at the moment it attached. Google's AI Overview declares its block early — so Movar can conceal it before the answer's language is even visible — then streams in its header, "show more" and the ⋮ overflow menu afterward. Those late nodes escaped the curtain: they stayed crisp and focusable on top of the overlay and occluded the curtain's own "Show" button. The curtain now watches its target with a `MutationObserver` and applies the same aria-hidden + inert + blur to any child added after attach (leaving its own host reachable, and disconnecting the observer on detach).

- 2c30a20: Collapse the content-hidden curtain to a single eye symbol at its smallest size. The cover pill's responsive collapse gains a floor tier: on a target too small for even the icon plus one action (short and ≤132px wide), it folds down to just the slashed-eye mark, so a tiny concealed element still shows a clear "hidden" marker instead of an overflowing or clipped pill.
- d77acbd: Make the "content hidden" curtain responsive so it works over inline and short targets, not just roomy block cards.

  Cover mode positioned the curtain with `position:absolute; inset:0` and clipped it with `overflow:hidden`, which only works when the target is a block box. Over a bare `display:inline` target the overlay got a 0-width containing block (and `overflow` is a no-op on inline boxes), so the pill escaped its target; over short block rows (e.g. Google's «Схожі запитання» / "People also ask") the fixed-height vertical pill overflowed and several pills piled into one strip. Inline targets are now promoted to `inline-block` so the overlay has a content-sized box to fill and clip (kept inline in the flow, host still a child of the target), and the pill is a size-query container that collapses to a single-line bar — shedding the description, then the secondary action, then the title — as the target gets short or narrow.

- 5447501: Keep the content curtain's "Show" reveal action reachable as the pill collapses on short or narrow cards. "Show" is now the pill's primary action, so it survives the responsive collapse (which sheds the secondary "Hide all" first) instead of being dropped alongside it at the very first step — previously a short or narrow concealed card could end up blurred with no in-place way to reveal it.
- 2fafb56: Keep the conceal curtain's reveal control visible on tall blocks (e.g. Google's AI Overview).

  The cover curtain centered its reveal pill in the target's box. Sites collapse tall blocks to a short preview — Google's AI Overview shows about one screenful with a "show more" while the concealed element stays 700–1300px tall in the DOM — so the centered pill landed in the collapsed-away region and was clipped out of view. The result was blurred content with no reachable "Show" control at any scroll position. The pill is now anchored to the top of the block, keeping it in the visible band regardless of the block's full height. (Complements the short/inline-target responsiveness added alongside it.)

- 235ee2f: Stop a `lang`-declared Google result (product/shopping cards, whose title is a `role="heading"` div, not an `<h3>`) from surviving on leaked interface-language chrome. These cards are recovered by Google's own per-result `lang` label and folded into the organic bucket — but they were still run through the whole-card fallback that widens the classification sample when the title+snippet allow-list comes up short, and that fallback re-admits Google's Ukrainian UI chrome (the "Люди також шукають" pivots, the store-review prompt, the rich-annotation row). A confident interface-language read then overrode the reliable `lang="ru"` declaration and the card was kept.

  Two live shapes triggered it, both because the allow-list under-captures the result's own text: an inline thumbnail row occupies `data-sncf="1"` (the snippet's usual slot) and shifts the Russian snippet to `data-sncf="2"` — which the fallback prunes as "chrome" — so the sample became pure chrome; and a short snippet (under the fallback's min-chars bar) let the pivots outweigh it. Both classified as Ukrainian and the `ru` card slipped through.

  Declared cards now classify from their title+snippet allow-list ALONE, with no whole-card fallback — the same rule sponsored ads and AI-source cards already follow, and the behaviour the module already documented as its intent. When the allow-list is empty or short, the card falls to its `lang` declaration (which the fused gate decides on), never to leaked chrome; a card whose snippet the allow-list does capture still corrects a genuine mislabel via that text.

- 479e616: Add the empty-SERP detect-and-retry fallback for Google (docs/google-search-url-params.md, finding #1). A poisoned omnibox entry request (opaque `gs_lcrp` token, served before the rewrite can redirect away) can pin Google's server-side session so that even a fully cleaned URL with correct `hl`/`lr` intersects down to zero organic results for a short hot window — URL stripping (`sei`, `gs_lcrp`, the `gs_*` scrub tier) cannot reach that state. The content runtime now detects the residual case after the page settles — filter param `lr` present, `#search` results area rendered, zero `a h3` organic titles (a DOM count, no localized "About 0 results" parsing) — and retries the same query exactly once without `lr`, keeping `hl` so the interface language holds. The retry is once-per-URL via the session-scoped loop guard: the empty URL is marked so it never re-retries (a legitimately-empty query stays put — the retry itself is the test), and the retried URL is pre-marked so the enforce rewrite doesn't re-add `lr` and bounce back. Each retry logs a `search-retry` correction event, visible in the options Insights dashboard.
- b5688fa: Add a second, non-navigating "scrub" tier to the `searchParams` strategy and use it on the Google rule: `scrubPrefixes: ['gs_']` and `scrubParams: ['aqs', 'rlz']` are dropped whenever a rewrite navigation is already happening, but — unlike `stripParams` — never trigger a navigation by themselves. Entry URLs (omnibox, homepage form) never carry `lr`, so they always rewrite and always get scrubbed; SERP-box refinements that carry `gs_lp` with `hl`/`lr` already correct stay put, costing zero extra page loads. This future-proofs against the bug class behind the `sei` and `gs_lcrp` fixes (opaque pre-rewrite session tokens pinning results against the `lr` filter) without an allowlist's silent-breakage risk. Audit, live-test evidence, and the vetting method are documented in docs/google-search-url-params.md.
- 03e0b3a: Fix content filtering (concealment) silently not working on iOS/Safari.

  The dynamic capability chunks the content script imports at runtime via `runtime.getURL` — `features/conceal.js`, `features/curtain-ui.js`, and the per-site `models/*.js` — were emitted into the Safari build output and rsynced onto disk, but `features/` and `models/` were never registered as folder references in `Movar.xcodeproj`. Xcode only bundles referenced folders, so both directories were dropped from the built `.appex`: on-device, `import(runtime.getURL('features/conceal.js'))` 404'd and `capability-loader`'s `.catch(() => null)` turned it into a silent no-op, leaving concealment dead on iOS while the Accept-Language language switch (a background DNR rule, not a content-script chunk) kept working. Register `features/` and `models/` as folder references in both extension targets, and add a post-sync guard to `sync-safari-resources.mts` that fails the build if any emitted output directory lacks a folder reference, so the drift can't recur unnoticed.

- 275aa1f: Fix the macOS wrapper app opening at a too-small, non-resizable window.

  The Safari host app's macOS window used the stock Apple extension-template geometry — a fixed 425×350 content rect with a `titled + closable` style mask — so the three-tab host UI (fixed top brand bar, scrolling Settings panel, fixed bottom tab bar) was clipped, and the window could be neither resized nor minimised. Enlarge the default to 480×700 and add `resizable` + `miniaturizable` to the window style mask in `Main.storyboard`; pin `contentMinSize` to 380×480 in `ViewController.viewWillAppear()` so a resize can't shrink it below usability. macOS-only (`#if os(macOS)`); iOS is unaffected. The window keeps `restorable="NO"` with no frame-autosave, so it opens at the new size on every launch.

- eba3490: Strip Google's `gs_lcrp` query parameter on `/search` URL rewrites, alongside the existing `sei` strip. `gs_lcrp` is an opaque per-omnibox-session context blob Chrome attaches before this rewrite runs; left in place, it pinned Google's serving to a candidate set computed under the pre-rewrite (often Russian-leaning) language context, and intersecting that pinned set with the `lr` filter could produce zero organic results for an otherwise healthy query. Confirmed by direct testing: removing only `gs_lcrp` took one affected query ("Реле напруги") from 0 results to ~1M, with `hl`/`lr` unchanged.

  Previously this looked like a language-classifier gap and was documented as an accepted trade-off; it wasn't — `lr=lang_uk` and even the joined `lr=lang_uk|lang_en` both return results once `gs_lcrp` is gone.

- Updated dependencies [4a87fd1]
- Updated dependencies [623abba]
- Updated dependencies [623abba]
  - @movar/page-content@0.0.1
  - @movar/host-match@0.1.0
