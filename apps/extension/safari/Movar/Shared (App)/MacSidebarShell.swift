//
//  MacSidebarShell.swift
//  Shared (App)
//
//  The macOS root: the iOS list as a sidebar, with the detail pane showing what
//  iOS pushes.
//

#if os(macOS)
import SwiftUI

/// Accessibility identifiers of the sidebar rows (UI tests drive these).
enum MovarSidebarID {
    static let status = "sidebar.status"
    static let newAudit = "sidebar.newAudit"
    static let priority = "sidebar.priority"
    static let skippedSites = "sidebar.skippedSites"
    static let hideContent = "sidebar.hideContent"
    static let about = "sidebar.about"
}

/// One selection for the whole sidebar: `AuditModel.openedRunID`.
///
/// Audit rows are tagged with run ids and `AuditModel.newAuditTag`; every other
/// row is tagged with one of these strings and binds the SAME `String?`, so the
/// sidebar has a single highlight and a finished run can take the selection.
private enum SidebarTag {
    static let status = "status"
    static let priority = "languages.priority"
    static let skippedSites = "languages.skippedSites"
    static let hideContent = "languages.hideContent"
    static let about = "more.about"
}

struct MacSidebarShell: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var audit: AuditModel
    @ObservedObject var store: SettingsStore

    private var isEnabled: Bool? { host.state?.isExtensionEnabled }

    var body: some View {
        NavigationView {
            sidebar
            Color.clear
        }
        .auditConfirmSheet(audit)
        .onAppear { selectDefault() }
        // The state arrives after launch (`SFSafariExtensionManager` answers
        // asynchronously): a disabled extension takes the selection unless the
        // reader has already started something.
        .onReceive(host.$state) { state in
            guard state?.isExtensionEnabled == false else { return }
            let untouched = audit.runs.isEmpty && audit.pendingRun == nil && audit.url.isEmpty
            if audit.openedRunID == nil || (audit.openedRunID == AuditModel.newAuditTag && untouched) {
                audit.openedRunID = SidebarTag.status
            }
        }
    }

    private func selectDefault() {
        guard audit.openedRunID == nil else { return }
        audit.openedRunID = isEnabled == false ? SidebarTag.status : AuditModel.newAuditTag
    }

    // MARK: - Sidebar

    private var sidebar: some View {
        List {
            statusSection
            AuditSidebarGroup(model: audit)
            languagesSection
            moreSection
        }
        .listStyle(SidebarListStyle())
        .frame(minWidth: MovarMetrics.sidebarMin, idealWidth: MovarMetrics.sidebarIdeal)
    }

    /// ALWAYS rendered, first. `isExtensionEnabled` is `nil` until
    /// `SFSafariExtensionManager` answers — and stays `nil` for a locally built,
    /// unregistered extension, which reports an error. The row used to be gated
    /// on a non-nil state, so in exactly that case the sidebar had no status at
    /// all. Only a confirmed «on» is green; off and unknown both warn.
    private var statusSection: some View {
        Section {
            link(
                SidebarTag.status, id: MovarSidebarID.status, title: isEnabled == true ? HostStrings.movarKitStatusEnabled : HostStrings.movarKitStatusDisabled,
                inset: false
            ) {
                StatusPane(banner: host.banner, isEnabled: isEnabled == true)
            } label: {
                MovarStatusRow(isEnabled: isEnabled == true)
            }
        }
    }

    private var languagesSection: some View {
        MovarSection(HostStrings.homeLanguagesHeader) {
            link(SidebarTag.priority, id: MovarSidebarID.priority, title: HostStrings.priorityTitle) {
                LanguagePriorityView(store: store)
            } label: {
                MovarRow.nav(HostStrings.priorityTitle)
            }
            link(
                SidebarTag.skippedSites, id: MovarSidebarID.skippedSites,
                title: HostStrings.settingsSkippedSitesTitle
            ) {
                SkippedSitesView(store: store)
            } label: {
                MovarRow.nav(HostStrings.settingsSkippedSitesTitle)
            }
            link(
                SidebarTag.hideContent, id: MovarSidebarID.hideContent,
                title: HostStrings.settingsHideContentTitle
            ) {
                HideContentView(store: store)
            } label: {
                MovarRow.nav(HostStrings.settingsHideContentTitle)
            }
        }
    }

    private var moreSection: some View {
        MovarSection(HostStrings.homeMoreHeader) {
            link(SidebarTag.about, id: MovarSidebarID.about, title: HostStrings.settingsAbout) {
                AboutView(host: host).movarColumnMeasure()
            } label: {
                MovarRow.nav(HostStrings.settingsAbout)
            }
        }
    }

    /// `title` is the window's toolbar title; `inset` gives the detail a top
    /// margin so its first section header is not clipped by the title bar.
    private func link<Destination: View, Label: View>(
        _ tag: String, id: String, title: String, inset: Bool = true,
        @ViewBuilder destination: () -> Destination,
        @ViewBuilder label: () -> Label
    ) -> some View {
        NavigationLink(
            destination: destination()
                .padding(.top, inset ? MovarMetrics.Space.md : 0)
                .frame(maxWidth: .infinity, alignment: .topLeading)
                .navigationTitle(title),
            tag: tag, selection: $audit.openedRunID, label: label
        )
        .accessibilityIdentifier(id)
    }
}

/// The status row's detail: the setup pane while the extension is off; once it
/// is on there is no banner, so the pane says so and nothing else.
private struct StatusPane: View {

    let banner: EnablementBanner?
    let isEnabled: Bool

    /// What the pane shows when Movar is not confirmed on but the host has no
    /// banner (the state is still unknown): the same instructions as «off».
    private var fallbackBanner: EnablementBanner? {
        EnablementBanner.make(
            from: HostState(
                platform: .mac, isExtensionEnabled: false, usesSettingsWording: nil,
                iOSMajorVersion: nil))
    }

    var body: some View {
        ScrollView {
            Group {
                if let banner = isEnabled ? nil : (banner ?? fallbackBanner) {
                    MovarStatusCard(
                        banner: banner, onConfirm: {},
                        onOpenSafariSettings: HostActions.openSafariPreferences)
                } else {
                    VStack(alignment: .leading, spacing: MovarMetrics.Space.md) {
                        Text(HostStrings.movarKitStatusEnabled)
                            .font(.title)
                            .foregroundColor(MovarPalette.label)
                            .accessibilityAddTraits(.isHeader)
                        movarUnhyphenated(HostStrings.movarKitStatusPaneNote)
                            .font(.footnote)
                            .foregroundColor(MovarPalette.secondaryLabel)
                    }
                    .frame(maxWidth: .infinity, alignment: .topLeading)
                }
            }
            .padding(MovarMetrics.Space.xl)
            .movarColumnMeasure()
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
    }
}
#endif
