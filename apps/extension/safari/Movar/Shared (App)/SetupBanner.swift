//
//  SetupBanner.swift
//  Shared (App)
//
//  Text helpers shared by MovarKit and About: wrapping footers, and body copy
//  with hyphenation switched off.
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
/// Used by `MovarSection` footers, `MovarStatusCard` and About's lede.
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
