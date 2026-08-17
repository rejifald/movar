//
//  SettingsStore.swift
//  Shared (App)
//
//  The native Settings screen's read/write port onto the shared App Group.
//

import Combine
import Foundation

/// Reads and writes Movar's settings for the native Settings screen.
///
/// The Swift counterpart of `bridge.ts`'s `hostSettingsSource`, and deliberately
/// the same shape: read the whole record once, hand the screen a value, and
/// write the whole record back on every change. Optimistic — the published value
/// updates first and the store follows, exactly as the React `update` did, because
/// `UserDefaults` is synchronous and there is no failure for the UI to react to.
///
/// WHY THE WEB TAB'S PORT COULD NOT JUST BE REUSED. It runs inside the WebView,
/// over the `readSettings` / `writeSettings` message pair, and a native screen
/// posting JavaScript messages to a hidden web view to edit its own app's
/// settings would be a round trip through a renderer for no reason. Both ends
/// land on the same `MovarAppGroup`, which is the actual source of truth, so this
/// is a second CALLER of that store rather than a second store.
///
/// `Combine` is imported explicitly rather than leaned on through SwiftUI:
/// `ObservableObject` and `@Published` are Combine's, and the iOS/macOS 26 SDK
/// does not re-export them — see the note on `HostStateModel` in `HostState.swift`
/// for the build this cost us.
@MainActor
final class SettingsStore: ObservableObject {

    /// The current settings. Never `nil`: an App Group that has never been
    /// written yields `HostSettings.unwritten`, whose accessors fall back to the
    /// same defaults `bridge.ts` falls back to.
    ///
    /// The React tab rendered NOTHING until its first read resolved, so the form
    /// could not flash defaults before the stored values arrived. That window
    /// does not exist here — `UserDefaults` answers synchronously, so the first
    /// value is already the real one — which is why this is a plain value rather
    /// than an optional with a loading state to draw.
    @Published private(set) var settings: HostSettings

    init() {
        settings = Self.load()
    }

    /// Re-read the store.
    ///
    /// Called when the app comes back to the foreground, because the extension
    /// writes the same record from Safari — the popup's "Always skip this site"
    /// adds to the very allowlist this screen is showing. Without this, the
    /// screen would keep displaying what it read at launch and the reader's next
    /// edit would write that stale record back whole, silently reverting the
    /// change they made in the popup a minute earlier.
    func reload() {
        settings = Self.load()
    }

    /// Apply an edit and persist it.
    ///
    /// Takes a mutation rather than a whole value so callers cannot accidentally
    /// write back a record they read before some other edit landed — every write
    /// is applied to the current one.
    func update(_ mutate: (inout HostSettings) -> Void) {
        var next = settings
        mutate(&next)
        settings = next
        MovarAppGroup.write(settings: next.storageObject)
    }

    /// The stored record, or an empty one when the App Group has nothing yet.
    ///
    /// `MovarAppGroup.read()` answers `["rev": Int, "settings": object | NSNull]`
    /// — the envelope shaped for the web side's `JSON.parse`. The `rev` is not
    /// read here: it exists so the two writers can detect "the other one changed
    /// it", and this screen resolves that by re-reading on foreground (see
    /// {@link reload}) rather than by merging, which is the same last-writer-wins
    /// the web tab has always had.
    private static func load() -> HostSettings {
        let envelope = MovarAppGroup.read()
        guard let object = envelope["settings"] as? [String: Any] else {
            return .unwritten
        }
        return HostSettings(raw: object)
    }
}
