//
//  MovarRootView.swift
//  Shared (App)
//
//  The native tab shell: About in SwiftUI, the rest still in the WebView.
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

/// The four tabs, in bar order.
///
/// Raw values are the React `TabId` strings verbatim, because they are what the
/// native side sends the WebView to switch panels while three of the four are
/// still web. Order matches `App.tsx`'s `TABS`: Detector and Audit are both
/// "point Movar at something and read what it found"; Settings and About are app
/// chrome.
enum HostTab: String, CaseIterable, Hashable {
    case detector
    case audit
    case settings
    case about

    var title: String {
        switch self {
        case .detector: return HostStrings.tabDetector
        case .audit: return HostStrings.tabAudit
        case .settings: return HostStrings.tabSettings
        case .about: return HostStrings.tabAbout
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
        case .about: return "info.circle"
        }
    }
}

/// The app's root: a stock `TabView`, half native, half still web.
///
/// This is the "incrementally retired" shape `docs/native-shells.md` asks for.
/// The WebView is no longer the screen — it is the content of the two tabs that
/// have not moved — and the `<div className="tabs" role="tablist">` that used to
/// draw the tab bar is replaced by the real thing. That swap is most of the
/// accessibility win on its own: the web bar hand-rolled roving tabindex and
/// arrow-key handling, while `TabView` brings VoiceOver, Full Keyboard Access,
/// Dynamic Type and Reduce Motion with it.
///
/// About moved first (no engine, no state). Detector moved second, and is the
/// slice that put the headless engine in the app: its verdict comes from
/// `@movar/lang-detect` running in `EngineHost`, never from Swift, so the tab
/// cannot drift from the classifier the extension uses on real pages. Audit and
/// Settings are next, and both already have their engine requests defined.
///
/// The tint is applied ONCE, here, and is the only brand customisation in the
/// native UI.
struct MovarRootView: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var detector: DetectorModel
    let surface: WebSurface

    /// Opens on Detector, as the React shell does.
    @State private var selection: HostTab = .detector

    var body: some View {
        // Written out rather than looped, because `TabView` identity is what
        // `selection` binds to and a `ForEach` puts one more layer between the
        // tag and the tab. Four tabs is not enough repetition to trade that for.
        TabView(selection: $selection) {
            DetectorView(model: detector)
                .tabItem { Label(HostTab.detector.title, systemImage: HostTab.detector.symbol) }
                .tag(HostTab.detector)
            webTab(.audit)
            webTab(.settings)
            AboutView(host: host)
                .tabItem { Label(HostTab.about.title, systemImage: HostTab.about.symbol) }
                .tag(HostTab.about)
        }
        .movarTint()
    }

    /// One of the three tabs still rendered by the WebView.
    ///
    /// No `edgesIgnoringSafeArea` on purpose. SwiftUI insets the tab content
    /// above the tab bar and below the notch, which drives the page's own
    /// `env(safe-area-inset-*)` to zero — so the WebView keeps exactly one
    /// source of truth for its insets instead of adding the CSS reservation to a
    /// native one it cannot see. `styles.css`'s `body.native-chrome` releases the
    /// space the web tab bar used to need.
    private func webTab(_ tab: HostTab) -> some View {
        HostWebView(surface: surface, tab: tab, isActive: selection == tab)
            .tabItem { Label(tab.title, systemImage: tab.symbol) }
            .tag(tab)
    }
}

/// The single `WKWebView`, and which tab is currently showing it.
///
/// THE WEB VIEW IS SHARED, NOT ONE PER TAB, and that is not an optimisation. It
/// is one React application with one bridge, one settings port, one in-memory
/// list of previous audits and one `show()` state feed; three instances would be
/// three of each, and the Audit tab's session-only run history would quietly
/// depend on which tab you were standing in. So the view moves between the three
/// tabs' containers, and the WebView is told which panel to display.
///
/// A `UIView`/`NSView` can have exactly one superview, which is why this has to
/// be an object with an owner rather than state inside the `View` struct: SwiftUI
/// rebuilds the struct freely, and re-parenting on every rebuild would tear the
/// web view out of the hierarchy mid-scroll.
@MainActor
final class WebSurface {

    let webView: WKWebView

    /// Which slot currently holds the web view. Weak because the slot belongs to
    /// SwiftUI's view hierarchy and may be discarded without telling us.
    private weak var attachedSlot: PlatformView?

    /// The tab the WebView should be displaying. Held even before the page can
    /// answer, because the first selection happens while the bundle is still
    /// loading — see {@link pageDidLoad}.
    ///
    /// Defaults to the first tab the WebView still owns. It was `.detector`,
    /// which is now native: nothing would ever have selected it, so the hidden
    /// web shell sat rendering a panel no one can reach until the reader opened
    /// Audit. Harmless, but it made the default a stale fact rather than a
    /// starting point.
    private var requestedTab: HostTab = .audit
    private var isPageLoaded = false

    init(webView: WKWebView) {
        self.webView = webView
    }

    /// Move the web view into `slot` and pin it there.
    ///
    /// Idempotent: re-parenting a `WKWebView` is cheap but not free (it drops out
    /// of the window for a moment), so a repeat call for the slot that already
    /// holds it does nothing. SwiftUI calls `update` far more often than the
    /// selection actually changes.
    func attach(to slot: PlatformView) {
        guard attachedSlot !== slot else { return }
        attachedSlot = slot

        webView.removeFromSuperview()
        webView.translatesAutoresizingMaskIntoConstraints = false
        slot.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: slot.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: slot.trailingAnchor),
            webView.topAnchor.constraint(equalTo: slot.topAnchor),
            webView.bottomAnchor.constraint(equalTo: slot.bottomAnchor),
        ])
    }

    /// Ask the WebView to show `tab`'s panel.
    ///
    /// The web side installs `__movarSelectTab` at module eval (see
    /// `bridge.ts`), for the same reason it installs `show()` there: a native
    /// call can land before React's first effect runs, and a selection dropped
    /// into that gap would leave the native tab bar and the panel disagreeing.
    /// The guard in the evaluated source covers the OTHER direction — a bundle
    /// old enough not to have the hook at all, where the native bar still works
    /// and the panel simply does not follow.
    func select(tab: HostTab) {
        requestedTab = tab
        guard isPageLoaded else { return }
        let literal = tab.rawValue
        webView.evaluateJavaScript(
            "if (window.__movarSelectTab) window.__movarSelectTab('\(literal)')")
    }

    /// The bundle has finished loading; replay whatever was asked for meanwhile.
    func pageDidLoad() {
        isPageLoaded = true
        select(tab: requestedTab)
    }
}

/// One tab's slot for the shared web view.
///
/// `makeUIView`/`makeNSView` returns an empty container rather than the web view
/// itself, because three tabs cannot each return the same instance — the last
/// one to be built would steal it from the other two. The container is what
/// belongs to the tab; the web view visits it.
///
/// `isActive` is the guard that keeps the visit deterministic. `TabView`
/// materialises every tab's content on macOS and updates offscreen tabs on both
/// platforms, so without it whichever tab SwiftUI updated last would win,
/// regardless of which one the person is looking at.
struct HostWebView {
    let surface: WebSurface
    let tab: HostTab
    let isActive: Bool

    // Both halves touch UIKit/AppKit and `WebSurface`, so both are explicitly
    // main-actor. The representable protocols already guarantee it, and the app
    // targets build with `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` — saying it
    // here keeps the file honest under either setting rather than relying on
    // whichever one happens to be in effect.
    @MainActor
    fileprivate func makeSlot() -> PlatformView {
        let slot = PlatformView()
#if os(macOS)
        slot.wantsLayer = true
#endif
        return slot
    }

    @MainActor
    fileprivate func sync(_ slot: PlatformView) {
        guard isActive else { return }
        surface.attach(to: slot)
        surface.select(tab: tab)
    }
}

#if os(iOS)
extension HostWebView: UIViewRepresentable {
    func makeUIView(context: Context) -> PlatformView { makeSlot() }
    func updateUIView(_ slot: PlatformView, context: Context) { sync(slot) }
}
#elseif os(macOS)
extension HostWebView: NSViewRepresentable {
    func makeNSView(context: Context) -> PlatformView { makeSlot() }
    func updateNSView(_ slot: PlatformView, context: Context) { sync(slot) }
}
#endif

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
