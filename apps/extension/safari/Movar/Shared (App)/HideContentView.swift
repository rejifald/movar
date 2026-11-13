//
//  HideContentView.swift
//  Shared (App)
//
//  «Ховати вміст»: may Movar conceal blocked-language content, and how.
//

import SwiftUI

struct HideContentView: View {

    @ObservedObject var store: SettingsStore

    var body: some View {
        List {
            MovarSection(nil, footer: HostStrings.settingsHideFooter) {
                MovarRow.toggle(HostStrings.contentToggleLabel, isOn: contentModificationBinding)
            }
            // Absent, not disabled, while hiding is off: the mode has no meaning
            // then. The stored mode is left alone, so turning hiding back on
            // restores the last choice.
            if store.settings.contentModification {
                MovarSection(HostStrings.settingsHideHowHeader) {
                    ForEach(ConcealMode.allCases, id: \.self) { mode in
                        MovarRow.choice(
                            HostStrings.concealModeLabel(mode),
                            subtitle: HostStrings.concealModeDescription(mode),
                            selected: store.settings.concealMode == mode
                        ) {
                            store.update { $0.concealMode = mode }
                        }
                    }
                }
            }
        }
        .movarListStyle()
        .movarColumnMeasure()
        .movarPushedTitle(HostStrings.settingsHideContentTitle)
    }

    /// `store.settings` is read-only; the write goes back through `update`.
    private var contentModificationBinding: Binding<Bool> {
        Binding(
            get: { store.settings.contentModification },
            set: { next in store.update { $0.contentModification = next } }
        )
    }
}
