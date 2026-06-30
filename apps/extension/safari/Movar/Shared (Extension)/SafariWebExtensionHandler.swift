//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Oleksandr Zhuravlov on 01.06.26.
//

import SafariServices
import os.log

/// Shared App Group store for `MovarSettings`. Mirror of the host app's
/// MovarAppGroup (ViewController.swift) — the two run in separate targets that
/// don't link, so the small contract is duplicated rather than shared. The host
/// app's settings panel and this extension handler read/write the same suite;
/// a monotonic `rev` lets the extension tell when the app changed settings.
enum MovarAppGroup {
    static let suiteName = "group.fyi.movar.safari"
    static let settingsKey = "settings"
    static let revKey = "settingsRev"

    private static func defaults() -> UserDefaults? {
        UserDefaults(suiteName: suiteName)
    }

    /// `{ "rev": Int, "settings": <object | null> }` for the extension's
    /// reconcile. `settings` is the parsed object, not a nested JSON string.
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

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        let result = SafariWebExtensionHandler.handle(message: message)

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [SFExtensionMessageKey: result]
        } else {
            response.userInfo = ["message": result]
        }

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    /// Native side of the extension's settings reconcile (background.ts). The
    /// background pulls (`getSettings`) on wake and pushes (`setSettings`) when
    /// the user edits settings in the popup/options — keeping the App Group in
    /// sync with `browser.storage.sync` so the host app shows current values.
    static func handle(message: Any?) -> [String: Any] {
        guard let dict = message as? [String: Any],
            let type = dict["type"] as? String
        else {
            return ["ok": false]
        }

        switch type {
        case "getSettings":
            return MovarAppGroup.read()
        case "setSettings":
            let rev = MovarAppGroup.write(settings: dict["settings"])
            return ["ok": true, "rev": rev]
        default:
            os_log(.default, "Movar: unknown native message type %{public}@", type)
            return ["ok": false]
        }
    }

}
