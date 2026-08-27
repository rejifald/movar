//
//  SetupBanner.swift
//  Shared (App)
//
//  "One last step" — the enablement card, and the typography it shares with About.
//

import SwiftUI

/// Body copy with hyphenation switched off.
///
/// SwiftUI hyphenates a tight paragraph on its own, and Ukrainian gives it plenty
/// to work with — this screen's copy was breaking "заблоковану" and
/// "замовчуванням" mid-word. The breaks are legal Ukrainian, but they are not
/// what this copy does anywhere else: `styles.css` sets `overflow-wrap: anywhere`
/// and never `hyphens: auto`, so the web original these strings came from has
/// never hyphenated a word. A port that does is a fidelity regression, not a
/// typographic upgrade.
///
/// Done by joining each word's characters with U+2060 WORD JOINER — a zero-width,
/// non-printing "no break opportunity here". Hyphenation can only split a line
/// INSIDE a word, so a word with no internal break opportunity cannot be
/// hyphenated, and the line breaker falls back to the spaces.
///
/// The obvious route — bridging an `NSAttributedString` whose paragraph style
/// pins `hyphenationFactor` to 0 — was tried first and does nothing: SwiftUI
/// honours only a subset of `AttributedString` attributes and paragraph style is
/// not in it. There is no SwiftUI modifier for hyphenation either, so this is the
/// remaining option that does not drag a `UIViewRepresentable`-wrapped `UILabel`
/// (and a second AppKit one) into screens whose whole point is stock controls.
///
/// WORD JOINER is a format character: it is not spoken, does not print, and does
/// not affect width, so VoiceOver reads the sentence unchanged. The one real cost
/// is that a word wider than its container can no longer be broken — it would
/// overflow rather than split. That is safe for this copy at every Dynamic Type
/// size (the longest word here is "заблокованими"), but it is the reason this is
/// applied to the known-tight paragraphs rather than being reached for as a
/// general-purpose text helper.
///
/// It lives beside the banner because the banner is three of its four uses — the
/// headline's helper, the note, and About's lede is the fourth. Those are the
/// only prose left on either screen; everything else is a row label.
extension View {

    /// Let a paragraph grow DOWN rather than be cut off at the right.
    ///
    /// A `Section` footer reports the width it would like — one line — and a
    /// container narrower than that clips it instead of wrapping. On a phone the
    /// list is the screen, so the ideal width is never far off and nothing shows;
    /// in a window, and especially in a pane of a split, it is a sentence ending
    /// in an ellipsis. `fixedSize` says which axis may give: not the horizontal
    /// one, so the text takes the width it is offered, and yes the vertical one,
    /// so it takes as many lines as that width needs.
    /// `lineLimit(nil)` first, because the cut is a LINE LIMIT and not a width:
    /// macOS's list styles cap a section footer at one line, and `fixedSize`
    /// alone will faithfully lay out that one line and still let it be clipped.
    func movarWrapping() -> some View {
        let wrapped =
            self
            .lineLimit(nil)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
#if os(macOS)
        // A macOS list draws its separators hard against the footer between
        // them, and the one-line footers these used to be got away with it.
        // Wrapped to two, the last line sits ON the rule BELOW — near enough
        // that the descenders of "перемикач." and "свідомо." are cut by it, so
        // the note reads as struck through rather than as a note.
        //
        // Both edges, and the bottom is the one that was actually wrong: the
        // rule that collides is the one the NEXT section brings, not the one
        // this footer sits under. iOS insets its own footers and needs neither.
        return wrapped.padding(.top, 5).padding(.bottom, 7)
#else
        return wrapped
#endif
    }
}

func movarUnhyphenated(_ string: String) -> Text {
    let atomicWords =
        string
        .split(separator: " ", omittingEmptySubsequences: false)
        .map { $0.map(String.init).joined(separator: "\u{2060}") }
        .joined(separator: " ")
    return Text(atomicWords)
}

/// The "one last step" card: Movar is installed but Safari has not been told to
/// run it yet.
///
/// ONE ROW, NOT FIVE. This is a single message — a heading, a line of
/// instruction, the route, and a closing note — and it was originally built as
/// five sibling rows in a `Section`, so `List` drew a separator between every
/// part of it. A hairline between a heading and its own subtitle is what made
/// this card read as a broken table rather than a paragraph, and no amount of
/// restyling the pieces fixes that while they are still separate rows.
///
/// The shape is the one every setup prompt converges on: heading, ONE short
/// instruction, the thing to do, and the reassurance last — held together by
/// spacing rather than divided by rules.
///
/// IT LIVES ON SETTINGS, NOT ON ABOUT. It used to open the About tab, which is
/// where it landed when About was the only native screen. But this is not
/// information about the app — it is the one task standing between the reader and
/// a working install, and About is the screen people reach for licences and a
/// changelog. Settings is where someone goes when Movar is not doing anything,
/// which is exactly the state this card describes and the only state it appears
/// in.
struct SetupBannerSection: View {

    let banner: EnablementBanner
    /// iOS only — records that the reader says they finished. See
    /// `SettingsView.setupCardDismissed` for why the app has to ask.
    let onDone: () -> Void

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: 12) {
                Text(banner.headline)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)

                movarUnhyphenated(banner.helper)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                pathRow

                switch banner.action {
                case .note(let text):
                    movarUnhyphenated(text)
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
    /// This is a ROUTE, not a checklist, and an earlier layout said otherwise:
    /// five icon rows stacked in a column are visually indistinguishable from
    /// five separate destinations, and readers hunted for five places to visit
    /// instead of following one path.
    ///
    /// So it is a chip chain, the way `AboutTab.tsx` has always drawn it, with
    /// the crumbs joined by "›". The wrapping is `Text`'s own: concatenated
    /// `Text` (including `Text(Image:)` for the SF Symbols) reflows as a single
    /// paragraph, so this needs no flow container — which is what the column was
    /// working around, since SwiftUI has no stock wrapping layout at this app's
    /// iOS 15.4 floor. It degrades the right way too: at the largest Dynamic Type
    /// sizes it simply becomes more lines, never a clipped row.
    ///
    /// VoiceOver still reads it as ONE route, joined by the localized connector,
    /// because crumbs with no spoken connector are destinations rather than a
    /// path. That is what replaces the React markup's `sr-only` "then" spans.
    private var pathRow: some View {
        var line = Text(verbatim: "")
        for (index, step) in banner.steps.enumerated() {
            if index > 0 {
                line = line + Text(verbatim: "  ›  ").foregroundColor(.secondary)
            }
            line = line + Self.crumb(step)
        }
        return
            line
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
    private static func crumb(_ step: PathStep) -> Text {
        switch step.glyph {
        case .symbol(let name):
            return Text(Image(systemName: name)).foregroundColor(.accentColor)
                + Text(verbatim: "\u{202F}")
                + Text(step.label)
        case .movarMark:
            // The mark is an ASSET, not an SF Symbol, and `Text(Image:)` sets an
            // asset at its intrinsic size — a 1024px icon dropped mid-sentence.
            // The destination crumb takes its emphasis from weight instead.
            return Text(step.label).fontWeight(.semibold)
        }
    }

    /// "I've done this" — the iOS card's only way to go away.
    ///
    /// A FULL-WIDTH CALL TO ACTION, which reverses an earlier call. It was
    /// bordered and natural-width on the argument that it does not perform the
    /// setup — it records that the reader did — and that a filled button would
    /// out-shout the path above it. That reasoning held for emphasis and ignored
    /// reach: it left the only actionable control on the card as a small target
    /// pinned to the leading edge, on the one screen a reader arrives at
    /// specifically to get something done. Emphasis is not what was scarce here.
    ///
    /// One-way, deliberately. A "show it again" control would be a second piece
    /// of state to explain — and the same walkthrough still exists in the
    /// extension's onboarding and on the marketing site if anyone needs it back.
    ///
    /// No symbol: "I've done this" reports a fact, and no SF Symbol says that.
    private var setupDoneButton: some View {
        MovarCallToAction(HostStrings.aboutSetupDone, action: onDone)
    }

    /// macOS only — `EnablementBanner` never produces this action on iOS, because
    /// no iOS API opens another app's settings pane and a button that did nothing
    /// would be worse than the sentence it replaced.
    private func openSafariSettingsButton(label: String) -> some View {
        MovarCallToAction(label) {
            HostActions.openSafariPreferences()
        }
    }
}
