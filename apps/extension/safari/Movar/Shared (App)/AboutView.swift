//
//  AboutView.swift
//  Shared (App)
//
//  The About tab, in SwiftUI. The first surface off the WebView.
//

import SwiftUI

// `NSMutableParagraphStyle` and `NSAttributedString.Key.paragraphStyle` are
// UIKit's and AppKit's, NOT Foundation's, and SwiftUI only happens to re-export
// them. Imported explicitly for the same reason `HostState.swift` imports
// Combine: a transitive re-export that holds on one SDK is not a dependency, it
// is a coincidence that compiles until it doesn't.
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Movar's About screen: identity, the enablement banner, support, and legal.
///
/// FOUR GROUPS, EACH ANSWERING A DIFFERENT QUESTION — what this app is, what it
/// still needs from me, how I reach someone, and what I am allowed to check.
/// That is the shape stock About screens converge on, and it is what the screen
/// was reorganised into: everything below the masthead is now either a task or
/// a link, grouped by the question it answers rather than laid out as one run.
///
/// WHAT IS DELIBERATELY ABSENT: an explanation of what Movar does. The screen
/// used to carry a four-line summary and three capability rows, both lifted from
/// the store listing — read by someone who had already installed the app FROM
/// that listing. The tagline under the wordmark is what survived, because one
/// line of positioning is a masthead and a feature tour is a second listing.
/// The claims that were the "trust row" are now the legal group's footer, with
/// the documents that back them promoted to rows.
///
/// This began as the native port of `apps/safari-host-app/src/tabs/AboutTab.tsx`
/// — the first tab to move, because it collected the most per line: no engine
/// dependency, no state to migrate, and four actions that were already Swift
/// (`docs/native-shells.md`, "About — port first"). It has since diverged, and
/// the React tab is NOT dead code: `capture-host-app-screenshots.mts` still
/// renders it for the `08-host-app-about` App Store screenshot. Changing the
/// structure here does not change that capture.
///
/// APPEARANCE IS STOCK, ON PURPOSE. `List` + `Section` + `Label` + `Button`,
/// the platform type ramp, the platform's own palettes, SF Symbols in place of
/// the lucide icons — and one brand customisation, the accent, applied once as
/// `.tint()` at the root (see `MovarRootView`). Nothing here restyles a
/// container or ships a font. That is not minimalism for its own sake: Dynamic
/// Type, VoiceOver, Full Keyboard Access and Reduce Motion are correct here
/// because stock controls implement them, and every deviation would be a
/// re-implementation of something the OS already does better. The one thing the
/// web version had to fake — `html.platform-ios { font: -apple-system-body }`
/// to approximate Dynamic Type — is simply gone.
///
/// WHAT IS NOT STOCK, AND WHY. The Movar mark appears once, as the last step of
/// the iOS path, because that step names Movar's own row in Safari's extension
/// list and an SF Symbol there would describe a row that does not exist. The
/// mark and the accent are the entire brand surface the ADR lets across.
struct AboutView: View {

    @ObservedObject var host: HostStateModel

    /// Whether the reader has told us they finished the iOS setup.
    ///
    /// iOS has no API for "is this Safari extension enabled" — that is why
    /// `HostState.isExtensionEnabled` is always `nil` there — so the only party
    /// who knows is the person holding the phone. Rather than infer it (the App
    /// Group would let us guess from "the extension messaged us recently", which
    /// proves it RAN, not that it is still on), the card just asks, and this
    /// remembers the answer.
    ///
    /// `UserDefaults`, not the App Group: this is the host app's own UI state and
    /// the extension has no business reading it. macOS never uses this — it hides
    /// the card off the real enabled flag instead.
    @AppStorage("about.setupCardDismissed") private var setupCardDismissed = false

    /// Movar's mark at header size, sized against the reader's text size rather
    /// than pinned to a point value so the masthead grows with the copy under it.
    @ScaledMetric(relativeTo: .largeTitle) private var lockupSize: CGFloat = 56

    /// Body copy with hyphenation switched off.
    ///
    /// SwiftUI hyphenates a tight paragraph on its own, and Ukrainian gives it
    /// plenty to work with — the capability rows this screen used to carry were
    /// breaking "заблоковану" and "замовчуванням" mid-word. The breaks are legal
    /// Ukrainian, but they are not what this copy does anywhere else:
    /// `styles.css` sets `overflow-wrap: anywhere` and never `hyphens: auto`, so
    /// the web original these strings came from has never hyphenated a word. A
    /// port that does is a fidelity regression, not a typographic upgrade.
    ///
    /// Applied to every multi-line paragraph left on the screen — the tagline and
    /// the banner's helper and note. Those are now the only prose here, and they
    /// are the tight ones: the banner's note runs four lines at the default text
    /// size and more at larger ones.
    ///
    /// Done by joining each word's characters with U+2060 WORD JOINER — a
    /// zero-width, non-printing "no break opportunity here". Hyphenation can only
    /// split a line INSIDE a word, so a word with no internal break opportunity
    /// cannot be hyphenated, and the line breaker falls back to the spaces.
    ///
    /// The obvious route — bridging an `NSAttributedString` whose paragraph style
    /// pins `hyphenationFactor` to 0 — was tried first and does nothing: SwiftUI
    /// honours only a subset of `AttributedString` attributes and paragraph style
    /// is not in it. There is no SwiftUI modifier for hyphenation either, so this
    /// is the remaining option that does not drag a `UIViewRepresentable`-wrapped
    /// `UILabel` (and a second AppKit one) into a screen whose whole point is
    /// stock controls.
    ///
    /// WORD JOINER is a format character: it is not spoken, does not print, and
    /// does not affect width, so VoiceOver reads the sentence unchanged. The one
    /// real cost is that a word wider than its container can no longer be broken
    /// — it would overflow rather than split. That is safe for this copy at every
    /// Dynamic Type size (the longest word here is "заблокованими"), but it is
    /// the reason this is applied to the two known-tight paragraphs rather than
    /// being reached for as a general-purpose text helper.
    private static func unhyphenated(_ string: String) -> Text {
        let atomicWords = string
            .split(separator: " ", omittingEmptySubsequences: false)
            .map { $0.map(String.init).joined(separator: "\u{2060}") }
            .joined(separator: " ")
        return Text(atomicWords)
    }

    var body: some View {
        List {
            identitySection
            // The banner is absent, not empty, before the host reports — the
            // rest of the screen is true regardless of platform and renders
            // straight away. It is also absent once the setup is done: macOS
            // learns that from `SFSafariExtensionManager` and stops producing a
            // banner at all, iOS from the reader having tapped "I've done this".
            if let banner = host.banner, !setupCardDismissed {
                bannerSection(banner)
            }
            appSection
            supportSection
            legalSection
        }
        .movarListStyle()
        .movarNavigationContainer(HostStrings.tabAbout)
    }

    // MARK: - Identity

    /// Mark, name, build — the masthead every stock About screen opens with.
    ///
    /// It sits ON THE GROUPED BACKGROUND rather than inside a card, which is the
    /// structure the platform's own About screens use: the app states what it is
    /// first, and the cards below are the things you can read or act on. Boxing
    /// the lockup made it look like the first of several equal items, and paired
    /// it with the tagline inside one card so that two different jobs — "this is
    /// Movar" and "here is what Movar is for" — shared a container.
    ///
    /// The build moved up here with the mark for the same reason. A version is
    /// part of an app's identity, and stranding it alone at the very bottom in
    /// grey monospace made the single most-asked-for fact on the screen read as
    /// a debug artefact.
    ///
    /// The wordmark is set in the SYSTEM face. The ADR reserves the brand face
    /// for brand moments, and this is one — but shipping Manrope to render a
    /// single six-letter word would put a font file, a `UIFontMetrics` wiring and
    /// an optical-sizing regression into the first native slice. If the wordmark
    /// ever earns Manrope it should arrive as the packaged mark asset, not as a
    /// font dependency.
    private var identitySection: some View {
        Section {
            VStack(spacing: 6) {
                Image("LargeIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: lockupSize, height: lockupSize)
                    .accessibilityHidden(true)
                Text(verbatim: "Movar")
                    .font(.title2)
                    .fontWeight(.bold)
                    .accessibilityAddTraits(.isHeader)
                // One line, not the four-line summary that used to sit in a card
                // below: what Movar is FOR is worth a sentence on the screen that
                // introduces it, but the paragraph underneath was the store
                // listing's copy, read by someone who had already installed from
                // that listing.
                Self.unhyphenated(HostStrings.aboutLede)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .movarPlainRow()
        }
    }

    // MARK: - Enablement banner

    /// ONE ROW, not five.
    ///
    /// This is a single message — a heading, a line of instruction, the route,
    /// and a closing note — and it was built as five sibling rows in a `Section`,
    /// so `List` drew a separator between every part of it. A hairline between a
    /// heading and its own subtitle is what made this card read as a broken
    /// table rather than a paragraph, and no amount of restyling the pieces fixes
    /// that while they are still separate rows.
    ///
    /// The shape is the one every setup prompt converges on: heading, ONE short
    /// instruction, the thing to do, and the reassurance last — held together by
    /// spacing rather than divided by rules.
    private func bannerSection(_ banner: EnablementBanner) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text(banner.headline)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                Self.unhyphenated(banner.helper)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                pathRow(banner)

                switch banner.action {
                case .note(let text):
                    Self.unhyphenated(text)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                    // `.note` IS the iOS branch — macOS always gets the real CTA
                    // — so the dismiss rides along with it rather than needing a
                    // separate platform test in the view.
                    setupDoneButton
                case .openSafariSettings(let label):
                    openSafariSettingsButton(label: label)
                }
            }
            .padding(.vertical, 6)
        }
    }

    /// The Settings ▸ … ▸ Extensions route, as one wrapping line.
    ///
    /// This is a ROUTE, not a checklist, and the previous layout said otherwise:
    /// five icon rows stacked in a column are visually indistinguishable from
    /// five separate destinations — the same shape the rest of this screen uses
    /// for the three independent capabilities and the three trust facts. Readers
    /// hunted for five places to visit instead of following one path.
    ///
    /// So it is a chip chain again, the way `AboutTab.tsx` has always drawn it,
    /// with the crumbs joined by "›". The wrapping is `Text`'s own: concatenated
    /// `Text` (including `Text(Image:)` for the SF Symbols) reflows as a single
    /// paragraph, so this needs no flow container — which is what the column was
    /// working around, since SwiftUI has no stock wrapping layout at this app's
    /// iOS 15.4 floor. It degrades the right way too: at the largest Dynamic Type
    /// sizes it simply becomes more lines, never a clipped row.
    ///
    /// VoiceOver still reads it as ONE route, joined by the localized connector,
    /// because crumbs with no spoken connector are destinations rather than a
    /// path. That is what replaces the React markup's `sr-only` "then" spans.
    private func pathRow(_ banner: EnablementBanner) -> some View {
        var line = Text(verbatim: "")
        for (index, step) in banner.steps.enumerated() {
            if index > 0 {
                line = line + Text(verbatim: "  ›  ").foregroundColor(.secondary)
            }
            line = line + crumb(step)
        }
        return line
            .padding(.vertical, 2)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(banner.spokenPath)
    }

    /// One crumb: its glyph, a narrow NO-BREAK space, then its label.
    ///
    /// `Text(Image:)` is what lets a symbol sit INSIDE the flowing line — an
    /// `Image` view beside it would need a container, and the container is what
    /// stopped the line wrapping in the first place.
    ///
    /// The space is U+202F (narrow no-break) rather than U+2009 (thin): a plain
    /// thin space is a break opportunity, and the line duly wrapped between the
    /// compass and the word "Safari", leaving an orphaned glyph at the end of one
    /// line and a label with no icon at the start of the next. A crumb is one
    /// token and has to break as one.
    private func crumb(_ step: PathStep) -> Text {
        switch step.glyph {
        case .symbol(let name):
            return Text(Image(systemName: name)).foregroundColor(.accentColor)
                + Text(verbatim: "\u{202F}")
                + Text(step.label)
        case .movarMark:
            // The mark is an ASSET, not an SF Symbol, and `Text(Image:)` sets an
            // asset at its intrinsic size — a 1024px icon dropped mid-sentence.
            // The destination crumb takes its emphasis from weight instead, and
            // the mark still introduces the app at the top of the screen, so it
            // is not lost from the layout — only from this line.
            return Text(step.label).fontWeight(.semibold)
        }
    }

    /// "I've done this" — the iOS card's only way to go away.
    ///
    /// Bordered rather than prominent: it does not perform the setup, it records
    /// that the reader did, and a filled button here would out-shout the path
    /// above it that is the actual instruction. macOS has no equivalent because
    /// it can just ask the system.
    ///
    /// One-way, deliberately. A "show it again" control would be a second piece
    /// of state to explain on a screen whose whole revision was about removing
    /// things — and the same walkthrough still exists in the extension's
    /// onboarding and on the marketing site if anyone needs it back.
    private var setupDoneButton: some View {
        Button {
            setupCardDismissed = true
        } label: {
            Text(HostStrings.aboutSetupDone)
        }
        .movarBorderedButtonStyle()
    }

    /// macOS only — `EnablementBanner` never produces this action on iOS,
    /// because no iOS API opens another app's settings pane and a button that
    /// did nothing would be worse than the sentence it replaced.
    private func openSafariSettingsButton(label: String) -> some View {
        Button {
            HostActions.openSafariPreferences()
        } label: {
            Label(label, systemImage: "arrow.up.right.square")
        }
        .movarProminentButtonStyle()
    }

    // MARK: - Support

    /// Reaching a person, and rating the app.
    ///
    /// Grouped apart from the legal rows below because they answer a different
    /// question — "I want to say something" versus "I want to check something" —
    /// and grouping by that question is what a stock About screen does instead of
    /// listing every link in one run.
    ///
    /// Both route through `HostActions`, the same code the WebView's `feedback` /
    /// `open-url` bridge cases call, rather than through SwiftUI's `Link`. `Link`
    /// would work, but it would mean this screen opens external URLs by one route
    /// and the three tabs still in the WebView open them by another, with two
    /// places to audit what the app is willing to launch. One entry point is
    /// worth more than one saved line.
    private var supportSection: some View {
        Section(header: Text(HostStrings.aboutGroupSupport)) {
            externalRow(HostStrings.feedback, systemImage: "envelope") {
                HostActions.openFeedback()
            }
            externalRow(HostStrings.aboutRate, systemImage: "star") {
                HostActions.openAppStoreReview()
            }
        }
    }

    // MARK: - App

    /// Which build this is, and what changed in it — one row.
    ///
    /// The version and the changelog were two separate things twice over: a
    /// masthead line and a row. But "1.6.2" and "what's new in it" are one fact
    /// and its explanation, and a screen that states the number in one place and
    /// offers to explain it in another makes the reader connect them. As a
    /// value-on-the-trailing-side row — the stock "Version | 1.6.2" shape — the
    /// row says both at once and the version stops needing a home of its own.
    ///
    /// The visible label is "What's new" and the value is the bare number, so the
    /// accessible name has to supply what the layout implies: it leads with the
    /// visible label (WCAG 2.5.3, label in name) and then says the version IN
    /// WORDS, because VoiceOver reading "one point six point two" after a row
    /// title is a string of digits with nothing to attach them to.
    private var appSection: some View {
        let version = HostActions.appVersion
        return Section(header: Text(HostStrings.aboutGroupApp)) {
            externalRow(
                HostStrings.aboutWhatsNew,
                systemImage: "sparkles",
                value: version
            ) {
                HostActions.openChangelog(version: version)
            }
            .accessibilityLabel(
                "\(HostStrings.aboutWhatsNew), \(HostStrings.aboutVersion(version))")

            // The licence, as a row rather than a footer line. It belongs beside
            // the version for the same reason: both are facts about THIS build,
            // and both are more useful pointing at their own document than
            // asserted in passing. "MIT" is not localized — an SPDX identifier —
            // and unlike the version's digits it reads correctly aloud, so the
            // value stays visible to VoiceOver.
            externalRow(
                HostStrings.aboutLicense,
                systemImage: "checkmark.seal",
                value: "MIT"
            ) {
                HostActions.openLicense()
            }
        }
    }

    // MARK: - Legal and source

    /// The three documents a reader is entitled to check, and the licence line.
    ///
    /// This is where the old trust row went. "Free / Open source / Nothing leaves
    /// your browser" were three claims presented as though they were rows you
    /// could act on — they were not tappable, and two of them named things the
    /// app could simply SHOW you. So the evidence became the rows: the source,
    /// the licences it is built on, and the privacy policy that says what
    /// "nothing leaves your browser" means in a document Apple's reviewers can
    /// also open. The footer that replaced the claims states Movar's own licence.
    ///
    /// Privacy comes first because it is the one most readers came for, and the
    /// only one of the three whose absence from an About screen is conspicuous.
    ///
    /// Written with `header:`/`footer:` as trailing closures rather than as an
    /// argument: `Section(header:_:footer:)` is not an initializer, and passing a
    /// header positionally alongside a trailing footer resolves to one that does
    /// not exist.
    private var legalSection: some View {
        Section {
            externalRow(HostStrings.aboutPrivacy, systemImage: "hand.raised") {
                HostActions.openPrivacyPolicy()
            }

            // `curlybraces`, not `chevron.left.forwardslash.chevron.right`: that
            // symbol is macOS 12, and this app's floor is macOS 11. (Availability
            // checked against CoreGlyphs.bundle's `name_availability.plist` — an
            // unavailable SF Symbol renders as nothing, silently, which is the
            // kind of defect only a device shows you.)
            externalRow(HostStrings.aboutSourceCode, systemImage: "curlybraces") {
                HostActions.openSourceCode()
            }
            externalRow(HostStrings.aboutLicenses, systemImage: "doc.text") {
                HostActions.openLicenses()
            }
        } header: {
            Text(HostStrings.aboutGroupLegal)
        }
    }

    /// A row that leaves the app: accent glyph, LABEL-COLOURED text, and a
    /// trailing mark saying where tapping goes.
    ///
    /// The text is explicitly `.primary`. A `Button` inside a `List` tints its
    /// whole label on iOS, which set every row on this screen in accent green —
    /// five rows of shouting, with nothing left to mark the one link that
    /// actually needed emphasis. Stock About screens tint the glyph and leave the
    /// label alone, so the colour marks the row's KIND rather than its
    /// importance. The one link that stays fully tinted is the version, where the
    /// accent is the only thing saying "this is tappable".
    ///
    /// `arrow.up.right` rather than a chevron, because a chevron promises a push
    /// onto the navigation stack and both of these open Safari or Mail instead.
    /// `value` is the grey detail some rows carry on the trailing side — the
    /// stock "Version | 1.6.2" shape. Optional because most rows here are a
    /// destination and nothing else.
    private func externalRow(
        _ title: String,
        systemImage: String,
        value: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Label {
                    Text(title).foregroundColor(.primary)
                } icon: {
                    Image(systemName: systemImage)
                }
                Spacer(minLength: 8)
                if let value = value {
                    // Left visible to VoiceOver. A value like "MIT" reads
                    // correctly on its own; one that does NOT — a bare "1.6.2" is
                    // spoken as digits with nothing to attach them to — is fixed
                    // by giving that row an explicit `accessibilityLabel`, which
                    // replaces this text rather than hiding it here for every row.
                    Text(value)
                        .foregroundColor(.secondary)
                }
                Image(systemName: "arrow.up.right")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .movarRowButtonStyle()
    }
}

// MARK: - Platform seams

/// Small platform/version seams, kept together so the views above read as one
/// layout rather than as a thicket of `#if` and `if #available`.
///
/// Every one of these exists because the app's floor is genuinely old — iOS 15.4
/// and **macOS 11**, which predates `.tint`, `.borderedProminent` and the whole
/// `.buttonStyle(.plain)` shorthand family. They are written as availability
/// branches rather than by raising the deployment target, because raising it
/// would drop users of a shipped app to make a first slice tidier.
extension View {

    /// The canonical grouped list on each platform.
    @ViewBuilder
    func movarListStyle() -> some View {
#if os(iOS)
        self.listStyle(InsetGroupedListStyle())
#else
        self.listStyle(InsetListStyle())
#endif
    }

    /// A row that sits on the grouped background instead of on a card.
    ///
    /// What makes the masthead a masthead rather than the first list item: no
    /// card fill, no separator, and no row insets, so the mark and wordmark are
    /// the app introducing itself rather than an entry in a list of settings.
    @ViewBuilder
    func movarPlainRow() -> some View {
        self
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
#if os(iOS)
            .listRowSeparator(.hidden)
#endif
    }

    /// The screen's navigation container — and, on iOS, the reason the rows stop
    /// colliding with the clock.
    ///
    /// A `List` sitting directly in a `TabView` has no navigation bar, and with
    /// no bar there is nothing to draw the scroll-edge material: scrolled rows
    /// pass under the status bar and the Dynamic Island at full contrast, which
    /// is exactly what this screen did. The bar is what every stock tab has, and
    /// adopting it is both cheaper and more correct at every Dynamic Type size
    /// than hand-rolling a blur or hard-coding a top inset — neither of which
    /// would track the status bar growing (call, recording, Live Activity).
    ///
    /// INLINE, not large. The lede lockup is already this screen's introduction,
    /// and a large title would set "Про Мовар" in 34pt directly above a 56pt mark
    /// and a wordmark that introduce the same app. Inline keeps the bar as what
    /// it is here — a surface for the scroll edge to land on — and leaves the
    /// lockup the one thing that greets the reader, as the header comment above
    /// intends.
    ///
    /// macOS gets nothing: `NavigationView` there is a split view, which would
    /// wrap a single pane in a sidebar, and the window's own title bar already
    /// says "Movar".
    @ViewBuilder
    func movarNavigationContainer(_ title: String) -> some View {
#if os(iOS)
        // `NavigationStack` is the iOS 16 replacement; the app's floor is 15.4,
        // so the deprecated `NavigationView` still has to be here for one more
        // OS cycle. `.stack` on the fallback because plain `NavigationView` is a
        // split view on iPad, and About is one pane on every size class.
        if #available(iOS 16.0, *) {
            NavigationStack {
                self
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        } else {
            NavigationView {
                self
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
            }
            .navigationViewStyle(StackNavigationViewStyle())
        }
#else
        self
#endif
    }

    /// The bordered (outlined) button style where the OS has one.
    ///
    /// Same availability seam as the prominent style below: `.bordered` arrived
    /// with iOS 15 / macOS 12, and the app's macOS floor is 11.
    @ViewBuilder
    func movarBorderedButtonStyle() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.buttonStyle(.bordered)
        } else {
            self
        }
    }

    /// The prominent (tinted) button style where the OS has one.
    ///
    /// macOS 11 has no `.borderedProminent`; it gets the default push-button,
    /// which is the correct-looking control on that OS rather than a downgrade.
    @ViewBuilder
    func movarProminentButtonStyle() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.buttonStyle(.borderedProminent)
        } else {
            self
        }
    }

    /// A button that should read as a LIST ROW, not as a control sitting in one.
    ///
    /// iOS already renders a `Button` in a `List` this way; macOS renders a real
    /// push button, which turns a footer of three links into a stack of three
    /// grey rectangles. `PlainButtonStyle` is the stock way to say "the label is
    /// the control".
    @ViewBuilder
    func movarRowButtonStyle() -> some View {
#if os(macOS)
        self.buttonStyle(PlainButtonStyle())
#else
        self
#endif
    }
}
