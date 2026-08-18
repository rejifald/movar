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

    /// The comparison set to fall back on when the reader's own settings cannot
    /// supply a usable one: the three Cyrillic languages Movar exists to tell
    /// apart.
    ///
    /// This is the FLOOR, not the default — see {@link derivedRoster}. It is
    /// what the screen compares before the engine has named its catalogue, and
    /// what it keeps for a configuration that would otherwise leave fewer than
    /// two candidates to compare.
    static let fallbackRoster = ["uk", "ru", "be"]

    /// The roster the reader's own settings imply: what they asked Movar to
    /// prefer, PLUS what Movar hides on their behalf.
    ///
    /// WHY BOTH HALVES, AND WHY `priority` ALONE WOULD NOT DO. `priority` is the
    /// languages a reader wants; `enforceLockedLanguages` strips locked codes
    /// from it, so `ru` — the one language the product exists to detect — is
    /// never there. Deriving from `priority` alone would hand the default
    /// `['uk', 'en']` to a classifier that scopes to the text's dominant script
    /// first, leaving exactly one Cyrillic candidate, and every Cyrillic text
    /// would come back "Ukrainian" by construction. `blocked` is the half that
    /// carries `ru` (`deriveBlocked` puts `LOCKED_BLOCKED_LANGUAGES` in
    /// unconditionally), so the union is `['uk', 'en', 'ru']` out of the box —
    /// which script scoping narrows to a real uk-vs-ru comparison.
    ///
    /// That makes the tab a diagnostic for THIS reader's configuration rather
    /// than a fixed demonstration: someone who has added Belarusian to their
    /// preferences is shown the comparison Movar actually performs for them.
    ///
    /// FILTERED BY THE ENGINE'S CATALOGUE, which is why this answers `nil` until
    /// the catalogue arrives. `priority` may hold languages the detector has no
    /// profile for (`de`, `pl`, …) — the settings roster and the profiled roster
    /// are different lists — and seeding a candidate that can never score would
    /// put a permanently empty evidence row on the screen. Asking the engine is
    /// what keeps this from being a second hand-written copy of `PROFILED_CODES`.
    ///
    /// PREFERRED FIRST, BLOCKED SECOND, each in the order its own list holds. The
    /// roster reads as the sentence it is — "these are my languages, and these
    /// are the ones Movar keeps off my screen" — which neither alphabetical nor
    /// the engine's catalogue order says. It also puts the languages a reader
    /// chose above the ones policy chose for them, which is the honest ranking of
    /// the two halves.
    ///
    /// De-duplicated across the join: `deriveBlocked` subtracts `priority` from
    /// everything except the locked codes, so an overlap is only reachable for a
    /// record written by an older build — but a language listed twice would be
    /// compared twice and shown twice.
    ///
    /// `nil` for a set of fewer than two, because a one-candidate roster answers
    /// every text in its alphabet with the same language. That state is reachable
    /// — the editor allows it and the verdict says so in as many words — but it
    /// is a choice to make, not a default to be handed.
    static func derivedRoster(
        priority: [String], blocked: [String], catalogue: [String]
    ) -> [String]? {
        guard !catalogue.isEmpty else { return nil }
        let profiled = Set(catalogue)
        var seen = Set<String>()
        let roster = (priority + blocked).filter {
            profiled.contains($0) && seen.insert($0).inserted
        }
        return roster.count >= 2 ? roster : nil
    }

    /// Where the roster is kept, and where it deliberately is NOT.
    ///
    /// This is the host app's own `UserDefaults`, not the shared App Group. The
    /// roster changes what this screen compares; it changes nothing about what
    /// the extension hides on a page. Writing it into `MovarSettings` would put
    /// a diagnostic preference into the store the extension reconciles, and
    /// would tell a reader that narrowing the comparison narrows their
    /// protection. It does not.
    private static let rosterKey = "detector.roster"

    /// Sample text the box opens on, by language.
    ///
    /// SPECIMENS, NOT UI COPY, which is why they live here and not in
    /// `Localizable.strings`. The whole point of the Ukrainian sample is that it
    /// is Ukrainian; a localized key would hand an English reader the English
    /// file's value under the same code and demonstrate nothing.
    ///
    /// THERE IS NO RUSSIAN ENTRY, and {@link seed}'s filter is what enforces
    /// that in general. Movar exists to keep Russian off a reader's screen, so
    /// seeding it here would put the very thing the app hides in front of them
    /// unasked, on launch. Russian reaches this box only when somebody
    /// deliberately types or pastes it — which is the case the detector is FOR,
    /// and the only one that justifies showing it.
    private static let samples: [String: [String]] = [
        "uk": [
            "Уранці над містом стелився туман, і ліхтарі ще не встигли згаснути.",
            "Бабуся пекла хліб щосуботи, і запах розходився цілим подвір'ям.",
            "Він дочитав книжку до кінця й довго сидів мовчки біля вікна.",
        ],
        "en": [
            "The harbour was quiet that morning, and the boats had not yet gone out.",
            "She read the letter twice, then folded it and put it back in the drawer.",
            "Rain moved across the valley all afternoon without reaching the town.",
        ],
        "be": [
            "Раніцай над возерам стаяў туман, і было чуваць толькі птушак.",
            "Дзед расказваў пра лес, дзе ён збіраў грыбы кожную восень.",
        ],
        "de": ["Der Zug fuhr langsam durch die Felder, und niemand sprach ein Wort."],
        "fr": ["Le marché ouvrait tôt, et l'odeur du pain remplissait déjà la rue."],
        "es": ["El pueblo dormía todavía cuando el primer autobús salió hacia la costa."],
        "it": ["La luce del mattino entrava dalla finestra e riempiva tutta la stanza."],
        "pl": ["Deszcz padał przez całą noc, a rano ulice były zupełnie puste."],
    ]

    /// A sample to open on: drawn at random from the languages this roster
    /// actually compares and the reader has not blocked.
    ///
    /// FILTERED BY `blocked`, not by a hard-coded `ru`, so a reader who blocks
    /// more than the locked set is honoured too — the rule is "never seed what
    /// this person asked Movar to hide", and `ru` merely happens to be the entry
    /// nobody can unset.
    ///
    /// RESTRICTED TO THE ROSTER because a closed-set detector answers "closest of
    /// these". Seeding Polish into a uk/en/ru comparison would return a confident
    /// "Ukrainian" for text that is nothing of the kind — the exact misreading
    /// this screen exists to prevent, staged by the screen itself.
    ///
    /// Returns the language ALONGSIDE the text so the caller can tell whether a
    /// seed already in the box is still one this roster can answer for; `nil`
    /// when nothing qualifies, which leaves the box as it was.
    static func seed(
        roster: [String], blocked: [String]
    ) -> (language: String, text: String)? {
        roster
            .filter { !blocked.contains($0) }
            .flatMap { code in (samples[code] ?? []).map { (language: code, text: $0) } }
            .randomElement()
    }

    /// The sample this model put in the box, and the language it demonstrates.
    ///
    /// Compared BY VALUE rather than tracked with a "dirty" flag, because `text`
    /// is mutated through a SwiftUI binding this type never sees — a flag would
    /// have to be cleared from a path that does not exist here.
    private var seededText: String?
    private var seededLanguage: String?

    @Published var text = ""
    @Published private(set) var result: DetectResult?

    /// Bumped every time a run lands an outcome — a verdict, or the unavailable
    /// state that stands in for one.
    ///
    /// A COUNTER rather than the outcome itself, because the view scrolls to the
    /// result on every press and `DetectResult` is `Equatable`: two presses over
    /// unchanged text produce an equal value, so an `onChange(of: result)` would
    /// not fire the second time and the press would look ignored. Counting the
    /// runs instead makes "a run finished" the event, which is what the scroll is
    /// actually reacting to.

    /// The roster, in display order. Persisted on every change the reader makes.
    @Published var roster: [String] {
        didSet {
            guard roster != oldValue else { return }
            // A DERIVED roster is a view of the settings, not a choice, so it is
            // deliberately not written down: persisting it would freeze today's
            // preferences into tomorrow's diagnostic, and a language added in
            // Settings months later would never reach this screen.
            if !isDerived {
                UserDefaults.standard.set(roster, forKey: Self.rosterKey)
            }
            // A verdict is only meaningful against the set that produced it, so
            // changing the set retires the old answer immediately rather than
            // leaving it on screen above a roster it no longer describes.
            rerun()
        }
    }

    /// Whether the roster is still the one the settings imply, or one the reader
    /// picked.
    ///
    /// Stored as a flag rather than inferred by comparing the roster against
    /// {@link derivedRoster}: a reader who edits their way back to exactly the
    /// derived set has still made a choice, and the difference shows up the next
    /// time their settings change — theirs stays put, a derived one follows.
    private(set) var isDerived: Bool

    /// Every code a roster may contain, as the engine reports it. Empty until it
    /// answers; the editor shows only what it knows about rather than a
    /// hand-written list that could fall behind `PROFILED_CODES`.
    @Published private(set) var catalogue: [String] = []

    /// Set when the engine could not run at all — a missing bundle, or a
    /// bootstrap that never installed. Distinct from "no match", which is a real
    /// result.
    @Published private(set) var isUnavailable = false
    @Published private(set) var outcomeRevision = 0

    private let engine: EngineHost

    /// The settings the derived roster reads. The same store the Settings tab
    /// edits, so the two screens can never disagree about which languages this
    /// reader has.
    private let settings: SettingsStore

    /// The in-flight detection, so a fast typist's earlier request cannot land
    /// after a later one and overwrite it.
    private var pendingID: String?

    init(engine: EngineHost, settings: SettingsStore) {
        self.engine = engine
        self.settings = settings
        let stored = UserDefaults.standard.stringArray(forKey: Self.rosterKey)
        // An empty stored roster is treated as absent. It is reachable only by
        // hand-editing defaults — the editor refuses to remove the last entry —
        // and a zero-candidate detector has nothing to show.
        let chosen = stored?.isEmpty == false ? stored : nil
        self.isDerived = chosen == nil
        // The fallback stands in for the one beat before the catalogue answers.
        // Deliberately the shipped triple rather than an unfiltered union of the
        // settings: the union can name languages the detector cannot profile,
        // and a roster row that lists `German` for a moment and then drops it is
        // worse than one that starts correct and merely impersonal.
        self.roster = chosen ?? Self.fallbackRoster
        // Opens on a sample rather than an empty box, so the tab shows what it
        // does before anyone types and its button is live on arrival. This can
        // only seed against the roster known RIGHT NOW, which for a first run is
        // the floor — `refreshDerivedRoster` re-seeds once the real set lands.
        if let seed = Self.seed(
            roster: chosen ?? Self.fallbackRoster,
            blocked: settings.settings.blocked)
        {
            self.text = seed.text
            self.seededText = seed.text
            self.seededLanguage = seed.language
        }
        engine.send(["kind": "detect.catalogue"]) { [weak self] event in
            guard event["kind"] as? String == "detect.catalogue",
                let codes = event["codes"] as? [String]
            else { return }
            self?.catalogue = codes
            // The catalogue is the last input the derived roster was waiting on.
            self?.refreshDerivedRoster()
        }
    }

    /// Re-derive the roster from the current settings, if it is still derived.
    ///
    /// Called at the three moments the answer can change: when the engine names
    /// its catalogue, when this tab appears (a language may have been added on
    /// the Settings tab in between), and when the app returns to the foreground
    /// (Safari's popup writes the same record). A no-op for a reader who has
    /// edited the roster themselves — that is the whole point of {@link
    /// isDerived} — and a no-op when nothing moved, because the `roster` setter
    /// discards an assignment equal to what is already there.
    func refreshDerivedRoster() {
        guard isDerived else { return }
        guard
            let derived = Self.derivedRoster(
                priority: settings.settings.priority,
                blocked: settings.settings.blocked,
                catalogue: catalogue)
        else { return }
        roster = derived
        reseedIfUntouched()
    }

    /// Re-choose the opening sample now the roster has changed, unless the box
    /// holds something a reader typed.
    ///
    /// NECESSARY BECAUSE THE ROSTER SETTLES LATE. `init` can only seed against
    /// the floor (`uk/ru/be`); the derived set is not known until the engine
    /// answers with its catalogue. A box seeded at construction can therefore be
    /// left holding Belarusian while the roster resolves to `uk/en/ru`, and
    /// pressing Detect would return a confident "Ukrainian" for text that is
    /// nothing of the kind — the misreading {@link seed} restricts the roster to
    /// avoid, reintroduced by the timing.
    ///
    /// A seed whose language the new roster STILL compares is left alone. Drawing
    /// again would be equally correct and would rewrite the box under someone's
    /// eyes a beat after launch, for no gain.
    private func reseedIfUntouched() {
        guard text == seededText else { return }
        if let language = seededLanguage,
            roster.contains(language),
            !settings.settings.blocked.contains(language)
        {
            return
        }
        guard let seed = Self.seed(roster: roster, blocked: settings.settings.blocked)
        else { return }
        text = seed.text
        seededText = seed.text
        seededLanguage = seed.language
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
            self.outcomeRevision += 1
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
        // Cleared BEFORE the assignment, so the setter persists what follows:
        // from here the roster is this reader's, and stops tracking settings.
        isDerived = false
        // APPENDED, not re-sorted into catalogue order. That is what the derived
        // order needs: a roster reading "my languages, then the blocked ones"
        // would be scrambled by a single addition if every add re-imposed the
        // engine's ordering, and the reader would watch rows they never touched
        // move.
        roster.append(code)
    }

    /// Remove a candidate, unless it is the last one.
    ///
    /// The floor is one, not two. Two would forbid the state that teaches the
    /// most — a single-candidate roster matching everything in its alphabet,
    /// which the result screen calls out in as many words. Zero is forbidden
    /// because it is not instructive, only broken.
    func remove(_ code: String) {
        guard roster.count > 1 else { return }
        isDerived = false
        roster = roster.filter { $0 != code }
    }

    var canRemove: Bool { roster.count > 1 }

    /// Hand the roster back to the settings.
    ///
    /// The stored choice is REMOVED rather than overwritten with today's derived
    /// value, which is what makes reset mean "follow my languages again" instead
    /// of "pin the set they happen to imply this afternoon".
    func resetRoster() {
        UserDefaults.standard.removeObject(forKey: Self.rosterKey)
        isDerived = true
        roster =
            Self.derivedRoster(
                priority: settings.settings.priority,
                blocked: settings.settings.blocked,
                catalogue: catalogue) ?? Self.fallbackRoster
    }

    /// Catalogue entries not currently compared, in catalogue order.
    var available: [String] {
        catalogue.filter { !roster.contains($0) }
    }
}
