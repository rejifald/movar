//
//  DetectorModel.swift
//  Shared (App)
//
//  The Detector tab's state, and the engine result it renders.
//

import Combine
import Foundation

// `ObservableObject` and `@Published` are Combine's, not SwiftUI's. Imported
// explicitly for the reason `HostState.swift` records: some SDKs re-export them
// transitively and the iOS/macOS 26 SDK does not, so leaning on SwiftUI compiles
// locally and fails a real build.

/// What one candidate had going for it — the Swift face of the engine's
/// `CandidateEvidence`.
struct CandidateEvidence: Equatable, Identifiable {

    var id: String { code }
    let code: String

    /// Whether this candidate was actually compared.
    ///
    /// The classifier scopes to the text's dominant script first, so English
    /// never competes for Cyrillic text. An out-of-scope candidate is still
    /// rendered — "English is on your list and sat this one out" answers a
    /// question a reader would otherwise ask of a screen showing two rows where
    /// three languages are configured.
    let inScope: Bool

    let letters: [String]
    let functionWords: [String]
    let frequentWords: [String]
    let francClosest: Bool

    /// True when this candidate contributed nothing at any rung.
    var isEmpty: Bool {
        letters.isEmpty && functionWords.isEmpty && frequentWords.isEmpty && !francClosest
    }

    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any], let code = dict["code"] as? String else {
            return nil
        }
        self.code = code
        self.inScope = dict["inScope"] as? Bool ?? false
        self.letters = dict["letters"] as? [String] ?? []
        self.functionWords = dict["functionWords"] as? [String] ?? []
        self.frequentWords = dict["frequentWords"] as? [String] ?? []
        self.francClosest = dict["francClosest"] as? Bool ?? false
    }
}

/// A finished detection, scope included — the Swift face of `DetectResult`.
///
/// Decoded by hand from the bridge's `[String: Any]` rather than through
/// `Codable`, because that is the shape `WKScriptMessage` delivers and a
/// round-trip back through `JSONSerialization` to reach a decoder would buy
/// nothing here. Every field defaults rather than failing: a shell that renders
/// nothing because one optional was absent is a worse outcome than one that
/// renders a verdict without its margin. `docs/native-shells.md` files generated
/// `Codable` types off the TS schema as the endgame; this is the hand-written
/// stand-in, and it is small on purpose.
struct DetectResult: Equatable {

    let language: String?
    let rung: String?
    let discriminating: Bool
    let candidates: [String]
    let scoped: [String]
    let evidence: [CandidateEvidence]
    let sharedLetters: [String]
    let sharedWords: [String]

    init?(_ raw: Any?) {
        guard let dict = raw as? [String: Any] else { return nil }
        self.language = dict["language"] as? String
        self.rung = dict["rung"] as? String
        self.discriminating = dict["discriminating"] as? Bool ?? false
        self.candidates = dict["candidates"] as? [String] ?? []
        self.scoped = dict["scoped"] as? [String] ?? []
        // An explicit closure, not `.compactMap(CandidateEvidence.init)`. The
        // target defaults its actor isolation to `MainActor`, so an unapplied
        // initializer reference has to be converted to a plain nonisolated
        // function type and loses that isolation; a synchronous non-escaping
        // closure inherits it instead.
        self.evidence = (dict["evidence"] as? [Any] ?? []).compactMap { CandidateEvidence($0) }
        self.sharedLetters = dict["sharedLetters"] as? [String] ?? []
        self.sharedWords = dict["sharedWords"] as? [String] ?? []
    }

    /// Evidence with the winner first, then the rest of the compared set, then
    /// the candidates that were never in the running.
    ///
    /// Ordered HERE rather than in the engine, which is presentation-free by
    /// design — three shells may each want a different order and only one of
    /// them is this one.
    var rankedEvidence: [CandidateEvidence] {
        evidence.sorted { left, right in
            if (left.code == language) != (right.code == language) { return left.code == language }
            if left.inScope != right.inScope { return left.inScope }
            return false  // otherwise keep the roster's own order (sort is stable)
        }
    }

    /// True when the roster produced an answer nothing could have contradicted.
    ///
    /// A verdict over one in-scope candidate is not wrong — it is the honest
    /// output of the question asked — but it is not a finding either, and the
    /// screen has to say which of the two it is showing.
    var isForced: Bool { language != nil && !discriminating }
}

/// The Detector tab's state.
///
/// Holds the roster, the text, and the last result. It does NOT hold a
/// classifier: the verdict comes from `@movar/lang-detect` inside the engine,
/// the same code the extension runs on real pages, so this tab can never drift
/// from what Movar will actually do. That is the reason a pure-Swift
/// reimplementation was never on the table — the tab's whole value is being a
/// diagnostic for the real thing.
@MainActor
final class DetectorModel: ObservableObject {

    /// The comparison set as shipped: the three Cyrillic languages Movar exists
    /// to tell apart.
    ///
    /// NOT derived from `MovarSettings.priority`, which `docs/native-shells.md`
    /// leaves as an open question. Two facts settle it. `enforceLockedLanguages`
    /// strips locked codes from `priority`, so `ru` — the one language the
    /// product exists to detect — is never in it; and the default priority is
    /// `['uk', 'en']`, whose two members are different scripts, so script
    /// scoping would leave exactly one candidate and every Cyrillic text would
    /// come back "Ukrainian" by default. A priority-derived roster is therefore
    /// not merely a weaker diagnostic, it is a broken one.
    static let defaultRoster = ["uk", "ru", "be"]

    /// Where the roster is kept, and where it deliberately is NOT.
    ///
    /// This is the host app's own `UserDefaults`, not the shared App Group. The
    /// roster changes what this screen compares; it changes nothing about what
    /// the extension hides on a page. Writing it into `MovarSettings` would put
    /// a diagnostic preference into the store the extension reconciles, and
    /// would tell a reader that narrowing the comparison narrows their
    /// protection. It does not.
    private static let rosterKey = "detector.roster"

    @Published var text = ""
    @Published private(set) var result: DetectResult?

    /// The roster, in display order. Persisted on every change.
    @Published var roster: [String] {
        didSet {
            guard roster != oldValue else { return }
            UserDefaults.standard.set(roster, forKey: Self.rosterKey)
            // A verdict is only meaningful against the set that produced it, so
            // changing the set retires the old answer immediately rather than
            // leaving it on screen above a roster it no longer describes.
            rerun()
        }
    }

    /// Every code a roster may contain, as the engine reports it. Empty until it
    /// answers; the editor shows only what it knows about rather than a
    /// hand-written list that could fall behind `PROFILED_CODES`.
    @Published private(set) var catalogue: [String] = []

    /// Set when the engine could not run at all — a missing bundle, or a
    /// bootstrap that never installed. Distinct from "no match", which is a real
    /// result.
    @Published private(set) var isUnavailable = false

    private let engine: EngineHost

    /// The in-flight detection, so a fast typist's earlier request cannot land
    /// after a later one and overwrite it.
    private var pendingID: String?

    init(engine: EngineHost) {
        self.engine = engine
        let stored = UserDefaults.standard.stringArray(forKey: Self.rosterKey)
        // An empty stored roster is treated as absent. It is reachable only by
        // hand-editing defaults — the editor refuses to remove the last entry —
        // and a zero-candidate detector has nothing to show.
        self.roster = (stored?.isEmpty == false ? stored : nil) ?? Self.defaultRoster
        engine.send(["kind": "detect.catalogue"]) { [weak self] event in
            guard event["kind"] as? String == "detect.catalogue",
                let codes = event["codes"] as? [String]
            else { return }
            self?.catalogue = codes
        }
    }

    /// Run the detector over the current text and roster.
    ///
    /// Empty input clears the result rather than asking: there is nothing to
    /// compare, and a "no match" verdict over an empty box would be the screen
    /// answering a question nobody put to it.
    func run() {
        if let pendingID = pendingID { engine.cancel(pendingID) }

        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            pendingID = nil
            result = nil
            return
        }

        pendingID = engine.send([
            "kind": "detect.run",
            "text": text,
            "candidates": roster,
        ]) { [weak self] event in
            guard let self = self else { return }
            self.pendingID = nil
            switch event["kind"] as? String {
            case "detect.result":
                self.isUnavailable = false
                self.result = DetectResult(event["result"])
            default:
                // `failed`, or an event this build does not know. Either way the
                // detector produced no verdict, and saying so beats leaving the
                // previous text's answer on screen.
                self.isUnavailable = true
                self.result = nil
            }
        }
    }

    /// Re-run only if there is already something to re-run.
    ///
    /// Used when the roster changes: someone who has not typed yet should not be
    /// shown a verdict, but someone watching a result change as they add and
    /// remove candidates is doing exactly what the editor is for.
    private func rerun() {
        guard result != nil || pendingID != nil else { return }
        run()
    }

    // MARK: - Roster editing

    func add(_ code: String) {
        guard !roster.contains(code) else { return }
        // Appended in catalogue order rather than at the end, so the list does
        // not reshuffle into the order things were toggled.
        roster = catalogue.filter { roster.contains($0) || $0 == code }
    }

    /// Remove a candidate, unless it is the last one.
    ///
    /// The floor is one, not two. Two would forbid the state that teaches the
    /// most — a single-candidate roster matching everything in its alphabet,
    /// which the result screen calls out in as many words. Zero is forbidden
    /// because it is not instructive, only broken.
    func remove(_ code: String) {
        guard roster.count > 1 else { return }
        roster = roster.filter { $0 != code }
    }

    var canRemove: Bool { roster.count > 1 }

    func resetRoster() {
        roster = Self.defaultRoster
    }

    /// Catalogue entries not currently compared, in catalogue order.
    var available: [String] {
        catalogue.filter { !roster.contains($0) }
    }
}
