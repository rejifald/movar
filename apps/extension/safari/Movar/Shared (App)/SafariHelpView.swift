//
//  SafariHelpView.swift
//  Shared (App)
//
//  «Мовар у Safari» (iOS): the setup steps again, plus how to check they worked.
//  macOS does not use it — the status pane covers it.
//

#if os(iOS)
import SwiftUI

struct SafariHelpView: View {

    @ObservedObject var host: HostStateModel

    var body: some View {
        List {
            MovarSection(HostStrings.settingsHelpEnableHeader) {
                MovarStepList(steps: enableSteps)
                    .padding(.vertical, MovarMetrics.Space.xs)
            }
            MovarSection(
                HostStrings.settingsHelpVerifyHeader, footer: HostStrings.settingsHelpFooter
            ) {
                MovarStepList(HostStrings.settingsHelpVerifySteps)
                    .padding(.vertical, MovarMetrics.Space.xs)
            }
        }
        .movarListStyle()
        .movarColumnMeasure()
        .movarPushedTitle(HostStrings.settingsSafariHelpTitle)
    }

    /// The same three steps the setup card shows. The route comes from the model
    /// (it carries the iOS ≥ 18 «Застосунки» hop); without a banner, only the two
    /// fixed steps remain, renumbered.
    private var enableSteps: [MovarStepList.Step] {
        let fixed = [HostStrings.movarKitSetupStepTurnOn, HostStrings.movarKitSetupStepAllow]
        var steps: [MovarStepList.Step] = []
        if let banner = host.banner {
            steps.append(MovarStepList.routeStep(banner))
        }
        for line in fixed {
            steps.append(MovarStepList.Step(id: steps.count, text: Text(line), spoken: line))
        }
        return steps
    }
}
#endif
