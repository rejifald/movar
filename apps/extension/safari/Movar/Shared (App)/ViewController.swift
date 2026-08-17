//
//  ViewController.swift
//  Shared (App)
//
//  Created by Oleksandr Zhuravlov on 01.06.26.
//

import SwiftUI
import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
typealias PlatformHostingController = UIHostingController
#elseif os(macOS)
import Cocoa
import SafariServices
import UniformTypeIdentifiers
typealias PlatformViewController = NSViewController
typealias PlatformHostingController = NSHostingController
#endif

let extensionBundleIdentifier = "fyi.movar.safari.extension"

/// Shared App Group store for `MovarSettings`. The host app's settings panel
/// writes here; the Safari Web Extension reads/writes the same suite over native
/// messaging (see SafariWebExtensionHandler). A monotonic `rev` lets either side
/// detect "the other one changed it" — last writer (highest rev) wins on the
/// next reconcile. The blob is the extension's settings JSON verbatim, so no
/// schema lives natively; the extension validates/migrates on adoption.
enum MovarAppGroup {
    static let suiteName = "group.fyi.movar.safari"
    static let settingsKey = "settings"
    static let revKey = "settingsRev"

    private static func defaults() -> UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    /// `{ "rev": Int, "settings": <object | null> }` — shaped for JSON.parse on
    /// the web side. `settings` is the parsed object (not a nested JSON string)
    /// so the page can feed it straight into the bundled migrateSettings.
    static func read() -> [String: Any] {
        guard let store = defaults() else { return ["rev": 0, "settings": NSNull()] }
        let rev = store.integer(forKey: revKey)
        if let raw = store.string(forKey: settingsKey),
            let data = raw.data(using: .utf8),
            let object = try? JSONSerialization.jsonObject(with: data) {
            return ["rev": rev, "settings": object]
        }
        return ["rev": rev, "settings": NSNull()]
    }

    /// Persist a settings object, bumping `rev`. Returns the new rev (or the
    /// unchanged rev if `settings` isn't a serialisable object).
    @discardableResult
    static func write(settings: Any?) -> Int {
        guard let store = defaults() else { return 0 }
        guard let settings = settings,
            JSONSerialization.isValidJSONObject(settings),
            let data = try? JSONSerialization.data(withJSONObject: settings),
            let json = String(data: data, encoding: .utf8)
        else {
            return store.integer(forKey: revKey)
        }
        store.set(json, forKey: settingsKey)
        let nextRev = store.integer(forKey: revKey) + 1
        store.set(nextRev, forKey: revKey)
        return nextRev
    }
}

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    /// Movar Audit's HTTP tier — see `AuditProbe.swift`. Held for the
    /// controller's lifetime because the request budget it enforces spans a
    /// whole audit run, not one message.
    private let prober = AuditProber()

    /// What the native About screen knows about this app. Written here and only
    /// here, from the same facts pushed into the WebView's `show()` — see
    /// `publishHostState()`.
    private let hostModel = HostStateModel()

    /// Movar's JavaScript half, in a WebView that never renders.
    ///
    /// Created eagerly: it has a bundle to parse before it can answer, and doing
    /// that at launch means the Detector tab is live by the time anyone has
    /// finished pasting into it. Requests that arrive first are queued, so the
    /// eagerness is an optimisation rather than a correctness requirement.
    private lazy var engine = EngineHost(prober: self.prober)

    /// The Detector tab's state, over that engine.
    private lazy var detectorModel = DetectorModel(engine: self.engine)

    /// The settings the native Settings tab reads and writes.
    ///
    /// Owned here rather than by the view, so it outlives any SwiftUI rebuild and
    /// so {@link refreshOnForeground} has something to re-read.
    private let settingsStore = SettingsStore()

    /// The Audit tab's state, over the same engine.
    ///
    /// Owned here for the same reason `settingsStore` and `detectorModel` are: a
    /// `TabView` rebuilds its content freely, and a model rebuilt with it would
    /// drop a running audit's callbacks on every tab switch — while the session's
    /// list of finished runs would quietly depend on which tab you were standing
    /// in.
    ///
    /// ONE engine for both tabs, not one each. The request budget
    /// `AuditProbeLimits` enforces is per audit against a third party's server,
    /// and two engines would be two budgets — the ceiling would stop meaning what
    /// it says. Detector's own requests are pure and local, so they cost the
    /// shared host nothing.
    private lazy var auditModel = AuditModel(engine: self.engine)

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

        // Without this, Safari's Web Inspector can't attach to the WKWebView on
        // a real device (Simulator doesn't need it) — there'd be no way to see
        // console errors when this screen fails to render.
#if os(iOS)
        if #available(iOS 16.4, *) {
            self.webView.isInspectable = true
        }

        // The screen now scrolls — it hosts the language tool and the settings
        // panel below the fold, not just a single centered message.
        self.webView.scrollView.isScrollEnabled = true
#elseif os(macOS)
        if #available(macOS 13.3, *) {
            self.webView.isInspectable = true
        }
#endif

        self.webView.configuration.userContentController.add(self, name: "controller")

        // Re-read what the world may have changed while we were away. BOTH
        // platforms, unlike the macOS-only extension-state refresh this grew out
        // of, because the settings half is not macOS-specific: Safari's popup
        // writes the same App Group record this app is showing — "Always skip
        // this site" adds to the very allowlist the Settings tab has on screen —
        // and a stale screen would write that record back whole on the reader's
        // next edit, silently reverting what they did in the popup.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(refreshOnForeground),
            name: Self.didBecomeActiveNotification,
            object: nil
        )

        // Publish the host facts BEFORE the shell renders, so the setup banner
        // has never been in the pre-report state anyone can see. On macOS the
        // extension's enabled flag is still unknown at this point — that one
        // arrives from `refreshExtensionState()`.
        publishHostState()
        installNativeShell()

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
    }

    /// Replace the WebView-as-the-whole-screen with a native tab shell.
    ///
    /// The storyboard still owns the `WKWebView` — it is where the outlet, the
    /// configuration and the whole bridge live, and none of that needed to
    /// change to put a real tab bar around it. What changes is where the view
    /// hangs: it comes out of this controller's root view and becomes the
    /// content of two tabs (`WebSurface`), while Settings and About render in
    /// SwiftUI.
    ///
    /// The hosting controller is added as a CHILD rather than swapping
    /// `self.view`, so `ViewController` keeps being the thing the storyboard
    /// instantiated, keeps its `WKScriptMessageHandler` conformance, and keeps
    /// the macOS window sizing in `viewWillAppear`. This is the shell the ADR
    /// asks for and nothing more: the remaining two tabs are byte-identical to
    /// what they rendered yesterday.
    private func installNativeShell() {
        // Out of the storyboard's layout; `WebSurface` re-parents it into
        // whichever tab is showing. The outlet holds a strong reference, so
        // removing it from its superview does not deallocate it.
        self.webView.removeFromSuperview()

        let shell = PlatformHostingController(
            rootView: MovarRootView(
                host: hostModel,
                detector: detectorModel,
                audit: auditModel,
                settings: settingsStore))
        addChild(shell)
        shell.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(shell.view)
        NSLayoutConstraint.activate([
            shell.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            shell.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            shell.view.topAnchor.constraint(equalTo: view.topAnchor),
            shell.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
#if os(iOS)
        shell.didMove(toParent: self)
#endif

        // The engine's WebView, parked at zero size. It renders nothing and is
        // never seen; it is in the hierarchy because a `WKWebView` with no window
        // is a suspendable web process, and an audit stalled halfway through the
        // matrix would look like a site that stopped answering. See
        // `EngineHost.attach(to:)`.
        engine.attach(to: view)
    }

    /// Hand the native About screen the same snapshot the WebView gets.
    ///
    /// Deliberately the SAME facts, computed once: platform, and then whatever
    /// this platform can actually answer. iOS knows its major version and can
    /// never know whether the extension is enabled (`SFSafariExtensionManager`
    /// is macOS-only); macOS knows which name Safari gives the pane and learns
    /// the enabled flag asynchronously.
    ///
    /// Two consumers, one derivation — because a native banner that said "Movar
    /// is on" while the Settings tab behind it thought otherwise would be a bug
    /// nobody could reproduce from either side alone.
    private func publishHostState() {
#if os(iOS)
        hostModel.state = HostState(
            platform: .iOS,
            isExtensionEnabled: nil,
            usesSettingsWording: nil,
            iOSMajorVersion: ProcessInfo.processInfo.operatingSystemVersion.majorVersion
        )
#elseif os(macOS)
        hostModel.state = HostState(
            platform: .mac,
            isExtensionEnabled: hostModel.state?.isExtensionEnabled,
            usesSettingsWording: Self.macUsesSettingsWording,
            iOSMajorVersion: nil
        )
#endif
    }

#if os(macOS)
    /// macOS 13 renamed the pane "Settings"; 12 and earlier said "Preferences".
    /// The same test `refreshExtensionState()` passes to the WebView.
    private static var macUsesSettingsWording: Bool {
        if #available(macOS 13, *) { return true }
        return false
    }
#endif

    /// "The app came back to the front", under each platform's name for it.
    private static var didBecomeActiveNotification: Notification.Name {
#if os(iOS)
        UIApplication.didBecomeActiveNotification
#else
        NSApplication.didBecomeActiveNotification
#endif
    }

    /// Re-read everything the app cannot be notified about.
    ///
    /// The settings on both platforms, and on macOS the extension's enabled flag
    /// as well — `SFSafariExtensionManager` is the only one of the two that has
    /// an answer to give, and only there.
    @objc private func refreshOnForeground() {
        settingsStore.reload()
#if os(macOS)
        refreshExtensionState()
#endif
    }

#if os(macOS)
    override func viewWillAppear() {
        super.viewWillAppear()
        // The host screen stacks a fixed top brand bar, a scrolling settings
        // panel, and a fixed bottom tab bar. The window is resizable (see
        // Main.storyboard); pin a floor so a resize can't shrink it below the
        // point where those three zones stop fitting. The default size lives in
        // the storyboard's contentRect.
        self.view.window?.contentMinSize = NSSize(width: 380, height: 480)
    }
#endif

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // NOTHING DISPLAYS THIS PAGE ANY MORE. With Audit native, the last web
        // tab is gone and `WebSurface` went with it — so there is no panel to
        // select and no selection to replay. The bundle still loads because it is
        // what the `readSettings` / `writeSettings` bridge answers to, and
        // retiring that page is the ADR's own separate step; `show()` below still
        // runs so a build that has not been rebuilt against this one keeps
        // behaving.

#if os(iOS)
        // Pass the iOS major version so the About screen can show the
        // version-correct Settings path: Apple only added the "Apps" grouping
        // (Settings ▸ Apps ▸ Safari) in iOS 18; earlier iOS puts Safari at the
        // Settings root. iOS can't query the extension's enabled state
        // (SFSafariExtensionManager is macOS-only), so enabled/useSettings stay
        // undefined and the version rides in the 4th argument.
        let iosMajor = ProcessInfo.processInfo.operatingSystemVersion.majorVersion
        webView.evaluateJavaScript("show('ios', undefined, undefined, \(iosMajor))")
#elseif os(macOS)
        webView.evaluateJavaScript("show('mac')")
        refreshExtensionState()
#endif
    }

#if os(macOS)
    @objc func refreshExtensionState() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }

            DispatchQueue.main.async {
                let useSettings = Self.macUsesSettingsWording
                self.webView.evaluateJavaScript(
                    "show('mac', \(state.isEnabled), \(useSettings))")
                // The native About banner reads the same answer — one refresh,
                // both surfaces, so they cannot disagree about whether Movar is
                // on.
                self.hostModel.state = HostState(
                    platform: .mac,
                    isExtensionEnabled: state.isEnabled,
                    usesSettingsWording: useSettings,
                    iOSMajorVersion: nil
                )
            }
        }
    }
#endif

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Legacy string form: a bare "open-preferences" command (macOS).
        if let command = message.body as? String {
            if command == "open-preferences" { HostActions.openSafariPreferences() }
            return
        }

        // Structured form: { type, id, payload }. Read/write settings flow
        // through the shared App Group; replies go back via window.__movarReply.
        guard let dict = message.body as? [String: Any],
            let type = dict["type"] as? String
        else { return }
        let id = (dict["id"] as? NSNumber)?.intValue

        switch type {
        case "open-preferences":
            HostActions.openSafariPreferences()
        case "readSettings":
            reply(id: id, payload: MovarAppGroup.read())
        case "writeSettings":
            let rev = MovarAppGroup.write(settings: dict["payload"])
            reply(id: id, payload: ["rev": rev])
        case "feedback":
            // No payload — the address is `HostActions`' constant, not the
            // page's, so a compromised page cannot choose who gets mailed.
            HostActions.openFeedback()
        case "open-url":
            // Whatever is left of the web layer's outward links (the Audit
            // report's "open the site", and the About footer while an older
            // bundle is still installed). The payload is only ever a
            // @movar/brand constant the bundle baked in, but it arrives as an
            // untrusted string over the JS bridge, so it is validated before it
            // reaches UIApplication/NSWorkspace: https only, with a host. That
            // refusal is what stops a hypothetical injected script from turning
            // this into a launcher for file:, mailto:, or a custom app scheme.
            if let raw = dict["payload"] as? String, let url = HostActions.httpsURL(from: raw) {
                HostActions.openExternally(url)
            }
        case "exportReport":
            // Movar Audit's artifact hand-off. The web layer builds ONE
            // self-contained HTML document (report + embedded evidence + the
            // replay command, per ADR §8) and this writes it somewhere the
            // person can actually keep — the WebView has no filesystem and no
            // share sheet of its own.
            exportReport(payload: dict["payload"]) { [weak self] result in
                self?.reply(id: id, payload: result)
            }
        case "probe":
            // Movar Audit's ONLY egress. The host screen runs under
            // `default-src 'self'` from a `file://` URL and cannot fetch
            // anything itself, so every request an audit makes to a third-party
            // site is made here — one auditable place. `AuditProber` owns the
            // network posture (declared User-Agent, manual redirect walk, cold
            // cookies, hard request budget, challenge detection); this case only
            // routes the message and returns the reply.
            prober.handle(payload: dict["payload"]) { [weak self] result in
                self?.reply(id: id, payload: result)
            }
        default:
            break
        }
    }

    /// The bridge's half of the export hand-off.
    ///
    /// The work moved to `HostActions.exportReport` when the Audit tab went
    /// native and needed the same capability — one implementation, two callers,
    /// which is the arrangement the four link actions already have. This is the
    /// adapter: unwrap the untrusted payload, and turn an outcome back into the
    /// `{ saved, reason }` reply `bridge.ts` has always read.
    ///
    /// It stays even though nothing in the shipped app posts `exportReport` any
    /// more: the standalone web build still renders the Audit tab (dev server,
    /// `vite preview`, its own tests), and an older bundle inside an updated app
    /// would otherwise find the message silently unhandled.
    private func exportReport(payload: Any?, completion: @escaping ([String: Any]) -> Void) {
        guard let request = payload as? [String: Any],
            let html = request["html"] as? String,
            let filename = request["filename"] as? String
        else {
            completion(["saved": false, "reason": "invalid-request"])
            return
        }
        HostActions.exportReport(filename: filename, html: html) { outcome in
            switch outcome {
            case .saved:
                completion(["saved": true])
            case .cancelled:
                completion(["saved": false, "reason": "cancelled"])
            case .unavailable(let reason):
                completion(["saved": false, "reason": reason])
            }
        }
    }

    /// Resolve a pending web-side callNative() promise. Serialises `payload` to
    /// JSON and hands it to window.__movarReply(id, json) as a JSON string —
    /// double-encoded so any contents embed safely in the evaluated source.
    private func reply(id: Int?, payload: [String: Any]) {
        guard let id = id else { return }
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8),
            let literalData = try? JSONSerialization.data(
                withJSONObject: json, options: .fragmentsAllowed),
            let literal = String(data: literalData, encoding: .utf8)
        else { return }

        let js = "window.__movarReply(\(id), \(literal))"
        DispatchQueue.main.async {
            self.webView.evaluateJavaScript(js)
        }
    }

}
