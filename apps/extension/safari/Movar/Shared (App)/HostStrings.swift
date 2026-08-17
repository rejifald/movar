//
//  HostStrings.swift
//  Shared (App)
//
//  The native screens' copy, in the reader's language.
//

import Foundation

/// Every user-facing string the SwiftUI Settings and About screens render,
/// resolved through the app bundle's `Localizable.strings` (`en.lproj` /
/// `uk.lproj`).
///
/// TWO CATALOGUES ARE MIRRORED HERE, not one, and which one a key belongs to is
/// a fact about the screen it is on. About's copy is the host app's own
/// (`apps/safari-host-app/src/i18n/messages-en.ts`) because that tab was always
/// the wrapper's. Settings' copy is the SHARED one
/// (`packages/i18n/src/messages-en.ts`) because the web Settings tab deliberately
/// composed `@movar/options-ui` under `@movar/i18n` so its wording could not
/// drift from the extension's own options page — and porting the screen to Swift
/// must not quietly undo that. Each section below says which catalogue it tracks.
///
/// WHY A CATALOGUE TYPE RATHER THAN BARE LITERALS IN THE VIEW. SwiftUI would
/// localize a `Text("about.lede")` by itself, so this indirection buys nothing
/// at the call site — it buys two things elsewhere. The keys stay greppable
/// against `apps/safari-host-app/src/i18n/messages-en.ts`, which is still the
/// catalogue for the three tabs that have not been ported and is where any
/// wording change lands first; and the one string that is not plain text — the
/// version stamp's `%@` — cannot be a `LocalizedStringKey` without smuggling
/// the interpolation into the key.
///
/// The `value:` is deliberately empty rather than an English fallback. Foundation
/// then returns the KEY for a missing entry, which is loud in a screenshot and
/// impossible to mistake for finished copy; an inline English default would ship
/// a half-translated screen that looks done.
///
/// This mirrors `messages-en.ts` / `messages-uk.ts` 1:1 and nothing more. The
/// ADR's endgame is generating these `.strings` from the TS catalogues at build
/// time (`docs/native-shells.md`, "i18n moves native"); until that generator
/// exists the two are hand-synced, which is why the key names are the TS paths
/// verbatim — a drift is meant to be a `diff` away, not a search.
enum HostStrings {

    // MARK: - Tab bar

    static var tabDetector: String { local("tabs.detector") }
    static var tabAudit: String { local("tabs.audit") }
    static var tabSettings: String { local("tabs.settings") }
    static var tabAbout: String { local("tabs.about") }

    // MARK: - Detector

    // The detector's copy has one job the React version's did not: say what kind
    // of answer this is. `classifyBySnippet` is a CLOSED-SET classifier — it
    // picks the best of a named candidate list and cannot name anything outside
    // it — and the old screen reported "No Cyrillic language found here", which
    // is a claim about the text rather than about three candidates. Every string
    // below that touches the verdict is written to keep the set in view.

    static var detectorTitle: String { local("detector.title") }
    static var detectorIntro: String { local("detector.intro") }
    static var detectorPlaceholder: String { local("detector.placeholder") }
    static var detectorDetect: String { local("detector.detect") }

    /// Section header over the roster row, and the sentence under it.
    ///
    /// It sits ABOVE the text box, which is the whole argument in layout form: a
    /// closed-set answer is not interpretable without its set, so the set is a
    /// precondition of the question rather than a footnote to the answer.
    static var detectorComparing: String { local("detector.comparing") }
    static var detectorComparingFooter: String { local("detector.comparingFooter") }

    // MARK: - Detector: the roster editor

    static var detectorRosterTitle: String { local("detector.rosterTitle") }
    static var detectorRosterIn: String { local("detector.rosterIn") }
    static var detectorRosterOut: String { local("detector.rosterOut") }

    /// Why the set is closed at all — the one piece of real explanation on the
    /// screen, kept in the editor where someone has already asked the question.
    static var detectorRosterFooter: String { local("detector.rosterFooter") }
    static var detectorRosterReset: String { local("detector.rosterReset") }

    /// Accessible names for the add/remove controls.
    ///
    /// Both carry the language, because a roster is rows of identical chrome and
    /// every one of them would otherwise be announced as "Add" — the same defect
    /// the Audit tab's per-row remove control fixes the same way.
    static func detectorRosterAdd(_ language: String) -> String {
        String(format: local("detector.rosterAdd"), language)
    }

    static func detectorRosterRemove(_ language: String) -> String {
        String(format: local("detector.rosterRemove"), language)
    }

    /// Shown in place of the last remaining candidate's remove control.
    static var detectorRosterLast: String { local("detector.rosterLast") }

    // MARK: - Detector: the verdict

    static var detectorResult: String { local("detector.result") }

    /// "Closest of 3 · distinctive letters" — the verdict's own scope, on the
    /// line under it. This is what the ADR asks for when it says the verdict
    /// should state its scope; it is one string so a language can order the
    /// count and the rung however it needs.
    static func detectorScope(count: Int, rung: String) -> String {
        String(format: local("detector.scope"), String(count), rung)
    }

    /// No candidate cleared the bar. Deliberately NOT "no language found": the
    /// detector did not search the world's languages and come up empty, it
    /// failed to separate the ones it was given.
    static var detectorNoMatch: String { local("detector.noMatch") }
    static var detectorNoMatchHelp: String { local("detector.noMatchHelp") }

    /// The `discriminating: false` state — the verdict was forced.
    ///
    /// With one candidate in scope there is nothing to lose to, so every text in
    /// that alphabet "matches" it. Reporting that as a finding would be the
    /// single most misleading thing this screen could do, which is why it gets
    /// its own banner rather than a footnote.
    static var detectorForcedTitle: String { local("detector.forcedTitle") }
    static func detectorForcedBody(_ language: String) -> String {
        String(format: local("detector.forcedBody"), language)
    }

    static var detectorUnavailable: String { local("detector.unavailable") }
    static var detectorNativeName: String { local("detector.nativeName") }

    // MARK: - Detector: the evidence

    static var detectorEvidence: String { local("detector.evidence") }

    /// The row for signals two or more candidates share.
    ///
    /// langtell credits a signal only to a SOLE owner, so a shared one scores for
    /// nobody. Without this row, a reader who sees `і` in their Ukrainian text
    /// and no `і` in the Ukrainian evidence has been shown a broken tool.
    static var detectorShared: String { local("detector.shared") }
    static var detectorSharedHelp: String { local("detector.sharedHelp") }

    /// A candidate that was compared and had nothing exclusive to show.
    static var detectorNothingExclusive: String { local("detector.nothingExclusive") }

    /// A candidate in a different script — never in the running for this text.
    static var detectorOutOfScope: String { local("detector.outOfScope") }

    /// Rung names, for the "Recognised by" line and the evidence row labels.
    /// Keyed by the engine's `DetectRung` strings.
    static func detectorRung(_ rung: String) -> String { local("detector.rung.\(rung)") }
    static func detectorClue(_ rung: String) -> String { local("detector.clue.\(rung)") }

    static var detectorHowTitle: String { local("detector.howItWorks.title") }
    static var detectorHowBody: String { local("detector.howItWorks.body") }
    static var detectorLimitsTitle: String { local("detector.limitations.title") }
    static var detectorLimitsBody: String { local("detector.limitations.body") }

    // MARK: - About: lede, capabilities, footer

    static var aboutLede: String { local("about.lede") }
    static var aboutSourceCode: String { local("about.sourceCode") }

    /// The three rows the native About screen has that the React one never did.
    ///
    /// These are the only keys here without a `messages-en.ts` counterpart, so
    /// they are the one place the 1:1 mirror in this file's header does not hold.
    /// That is deliberate rather than drift: an App Store review sheet and a
    /// dependency-licence file are things a NATIVE app is expected to link and a
    /// web panel is not, and the React tab has no rows to sync them against.
    static var aboutRate: String { local("about.rate") }
    static var aboutPrivacy: String { local("about.privacy") }

    /// Movar's OWN licence. Singular — `aboutLicenses` below is the dependency
    /// roll-up, and the two live in different sections precisely because they
    /// answer different questions.
    static var aboutLicense: String { local("about.license") }
    static var aboutLicenses: String { local("about.licenses") }

    // `about.summary`, `about.whatTitle` and `about.feature{1,2,3}.*` have no
    // accessor any more: the native About no longer explains what Movar does.
    // Someone who has installed the app knows, and the copy duplicated the store
    // listing. The KEYS stay in `Localizable.strings` because they still mirror
    // `messages-en.ts`, which the React About tab — still the source of the
    // `08-host-app-about` store screenshot — goes on rendering.

    /// The masthead's version line, e.g. `Version 1.6.2`.
    ///
    /// Takes the BARE number. The old "v1.6.2" stamp put a jargon prefix in front
    /// of it that no catalogue could translate — a spelled-out word is what the
    /// reader of a localized screen expects, and a format string lets a language
    /// order the two parts however it needs to.
    static func aboutVersion(_ version: String) -> String {
        String(format: local("about.version"), version)
    }

    /// The changelog row's label.
    static var aboutWhatsNew: String { local("about.whatsNew") }

    static var aboutGroupApp: String { local("about.groupApp") }
    static var aboutGroupSupport: String { local("about.groupSupport") }
    static var aboutGroupLegal: String { local("about.groupLegal") }

    // `about.versionLink` has no accessor any more. It combined the stamp and
    // "what's new" into one control because the version WAS the link — and it
    // carried a WCAG 2.5.3 (label in name) contract for exactly that reason. Now
    // the masthead states the version as plain text and the changelog is its own
    // row whose visible label IS its name, so both the combination and the
    // contract are moot. The key stays in `Localizable.strings`: the React tab
    // still renders it.

    // MARK: - Trust row

    // The whole `trust.*` group has no accessor any more. Two of the three were
    // pre-install facts on a post-install screen, the third restated the privacy
    // policy the section already links to, and the footer they shared now carries
    // Movar's own licence instead — the one thing that section could not
    // otherwise say. The keys stay in `Localizable.strings` because they still
    // mirror `messages-en.ts`, which the React tab renders as its trust row.

    /// Footer "Send feedback" label — every platform.
    static var feedback: String { local("feedback") }

    // MARK: - Enablement banner

    static var chipSettingsApp: String { local("chips.settingsApp") }
    static var chipApps: String { local("chips.apps") }
    static var chipSafari: String { local("chips.safari") }
    static var chipSettings: String { local("chips.settings") }
    static var chipSettingsLegacy: String { local("chips.settingsLegacy") }
    static var chipExtensions: String { local("chips.extensions") }
    static var chipMovar: String { local("chips.movar") }

    /// Connector spoken between path steps ("Safari then Settings…").
    ///
    /// Carries its own surrounding spaces, as the React string does, because it
    /// is joined into a sentence rather than laid out — the Ukrainian « далі »
    /// and the English " then " both need them and neither should be assumed by
    /// the caller.
    static var pathThen: String { local("pathThen") }

    static var iosHeadline: String { local("ios.headline") }
    static var iosHelper: String { local("ios.helper") }
    static var iosAction: String { local("ios.action") }

    static var macSetupHeadline: String { local("macSetup.headline") }
    static var macSetupHelper: String { local("macSetup.helper") }

    // `macOn.headline` / `macOn.helper` have no accessor any more: on macOS the
    // setup card now HIDES once the extension is on, instead of turning into a
    // permanent "Movar is on" row. The keys stay in `Localizable.strings` for the
    // same reason the capability keys did — they still mirror `messages-en.ts`,
    // which the React tab goes on rendering.

    /// The iOS-only "I've done this" control on the setup card.
    static var aboutSetupDone: String { local("about.setupDone") }

    static var openPreferencesLabel: String { local("openPreferences.label") }
    static var openPreferencesLegacy: String { local("openPreferences.legacy") }

    // MARK: - Settings: language priority

    /// These keys mirror `packages/i18n/src/messages-{en,uk}.ts` rather than the
    /// host app's own `apps/safari-host-app/src/i18n/messages-en.ts`, because
    /// that is where the Settings copy actually lives: the web Settings tab
    /// composed `@movar/options-ui`'s sections under `@movar/i18n`'s provider
    /// precisely so its wording could never drift from the extension's own
    /// options page. Porting the screen must not undo that, so the paths here are
    /// the SHARED catalogue's paths, verbatim, and a drift stays a diff.
    static var priorityTitle: String { local("options.priority.title") }
    static var priorityAddLabel: String { local("options.priority.addLabel") }
    static var asideHowPriorityWorks: String { local("options.aside.howPriorityWorks") }

    // `options.priority.intro` has no accessor. It is the one-line version of
    // `aside.howPriorityWorks`, which the section footer carries in full; the web
    // page showed both, one under the heading and one in a grey card below.

    // MARK: - Settings: page content

    static var pageContentTitle: String { local("options.pageContent.title") }
    static var contentToggleLabel: String { local("contentToggle.label") }
    static var contentToggleDescription: String { local("contentToggle.description") }

    static var concealModeLegend: String { local("concealMode.legend") }

    /// The visible name of a conceal mode. Keyed off the enum rather than a
    /// stored string so a mode added to `ConcealMode` cannot compile without a
    /// label to draw it with.
    static func concealModeLabel(_ mode: ConcealMode) -> String {
        local("concealMode.\(mode.rawValue).label")
    }

    static func concealModeDescription(_ mode: ConcealMode) -> String {
        local("concealMode.\(mode.rawValue).description")
    }

    // MARK: - Settings: exempt sites

    static var allowlistTitle: String { local("options.allowlist.title") }
    static var allowlistEmpty: String { local("options.allowlist.empty") }
    static var allowlistInputLabel: String { local("options.allowlist.inputLabel") }
    static var allowlistAddButton: String { local("options.allowlist.addButton") }
    static var allowlistErrorBadDomain: String { local("options.allowlist.errorBadDomain") }
    static var allowlistErrorDuplicate: String { local("options.allowlist.errorDuplicate") }
    static var asideBlockedVsExempt: String { local("options.aside.blockedVsExempt") }

    // `options.allowlist.intro` has no accessor: "Movar leaves these sites alone"
    // restates the section header "Sites Movar skips" in different words. The
    // footer carries `aside.blockedVsExempt`, which says the thing the header
    // cannot — that a skipped site is left alone ENTIRELY.

    // MARK: - Settings: native-only

    /// The five strings below have no counterpart in either TS catalogue, so this
    /// is where the 1:1 mirror this file's header describes stops. That is
    /// deliberate rather than drift, and it is the same exemption `about.rate`
    /// and `about.privacy` take: they name things a NATIVE screen has and a web
    /// panel does not.
    ///
    /// The three list actions are the interesting case. The web page spells them
    /// `options.priority.moveUp(language)` and friends — PARAMETERISED, because
    /// its `↑ ↓ ×` glyph buttons sat in a flat list and each needed the language
    /// name to have a distinct accessible label. Ukrainian then needs that name
    /// in the accusative, which is why `messages-uk.ts` carries an endonym
    /// declension table for exactly these three strings. Here they hang off a
    /// row-scoped context menu, so the row IS the object, the verb stands alone,
    /// and none of that machinery has to cross into Swift.
    static var settingsMoveUp: String { local("settings.moveUp") }
    static var settingsMoveDown: String { local("settings.moveDown") }
    static var settingsRemove: String { local("settings.remove") }

    /// The row at the bottom of Settings that leads to About.
    static var settingsAbout: String { local("settings.about") }

    // MARK: - Sheet chrome

    static var commonCancel: String { local("common.cancel") }
    static var commonDone: String { local("common.done") }

    // MARK: - Locale

    /// The locale the bundle actually resolved the strings above with.
    ///
    /// Read from the bundle rather than from `Locale.current` because those two
    /// disagree exactly when it matters: a device set to a language the app does
    /// not ship falls back to the development region, and a changelog link built
    /// from `Locale.current` would then point at a page in a language the screen
    /// around it is not written in. This is the native equivalent of React
    /// threading the resolved `locale` into `AboutTab` instead of re-resolving it.
    static var resolvedLocale: String {
        Bundle.main.preferredLocalizations.first ?? "en"
    }

    /// True when this build resolved to Ukrainian copy.
    static var isUkrainian: Bool { resolvedLocale.hasPrefix("uk") }

    private static func local(_ key: String) -> String {
        NSLocalizedString(key, tableName: nil, bundle: .main, value: "", comment: "")
    }
}
