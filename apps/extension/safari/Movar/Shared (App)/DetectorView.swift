//
//  DetectorView.swift
//  Shared (App)
//
//  The Detector tab, in SwiftUI — a closed-set match, shown as one.
//

import SwiftUI

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
        ScrollViewReader { proxy in
            List {
                rosterSection
                inputSection
                if model.isUnavailable { unavailableSection }
                if let result = model.result {
                    verdictSection(result)
                    evidenceSection(result)
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
            movarUnhyphenated(HostStrings.detectorAmongFooter)
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

    private func verdictSection(_ result: DetectResult) -> some View {
        Section {
            if let language = result.language {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(LanguageNames.display(language))
                            .font(.title3)
                            .fontWeight(.semibold)
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

                if result.isForced { forcedBanner(language) }
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
        } header: {
            Text(HostStrings.detectorResult)
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

    private func evidenceSection(_ result: DetectResult) -> some View {
        Section {
            ForEach(result.rankedEvidence) { entry in
                candidateRow(entry, isWinner: entry.code == result.language)
            }
            if !result.sharedLetters.isEmpty || !result.sharedWords.isEmpty {
                sharedRow(result)
            }
        } header: {
            Text(HostStrings.detectorEvidence)
        }
    }

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
                VStack(alignment: .leading, spacing: 8) {
                    Text(HostStrings.detectorHowBody)
                    // Rehomed from the footer of the editor sheet, which is
                    // where it used to be read by someone who had already asked
                    // the question by opening it. With the sheet gone this is
                    // the only place that answers "why is the list closed, and
                    // what does changing it change" — and it is a how-it-works
                    // question, so it belongs under the how-it-works title.
                    Text(HostStrings.detectorRosterFooter)
                }
                .font(.footnote)
                .foregroundColor(.secondary)
            }
            DisclosureGroup(HostStrings.detectorLimitsTitle) {
                Text(HostStrings.detectorLimitsBody)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
    }
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
