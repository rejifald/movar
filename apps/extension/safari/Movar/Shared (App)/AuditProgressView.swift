//
//  AuditProgressView.swift
//  Shared (App)
//
//  An audit in flight: the destination a run's row opens until its report exists.
//

import SwiftUI

/// What a run's row opens: the progress screen while the run is in flight, the
/// report once it exists.
///
/// ONE DESTINATION FOR BOTH, keyed by the run's pre-allocated id (see
/// `AuditModel.PendingRun`). The row and the `NavigationLink` keep one identity
/// from «running» to «finished», so completing a run swaps this view's content
/// in place instead of popping one screen and pushing another.
struct AuditOpenedDestination: View {

    @ObservedObject var model: AuditModel
    let runID: String

    var body: some View {
        if let run = model.runs.first(where: { $0.id == runID }) {
            AuditReportView(run: run, model: model, onBack: nil)
        } else if let pending = model.pendingRun, pending.id == runID {
            AuditProgressView(model: model, target: pending.target)
        } else {
            // Failed or removed: the selection is already returning to the home
            // selection; draw nothing meanwhile.
            Color.clear
        }
    }
}

/// An audit in progress (decision D1).
///
/// The engine reports a COUNT (`audit.progress`) and the results arrive in one
/// `audit.complete`, so this screen shows a determinate bar and «N з M запитів»,
/// and every matrix row says «чекаємо…» until the report replaces it. There is
/// no cancel: `EngineHost.cancel` does not stop the engine, and a button that
/// pretends to would be a lie.
struct AuditProgressView: View {

    @ObservedObject var model: AuditModel
    let target: String

    /// The matrix's legs, in the engine's order (`MATRIX_HEADERS` in
    /// `packages/audit-engine/src/collect.ts`): no preference, then four
    /// languages. Mirrored here because the real legs arrive only with the
    /// report; the report's own matrix is the authority once it exists.
    private static let legs: [String?] = [nil, "uk", "ru", "en", "de"]

    var body: some View {
        List {
            titleSection
            progressSection
            matrixSection
        }
        .movarListStyle()
        .movarColumnMeasure()
        .movarPushedTitle(AuditModel.hostOf(target))
    }

    // MARK: - Title

    /// The site as the title. iOS puts it in the navigation bar; macOS has no
    /// stack, so it leads the pane instead.
    @ViewBuilder
    private var titleSection: some View {
#if os(macOS)
        Section {
            Text(AuditModel.hostOf(target))
                .font(.title2)
                .foregroundColor(MovarPalette.label)
                .movarPlainRow()
        }
#endif
    }

    // MARK: - Progress

    /// A DETERMINATE bar: the matrix is a fixed number of legs, so the total is
    /// known once the engine says it. Before that beat the total is `0`, which
    /// draws an empty bar and no count rather than a division by zero.
    private var progressSection: some View {
        let progress = currentProgress
        return Section {
            VStack(alignment: .leading, spacing: MovarMetrics.Space.xs) {
                Text(HostStrings.auditRunning)
                    .font(.headline)
                    .foregroundColor(MovarPalette.label)
                ProgressView(value: Double(progress.done), total: Double(max(progress.total, 1)))
                if progress.total > 0 {
                    Text(HostStrings.auditHomeRequests(progress.done, progress.total))
                        .font(.footnote)
                        .foregroundColor(MovarPalette.secondaryLabel)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }

    private var currentProgress: (done: Int, total: Int) {
        if case .running(let done, let total) = model.activity { return (done, total) }
        return (0, 0)
    }

    // MARK: - Matrix

    private var matrixSection: some View {
        MovarSection(HostStrings.auditMatrixTitle, footer: HostStrings.auditRunningNote) {
            ForEach(Self.legs.indices, id: \.self) { index in
                HStack {
                    Text(label(for: Self.legs[index]))
                        .foregroundColor(MovarPalette.label)
                    Spacer(minLength: MovarMetrics.Space.xs)
                    Text(HostStrings.auditHomeWaiting)
                        .foregroundColor(MovarPalette.secondaryLabel)
                }
                .frame(minHeight: MovarMetrics.Control.regular)
                .accessibilityElement(children: .combine)
            }
        }
    }

    private func label(for leg: String?) -> String {
        leg.map(HostSettings.languageName) ?? HostStrings.auditMatrixNoPreference
    }
}
