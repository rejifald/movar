//
//  AuditView.swift
//  Shared (App)
//
//  The Audit tab's first screen: what to audit, what came of the last few, and
//  what Movar Audit is.
//

import Combine
import SwiftUI

/// One completed audit, kept so it can be reopened without re-probing a site.
struct AuditRun: Identifiable, Equatable {
    let id: String
    /// The normalized URL that was probed — the machine's form, kept because
    /// "Audit again" re-runs exactly what produced this report.
    let target: String
    let ranAt: Date
    let outcome: AuditOutcome

    static func == (lhs: AuditRun, rhs: AuditRun) -> Bool { lhs.id == rhs.id }
}

/// What the composer is doing.
///
/// One value rather than several flags, so a run can never render as "in flight,
/// 5 of 5" or leave a stale bar under a finished audit: the progress and the
/// state change together, so they are one thing.
enum AuditActivity: Equatable {
    case idle
    case running(done: Int, total: Int)
    case failed(message: String)
}

/// The Audit tab's state, for as long as the app is running.
///
/// SESSION-SCOPED AND IN MEMORY, deliberately. Nothing about an audit is written
/// to disk: a list of "sites this person chose to investigate" is not a neutral
/// record, and persisting one is a decision to take on purpose rather than a
/// side effect of adding a history list. The screen says so next to the list
/// instead of leaving it to be discovered.
///
/// It outlives the view because a `TabView` rebuilds its content freely and a
/// run must not be lost to a tab switch — the same reason `SettingsStore` is
/// owned by `ViewController` rather than by `SettingsView`.
@MainActor
final class AuditModel: ObservableObject {

    /// How many previous audits the list keeps.
    static let maxRememberedRuns = 25

    /// What the URL box starts on: Movar's own site.
    ///
    /// Dogfooding, and the honest kind. movar.fyi ships **no** language picker,
    /// so the picker family reads `not-applicable` rather than passing — the
    /// first thing a new reader sees is a report that distinguishes "checked and
    /// fine" from "there was nothing here to check", which is the distinction the
    /// whole tool rests on. Hand-synced with `@movar/brand`'s `SITE_URL` through
    /// `HostActions`, as every other URL in this target is.
    static var defaultTarget: String { HostActions.siteURLString }

    @Published var url: String = AuditModel.defaultTarget
    @Published var applyUaPack = false
    @Published var activity: AuditActivity = .idle
    @Published private(set) var runs: [AuditRun] = []

    /// The run being read, by id, or `nil` for the composer.
    @Published var openedRunID: String?

    /// The target waiting on the outbound-request acknowledgement.
    ///
    /// Carries the ALREADY-NORMALIZED target, so what the sheet names is exactly
    /// what gets requested — not whatever the input holds by the time the reader
    /// presses through.
    @Published var confirming: String?

    /// Whether this session has acknowledged that auditing makes outbound
    /// requests.
    ///
    /// In memory and session-scoped, exactly like the run history and for the
    /// same reason: a consent flag persisted to the shared settings store would
    /// be the first thing this tab ever recorded about a person's choices. Once
    /// per session is the honest trade — a real acknowledgement rather than a
    /// dialog reflex, and it costs one press.
    private var acknowledged = false

    /// The SHARED engine — the same `EngineHost` the Detector tab uses. One
    /// bundle parsed once, and one request budget against a third party's server.
    private let engine: EngineHost

    /// The catalogue's families, for sectioning a report. Empty until the engine
    /// answers, which sections everything under no heading rather than wrongly.
    @Published private(set) var catalogue: [CatalogueFamily] = []

    init(engine: EngineHost) {
        self.engine = engine
        // Asked once at construction rather than per report: it is a fact about
        // the build and cannot change while the app runs.
        engine.describeCatalogue { [weak self] families in
            self?.catalogue = families
        }
    }

    var openedRun: AuditRun? { runs.first { $0.id == openedRunID } }

    var isRunning: Bool {
        if case .running = activity { return true }
        return false
    }

    // MARK: - Running

    /// The composer's button: normalize what was typed, then either ask for the
    /// acknowledgement or run.
    ///
    /// The gate sits here rather than inside {@link run(target:)} on purpose:
    /// "Audit again" on the report screen also runs, and reaching a report at all
    /// means the acknowledgement was already given this session. Asking a second
    /// time for the same target would be theatre, not consent.
    func runTyped() {
        guard let target = Self.normalize(url) else {
            activity = .failed(message: HostStrings.auditInvalidURL)
            return
        }
        guard acknowledged else {
            confirming = target
            return
        }
        run(target: target)
    }

    /// Pressed through the acknowledgement: remember it, then run that target.
    func confirmRun(_ target: String) {
        acknowledged = true
        confirming = nil
        run(target: target)
    }

    /// Run one audit against an already-normalized target.
    ///
    /// Takes the target rather than reading the input, so "Audit again" re-runs
    /// the URL its report was produced from — not whatever happens to be sitting
    /// in the composer behind it.
    func run(target: String) {
        activity = .running(done: 0, total: 0)
        engine.runAudit(
            url: target,
            uaPack: applyUaPack,
            onProgress: { [weak self] done, total in
                // Guarded: a late leg settling after a failure must not
                // resurrect the running state over an error being read.
                guard let self = self, self.isRunning else { return }
                self.activity = .running(done: done, total: total)
            },
            completion: { [weak self] result in
                guard let self = self else { return }
                switch result {
                case .success(let outcome):
                    self.remember(target: target, outcome: outcome)
                case .failure(let failure):
                    // The bridge being absent is a fact about the app, not about
                    // the site — it gets its own message so nobody reads it as
                    // "this site is broken".
                    self.activity = .failed(
                        message: failure.isProbeUnavailable
                            ? HostStrings.auditNoBridge : HostStrings.auditFailed)
                    // A failed re-run returns to the composer, where the error
                    // belongs: leaving the previous report on screen under a
                    // failed re-run would make a stale document look fresh.
                    self.openedRunID = nil
                }
            })
    }

    private func remember(target: String, outcome: AuditOutcome) {
        let run = AuditRun(
            id: "\(target) \(Date().timeIntervalSince1970)",
            target: target, ranAt: Date(), outcome: outcome)
        runs = Array(([run] + runs).prefix(Self.maxRememberedRuns))
        activity = .idle
        // Straight to the report: the person pressed the button to read it.
        openedRunID = run.id
    }

    /// Drop audits from the list.
    ///
    /// No confirmation, because the gesture already is one: reaching this needs a
    /// swipe and then a tap on the revealed control, or a deliberate pick from a
    /// context menu. The web list had to ask, since its × was one stray tap away
    /// from destroying a run that costs another full matrix against somebody
    /// else's server to rebuild; the platform's own destructive idiom charges
    /// that same deliberation without a second screen, which is exactly the case
    /// where a system control replaces a hand-rolled one.
    func remove(atOffsets offsets: IndexSet) {
        let doomed = offsets.map { runs[$0].id }
        if let opened = openedRunID, doomed.contains(opened) { openedRunID = nil }
        runs.remove(atOffsets: offsets)
    }

    func remove(id: String) {
        if openedRunID == id { openedRunID = nil }
        runs.removeAll { $0.id == id }
    }

    // MARK: - Exporting

    /// Render one finished run as the self-contained HTML artifact.
    ///
    /// `nil` means the engine could not produce one — which the caller reports as
    /// "exporting only works inside the app" rather than as anything about the
    /// site. Routed through the model rather than letting the report screen hold
    /// the engine, so `EngineHost` has exactly one owner.
    func renderArtifact(for run: AuditRun, completion: @escaping (String?) -> Void) {
        engine.renderArtifact(
            for: run.outcome,
            target: run.target,
            generatedAt: ISO8601DateFormatter().string(from: run.ranAt)
        ) { result in
            switch result {
            case .success(let html): completion(html)
            case .failure: completion(nil)
            }
        }
    }

    // MARK: - Target normalisation

    /// Normalize what was typed into something probe-able.
    ///
    /// People paste `example.com`. Defaulting a bare host to `https` is the right
    /// guess — and the redirect chain records it honestly if the site sends us
    /// somewhere else. Returns `nil` when there is nothing usable, so the screen
    /// can say so instead of probing gibberish.
    ///
    /// Mirrors `normalizeAuditUrl` in `AuditTab.tsx`, including its refusal of
    /// every scheme but `http`/`https`: the prober refuses them too, and a screen
    /// that accepted `file:` here would report a refusal as though the site had
    /// failed.
    static func normalize(_ raw: String) -> String? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let hasScheme = trimmed.range(of: "^[a-z][a-z0-9+.-]*:", options: [.regularExpression, .caseInsensitive]) != nil
        let candidate = hasScheme ? trimmed : "https://\(trimmed)"
        guard let url = URL(string: candidate),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            let host = url.host, !host.isEmpty
        else { return nil }
        return url.absoluteString
    }

    /// The host of a normalized target — `https://shop.example.ua/uk/` →
    /// `shop.example.ua`.
    static func hostOf(_ target: String) -> String {
        URL(string: target)?.host ?? target
    }

    /// A normalized target, back in the form a person would have typed it.
    ///
    /// Drops the scheme and one trailing slash, and keeps everything that carries
    /// meaning — the path, the query, and `www.`, which is a different host from
    /// the apex and can serve a different language.
    static func prettyTarget(_ target: String) -> String {
        guard let url = URL(string: target), let host = url.host else { return target }
        let query = url.query.map { "?\($0)" } ?? ""
        let fragment = url.fragment.map { "#\($0)" } ?? ""
        let shown = "\(host)\(url.path)\(query)\(fragment)"
        return shown.hasSuffix("/") ? String(shown.dropLast()) : shown
    }
}

// MARK: - The composer

/// Movar Audit's app surface: point it at a site, read what it found.
///
/// TWO SCREENS, NOT ONE PANEL — the shape the React tab arrived at and the one
/// the platform draws for free. The composer takes a URL, says what Movar Audit
/// is, and lists the audits already run; opening one PUSHES the report. A
/// language conformance report is a document read top to bottom, and rendering
/// it inline under the form made it read as the form's output while burying the
/// previous run the moment a new one started.
///
/// APPEARANCE IS STOCK, as `AboutView` and `SettingsView` are: `List` +
/// `Section` + `TextField` + `Toggle` + `DisclosureGroup`, the platform type
/// ramp and palettes, SF Symbols, and one brand customisation (the accent,
/// applied once in `MovarRootView`). The web original hand-rolled a progress
/// bar out of two divs, a history row out of two nested buttons under one
/// bordered `<li>`, and a confirmation out of a full-page div — each of which
/// has an exact stock counterpart that brings Dynamic Type, VoiceOver, Full
/// Keyboard Access and swipe-to-delete with it.
///
/// THREE THINGS THIS SCREEN DELIBERATELY DOES NOT DO, unchanged by going native:
///
/// - **It does not judge.** Every verdict comes from `evaluate()`, the pure
///   kernel the CLI runs, inside `EngineHost`. This file renders a `Report`; it
///   never decides what is in one.
/// - **It does not fetch.** Every request goes through `AuditProber`. The
///   engine's document declares `default-src 'none'`, so that is structural
///   rather than a matter of discipline.
/// - **It does not apply a jurisdiction pack unless asked.** The Ukrainian
///   statute rules are a legal claim about a specific country's law, so they are
///   composed in by an explicit choice and off by default. Applying Law
///   2704-VIII to a German site would be a false accusation with the product's
///   name on it.
struct AuditView: View {

    @ObservedObject var model: AuditModel

    /// macOS only — see {@link explainerSection} for why one platform pushes and
    /// the other presents.
    @State private var showingAbout = false

    var body: some View {
#if os(macOS)
        // macOS has no navigation stack to push onto — `NavigationView` there is
        // a split view, which would wrap this single pane in a sidebar — so the
        // report replaces the composer and draws its own way back. iOS pushes;
        // see `reportLink`.
        if let run = model.openedRun {
            AuditReportView(run: run, model: model, onBack: { model.openedRunID = nil })
        } else {
            composer
        }
#else
        composer
#endif
    }

    private var composer: some View {
        List {
            targetSection
            activitySection
            packSection
            previousSection
            explainerSection
        }
        .movarListStyle()
        // The run button is PINNED BELOW THE LIST rather than sitting in the
        // target section. A `.borderedProminent` button inside a grouped row
        // supplies its own fill, corner radius and inset on top of the ones the
        // row already draws, so it reads as a control floating in the card
        // instead of as the section's action — and it was the only place in the
        // app that put a filled button in a list row, against the tinted rows
        // `SettingsView` uses everywhere else. The same bar the confirmation and
        // allowlist sheets already use puts a primary action where it belongs on
        // both platforms, and keeps it reachable once the list scrolls.
        .movarActionBar {
            MovarCallToAction(
                model.isRunning ? HostStrings.auditRunning : HostStrings.auditRun,
                action: model.runTyped
            )
            .disabled(model.isRunning)
        }
        .movarNavigationContainer(HostStrings.tabAudit)
        .sheet(isPresented: confirmPresented) {
            if let target = model.confirming {
                AuditConfirmSheet(
                    target: target,
                    onCancel: { model.confirming = nil },
                    onProceed: { model.confirmRun(target) })
            }
        }
        .movarDetailSheet(isPresented: $showingAbout, title: HostStrings.auditAboutTitle) {
            AuditAboutView()
        }
    }

    // MARK: - Target

    /// The URL box, under one heading.
    ///
    /// The intro is the section FOOTER — it says what an audit reports, which is
    /// what someone weighing the button below wants, and a grouped list has a
    /// real place for exactly that sentence. A `Section` header is set in small
    /// caps and would have made a sentence shout.
    ///
    /// The run button is deliberately NOT a second row here — see `composer`.
    private var targetSection: some View {
        Section {
            TextField(HostStrings.auditPlaceholder, text: $model.url, onCommit: model.runTyped)
                .movarURLField()
                .disabled(model.isRunning)
        } header: {
            Text(HostStrings.auditTitle)
        } footer: {
            movarUnhyphenated(HostStrings.auditIntro)
        }
    }

    /// Progress, or the last error. Absent when there is neither.
    ///
    /// A DETERMINATE bar, because the total genuinely is known: the matrix is a
    /// fixed number of legs. An indeterminate spinner would say only "something
    /// is happening" for what can be a two-minute wait against a slow site. The
    /// total is `0` for the beat before the engine reports one, which
    /// `ProgressView` renders as an empty bar rather than as a division by zero.
    @ViewBuilder
    private var activitySection: some View {
        switch model.activity {
        case .idle:
            EmptyView()
        case .running(let done, let total):
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: Double(done), total: Double(max(total, 1)))
                    Text(HostStrings.auditProgress(done, max(total, 1)))
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                .accessibilityElement(children: .combine)
            } footer: {
                Text(HostStrings.auditRunningNote)
            }
        case .failed(let message):
            Section {
                Label {
                    Text(message)
                } icon: {
                    Image(systemName: "exclamationmark.triangle")
                }
            }
        }
    }

    // MARK: - Jurisdiction pack

    /// The `ua` pack opt-in, off by default on every platform.
    ///
    /// The label NAMES the pack; it does not describe an act. The footer still
    /// carries the weight — who it applies to, and that switching it on is the
    /// operator's call.
    ///
    /// **The row is assembled by hand rather than left to `Toggle`'s own label,
    /// and the citation moved into it.** Ukrainian spends 31 characters on a name
    /// English says in 23, so `audit.uaPack` wraps to two lines on a phone — and a
    /// stock `Toggle` centres its switch against the label as a whole, which
    /// leaves it hanging between the two lines with nothing to align to. Read that
    /// way the wrap looks like a defect rather than a decision. Splitting
    /// `audit.uaPackLaw` out of the hint gives the second line a job — it is the
    /// description the title always implied — and `.top` alignment pins the switch
    /// to the title's line, where the eye looks for the control that answers it.
    ///
    /// The switch is still the platform's. `labelsHidden()` drops the label
    /// visually and keeps it as the accessible name, so nothing here restyles a
    /// control (`docs/native-shells.md`); the two texts combine into one element
    /// so VoiceOver reads the pack and its statute as a single statement instead
    /// of two loose strings next to a switch.
    private var packSection: some View {
        Section {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(HostStrings.auditUaPack)
                    movarUnhyphenated(HostStrings.auditUaPackLaw)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                .accessibilityElement(children: .combine)

                Spacer(minLength: 0)

                Toggle(HostStrings.auditUaPack, isOn: $model.applyUaPack)
                    .labelsHidden()
                    .disabled(model.isRunning)
            }
        } footer: {
            movarUnhyphenated(HostStrings.auditUaPackHint)
        }
    }

    // MARK: - Previous audits

    /// The audits already run this session.
    ///
    /// Absent, not empty, before the first one: an empty-state row explaining
    /// that no audits have been run yet says nothing the absent section does not.
    @ViewBuilder
    private var previousSection: some View {
        if !model.runs.isEmpty {
            Section {
                ForEach(model.runs) { run in
                    reportLink(for: run)
                        .contextMenu {
                            // The macOS path to the same act — that platform's
                            // `List` has no swipe-to-delete — and on iOS a second
                            // route for anyone who does not swipe.
                            Button(HostStrings.settingsRemove) { model.remove(id: run.id) }
                        }
                }
                .onDelete(perform: model.remove(atOffsets:))
            } header: {
                Text(HostStrings.auditPrevious)
            } footer: {
                // Stated once, next to the thing it is about. A reader building a
                // case against a company needs to know this BEFORE they close the
                // app, not after.
                Text(HostStrings.auditNotStored)
            }
        }
    }

    /// One previous audit, and the way into it.
    ///
    /// iOS gets a real `NavigationLink` — the push, the back button reading
    /// "‹ Audit", and the chevron all come with it. macOS has no stack, so the
    /// row is a button that swaps the tab's content and the report draws its own
    /// way back.
    @ViewBuilder
    private func reportLink(for run: AuditRun) -> some View {
#if os(iOS)
        NavigationLink(
            destination: AuditReportView(run: run, model: model, onBack: nil),
            tag: run.id,
            selection: $model.openedRunID
        ) {
            AuditRunRow(run: run)
        }
#else
        Button {
            model.openedRunID = run.id
        } label: {
            HStack {
                AuditRunRow(run: run)
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .contentShape(Rectangle())
        }
        .movarRowButtonStyle()
#endif
    }

    // MARK: - Explainers

    /// The way to "What Movar Audit is" — a row, not two sections of prose.
    ///
    /// The composer used to carry the whole explainer inline: what the tool is,
    /// three claims about what it refuses to do, and three guarantees about what
    /// it does to somebody else's server. Six paragraphs, under a form, read once
    /// by anyone and never again. `AuditAboutView` has the argument for why that
    /// moved; what stays here is the one line that answers "what will this tell
    /// me" — the `audit.intro` footer under the URL box — which is what someone
    /// weighing the button actually needs.
    ///
    /// LAST, and shaped exactly like Settings' About row, down to the glyph:
    /// these are the same thing (a once-ever destination hanging off a screen
    /// people return to) and an app that draws them differently is telling the
    /// reader they are not.
    ///
    /// iOS PUSHES and macOS PRESENTS, for the reason `SettingsView` records:
    /// `NavigationView` on macOS is a split view, so there is no stack to push
    /// onto and {@link movarDetailSheet} is the honest equivalent there.
    private var explainerSection: some View {
        Section {
#if os(iOS)
            NavigationLink(destination: AuditAboutView()) {
                Label(HostStrings.auditAboutTitle, systemImage: "info.circle")
            }
#else
            Button {
                showingAbout = true
            } label: {
                Label(HostStrings.auditAboutTitle, systemImage: "info.circle")
                    .contentShape(Rectangle())
            }
            .movarRowButtonStyle()
#endif
        }
    }

    // MARK: - Bindings

    /// `confirming` is a target, not a flag, so the sheet's `isPresented` is
    /// derived from it — one source of truth for "which host are we asking
    /// about", rather than a boolean that could disagree with it.
    private var confirmPresented: Binding<Bool> {
        Binding(
            get: { model.confirming != nil },
            set: { shown in if !shown { model.confirming = nil } })
    }
}

// MARK: - One previous audit

/// A row in the history list.
///
/// Leads with the HEADLINE it produced, because that is what makes a list of past
/// runs worth having — a row that only said "movar.fyi, 13:57" would make you
/// open every one to find the one that failed.
struct AuditRunRow: View {

    let run: AuditRun

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(AuditModel.prettyTarget(run.target))
                    .foregroundColor(.primary)
                Text(AuditVerdictStyle.headline(for: run.outcome.report) + " · " + Self.stamp(run.ranAt))
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        } icon: {
            Image(systemName: AuditVerdictStyle.headlineSymbol(for: run.outcome.report))
                .foregroundColor(AuditVerdictStyle.headlineTint(for: run.outcome.report))
        }
        // One element, one sentence. Read as three, VoiceOver announces a
        // hostname, a count and a time with nothing joining them.
        .accessibilityElement(children: .combine)
    }

    /// When an audit ran, in the reader's own locale and format.
    private static func stamp(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateStyle = .short
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

// MARK: - The acknowledgement

/// The outbound-request acknowledgement, shown before the first audit of a
/// session.
///
/// A SHEET, not an alert and not a panel under the composer. Movar's whole
/// promise elsewhere is that nothing leaves the browser, and this one feature is
/// the exception: it reaches a third-party server the person named. Four facts
/// have to fit — who is contacted, what the request does not carry, that the
/// site's owner will see it, and that no Movar server is involved — which is more
/// than an alert can hold without turning into a wall, and a panel under the
/// composer put its Cancel below the fold on a phone. A confirmation whose cancel
/// is off screen is not a confirmation.
struct AuditConfirmSheet: View {

    let target: String
    let onCancel: () -> Void
    let onProceed: () -> Void

    var body: some View {
        // No navigation-bar close: the cancel is the second button in the
        // pinned pair below, beside the action it refuses. Pinned rather than
        // scrolled with the content, so neither choice can end up below the fold
        // at a large text size — a confirmation whose cancel is off screen is not
        // a confirmation.
        MovarSheetContainer(title: HostStrings.auditConfirmTitle) {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        // The HOST is the identity — it is what the request goes
                        // to, and a full URL as a heading wraps into three lines
                        // of punctuation on a phone. The address underneath
                        // appears only when it says something the host does not,
                        // which is a path or a query: `movar.fyi` over
                        // `movar.fyi` was the same fact twice, dressed as
                        // precision. Same rule as the report screen's header.
                        Text(AuditModel.hostOf(target))
                            .font(.headline)
                        if AuditModel.prettyTarget(target) != AuditModel.hostOf(target) {
                            Text(AuditModel.prettyTarget(target))
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)
                } footer: {
                    movarUnhyphenated(HostStrings.auditConfirmBody(AuditModel.hostOf(target)))
                }

                Section {
                    ForEach(HostStrings.auditConfirmPoints, id: \.self) { point in
                        movarUnhyphenated(point)
                    }
                } footer: {
                    // Says the asking is once per session, so pressing through
                    // is not a habit being trained. It rides the last content
                    // section rather than the action bar: the bar is two
                    // choices, and a sentence between them and the content
                    // would read as a caption on the button.
                    Text(HostStrings.auditConfirmOnce)
                }
            }
            .movarListStyle()
            .movarActionBar {
                MovarCallToAction(HostStrings.auditConfirmProceed, action: onProceed)
                MovarSecondaryAction(HostStrings.auditConfirmCancel, action: onCancel)
            }
        }
    }
}
