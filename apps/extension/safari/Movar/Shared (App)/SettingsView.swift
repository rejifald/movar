//
//  SettingsView.swift
//  Shared (App)
//
//  The Settings tab, in SwiftUI. The second surface off the WebView — and the
//  one About now hangs from.
//

import SwiftUI

/// Movar's settings: the setup task, the three things you can change, and the
/// way to About.
///
/// WHY THIS IS ALSO WHERE ABOUT LIVES NOW. The app used to carry About as a
/// fourth tab. Apple's tab-bar guidance asks you to "weigh the complexity of
/// additional tabs against the need for people to **frequently access each
/// section**", and an About screen is a once-ever destination — it fails that
/// test in a way no amount of polish fixes. The convention it fails against is
/// near-universal: across a sample of eighteen iOS Settings and About screens
/// (Google, Google TV, The Atlantic, Docusign, SiriusXM, Zomato, State Farm,
/// Placify) not one carried About as a peer tab, and every About screen was a
/// PUSH from Settings — three of them literally titled their back button
/// "‹ Settings". So About keeps the screen it was rebuilt into and loses only the
/// tab: it is the last row here, and the bar drops from four tabs to three.
///
/// APPEARANCE IS STOCK, ON PURPOSE — the same commitment `AboutView` documents.
/// `List` + `Section` + `Toggle` + `Picker` + `ForEach.onMove`, the platform type
/// ramp and palettes, SF Symbols, and one brand customisation (the accent,
/// applied once as `.tint()` in `MovarRootView`). The web original this replaces
/// hand-rolled every one of those: `↑ ↓ ×` were literal text glyphs in bordered
/// `<li>`s, the section headings were `h3`s sized off a web type ramp, and the
/// two "how it works" notes were grey cards. Each of those has an exact stock
/// counterpart, and the stock one brings Dynamic Type, VoiceOver, Full Keyboard
/// Access, drag-to-reorder and swipe-to-delete with it.
///
/// THE PRIORITY LIST IS MODELLED ON SETTINGS ▸ GENERAL ▸ LANGUAGE & REGION.
/// Apple's own preferred-language order is a reorderable, deletable list with an
/// "Add Language…" row and an Edit button — which is precisely what this is, down
/// to the semantics, so it is copied rather than reinvented.
///
/// WHAT IS DELIBERATELY ABSENT: the "Movar enabled" master switch. It was
/// host-only — no other browser's Movar has one, and the extension's single live
/// writer of that flag only ever turns it ON (the popup's off-state hero). Safari
/// already has the system-provided version of this control in its own extension
/// settings, and the HIG is explicit that an app should "avoid including
/// redundant versions of [systemwide settings] in your custom settings area".
/// Worse, the setup card at the top of this very screen TEACHES that the real
/// switch is in Safari — so the screen was contradicting itself two sections
/// apart, and a reader who turned Movar off here had no way to tell which of the
/// three "off"s they had hit. Anyone who did turn it off in an older build can
/// still turn it back on from the Safari popup, which is why removing the control
/// strands nobody. The stored `enabled` key is untouched — see `HostSettings`.
struct SettingsView: View {

    @ObservedObject var host: HostStateModel
    @ObservedObject var store: SettingsStore

    /// Whether the reader has told us they finished the iOS setup.
    ///
    /// iOS has no API for "is this Safari extension enabled" — that is why
    /// `HostState.isExtensionEnabled` is always `nil` there — so the only party
    /// who knows is the person holding the phone. Rather than infer it (the App
    /// Group would let us guess from "the extension messaged us recently", which
    /// proves it RAN, not that it is still on), the card just asks, and this
    /// remembers the answer.
    ///
    /// `UserDefaults`, not the App Group: this is the host app's own UI state and
    /// the extension has no business reading it. macOS never uses this — it hides
    /// the card off the real enabled flag instead.
    ///
    /// The KEY still says `about.` because the card used to live on the About
    /// screen. Renaming it would re-show the card to everyone who has already
    /// dismissed it, which is a worse outcome than a key whose prefix records
    /// where it was born.
    @AppStorage("about.setupCardDismissed") private var setupCardDismissed = false

    @State private var addingLanguage = false
    @State private var addingSite = false
    /// macOS only — see {@link aboutSection} for why one platform pushes and the
    /// other presents.
    @State private var showingAbout = false

    var body: some View {
        List {
            // Absent, not empty, before the host reports — the rest of the screen
            // is true regardless of platform and renders straight away. Absent
            // again once the setup is done: macOS learns that from
            // `SFSafariExtensionManager` and stops producing a banner at all, iOS
            // from the reader having tapped "I've done this".
            if let banner = host.banner, !setupCardDismissed {
                SetupBannerSection(banner: banner) { setupCardDismissed = true }
            }
            prioritySection
            pageContentSection
            concealModeSection
            allowlistSection
            aboutSection
        }
        .movarListStyle()
        .movarEditToolbar()
        .movarNavigationContainer(HostStrings.tabSettings)
        .sheet(isPresented: $addingLanguage) {
            AddLanguageSheet(options: store.settings.addableLanguages) { code in
                store.update { $0.priority.append(code) }
            }
        }
        .sheet(isPresented: $addingSite) {
            AddSiteSheet(existing: store.settings.allowlist) { domain in
                store.update { $0.allowlist.append(domain) }
            }
        }
        .movarAboutSheet(isPresented: $showingAbout, host: host)
    }

    // MARK: - Language priority

    /// The ordered language preference, as a reorderable list.
    ///
    /// The footer is the LONGER of the web page's two explanations, not both. The
    /// options page showed a one-line intro under the heading AND a grey "How
    /// priority works" card below the section — the second says everything the
    /// first does and then gives the three examples that make it concrete, so
    /// stacking them was the same sentence twice. A section footer is where a
    /// grouped list puts exactly this, which is what that card always wanted to
    /// be.
    private var prioritySection: some View {
        Section {
            ForEach(store.settings.priority, id: \.self) { code in
                Text(HostSettings.displayName(code))
                    .contextMenu { priorityActions(for: code) }
            }
            .onMove { offsets, destination in
                store.update { $0.priority.move(fromOffsets: offsets, toOffset: destination) }
            }
            .onDelete { offsets in
                store.update { $0.priority.remove(atOffsets: offsets) }
            }
            // The list must never empty out — Movar with no preferred language
            // has nothing to ask any site for. Disabling the affordance is the
            // honest form of that rule: the web version left the × visible and
            // inert, which offers an action and then declines to perform it.
            .deleteDisabled(store.settings.priority.count <= 1)

            if !store.settings.addableLanguages.isEmpty {
                Button {
                    addingLanguage = true
                } label: {
                    Label(HostStrings.priorityAddLabel, systemImage: "plus")
                }
                .movarRowButtonStyle()
            }
        } header: {
            Text(HostStrings.priorityTitle)
        } footer: {
            movarUnhyphenated(HostStrings.asideHowPriorityWorks)
        }
    }

    /// Reorder and remove, as a row-scoped context menu.
    ///
    /// This is the keyboard-and-VoiceOver path to everything drag-to-reorder does,
    /// and on macOS it is the ONLY path — `EditButton` is iOS-only and macOS 11's
    /// `List` has no swipe-to-delete.
    ///
    /// The labels carry no language name, and that is a real simplification
    /// rather than an omission. The web buttons were bare `↑ ↓ ×` glyphs in a
    /// flat list, so each needed the name to have a distinct accessible label —
    /// and naming a language as the OBJECT of a Ukrainian verb needs the
    /// accusative, which is why `messages-uk.ts` carries an endonym declension
    /// table just for these three strings («Видалити українську», not «Видалити
    /// українська»). A context menu is already scoped to its row, so the row is
    /// the object and the verb stands alone — no declension, and no Swift twin of
    /// that table.
    @ViewBuilder
    private func priorityActions(for code: String) -> some View {
        let index = store.settings.priority.firstIndex(of: code)

        Button(HostStrings.settingsMoveUp) {
            guard let index = index, index > 0 else { return }
            store.update { $0.priority.swapAt(index, index - 1) }
        }
        .disabled((index ?? 0) == 0)

        Button(HostStrings.settingsMoveDown) {
            guard let index = index, index < store.settings.priority.count - 1 else { return }
            store.update { $0.priority.swapAt(index, index + 1) }
        }
        .disabled((index ?? 0) >= store.settings.priority.count - 1)

        Button(HostStrings.settingsRemove) {
            store.update { $0.priority.removeAll { $0 == code } }
        }
        .disabled(store.settings.priority.count <= 1)
    }

    // MARK: - Page content

    /// The one switch that is genuinely a preference: may Movar touch the page?
    ///
    /// A two-line label rather than a label plus a section footer, because the
    /// footer under this section belongs to the conceal-mode choice below it and
    /// a section cannot have two. The subtitle is short enough to ride with the
    /// switch, which is what the web control did as well.
    private var pageContentSection: some View {
        Section(header: Text(HostStrings.pageContentTitle)) {
            Toggle(isOn: contentModificationBinding) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(HostStrings.contentToggleLabel)
                    Text(HostStrings.contentToggleDescription)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
        }
    }

    /// Curtain or hide — only while there is something to conceal.
    ///
    /// Its own `Section` rather than two more rows in the one above, so the
    /// legend can be a section header. That is what the web `<fieldset>`'s legend
    /// was, and a grouped list has a real place for it.
    ///
    /// An INLINE picker (two checkmark rows) rather than a segmented control or a
    /// menu. The two labels are a long phrase and a single word — "Keep behind a
    /// curtain" against "Hide" — which a segmented control would set in two wildly
    /// unequal segments, and a menu row would push the chosen one off the end of
    /// the line at any large Dynamic Type size. Rows also leave room for each
    /// option's own description, which is the part that actually explains the
    /// difference and which the web version needed two illustrations to convey.
    ///
    /// Absent, not disabled, while filtering is off: the mode has no meaning
    /// then. The stored value is left alone rather than reset, so turning
    /// filtering back on restores the choice made last time.
    @ViewBuilder
    private var concealModeSection: some View {
        if store.settings.contentModification {
            Section(header: Text(HostStrings.concealModeLegend)) {
                Picker(HostStrings.concealModeLegend, selection: concealModeBinding) {
                    ForEach(ConcealMode.allCases, id: \.self) { mode in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(HostStrings.concealModeLabel(mode))
                            movarUnhyphenated(HostStrings.concealModeDescription(mode))
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                        .tag(mode)
                    }
                }
                .pickerStyle(InlinePickerStyle())
                .labelsHidden()
            }
        }
    }

    // MARK: - Exempt sites

    /// Domains Movar leaves alone.
    ///
    /// The footer is the options page's "Blocked languages, skipped sites" note.
    /// It stays because "skip" is the word on this screen that most needs
    /// pinning down — a reader cannot tell from the header alone whether skipping
    /// a site means Movar stops hiding things there or stops doing anything at
    /// all, and the note answers exactly that. The one-line intro the web page
    /// also carried ("Movar leaves these sites alone") is dropped: it restates
    /// the section header in different words.
    private var allowlistSection: some View {
        Section {
            if store.settings.allowlist.isEmpty {
                Text(HostStrings.allowlistEmpty)
                    .foregroundColor(.secondary)
            } else {
                ForEach(store.settings.allowlist, id: \.self) { domain in
                    Text(domain)
                        // The web list set domains in mono to mark them as
                        // literal strings rather than prose. `.system(.body,
                        // design:)` rather than `.body.monospaced()`, which is
                        // macOS 12 and this app's floor is 11.
                        .font(.system(.body, design: .monospaced))
                        .contextMenu {
                            Button(HostStrings.settingsRemove) {
                                store.update { $0.allowlist.removeAll { $0 == domain } }
                            }
                        }
                }
                .onDelete { offsets in
                    store.update { $0.allowlist.remove(atOffsets: offsets) }
                }
            }

            Button {
                addingSite = true
            } label: {
                Label(HostStrings.allowlistInputLabel, systemImage: "plus")
            }
            .movarRowButtonStyle()
        } header: {
            Text(HostStrings.allowlistTitle)
        } footer: {
            movarUnhyphenated(HostStrings.asideBlockedVsExempt)
        }
    }

    // MARK: - About

    /// The way to the About screen — a row, not a tab.
    ///
    /// iOS PUSHES and macOS PRESENTS, because the two platforms disagree about
    /// what a `NavigationView` is. On iOS it is a stack and the push is the whole
    /// point: the back button reads "‹ Settings", which is the shape every
    /// sampled iOS app uses for this exact row. On macOS `NavigationView` is a
    /// SPLIT view — adopting it would wrap this single pane in a sidebar — so
    /// `movarNavigationContainer` deliberately renders nothing there and there is
    /// no stack to push onto. A sheet is the honest macOS equivalent: About is a
    /// panel you open and close, which is also what the standard macOS "About
    /// <App>" window is.
    ///
    /// The chevron is the NavigationLink's own on iOS and deliberately absent on
    /// macOS, where nothing is being pushed and an indicator would promise a
    /// place to go back from.
    private var aboutSection: some View {
        Section {
#if os(iOS)
            NavigationLink(destination: AboutView(host: host)) {
                Label(HostStrings.settingsAbout, systemImage: "info.circle")
            }
#else
            Button {
                showingAbout = true
            } label: {
                Label(HostStrings.settingsAbout, systemImage: "info.circle")
                    .contentShape(Rectangle())
            }
            .movarRowButtonStyle()
#endif
        }
    }

    // MARK: - Bindings

    /// `store.settings` is read-only from outside, so each control gets a binding
    /// that reads it and routes the write back through `update` — one persisting
    /// path rather than a settable published property any view could assign to.
    private var contentModificationBinding: Binding<Bool> {
        Binding(
            get: { store.settings.contentModification },
            set: { next in store.update { $0.contentModification = next } }
        )
    }

    private var concealModeBinding: Binding<ConcealMode> {
        Binding(
            get: { store.settings.concealMode },
            set: { next in store.update { $0.concealMode = next } }
        )
    }
}

// MARK: - Add language

/// Pick one language to append to the priority list.
///
/// A sheet rather than an inline picker row, for the same reason Settings ▸
/// General ▸ Language & Region ▸ Add Language… is one: choosing from a list is a
/// task with its own screen, and a `Menu` hung off a list row would put the
/// options somewhere VoiceOver and Full Keyboard Access reach less directly.
///
/// Only `addableLanguages` is offered — already-chosen languages and the locked
/// ones are filtered out at the source, so this list never shows a choice that
/// the storage boundary would then undo.
struct AddLanguageSheet: View {

    let options: [String]
    let onAdd: (String) -> Void

    // `\.dismiss` is macOS 12; this app's floor is 11, so the older environment
    // value stays for one more OS cycle.
    @Environment(\.presentationMode) private var presentationMode

    var body: some View {
        MovarSheetContainer(
            title: HostStrings.priorityAddLabel,
            closeLabel: HostStrings.commonCancel,
            onClose: { presentationMode.wrappedValue.dismiss() }
        ) {
            List(options, id: \.self) { code in
                Button {
                    onAdd(code)
                    presentationMode.wrappedValue.dismiss()
                } label: {
                    // `.primary`, not the inherited tint. A `Button` in a `List`
                    // tints its whole label on iOS, which set every language in
                    // this picker in accent green — the same defect the About
                    // screen's rows had. These are the VALUES being chosen from,
                    // not actions, and a list where every row shouts marks
                    // nothing. (The "Add language" row that opens this sheet does
                    // stay tinted: that one IS an action, which is exactly the
                    // distinction the colour should be carrying.)
                    Text(HostSettings.displayName(code))
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .movarRowButtonStyle()
            }
            .movarListStyle()
        }
    }
}

// MARK: - Add site

/// Type one domain to add to the exempt list.
///
/// Validation mirrors the web form's exactly, in the same order — normalise,
/// then reject a malformed domain, then reject a duplicate — because the two
/// have to agree about what "already on the list" means. `normaliseDomain` runs
/// FIRST, so `https://WWW.Example.com/path` and `example.com` are recognised as
/// the same entry rather than added twice and silently de-duped at the storage
/// boundary.
struct AddSiteSheet: View {

    let existing: [String]
    let onAdd: (String) -> Void

    @Environment(\.presentationMode) private var presentationMode
    @State private var draft = ""
    @State private var error: String?

    var body: some View {
        MovarSheetContainer(
            title: HostStrings.allowlistInputLabel,
            closeLabel: HostStrings.commonCancel,
            onClose: { presentationMode.wrappedValue.dismiss() }
        ) {
            List {
                Section {
                    TextField("example.com", text: $draft)
                        .font(.system(.body, design: .monospaced))
                        .movarDomainField()
                        .onChange(of: draft) { _ in error = nil }
                } footer: {
                    if let error = error {
                        // The error takes the accent rather than a red: this is a
                        // "that is not a domain" correction, not a destructive
                        // outcome, and the web form styles it the same way.
                        Text(error).foregroundColor(.accentColor)
                    }
                }

                Section {
                    Button(HostStrings.allowlistAddButton, action: submit)
                        .disabled(draft.trimmingCharacters(in: .whitespaces).isEmpty)
                        .movarRowButtonStyle()
                }
            }
            .movarListStyle()
        }
    }

    private func submit() {
        let domain = HostSettings.normaliseDomain(draft)
        guard !domain.isEmpty else { return }
        guard HostSettings.isValidDomain(domain) else {
            error = HostStrings.allowlistErrorBadDomain
            return
        }
        guard !existing.contains(domain) else {
            error = HostStrings.allowlistErrorDuplicate
            return
        }
        onAdd(domain)
        presentationMode.wrappedValue.dismiss()
    }
}
