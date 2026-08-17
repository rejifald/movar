//
//  HostStrings.swift
//  Shared (App)
//
//  The native About screen's copy, in the reader's language.
//

import Foundation

/// Every user-facing string the SwiftUI About screen renders, resolved through
/// the app bundle's `Localizable.strings` (`en.lproj` / `uk.lproj`).
///
/// WHY A CATALOGUE TYPE RATHER THAN BARE LITERALS IN THE VIEW. SwiftUI would
/// localize a `Text("about.lede")` by itself, so this indirection buys nothing
/// at the call site — it buys two things elsewhere. The keys stay greppable
/// against `apps/safari-host-app/src/i18n/messages-en.ts`, which is still the
/// catalogue for the three tabs that have not been ported and is where any
/// wording change lands first; and the one string that is not plain text — the
/// version stamp's `%@` — cannot be a `LocalizedStringKey` without smuggling
/// the interpolation into the key.
///
/// The `value:` is deliberately empty rather than an English fallback. Foundation
/// then returns the KEY for a missing entry, which is loud in a screenshot and
/// impossible to mistake for finished copy; an inline English default would ship
/// a half-translated screen that looks done.
///
/// This mirrors `messages-en.ts` / `messages-uk.ts` 1:1 and nothing more. The
/// ADR's endgame is generating these `.strings` from the TS catalogues at build
/// time (`docs/native-shells.md`, "i18n moves native"); until that generator
/// exists the two are hand-synced, which is why the key names are the TS paths
/// verbatim — a drift is meant to be a `diff` away, not a search.
enum HostStrings {

    // MARK: - Tab bar

    static var tabDetector: String { local("tabs.detector") }
    static var tabAudit: String { local("tabs.audit") }
    static var tabSettings: String { local("tabs.settings") }
    static var tabAbout: String { local("tabs.about") }

    // MARK: - About: lede, capabilities, footer

    static var aboutLede: String { local("about.lede") }
    static var aboutSummary: String { local("about.summary") }
    static var aboutWhatTitle: String { local("about.whatTitle") }
    static var aboutSourceCode: String { local("about.sourceCode") }

    /// The three capability rows, in the order the icons are aligned to.
    ///
    /// Flattened to numbered keys because `.strings` has no arrays; the count is
    /// fixed by {@link AboutView}'s icon list, so a fourth capability is a code
    /// change in both places rather than a silently unrendered string.
    static var aboutFeatures: [(title: String, detail: String)] {
        (1...3).map { index in
            (title: local("about.feature\(index).title"), detail: local("about.feature\(index).desc"))
        }
    }

    /// Accessible name for the footer's version stamp, e.g. `v1.6.2 — what's new`.
    ///
    /// Must START with the stamp exactly as rendered: the visible text IS the
    /// whole label, so WCAG 2.5.3 (label in name) requires the accessible name
    /// to contain it. Same contract as the React `about.versionLink`.
    static func aboutVersionLink(stamp: String) -> String {
        String(format: local("about.versionLink"), stamp)
    }

    // MARK: - Trust row

    static var trustFree: String { local("trust.free") }
    static var trustOpenSource: String { local("trust.openSource") }
    static var trustPrivacy: String { local("trust.privacy") }

    /// Footer "Send feedback" label — every platform.
    static var feedback: String { local("feedback") }

    // MARK: - Enablement banner

    static var chipSettingsApp: String { local("chips.settingsApp") }
    static var chipApps: String { local("chips.apps") }
    static var chipSafari: String { local("chips.safari") }
    static var chipSettings: String { local("chips.settings") }
    static var chipSettingsLegacy: String { local("chips.settingsLegacy") }
    static var chipExtensions: String { local("chips.extensions") }
    static var chipMovar: String { local("chips.movar") }

    /// Connector spoken between path steps ("Safari then Settings…").
    ///
    /// Carries its own surrounding spaces, as the React string does, because it
    /// is joined into a sentence rather than laid out — the Ukrainian « далі »
    /// and the English " then " both need them and neither should be assumed by
    /// the caller.
    static var pathThen: String { local("pathThen") }

    static var iosHeadline: String { local("ios.headline") }
    static var iosHelper: String { local("ios.helper") }
    static var iosAction: String { local("ios.action") }

    static var macSetupHeadline: String { local("macSetup.headline") }
    static var macSetupHelper: String { local("macSetup.helper") }

    static var macOnHeadline: String { local("macOn.headline") }
    static var macOnHelper: String { local("macOn.helper") }

    static var openPreferencesLabel: String { local("openPreferences.label") }
    static var openPreferencesLegacy: String { local("openPreferences.legacy") }

    // MARK: - Locale

    /// The locale the bundle actually resolved the strings above with.
    ///
    /// Read from the bundle rather than from `Locale.current` because those two
    /// disagree exactly when it matters: a device set to a language the app does
    /// not ship falls back to the development region, and a changelog link built
    /// from `Locale.current` would then point at a page in a language the screen
    /// around it is not written in. This is the native equivalent of React
    /// threading the resolved `locale` into `AboutTab` instead of re-resolving it.
    static var resolvedLocale: String {
        Bundle.main.preferredLocalizations.first ?? "en"
    }

    /// True when this build resolved to Ukrainian copy.
    static var isUkrainian: Bool { resolvedLocale.hasPrefix("uk") }

    private static func local(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }
}
