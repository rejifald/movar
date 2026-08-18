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

    /// macOS's route to a screen iOS PUSHES: a sheet, since there is no stack to
    /// push onto.
    ///
    /// A no-op on iOS, where the row that opens it is a real `NavigationLink` and
    /// this binding is never set — which is what lets both callers write the
    /// push and the presentation as one unconditional modifier.
    ///
    /// Generic over its content because there are two of these now, and they were
    /// on their way to being two copies of the same eight lines: Settings' About
    /// row, and the Audit composer's "What Movar Audit is". A second hand-rolled
    /// sheet is how the app ended up with two disagreeing sheet chromes in the
    /// first place.
    @ViewBuilder
    func movarDetailSheet<Content: View>(
        isPresented: Binding<Bool>,
        title: String,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
#if os(macOS)
        self.sheet(isPresented: isPresented) {
            MovarSheetContainer(
                title: title,
                closeLabel: HostStrings.commonDone,
                onClose: { isPresented.wrappedValue = false }
            ) {
                // A trailing closure, not `content: content()`. The stored
                // property is `@ViewBuilder`, so the memberwise initializer takes
                // `() -> Content` — passing the built value compiles nowhere, and
                // this branch is `#if os(macOS)`, so no iOS build ever sees it.
                content()
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

    /// A text field that expects a URL.
    ///
    /// Same family as {@link movarDomainField}, and deliberately not the same
    /// modifier: the audit box takes a whole address — scheme, path and query
    /// included — so it must not be autocapitalised, autocorrected or
    /// spell-checked, while a domain field additionally wants nothing else. The
    /// keyboard is the URL one on iOS, which puts `/` and `.com` where a person
    /// typing an address reaches for them.
    @ViewBuilder
    func movarURLField() -> some View {
#if os(iOS)
        self
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .disableAutocorrection(true)
#else
        self.disableAutocorrection(true)
#endif
    }

    /// The height an action button should be.
    ///
    /// `.borderedProminent` at its default control size draws a capsule sized for
    /// a button sitting in a row of other controls — noticeably thinner than what
    /// a screen's primary action is anywhere else on iOS, and thinner than every
    /// sampled confirmation sheet. `.large` is the stock way to ask for the other
    /// one; it grows with Dynamic Type like the default does, which a hard-coded
    /// `.frame(height:)` would not.
    @ViewBuilder
    func movarActionSize() -> some View {
        if #available(iOS 15.0, macOS 11.0, *) {
            self.controlSize(.large)
        } else {
            self
        }
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

/// The screen's primary action: filled, and the full width of whatever it sits in.
///
/// ONE TYPE RATHER THAN FOUR CALL SITES AGREEING BY HAND — which they did not.
/// The Detector's button was a full-width filled capsule; the Audit tab's, over
/// an identical "name a target, press the button" pairing, was a plain tinted
/// list row; the setup card's was a small bordered button floating at the
/// leading edge; and the two sheets that exist purely to collect one press
/// buried it in a list row below the fold. A call to action is the control a
/// screen is arranged around, and on a phone it should be the easiest thing on
/// it to hit.
///
/// THE WIDTH COMES FROM THE LABEL, not from the button. A bordered style sizes
/// its capsule to the label it is handed, so stretching the button would centre
/// a natural-width capsule in a wide row instead of filling it — which is the
/// trap this type exists to stop anyone falling into twice.
///
/// TEXT ONLY, AND NO PARAMETER FOR A SYMBOL. Three of the six call sites passed
/// one and three did not, which is drift on its own — but the deciding fact is
/// what iOS 26 does with it: a filled prominent button renders its `Label`
/// title-only while it is ENABLED and shows the glyph once it is DISABLED. The
/// symbol therefore appeared exactly when the button could not be pressed, and
/// "Визначити" sat greyed-out with a magnifier beside it while "Провести аудит",
/// live and green, had none. Stock iOS agrees anyway: a filled call to action is
/// a verb, and Apple's own — Continue, Sign In, Add — carry no leading glyph.
///
/// Removing the parameter rather than passing `nil` everywhere is the point. An
/// optional icon is an invitation to add one back at a single call site, and one
/// CTA with a glyph is precisely the state this type exists to prevent.
///
/// A `View` rather than a `View` extension for the same reason
/// {@link MovarSheetContainer} is one: getting this right means composing two
/// things in one order, and a modifier could not stop a caller applying half of
/// it.
struct MovarCallToAction: View {

    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title).frame(maxWidth: .infinity)
        }
        .movarProminentButtonStyle()
        .movarActionSize()
    }
}

/// The secondary half of an action pair: same width, no fill.
///
/// Outlined rather than plain text, because it is a BUTTON sitting under another
/// button and the pair has to read as two choices rather than one control with a
/// caption. Filled-primary-over-outlined-secondary is what six sampled iOS
/// confirmations converge on (X, Pinterest, Wise, Qonto, pliability, Grab), and
/// none of them puts the cancel in a navigation bar when the confirm is a button.
///
/// macOS 11 has no `.bordered`, so {@link movarBorderedButtonStyle} leaves it as
/// the default push button there — the correct-looking control on that OS rather
/// than a downgrade.
struct MovarSecondaryAction: View {

    let title: String
    let action: () -> Void

    init(_ title: String, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title).frame(maxWidth: .infinity)
        }
        .movarBorderedButtonStyle()
        .movarActionSize()
    }
}

extension View {

    /// Pin a sheet's actions to the bottom, above the content rather than inside
    /// it.
    ///
    /// WHY NOT A LIST ROW. A `Section` holding one button draws a card around it,
    /// so the capsule sat inside a white rounded rectangle inside the grouped
    /// background — three nested rounded shapes to present one action. No sampled
    /// iOS confirmation does that; every one puts its buttons on the sheet's own
    /// surface.
    ///
    /// It also settles something `AuditConfirmSheet` already worried about in
    /// prose: "a panel under the composer put its Cancel below the fold on a
    /// phone. A confirmation whose cancel is off screen is not a confirmation."
    /// A pinned bar is on screen at every Dynamic Type size and every content
    /// length, which is the structural version of that promise rather than the
    /// hopeful one.
    ///
    /// `safeAreaInset` is iOS 15 / macOS 12 and this app's macOS floor is 11, so
    /// the fallback stacks the bar under the content instead of floating it. Both
    /// of these sheets are fixed-size on macOS, so nothing scrolls behind it
    /// there and the material it cannot draw is not missed.
    @ViewBuilder
    func movarActionBar<Actions: View>(
        @ViewBuilder _ actions: @escaping () -> Actions
    ) -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.safeAreaInset(edge: .bottom) {
                MovarActionBar(content: actions)
            }
        } else {
            VStack(spacing: 0) {
                self
                MovarActionBar(content: actions)
            }
        }
    }
}

/// The bar itself: a hairline, then the actions stacked full-width.
///
/// Separate from the modifier so both availability branches build the same thing,
/// and so the material stays one `if #available` rather than two.
struct MovarActionBar<Content: View>: View {

    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            VStack(spacing: 10) {
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
        }
        .movarBarBackground()
    }
}

extension View {

    /// The bar material, where the OS has one.
    @ViewBuilder
    fileprivate func movarBarBackground() -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.background(.bar)
        } else {
            self
        }
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
    ///
    /// OPTIONAL, because a sheet whose actions are a pinned pair already has its
    /// cancel — as a button beside the one it is refusing, which is where the
    /// sampled iOS confirmations put it. Offering a second one in the navigation
    /// bar would be two ways out of one sheet, and the reader would have to work
    /// out whether they differ. Nil leaves the bar with just the title; the sheet
    /// is still dismissible by swipe.
    var closeLabel: String? = nil
    var onClose: (() -> Void)? = nil
    @ViewBuilder let content: Content

    var body: some View {
#if os(iOS)
        NavigationView {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                // The `if let` sits INSIDE the item, not around it:
                // `ToolbarContentBuilder` grew `buildIf` in iOS 16 and this app
                // ships to 15.4, so a conditional at the toolbar level does not
                // compile. An item whose content resolves to nothing draws
                // nothing, which is the same outcome one version earlier.
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        if let closeLabel = closeLabel, let onClose = onClose {
                            Button(closeLabel, action: onClose)
                        }
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
                if let closeLabel = closeLabel, let onClose = onClose {
                    Button(closeLabel, action: onClose)
                }
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
