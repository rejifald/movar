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

class ViewController: PlatformViewController, WKNavigationDelegate, WKScriptMessageHandler {

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()

        self.webView.navigationDelegate = self

#if os(iOS)
        self.webView.scrollView.isScrollEnabled = false
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

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
#if os(iOS)
        webView.evaluateJavaScript("show('ios')")
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
#endif

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
#if os(macOS)
        if (message.body as! String != "open-preferences") {
            return
        }

        // Open Safari's Extensions settings with Movar selected. We deliberately
        // do not quit the app: the didBecomeActive observer above refreshes this
        // screen when the user returns, confirming the extension is on.
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                // Insert code to inform the user that something went wrong.
                return
            }
        }
#endif
    }

}
