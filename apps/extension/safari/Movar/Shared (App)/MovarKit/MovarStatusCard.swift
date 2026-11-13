//
//  MovarStatusCard.swift
//  Shared (App) / MovarKit
//

import Combine
import SwiftUI

/// The setup state, rendered from the model.
///
/// The layout follows the banner's ACTION, not the platform, so there is no
/// `#if` here: `.note` (iOS) is the card — glyph tile, headline, helper, route,
/// note, «Готово» — and `.openSafariSettings` (macOS) is the detail pane —
/// title, paragraph, route, prominent button, footnote.
///
/// On iOS, place it as one row of a `MovarSection` (it is ONE row; no rules
/// between its parts). `onConfirm` is where the caller sets
/// `about.setupCardDismissed`.
struct MovarStatusCard: View {

    let banner: EnablementBanner
    let onConfirm: () -> Void
    let onOpenSafariSettings: () -> Void

    var body: some View {
        switch banner.action {
        case .note(let note):
            card(note: note)
        case .openSafariSettings(let label):
            pane(buttonLabel: label)
        }
    }

    private func card(note: String) -> some View {
        VStack(alignment: .leading, spacing: MovarMetrics.Space.sm) {
            HStack(spacing: MovarMetrics.Space.sm) {
                Image(systemName: "safari")
                    .foregroundColor(MovarPalette.onBrand)
                    .frame(width: MovarMetrics.tile, height: MovarMetrics.tile)
                    .background(
                        RoundedRectangle(cornerRadius: MovarMetrics.cornerTile)
                            .fill(MovarPalette.brandFill)
                    )
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: MovarMetrics.Space.xxs) {
                    Text(banner.headline)
                        .font(.headline)
                        .foregroundColor(MovarPalette.label)
                        .accessibilityAddTraits(.isHeader)
                    movarUnhyphenated(banner.helper)
                        .font(.subheadline)
                        .foregroundColor(MovarPalette.secondaryLabel)
                }
            }
            MovarStepList(steps: [
                MovarStepList.routeStep(banner),
                MovarStepList.Step(
                    id: 1, text: Text(HostStrings.movarKitSetupStepTurnOn),
                    spoken: HostStrings.movarKitSetupStepTurnOn),
                MovarStepList.Step(
                    id: 2, text: Text(HostStrings.movarKitSetupStepAllow),
                    spoken: HostStrings.movarKitSetupStepAllow),
            ])
            movarUnhyphenated(note)
                .font(.footnote)
                .foregroundColor(MovarPalette.secondaryLabel)
            MovarCallToAction(HostStrings.aboutSetupDone, action: onConfirm)
        }
        .padding(.vertical, MovarMetrics.Space.xs)
    }

    private func pane(buttonLabel: String) -> some View {
        VStack(alignment: .leading, spacing: MovarMetrics.Space.md) {
            Text(banner.headline)
                .font(.title)
                .foregroundColor(MovarPalette.label)
                .accessibilityAddTraits(.isHeader)
            movarUnhyphenated(banner.helper)
                .font(.body)
                .foregroundColor(MovarPalette.label)
            MovarStepList(route: banner)
            MovarCallToAction(buttonLabel, action: onOpenSafariSettings)
            movarUnhyphenated(HostStrings.movarKitStatusPaneNote)
                .font(.footnote)
                .foregroundColor(MovarPalette.secondaryLabel)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }
}

/// The macOS sidebar's status row: a dot (`brandFill` when on, `warning` when
/// off) and the state in words. Selection highlight comes from the sidebar.
struct MovarStatusRow: View {

    let isEnabled: Bool

    var body: some View {
        HStack(spacing: MovarMetrics.Space.xs) {
            Circle()
                .fill(isEnabled ? MovarPalette.brandFill : MovarPalette.warning)
                .frame(width: MovarMetrics.statusDot, height: MovarMetrics.statusDot)
            Text(isEnabled ? HostStrings.movarKitStatusEnabled : HostStrings.movarKitStatusDisabled)
                .foregroundColor(MovarPalette.label)
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .frame(minHeight: MovarMetrics.Control.regular)
        .accessibilityElement(children: .combine)
    }
}
