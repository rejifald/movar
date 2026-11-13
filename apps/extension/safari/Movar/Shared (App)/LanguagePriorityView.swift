//
//  LanguagePriorityView.swift
//  Shared (App)
//
//  The language-priority screen: «Ваш порядок» + the languages still addable.
//  Pushed from the home list on iOS; the macOS sidebar's detail on macOS.
//

import SwiftUI

/// Ordered language preference, modelled on Settings ▸ General ▸ Language &
/// Region: numbered rows with a remove control and a drag handle, then an «Додати»
/// list. macOS swaps that second list for an «Додати мову» menu.
///
/// iOS holds the list in edit mode permanently: that is what draws the drag
/// handles and enables `onMove`, and the red minus is the row's own
/// (`MovarRow.reorder`), so there is no system `onDelete` control to double it.
/// macOS draws no handle (D5): rows reorder by drag and by the context menu.
struct LanguagePriorityView: View {

    @ObservedObject var store: SettingsStore

    private var priority: [String] { store.settings.priority }

    var body: some View {
        List {
            orderSection
            addSection
        }
        .movarListStyle()
#if os(iOS)
        .environment(\.editMode, .constant(.active))
#endif
        .movarColumnMeasure()
        .movarPushedTitle(HostStrings.priorityTitle)
    }

    // MARK: - Ваш порядок

    private var orderSection: some View {
        MovarSection(HostStrings.settingsPriorityHeader, footer: HostStrings.settingsPriorityFooter) {
            ForEach(Array(priority.enumerated()), id: \.element) { index, code in
                MovarRow.reorder(
                    index: index + 1,
                    HostSettings.displayName(code),
                    onRemove: priority.count > 1 ? { remove(code) } : nil,
                    onMoveUp: index > 0 ? { swap(index, index - 1) } : nil,
                    onMoveDown: index < priority.count - 1 ? { swap(index, index + 1) } : nil
                )
                .contextMenu { contextActions(for: code, at: index) }
            }
            .onMove { offsets, destination in
                store.update { $0.priority.move(fromOffsets: offsets, toOffset: destination) }
            }
        }
    }

    /// The only reorder path on macOS 11, and the keyboard/VoiceOver path
    /// everywhere. The verb stands alone: the menu is already scoped to its row.
    @ViewBuilder
    private func contextActions(for code: String, at index: Int) -> some View {
        Button(HostStrings.settingsMoveUp) { swap(index, index - 1) }
            .disabled(index == 0)
        Button(HostStrings.settingsMoveDown) { swap(index, index + 1) }
            .disabled(index >= priority.count - 1)
        Button(HostStrings.settingsRemove) { remove(code) }
            .disabled(priority.count <= 1)
    }

    // MARK: - Додати

    @ViewBuilder
    private var addSection: some View {
        let addable = store.settings.addableLanguages
        if !addable.isEmpty {
#if os(iOS)
            MovarSection(
                HostStrings.settingsPriorityAddHeader, footer: HostStrings.settingsPriorityAddFooter
            ) {
                ForEach(addable, id: \.self) { code in
                    MovarRow.add(HostSettings.displayName(code)) { add(code) }
                }
            }
#else
            MovarSection(nil, footer: HostStrings.settingsPriorityAddFooter) {
                Menu(HostStrings.priorityAddLabel) {
                    ForEach(addable, id: \.self) { code in
                        Button(HostSettings.displayName(code)) { add(code) }
                    }
                }
                .fixedSize()
            }
#endif
        }
    }

    // MARK: - Writes (all through SettingsStore.update)

    private func add(_ code: String) {
        store.update { settings in
            // `addableLanguages` already excludes `ru` and chosen languages; the
            // contains check guards a double tap on a stale row.
            guard !settings.priority.contains(code), !HostSettings.isLockedBlocked(code) else { return }
            settings.priority.append(code)
        }
    }

    /// The list never empties — Movar with no preferred language has nothing to
    /// ask a site for.
    private func remove(_ code: String) {
        guard priority.count > 1 else { return }
        store.update { $0.priority.removeAll { $0 == code } }
    }

    private func swap(_ a: Int, _ b: Int) {
        guard priority.indices.contains(a), priority.indices.contains(b) else { return }
        store.update { $0.priority.swapAt(a, b) }
    }
}
