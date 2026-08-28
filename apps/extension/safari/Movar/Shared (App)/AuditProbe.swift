//
//  AuditProbe.swift
//  Shared (App)
//
//  The HTTP tier of Movar Audit's WebView collector.
//

import Foundation
import CryptoKit

/// Movar Audit's second collector, and the app's ONLY egress.
///
/// The host screen runs under `default-src 'self'` from a `file://` URL, so the
/// React layer cannot fetch anything itself. It digests HTML and adjudicates
/// rules; every byte that leaves the device leaves through here. That is the
/// point of the arrangement — one auditable place, reviewable in one file.
///
/// This is a **conformer to an existing contract**, not its definition. The
/// wire shape it returns is the one `packages/audit/src/collect/probe.ts`
/// already emits, so the same `Evidence` — and therefore the same findings —
/// comes out of the CLI and out of this app. The network posture is
/// `docs/movar-audit.md` §6, and it is the spec rather than a later hardening
/// pass because this is pointed at real third-party websites:
///
/// - **A declared, non-browser `User-Agent`.** A site owner reading their logs
///   must be able to find out what hit them and why. Spoofing a browser UA
///   would make this bot-protection evasion — an abuse posture, and a
///   store-listing risk for an app whose entire pitch is that it behaves.
/// - **Redirect chains are walked, not delegated.** `URLSession` follows
///   redirects transparently by default, which would erase the very thing
///   `core/switch-bounces` — the rule this product exists for — is adjudicated
///   from. `urlSession(_:task:willPerformHTTPRedirection:…)` answers `nil` to
///   refuse the automatic hop, and the walk is done by hand. A chain that
///   outruns `maxHops` **or the request budget** is recorded and **marked
///   truncated**, never discarded: the most pathological chain there is, is the
///   one that rule most needs to see.
/// - **`blocked` is first-class.** A challenge interstitial answers **HTTP 200**
///   with its own `<html lang>` and body text. Digesting one would manufacture a
///   false accusation about a named company, so a challenged response yields
///   `blocked` and its body is **withheld** from the digest tier entirely.
/// - **Cold by default.** No cookie storage unless a warm run is asked for, and
///   the choice is stamped on every probe.
/// - **A hard, sequential request budget**, enforced here rather than trusted to
///   the web layer. A probe the budget cannot start at all is *refused* by name,
///   never a quietly-shortened run: an audit that silently stops fetching reads
///   as "covered everything". A budget reached **mid-redirect-chain** is not a
///   quiet stop either — the walk ends there and says so on the evidence
///   (`redirectChainTruncated`), exactly as the hop ceiling does.
/// - **No crawling.** This fetches a URL it is handed and never discovers one.
enum AuditProbeLimits {
    /// Identifies the tool and links to what it does (ADR §6).
    ///
    /// Hand-synced with `AUDIT_USER_AGENT` in
    /// `packages/audit/src/collect/probe.ts` — the Swift target can't import the
    /// TS package, exactly as `HostActions.feedbackURLString` cannot import `@movar/brand`.
    /// The version is the audit package's, not the app's.
    static let userAgent = "Movar-Audit/0.0.0 (+https://movar.fyi)"

    /// Ceiling the web layer cannot raise. It may ask for less; it may not ask
    /// for more, which is what makes the budget a property of the app rather
    /// than of whatever called it.
    static let maxRequestBudget = 60
    /// Matches `DEFAULT_REQUEST_BUDGET`.
    static let defaultRequestBudget = 40
    /// Matches `DEFAULT_MAX_HOPS` — hops beyond this are a pathological chain.
    static let maxHops = 10
    /// Matches `DEFAULT_TIMEOUT_MS`.
    static let timeout: TimeInterval = 15

    /// RFC 9110 redirect statuses that carry a `Location`.
    static let redirectStatuses: Set<Int> = [301, 302, 303, 307, 308]

    /// How much of a body is scanned for challenge markers. They sit in the head.
    static let challengeScanChars = 20_000

    /// Body markers that identify a bot-challenge interstitial.
    ///
    /// Hand-synced with `CHALLENGE_BODY_MARKERS` in `probe.ts`. Deliberately
    /// body-based: `server: cloudflare` is **not** here and must never be, as a
    /// large share of the web sits behind Cloudflare while serving perfectly
    /// ordinary pages. A missed challenge costs a false finding about a named
    /// company; a false `blocked` only costs coverage — so the bar is a positive
    /// marker of the challenge itself.
    static let challengeBodyMarkers = [
        "__cf_chl",
        "cf-browser-verification",
        "challenge-platform",
        "cf_chl_opt",
        "just a moment",
        "attention required!",
        "ddos-guard",
        "checking your browser before accessing",
        "enable javascript and cookies to continue",
        "why have i been blocked",
        "g-recaptcha",
        "h-captcha",
    ]

    /// Response headers that assert a challenge outright.
    static let challengeHeaders = ["cf-mitigated", "x-ddos-guard"]
}

/// What one probe observed. Mirrors the `ProbeResult` half of `probe.ts`: the
/// facts, plus the body the digest tier needs. The web layer adds the `id`,
/// the `vantage` and the `acceptLanguage` it asked for — this side reports only
/// what the network did.
private struct ProbeObservation {
    var status = 0
    var outcome = "error"
    /// The **first** response's headers — see `AuditProber.walk`.
    var responseHeaders: [String: String] = [:]
    var redirectChain: [[String: Any]] = []
    /// The walk stopped at a ceiling of this prober's — `maxHops`, or the
    /// request budget running out mid-chain — with the chain still going.
    /// Distinct from every other exit, which reached an end the walk actually
    /// saw. One flag for both ceilings, as `probe.ts` writes it: which of them
    /// stopped the walk is a fact about the audit, and every rule that reads
    /// this has to say the same thing about either.
    var redirectChainTruncated = false
    var finalURL: String
    var bodyHash: String?
    var body: String?

    func asReply(cookieState: String) -> [String: Any] {
        var reply: [String: Any] = [
            "status": status,
            "outcome": outcome,
            "responseHeaders": responseHeaders,
            "redirectChain": redirectChain,
            "finalUrl": finalURL,
            "cookieState": cookieState,
        ]
        if let bodyHash { reply["bodyHash"] = bodyHash }
        // Written only when true, as `omittableFields` in `probe.ts` writes it:
        // absent already IS the wire's "this chain reached its own end", and a
        // `false` on every other probe would say the same thing at the cost of a
        // field on every bundle ever stored.
        if redirectChainTruncated { reply["redirectChainTruncated"] = true }
        // A blocked response's body is the interstitial's, not the site's.
        // Handing it to the digest tier is how a false accusation gets built.
        if let body, outcome == "ok" { reply["body"] = body }
        return reply
    }
}

/// Performs one probe at a time, against a per-run request budget.
final class AuditProber: NSObject, URLSessionTaskDelegate {

    /// The run the current budget belongs to. The web layer mints one id per
    /// audit; a new id starts a fresh budget.
    ///
    /// This bounds one audit's traffic against one site, which is what ADR §6
    /// asks for. It is deliberately NOT a defence against a hostile caller
    /// minting ids in a loop — there is no hostile caller here: the only code
    /// that can reach this handler is the app's own bundle, loaded from
    /// `file://` under a CSP that permits no remote script. Claiming otherwise
    /// in a comment would be the kind of overreach the ADR warns about.
    private var runId: String?
    private var spent = 0
    private var budget = AuditProbeLimits.defaultRequestBudget
    private var inFlight = false

    /// Guards the counters above. Requests are strictly sequential — never
    /// concurrent — so a second probe arriving mid-flight is refused rather
    /// than queued behind an unbounded backlog.
    private let state = DispatchQueue(label: "fyi.movar.audit.prober")

    // MARK: - Entry point

    /// Handle one `probe` message. `completion` is always called exactly once.
    func handle(payload: Any?, completion: @escaping ([String: Any]) -> Void) {
        guard let request = payload as? [String: Any],
            let rawURL = request["url"] as? String,
            let url = Self.auditableURL(from: rawURL)
        else {
            completion(Self.refusal("invalid-url"))
            return
        }

        let acceptLanguage = request["acceptLanguage"] as? String
        // Cold unless a warm run was explicitly asked for. A warm, logged-in
        // session silently violates the response matrix's everything-else-
        // identical requirement, so it is never the default.
        let warm = (request["cookieState"] as? String) == "warm"
        let asked = (request["budget"] as? NSNumber)?.intValue

        switch claim(runId: request["runId"] as? String, budget: asked) {
        case .refused(let reason):
            completion(Self.refusal(reason))
        case .granted:
            walkChain(url: url, acceptLanguage: acceptLanguage, warm: warm) { [weak self] result in
                self?.release()
                completion(result)
            }
        }
    }

    // MARK: - Budget

    private enum Claim {
        case granted
        case refused(String)
    }

    /// Reserve the right to start a walk: not already probing, and budget left.
    private func claim(runId incoming: String?, budget asked: Int?) -> Claim {
        state.sync {
            if inFlight { return .refused("probe-in-flight") }
            if incoming != runId {
                runId = incoming
                spent = 0
                budget = min(asked ?? AuditProbeLimits.defaultRequestBudget,
                             AuditProbeLimits.maxRequestBudget)
            }
            if spent >= budget { return .refused("budget-exhausted") }
            inFlight = true
            return .granted
        }
    }

    private func release() {
        state.sync { inFlight = false }
    }

    /// Spend one request against the budget. `false` means the walk must stop —
    /// loudly, as a refusal the report can state, never as a quiet short walk.
    private func spendOne() -> Bool {
        state.sync {
            if spent >= budget { return false }
            spent += 1
            return true
        }
    }

    // MARK: - The walk

    /// Fetch `url`, then follow its `Location` chain by hand, recording every
    /// hop in order.
    private func walkChain(
        url: URL,
        acceptLanguage: String?,
        warm: Bool,
        completion: @escaping ([String: Any]) -> Void
    ) {
        // A fresh session per probe. For a cold probe cookies are off entirely;
        // for a warm one the ephemeral store lives and dies with this session,
        // so cookies carry across THIS chain's hops and nothing else — matching
        // the per-probe jar in `probe.ts`.
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = AuditProbeLimits.timeout
        configuration.httpShouldSetCookies = warm
        configuration.httpCookieAcceptPolicy = warm ? .onlyFromMainDocumentDomain : .never
        if !warm { configuration.httpCookieStorage = nil }
        // Ask the origin for what it would send a fresh visitor, not what this
        // device happens to hold.
        configuration.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData

        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        var observation = ProbeObservation(finalURL: url.absoluteString)
        // The last redirect response's headers. `probe.ts` keeps the whole
        // response as `lastResponse` for the same one use: the hop ceiling
        // resolves its outcome against the last response the walk actually got,
        // and by then that response's own frame is gone.
        var lastRedirectHeaders: [String: String] = [:]

        func finish(_ result: ProbeObservation) {
            // URLSession retains its delegate until invalidated; without this the
            // prober leaks a session per probe.
            session.finishTasksAndInvalidate()
            completion(result.asReply(cookieState: warm ? "warm" : "cold"))
        }

        func hop(_ current: URL, seen: Set<String>, depth: Int) {
            // A chain a ceiling cut short is EVIDENCE, not an error — and this
            // walk has two ceilings, this one and the budget below, which
            // answer identically. The hops recorded so far are exactly what
            // `core/switch-bounces` — the rule this walk exists for — is
            // adjudicated from, and `adjudicableProbes` drops an `error` probe
            // before anything, capability derivation included, sees it. Calling
            // a ceiling an error spent eleven requests against a live
            // third-party site and handed that rule nothing, while a 2-hop
            // *loop* stayed fully adjudicable through the `seen` exit below.
            // `probe.ts` stopped doing that; this conforms.
            //
            // `status` is deliberately left alone on both: only the redirect
            // branch recurses, so reaching either guard means it already holds
            // the last 3xx, and a `0` would claim no response at all — false of
            // eleven of them. The honesty that `0` was standing in for moves to
            // `redirectChainTruncated`, which is what the kernel asks with, and
            // which is ONE flag for BOTH ceilings by design: the last hop's
            // `Location` names a URL nobody fetched — the one `finalURL` then
            // reports — so the rule publishes a `warn` naming the hops it did
            // see, never says where the chain lands, and never lets it settle
            // into `pass`. A reader that could tell the two ceilings apart
            // would still have to say all of that about either.
            guard depth <= AuditProbeLimits.maxHops else {
                observation.redirectChainTruncated = true
                observation.finalURL = current.absoluteString
                // A challenge asserted by that last 3xx still wins, matching
                // `resolveOutcome`, which reads the last response's headers.
                observation.outcome =
                    Self.isChallenge(headers: lastRedirectHeaders, body: nil) ? "blocked" : "ok"
                finish(observation)
                return
            }
            // Running out of budget mid-chain is the other stopping condition,
            // and it ends the walk the same way for the same reasons — the
            // chain recorded so far, the last 3xx it answered, and the flag.
            // This branch recorded `error` / `status: 0` while `probe.ts`
            // raised `RequestBudgetExhaustedError` out of the whole probe and
            // so left no observation to conform to; #500 replaced that with
            // `hops.length > 0 && spent >= budget`, which returns through the
            // same `finish(lastResponse, null, { truncated: true })` the hop
            // cap does. A chain the budget ended is precisely the fact the
            // ceiling above already had a shape for: a chain with an end this
            // probe never reached. Which ceiling stopped the walk is a
            // difference between two audits, not between two sites, and the
            // wire has never had a field for it.
            //
            // The one case `probe.ts` still throws for — a probe whose FIRST
            // request the budget cannot pay for — cannot reach here. `claim()`
            // grants only when `spent < budget` and sets `inFlight` in the same
            // serial `state` queue `spendOne()` mutates from, so no second
            // probe can spend in between (it is refused, not queued) and the
            // first `spendOne()` after a grant always succeeds. Reaching here
            // therefore means `depth >= 1`: a 3xx is already in
            // `redirectChain`, `status` already holds it, and
            // `lastRedirectHeaders` are already its headers — exactly Node's
            // `hops.length > 0`. Node's throw maps to this side's
            // `.refused("budget-exhausted")` in `claim()`, which the web layer
            // still states as a refusal.
            guard spendOne() else {
                observation.redirectChainTruncated = true
                observation.finalURL = current.absoluteString
                observation.outcome =
                    Self.isChallenge(headers: lastRedirectHeaders, body: nil) ? "blocked" : "ok"
                finish(observation)
                return
            }

            var request = URLRequest(url: current)
            request.httpMethod = "GET"
            request.setValue(AuditProbeLimits.userAgent, forHTTPHeaderField: "User-Agent")
            request.setValue("text/html,application/xhtml+xml", forHTTPHeaderField: "Accept")
            if let acceptLanguage {
                request.setValue(acceptLanguage, forHTTPHeaderField: "Accept-Language")
            }

            session.dataTask(with: request) { data, response, _ in
                guard let http = response as? HTTPURLResponse else {
                    // An ordinary network failure — DNS, TLS, timeout, or App
                    // Transport Security refusing a plain-http hop. Recorded as
                    // `error` with the chain so far; never thrown away.
                    observation.status = 0
                    observation.outcome = "error"
                    observation.finalURL = current.absoluteString
                    finish(observation)
                    return
                }

                let headers = Self.headerRecord(http)
                // The FIRST response's headers, not the destination's.
                //
                // This is what caching semantics are about. A locale-autodetect
                // `302` at `/` is the response a shared cache stores for `/`, so
                // it is the one that must carry `Vary: Accept-Language`; the
                // `/uk/` page it points at is a fixed-locale URL that correctly
                // does not vary. Read the destination's headers instead and
                // `core/serving-vary-missing` asks about the wrong resource —
                // a bug the Node collector shipped, caught only by running it
                // against a live site.
                if observation.responseHeaders.isEmpty, observation.redirectChain.isEmpty {
                    observation.responseHeaders = headers
                }

                let location = http.value(forHTTPHeaderField: "Location")
                let redirecting =
                    AuditProbeLimits.redirectStatuses.contains(http.statusCode) && location != nil

                guard redirecting, let location else {
                    // Landed. This response is the page.
                    observation.status = http.statusCode
                    observation.finalURL = current.absoluteString
                    let body = data.flatMap { Self.decode($0, response: http) }
                    observation.outcome =
                        Self.isChallenge(headers: headers, body: body) ? "blocked" : "ok"
                    if let body {
                        observation.bodyHash = Self.sha256Hex(body)
                        observation.body = body
                    }
                    finish(observation)
                    return
                }

                observation.status = http.statusCode
                observation.redirectChain.append([
                    "url": current.absoluteString,
                    "status": http.statusCode,
                    "location": location,
                ])
                lastRedirectHeaders = headers

                // A loop, or a `Location` we cannot resolve, ends the walk here:
                // the chain recorded so far IS the finding, and
                // `core/switch-bounces` reads it.
                guard let next = URL(string: location, relativeTo: current)?.absoluteURL,
                    !seen.contains(next.absoluteString)
                else {
                    // Deliberately adjudicable, NOT an error: the chain recorded
                    // so far is exactly what `core/switch-bounces` reads, and
                    // marking it `error` would make the kernel drop the evidence
                    // for the one rule this product exists for. A challenge
                    // header still wins, matching `resolveOutcome` in probe.ts.
                    observation.outcome =
                        Self.isChallenge(headers: headers, body: nil) ? "blocked" : "ok"
                    observation.finalURL = current.absoluteString
                    finish(observation)
                    return
                }

                var walked = seen
                walked.insert(current.absoluteString)
                hop(next, seen: walked, depth: depth + 1)
            }.resume()
        }

        hop(url, seen: [], depth: 0)
    }

    // MARK: - URLSessionTaskDelegate

    /// Refuse every automatic redirect. Answering `nil` completes the task with
    /// the 3xx response itself, which is exactly what the walk above needs to
    /// record the hop before deciding whether to follow it.
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }

    // MARK: - Helpers

    /// A URL this prober is willing to fetch: absolute `http`/`https` with a
    /// host. Everything else — `file:`, custom app schemes, relative strings —
    /// is refused.
    ///
    /// Deliberately wider than `HostActions.httpsURL(from:)`, which governs
    /// handing a URL to the SYSTEM browser and is right to insist on `https`.
    /// Auditing a plain-http site is legitimate, and an `http` → `https` upgrade
    /// is itself part of the redirect chain a finding may rest on. (App
    /// Transport Security may still refuse the hop; that lands as `error`.)
    private static func auditableURL(from raw: String) -> URL? {
        guard let url = URL(string: raw),
            let scheme = url.scheme?.lowercased(),
            scheme == "https" || scheme == "http",
            let host = url.host, !host.isEmpty
        else { return nil }
        return url
    }

    /// A refusal the web layer can state in the report. Never a silent no-op:
    /// "no silent caps" is the rule this shape exists to keep.
    private static func refusal(_ reason: String) -> [String: Any] {
        ["outcome": "error", "refused": reason, "status": 0,
         "responseHeaders": [String: String](), "redirectChain": [[String: Any]]()]
    }

    /// Lower-cased header map, matching `headerRecord` in `probe.ts` — the
    /// kernel indexes headers by lower-case name.
    private static func headerRecord(_ response: HTTPURLResponse) -> [String: String] {
        var record: [String: String] = [:]
        for (key, value) in response.allHeaderFields {
            guard let name = key as? String else { continue }
            record[name.lowercased()] = String(describing: value)
        }
        return record
    }

    /// Is this response a bot-challenge interstitial rather than the site's page?
    static func isChallenge(headers: [String: String], body: String?) -> Bool {
        for name in AuditProbeLimits.challengeHeaders where headers[name] != nil {
            return true
        }
        guard let body else { return false }
        let haystack = body.prefix(AuditProbeLimits.challengeScanChars).lowercased()
        return AuditProbeLimits.challengeBodyMarkers.contains { haystack.contains($0) }
    }

    /// Decode a response body, honouring the charset the server declared and
    /// falling back the way a browser would rather than dropping the page.
    private static func decode(_ data: Data, response: HTTPURLResponse) -> String? {
        if let name = response.textEncodingName {
            let cfEncoding = CFStringConvertIANACharSetNameToEncoding(name as CFString)
            if cfEncoding != kCFStringEncodingInvalidId {
                let encoding = String.Encoding(
                    rawValue: CFStringConvertEncodingToNSStringEncoding(cfEncoding))
                if let text = String(data: data, encoding: encoding) { return text }
            }
        }
        return String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1)
    }

    /// SHA-256 of the DECODED text, as lower-case hex.
    ///
    /// Hashes the decoded string's UTF-8 bytes rather than the raw response
    /// bytes, because that is what `sha256(body)` in `probe.ts` hashes. The same
    /// page collected by either runtime must produce the same body identity, or
    /// the page-dedupe key differs between the CLI and this app.
    private static func sha256Hex(_ text: String) -> String {
        SHA256.hash(data: Data(text.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
