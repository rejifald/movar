//
//  ViewController.swift
//  Shared (App)
//
//  Created by Oleksandr Zhuravlov on 01.06.26.
//

import WebKit

#if os(iOS)
import UIKit
typealias PlatformViewController = UIViewController
#elseif os(macOS)
import Cocoa
import SafariServices
typealias PlatformViewController = NSViewController
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

#if os(macOS)
        // Re-check the extension state whenever the app regains focus — e.g.
        // after the user enables Movar in Safari and switches back — so this
        // screen can update to "Movar is on" without the app having to quit.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(refreshExtensionState),
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )
#endif

        self.webView.loadFileURL(Bundle.main.url(forResource: "Main", withExtension: "html")!, allowingReadAccessTo: Bundle.main.resourceURL!)
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
                if #available(macOS 13, *) {
                    self.webView.evaluateJavaScript("show('mac', \(state.isEnabled), true)")
                } else {
                    self.webView.evaluateJavaScript("show('mac', \(state.isEnabled), false)")
                }
            }
        }
    }

    private func openPreferences() {
        // Open Safari's Extensions settings with Movar selected. We deliberately
        // do not quit the app: the didBecomeActive observer above refreshes this
        // screen when the user returns, confirming the extension is on.
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }
        }
    }
#endif

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        // Legacy string form: a bare "open-preferences" command (macOS).
        if let command = message.body as? String {
#if os(macOS)
            if command == "open-preferences" { openPreferences() }
#endif
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
#if os(macOS)
            openPreferences()
#endif
        case "readSettings":
            reply(id: id, payload: MovarAppGroup.read())
        case "writeSettings":
            let rev = MovarAppGroup.write(settings: dict["payload"])
            reply(id: id, payload: ["rev": rev])
        default:
            break
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
