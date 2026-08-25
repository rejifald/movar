//
//  AboutView.swift
//  Shared (App)
//
//  The About screen, in SwiftUI. The first surface off the WebView.
//

import SwiftUI

/// Movar's About screen: identity, support, and legal.
///
/// THREE GROUPS, EACH ANSWERING A DIFFERENT QUESTION — what this app is, how I
/// reach someone, and what I am allowed to check. That is the shape stock About
/// screens converge on, and it is what the screen was reorganised into:
/// everything below the masthead is either a task or a link, grouped by the
/// question it answers rather than laid out as one run.
///
/// IT IS NO LONGER A TAB. About is reached from the bottom of `SettingsView` —
/// pushed on iOS, presented as a sheet on macOS — because a once-ever
/// destination cannot earn a permanent slot in a tab bar (see `SettingsView`'s
/// header for the guidance and the sample this follows). Nothing about the
/// screen itself changed for the move except its navigation: it names itself
/// with {@link movarPushedTitle} instead of installing a container of its own.
///
/// The enablement banner moved with the change, to the TOP OF SETTINGS. It was
/// never About-shaped — it is the one task standing between the reader and a
/// working install, and burying a setup prompt one push deep under "Legal" would
/// have been the one genuine regression the merge could have caused. See
/// `SetupBanner.swift`.
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
/// WHAT IS NOT STOCK, AND WHY. The Movar mark appears once, at the top, because
/// an About screen's whole job is to say which app this is and no SF Symbol can
/// do that. The mark and the accent are the entire brand surface the ADR lets
/// across. (The mark's other appearance — naming Movar's own row in Safari's
/// extension list — went to `SetupBanner.swift` with the banner.)
struct AboutView: View {

    /// Held for the macOS sheet's sake rather than read by this screen.
    ///
    /// About stopped branching on the host snapshot when the enablement banner
    /// moved to Settings — the three groups below are true on every platform. It
    /// stays a property because `movarAboutSheet` builds this view lazily inside
    /// a sheet closure and would otherwise have nothing to hand it, and because
    /// the next native screen to grow a platform branch will want it back.
    @ObservedObject var host: HostStateModel

    /// Movar's mark at header size, sized against the reader's text size rather
    /// than pinned to a point value so the masthead grows with the copy under it.
    @ScaledMetric(relativeTo: .largeTitle) private var lockupSize: CGFloat = 56

    var body: some View {
        List {
            identitySection
            appSection
            supportSection
            legalSection
        }
        .movarListStyle()
        .movarPushedTitle(HostStrings.tabAbout)
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
                movarUnhyphenated(HostStrings.aboutLede)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .movarPlainRow()
        }
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
