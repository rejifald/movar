//
//  MovarMetrics.swift
//  Shared (App) / MovarKit
//
//  The size ladder — the only file (with MovarPalette) where a number is named.
//

import SwiftUI

/// Spacing, control heights and the few fixed shapes. Type is NOT here: it is
/// Dynamic Type roles (`.largeTitle … .caption`) used directly, never a point size.
enum MovarMetrics {

    /// The 4-pt step: 4 / 8 / 12 / 16 / 20 / 24 / 32.
    enum Space {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 20
        static let xl: CGFloat = 24
        static let xxl: CGFloat = 32
    }

    /// Control heights. iOS 32 / 44 / 50; macOS 22 / 28 (no prominent size on
    /// macOS — `prominent` equals `regular` there). List rows on macOS keep the
    /// platform default (36), so `Control.regular` is a MINIMUM for a row, not a
    /// height the list is forced to.
    enum Control {
#if os(iOS)
        static let compact: CGFloat = 32
        static let regular: CGFloat = 44
        static let prominent: CGFloat = 50
#else
        static let compact: CGFloat = 22
        static let regular: CGFloat = 28
        static let prominent: CGFloat = 28
#endif
    }

    /// The numbered-step disc.
    static let stepBadge: CGFloat = Space.xl
    /// The status dot.
    static let statusDot: CGFloat = Space.xs
    /// The glyph tile on the setup card.
    static let tile: CGFloat = Space.xxl
    /// The tile's corner radius. Cards and lists use the platform's own radius.
    static let cornerTile: CGFloat = Space.xs

    /// The macOS sidebar column: never narrower than `sidebarMin`, opens at
    /// `sidebarIdeal`.
    static let sidebarMin: CGFloat = 200
    static let sidebarIdeal: CGFloat = 240

    /// A hairline stroke, and the dash of the «not collected» badge.
    static let stroke: CGFloat = 1
    static let dash: [CGFloat] = [3, 2]

    /// How much of the real row a ghost keeps.
    static let ghostOpacity: Double = 0.45
}
