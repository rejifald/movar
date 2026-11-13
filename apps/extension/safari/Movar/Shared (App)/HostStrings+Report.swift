//
//  HostStrings+Report.swift
//  Shared (App)
//
//  Copy the redesigned audit report owns. Draft wording, listed for sign-off.
//

import Foundation

extension HostStrings {

    /// Same resolution as `HostStrings.local` (private to its file): empty
    /// `value:`, so a missing entry shows its KEY.
    fileprivate static func reportLocal(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }

    /// «4 не перевірено» — the dashed badge beside the coverage line.
    static func reportNotChecked(_ count: Int) -> String {
        String(format: reportLocal("audit.report.notChecked"), count)
    }

    /// «Сьогодні о 09:41 · 5 запитів» — the report's meta line.
    static func reportMeta(when: String, requests: Int) -> String {
        String(
            format: reportLocal("audit.report.meta.\(reportPluralForm(requests))"), when, requests)
    }

    /// «Ще N правил пройдено» — the row at the end of a findings family.
    static func reportPassedMore(_ count: Int) -> String {
        String(format: reportLocal("audit.report.passedMore.\(reportPluralForm(count))"), count)
    }

    /// The same CLDR buckets as `HostStrings.pluralForm` (private to its file):
    /// English `one`/`other`, Ukrainian `one`/`few`/`many`.
    static func reportPluralForm(_ count: Int) -> String {
        guard isUkrainian else { return count == 1 ? "one" : "other" }
        let magnitude = abs(count)
        let lastTwo = magnitude % 100
        let last = magnitude % 10
        if lastTwo >= 11 && lastTwo <= 14 { return "many" }
        if last == 1 { return "one" }
        if last >= 2 && last <= 4 { return "few" }
        return "many"
    }
}
