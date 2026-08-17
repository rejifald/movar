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
///    sees what is being compared before they are asked for text, because the
///    set is a precondition of the question rather than a footnote to the reply.
/// 2. **The verdict states its own scope** — "Closest of 3 · distinctive
///    letters" — so the answer is never separated from the comparison that
///    produced it.
/// 3. **The evidence shows what counted for nobody.** langtell credits a signal
///    only to a sole owner, so `і` — Ukrainian AND Belarusian — scores for
///    neither. Without that row a reader sees `і` in their own text, no `і` in
///    the Ukrainian evidence, and concludes the tool is broken.
///
/// And the roster is editable, which is what turns all of the above from a claim
/// into something a person can check: narrow it to one language and the same
/// text starts matching by default, which the result says out loud.
///
/// Appearance is stock, per `docs/native-shells.md` — `List`, `Section`,
/// `DisclosureGroup`, the platform type ramp, SF Symbols, one accent applied at
/// the root. Nothing here restyles a container or ships a font.
struct DetectorView: View {

    @ObservedObject var model: DetectorModel

    /// The roster editor is a SHEET on both platforms rather than a push.
    ///
    /// `NavigationView` on macOS is a split view, and this app is one narrow
    /// column everywhere it runs — so the iOS-only navigation container the
    /// About screen adopts has nothing to push onto here. A sheet is stock on
    /// both, needs no platform branch, and is what the comparable pattern does
    /// (Airbnb's "Languages you speak", Wispr Flow's language confirmation).
    @State private var isEditingRoster = false

    var body: some View {
        List {
            comparingSection
            inputSection
            if model.isUnavailable { unavailableSection }
            if let result = model.result {
                verdictSection(result)
                evidenceSection(result)
            }
            explainerSection
        }
        .movarListStyle()
        .movarNavigationContainer(HostStrings.detectorTitle)
        .sheet(isPresented: $isEditingRoster) {
            RosterView(model: model)
        }
    }

    // MARK: - The comparison set

    /// What is being compared, above the box you type into.
    ///
    /// The order matters more than the styling. A closed-set answer is not
    /// interpretable without its set, so putting the set after the verdict would
    /// reproduce the original defect in a nicer font.
    private var comparingSection: some View {
        Section {
            Button {
                isEditingRoster = true
            } label: {
                HStack(spacing: 8) {
                    Label {
                        Text(rosterSummary).foregroundColor(.primary)
                    } icon: {
                        Image(systemName: "character.book.closed")
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .movarRowButtonStyle()
        } header: {
            Text(HostStrings.detectorComparing)
        } footer: {
            Text(HostStrings.detectorComparingFooter)
        }
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

            Button {
                model.run()
            } label: {
                Label(HostStrings.detectorDetect, systemImage: "text.magnifyingglass")
                    .frame(maxWidth: .infinity)
            }
            .movarProminentButtonStyle()
            .disabled(model.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
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
                Text(HostStrings.detectorHowBody)
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

// MARK: - The roster editor

/// Add and remove the languages being compared.
///
/// TWO SECTIONS, EVERYTHING VISIBLE — in the comparison, and not. No search
/// field and no pushed sub-picker, because the catalogue is five codes and a
/// search box over five rows is furniture. This is the shape the comparable
/// "choose which of these are active" screens converge on (Oura's shortcuts,
/// Todoist's quick-add actions, Raycast's home items): a ⊖ list over a ⊕ list,
/// with the whole choice on one screen.
///
/// It is also where the screen answers "why is it like this" — the footer under
/// the second section, read by someone who has already asked the question by
/// opening this.
struct RosterView: View {

    @ObservedObject var model: DetectorModel
    @Environment(\.presentationMode) private var presentationMode

    var body: some View {
        List {
            Section {
                ForEach(model.roster, id: \.self) { code in
                    rosterRow(code)
                }
            } header: {
                Text(HostStrings.detectorRosterIn)
            } footer: {
                // Only while the floor is in force, so it explains a disabled
                // control rather than describing a rule nobody has met.
                if !model.canRemove {
                    Text(HostStrings.detectorRosterLast)
                }
            }

            if !model.available.isEmpty {
                Section {
                    ForEach(model.available, id: \.self) { code in
                        availableRow(code)
                    }
                } header: {
                    Text(HostStrings.detectorRosterOut)
                } footer: {
                    Text(HostStrings.detectorRosterFooter)
                }
            }

            Section {
                Button(HostStrings.detectorRosterReset) {
                    model.resetRoster()
                }
                .disabled(model.roster == DetectorModel.defaultRoster)
            } footer: {
                // The catalogue arrives from the engine, so before it answers
                // there is nothing to add. Explaining the empty state beats
                // rendering a section that looks broken.
                if model.available.isEmpty && model.catalogue.isEmpty {
                    Text(HostStrings.detectorRosterFooter)
                }
            }
        }
        .movarListStyle()
        .movarSheetChrome(HostStrings.detectorRosterTitle) {
            presentationMode.wrappedValue.dismiss()
        }
    }

    private func rosterRow(_ code: String) -> some View {
        HStack(spacing: 12) {
            Button {
                model.remove(code)
            } label: {
                Image(systemName: "minus.circle.fill")
                    .foregroundColor(model.canRemove ? .red : .secondary)
            }
            .movarRowButtonStyle()
            .disabled(!model.canRemove)
            // Every row's control would otherwise be announced as "Remove".
            .accessibilityLabel(HostStrings.detectorRosterRemove(LanguageNames.display(code)))

            languageLabel(code)
        }
    }

    private func availableRow(_ code: String) -> some View {
        HStack(spacing: 12) {
            Button {
                model.add(code)
            } label: {
                Image(systemName: "plus.circle.fill")
                    .foregroundColor(.accentColor)
            }
            .movarRowButtonStyle()
            .accessibilityLabel(HostStrings.detectorRosterAdd(LanguageNames.display(code)))

            languageLabel(code)
        }
    }

    /// Name plus code. The code is shown because it is what the evidence rows
    /// and the extension's own settings use, and a reader matching one screen
    /// against another should not have to translate between them.
    private func languageLabel(_ code: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(LanguageNames.display(code))
            Text(code)
                .font(.system(.caption, design: .monospaced))
                .foregroundColor(.secondary)
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Platform seams

extension View {

    /// A sheet's title and its one way out.
    ///
    /// iOS gets a navigation bar with a Done button, which is what a modal sheet
    /// has there. macOS 11 has no sheet chrome to speak of and `NavigationView`
    /// is a split view, so it gets a plain title row and a Done button laid out
    /// directly — a sidebar around a five-row list would be absurd.
    @ViewBuilder
    func movarSheetChrome(_ title: String, done: @escaping () -> Void) -> some View {
#if os(iOS)
        NavigationView {
            self
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(HostStrings.done, action: done)
                    }
                }
        }
        .navigationViewStyle(StackNavigationViewStyle())
#else
        VStack(spacing: 0) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                Button(HostStrings.done, action: done)
            }
            .padding()
            self
        }
        .frame(minWidth: 320, minHeight: 380)
#endif
    }

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
