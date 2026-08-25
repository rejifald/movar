//
//  HostSettings.swift
//  Shared (App)
//
//  The four settings the native Settings screen edits, over the stored blob.
//

import Foundation

/// What happens to content in a blocked language, when concealment is on.
///
/// Mirrors `@movar/settings`' `ConcealMode`. The raw values are the stored
/// strings verbatim, because this type is decoded straight out of the shared
/// settings object and has to round-trip through it unchanged.
enum ConcealMode: String, CaseIterable, Equatable {
    case curtain
    case hide
}

/// Movar's settings, as the native screen sees them.
///
/// THIS TYPE OWNS FOUR KEYS, NOT THE SCHEMA. It wraps the stored object as a
/// raw dictionary and mutates only `priority`, `allowlist`, `contentModification`
/// and `concealMode`; every other key — `schemaVersion`, `enabled`, `blocked`,
/// `uiLanguage`, and anything a newer extension build has added since this app
/// was compiled — is carried through a host write byte for byte. That is the
/// whole reason it is a dictionary wrapper rather than a `Codable` struct: a
/// struct would silently drop what it did not know about, and the host app and
/// the extension ship on different release trains (the extension updates through
/// the browser, this app through the App Store), so "a field this binary has
/// never heard of" is the normal case rather than the exceptional one.
///
/// `ViewController`'s `MovarAppGroup` already treats the blob as opaque for
/// exactly this reason ("no schema lives natively; the extension
/// validates/migrates on adoption"). This keeps that property while giving the
/// four editable fields a type.
///
/// **`blocked` is deliberately NOT re-derived here.** It is a function of
/// `priority` (`deriveBlocked` in `@movar/settings`, over the `IMPOSED_OVER`
/// policy table), so a host edit to `priority` does leave it momentarily stale —
/// and then the extension re-derives it, because it runs `enforceLockedLanguages`
/// at every read and before every write. Convergence at that boundary is what
/// lets this file mirror ONE constant ({@link lockedBlockedLanguages}) instead of
/// a policy table whose whole point is that it encodes decisions, not
/// preferences. A Swift twin of `IMPOSED_OVER` would be a second place for those
/// decisions to live and a first place for them to drift.
struct HostSettings {

    /// The stored object, exactly as it came out of the App Group.
    private var raw: [String: Any]

    init(raw: [String: Any]) {
        self.raw = raw
    }

    /// The object to hand back to `MovarAppGroup.write` — unknown keys intact.
    var storageObject: [String: Any] { raw }

    // MARK: - The four editable fields

    /// Ordered language preference; the first one a site offers wins.
    var priority: [String] {
        get { (raw["priority"] as? [String]) ?? Self.defaultPriority }
        set { raw["priority"] = newValue }
    }

    /// The languages Movar hides on this reader's behalf.
    ///
    /// READ-ONLY, and the one language field with no setter. `blocked` is a
    /// function of `priority` (`deriveBlocked` over the `IMPOSED_OVER` policy
    /// table) which the extension re-derives at every read and before every
    /// write, so a host-side write would be overwritten at the next boundary
    /// crossing — see this type's header for why that convergence is the design
    /// rather than a gap. The Detector reads it to seed its comparison set;
    /// nothing native writes it.
    ///
    /// Falls back to the locked set rather than to `[]`. A record written before
    /// the key existed, or one this app read before the extension had ever run,
    /// would otherwise answer "nothing is blocked" — wrong in the one case that
    /// matters most, since `ru` is blocked unconditionally.
    var blocked: [String] {
        (raw["blocked"] as? [String]) ?? Self.lockedBlockedLanguages
    }

    /// Domains Movar leaves entirely alone.
    var allowlist: [String] {
        get { (raw["allowlist"] as? [String]) ?? [] }
        set { raw["allowlist"] = newValue }
    }

    /// Whether Movar may conceal on-page content in a blocked language.
    var contentModification: Bool {
        get { (raw["contentModification"] as? Bool) ?? false }
        set { raw["contentModification"] = newValue }
    }

    /// How concealed content is concealed. Meaningless while
    /// {@link contentModification} is off, which is why the screen only offers it
    /// then — the stored value is left alone rather than reset, so turning
    /// filtering back on restores the choice that was made last time.
    var concealMode: ConcealMode {
        get { ConcealMode(rawValue: (raw["concealMode"] as? String) ?? "") ?? .curtain }
        set { raw["concealMode"] = newValue.rawValue }
    }

    // MARK: - Defaults

    /// `@movar/settings`' `defaultSettings.priority`.
    ///
    /// Only the fields this screen edits have a native default, and only for the
    /// never-written case below. Everything else defaults on the web side, where
    /// `defaultSettings` actually lives.
    static let defaultPriority = ["uk", "en"]

    /// The settings to show when the App Group has never been written.
    ///
    /// The same fallback `bridge.ts`'s `hostSettingsSource.read()` makes
    /// (`res?.settings ?? defaultSettings`): a fresh install where the extension
    /// has not yet synced anything. Deliberately an EMPTY object rather than a
    /// spelled-out copy of `defaultSettings` — every accessor above already
    /// falls back, and a second literal copy of the defaults in Swift is one more
    /// thing to keep in step for no gain. Nothing is written until the reader
    /// actually changes something.
    static var unwritten: HostSettings { HostSettings(raw: [:]) }
}

// MARK: - Languages

extension HostSettings {

    /// The languages either list can offer. Mirrors `@movar/options-ui`'s
    /// `SUPPORTED_LANGUAGES`, which in turn mirrors the "Preferred-language
    /// options" list in `apps/extension/STORE-LISTING.md`.
    static let supportedLanguages = ["uk", "en", "de", "fr", "es", "it", "pl", "ru"]

    /// Permanently blocked; never offered as a preference.
    ///
    /// `@movar/settings`' `LOCKED_BLOCKED_LANGUAGES`. Russian is locked because
    /// Movar exists to help Ukrainians dodge Russian content, and a preference
    /// that could switch that off would be a footgun aimed at the premise. The
    /// storage boundary re-asserts it either way (`enforceLockedLanguages` strips
    /// locked codes from `priority`), so this constant is here to keep the UI
    /// from OFFERING a choice the boundary would then quietly undo.
    static let lockedBlockedLanguages = ["ru"]

    static func isLockedBlocked(_ code: String) -> Bool {
        lockedBlockedLanguages.contains(code)
    }

    /// Languages that can still be added to `priority`.
    var addableLanguages: [String] {
        Self.supportedLanguages.filter { !priority.contains($0) && !Self.isLockedBlocked($0) }
    }

    /// A language's name, in the language the SCREEN is written in.
    ///
    /// Foundation's counterpart to the `Intl.DisplayNames(locale)` the web
    /// options page uses, and localized the same way it is there: a Ukrainian
    /// screen reads «українська, англійська», not "Ukrainian, English".
    ///
    /// Against the BUNDLE's resolved locale rather than `Locale.current`, for the
    /// same reason `HostActions.openPrivacyPolicy` is — a device set to a
    /// language this app does not ship falls back to the development region for
    /// its copy, and taking the names from `Locale.current` would then label an
    /// English screen in that device language.
    static func displayName(_ code: String) -> String {
        let locale = Locale(identifier: HostStrings.resolvedLocale)
        return locale.localizedString(forLanguageCode: code) ?? code
    }

    /// A whole BCP-47 TAG's name — `uk-UA` → «українська (Україна)».
    ///
    /// The audit report's counterpart to {@link displayName}, and separate from
    /// it because the inputs are different in kind. Settings deals in bare
    /// language codes it chose from a fixed list; the report deals in whatever a
    /// site declared in `<html lang>`, which routinely carries a region and
    /// occasionally carries nonsense. `localizedString(forLanguageCode:)` answers
    /// `nil` for anything with a subtag, so a matrix built on it would print the
    /// raw `uk-UA` beside a properly named `Ukrainian` in the row above —
    /// one table speaking two vocabularies, which is the exact defect the column
    /// was made a NAME rather than a code to avoid.
    ///
    /// Falls back to the tag itself, which is the honest answer for a declaration
    /// no locale database recognises: the site did say that, and a report that
    /// silently blanked it would be hiding the evidence for
    /// `core/lang-malformed`.
    static func languageName(_ tag: String) -> String {
        let locale = Locale(identifier: HostStrings.resolvedLocale)
        return locale.localizedString(forIdentifier: tag) ?? tag
    }
}

// MARK: - Exempt-site domains

extension HostSettings {

    /// Reduce whatever was typed — a URL, a `www.` host, mixed case, a trailing
    /// path or port — to the bare lowercase domain that gets stored.
    ///
    /// A hand port of `@movar/settings`' `normaliseDomain`, and it has to STAY a
    /// faithful one: the runtime host matcher only folds case and a trailing dot,
    /// so a domain stored in any other shape is a rule that silently never
    /// matches. The storage boundary normalises again on adoption
    /// (`normalizeAllowlist`), so a divergence here does not corrupt anything —
    /// it drops the entry, which looks like "the Add button did nothing".
    static func normaliseDomain(_ input: String) -> String {
        var domain = input.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        for scheme in ["https://", "http://"] where domain.hasPrefix(scheme) {
            domain = String(domain.dropFirst(scheme.count))
            break
        }
        if domain.hasPrefix("www.") {
            domain = String(domain.dropFirst(4))
        }
        if let cut = domain.rangeOfCharacter(from: CharacterSet(charactersIn: "/:")) {
            domain = String(domain[domain.startIndex..<cut.lowerBound])
        }
        return domain
    }

    /// `@movar/settings`' `DOMAIN_PATTERN`: dot-separated alphanumeric-and-hyphen
    /// labels, at least one dot, no leading or trailing hyphen in a label.
    /// Rejects wildcards, schemes, paths, ports and bare single labels —
    /// matching is exact-domain-plus-subdomains with no public-suffix support
    /// (`docs/exempt-sites.md`). Applied to the already-lowercased output of
    /// {@link normaliseDomain}, so it needs no case-insensitive flag.
    private static let domainPattern =
        "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$"

    /// Whether `domain` is a storable exempt-site entry. Expects the normalised
    /// form — `@movar/settings`' `isStorableDomain` is the two composed.
    static func isValidDomain(_ domain: String) -> Bool {
        domain.range(of: domainPattern, options: .regularExpression) != nil
    }
}
