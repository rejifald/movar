//
//  AuditView.swift
//  Shared (App)
//
//  Movar Audit's model (session-only runs, activity, the acknowledgement) and the
//  acknowledgement sheet. The screens built on it live in `AuditHomeSection.swift`
//  and `AuditProgressView.swift`; the root screen hosts them.
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

    /// Empty, so the field shows its placeholder; `defaultTarget` is what the
    /// empty-state action fills in (see `runDefault()`).
    @Published var url: String = ""
    @Published var applyUaPack = false
    @Published var activity: AuditActivity = .idle
    @Published private(set) var runs: [AuditRun] = []

    /// The destination selection: a run's id (or the in-flight run's id), and
    /// on macOS `newAuditTag` for the composer pane. `nil` on iOS is the home
    /// list itself; on macOS the shell treats `nil` as "nothing chosen yet".
    ///
    /// Both the iOS rows and the macOS sidebar rows bind their
    /// `NavigationLink(tag:selection:)` to THIS, so completing a run opens its
    /// report on either platform.
    @Published var openedRunID: String?

    /// The `openedRunID` value that selects the macOS «Новий аудит» pane.
    static let newAuditTag = "audit.new"

    /// What `openedRunID` returns to when a run fails or the open run is removed.
    static var homeSelection: String? {
#if os(macOS)
        newAuditTag
#else
        nil
#endif
    }

    /// The run in flight: its pre-allocated id (the id its report will carry, so
    /// the row and the pushed screen keep one identity from "running" to
    /// "finished") and the target being probed. `nil` when idle or failed.
    struct PendingRun: Equatable {
        let id: String
        let target: String
    }
    @Published private(set) var pendingRun: PendingRun?

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

    /// The empty-state action: audit Movar's own site through the normal flow
    /// (normalize, acknowledgement once per session, run).
    func runDefault() {
        url = Self.defaultTarget
        runTyped()
    }

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
        let pending = PendingRun(id: "\(target) \(Date().timeIntervalSince1970)", target: target)
        pendingRun = pending
        // The progress screen is the selection while the run is in flight.
        openedRunID = pending.id
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
                    self.remember(id: pending.id, target: target, outcome: outcome)
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
                    self.pendingRun = nil
                    self.openedRunID = Self.homeSelection
                }
            })
    }

    private func remember(id: String, target: String, outcome: AuditOutcome) {
        let run = AuditRun(id: id, target: target, ranAt: Date(), outcome: outcome)
        runs = Array(([run] + runs).prefix(Self.maxRememberedRuns))
        pendingRun = nil
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
        if let opened = openedRunID, doomed.contains(opened) { openedRunID = Self.homeSelection }
        runs.remove(atOffsets: offsets)
    }

    func remove(id: String) {
        if openedRunID == id { openedRunID = Self.homeSelection }
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
        MovarSheetContainer(title: HostStrings.auditConfirmTitle, measure: .confirmation) {
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
                        .movarWrapping()
                }

                Section {
                    ForEach(HostStrings.auditConfirmPoints, id: \.self) { point in
                        movarUnhyphenated(point)
                            .movarWrapping()
                    }
                } footer: {
                    // Says the asking is once per session, so pressing through
                    // is not a habit being trained. It rides the last content
                    // section rather than the action bar: the bar is two
                    // choices, and a sentence between them and the content
                    // would read as a caption on the button.
                    Text(HostStrings.auditConfirmOnce)
                        .movarWrapping()
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
