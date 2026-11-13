//
//  MovarVerdictBadge.swift
//  Shared (App) / MovarKit
//

import SwiftUI

/// A verdict as a capsule: a WORD plus a pattern, never colour alone.
///
/// fail = `dangerTint` fill, `danger` text · pass = `brandTint`, `brandText` ·
/// warn = neutral fill, neutral text · not collected = dashed stroke, no fill.
struct MovarVerdictBadge: View {

    enum Kind: Equatable {
        case fail, pass, warn, notCollected
    }

    let kind: Kind
    let text: String

    init(_ kind: Kind, text: String) {
        self.kind = kind
        self.text = text
    }

    /// From an audit rule verdict, worded by `HostStrings.auditVerdict`.
    /// `notApplicable` takes the neutral look (a settled verdict, not a blind
    /// spot); `unknown` takes the dashed «no evidence» look — never `pass`.
    init(_ verdict: RuleVerdict) {
        switch verdict {
        case .fail: self.kind = .fail
        case .pass: self.kind = .pass
        case .warn, .notApplicable: self.kind = .warn
        case .notCollected, .unknown: self.kind = .notCollected
        }
        self.text = HostStrings.auditVerdict(verdict)
    }

    var body: some View {
        Text(text)
            .font(Font.caption.weight(.semibold))
            .foregroundColor(textColor)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, MovarMetrics.Space.xs)
            .padding(.vertical, MovarMetrics.Space.xxs)
            .background(Capsule().fill(fill))
            .overlay(dashedOutline)
    }

    private var textColor: Color {
        switch kind {
        case .fail: return MovarPalette.danger
        case .pass: return MovarPalette.brandText
        case .warn, .notCollected: return MovarPalette.secondaryLabel
        }
    }

    private var fill: Color {
        switch kind {
        case .fail: return MovarPalette.dangerTint
        case .pass: return MovarPalette.brandTint
        case .warn: return MovarPalette.neutralTint
        case .notCollected: return Color.clear
        }
    }

    @ViewBuilder
    private var dashedOutline: some View {
        if kind == .notCollected {
            Capsule().strokeBorder(
                MovarPalette.secondaryLabel,
                style: StrokeStyle(lineWidth: MovarMetrics.stroke, dash: MovarMetrics.dash))
        }
    }
}
