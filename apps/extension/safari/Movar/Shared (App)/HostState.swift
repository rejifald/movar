//
//  HostState.swift
//  Shared (App)
//
//  What the host knows about itself, and the one screen that branches on it.
//

import Combine
import Foundation

/// Which shell the app is running as. The native counterpart of `bridge.ts`'s
/// `Platform` union, and named the same way, because the two have to keep
/// agreeing while the remaining tabs are still React.
enum HostPlatform: String, Equatable {
    case iOS = "ios"
    case mac
}

/// A single snapshot of what the host can tell the UI about itself.
///
/// This is `bridge.ts`'s `HostState` with one field renamed for Swift's sake
/// and no fields added. It stays a mirror rather than becoming "the good native
/// version" for a reason: while the Detector / Audit / Settings tabs are still
/// React, `ViewController` publishes the SAME facts twice — here, and through
/// `evaluateJavaScript("show(…)")` — and a divergence between the two would put
/// the native About screen and the web tabs on different beliefs about the same
/// app.
///
/// Every optional means "the host cannot answer this here", not "not yet":
///
/// - `isExtensionEnabled` is `nil` on iOS permanently. `SFSafariExtensionManager`
///   is macOS-only, so iOS genuinely cannot know, which is why the iOS banner is
///   instructions rather than a status.
/// - `usesSettingsWording` is `nil` on iOS; macOS 13 renamed the pane
///   "Settings" and 12 and earlier called it "Preferences".
/// - `iOSMajorVersion` is `nil` on macOS.
struct HostState: Equatable {
    var platform: HostPlatform
    /// Extension enabled? `nil` on iOS — the host cannot query it there.
    var isExtensionEnabled: Bool?
    /// `false` = the pre-macOS-13 "Preferences" wording. `nil` on iOS.
    var usesSettingsWording: Bool?
    /// e.g. `18`. `nil` on macOS.
    var iOSMajorVersion: Int?
}

/// One labelled step in the "where to go" path — Settings ▸ Apps ▸ Safari ▸ …
struct PathStep: Identifiable, Equatable {

    /// The step's glyph. Not a bare SF Symbol name because one step is not a
    /// system concept: the last hop on iOS is Movar's OWN row in the extensions
    /// list, and showing anything but the app's mark there would describe a row
    /// the reader will not find.
    enum Glyph: Equatable {
        case symbol(String)
        case movarMark
    }

    /// Keyed by the label, as the React `Path` is — every path has distinct
    /// labels, and an array index would re-identify every step when the iOS 18
    /// "Apps" hop appears or disappears.
    var id: String { label }
    let label: String
    let glyph: Glyph
}

/// The enablement banner, fully resolved: what to say, whether it is a status or
/// an instruction, and what the reader does next.
///
/// This is a VALUE, computed once from `HostState`, so the view has nothing left
/// to decide. That is the whole point of porting this screen first — the legacy
/// implementation expressed the same branch as CSS visibility rules
/// (`body:not(.platform-mac,.platform-ios) .status { display: none }`) over
/// markup that always rendered every variant, which meant the banner's logic was
/// only ever readable by reading the stylesheet next to the HTML.
struct EnablementBanner: Equatable {

    /// What the reader does once they have the path.
    enum Action: Equatable {
        /// iOS: a sentence, because the app cannot open another app's settings
        /// page for the user and pretending otherwise with a button would be a
        /// dead control.
        case note(String)
        /// macOS: the real call to action, with its label — the pane's name
        /// changed in macOS 13 and the button has to say the current one.
        case openSafariSettings(label: String)
    }

    let headline: String
    let helper: String
    let steps: [PathStep]
    let action: Action
}

extension EnablementBanner {

    /// iOS 18 is where Apple moved app settings under a new "Apps" section
    /// (Settings ▸ Apps ▸ Safari); earlier iOS puts Safari at the Settings root,
    /// so the path shows the "Apps" hop only from this major up.
    static let iOSAppsSectionMajor = 18

    /// Resolve the banner for a host snapshot — the pure function this whole
    /// file exists to make legible.
    ///
    /// `nil` means "render no banner", the pre-report window. On iOS the app
    /// knows its own platform synchronously so that window is empty in practice,
    /// but macOS spends a real beat there before `SFSafariExtensionManager`
    /// answers, and a screen that guessed "off" during it would accuse a working
    /// install of being broken every launch.
    static func make(from state: HostState?) -> EnablementBanner? {
        guard let state = state else { return nil }

        // macOS 12 and earlier called the pane "Preferences". `false` is the only
        // legacy signal — `nil` (iOS, or a host that did not report) takes the
        // modern wording, exactly as the React `useSettings === false` test does.
        let settingsLabel =
            state.usesSettingsWording == false ? HostStrings.chipSettingsLegacy : HostStrings.chipSettings

        if state.platform == .iOS {
            return EnablementBanner(
                headline: HostStrings.iosHeadline,
                helper: HostStrings.iosHelper,
                steps: iOSSteps(majorVersion: state.iOSMajorVersion),
                // Once you reach Movar's row: turn it on, and allow it in Private
                // Browsing (Safari keeps extensions off in private tabs by
                // default). The copy pairs that ask with the open-source and
                // nothing-leaves-your-browser guarantees, so it does not read as
                // a privacy demand.
                action: .note(HostStrings.iosAction)
            )
        }

        // ALREADY ON — nothing to say. macOS is the one platform that genuinely
        // knows (`SFSafariExtensionManager`), and a finished setup task should
        // stop occupying the screen rather than turn into a permanent "Movar is
        // on" row that never changes again. iOS cannot reach this branch: it has
        // no API for the enabled flag, so it offers the reader a dismiss instead.
        if state.isExtensionEnabled == true { return nil }

        let macSteps = [
            PathStep(label: HostStrings.chipSafari, glyph: .symbol("safari")),
            PathStep(label: settingsLabel, glyph: .symbol("gearshape")),
            PathStep(label: HostStrings.chipExtensions, glyph: .symbol("puzzlepiece")),
        ]
        // The CTA follows the same Settings/Preferences split as the chip.
        let cta =
            state.usesSettingsWording == false
            ? HostStrings.openPreferencesLegacy : HostStrings.openPreferencesLabel
        return EnablementBanner(
            headline: HostStrings.macSetupHeadline,
            helper: HostStrings.macSetupHelper,
            steps: macSteps,
            action: .openSafariSettings(label: cta)
        )
    }

    /// The iOS path, with the "Apps" hop only where it exists.
    ///
    /// A `nil` major version is treated as MODERN, not as old: it means a build
    /// that predates the version being reported (dev, preview), and showing the
    /// current path to someone on a current iOS is the safer of the two wrong
    /// answers — the older path is missing a tap, the newer one has an extra.
    private static func iOSSteps(majorVersion: Int?) -> [PathStep] {
        let hasAppsSection = majorVersion.map { $0 >= iOSAppsSectionMajor } ?? true
        return [
            PathStep(label: HostStrings.chipSettingsApp, glyph: .symbol("gearshape")),
            hasAppsSection ? PathStep(label: HostStrings.chipApps, glyph: .symbol("square.grid.2x2")) : nil,
            PathStep(label: HostStrings.chipSafari, glyph: .symbol("safari")),
            PathStep(label: HostStrings.chipExtensions, glyph: .symbol("puzzlepiece")),
            // The extension's own row — Movar's mark, as it appears in the list.
            PathStep(label: HostStrings.chipMovar, glyph: .movarMark),
        ].compactMap { $0 }
    }

    /// The path as one spoken sentence — "Settings then Apps then Safari…".
    ///
    /// VoiceOver reads the path as a single element rather than as five, because
    /// five sibling labels with no connector are five destinations, not one
    /// route. The visible layout keeps its glyphs; this is what replaces the
    /// React markup's `sr-only` connector spans.
    var spokenPath: String {
        steps.map(\.label).joined(separator: HostStrings.pathThen)
    }
}

/// The observable the SwiftUI shell watches.
///
/// Deliberately `ObservableObject` and not `@Observable`: the Observation macro
/// needs iOS 17 / macOS 14 and this app still ships to iOS 15.4 and macOS 11.
///
/// It holds the snapshot and nothing else — `banner` is derived on read rather
/// than stored, so there is exactly one place the branch lives and no way for a
/// cached banner to survive a state change. `ViewController` owns the writes:
/// it publishes the same facts here that it pushes into the WebView's `show()`,
/// including the macOS focus-regain refresh, so the native screen is a live view
/// of the extension's state rather than a launch-time snapshot.
/// `Combine` is imported explicitly above rather than leaned on through
/// SwiftUI: `ObservableObject` and `@Published` are Combine's, and while some
/// SDKs re-export them transitively, the iOS/macOS 26 SDK does not — Xcode
/// fails this file with "does not conform to protocol 'ObservableObject'" and
/// "init(wrappedValue:) is not available due to missing import of defining
/// module 'Combine'". A local `swiftc -typecheck` against the Command Line
/// Tools SDK does NOT reproduce it, so the import stays whether or not the
/// machine you are on needs it.
final class HostStateModel: ObservableObject {
    @Published var state: HostState?

    var banner: EnablementBanner? { EnablementBanner.make(from: state) }
}
