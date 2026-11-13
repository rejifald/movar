//
//  SkippedSitesView.swift
//  Shared (App)
//
//  «Пропущені сайти»: domains Movar leaves alone.
//

import SwiftUI

struct SkippedSitesView: View {

    @ObservedObject var store: SettingsStore

    /// Set by the empty state's CTA; once a site exists the field is simply there.
    @State private var revealed = false
    @State private var draft = ""
    @State private var error: String?

    private var allowlist: [String] { store.settings.allowlist }
    private var showsField: Bool { revealed || !allowlist.isEmpty }

    var body: some View {
        List {
            if showsField {
                fieldSection
            } else {
                emptySection
            }
            if !allowlist.isEmpty {
                listSection
            }
        }
        .movarListStyle()
        .movarColumnMeasure()
        .movarPushedTitle(HostStrings.settingsSkippedSitesTitle)
    }

    // MARK: - Empty

    private var emptySection: some View {
        Section {
            MovarEmptyState(
                ghostTitle: HostStrings.settingsSkippedGhost,
                line: HostStrings.settingsSkippedEmptyLine,
                actionTitle: HostStrings.settingsSkippedEmptyAction
            ) {
                revealed = true
            }
        }
    }

    // MARK: - Field

    /// The error replaces the subdomains note in the footer. It takes the brand
    /// text colour rather than red: "that is not a domain" is a correction, not a
    /// destructive outcome.
    private var fieldSection: some View {
        Section {
            HStack(spacing: MovarMetrics.Space.sm) {
                DomainEntryField(
                    text: $draft,
                    placeholder: HostStrings.settingsSkippedPlaceholder,
                    focusOnAppear: revealed,
                    onSubmit: submit
                )
                // NOT disabled while empty: a disabled control reads as nothing on
                // bar material. Validate on press instead, with the message in the
                // footer.
                Button(HostStrings.allowlistAddButton, action: submit)
                    .font(Font.body.weight(.semibold))
                    .foregroundColor(MovarPalette.brandText)
                    .movarRowButtonStyle()
            }
            .frame(minHeight: MovarMetrics.Control.regular)
        } footer: {
            movarUnhyphenated(error ?? HostStrings.settingsSkippedSubdomains)
                .font(.footnote)
                .foregroundColor(error == nil ? MovarPalette.secondaryLabel : MovarPalette.brandText)
                .movarWrapping()
        }
    }

    // MARK: - Rows

    private var listSection: some View {
#if os(iOS)
        let footer: String? = HostStrings.settingsSkippedSwipeHint
#else
        let footer: String? = nil
#endif
        return MovarSection(nil, footer: footer) {
            ForEach(allowlist, id: \.self) { domain in
                Text(domain)
                    // `.system(.body, design:)`: a Dynamic Type role, and macOS 11-safe.
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(MovarPalette.label)
                    .frame(maxWidth: .infinity, minHeight: MovarMetrics.Control.regular, alignment: .leading)
                    .contextMenu {
                        Button(HostStrings.settingsRemove) { remove(domain) }
                    }
            }
            .onDelete { offsets in
                store.update { $0.allowlist.remove(atOffsets: offsets) }
            }
        }
    }

    // MARK: - Writes (through SettingsStore.update)

    /// Normalise first, so `https://WWW.Example.com/path` and `example.com` are
    /// one entry; then validate; then the duplicate check. An empty field takes
    /// the malformed message — "nothing happened" is not something to act on.
    private func submit() {
        let domain = HostSettings.normaliseDomain(draft)
        guard !domain.isEmpty, HostSettings.isValidDomain(domain) else {
            error = HostStrings.allowlistErrorBadDomain
            return
        }
        guard !allowlist.contains(domain) else {
            error = HostStrings.allowlistErrorDuplicate
            return
        }
        store.update { $0.allowlist.append(domain) }
        draft = ""
        error = nil
    }

    private func remove(_ domain: String) {
        store.update { $0.allowlist.removeAll { $0 == domain } }
    }
}

/// The domain text field. Focus (and return-to-submit) need `@FocusState` /
/// `onSubmit`, which are macOS 12; macOS 11 gets the same field unfocused.
private struct DomainEntryField: View {

    @Binding var text: String
    let placeholder: String
    let focusOnAppear: Bool
    let onSubmit: () -> Void

    var body: some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            FocusedDomainField(
                text: $text, placeholder: placeholder, focusOnAppear: focusOnAppear, onSubmit: onSubmit)
        } else {
            TextField(placeholder, text: $text, onCommit: onSubmit)
                .font(.system(.body, design: .monospaced))
                .movarDomainField()
        }
    }
}

@available(iOS 15.0, macOS 12.0, *)
private struct FocusedDomainField: View {

    @Binding var text: String
    let placeholder: String
    let focusOnAppear: Bool
    let onSubmit: () -> Void

    @FocusState private var focused: Bool

    var body: some View {
        TextField(placeholder, text: $text)
            .font(.system(.body, design: .monospaced))
            .movarDomainField()
            .focused($focused)
            .submitLabel(.done)
            .onSubmit(onSubmit)
            .onAppear { if focusOnAppear { focused = true } }
    }
}
