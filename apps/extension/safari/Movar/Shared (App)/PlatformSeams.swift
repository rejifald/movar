//
//  PlatformSeams.swift
//  Shared (App)
//
//  The `#if` and `if #available` the native screens would otherwise be full of.
//

import SwiftUI

/// Small platform/version seams, kept together so `SettingsView` and `AboutView`
/// read as layouts rather than as thickets of conditional compilation.
///
/// Every one of these exists because the app's floor is genuinely old — **iOS
/// 15.4 and macOS 11**, which predates `.tint`, `.borderedProminent`, the
/// `.buttonStyle(.plain)` shorthand family, `NavigationStack`, and `\.dismiss`.
/// They are written as availability branches rather than by raising the
/// deployment target, because raising it would drop users of a shipped app to
/// make these files tidier.
///
/// They started life at the bottom of `AboutView.swift`, when About was the only
/// native screen. Settings is the second, the two sheets are the third and
/// fourth, and a seam used by four callers does not belong inside one of them.
extension View {

    /// The canonical grouped list on each platform.
    @ViewBuilder
    func movarListStyle() -> some View {
#if os(iOS)
        self.listStyle(InsetGroupedListStyle())
#else
        self.listStyle(InsetListStyle())
#endif
    }

    /// A row that sits on the grouped background instead of on a card.
    ///
    /// What makes About's masthead a masthead rather than the first list item: no
    /// card fill, no separator, and no row insets, so the mark and wordmark are
    /// the app introducing itself rather than an entry in a list of settings.
    @ViewBuilder
    func movarPlainRow() -> some View {
        self
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
#if os(iOS)
            .listRowSeparator(.hidden)
#endif
    }

    /// A tab's navigation container — and, on iOS, the reason the rows stop
    /// colliding with the clock.
    ///
    /// A `List` sitting directly in a `TabView` has no navigation bar, and with
    /// no bar there is nothing to draw the scroll-edge material: scrolled rows
    /// pass under the status bar and the Dynamic Island at full contrast, which
    /// is exactly what both of these screens did. The bar is what every stock tab
    /// has, and adopting it is both cheaper and more correct at every Dynamic
    /// Type size than hand-rolling a blur or hard-coding a top inset — neither of
    /// which would track the status bar growing (call, recording, Live Activity).
    ///
    /// It is also what makes About reachable as a PUSH: the stack this installs
    /// on the Settings tab is the one `SettingsView`'s About row pushes onto, and
    /// the back button it draws is the "‹ Settings" that names where the reader
    /// came from.
    ///
    /// INLINE, not large. On About, a large title would set "Про Мовар" in 34pt
    /// directly above a 56pt mark and a wordmark that introduce the same app; on
    /// Settings it would cost a third of the first screenful to a word the tab
    /// bar already says.
    ///
    /// macOS gets nothing: `NavigationView` there is a split view, which would
    /// wrap a single pane in a sidebar, and the window's own title bar already
    /// says "Movar". That is also why `SettingsView` presents About in a sheet on
    /// macOS — with no stack, there is nothing to push.
    @ViewBuilder
    func movarNavigationContainer(_ title: String) -> some View {
#if os(iOS)
        // `NavigationStack` is the iOS 16 replacement; the app's floor is 15.4,
        // so the deprecated `NavigationView` still has to be here for one more
        // OS cycle. `.stack` on the fallback because plain `NavigationView` is a
        // split view on iPad, and these are one pane on every size class.
        if #available(iOS 16.0, *) {
            NavigationStack {
                self
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
            }
        } else {
            NavigationView {
                self
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
            }
            .navigationViewStyle(StackNavigationViewStyle())
        }
#else
        self
#endif
    }

    /// The title for a screen that is PUSHED onto someone else's stack.
    ///
    /// About's counterpart to {@link movarNavigationContainer}: it names the
    /// screen without installing a second navigation container, because the one
    /// it is pushed into already exists. On macOS it does nothing — About is a
    /// sheet there, and the sheet's own header carries the title.
    @ViewBuilder
    func movarPushedTitle(_ title: String) -> some View {
#if os(iOS)
        self
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
#else
        self
#endif
    }

    /// The Edit button that turns on drag-to-reorder and swipe-to-delete.
    ///
    /// iOS only, because `EditButton` is: it drives `\.editMode`, which AppKit
    /// has no counterpart for. macOS reaches the same two actions through each
    /// row's context menu, which is that platform's native idiom anyway.
    ///
    /// Applied to the list BEFORE `movarNavigationContainer` wraps it, so the
    /// toolbar item lands on the bar that container installs rather than looking
    /// for one that does not exist yet.
    @ViewBuilder
    func movarEditToolbar() -> some View {
#if os(iOS)
        self.toolbar {
            ToolbarItem(placement: .navigationBarTrailing) { EditButton() }
        }
#else
        self
#endif
    }

    /// macOS's route to About: a sheet, since there is no stack to push onto.
    ///
    /// A no-op on iOS, where `SettingsView`'s row is a real `NavigationLink` and
    /// this binding is never set.
    @ViewBuilder
    func movarAboutSheet(isPresented: Binding<Bool>, host: HostStateModel) -> some View {
#if os(macOS)
        self.sheet(isPresented: isPresented) {
            MovarSheetContainer(
                title: HostStrings.tabAbout,
                closeLabel: HostStrings.commonDone,
                onClose: { isPresented.wrappedValue = false }
            ) {
                AboutView(host: host)
            }
        }
#else
        self
#endif
    }

    /// A text field that expects a domain, not a sentence.
    ///
    /// `disableAutocorrection` rather than iOS 15's `autocorrectionDisabled()`,
    /// which is macOS 12; the older spelling covers both floors. Autocapitalisation
    /// is iOS-only — AppKit never capitalises a field for you.
    @ViewBuilder
    func movarDomainField() -> some View {
#if os(iOS)
        self
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
#else
        self.disableAutocorrection(true)
#endif
    }

    /// The bordered (outlined) button style where the OS has one.
    ///
    /// Same availability seam as the prominent style below: `.bordered` arrived
    /// with iOS 15 / macOS 12, and the app's macOS floor is 11.
    @ViewBuilder
    func movarBorderedButtonStyle() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.buttonStyle(.bordered)
        } else {
            self
        }
    }

    /// The prominent (tinted) button style where the OS has one.
    ///
    /// macOS 11 has no `.borderedProminent`; it gets the default push-button,
    /// which is the correct-looking control on that OS rather than a downgrade.
    @ViewBuilder
    func movarProminentButtonStyle() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.buttonStyle(.borderedProminent)
        } else {
            self
        }
    }

    /// A button that should read as a LIST ROW, not as a control sitting in one.
    ///
    /// iOS already renders a `Button` in a `List` this way; macOS renders a real
    /// push button, which turns a column of links into a stack of grey
    /// rectangles. `PlainButtonStyle` is the stock way to say "the label is the
    /// control".
    @ViewBuilder
    func movarRowButtonStyle() -> some View {
#if os(macOS)
        self.buttonStyle(PlainButtonStyle())
#else
        self
#endif
    }
}

/// Chrome for a modally presented screen — a title and one way out.
///
/// iOS gets a navigation bar, because that is what a sheet has there and it
/// gives the close button a placement the system already reserves. macOS gets a
/// header row and an explicit minimum size, because an AppKit sheet is sized by
/// its content and a bare `List` in one would open as a sliver.
///
/// A `View` rather than a `View` extension: it WRAPS content instead of
/// modifying it, and the two trailing-closure call sites read better than a
/// modifier chain that has to invert itself.
struct MovarSheetContainer<Content: View>: View {

    let title: String
    /// "Cancel" for a sheet that is abandoning a task, "Done" for one that is
    /// only being read. The caller knows which it is; this does not.
    let closeLabel: String
    let onClose: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
#if os(iOS)
        NavigationView {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button(closeLabel, action: onClose)
                    }
                }
        }
        .navigationViewStyle(StackNavigationViewStyle())
#else
        VStack(spacing: 0) {
            HStack {
                Text(title)
                    .font(.headline)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 16)
                Button(closeLabel, action: onClose)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            Divider()
            content
        }
        .frame(minWidth: 380, minHeight: 360)
#endif
    }
}
