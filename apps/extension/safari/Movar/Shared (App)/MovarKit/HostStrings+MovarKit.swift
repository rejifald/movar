//
//  HostStrings+MovarKit.swift
//  Shared (App) / MovarKit
//
//  Copy MovarKit itself owns. Draft wording, listed for sign-off.
//

import Foundation

extension HostStrings {

    /// Same resolution as `HostStrings.local` (private to its file): empty
    /// `value:`, so a missing entry shows its KEY.
    fileprivate static func movarKitLocal(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }

    /// VoiceOver action and label: «Видалити <name>».
    static func movarKitRemove(_ name: String) -> String {
        String(format: movarKitLocal("movarkit.row.remove"), name)
    }

    static var movarKitMoveUp: String { movarKitLocal("movarkit.row.moveUp") }
    static var movarKitMoveDown: String { movarKitLocal("movarkit.row.moveDown") }

    /// «Крок N з M, <step>».
    static func movarKitStep(_ number: Int, of total: Int, _ step: String) -> String {
        String(format: movarKitLocal("movarkit.step.spoken"), number, total, step)
    }

    static var movarKitStatusEnabled: String { movarKitLocal("movarkit.status.enabled") }
    static var movarKitStatusDisabled: String { movarKitLocal("movarkit.status.disabled") }
    static var movarKitStatusPaneNote: String { movarKitLocal("movarkit.status.paneNote") }

    /// iOS setup card steps 2 and 3 (step 1 is the route from the model).
    static var movarKitSetupStepTurnOn: String { movarKitLocal("movarkit.setup.turnOn") }
    static var movarKitSetupStepAllow: String { movarKitLocal("movarkit.setup.allow") }
}
