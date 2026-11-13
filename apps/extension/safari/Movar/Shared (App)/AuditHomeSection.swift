//
//  AuditHomeSection.swift
//  Shared (App)
//
//  Movar Audit as a part of the one-list home screen: the field, the law-pack
//  row, this session's audits, and — on macOS — the sidebar group and the «Новий
//  аудит» pane built from the same pieces.
//

import SwiftUI

// MARK: - What the lists show

/// One row of the audit history: a finished run, or the run in flight.
///
/// The in-flight run is listed as a row of its own, carrying the id its report
/// will have, so that the row — and the link that opens it — is the SAME row
/// before and after the audit finishes.
private struct AuditHistoryItem: Identifiable {
    let id: String
    let target: String
    /// `nil` while the run is still in flight.
    let run: AuditRun?
}

extension AuditModel {

    fileprivate var historyItems: [AuditHistoryItem] {
        var items: [AuditHistoryItem] = []
        if let pending = pendingRun, !runs.contains(where: { $0.id == pending.id }) {
            items.append(AuditHistoryItem(id: pending.id, target: pending.target, run: nil))
        }
        items.append(contentsOf: runs.map { AuditHistoryItem(id: $0.id, target: $0.target, run: $0) })
        return items
    }

    /// Swipe-to-remove. The in-flight row is not removable: there is no run to
    /// drop yet, and the engine cannot be stopped.
    fileprivate func removeHistory(atOffsets offsets: IndexSet, of items: [AuditHistoryItem]) {
        for index in offsets {
            if items[index].run != nil { remove(id: items[index].id) }
        }
    }
}

// MARK: - Shared form rows

/// The field row: the address, and a compact «Перевірити» beside it. Return in
/// the field submits too.
private struct AuditFieldRow: View {

    @ObservedObject var model: AuditModel
    /// The macOS pane has its own run button under the form; the home list
    /// (iOS) needs this one, since an audit needs a visible submit (D3).
    var showsCheckButton = true

    var body: some View {
        HStack(spacing: MovarMetrics.Space.sm) {
            TextField(HostStrings.auditHomePlaceholder, text: $model.url, onCommit: model.runTyped)
                .movarURLField()
                .disabled(model.isRunning)
            if showsCheckButton {
                MovarTintedAction(HostStrings.auditHomeCheck, size: .compact, action: model.runTyped)
                    .disabled(model.isRunning)
                    .fixedSize()
            }
        }
        .frame(minHeight: MovarMetrics.Control.regular)
        .movarHiddenSeparator()
    }
}

/// The `ua` law-pack opt-in, off by default on every platform. The law citation
/// is the row's subtitle; the footer that carries the «who it applies to» weight
/// belongs to the section holding the row.
private struct AuditUaPackRow: View {

    @ObservedObject var model: AuditModel

    var body: some View {
        MovarRow.toggle(
            HostStrings.auditUaPack, subtitle: HostStrings.auditUaPackLaw, isOn: $model.applyUaPack
        )
        .disabled(model.isRunning)
    }
}

/// The existing failed presentation: the message, with a warning glyph.
private struct AuditFailedRow: View {

    let message: String

    var body: some View {
        Label {
            Text(message).foregroundColor(MovarPalette.label)
        } icon: {
            Image(systemName: "exclamationmark.triangle").foregroundColor(MovarPalette.danger)
        }
    }
}

/// The failure row, when the last run failed.
private struct AuditFailureRows: View {

    let activity: AuditActivity

    var body: some View {
        if case .failed(let message) = activity {
            AuditFailedRow(message: message)
        }
    }
}

// MARK: - History rows

/// A history row: host, when it ran, and the verdict as a badge.
private struct AuditHistoryRow: View {

    let item: AuditHistoryItem

    var body: some View {
        HStack(spacing: MovarMetrics.Space.sm) {
            VStack(alignment: .leading, spacing: MovarMetrics.Space.xxs) {
                Text(AuditModel.hostOf(item.target))
                    .foregroundColor(MovarPalette.label)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundColor(MovarPalette.secondaryLabel)
                    .lineLimit(1)
            }
            Spacer(minLength: MovarMetrics.Space.xs)
            if let run = item.run {
                AuditVerdictBadges.badge(for: run).layoutPriority(1)
            }
        }
        .frame(minHeight: MovarMetrics.Control.regular)
        // One element, one sentence: host, when, verdict.
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        guard let run = item.run else { return HostStrings.auditRunning }
        return AuditVerdictBadges.relativeTime(run.ranAt)
    }
}

private enum AuditVerdictBadges {

    static func badge(for run: AuditRun) -> MovarVerdictBadge {
        let count = run.outcome.report.brokenPromises
        return count > 0
            ? MovarVerdictBadge(.fail, text: HostStrings.auditHomeViolations(count))
            : MovarVerdictBadge(.pass, text: HostStrings.auditHomeNoViolations)
    }

    private static let formatter: RelativeDateTimeFormatter = {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter
    }()

    /// Never the future, never «через 0 с»: under a minute is «щойно».
    static func relativeTime(_ date: Date) -> String {
        let now = Date()
        if now.timeIntervalSince(date) < 60 { return HostStrings.auditHomeJustNow }
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

/// A history row's link: the run (or the run in flight) as the destination,
/// bound to the model's selection so completing a run opens its report.
private struct AuditHistoryLink<Label: View>: View {

    @ObservedObject var model: AuditModel
    let item: AuditHistoryItem
    let label: () -> Label

    var body: some View {
        NavigationLink(
            destination: AuditOpenedDestination(model: model, runID: item.id),
            tag: item.id,
            selection: $model.openedRunID,
            label: label
        )
    }
}

// MARK: - The home section (iOS rows; also compiles on macOS)

/// The Audit part of the home `List`: field → law-pack row → history → footer.
/// Empty history shows `MovarEmptyState` instead.
///
/// Place it directly inside the root `List`; it contributes two sections. The
/// root attaches `.auditConfirmSheet(model)` ONCE — a sheet inside a list row is
/// unreliable on iOS 15.
struct AuditHomeSection: View {

    @ObservedObject var model: AuditModel

    var body: some View {
        Group {
            MovarSection(HostStrings.auditTitle, footer: HostStrings.auditUaPackHint) {
                AuditFieldRow(model: model)
                AuditUaPackRow(model: model)
                AuditFailureRows(activity: model.activity)
            }
            historySection
        }
    }

    @ViewBuilder
    private var historySection: some View {
        let items = model.historyItems
        if items.isEmpty {
            Section {
                MovarEmptyState(
                    ghostTitle: HostStrings.auditHomeGhostTitle,
                    ghostSubtitle: HostStrings.auditHomeGhostSubtitle,
                    ghostBadge: MovarVerdictBadge(.fail, text: HostStrings.auditHomeViolations(2)),
                    line: HostStrings.auditHomeEmptyLine,
                    actionTitle: HostStrings.auditHomeEmptyAction,
                    action: model.runDefault
                )
                .padding(.horizontal, MovarMetrics.Space.md)
                .movarPlainRow()
            }
        } else {
            MovarSection(footer: HostStrings.auditNotStored) {
                ForEach(items) { item in
                    AuditHistoryLink(model: model, item: item) {
                        AuditHistoryRow(item: item)
                    }
                    .deleteDisabled(item.run == nil)
                    .contextMenu {
                        if item.run != nil {
                            Button(HostStrings.settingsRemove) { model.remove(id: item.id) }
                        }
                    }
                }
                .onDelete { model.removeHistory(atOffsets: $0, of: items) }
            }
        }
    }
}

// MARK: - The confirmation

extension View {

    /// Presents the outbound-request acknowledgement for `model.confirming`.
    /// Attach once, at the root, outside any `List`.
    func auditConfirmSheet(_ model: AuditModel) -> some View {
        modifier(AuditConfirmSheetModifier(model: model))
    }
}

private struct AuditConfirmSheetModifier: ViewModifier {

    @ObservedObject var model: AuditModel

    func body(content: Content) -> some View {
        content.sheet(isPresented: presented) {
            if let target = model.confirming {
                AuditConfirmSheet(
                    target: target,
                    onCancel: { model.confirming = nil },
                    onProceed: { model.confirmRun(target) })
                    // The accent does not cross a presentation; see `movarDetailSheet`.
                    .movarTint()
            }
        }
    }

    /// `confirming` is a target, not a flag, so the sheet's `isPresented` is
    /// derived from it — one source of truth for «which host are we asking about».
    private var presented: Binding<Bool> {
        Binding(
            get: { model.confirming != nil },
            set: { shown in if !shown { model.confirming = nil } })
    }
}

#if os(macOS)

// MARK: - macOS: sidebar group

/// The sidebar's Audit group: «Новий аудит», then this session's runs (count in
/// `secondaryLabel`, no badge). Its links bind to the model's selection, so the
/// detail column shows `AuditComposerPane` or the run, and a finished run takes
/// the selection.
///
/// The shell should set `model.openedRunID = AuditModel.newAuditTag` as its
/// default selection when the extension is enabled.
struct AuditSidebarGroup: View {

    @ObservedObject var model: AuditModel

    var body: some View {
        let items = model.historyItems
        return MovarSection(HostStrings.auditHomeSidebarHeader) {
            NavigationLink(
                destination: AuditComposerPane(model: model),
                tag: AuditModel.newAuditTag,
                selection: $model.openedRunID
            ) {
                Label(HostStrings.auditHomeNewAudit, systemImage: "plus.circle")
                    .foregroundColor(MovarPalette.label)
            }
            .accessibilityIdentifier(MovarSidebarID.newAudit)
            ForEach(items) { item in
                AuditHistoryLink(model: model, item: item) {
                    AuditSidebarRow(item: item)
                }
                .contextMenu {
                    if item.run != nil {
                        Button(HostStrings.settingsRemove) { model.remove(id: item.id) }
                    }
                }
            }
        }
    }
}

private struct AuditSidebarRow: View {

    let item: AuditHistoryItem

    var body: some View {
        HStack(spacing: MovarMetrics.Space.xs) {
            Text(AuditModel.hostOf(item.target))
                .foregroundColor(MovarPalette.label)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer(minLength: MovarMetrics.Space.xs)
            if let run = item.run {
                Text("\(run.outcome.report.brokenPromises)")
                    .foregroundColor(MovarPalette.secondaryLabel)
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - macOS: the «Новий аудит» pane

/// The «Новий аудит» detail form: field, law-pack row, the «Що таке Мовар Аудит»
/// explainer and the run button. Capped by `movarColumnMeasure`.
struct AuditComposerPane: View {

    @ObservedObject var model: AuditModel
    @State private var showingAbout = false

    var body: some View {
        List {
            MovarSection(footer: HostStrings.auditUaPackHint) {
                AuditFieldRow(model: model, showsCheckButton: false)
                AuditUaPackRow(model: model)
                AuditFailureRows(activity: model.activity)
            }
            Section {
                Button {
                    showingAbout = true
                } label: {
                    Label(HostStrings.auditAboutTitle, systemImage: "info.circle")
                        .contentShape(Rectangle())
                }
                .movarRowButtonStyle()
            }
        }
        .movarListStyle()
        .movarColumnMeasure()
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .movarActionBar {
            MovarCallToAction(
                model.isRunning ? HostStrings.auditRunning : HostStrings.auditRun,
                action: model.runTyped
            )
            .disabled(model.isRunning)
        }
        .padding(.top, MovarMetrics.Space.md)
        .navigationTitle(HostStrings.auditHomeNewAudit)
        .movarDetailSheet(
            isPresented: $showingAbout,
            title: HostStrings.auditAboutTitle,
            measure: .explainer
        ) {
            AuditAboutView()
        }
    }
}

#endif
