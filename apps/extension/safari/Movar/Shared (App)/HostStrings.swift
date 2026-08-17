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
    static var aboutSourceCode: String { local("about.sourceCode") }

    /// The three rows the native About screen has that the React one never did.
    ///
    /// These are the only keys here without a `messages-en.ts` counterpart, so
    /// they are the one place the 1:1 mirror in this file's header does not hold.
    /// That is deliberate rather than drift: an App Store review sheet and a
    /// dependency-licence file are things a NATIVE app is expected to link and a
    /// web panel is not, and the React tab has no rows to sync them against.
    static var aboutRate: String { local("about.rate") }
    static var aboutPrivacy: String { local("about.privacy") }

    /// Movar's OWN licence. Singular — `aboutLicenses` below is the dependency
    /// roll-up, and the two live in different sections precisely because they
    /// answer different questions.
    static var aboutLicense: String { local("about.license") }
    static var aboutLicenses: String { local("about.licenses") }

    // `about.summary`, `about.whatTitle` and `about.feature{1,2,3}.*` have no
    // accessor any more: the native About no longer explains what Movar does.
    // Someone who has installed the app knows, and the copy duplicated the store
    // listing. The KEYS stay in `Localizable.strings` because they still mirror
    // `messages-en.ts`, which the React About tab — still the source of the
    // `08-host-app-about` store screenshot — goes on rendering.

    /// The masthead's version line, e.g. `Version 1.6.2`.
    ///
    /// Takes the BARE number. The old "v1.6.2" stamp put a jargon prefix in front
    /// of it that no catalogue could translate — a spelled-out word is what the
    /// reader of a localized screen expects, and a format string lets a language
    /// order the two parts however it needs to.
    static func aboutVersion(_ version: String) -> String {
        String(format: local("about.version"), version)
    }

    /// The changelog row's label.
    static var aboutWhatsNew: String { local("about.whatsNew") }

    static var aboutGroupApp: String { local("about.groupApp") }
    static var aboutGroupSupport: String { local("about.groupSupport") }
    static var aboutGroupLegal: String { local("about.groupLegal") }

    // `about.versionLink` has no accessor any more. It combined the stamp and
    // "what's new" into one control because the version WAS the link — and it
    // carried a WCAG 2.5.3 (label in name) contract for exactly that reason. Now
    // the masthead states the version as plain text and the changelog is its own
    // row whose visible label IS its name, so both the combination and the
    // contract are moot. The key stays in `Localizable.strings`: the React tab
    // still renders it.

    // MARK: - Trust row

    // The whole `trust.*` group has no accessor any more. Two of the three were
    // pre-install facts on a post-install screen, the third restated the privacy
    // policy the section already links to, and the footer they shared now carries
    // Movar's own licence instead — the one thing that section could not
    // otherwise say. The keys stay in `Localizable.strings` because they still
    // mirror `messages-en.ts`, which the React tab renders as its trust row.

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

    // `macOn.headline` / `macOn.helper` have no accessor any more: on macOS the
    // setup card now HIDES once the extension is on, instead of turning into a
    // permanent "Movar is on" row. The keys stay in `Localizable.strings` for the
    // same reason the capability keys did — they still mirror `messages-en.ts`,
    // which the React tab goes on rendering.

    /// The iOS-only "I've done this" control on the setup card.
    static var aboutSetupDone: String { local("about.setupDone") }

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
