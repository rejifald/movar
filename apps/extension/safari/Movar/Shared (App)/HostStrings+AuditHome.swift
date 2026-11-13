//
//  HostStrings+AuditHome.swift
//  Shared (App)
//
//  Copy the one-list Audit pieces own. Draft wording, listed for sign-off.
//

import Foundation

extension HostStrings {

    /// Same resolution as `HostStrings.local` (private to its file): empty
    /// `value:`, so a missing entry shows its KEY.
    fileprivate static func auditHomeLocal(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }

    /// The field's placeholder: «Адреса сайту».
    static var auditHomePlaceholder: String { auditHomeLocal("audithome.field.placeholder") }
    /// The compact submit button beside the field: «Перевірити».
    static var auditHomeCheck: String { auditHomeLocal("audithome.field.check") }

    /// macOS sidebar: the group header and the «new audit» row.
    static var auditHomeSidebarHeader: String { auditHomeLocal("audithome.sidebar.header") }
    static var auditHomeNewAudit: String { auditHomeLocal("audithome.sidebar.new") }

    /// Empty state: the ghost row, the line and the action.
    static var auditHomeGhostTitle: String { auditHomeLocal("audithome.empty.ghostTitle") }
    static var auditHomeGhostSubtitle: String { auditHomeLocal("audithome.empty.ghostSubtitle") }
    static var auditHomeEmptyLine: String { auditHomeLocal("audithome.empty.line") }
    static var auditHomeEmptyAction: String { auditHomeLocal("audithome.empty.action") }

    /// A history row's badge: «N порушення» (fail style) or «Без порушень» (pass).
    static func auditHomeViolations(_ count: Int) -> String {
        String(
            format: auditHomeLocal("audithome.violations.\(reportPluralForm(count))"), count)
    }
    static var auditHomeNoViolations: String { auditHomeLocal("audithome.violations.none") }

    /// A history time under a minute: «щойно».
    static var auditHomeJustNow: String { auditHomeLocal("audithome.time.justNow") }

    /// «N з M запитів».
    static func auditHomeRequests(_ done: Int, _ total: Int) -> String {
        String(format: auditHomeLocal("audithome.progress.requests"), done, total)
    }

    /// A matrix row's value until the run completes: «чекаємо…».
    static var auditHomeWaiting: String { auditHomeLocal("audithome.progress.waiting") }
}
