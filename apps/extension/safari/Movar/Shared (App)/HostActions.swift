//
//  HostActions.swift
//  Shared (App)
//
//  The four things the About screen asks the system to do.
//

import Foundation

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
import SafariServices
// `NSSavePanel.allowedContentTypes` takes `UTType`s — the export panel's only
// reason to reach outside AppKit.
import UniformTypeIdentifiers
#endif

/// Feedback, source code, changelog, and Safari's extension settings — the only
/// four ways any Movar app surface leaves the app.
///
/// EXTRACTED, NOT REIMPLEMENTED. `ViewController` has done all four since the
/// screen was React: the WebView cannot reach them itself (it runs under
/// `default-src 'self'` from a `file://` URL and the controller does no
/// external-navigation handling), so `bridge.ts` posts `feedback` /
/// `open-url` / `open-preferences` and Swift opens them. Now that About is
/// native it needs the same four, and the wrong fix would be a second copy
/// living in the view. So the bodies moved here and `ViewController`'s message
/// cases call in — one implementation, two callers, and the web tabs keep
/// working unchanged while they are still web tabs.
///
/// The URLs are hand-synced with `@movar/brand`, as `feedbackURLString` already
/// was: the Swift target cannot import a TypeScript package. That hand-sync is
/// also the security property. `open-url` accepts a string from the page, so
/// {@link httpsURL(from:)} refuses anything that is not an absolute `https` URL
/// with a host — and `feedback` deliberately carries no payload at all, so the
/// support address can never be chosen by whatever is running in the WebView.
enum HostActions {

    /// The support `mailto:` the About footer's "Send feedback" opens.
    /// Hand-synced with `@movar/brand`'s `FEEDBACK_URL` (derived there from
    /// `SUPPORT_EMAIL`).
    static let feedbackURLString = "mailto:support@movar.fyi?subject=Movar%20feedback"

    /// The public repository. Hand-synced with `@movar/brand`'s `SOURCE_URL`.
    static let sourceURLString = "https://github.com/rejifald/movar"

    /// The marketing site's origin — no trailing slash. Hand-synced with
    /// `@movar/brand`'s `SITE_URL`; the changelog and the privacy policy are
    /// composed on top of it.
    static let siteURLString = "https://movar.fyi"

    /// Movar's own licence, on the default branch.
    ///
    /// The About screen names the licence ("MIT") and links here for the text.
    /// It deliberately does NOT restate the copyright line: `LICENSE` is the
    /// authoritative notice, and a second copy in a Swift string literal is a
    /// second thing to keep in step with it.
    static let licenseURLString = "https://github.com/rejifald/movar/blob/main/LICENSE"

    /// The dependency licence roll-up, on the default branch.
    ///
    /// Deliberately the REPOSITORY copy rather than the one this build ships.
    /// `THIRD-PARTY-NOTICES.md` is bundled into `Shared (Extension)/Resources`
    /// for the extension, not into the app target, so the app has no local file
    /// to present — and adding one would mean a second copy to keep in step with
    /// the generator. A reader following this link wants to see what Movar is
    /// built on, which the canonical file answers.
    static let licensesURLString =
        "https://github.com/rejifald/movar/blob/main/apps/extension/THIRD-PARTY-NOTICES.md"

    /// This app's App Store listing, opened straight into the review sheet.
    ///
    /// One id for both platforms: the iOS app was folded into the existing macOS
    /// listing at v1.3.0, which is why `downloads.ts` points `safari` and
    /// `safari-ios` at the same URL. `?action=write-review` is Apple's documented
    /// parameter for landing on the write-a-review sheet rather than the product
    /// page, so the row does what its label promises.
    static let reviewURLString = "https://apps.apple.com/app/id6779282071?action=write-review"

    // MARK: - The four actions

    /// Open the support mail composer. No parameter, on purpose — see the type
    /// comment.
    static func openFeedback() {
        guard let url = URL(string: feedbackURLString) else { return }
        openExternally(url)
    }

    /// Open the public source repository.
    static func openSourceCode() {
        guard let url = URL(string: sourceURLString) else { return }
        openExternally(url)
    }

    /// Open the privacy policy, in the language the copy around the link is in.
    ///
    /// Same locale rule as {@link openChangelog}: the BUNDLE's resolved language,
    /// not the device's. A privacy policy is the one page where landing in a
    /// language the reader did not choose is worst — this is the document they
    /// are meant to actually read.
    static func openPrivacyPolicy() {
        let path = HostStrings.isUkrainian ? "/uk/privacy" : "/privacy"
        guard let url = URL(string: siteURLString + path) else { return }
        openExternally(url)
    }

    /// Open Movar's own licence.
    static func openLicense() {
        guard let url = URL(string: licenseURLString) else { return }
        openExternally(url)
    }

    /// Open the dependency licence roll-up.
    static func openLicenses() {
        guard let url = URL(string: licensesURLString) else { return }
        openExternally(url)
    }

    /// Open the App Store's write-a-review sheet for this app.
    static func openAppStoreReview() {
        guard let url = URL(string: reviewURLString) else { return }
        openExternally(url)
    }

    /// Open this build's entry on the public changelog.
    ///
    /// Mirrors `@movar/brand`'s `changelogUrl`: English at `/changelog`,
    /// Ukrainian at `/uk/changelog`, anchored `#v<version>` only when the version
    /// is a real release. A `dev` or otherwise unreleased string gets the
    /// un-anchored page rather than a fragment that matches nothing — browsers
    /// ignore an unmatched fragment silently, which lands the reader at the top
    /// of the page behind a URL that merely looks broken.
    ///
    /// The locale is the one the BUNDLE resolved, not the device's, so the linked
    /// page can never be in a different language from the copy around the link.
    static func openChangelog(version: String) {
        let path = HostStrings.isUkrainian ? "/uk/changelog" : "/changelog"
        let anchor = isReleasedVersion(version) ? "#v\(version)" : ""
        guard let url = URL(string: siteURLString + path + anchor) else { return }
        openExternally(url)
    }

    /// Open Safari's Extensions settings with Movar selected (macOS only).
    ///
    /// Deliberately does NOT quit the app: `ViewController`'s `didBecomeActive`
    /// observer refreshes the extension state when the user comes back, which is
    /// what turns the banner into "Movar is on" without a relaunch.
    ///
    /// A no-op on iOS, where no API opens another app's settings pane — which is
    /// exactly why the iOS banner ends in a sentence instead of a button.
    static func openSafariPreferences() {
#if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            guard error == nil else {
                // Nothing here can act on a failure; the pane either opened or
                // the user is still looking at the instructions above the button.
                return
            }
        }
#endif
    }

    /// Open the site an audit report is about.
    ///
    /// The report is a snapshot of one moment, and no screenshot of that moment
    /// exists: the collector fetches HTML and parses it inertly, so an audit never
    /// renders a pixel of the page — deliberately, because an inert parse is what
    /// makes it safe to point at a hostile site. The honest substitute is a way to
    /// go and look.
    ///
    /// This is the ONE URL on any Movar screen that a person did not choose from
    /// Movar's own copy, so {@link httpsURL(from:)} governs it exactly as it
    /// governs the bridge's `open-url`: a plain-`http` target is refused. That is
    /// the right direction to fail — an audit may legitimately examine an `http`
    /// site, but handing one to the system browser is a different act from
    /// fetching it inertly through the prober.
    static func openAuditedSite(_ target: String) {
        guard let url = httpsURL(from: target) else { return }
        openExternally(url)
    }

    // MARK: - Exporting a report

    /// What became of an export request.
    enum ExportOutcome {
        case saved
        /// The person closed the sheet or panel without keeping the file. Not an
        /// error, and deliberately not reported as one.
        case cancelled
        /// The app could not even offer to save: no presenter, a refused
        /// filename, a failed write. The only case a screen says anything about.
        case unavailable(String)
    }

    /// Write a finished report and hand it to the system to save or share.
    ///
    /// `html` is the self-contained artifact — the readable report, the embedded
    /// evidence and the replay command in one file, per `docs/movar-audit.md` §8.
    ///
    /// EXTRACTED, NOT REIMPLEMENTED, the same way the four link actions were:
    /// `ViewController` has done this since the Audit tab was React, because the
    /// WebView can neither write a file nor raise a share sheet. Now that the tab
    /// is native it needs the same capability, and a second copy living in the
    /// view is exactly the drift this type exists to prevent — so the body moved
    /// here and the bridge case calls in.
    ///
    /// The two platforms want opposite things, so this does not pretend they are
    /// the same: iOS SHARES (Files, Mail, AirDrop), macOS SAVES (a person
    /// producing reports across many sites wants them in a folder).
    ///
    /// Both inputs are treated as untrusted. The HTML is written verbatim as a
    /// FILE and never loaded into a WebView, and the filename is reduced to a
    /// bare, extension-checked leaf so a crafted name cannot traverse out of the
    /// temporary directory — a rule that predates the native screen and outlives
    /// it, since the bridge still accepts a name from the page.
    static func exportReport(
        filename: String, html: String, completion: @escaping (ExportOutcome) -> Void
    ) {
        guard let name = safeReportFilename(filename) else {
            completion(.unavailable("invalid-request"))
            return
        }

#if os(iOS)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
        do {
            try html.write(to: url, atomically: true, encoding: .utf8)
        } catch {
            completion(.unavailable("write-failed"))
            return
        }
        guard let presenter = topViewController() else {
            completion(.unavailable("no-presenter"))
            return
        }
        let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        // Required on iPad: an unanchored popover is a crash, not a warning.
        sheet.popoverPresentationController?.sourceView = presenter.view
        sheet.popoverPresentationController?.sourceRect = CGRect(
            x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 0, height: 0)
        sheet.completionWithItemsHandler = { _, completed, _, _ in
            completion(completed ? .saved : .cancelled)
        }
        presenter.present(sheet, animated: true)
#elseif os(macOS)
        let panel = NSSavePanel()
        panel.nameFieldStringValue = name
        panel.allowedContentTypes = [.html]
        panel.begin { response in
            guard response == .OK, let url = panel.url else {
                completion(.cancelled)
                return
            }
            do {
                try html.write(to: url, atomically: true, encoding: .utf8)
                completion(.saved)
            } catch {
                completion(.unavailable("write-failed"))
            }
        }
#endif
    }

    /// Reduce a proposed filename to something safe to create.
    ///
    /// Takes the last path component only (so `../../x.html` cannot escape),
    /// rejects anything that is not plainly an `.html` leaf, and caps the length.
    static func safeReportFilename(_ raw: String?) -> String? {
        guard let raw = raw else { return nil }
        let leaf = (raw as NSString).lastPathComponent
        guard leaf.count > ".html".count, leaf.count <= 120,
            leaf.lowercased().hasSuffix(".html"),
            !leaf.hasPrefix("."),
            leaf.rangeOfCharacter(from: CharacterSet(charactersIn: "/\\:")) == nil
        else { return nil }
        return leaf
    }

#if os(iOS)
    /// Whatever is frontmost, for presenting the share sheet.
    ///
    /// Walks past anything already presented — the report can be reached from a
    /// pushed screen inside a tab, and presenting on a controller that is itself
    /// covered silently does nothing on iOS.
    private static func topViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
        var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
#endif

    // MARK: - Plumbing

    /// Parse `raw` as an external link this host is willing to open: an absolute
    /// `https` URL with a host. Returns nil for anything else — other schemes,
    /// scheme-relative or relative strings, unparseable input.
    ///
    /// This is the guard on the `open-url` bridge case. The payload is only ever
    /// a `@movar/brand` constant the bundle baked in, but it arrives as an
    /// untrusted string over the JS channel, and the refusal is what stops a
    /// hypothetical injected script from turning the host into a launcher for
    /// `file:`, `mailto:`, or a custom app scheme.
    static func httpsURL(from raw: String) -> URL? {
        guard let url = URL(string: raw),
            url.scheme?.lowercased() == "https",
            let host = url.host, !host.isEmpty
        else { return nil }
        return url
    }

    /// Hand a URL to the system browser / mail client.
    static func openExternally(_ url: URL) {
#if os(iOS)
        UIApplication.shared.open(url)
#elseif os(macOS)
        // `open(_:)` returns whether the URL was handled; nothing here can act
        // on a failure, so the result is deliberately discarded.
        _ = NSWorkspace.shared.open(url)
#endif
    }

    /// The version this build shows in the About footer.
    ///
    /// `CFBundleShortVersionString` — the native equivalent of the React
    /// `APP_VERSION`, which Vite bakes in at build time because the WebView has
    /// no `browser.runtime` to ask. Native has no such problem: the value is the
    /// target's own `MARKETING_VERSION`, so there is no define to keep in step.
    static var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
    }

    /// `1.6.2`, optionally with a pre-release suffix — the shape that has an
    /// anchor to land on. Mirrors `@movar/brand`'s `RELEASED_VERSION`.
    private static func isReleasedVersion(_ version: String) -> Bool {
        let pattern = "^[0-9]+\\.[0-9]+\\.[0-9]+([-+][0-9A-Za-z.-]+)?$"
        return version.range(of: pattern, options: .regularExpression) != nil
    }
}
