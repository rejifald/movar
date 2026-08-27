//
//  DetectorView.swift
//  Shared (App)
//
//  The Detector tab, in SwiftUI — a closed-set match, shown as one.
//

import SwiftUI
#if os(macOS)
// Explicit, not leaned on: SwiftUI re-exports AppKit through some SDKs and not
// others, and a missing import of that kind type-checks clean and fails the real
// Xcode build — which is how a broken main shipped at #512.
import AppKit
#endif

/// Language names, resolved once against the locale the BUNDLE settled on.
///
/// `Locale.current` is the wrong source here for the reason `HostStrings`
/// records: a device set to a language the app does not ship falls back to the
/// development region, and names resolved from `Locale.current` would then be in
/// a language the screen around them is not written in.
enum LanguageNames {

    private static let uiLocale = Locale(identifier: HostStrings.resolvedLocale)

    /// The language's name in the reader's language, capitalised.
    ///
    /// Capitalised because several locales — Ukrainian among them — return these
    /// lower-case, and a row that reads "українська" under a row that reads
    /// "Russian" looks like a bug rather than a convention.
    static func display(_ code: String) -> String {
        capitalized(uiLocale.localizedString(forLanguageCode: code) ?? code)
    }

    /// The language's name in ITS OWN language.
    static func endonym(_ code: String) -> String {
        capitalized(Locale(identifier: code).localizedString(forLanguageCode: code) ?? code)
    }

    /// Orders two codes by the name the reader sees, in the reader's language.
    ///
    /// `localizedStandardCompare` would sort by `Locale.current`, which is the
    /// device's — and this type exists precisely because that is not the locale
    /// the screen is written in.
    static func precedes(_ lhs: String, _ rhs: String) -> Bool {
        display(lhs).compare(
            display(rhs),
            options: [],
            range: nil,
            locale: uiLocale) == .orderedAscending
    }

    private static func capitalized(_ value: String) -> String {
        guard let first = value.first else { return value }
        return String(first).uppercased() + value.dropFirst()
    }
}

/// The Detector: paste text, get the closest of a set you control.
///
/// THE SCREEN IS BUILT AROUND ONE FACT — this is a **closed-set match**, not
/// language identification. `classifyBySnippet` scores candidates against each
/// other and can never name a language outside the set it was handed. The React
/// tab this replaces obscured that twice over: the candidate set was hardcoded
/// and invisible, and the empty verdict read "No Cyrillic language found here",
/// which is a statement about the text when the only supportable statement was
/// about three candidates failing to separate.
///
/// Three things carry the correction, and none of them is a paragraph:
///
/// 1. **The roster is stated above the input**, not below the answer. A reader
///    sees the set before they are asked for text, because the set is a
///    precondition of the question rather than a footnote to the reply.
/// 2. **The verdict states its own scope** — "Closest of 3 · distinctive
///    letters" — so the answer is never separated from the comparison that
///    produced it.
/// 3. **The evidence shows what counted for nobody.** langtell credits a signal
///    only to a sole owner, so `і` — Ukrainian AND Belarusian — scores for
///    neither. Without that row a reader sees `і` in their own text, no `і` in
///    the Ukrainian evidence, and concludes the tool is broken.
///
/// And the roster is editable IN PLACE, which is what turns all of the above
/// from a claim into something a person can check: narrow it to one language,
/// without leaving the screen, and the same text starts matching by default —
/// which the result says out loud.
///
/// Appearance is stock, per `docs/native-shells.md` — `List`, `Section`,
/// `DisclosureGroup`, the platform type ramp, SF Symbols, one accent applied at
/// the root. Nothing here restyles a container or ships a font.
struct DetectorView: View {

    @ObservedObject var model: DetectorModel

    /// Whether the roster is open for editing.
    ///
    /// Collapsed at rest, because the set is a precondition to READ on every
    /// visit and only occasionally one to change.
    @State private var isRosterExpanded = false
#if os(macOS)
    /// Owned here, not by the `DisclosureGroup`s, because `explainerFooter` sizes
    /// itself from whether either is open.
    @State private var isHowExpanded = false
    @State private var isLimitsExpanded = false
#endif

    /// What a finished run's outcome is tagged with, so pressing Detect can bring
    /// it into view.
    private static let outcomeAnchor = "detector.outcome"

    /// The height of the invisible row that ends the input section, and the whole
    /// reason it exists.
    ///
    /// `scrollTo` aligns a ROW's top with the top of the safe area, correctly — but a
    /// `Section`'s header renders ABOVE its rows, so aiming the scroll at the outcome
    /// puts its "Результат" heading behind the navigation bar no matter what the
    /// section does internally. Padding the header does not help: the padding is
    /// absorbed above the viewport with it.
    ///
    /// Two other levers were tried and do not work. A fractional anchor is ignored —
    /// `List` bridges to UIKit's discrete top/middle/bottom, so 0.06 and 0.5 scroll
    /// to the same place. A standalone spacer `Section` overshot by 110pt, because an
    /// inset-grouped section brings its own padding.
    ///
    /// What is left is to put the scroll target in the PRECEDING section, so what
    /// comes to rest under the bar is this row and everything the reader wants —
    /// heading included — sits below it. 1pt, because the section gap that follows
    /// supplies the visible clearance; this row only has to be a row.
    private static let outcomeClearance: CGFloat = 1

    /// How a roster edit moves the screen.
    ///
    /// Nothing inside the editor changes size any more — that is the point of
    /// the static label and the unconditional floor line. What still moves, and
    /// should, is everything BELOW: a candidate added is a candidate added to
    /// the evidence, and watching the verdict answer for the new set is what
    /// the editor is for. Animated, that reads as the consequence of the tap;
    /// unanimated it is a snap, indistinguishable from the jump this change
    /// removes.
    private static let rosterChange = Animation.easeInOut(duration: 0.2)

    var body: some View {
#if os(macOS)
        macBody
#else
        phoneBody
#endif
    }

    /// One column, because a phone has one column.
    ///
    /// Unchanged by the macOS split below — it is still what iOS and iPadOS run,
    /// scroll-into-view machinery and pinned action bar included.
    private var phoneBody: some View {
        ScrollViewReader { proxy in
            List {
                rosterSection
                inputSection
                if model.isUnavailable { unavailableSection }
                if let result = model.result {
                    reportSection(result)
                }
                explainerSection
            }
            .movarListStyle()
            // Pressing Detect brings the outcome into view. On a phone the verdict
            // lands below the fold — under the roster, its explainer and a box
            // that has just grown to fit whatever was pasted — so the answer to the
            // one question this screen asks arrives off screen and the press reads
            // as having done nothing.
            //
            // Keyed on `outcomeRevision`, not on `result`; see that property for
            // why an `Equatable` outcome is the wrong signal here.
            //
            // The anchor rides whichever section the run produced. The two are
            // mutually exclusive — a verdict clears `isUnavailable` and a failure
            // clears `result` — so the id is never claimed twice.
            //
            .onChange(of: model.outcomeRevision) { _ in
                withAnimation { proxy.scrollTo(Self.outcomeAnchor, anchor: .top) }
            }
            // The outcome arrives from the engine, on its own beat, so a
            // `withAnimation` around the tap that asked for it has long since
            // committed. Keyed on the same counter the scroll uses.
            .movarAnimated(Self.rosterChange, value: model.outcomeRevision)
        }
        // Pinned below the list for the same reason as the Audit composer's run
        // button: a filled button inside a grouped row draws its own fill and
        // inset over the row's. Both composers use the one bar so the two tabs
        // cannot drift apart.
        .movarActionBar {
            MovarCallToAction(HostStrings.detectorDetect) {
                model.run()
            }
            .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .movarNavigationContainer(HostStrings.detectorTitle)
        // A language added on the Settings tab has to reach the roster
        // before it is next read, and switching back here is when that happens.
        .onAppear { model.refreshDerivedRoster() }
    }

#if os(macOS)

    // MARK: - The Mac layout

    /// On macOS the input is a PANE, not a row, and the answer sits beside it.
    ///
    /// The phone body rendered in a window was the defect this replaces. The
    /// window opened 480pt wide — phone-shaped — so a column that is right on a
    /// phone became a column stranded in a window: content stopping two thirds of
    /// the way down 700pt of height, a full-width call to action pinned to the
    /// bottom edge the way iOS pins one within thumb reach, and the roster's own
    /// footer clipped mid-sentence for want of width that was sitting unused
    /// beside it.
    ///
    /// `docs/native-shells.md` asks for each platform's canonical appearance and
    /// says drift between platforms is the deliverable rather than a defect. What
    /// a Mac utility does with an input and a verdict is put them side by side, so
    /// the answer stays on screen while the text is edited — which is the same
    /// argument the roster already wins on the phone by sitting ABOVE the box
    /// rather than under the answer. `HSplitView` rather than a fixed `HStack`
    /// because the divider is then the platform's own and the proportions are the
    /// reader's to set.
    ///
    /// The sections are UNCHANGED: `rosterSection`, `unavailableSection`,
    /// `reportSection` and `explainerSection` are the same `Section`s the phone
    /// builds, in the same order, in a `List` that is now a rail rather than the
    /// whole screen. Only the input leaves the list, and the scroll-into-view
    /// machinery leaves with it — there is nothing to scroll to when the verdict
    /// never leaves the viewport.
    private var macBody: some View {
        HSplitView {
            inputPane
                // NO `idealWidth`, because `HSplitView` does not read one.
                // This pane asked for 560 and the rail for 400, and what shipped
                // at every launch was ~475/465 — near half and half, the one
                // proportion this split exists NOT to be. Raising and lowering
                // the ideals moved nothing; `minWidth` and `maxWidth` are the
                // only constraints that reach `NSSplitView`, so the asymmetry
                // has to be said with those. It is said on the RAIL (below),
                // which is the pane with an answer to fit rather than a document
                // to hold, and this one simply takes what is left.
                .frame(minWidth: 340, maxWidth: .infinity)
            // A `GeometryReader` because the explainers pinned to the rail's
            // foot cannot be capped correctly without knowing what there is to
            // cap against; see `explainerCeiling`. The rail itself is a function
            // rather than the reader's body so the sections below keep their own
            // indentation rather than gaining a level to a measurement.
            GeometryReader { rail in
                railPane(height: rail.size.height)
            }
            // A roster edit still re-runs the detector, and the rail still
            // resizes to the new answer; see `rosterChange`.
            .movarAnimated(Self.rosterChange, value: model.outcomeRevision)
            // A CEILING, not an ideal — see `inputPane`. 400 is the width the
            // rail was always meant to have; as a `maxWidth` it is the width it
            // actually gets, and the box beside it takes the rest. The reader
            // keeps the divider between 320 and 400: narrower than the range
            // before this, and the price of the split reading as a workbench
            // with a rail rather than as two equal columns.
            .frame(minWidth: 320, maxWidth: 400)
        }
        // macOS's control ramp is tighter than the phone's, and at this window
        // size that reads as undersized rather than as native. `.large` is the
        // platform's OWN size class, so the controls grow without anything here
        // overriding the type ramp `docs/native-shells.md` adopts.
        .movarActionSize()
        // A language added on the Settings tab has to reach the roster before it
        // is next read, and switching back here is when that happens.
        .onAppear { model.refreshDerivedRoster() }
    }

    /// The right pane: the roster, whatever answer there is, and the explainers
    /// pinned under them.
    ///
    /// Takes its own height because {@link explainerCeiling} needs it — the
    /// block at the foot is capped against what is above it, and "what is above
    /// it" is only knowable here.
    private func railPane(height: CGFloat) -> some View {
        VStack(spacing: 0) {
            List {
                rosterSection
                if model.isUnavailable { unavailableSection }
                if let result = model.result {
                    reportSection(result)
                }
            }
            .movarListStyle()
            // `InsetListStyle` reserves ~20pt above its first section header —
            // right when the list IS the window, wrong beside a pane whose own
            // content starts at the top edge, where it reads as an unexplained
            // band rather than as breathing room. On the LIST rather than the
            // stack around it: the stack's other child is the pinned footer, and
            // pulling that up would lift it off the floor it exists to sit on.
            .padding(.top, -14)
            Divider()
            explainerFooter(ceiling: explainerCeiling(railHeight: height))
        }
    }

    /// The left pane: the box, the promise the screen makes about it, and the
    /// button that runs it.
    ///
    /// The button is the window's DEFAULT action, so Return runs the detector —
    /// what a Mac reader reaches for before the mouse. It sits on the input's own
    /// baseline rather than in a bar across the window's foot: a bar is how iOS
    /// keeps an action within thumb reach, and there is no thumb here.
    ///
    /// `detector.intro` is rendered here for the first time. It was defined in
    /// both locales and never shown — the phone body has no line to spare for it,
    /// and the roster's own footer was already carrying the cost argument. It is
    /// the standing promise about the text ("nothing is sent anywhere"), so a pane
    /// wide enough to keep it beside the box it describes is where it belongs.
    private var inputPane: some View {
        VStack(alignment: .leading, spacing: 10) {
            ZStack(alignment: .topLeading) {
                if model.text.isEmpty {
                    Text(HostStrings.detectorPlaceholder)
                        .foregroundColor(.secondary)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .accessibilityHidden(true)
                }
                // The editor keeps its own background here, unlike the phone's
                // row where the ROW is the surface. A pane has no row under it,
                // so the box has to read as a box on its own.
                TextEditor(text: $model.text)
            }
            // The box's inner margin, and it has to be applied HERE — between
            // the editor and the border — because `TextEditor` has no text
            // inset of its own to set: its glyphs start about 5pt in and 8pt
            // down from its frame, which against a border of its own reads as
            // text pressed into the corner. Padding the stack and stroking the
            // PADDED frame is what puts the margin inside the box rather than
            // around it, and it lands the first glyph ~12pt from either edge.
            //
            // The placeholder above keeps its own smaller offsets: it is inside
            // this same padded stack, so it inherits the margin and only has to
            // make up the difference to sit on the editor's first line.
            // 16pt to the first glyph on either edge, and the two numbers
            // differ because what they are correcting differs. AppKit gives the
            // editor no margin: `textContainerInset` is (0, 0), and the ~5pt of
            // apparent leading is `NSTextContainer.lineFragmentPadding`, a
            // typesetting default rather than spacing. So 11 + that 5 across,
            // and 8 + the first line's own 8 down.
            //
            // A chosen value, not a cited one. `docs/native-shells.md` keeps
            // `@movar/theme`'s spacing scale off native — the platform owns
            // these — but the platform's answer here is zero, and Apple
            // publishes no inset for a text view. So this is calibrated against
            // native text surfaces by eye, which is the only thing left.
            .padding(.horizontal, 11)
            .padding(.vertical, 8)
            // The margin has to be part of the BOX, not a gap around it.
            // `TextEditor` paints its own opaque backdrop, so padding it inward
            // left the container showing through between the border and the
            // editor's white — a second, square-cornered box inset inside the
            // rounded one. Filling the padded frame with the same surface the
            // editor uses closes that seam: one box, with the margin inside it.
            //
            // `NSColor.textBackgroundColor` because it IS the editor's own
            // colour and follows the appearance; a hand-picked white would be
            // the restyling `docs/native-shells.md` rules out, and would be
            // wrong in dark mode besides.
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(NSColor.textBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color.primary.opacity(0.15), lineWidth: 1)
            )
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(HostStrings.detectorIntro)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                Button(HostStrings.detectorDetect) {
                    model.run()
                }
                // A PLAIN button carrying `.defaultAction` renders as AppKit's
                // default push button, which paints itself in the SYSTEM accent
                // and ignores the root `.tint` — so the one control this pane
                // exists to offer came out macOS blue rather than Forest green.
                // `.borderedProminent` is the style the tint actually reaches.
                .movarProminentButtonStyle()
                .keyboardShortcut(.defaultAction)
                .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        // The 4 that used to be here was priced against `TabView`'s own bezel —
        // "a uniform 16 stacked onto that inset read as a band of dead space
        // between the tabs and the box". THAT INSET IS GONE: the macOS shell has
        // been a `VStack` + segmented `Picker` + `Divider` since the tab strip
        // was swapped (see `MovarRootView.macShell`), so what 4 buys now is a box
        // sitting 8pt under a hairline while holding 14 from the window's own
        // edge — tight against the one boundary it shares with the tab strip.
        //
        // 10 lands the box's border ~14pt below the divider, which is both the
        // side margin and where the rail's first section header sits after its
        // own correction — so the two panes start on the same line.
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 14)
    }

#endif

    // MARK: - The roster

    /// The set the detector chooses from, above the box you type into — and the
    /// editor for it, in the same place.
    ///
    /// The order matters more than the styling. A closed-set answer is not
    /// interpretable without its set, so putting the set after the verdict would
    /// reproduce the original defect in a nicer font.
    ///
    /// A `DisclosureGroup` rather than the row-into-a-sheet this replaces. The
    /// sheet was a faithful copy of what comparable apps do for a LONG
    /// catalogue — Airbnb's "Languages you speak" opens a searchable modal over
    /// a hundred entries — but this catalogue is five codes, and a modal over
    /// five rows puts a presentation, a title bar and a Done button between a
    /// reader and a claim the screen made two lines earlier. Collapsed, this is
    /// the same one-line statement as before; open, it is the editor, with the
    /// verdict still on screen beneath it. It is also the widget the two
    /// explainers at the foot of this tab already use.
    private var rosterSection: some View {
        Section {
            DisclosureGroup(isExpanded: $isRosterExpanded) {
                ForEach(rosterRows, id: \.self) { code in
                    rosterRow(code)
                }
                // Said whether or not the floor is in force. Conditional, its
                // arrival inserted a row and shoved the button below it — the
                // same defect as a label that resizes itself, and reached by
                // the same tap.
                Text(HostStrings.detectorRosterLast)
                    .font(.footnote)
                    .foregroundColor(.secondary)
                Button(HostStrings.detectorRosterReset) {
                    withAnimation(Self.rosterChange) { model.resetRoster() }
                }
                .movarRowButtonStyle()
                // Off while the roster IS the settings' — not while it merely
                // equals them. Editing back to the same set is still a choice,
                // and reset is what hands tracking back.
                .disabled(model.isDerived)
            } label: {
                // Collapsed, the roster read as a sentence — the statement this
                // row exists to make. Open, a title that does not move: see
                // `HostStrings.detectorRosterLabel`.
                Text(isRosterExpanded ? HostStrings.detectorRosterLabel : rosterSummary)
            }
        } header: {
            Text(HostStrings.detectorAmong)
        } footer: {
#if os(iOS)
            movarUnhyphenated(HostStrings.detectorAmongFooter)
#else
            EmptyView()
#endif
        }
    }

    /// Every code the editor offers, in ONE FIXED ORDER that membership does
    /// not disturb.
    ///
    /// ONE LIST, NOT TWO. The sheet split these under "In the comparison" and
    /// "Not compared" headers, which is the shape a ⊖-over-⊕ editor needs and
    /// one that no comparable picker uses — Wispr Flow, Airbnb and Apple's own
    /// language list all put every entry in a single list and let a checkmark
    /// carry membership.
    ///
    /// AND ORDERED BY NAME, not by membership. Listing the roster first and the
    /// rest after reads well until someone taps: the row they just touched
    /// jumps out from under their finger to the far end of the list, and a
    /// second tap to undo lands on whatever slid up to take its place. A picker
    /// whose order is a function of its own state cannot be tapped twice in a
    /// row. Sorted by the displayed name, a tap changes exactly one thing — the
    /// checkmark — and the roster's own meaningful order (preferred first, then
    /// the ones Movar hides) is still stated in full on the line above.
    ///
    /// The union, not the catalogue: a roster restored from storage can hold a
    /// code this build's catalogue has not listed, and dropping it here would
    /// leave a language named in the summary with no row to remove it by.
    private var rosterRows: [String] {
        let catalogue = model.catalogue
        let unlisted = model.roster.filter { !catalogue.contains($0) }
        return (catalogue + unlisted).sorted { LanguageNames.precedes($0, $1) }
    }

    /// One catalogue language, on the list or off it.
    ///
    /// THE WHOLE ROW IS THE CONTROL, which is what lets the checkmark be a
    /// checkmark instead of the ⊕/⊖ buttons the sheet needed — each of which
    /// carried its own hit target and its own accessible name beside a label
    /// that already said the language.
    ///
    /// The mark is TRAILING, where iOS puts selection in a list. A leading one
    /// would rhyme with the evidence section's leading `checkmark.circle.fill`,
    /// which means "won" rather than "in the set".
    private func rosterRow(_ code: String) -> some View {
        let isIn = model.roster.contains(code)
        // The last language standing has nowhere to toggle to: removing it would
        // leave the detector with nothing to compare against.
        let isLocked = isIn && !model.canRemove
        return Button {
            withAnimation(Self.rosterChange) {
                if isIn { model.remove(code) } else { model.add(code) }
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                // EVERY colour here is explicit, including the one that looks
                // like a default. A `Button` label in a `List` inherits the
                // accent tint on iOS, so an unstated colour paints the language
                // names green and the roster reads as five links; and an
                // explicit colour in turn outranks the dimming `.disabled`
                // applies, so the locked row has to name its own grey rather
                // than inherit one.
                Text(LanguageNames.display(code))
                    .foregroundColor(isIn && !isLocked ? .primary : .secondary)
                Text(code)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer(minLength: 8)
                if isIn {
                    Image(systemName: "checkmark")
                        .font(.footnote.weight(.semibold))
                        .foregroundColor(isLocked ? .secondary : .accentColor)
                }
            }
            .contentShape(Rectangle())
        }
        .movarRowButtonStyle()
        .disabled(isLocked)
        // Membership is a STATE, not part of the name: VoiceOver announces the
        // trait itself, so the label stays "Ukrainian, uk" whichever side of the
        // list the row is on.
        .accessibilityAddTraits(isIn ? .isSelected : [])
        .accessibilityHint(rosterRowHint(code, isIn: isIn, isLocked: isLocked))
    }

    /// What tapping the row would do — empty for the row that cannot move.
    private func rosterRowHint(_ code: String, isIn: Bool, isLocked: Bool) -> String {
        guard !isLocked else { return "" }
        let name = LanguageNames.display(code)
        return isIn
            ? HostStrings.detectorRosterRemove(name)
            : HostStrings.detectorRosterAdd(name)
    }

    /// The roster as one line — "Ukrainian, Russian, Belarusian".
    ///
    /// Named in full rather than counted. "3 languages" would make the reader
    /// open the editor to learn the one thing the row exists to tell them, and
    /// the list is short by construction: the catalogue holds five codes.
    private var rosterSummary: String {
        // Closure rather than the `LanguageNames.display` method reference, for
        // the actor-isolation reason `DetectorModel`'s decoder records.
        model.roster.map { LanguageNames.display($0) }.joined(separator: ", ")
    }

    // MARK: - Input

    private var inputSection: some View {
        Section {
            // `TextEditor` has no placeholder of its own at this OS floor, so
            // one is laid behind it and hidden as soon as there is text.
            ZStack(alignment: .topLeading) {
                if model.text.isEmpty {
                    Text(HostStrings.detectorPlaceholder)
                        .foregroundColor(.secondary)
                        .padding(.top, 8)
                        .padding(.leading, 5)
                        .accessibilityHidden(true)
                }
                TextEditor(text: $model.text)
                    .frame(minHeight: 96)
                    // The editor draws its own background, which sits on the
                    // row's fill as a slightly different shade on both
                    // platforms. Clearing it lets the row be the surface.
                    .movarClearTextEditorBackground()
            }
        } footer: {
            // THE SCROLL STOP — see `outcomeClearance`. A footer, not a row: a row
            // joins the input card, squares off its rounded bottom and leaves a dead
            // strip inside it, while a footer renders in the gap BETWEEN cards where
            // an invisible 1pt view costs nothing.
            Color.clear
                .frame(height: Self.outcomeClearance)
                .accessibilityHidden(true)
                .id(Self.outcomeAnchor)
        }
    }

    private var unavailableSection: some View {
        Section {
            Label(HostStrings.detectorUnavailable, systemImage: "exclamationmark.triangle")
                .foregroundColor(.secondary)
        }
    }

    // MARK: - The verdict

    /// The outcome, as ONE card: the verdict, then the evidence that produced it.
    ///
    /// Two sections became one because they were always one document. Split, the
    /// screen asked a reader to carry "Білоруська" across a section gap to reach
    /// what gave it away — and a gap under a heading promises a new subject. It is
    /// not a new subject: a closed-set verdict cannot be read apart from the
    /// comparison that produced it, which is the same reason the roster sits above
    /// the input instead of under the answer.
    ///
    /// The verdict takes its prominence from type and the accent, never from a
    /// container. `.title2` over the `.body` rows beneath it, the language name in
    /// the accent, and a filled `checkmark.seal` beside it. `docs/native-shells.md`
    /// rules out a tinted or otherwise restyled row, and is right to: the emphasis
    /// has to survive Dynamic Type and both colour schemes, which a hand-painted
    /// fill would not.
    ///
    /// `detector.evidence` survives as a caption row rather than a second header.
    /// It still has to be said — unlabelled, the candidate rows read as a list of
    /// languages instead of as each candidate's account of itself.
    private func reportSection(_ result: DetectResult) -> some View {
        Section {
            verdictRow(result)

            if let language = result.language, result.isForced {
                forcedBanner(language)
            }

            Text(HostStrings.detectorEvidence)
                .font(.footnote)
                .foregroundColor(.secondary)

            ForEach(result.rankedEvidence) { entry in
                candidateRow(entry, isWinner: entry.code == result.language)
            }

            if !result.sharedLetters.isEmpty || !result.sharedWords.isEmpty {
                sharedRow(result)
            }
        } header: {
            Text(HostStrings.detectorResult)
        }
    }

    /// The answer itself — or the honest absence of one.
    ///
    /// **The seal and the accent stand down when the verdict was forced.** Both
    /// say the same thing — this is a match — and with one candidate in scope
    /// there was nothing to match against: `forcedBanner` is about to say so in
    /// orange, directly beneath. Marking that verdict in the accent and sealing it
    /// puts a confident claim immediately above its own retraction, which is worse
    /// than the unemphasised verdict this screen showed before. Size is kept
    /// either way: the verdict is still what the screen is for, and `.title2` is
    /// prominence without assertion.
    /// The verdict's step on the type ramp — one step apart per platform, so the
    /// verdict lands at the SAME SIZE on both.
    ///
    /// The ramps are not the same ramp. `.title2` is 22pt on iOS and 17pt on
    /// macOS; `.title` is 28 and 22. So the single `.title2` that #540 chose for
    /// the phone silently shrank the verdict by a quarter in a window — the one
    /// thing the screen exists to say, reading smaller than it does on a phone
    /// held at arm's length.
    ///
    /// Taking `.title` on macOS is not an override of the ramp: it is a different
    /// STEP of it, which is what `docs/native-shells.md` asks for when it says to
    /// use the platform type ramp. The rule #540 states — prominence from type
    /// and the accent, never from a container — is unchanged, and so is the
    /// seal's proportion to the name beside it.
#if os(macOS)
    private static let verdictFont: Font = .title
    private static let verdictSealFont: Font = .title2
#else
    private static let verdictFont: Font = .title2
    private static let verdictSealFont: Font = .title3
#endif

    @ViewBuilder
    private func verdictRow(_ result: DetectResult) -> some View {
        if let language = result.language {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if !result.isForced {
                        Image(systemName: "checkmark.seal.fill")
                            .font(Self.verdictSealFont)
                            .foregroundColor(.accentColor)
                            .accessibilityHidden(true)
                    }
                    Text(LanguageNames.display(language))
                        .font(Self.verdictFont)
                        .fontWeight(.semibold)
                        .foregroundColor(result.isForced ? .primary : .accentColor)
                    Text(language)
                        .font(.system(.footnote, design: .monospaced))
                        .foregroundColor(.secondary)
                    Spacer(minLength: 0)
                }

                // The scope, inseparable from the answer: how many
                // candidates it beat, and what decided.
                Text(scopeLine(result))
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                let endonym = LanguageNames.endonym(language)
                if endonym.lowercased() != LanguageNames.display(language).lowercased() {
                    Text("\(HostStrings.detectorNativeName): \(endonym)")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 2)
            // Read as one statement. Split across four elements VoiceOver
            // announces the language, then a number, then a rung name, with
            // no indication they are one sentence about one verdict.
            .accessibilityElement(children: .combine)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Text(HostStrings.detectorNoMatch)
                    .font(.headline)
                Text(HostStrings.detectorNoMatchHelp)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        }
    }

    /// "Closest of 3 · distinctive letters".
    ///
    /// Counts the SCOPED candidates, not the roster: script scoping is what the
    /// classifier actually compared, and saying "closest of 4" because English
    /// was on the list would overstate the comparison by one.
    private func scopeLine(_ result: DetectResult) -> String {
        HostStrings.detectorScope(
            count: max(result.scoped.count, 1),
            rung: HostStrings.detectorRung(result.rung ?? "1"))
    }

    /// The `discriminating: false` banner — the verdict was forced.
    ///
    /// This is the screen's most important state and the one the React tab never
    /// rendered at all, despite `SnippetVerdict` having carried the flag the
    /// whole time. With one candidate in scope there is nothing to lose to, so
    /// every text in that alphabet "matches". Shown as a caution rather than an
    /// error because nothing went wrong — the question was simply narrower than
    /// the reader probably meant.
    private func forcedBanner(_ language: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // Weight folded into the `Font` rather than applied as
            // `.fontWeight`: the standalone modifier is macOS 13 on a View, and
            // this is a `Label`, not a `Text` (where it has been available all
            // along). `Font.weight` reaches back to the app's floor.
            Label(HostStrings.detectorForcedTitle, systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.orange)
            Text(HostStrings.detectorForcedBody(LanguageNames.display(language)))
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Evidence

    /// One candidate's account of itself — including the ones that lost.
    ///
    /// A losing candidate is rendered rather than filtered out, which the React
    /// version did not do. In a closed-set comparison "Belarusian had nothing"
    /// is half the reason the winner won, and a report that shows only the
    /// winner has quietly become a report about the text again.
    private func candidateRow(_ entry: CandidateEvidence, isWinner: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if isWinner {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.footnote)
                        .foregroundColor(.accentColor)
                        .accessibilityHidden(true)
                }
                Text(LanguageNames.display(entry.code))
                    .fontWeight(isWinner ? .semibold : .regular)
                Text(entry.code)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.secondary)
                Spacer(minLength: 0)
            }

            if !entry.inScope {
                Text(HostStrings.detectorOutOfScope)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            } else if entry.isEmpty {
                Text(HostStrings.detectorNothingExclusive)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            } else {
                clueRow("1", entry.letters, monospaced: true)
                clueRow("2a", entry.functionWords, monospaced: false)
                clueRow("2b", entry.frequentWords, monospaced: false)
                if entry.francClosest {
                    clueRow("3", [HostStrings.detectorRung("3")], monospaced: false)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// The signals that pointed nowhere.
    ///
    /// The single most explanatory element on the screen. It is what makes
    /// candidate-relative scoring visible instead of merely true, and it is the
    /// row that stops a Ukrainian reader concluding the detector cannot see `і`.
    private func sharedRow(_ result: DetectResult) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(HostStrings.detectorShared)
                .fontWeight(.medium)
            if !result.sharedLetters.isEmpty {
                tokens(result.sharedLetters, monospaced: true)
            }
            if !result.sharedWords.isEmpty {
                tokens(result.sharedWords, monospaced: false)
            }
            Text(HostStrings.detectorSharedHelp)
                .font(.footnote)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }

    /// A labelled clue line, or nothing when the clue is absent.
    @ViewBuilder
    private func clueRow(_ rung: String, _ values: [String], monospaced: Bool) -> some View {
        if !values.isEmpty {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(HostStrings.detectorClue(rung))
                    .font(.footnote)
                    .foregroundColor(.secondary)
#if os(macOS)
                // The rail is wide enough to read as a table, so the value goes
                // to the trailing edge and the clue names line up down the left.
                // Not on the phone, where the row is barely wider than the two
                // of them and a gap between would read as a missing value.
                Spacer(minLength: 12)
#endif
                tokens(values, monospaced: monospaced)
            }
        }
    }

    /// Signal tokens as ONE wrapping line.
    ///
    /// Not chips. SwiftUI has no stock wrapping layout at this app's iOS 15.4 /
    /// macOS 11 floor, and the About screen already established the way around
    /// that: a single `Text` reflows as a paragraph where a container of
    /// sibling views cannot. Hand-drawn pills would also be exactly the kind of
    /// restyled container `docs/native-shells.md` rules out.
    ///
    /// Capped for display here rather than in the engine, which is
    /// presentation-free — it sends everything it found.
    private func tokens(_ values: [String], monospaced: Bool) -> some View {
        Text(values.prefix(Self.tokenDisplayLimit).joined(separator: "   "))
            .font(monospaced ? .system(.footnote, design: .monospaced) : .footnote)
#if os(macOS)
            // Trailing-aligned so a run that wraps stays a block against the
            // right edge rather than a ragged one hanging off the left.
            .multilineTextAlignment(.trailing)
#endif
    }

    /// Enough tokens to convince, not so many they flood the row — the same
    /// judgement the React tab's `wordsFound(…, 6)` made.
    private static let tokenDisplayLimit = 6

    // MARK: - Explainers

    /// The two explainers, collapsed.
    ///
    /// `DisclosureGroup` rather than the React version's always-open sections:
    /// they are reference material, and expanded by default they pushed the
    /// verdict — the thing the screen is for — off a phone-sized screen.
    private var explainerSection: some View {
        Section {
            DisclosureGroup(HostStrings.detectorHowTitle) {
                howItWorksBody
            }
            DisclosureGroup(HostStrings.detectorLimitsTitle) {
                limitationsBody
            }
        }
    }

    /// The two explainers' contents, shared by the list section above and the
    /// pinned footer below so the two platforms cannot say different things.
    private var howItWorksBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(HostStrings.detectorHowBody)
                    // Rehomed from the footer of the editor sheet, which is
                    // where it used to be read by someone who had already asked
                    // the question by opening it. With the sheet gone this is
                    // the only place that answers "why is the list closed, and
                    // what does changing it change" — and it is a how-it-works
                    // question, so it belongs under the how-it-works title.
#if os(macOS)
                    // macOS only, and for two reasons that point the same way.
                    //
                    // The layout one: a `Section` footer is height-capped here,
                    // so this paragraph could not be read in one — cut mid-word
                    // at one line, and clipped from its middle when forced to
                    // wrap. The design one, which is the real argument: in a
                    // window the roster is a RAIL beside the box, and six lines
                    // of grey prose is the largest thing in it — the set the
                    // screen detects among stops being the thing the rail
                    // states. On a phone the same sentence sits under a
                    // full-width card with the whole screen to fall down, and
                    // reads as the aside it is.
                    //
                    // It goes here rather than anywhere else because
                    // `detectorRosterFooter` above is already here for the
                    // identical reason (#522), and this is the same kind of
                    // question: why the list is closed, and what that costs.
                    Text(HostStrings.detectorAmongFooter)
#endif
            Text(HostStrings.detectorRosterFooter)
        }
        .font(.footnote)
        .foregroundColor(.secondary)
    }

    private var limitationsBody: some View {
        Text(HostStrings.detectorLimitsBody)
            .font(.footnote)
            .foregroundColor(.secondary)
    }

#if os(macOS)

    /// The explainers, at the FOOT of the rail rather than trailing its content.
    ///
    /// A phone list ends where its content ends and the screen scrolls; a pane
    /// has a floor, and two rows floating halfway up it with nothing beneath
    /// read as unfinished rather than as the footnotes they are.
    ///
    /// Out of the `List` because a `List` cannot push rows down — there is no
    /// `Spacer` inside one. The cost is the row separators, which is why the
    /// group draws its own `Divider`, and the gain is that the rail above stays
    /// the `List` whose `Section`s are the phone's, unchanged.
    ///
    /// The height is a function of what is OPEN and of what is ABOVE: collapsed
    /// it is two rows and takes exactly that, and expanded it takes its content
    /// up to {@link explainerCeiling}.
    private func explainerFooter(ceiling: CGFloat) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                DisclosureGroup(HostStrings.detectorHowTitle, isExpanded: $isHowExpanded) {
                    howItWorksBody
                        .padding(.top, 4)
                }
                Divider()
                DisclosureGroup(HostStrings.detectorLimitsTitle, isExpanded: $isLimitsExpanded) {
                    limitationsBody
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .frame(maxHeight: isExplainerOpen ? ceiling : nil)
        // ALWAYS fixed vertically, where this used to be fixed only while
        // collapsed. `fixedSize` proposes nothing to the `ScrollView`, so the
        // block asks for its content's height and the `frame` above clamps it:
        // the pair is `min(content, ceiling)` in one expression, which is what
        // both states wanted all along.
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Whether either explainer is open.
    private var isExplainerOpen: Bool { isHowExpanded || isLimitsExpanded }

    /// Whether the rail is carrying an ANSWER.
    ///
    /// `isUnavailable` counts. "Movar cannot answer this" is an outcome a reader
    /// came for, not an empty state, and it deserves the same protection the
    /// verdict gets.
    private var railHasOutcome: Bool { model.result != nil || model.isUnavailable }

    /// What the open explainers may grow to.
    ///
    /// The cap was always FOR something — "so a reader who opens both still has
    /// the verdict above in view". The defect was that it applied when there was
    /// no verdict: with an empty rail an opened explainer scrolled inside 300pt
    /// while ~215pt of white sat directly above it, and the line at the cap was
    /// shaved through its descenders by the window's bottom edge. A cap that
    /// protects nothing is just a smaller window.
    ///
    /// So: 300 while there is an answer to keep in view, and otherwise whatever
    /// the rail can spare once the roster keeps its row. `max` so this can only
    /// ever be LOOSER than the old constant — at the 720x480 floor the rail has
    /// less to spare than the cap it replaces, and there the old number is still
    /// the right one.
    private func explainerCeiling(railHeight: CGFloat) -> CGFloat {
        guard !railHasOutcome else { return Self.explainerCap }
        return max(Self.explainerCap, railHeight - Self.rosterClearance)
    }

    /// The cap that protects an answer; see {@link explainerCeiling}.
    private static let explainerCap: CGFloat = 300

    /// The roster's header and its one row, which stay on screen whatever the
    /// explainers below are doing.
    private static let rosterClearance: CGFloat = 72

#endif
}

// MARK: - Platform seams

extension View {

    /// Drop `TextEditor`'s own backdrop so the list row is the surface.
    ///
    /// `scrollContentBackground` is iOS 16 / macOS 13; below that the only lever
    /// is the underlying `UITextView`/`NSTextView` appearance, which is set
    /// process-wide. Doing nothing on the older systems is the right trade — the
    /// editor there simply keeps its own faint fill, which is a cosmetic
    /// difference and not a broken layout.
    @ViewBuilder
    func movarClearTextEditorBackground() -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            self.scrollContentBackground(.hidden)
        } else {
            self
        }
    }
}
