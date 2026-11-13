//
//  HostStrings+Home.swift
//  Shared (App)
//
//  Copy the home list (iOS) and the sidebar (macOS) own. Draft wording, listed
//  for sign-off.
//

import Foundation

extension HostStrings {

    fileprivate static func homeLocal(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }

    /// The «Мови» group header (home list and sidebar).
    static var homeLanguagesHeader: String { homeLocal("home.languages.header") }
    /// The «Мовар у Safari» row's value: «Як увімкнути».
    static var homeSafariHelpValue: String { homeLocal("home.safariHelp.value") }
    /// The «Більше» group header.
    static var homeMoreHeader: String { homeLocal("home.more.header") }
}
