//
//  EngineHost.swift
//  Shared (App)
//
//  The offscreen WebView that runs @movar/audit-engine. Never displayed.
//

import Foundation
import WebKit

/// Movar's JavaScript half, hosted in a `WKWebView` that never renders.
///
/// `docs/native-shells.md` splits the app in two: native owns every pixel, and
/// the audit, the detector and the settings invariants stay in TypeScript. This
/// is the seam. The engine is `Resources/engine.js` — one self-contained IIFE
/// built by `packages/audit-engine` and copied in by `sync-engine.mts`.
///
/// **The bundle ships inside the app, and that is compliance rather than
/// convenience.** App Store Review Guideline 2.5.2 prohibits downloading and
/// executing code at runtime; an engine fetched from a CDN would be a violation,
/// and it is exactly what makes an offscreen WebView safe here where a remote
/// one would not be.
///
/// WHY A WEBVIEW AND NOT JAVASCRIPTCORE. The engine's DOM digest needs a genuine
/// `Document`, and `@movar/lang-pickers` narrows with `instanceof
/// HTMLAnchorElement` on globals. A shim over JavaScriptCore that is subtly
/// unfaithful returns `not-applicable` on rules that should have failed — a
/// false pass on somebody's audit. A WebView used purely as a DOM plus a JS host
/// costs nothing at render time because nothing renders.
///
/// WHY IT CANNOT REACH THE NETWORK. The document is loaded with a
/// `default-src 'none'` policy and no origin, so the engine has no way out on
/// its own; when it needs bytes it asks, and `AuditProber` — one auditable file
/// that owns the declared `User-Agent`, cold cookies, the redirect walk and the
/// request budget — makes the request. That is a property of Movar Audit on
/// every platform, not a quirk of Safari.
@MainActor
final class EngineHost: NSObject {

    /// Terminal event kinds — the ones after which no more events bear an id.
    ///
    /// Held as data rather than branched at the call site because forgetting one
    /// leaks a handler per request, and the leak is invisible: everything keeps
    /// working, the dictionary just grows for the life of the app.
    private static let terminalKinds: Set<String> = [
        "audit.complete", "artifact.ready", "catalogue.state", "settings.state", "detect.result",
        "failed",
    ]

    /// The name the engine's IIFE hangs its exports on. Must match
    /// `GLOBAL_NAME` in `packages/audit-engine/vite.config.ts`; a rename on one
    /// side and not the other is a bootstrap that silently does nothing.
    private static let globalName = "MovarAuditEngine"

    /// Stamped into `Evidence.collector` for replay forensics. The Swift probe
    /// is `URLSession`-backed, and `@movar/audit`'s own CLI collector declares a
    /// different id for the same reason: a stored artifact should say which
    /// implementation observed the network.
    private static let collectorID = "swift-urlsession"

    private let webView: WKWebView
    private let prober: AuditProber

    /// Requests handed over before the bootstrap finished. Replayed in order on
    /// `didFinish`, because the Detector tab can be typed into while the engine
    /// is still parsing and a dropped first request looks like a dead button.
    private var queued: [String] = []
    private var isReady = false

    /// The engine could not be reached at all, and no request ever will be.
    ///
    /// Set when the page loads without the bootstrap having installed itself,
    /// which means `engine.js` was not in the bundle or did not run. Every
    /// request then fails IMMEDIATELY: there is no reply coming, and a screen
    /// that sat on a spinner forever would be a worse account of that than
    /// saying so.
    private var isUnavailable = false

    /// Event handlers by request id. The engine echoes the id on every event, so
    /// two overlapping requests never cross streams.
    private var handlers: [String: ([String: Any]) -> Void] = [:]

    /// Monotonic request ids. Not a UUID: these never leave the process, and a
    /// short counter is far easier to read in a console trace.
    private var nextID = 0

    init(prober: AuditProber) {
        self.prober = prober

        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()

        // The engine source is injected as a user script rather than evaluated
        // after load, and rather than referenced from a `<script>` tag. All
        // three would run it; only this one is immune to both the document's own
        // CSP and to the `file://` module-loading failure `vite.config.ts`
        // documents. There is no HTML file to reference it from either —
        // `sync-engine.mts` deliberately writes none.
        if let source = Self.engineSource() {
            controller.addUserScript(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
            controller.addUserScript(
                WKUserScript(
                    source: Self.bootstrapSource, injectionTime: .atDocumentStart,
                    forMainFrameOnly: true))
        }

        configuration.userContentController = controller
        self.webView = WKWebView(frame: .zero, configuration: configuration)
        super.init()

        controller.add(self, name: "engine")
        self.webView.navigationDelegate = self

        // `baseURL: nil` gives the document a unique opaque origin, so even
        // without the policy below it could not read anything of the app's. The
        // policy is stated anyway: "the engine cannot fetch" should be legible
        // in the source that sets it up, not inferred from an origin rule.
        self.webView.loadHTMLString(Self.document, baseURL: nil)
    }

    /// The document the engine lives in: empty, and unable to fetch.
    ///
    /// A stored property rather than an inline literal because the terminate
    /// handler reloads it — a crash recovery that loaded a DIFFERENT document
    /// than the one the engine was built for is the kind of divergence nobody
    /// finds until it matters.
    private static let document = """
        <!doctype html><html><head>\
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'">\
        </head><body></body></html>
        """

    /// The built engine bundle, or `nil` when it is missing from the app bundle.
    ///
    /// Returning `nil` rather than trapping: a missing resource is a build
    /// configuration error, and the failure a person should see is the Detector
    /// tab saying it cannot run — not a crash on launch of an app whose other
    /// three tabs are fine.
    private static func engineSource() -> String? {
        guard let url = Bundle.main.url(forResource: "engine", withExtension: "js"),
            let source = try? String(contentsOf: url, encoding: .utf8)
        else { return nil }
        return source
    }

    /// The ~20 lines of glue `docs/native-shells.md` budgets for each platform.
    ///
    /// It creates the engine, points its probe at the native side, and forwards
    /// every event over the message handler. Nothing here decides anything: no
    /// verdict, no default, no retry. A rule that lived in this string would be a
    /// rule no test could reach.
    private static let bootstrapSource = """
        (function () {
          var pending = {};
          var seq = 0;
          window.__movarProbeReply = function (id, json) {
            var resolve = pending[id];
            delete pending[id];
            if (resolve) resolve(JSON.parse(json));
          };
          var engine = \(globalName).createEngine({
            collectorId: '\(collectorID)',
            probe: function (request) {
              return new Promise(function (resolve) {
                var id = ++seq;
                pending[id] = resolve;
                webkit.messageHandlers.engine.postMessage({
                  kind: 'probe', probeId: id, payload: request
                });
              });
            },
            emit: function (event) {
              // A FINISHED AUDIT'S TWO BIG MEMBERS TRAVEL AS TEXT. The evidence
              // bundle is every sampled text node of every page, and native
              // re-sends both verbatim when it exports the artifact. Handing them
              // over pre-stringified means Swift keeps exactly the bytes it sends
              // back without ever building an object graph of them, and decodes
              // only the thin slice the report screen draws.
              if (event.kind === 'audit.complete') {
                webkit.messageHandlers.engine.postMessage({
                  kind: 'event',
                  payload: { kind: event.kind, id: event.id },
                  report: JSON.stringify(event.report),
                  evidence: JSON.stringify(event.evidence)
                });
                return;
              }
              webkit.messageHandlers.engine.postMessage({ kind: 'event', payload: event });
            }
          });
          window.__movarEngineRequest = function (json) { engine.handle(JSON.parse(json)); };
        })();
        """

    // MARK: - Sending

    /// Hand the engine a request and receive its events.
    ///
    /// The id is minted here rather than by the caller so no two call sites can
    /// pick the same one. `onEvent` is released once a terminal event arrives;
    /// a caller that goes away first should call {@link cancel}.
    ///
    /// `handle` never rejects on the engine side — a failure comes back as a
    /// `failed` event on this same stream — so there is no error path here that
    /// is not also an event.
    @discardableResult
    func send(_ request: [String: Any], onEvent: @escaping ([String: Any]) -> Void) -> String {
        let id = makeRequestID()
        var payload = request
        payload["id"] = id

        guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8)
        else {
            // Unserialisable request: report it on the caller's own stream, in
            // the engine's vocabulary, so a shell has exactly one shape to
            // render regardless of which side refused.
            onEvent(["kind": "failed", "id": id, "reason": "bad-request"])
            return id
        }
        send(rawJSON: json, id: id, onEvent: onEvent)
        return id
    }

    /// A request id, for a caller that has to embed one itself.
    func makeRequestID() -> String {
        nextID += 1
        return "req-\(nextID)"
    }

    /// Park the engine's WebView in the view hierarchy at zero size.
    ///
    /// THIS IS NOT A CONTRADICTION OF "NEVER DISPLAYED", and it did not used to
    /// be here. While the engine only served the Detector, whose classification
    /// is pure and returns in milliseconds, staying out of the hierarchy was free
    /// and read better. The Audit tab changed the arithmetic: one audit is
    /// minutes of work with native probe round-trips in between, and a
    /// `WKWebView` with no window is a suspendable web process — the system is
    /// entitled to throttle or jetsam a view nobody can see. An audit that
    /// stalled halfway through the matrix would look like a site that stopped
    /// answering, which is a false observation about a named company and the one
    /// class of bug this product cannot ship.
    ///
    /// Zero points of screen area means it still draws nothing. "Never
    /// displayed" survives; "never attached" is what did not.
    func attach(to parent: PlatformView) {
        guard webView.superview == nil else { return }
        webView.translatesAutoresizingMaskIntoConstraints = false
        parent.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.widthAnchor.constraint(equalToConstant: 0),
            webView.heightAnchor.constraint(equalToConstant: 0),
            webView.leadingAnchor.constraint(equalTo: parent.leadingAnchor),
            webView.topAnchor.constraint(equalTo: parent.topAnchor),
        ])
    }

    /// Send a request whose JSON is ALREADY built, including its `id`.
    ///
    /// The audit's artifact request carries a whole `Report` and a whole
    /// `Evidence` that arrived as JSON and go back out as JSON. Routing it
    /// through `JSONSerialization` would mean parsing a multi-megabyte bundle
    /// into Foundation objects purely to re-emit it — real time on a phone, and a
    /// round trip a number could survive as something else.
    func send(rawJSON: String, id: String, onEvent: @escaping ([String: Any]) -> Void) {
        guard !isUnavailable else {
            onEvent(["kind": "failed", "id": id, "reason": "probe-unavailable"])
            return
        }
        handlers[id] = onEvent
        if isReady {
            evaluate(request: rawJSON)
        } else {
            queued.append(rawJSON)
        }
    }

    /// Fail everything outstanding with one reason.
    ///
    /// EVERY REQUEST MUST END. A caller learns an outcome only from its handler,
    /// so a request the engine can no longer answer has to be told so. The two
    /// ways that can happen — the bundle never ran, the web process died — are
    /// both invisible from the screen, and both would otherwise leave a Detector
    /// spinner or an "Auditing…" button running until the app is force-quit.
    private func failAll(reason: String) {
        let stranded = handlers
        handlers = [:]
        queued = []
        for (id, handler) in stranded {
            handler(["kind": "failed", "id": id, "reason": reason])
        }
    }

    /// Stop listening for `id`'s events. Safe to call for an unknown id.
    ///
    /// The engine is not told: a detection is pure and already finished, and an
    /// audit's cost is in the probe, which enforces its own budget. Cancelling
    /// the JS side would need a second protocol message for no saved work.
    func cancel(_ id: String) {
        handlers.removeValue(forKey: id)
    }

    private func evaluate(request json: String) {
        guard let literalData = try? JSONSerialization.data(
            withJSONObject: json, options: .fragmentsAllowed),
            let literal = String(data: literalData, encoding: .utf8)
        else { return }
        // Double-encoded, as `ViewController.reply` does: the JSON is embedded
        // as a JS string literal, so nothing in a pasted snippet can terminate
        // the expression.
        webView.evaluateJavaScript("window.__movarEngineRequest(\(literal))")
    }
}

// MARK: - Engine → native

extension EngineHost: WKScriptMessageHandler {

    // Main-actor isolated, not `nonisolated` — `WKScriptMessage.body` is itself
    // main-actor isolated under this target's `SWIFT_DEFAULT_ACTOR_ISOLATION`,
    // so a nonisolated witness cannot even read the message it was handed.
    // `ViewController` conforms the same way.
    func userContentController(
        _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
    ) {
        receive(message.body)
    }

    private func receive(_ body: Any) {
        guard let message = body as? [String: Any],
            let kind = message["kind"] as? String
        else { return }

        switch kind {
        case "probe":
            // Movar Audit's ONLY egress, reached from the engine instead of from
            // the React bridge. Same prober, same budget, same posture.
            guard let probeID = (message["probeId"] as? NSNumber)?.intValue else { return }
            prober.handle(payload: message["payload"]) { [weak self] reply in
                self?.replyToProbe(id: probeID, payload: reply)
            }
        case "event":
            guard var event = message["payload"] as? [String: Any],
                let id = event["id"] as? String
            else { return }
            // `audit.complete` carries its report and evidence BESIDE the event
            // rather than inside it — see the bootstrap. Folding them back on
            // keeps every handler taking one dictionary.
            if let report = message["report"] { event["report"] = report }
            if let evidence = message["evidence"] { event["evidence"] = evidence }
            // Read before dispatch: a handler that starts the next request from
            // inside this one would otherwise have its new entry removed by the
            // terminal check below.
            let handler = handlers[id]
            if let eventKind = event["kind"] as? String, Self.terminalKinds.contains(eventKind) {
                handlers.removeValue(forKey: id)
            }
            handler?(event)
        default:
            break
        }
    }

    private func replyToProbe(id: Int, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
            let json = String(data: data, encoding: .utf8),
            let literalData = try? JSONSerialization.data(
                withJSONObject: json, options: .fragmentsAllowed),
            let literal = String(data: literalData, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__movarProbeReply(\(id), \(literal))")
    }
}

// MARK: - Readiness

extension EngineHost: WKNavigationDelegate {

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // The page being up is not the engine being up. `engine.js` is a synced
        // build artifact, so a broken sync step — or a stale Xcode resource
        // reference — produces an app that looks complete and has no engine in
        // it. Without this check the symptom is a spinner rather than a
        // sentence, because nothing ever answers.
        webView.evaluateJavaScript("typeof window.__movarEngineRequest === 'function'") {
            [weak self] value, _ in
            guard let self = self else { return }
            guard (value as? Bool) == true else {
                self.isUnavailable = true
                self.failAll(reason: "probe-unavailable")
                return
            }
            self.isReady = true
            // Drained before replaying, so a request enqueued by one of these
            // (a handler that starts the next step) appends to an empty list
            // rather than being replayed twice out of the array being iterated.
            let replay = self.queued
            self.queued = []
            for json in replay { self.evaluate(request: json) }
        }
    }

    /// The web process died — a jetsam under memory pressure is the realistic
    /// cause, and a large evidence bundle is exactly what invites one.
    ///
    /// Everything outstanding fails rather than being silently abandoned, and the
    /// document is reloaded so the NEXT request works: a crash should cost the
    /// work in flight, not the rest of the session.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        isReady = false
        failAll(reason: "internal")
        webView.loadHTMLString(Self.document, baseURL: nil)
    }
}
