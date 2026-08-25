//
//  AuditModels.swift
//  Shared (App)
//
//  The engine's wire types, in Swift. Data only — nothing here decides anything.
//

import Foundation

/// Everything the native Audit screens decode out of `@movar/audit-engine`.
///
/// A DECODER, NOT A MODEL LAYER. `docs/native-shells.md` puts the whole
/// adjudication in TypeScript precisely so three shells cannot disagree about a
/// verdict, and the moment this file starts deriving one it has re-opened that
/// door. So: every verdict, count, downgrade and sentence below arrives already
/// decided by `evaluate()`, and the types are shaped to make inventing one
/// awkward — the verdict is an enum of the kernel's own spellings, and an
/// unrecognised value decodes to `.unknown` rather than to a plausible default.
///
/// THE SLICE IS DELIBERATE. `Report` is decoded in full because the report
/// screen renders all of it; `Evidence` is decoded down to a handful of fields,
/// because the only thing this shell reads out of a bundle is the response
/// matrix. The rest of a bundle — every sampled text node of every page — never
/// becomes a Swift object at all: it travels as the JSON it arrived as and goes
/// back down verbatim when the artifact is rendered. That is what keeps a
/// multi-megabyte evidence bundle cheap on a phone.
///
/// The ADR's endgame is generating these from JSON Schema so a rule-shape change
/// breaks a build rather than a user's report ("The contract"). Until that
/// generator exists they are hand-written against `packages/audit/src/report.ts`
/// and `finding.ts`, which is why the field names are those files' names
/// verbatim: a drift is meant to be a diff away, not a search.

// MARK: - Verdicts

/// What one rule concluded. The kernel's five, plus the state a decoder needs.
///
/// `notCollected` is never a pass, and the ordering below is the report's: it
/// sits between the failures and the passes rather than at the end, because it
/// is the audit admitting it could not establish something. Ranking that below
/// "passed" would present the tool's own blind spots as the least interesting
/// outcome — the opposite of true for anyone deciding whether to rely on the
/// document.
enum RuleVerdict: String, Decodable, CaseIterable, Hashable {
    case fail
    case warn
    case notCollected = "not-collected"
    case pass
    case notApplicable = "not-applicable"

    /// A verdict this build does not know — a stored bundle from a newer engine.
    ///
    /// Decoding to a case rather than throwing keeps one unknown rule from
    /// discarding a whole report, and it is deliberately NOT folded into `pass`:
    /// "we do not recognise this answer" and "this is fine" are the two things
    /// an audit tool may never conflate.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = RuleVerdict(rawValue: raw) ?? .unknown
    }

    /// Worst first, then fine, then "did not even apply". Drives both the rule
    /// list's order and its filter.
    static let ranked: [RuleVerdict] = [.fail, .warn, .notCollected, .pass, .notApplicable]
}

/// What one finding is. A separate vocabulary from {@link RuleVerdict} because
/// the two genuinely differ: a rule can be "not checked" and a finding never is,
/// while a finding can be an observation, which is not a verdict a rule holds.
enum FindingVerdict: String, Decodable, Hashable {
    case fail
    case warn
    case observation
    case info

    /// Same reasoning as {@link RuleVerdict.unknown}.
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = FindingVerdict(rawValue: raw) ?? .unknown
    }

    static let ranked: [FindingVerdict] = [.fail, .warn, .observation, .info, .unknown]

    /// Findings worth leading with — the report's headline group.
    var isHeadline: Bool { self == .fail || self == .warn }

    /// Everything else the rules said. Never scored, never hidden: the ADR's
    /// rule is "observations are cited, never scored", not "observations are
    /// hidden". `core/content-language-mixed` is the clearest case — Russian
    /// body text on a page declaring Ukrainian is exactly what Movar's readers
    /// came to see, and it is an observation precisely BECAUSE a classifier
    /// answered rather than a declaration.
    var isObserved: Bool { self == .observation || self == .info }
}

// MARK: - Report

/// Where a finding's language determination came from.
enum Grounding: String, Decodable {
    case declared
    case observed
    case classified
    case unknown

    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Grounding(rawValue: raw) ?? .unknown
    }
}

/// "3 of 340 passages". A bare count is a smear; the denominator is the finding.
struct Denominator: Decodable, Hashable {
    let examined: Int
    let matched: Int
}

/// The statute a jurisdiction-pack rule cites.
struct Citation: Decodable, Hashable {
    let source: String
    let article: String
}

/// What a finding is about: the page, else the build path, else the element.
struct FindingSubject: Decodable, Hashable {
    let url: String?
    let path: String?
    let node: String?

    /// In the order a reader wants it. `nil` when the finding is about the site
    /// as a whole rather than any one place.
    var display: String? { url ?? path ?? node }
}

struct Finding: Decodable, Hashable {
    let rule: String
    let verdict: FindingVerdict
    let grounding: Grounding
    let subject: FindingSubject
    /// The kernel's own sentence, rendered verbatim. A measurement, not a
    /// verdict — and never translated here, because the wording a published
    /// report quotes cannot depend on who ran it.
    let summary: String
    let denominator: Denominator?
    let citation: Citation?
    /// Set when the kernel stripped this finding's failing power because a
    /// classifier, not a declaration, answered. Rendered as a stated downgrade
    /// rather than a quiet softening.
    let downgradedFrom: String?
}

/// What one rule reported, whether or not it ran.
struct RuleResult: Decodable, Hashable {
    let rule: String
    /// The kernel's English title. The reader's language, when this build has
    /// one, comes from `HostStrings.auditRuleTitle` — and falls back to this.
    let title: String
    let grounding: Grounding
    let verdict: RuleVerdict
    let findings: [Finding]
    /// Present iff `verdict` is `not-applicable`.
    let notApplicableReason: String?
    /// Present iff `verdict` is `not-collected`: what the collector lacked.
    let missingCapabilities: [String]?
}

/// How much of the catalogue actually ran.
struct CoverageSummary: Decodable {
    let rules: Int
    let ran: Int
    let notCollected: Int
}

/// Which build of the audit engine produced the report.
///
/// Optional, and a report that lacks one must render as UNKNOWN rather than as
/// a default. Filling in this app's own version would mint a build identity
/// nobody shipped, inside the one field whose job is to say which code to go
/// back to — and a wrong answer that looks right sends a reader to the wrong
/// commit, where an admitted gap sends them to ask.
struct EngineStamp: Decodable {
    let id: String
    let version: String
}

/// The language conformance report.
struct AuditReport: Decodable {
    let results: [RuleResult]
    /// Every graded finding, flattened in rule order — the kernel's order, which
    /// two runs of the same site must reproduce.
    let findings: [Finding]
    let coverage: CoverageSummary
    /// The headline: how many `fail` findings. Observations are not scored.
    let brokenPromises: Int
    let engine: EngineStamp?
}

// MARK: - Evidence, as thin as the matrix needs

/// One matrix leg, as the response table renders it.
///
/// The MECHANISM deliberately does not reach the screen: no status codes, no
/// redirect chain, no path segments. Those answer "how did it get here", and a
/// reader of this report wants the answer. When a bounce or an error IS the
/// story, a rule says so in a sentence — and the chain stays in the evidence
/// bundle and the exported artifact, which is where a site owner disputing a
/// finding goes anyway.
struct MatrixLeg: Identifiable, Hashable {
    /// `nil` is the one leg that stated no preference.
    let acceptLanguage: String?
    let status: Int
    let answered: Bool
    /// `<html lang>` of the page this leg landed on, when it produced one.
    let served: String?

    /// The matrix varies exactly one thing, so the header IS the leg's identity.
    var id: String { acceptLanguage ?? "" }
}

/// The slice of `Evidence` the report screen reads.
///
/// Everything else in a bundle is skipped by `JSONDecoder`, which ignores keys a
/// type does not declare — so a page's 1,500 sampled text nodes never become
/// Swift objects. That is not an optimisation detail: those samples are most of
/// a bundle's bytes, and materialising them per remembered run is the difference
/// between a session of audits fitting on a phone and not.
struct EvidenceDigest: Decodable {

    private struct Source: Decodable {
        let kind: String
        let probes: [Probe]?
    }

    private struct Probe: Decodable {
        let acceptLanguage: String?
        let status: Int
        let outcome: String
        let pageId: String?
    }

    private struct Page: Decodable {
        struct Document: Decodable {
            let htmlLang: String?
        }
        let id: String
        let document: Document
    }

    private let source: Source
    private let pages: [Page]

    /// The matrix, flattened: what each leg asked for and what came back.
    ///
    /// Empty for a filesystem bundle, which has no legs — the section then
    /// renders nothing rather than an empty table.
    var legs: [MatrixLeg] {
        guard source.kind == "network", let probes = source.probes else { return [] }
        return probes.map { probe in
            let declared = probe.pageId.flatMap { id in
                pages.first { $0.id == id }?.document.htmlLang
            }
            let served = (declared?.trimmingCharacters(in: .whitespaces)).flatMap {
                $0.isEmpty ? nil : $0
            }
            return MatrixLeg(
                acceptLanguage: probe.acceptLanguage,
                status: probe.status,
                answered: probe.outcome == "ok",
                served: served
            )
        }
    }
}

// MARK: - What a finished audit is, natively

/// One completed audit: what to render, and what to send back to export it.
///
/// Holds the report and evidence BOTH decoded and raw. The raw halves are not a
/// cache — they are what an export re-sends, and re-encoding a decoded model
/// instead would mean the exported bundle is this decoder's idea of the evidence
/// rather than the engine's. `docs/movar-audit.md` §8 is explicit that report and
/// proof must not get separable: "the thing an auditor posts is the thing a site
/// owner re-runs".
struct AuditOutcome {
    let report: AuditReport
    let evidence: EvidenceDigest
    /// The `Report`, as the JSON the engine emitted.
    let rawReport: String
    /// The `Evidence`, as the JSON the engine emitted.
    let rawEvidence: String
}

// MARK: - The engine's events

/// Why a request produced no result. Native renders these; it never invents one.
struct EngineFailure: Error {
    /// `probe-unavailable` | `invalid-url` | `bad-request` | `internal`.
    let reason: String
    /// For the log, never for a verdict.
    let detail: String?

    /// The one reason the screen words differently.
    ///
    /// A missing probe is a fact about the APP — running outside the shell, or a
    /// broken bridge — and every other reason is a fact about the run. Saying
    /// "this site could not be audited" for the first would blame a company for
    /// the app's own gap.
    var isProbeUnavailable: Bool { reason == "probe-unavailable" }
}

/// One catalogue family, as the report lays itself out.
///
/// The `id` is the kernel's own, punctuation included (`"A. Page declaration"`),
/// because that is what the native title table is keyed by — carried verbatim so
/// the engine's structure and this shell's strings cannot disagree about what a
/// family is called.
struct CatalogueFamily: Decodable, Hashable {
    let id: String
    /// Rule IDs, in catalogue order.
    let rules: [String]
}

/// Engine → native. Parsed off the message envelope rather than decoded whole,
/// because `audit.complete`'s two big members arrive pre-stringified — see
/// `EngineHost`'s bootstrap.
enum EngineEvent {
    case progress(done: Int, total: Int)
    case complete(AuditOutcome)
    case artifact(html: String)
    case catalogue([CatalogueFamily])
    case failed(EngineFailure)

    /// Build an event from one engine message.
    ///
    /// `nil` for anything unrecognised or malformed, which the caller reports as
    /// a failure rather than dropping: a dropped event is a request that never
    /// completes — a button that stays busy forever — and a half-parsed one would
    /// be a report with holes in it, which is the failure mode this product
    /// cannot have.
    init?(raw: [String: Any]) {
        guard let kind = raw["kind"] as? String else { return nil }

        switch kind {
        case "audit.progress":
            guard let done = raw["done"] as? Int, let total = raw["total"] as? Int else {
                return nil
            }
            self = .progress(done: done, total: total)
        case "audit.complete":
            guard let outcome = Self.outcome(from: raw) else { return nil }
            self = .complete(outcome)
        case "artifact.ready":
            guard let html = raw["html"] as? String else { return nil }
            self = .artifact(html: html)
        case "catalogue.state":
            guard let families = raw["families"],
                let data = try? JSONSerialization.data(withJSONObject: families),
                let decoded = try? JSONDecoder().decode([CatalogueFamily].self, from: data)
            else { return nil }
            self = .catalogue(decoded)
        case "failed":
            guard let reason = raw["reason"] as? String else { return nil }
            self = .failed(EngineFailure(reason: reason, detail: raw["detail"] as? String))
        default:
            return nil
        }
    }

    /// Decode the two JSON strings a complete event carries beside it.
    ///
    /// A report that will not decode is reported as a FAILURE by the caller
    /// rather than rendered partially: a document that names a company has to be
    /// all there or not there.
    private static func outcome(from raw: [String: Any]) -> AuditOutcome? {
        guard let rawReport = raw["report"] as? String,
            let rawEvidence = raw["evidence"] as? String,
            let reportData = rawReport.data(using: .utf8),
            let evidenceData = rawEvidence.data(using: .utf8),
            let report = try? JSONDecoder().decode(AuditReport.self, from: reportData),
            let evidence = try? JSONDecoder().decode(EvidenceDigest.self, from: evidenceData)
        else { return nil }
        return AuditOutcome(
            report: report, evidence: evidence, rawReport: rawReport, rawEvidence: rawEvidence)
    }
}

// MARK: - The audit's half of the engine

/// The three things the Audit screens ask the shared engine for.
///
/// TYPED HERE, TRANSPORTED THERE. `EngineHost` speaks dictionaries because it
/// carries four unrelated conversations — the detector's, the settings', the
/// audit's, and whatever the next surface adds — and a transport that knew about
/// `AuditOutcome` would have to know about all of them. So the wire shapes stay
/// in the file that owns them, and the host stays a channel.
///
/// Every one of these turns an engine event stream into exactly one completion,
/// including the failure paths: a caller that had to distinguish "no event yet"
/// from "no event ever" would need a timeout, and a timeout on an audit is how a
/// slow site gets reported as an unreachable one.
extension EngineHost {

    /// Run one audit, reporting each settled matrix leg as it lands.
    ///
    /// `onProgress` is per LEG, not per HTTP request: a leg is what the engine
    /// knows about, and the hops inside one belong to the prober.
    func runAudit(
        url: String,
        uaPack: Bool,
        onProgress: @escaping (Int, Int) -> Void,
        completion: @escaping (Result<AuditOutcome, EngineFailure>) -> Void
    ) {
        send(["kind": "audit.run", "url": url, "uaPack": uaPack]) { raw in
            switch EngineEvent(raw: raw) {
            case .progress(let done, let total):
                onProgress(done, total)
            case .complete(let outcome):
                completion(.success(outcome))
            case .failed(let failure):
                completion(.failure(failure))
            case .some:
                break
            case nil:
                // An event this decoder cannot read is only terminal when it was
                // meant to be the answer. Anything else is noise from a
                // conversation that is not ours.
                if raw["kind"] as? String == "audit.complete" {
                    completion(
                        .failure(EngineFailure(reason: "internal", detail: "undecodable-report")))
                }
            }
        }
    }

    /// Render a finished audit as the self-contained HTML artifact.
    ///
    /// The report and its evidence go back down as the JSON they arrived as — see
    /// `AuditOutcome.rawReport`. Native must never grow its own renderer: the
    /// artifact is the file a site owner re-runs, and the whole claim is that the
    /// CLI and every shell emit the same bytes.
    func renderArtifact(
        for outcome: AuditOutcome,
        target: String,
        generatedAt: String,
        completion: @escaping (Result<String, EngineFailure>) -> Void
    ) {
        let id = makeRequestID()
        // Built by hand rather than through `JSONSerialization`, because the two
        // big members are ALREADY JSON — see `EngineHost.send(rawJSON:id:onEvent:)`.
        let envelope = [
            "{\"kind\":\"audit.artifact\"",
            "\"id\":\(Self.jsonString(id))",
            "\"target\":\(Self.jsonString(target))",
            "\"generatedAt\":\(Self.jsonString(generatedAt))",
            "\"report\":\(outcome.rawReport)",
            "\"evidence\":\(outcome.rawEvidence)}",
        ].joined(separator: ",")

        send(rawJSON: envelope, id: id) { raw in
            switch EngineEvent(raw: raw) {
            case .artifact(let html):
                completion(.success(html))
            case .failed(let failure):
                completion(.failure(failure))
            default:
                completion(.failure(EngineFailure(reason: "internal", detail: "no-artifact")))
            }
        }
    }

    /// Ask for the catalogue's families.
    ///
    /// A `RuleResult` carries no family, so this is the only way a native report
    /// can know which section `core/switch-bounces` belongs in. Hardcoding the
    /// mapping in Swift would mis-file every rule added after this binary
    /// shipped — silently, since a rule with no family renders in no section.
    func describeCatalogue(completion: @escaping ([CatalogueFamily]) -> Void) {
        send(["kind": "catalogue.describe"]) { raw in
            guard case .catalogue(let families) = EngineEvent(raw: raw) else { return }
            completion(families)
        }
    }

    /// A Swift string as a JSON string literal, quotes included.
    ///
    /// Through `JSONSerialization` rather than by hand: hand-rolled escaping is
    /// how a stray backslash becomes a syntax error in evaluated source. Falls
    /// back to an empty literal, never to unescaped text.
    private static func jsonString(_ value: String) -> String {
        guard
            let data = try? JSONSerialization.data(
                withJSONObject: value, options: .fragmentsAllowed),
            let literal = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        return literal
    }
}
