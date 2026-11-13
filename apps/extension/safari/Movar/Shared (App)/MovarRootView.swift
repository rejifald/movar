//
//  MovarRootView.swift
//  Shared (App)
//
//  The native root: the iOS home list and the macOS sidebar shell.
//

import SwiftUI
import WebKit

#if os(iOS)
import UIKit
typealias PlatformView = UIView
#elseif os(macOS)
import AppKit
typealias PlatformView = NSView
#endif

/// The one thing that crosses from `@movar/theme` into the native shells.
///
/// `docs/native-shells.md` ("What crosses the boundary") narrows the brand to a
/// colour pair and the mark. Everything else the theme owns — `space`, `radius`,
/// `breakpoints`, `shadow`, `duration`, `easing`, the whole `fontSizeUi` ladder —
/// answers questions the platform has already answered, and pushing it across is
/// how an app ends up looking like a web page wearing a native tab bar.
enum MovarBrand {

    /// Forest 700, `#15803d` — `@movar/theme`'s `--accent`.
    ///
    /// Hand-transcribed rather than generated: the ADR calls for a Swift emitter
    /// beside `gen-theme-css.mts` so brand cannot fork, and that emitter does not
    /// exist yet. One constant in one file is the smallest thing to replace when
    /// it does.
    ///
    /// The same value in light and dark, matching the web palette, where `accent`
    /// is one of the few colours `colorDarkOverrides` leaves alone. The ADR files
    /// this as an open question — Forest 700 on a near-black background is thin
    /// for anything text-sized — so this is a deliberate match with the web today
    /// rather than a decision that dark mode needs nothing.
    static let accent = Color(red: 21.0 / 255.0, green: 128.0 / 255.0, blue: 61.0 / 255.0)
}

/// The app's root: one list on iOS, a sidebar with a detail pane on macOS.
///
/// iOS: a single navigation container around `HomeView` — the setup card, Audit,
/// the three language rows, and «Більше». macOS: `MacSidebarShell`, the same
/// list as a sidebar.
///
/// The tint is applied ONCE, here, and is the only brand customisation in the
/// native UI.
struct MovarRootView: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var audit: AuditModel
    @ObservedObject var settings: SettingsStore

    var body: some View {
#if os(macOS)
        MacSidebarShell(host: host, audit: audit, store: settings)
            .movarTint()
#else
        HomeView(host: host, audit: audit, store: settings)
            .movarNavigationContainer(HostStrings.chipMovar, largeTitle: true)
            // Once, on the root container: a sheet inside a list row is
            // unreliable on iOS 15.
            .auditConfirmSheet(audit)
            .movarTint()
#endif
    }
}

// MARK: - Version seams

extension View {

    /// The brand accent, as the platform's own tint.
    ///
    /// macOS 11 predates `.tint`; `accentColor` is its exact predecessor and
    /// does the same job there. The fallback is wrapped in a deprecated helper so
    /// the deprecation warning fires once, on the helper, instead of on every
    /// call site — and so it keeps pointing at the day the macOS floor moves past
    /// 12 and this whole seam can go.
    /// BOTH channels, because they are not the same channel.
    ///
    /// `.tint` colours CONTROLS. `Color.accentColor` — what a `Label`'s icon
    /// takes, and what every `.foregroundColor(.accentColor)` in this app
    /// resolves through — is a separate environment value that `.tint` does not
    /// set. On iOS the two agree closely enough that nothing showed; on macOS the
    /// gap is visible, and `Color.accentColor` fell through to the SYSTEM accent:
    /// the Audit tab's "What is Movar Audit" carried a blue `info.circle` beside
    /// a green run button, on the one screen whose brand is one colour.
    ///
    /// So the accent is applied twice — once for controls, once for the colour
    /// value — and `legacyAccent` is reused for the second because
    /// `.accentColor` is exactly the API that sets it, deprecation and all.
    @ViewBuilder
    func movarTint() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            legacyAccent(self.tint(MovarBrand.accent))
        } else {
            legacyAccent(self)
        }
    }
}

/// macOS 11 / iOS 14's tint. Deprecated in step with the API it calls, so the
/// call inside does not warn and the compiler still nags about the seam itself.
@available(iOS, deprecated: 15.0, message: "Use .tint once the iOS floor is 15+")
@available(macOS, deprecated: 12.0, message: "Use .tint once the macOS floor is 12+")
private func legacyAccent<Content: View>(_ content: Content) -> some View {
    content.accentColor(MovarBrand.accent)
}
