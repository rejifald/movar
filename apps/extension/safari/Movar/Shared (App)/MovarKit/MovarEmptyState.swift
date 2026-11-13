//
//  MovarEmptyState.swift
//  Shared (App) / MovarKit
//

import SwiftUI

/// What a list will look like once it has something in it: a ghost of the real
/// row (45% opacity, hidden from accessibility), one `.footnote` line, one
/// secondary action.
struct MovarEmptyState: View {

    let ghostTitle: String
    let ghostSubtitle: String?
    let ghostBadge: MovarVerdictBadge?
    let line: String
    let actionTitle: String
    let action: () -> Void

    init(
        ghostTitle: String, ghostSubtitle: String? = nil, ghostBadge: MovarVerdictBadge? = nil,
        line: String, actionTitle: String, action: @escaping () -> Void
    ) {
        self.ghostTitle = ghostTitle
        self.ghostSubtitle = ghostSubtitle
        self.ghostBadge = ghostBadge
        self.line = line
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MovarMetrics.Space.sm) {
            ghost
            movarUnhyphenated(line)
                .font(.footnote)
                .foregroundColor(MovarPalette.secondaryLabel)
                .movarWrapping()
            MovarTintedAction(actionTitle, action: action)
        }
    }

    private var ghost: some View {
        HStack(spacing: MovarMetrics.Space.sm) {
            VStack(alignment: .leading, spacing: MovarMetrics.Space.xxs) {
                Text(ghostTitle).foregroundColor(MovarPalette.label).lineLimit(1)
                if let subtitle = ghostSubtitle {
                    movarUnhyphenated(subtitle)
                        .font(.footnote)
                        .foregroundColor(MovarPalette.secondaryLabel)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            Spacer(minLength: MovarMetrics.Space.xs)
            if let badge = ghostBadge { badge.layoutPriority(1) }
        }
        .frame(maxWidth: .infinity, minHeight: MovarMetrics.Control.regular, alignment: .leading)
        .padding(.horizontal, MovarMetrics.Space.md)
        .background(MovarPalette.row)
        .opacity(MovarMetrics.ghostOpacity)
        .accessibilityHidden(true)
    }
}
