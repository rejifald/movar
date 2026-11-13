//
//  MovarSection.swift
//  Shared (App) / MovarKit
//

import SwiftUI

/// A `Section` with the app's header/footer typography.
///
/// The footer carries the macOS fix that used to live in `SetupBannerSection`:
/// `movarWrapping()` lifts the one-line footer cap and pads it off the next
/// rule, and `movarUnhyphenated` keeps Ukrainian words whole.
struct MovarSection<Content: View>: View {

    private let header: String?
    private let footer: String?
    private let content: Content

    init(_ header: String? = nil, footer: String? = nil, @ViewBuilder content: () -> Content) {
        self.header = header
        self.footer = footer
        self.content = content()
    }

    var body: some View {
        Section(header: headerView, footer: footerView) {
            content
        }
    }

    @ViewBuilder
    private var headerView: some View {
        if let header = header {
            Text(header)
                .font(.footnote)
                .foregroundColor(MovarPalette.secondaryLabel)
                .textCase(nil)
        }
    }

    @ViewBuilder
    private var footerView: some View {
        if let footer = footer {
            movarUnhyphenated(footer)
                .font(.footnote)
                .foregroundColor(MovarPalette.secondaryLabel)
                .movarWrapping()
        }
    }
}
