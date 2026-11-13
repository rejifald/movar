//
//  MovarPalette.swift
//  Shared (App) / MovarKit
//
//  Semantic colours — the only file (with MovarMetrics) where a colour is named.
//

import SwiftUI

#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// Colours by ROLE. Every screen asks for `MovarPalette.brandText`, never for a
/// hex or a system colour, so a role can move without a screen noticing.
///
/// System-backed roles track light/dark and increased contrast for free. The
/// one brand role that is not a system colour (`brandText`) is a dynamic colour
/// built without an asset catalogue, so this file stays the single source.
enum MovarPalette {

    // MARK: Surfaces

    /// The page behind grouped lists.
    static let background: Color = {
#if os(iOS)
        Color(UIColor.systemGroupedBackground)
#else
        Color(NSColor.windowBackgroundColor)
#endif
    }()

    /// A row's own surface, one step above `background`.
    static let row: Color = {
#if os(iOS)
        Color(UIColor.secondarySystemGroupedBackground)
#else
        Color(NSColor.controlBackgroundColor)
#endif
    }()

    // MARK: Text and lines

    static let label: Color = {
#if os(iOS)
        Color(UIColor.label)
#else
        Color(NSColor.labelColor)
#endif
    }()

    static let secondaryLabel: Color = {
#if os(iOS)
        Color(UIColor.secondaryLabel)
#else
        Color(NSColor.secondaryLabelColor)
#endif
    }()

    static let separator: Color = {
#if os(iOS)
        Color(UIColor.separator)
#else
        Color(NSColor.separatorColor)
#endif
    }()

    // MARK: Brand

    /// Forest 700 — a FILL (buttons, dots, glyph tiles), never body text.
    /// The value is `MovarBrand.accent`'s, referenced rather than copied so the
    /// two cannot fork.
    static let brandFill: Color = MovarBrand.accent

    /// Brand-coloured TEXT and glyphs: `@movar/theme`'s `accent-text`,
    /// `#166534` light / `#86efac` dark. Forest 700 itself is too thin on a
    /// near-black surface at text sizes.
    static let brandText: Color = {
#if os(iOS)
        Color(
            UIColor { trait in
                trait.userInterfaceStyle == .dark
                    ? UIColor(red: 134.0 / 255.0, green: 239.0 / 255.0, blue: 172.0 / 255.0, alpha: 1)
                    : UIColor(red: 22.0 / 255.0, green: 101.0 / 255.0, blue: 52.0 / 255.0, alpha: 1)
            })
#else
        Color(
            NSColor(name: nil) { appearance in
                appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                    ? NSColor(srgbRed: 134.0 / 255.0, green: 239.0 / 255.0, blue: 172.0 / 255.0, alpha: 1)
                    : NSColor(srgbRed: 22.0 / 255.0, green: 101.0 / 255.0, blue: 52.0 / 255.0, alpha: 1)
            })
#endif
    }()

    /// A secondary action's body: `brandFill` at 12%.
    static let brandTint: Color = brandFill.opacity(tintOpacity)

    /// Content drawn ON a `brandFill` surface.
    static let onBrand: Color = Color.white

    // MARK: Status

    /// Errors and the «fail» verdict.
    static let danger: Color = {
#if os(iOS)
        Color(UIColor.systemRed)
#else
        Color(NSColor.systemRed)
#endif
    }()

    static let dangerTint: Color = danger.opacity(tintOpacity)

    /// The macOS «extension is off» dot.
    static let warning: Color = {
#if os(iOS)
        Color(UIColor.systemOrange)
#else
        Color(NSColor.systemOrange)
#endif
    }()

    /// The neutral badge fill (the «warn» verdict, which is a word, not a hue).
    static let neutralTint: Color = secondaryLabel.opacity(tintOpacity)

    private static let tintOpacity: Double = 0.12
}
