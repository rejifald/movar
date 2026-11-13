//
//  HomeView.swift
//  Shared (App)
//
//  The iOS root: one list. Setup card (until confirmed) → Аудит → Мови → Більше.
//

#if os(iOS)
import SwiftUI

struct HomeView: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var audit: AuditModel
    @ObservedObject var store: SettingsStore

    /// One-way. The `about.` prefix is deliberate: existing installs already
    /// carry the value under it.
    @AppStorage("about.setupCardDismissed") private var setupCardDismissed = false

    var body: some View {
        List {
            setupSection
            AuditHomeSection(model: audit)
            languagesSection
            moreSection
        }
        .movarListStyle()
        .movarColumnMeasure()
    }

    // MARK: - Setup card

    @ViewBuilder
    private var setupSection: some View {
        if !setupCardDismissed, let banner = host.banner {
            MovarSection {
                MovarStatusCard(
                    banner: banner,
                    onConfirm: { setupCardDismissed = true },
                    onOpenSafariSettings: HostActions.openSafariPreferences)
            }
        }
    }

    // MARK: - Мови

    private var languagesSection: some View {
        MovarSection(HostStrings.homeLanguagesHeader) {
            NavigationLink(destination: LanguagePriorityView(store: store)) {
                MovarRow.nav(
                    HostStrings.priorityTitle, value: SettingsSummary.priority(store.settings))
            }
            NavigationLink(destination: SkippedSitesView(store: store)) {
                MovarRow.nav(
                    HostStrings.settingsSkippedSitesTitle,
                    value: SettingsSummary.skippedSites(store.settings))
            }
            NavigationLink(destination: HideContentView(store: store)) {
                MovarRow.nav(
                    HostStrings.settingsHideContentTitle,
                    value: SettingsSummary.hideContent(store.settings))
            }
        }
    }

    // MARK: - Більше

    private var moreSection: some View {
        MovarSection(HostStrings.homeMoreHeader) {
            if setupCardDismissed {
                NavigationLink(destination: SafariHelpView(host: host)) {
                    MovarRow.nav(
                        HostStrings.settingsSafariHelpTitle, value: HostStrings.homeSafariHelpValue)
                }
            }
            NavigationLink(destination: AuditAboutView()) {
                MovarRow.nav(HostStrings.auditAboutTitle)
            }
            NavigationLink(destination: AboutView(host: host)) {
                MovarRow.nav(HostStrings.settingsAbout)
            }
        }
    }
}
#endif
