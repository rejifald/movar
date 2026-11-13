//
//  HostStrings+Settings.swift
//  Shared (App)
//
//  Copy the four settings detail screens own. Draft wording, listed for sign-off.
//  Strings SettingsView already had (priorityTitle, priorityAddLabel,
//  settingsMoveUp/Down/Remove, concealMode*, contentToggleLabel, allowlist*)
//  are reused from HostStrings, not redefined.
//

import Foundation

extension HostStrings {

    /// Same resolution as `HostStrings.local` (private to its file): empty
    /// `value:`, so a missing entry shows its KEY.
    fileprivate static func settingsLocal(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }

    // MARK: Screen titles (also the home rows' titles)

    static var settingsSkippedSitesTitle: String { settingsLocal("settings.skipped.title") }
    static var settingsHideContentTitle: String { settingsLocal("settings.hide.title") }
    static var settingsSafariHelpTitle: String { settingsLocal("settings.help.title") }

    // MARK: Language priority

    static var settingsPriorityHeader: String { settingsLocal("settings.priority.header") }
    static var settingsPriorityAddHeader: String { settingsLocal("settings.priority.addHeader") }

    /// Under «Ваш порядок». macOS adds the drag hint (D5: no handle glyph there).
    static var settingsPriorityFooter: String {
#if os(iOS)
        settingsLocal("settings.priority.footer")
#else
        settingsLocal("settings.priority.footerMac")
#endif
    }

    /// Under the add list (iOS) / the «Додати мову» menu (macOS).
    static var settingsPriorityAddFooter: String {
#if os(iOS)
        settingsLocal("settings.priority.addFooter")
#else
        settingsLocal("settings.priority.addFooterMac")
#endif
    }

    // MARK: Skipped sites

    static var settingsSkippedPlaceholder: String { settingsLocal("settings.skipped.placeholder") }
    static var settingsSkippedSubdomains: String { settingsLocal("settings.skipped.subdomains") }
    static var settingsSkippedSwipeHint: String { settingsLocal("settings.skipped.swipeHint") }
    static var settingsSkippedGhost: String { settingsLocal("settings.skipped.ghost") }
    static var settingsSkippedEmptyLine: String { settingsLocal("settings.skipped.emptyLine") }
    static var settingsSkippedEmptyAction: String { settingsLocal("settings.skipped.emptyAction") }

    // MARK: Hide content

    static var settingsHideFooter: String { settingsLocal("settings.hide.footer") }
    static var settingsHideHowHeader: String { settingsLocal("settings.hide.howHeader") }

    // MARK: Мовар у Safari (iOS help)

    static var settingsHelpEnableHeader: String { settingsLocal("settings.help.enableHeader") }
    static var settingsHelpVerifyHeader: String { settingsLocal("settings.help.verifyHeader") }
    static var settingsHelpVerifySteps: [String] {
        [
            settingsLocal("settings.help.verify1"),
            settingsLocal("settings.help.verify2"),
            settingsLocal("settings.help.verify3"),
        ]
    }
    static var settingsHelpFooter: String { settingsLocal("settings.help.footer") }

    // MARK: Home-row values

    static var settingsSummaryNone: String { settingsLocal("settings.summary.none") }
    static var settingsSummaryOff: String { settingsLocal("settings.summary.off") }
}

/// The three VALUES the home list shows on its «Мови» rows.
enum SettingsSummary {

    /// Priority names joined: «українська, англійська».
    static func priority(_ settings: HostSettings) -> String {
        settings.priority.map(HostSettings.displayName).joined(separator: ", ")
    }

    /// The skipped-site count, or «немає».
    static func skippedSites(_ settings: HostSettings) -> String {
        settings.allowlist.isEmpty ? HostStrings.settingsSummaryNone : "\(settings.allowlist.count)"
    }

    /// The conceal mode's label while hiding is on, else «Вимкнено».
    static func hideContent(_ settings: HostSettings) -> String {
        settings.contentModification
            ? HostStrings.concealModeLabel(settings.concealMode) : HostStrings.settingsSummaryOff
    }
}
