//
//  AboutView.swift
//  Shared (App)
//
//  The About tab, in SwiftUI. The first surface off the WebView.
//

import SwiftUI

/// Movar's About screen: the brand lede, the enablement banner, what Movar
/// does, the trust row, and the footer actions.
///
/// This is the native port of `apps/safari-host-app/src/tabs/AboutTab.tsx`, and
/// it is the first tab to move because it collects the most per line: it has no
/// engine dependency, no state to migrate, and four actions that were already
/// Swift (`docs/native-shells.md`, "About — port first").
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

    /// SF Symbols for the capability rows, positionally aligned to
    /// `HostStrings.aboutFeatures` — the same alignment (and the same three
    /// meanings: reach every site, switch away, hide) the React
    /// `FEATURE_ICONS` array carries against `about.features`.
    private static let capabilitySymbols = ["globe", "arrow.left.arrow.right", "eye.slash"]

    /// Movar's mark, sized against the reader's text size rather than pinned to
    /// a point value, so it stays aligned with the label beside it at every
    /// Dynamic Type setting.
    @ScaledMetric(relativeTo: .body) private var markSize: CGFloat = 20

    /// The same mark at header size, for the lede's lockup.
    @ScaledMetric(relativeTo: .largeTitle) private var lockupSize: CGFloat = 56

    var body: some View {
        List {
            ledeSection
            // The banner is absent, not empty, before the host reports — the
            // rest of the screen is true regardless of platform and renders
            // straight away.
            if let banner = host.banner {
                bannerSection(banner)
            }
            capabilitiesSection
            trustSection
            footerSection
        }
        .movarListStyle()
    }

    // MARK: - Lede

    private var ledeSection: some View {
        Section {
            // The lockup that used to be the web shell's fixed `.appbar` — which
            // the native tab shell removed along with the rest of the web chrome,
            // and which macOS never showed because the window title bar already
            // says "Movar". This is the one place the mark appears on the screen,
            // and it is here rather than in a navigation title because About is
            // where an app is allowed to introduce itself.
            //
            // The wordmark is set in the SYSTEM face. The ADR reserves the brand
            // face for brand moments, and this is one — but shipping Manrope to
            // render a single six-letter word would put a font file, a
            // `UIFontMetrics` wiring and an optical-sizing regression into the
            // first native slice. If the wordmark ever earns Manrope it should
            // arrive as the packaged mark asset, not as a font dependency.
            VStack(spacing: 8) {
                Image("LargeIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: lockupSize, height: lockupSize)
                    .accessibilityHidden(true)
                Text(verbatim: "Movar")
                    .font(.title2)
                    .fontWeight(.bold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 8)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)

            VStack(alignment: .leading, spacing: 6) {
                // The tagline, in the SYSTEM face. The brand face is for the
                // wordmark alone (`docs/native-shells.md`, "Fonts do not
                // cross"): Manrope here would fight Dynamic Type and break the
                // metric alignment that makes SF Symbols sit right next to text.
                Text(HostStrings.aboutLede)
                    .font(.title3)
                    .fontWeight(.semibold)
                Text(HostStrings.aboutSummary)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
        }
    }

    // MARK: - Enablement banner

    private func bannerSection(_ banner: EnablementBanner) -> some View {
        Section {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                if banner.isOn {
                    // The system's own "good" green, not a brand colour: this is
                    // a status indicator, and status colours are the platform's
                    // vocabulary rather than ours.
                    Image(systemName: "circle.fill")
                        .font(.system(size: 8))
                        .foregroundColor(.green)
                        .accessibilityHidden(true)
                }
                Text(banner.headline)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
            }
            Text(banner.helper)
                .font(.subheadline)
                .foregroundColor(.secondary)

            pathRow(banner)

            switch banner.action {
            case .note(let text):
                Text(text)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            case .openSafariSettings(let label):
                openSafariSettingsButton(label: label)
            }
        }
    }

    /// The Settings ▸ … ▸ Extensions route, as one element.
    ///
    /// Laid out vertically rather than as the web version's wrapping chip chain
    /// with "→" separators: SwiftUI has no stock wrapping layout below iOS 16,
    /// and a hand-rolled flow container would be the first thing on this screen
    /// to break at large Dynamic Type sizes — which is precisely the reader who
    /// most needs the instructions to be legible.
    ///
    /// VoiceOver reads it as ONE route, joined by the localized connector,
    /// because five sibling labels with no connector are five destinations
    /// rather than one path. That is what replaces the React markup's `sr-only`
    /// "then" spans.
    private func pathRow(_ banner: EnablementBanner) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(banner.steps) { step in
                Label {
                    Text(step.label)
                } icon: {
                    glyph(step.glyph)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(banner.spokenPath)
    }

    @ViewBuilder
    private func glyph(_ glyph: PathStep.Glyph) -> some View {
        switch glyph {
        case .symbol(let name):
            Image(systemName: name)
        case .movarMark:
            Image("LargeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: markSize, height: markSize)
                .accessibilityHidden(true)
        }
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

    // MARK: - What Movar does

    private var capabilitiesSection: some View {
        Section(header: Text(HostStrings.aboutWhatTitle)) {
            ForEach(Array(HostStrings.aboutFeatures.enumerated()), id: \.offset) { index, feature in
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(feature.title)
                        Text(feature.detail)
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                } icon: {
                    Image(systemName: Self.capabilitySymbols[safe: index] ?? "globe")
                }
                .padding(.vertical, 2)
                .accessibilityElement(children: .combine)
            }
        }
    }

    // MARK: - Trust

    private var trustSection: some View {
        Section {
            Label(HostStrings.trustFree, systemImage: "tag")
            Label(HostStrings.trustOpenSource, systemImage: "chevron.left.slash.chevron.right")
            Label(HostStrings.trustPrivacy, systemImage: "checkmark.shield")
        }
    }

    // MARK: - Footer actions

    /// Feedback, source code, and the version stamp — on every platform.
    ///
    /// All three still route through `HostActions`, the same code the WebView's
    /// `feedback` / `open-url` bridge cases call, rather than through SwiftUI's
    /// `Link`. `Link` would work here, but it would mean this screen opens
    /// external URLs by one route and the three tabs still in the WebView open
    /// them by another, with two places to audit what the app is willing to
    /// launch. One entry point is worth more than one saved line.
    private var footerSection: some View {
        Section {
            Button {
                HostActions.openFeedback()
            } label: {
                Label(HostStrings.feedback, systemImage: "envelope")
                    .movarRowLabel()
            }
            .movarRowButtonStyle()

            Button {
                HostActions.openSourceCode()
            } label: {
                // `curlybraces`, not `chevron.left.forwardslash.chevron.right`:
                // that symbol is macOS 12, and this app's floor is macOS 11. The
                // 10.15-era `chevron.left.slash.chevron.right` is taken by the
                // trust row above, and the two rows saying the same glyph would
                // read as the same link. (Availability checked against
                // CoreGlyphs.bundle's `name_availability.plist` — an unavailable
                // SF Symbol renders as nothing, silently, which is the kind of
                // defect only a device shows you.)
                Label(HostStrings.aboutSourceCode, systemImage: "curlybraces")
                    .movarRowLabel()
            }
            .movarRowButtonStyle()

            versionStamp
        }
    }

    /// The build stamp, linking to this build's entry on the public changelog.
    ///
    /// Monospaced in the SYSTEM mono (SF Mono), which is the one place the ADR
    /// keeps mono: a build identifier is a token to be read character by
    /// character. IBM Plex Mono does not cross — a platform-tuned mono reads
    /// better beside platform text than a shipped one.
    ///
    /// The visible text is the whole label, so the accessible name has to start
    /// with it (WCAG 2.5.3, label in name); `aboutVersionLink` guarantees that.
    private var versionStamp: some View {
        let version = HostActions.appVersion
        let stamp = "v" + version
        return Button {
            HostActions.openChangelog(version: version)
        } label: {
            Text(verbatim: stamp)
                .font(.system(.footnote, design: .monospaced))
                .foregroundColor(.secondary)
                .movarRowLabel()
        }
        .movarRowButtonStyle()
        .accessibilityLabel(HostStrings.aboutVersionLink(stamp: stamp))
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

    /// Make a row's label span the row, so the whole row is the hit target
    /// rather than just the text.
    func movarRowLabel() -> some View {
        self
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
    }
}

extension Array {
    /// Index that answers `nil` instead of trapping.
    ///
    /// Used where a string catalogue and a symbol list are aligned positionally:
    /// a catalogue that grows a fourth capability before the symbols do should
    /// render with a fallback glyph, not crash the About screen.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
