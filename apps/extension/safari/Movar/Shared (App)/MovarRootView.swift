//
//  MovarRootView.swift
//  Shared (App)
//
//  The native tab shell: Settings (and About behind it) in SwiftUI, the two
//  report tabs still in the WebView.
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

/// The three tabs, in bar order.
///
/// Raw values are the React `TabId` strings verbatim, because they are what the
/// native side sends the WebView to switch panels while ONE of the three is
/// still web. Order matches `App.tsx`'s `TABS`: Detector and Audit are both
/// "point Movar at something and read what it found"; Settings is app chrome.
///
/// THERE WAS A FOURTH. About had a tab of its own until Settings went native,
/// and it lost the slot rather than the screen: Apple's tab-bar guidance weighs
/// a tab against "the need for people to **frequently access each section**", and
/// eighteen sampled iOS apps put About behind Settings without exception. It is
/// now the last row of `SettingsView`. The `about` raw value goes with it — the
/// native side never asks the WebView for that panel any more, and `App.tsx`'s
/// `isTabId` narrows anything it does not recognise, so an id this enum no longer
/// spells simply leaves the web selection alone.
enum HostTab: String, CaseIterable, Hashable {
    case detector
    case audit
    case settings

    var title: String {
        switch self {
        case .detector: return HostStrings.tabDetector
        case .audit: return HostStrings.tabAudit
        case .settings: return HostStrings.tabSettings
        }
    }

    /// SF Symbols in place of the lucide icons the web tab bar drew.
    var symbol: String {
        switch self {
        case .detector: return "textformat"
        // A document under inspection, not a bare lens: this tab PRODUCES
        // something — a language conformance report — and a lone magnifying
        // glass says "search", which is also what the URL box beneath it looks
        // like. The same reasoning as the web tab bar's `FileSearch`.
        case .audit: return "doc.text.magnifyingglass"
        case .settings: return "gearshape"
        }
    }
}

/// The app's root: a stock `TabView`, and the end of the WebView as a renderer.
///
/// This is the last step of the "incrementally retired" shape
/// `docs/native-shells.md` asks for. **All three tabs are native**, so the
/// `<div className="tabs" role="tablist">` that used to draw the tab bar is not
/// merely replaced by the real thing — there is no longer a panel behind it. The
/// swap is most of the accessibility win on its own: the web bar hand-rolled
/// roving tabindex and arrow-key handling, while `TabView` brings VoiceOver, Full
/// Keyboard Access, Dynamic Type and Reduce Motion with it.
///
/// Four slices got here. About moved first, because it needed no engine and no
/// state. Settings moved next and took About behind it, dropping the bar from
/// four tabs to three. Detector put the headless engine in the app: its verdict
/// comes from `@movar/lang-detect` running in `EngineHost`, never from Swift, so
/// the tab cannot drift from the classifier the extension uses on real pages.
/// Audit is last and largest — the ADR predicted it would collect the most, "an
/// expandable list of rule results is a native list, and it is what users spend
/// their time in" — and it runs on the same `EngineHost` for the same reason:
/// `evaluate()` is the pure kernel the CLI runs, so a `Report` rendered here and
/// a `Report` rendered by the CLI are the same document.
///
/// `WebSurface` and `HostWebView` went with the last web tab, exactly as the
/// previous slice's comment said they would ("when Audit moves the whole function
/// goes with it"). `ViewController` still LOADS the React bundle — it is what the
/// `readSettings` / `writeSettings` bridge answers to, and retiring that page is
/// the ADR's own separate step — but nothing displays it any more.
///
/// The tint is applied ONCE, here, and is the only brand customisation in the
/// native UI.
struct MovarRootView: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var detector: DetectorModel
    @ObservedObject var audit: AuditModel
    @ObservedObject var settings: SettingsStore

    /// Opens on Detector, as the React shell did.
    @State private var selection: HostTab = .detector

    var body: some View {
        // Written out rather than looped, because `TabView` identity is what
        // `selection` binds to and a `ForEach` puts one more layer between the
        // tag and the tab. Three tabs is not enough repetition to trade that for.
        TabView(selection: $selection) {
            DetectorView(model: detector)
                .tabItem { Label(HostTab.detector.title, systemImage: HostTab.detector.symbol) }
                .tag(HostTab.detector)
            AuditView(model: audit)
                .tabItem { Label(HostTab.audit.title, systemImage: HostTab.audit.symbol) }
                .tag(HostTab.audit)
            SettingsView(host: host, store: settings)
                .tabItem { Label(HostTab.settings.title, systemImage: HostTab.settings.symbol) }
                .tag(HostTab.settings)
        }
        .movarTint()
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
    @ViewBuilder
    func movarTint() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.tint(MovarBrand.accent)
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
