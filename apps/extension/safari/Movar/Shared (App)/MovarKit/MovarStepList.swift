//
//  MovarStepList.swift
//  Shared (App) / MovarKit
//

import SwiftUI

/// Numbered setup steps: a `brandTint` disc with a `brandText` digit, then the
/// step in `.subheadline`. VoiceOver reads each as «Крок N з M, …».
struct MovarStepList: View {

    struct Step: Identifiable {
        var id: Int
        /// What is drawn.
        let text: Text
        /// What VoiceOver says (the step without the numbering).
        let spoken: String
    }

    let steps: [Step]

    init(steps: [Step]) {
        self.steps = steps
    }

    /// Plain-text steps.
    init(_ lines: [String]) {
        self.steps = lines.enumerated().map { Step(id: $0.offset, text: Text($0.element), spoken: $0.element) }
    }

    /// The real route from the model: ONE step, because `banner.steps` are the
    /// crumbs of a single path (Settings › Apps › Safari › …), not separate
    /// tasks. It reflows as one paragraph, glyphs inline.
    init(route banner: EnablementBanner) {
        self.steps = [Self.routeStep(banner)]
    }

    /// The route as a single step (id 0), for composing with further steps.
    static func routeStep(_ banner: EnablementBanner) -> Step {
        var line = Text(verbatim: "")
        for (index, step) in banner.steps.enumerated() {
            if index > 0 {
                line = line + Text(verbatim: "  ›  ").foregroundColor(MovarPalette.secondaryLabel)
            }
            switch step.glyph {
            case .symbol(let name):
                line =
                    line + Text(Image(systemName: name)).foregroundColor(MovarPalette.brandText)
                    + Text(verbatim: "\u{202F}") + Text(step.label)
            case .movarMark:
                // An asset would set at intrinsic size mid-sentence; emphasise by weight.
                line = line + Text(step.label).font(Font.subheadline.weight(.semibold))
            }
        }
        return Step(id: 0, text: line, spoken: banner.spokenPath)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MovarMetrics.Space.sm) {
            ForEach(steps) { step in
                HStack(alignment: .firstTextBaseline, spacing: MovarMetrics.Space.sm) {
                    Text("\(step.id + 1)")
                        .font(Font.caption.weight(.semibold))
                        .foregroundColor(MovarPalette.brandText)
                        .frame(width: MovarMetrics.stepBadge, height: MovarMetrics.stepBadge)
                        .background(Circle().fill(MovarPalette.brandTint))
                    step.text
                        .font(.subheadline)
                        .foregroundColor(MovarPalette.label)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(
                    Text(HostStrings.movarKitStep(step.id + 1, of: steps.count, step.spoken)))
            }
        }
    }
}
