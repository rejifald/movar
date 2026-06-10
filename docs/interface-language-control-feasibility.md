---
type: research
id: interface-language-control-feasibility
status: reference
date: 2026-06-10
summary: Platform-by-platform feasibility notes on whether one installed app can control the *interface* (UI display) language of other apps and of web/account platforms, across Windows, macOS, Linux, iOS/iPadOS, Android, ChromeOS, and account surfaces (Google, Meta, Microsoft, Apple). The load-bearing finding: no consumer app can silently set or even read another app's UI-language *preference* on the locked-down OSes — sandboxing (Apple) and the disability-scoped AccessibilityService policy (Google) forbid it, and the per-app language toggles that exist are user-driven and developer-opt-in. The only genuine programmatic SET among the desktop/mobile OSes is on Windows (`Set-WinUILanguageOverride`); on the web, a browser extension can set the locale *signal* (Accept-Language + `navigator.language`) and a few per-product account APIs (e.g. Gmail) can set a per-product UI language via user OAuth. Everything else is detect/guide at best. These are research notes documenting platform constraints — **not** a decision or a roadmap commitment.
---

# Interface-language control across platforms — feasibility reference

## What this is, and what it is not

This document records what an installed third-party app is **actually permitted to do** about the **interface (UI display) language** of _other_ software — other native apps, and web/account platforms — across every consumer OS and a representative set of account surfaces. It is a technical reference distilled from primary platform documentation and law; every non-obvious claim is cited under [Sources](#sources).

It is **research notes, not a decision.** Nothing here commits the project to building any of it. It documents the boundary of the possible so future scoping does not have to re-derive it.

**Scope boundary — interface language vs content language.** Movar today operates on the **content** language of a page (detect blocked-language items, redirect to a wanted-language version, else conceal — see [priority-driven-switching.md](./priority-driven-switching.md)). This document is about a _different_ axis: the **interface** language an app or account _renders its own chrome in_ (menus, buttons, account UI). The two are independent; conclusions here do not transfer to content filtering and vice-versa.

## Three control modes

Every capability below falls into one of three modes. Keeping them distinct is the whole game — most of the confusion in this area comes from collapsing them.

- **SET** — programmatically change the interface language without manual steps.
- **EXAMINE** — read the current interface-language state of _another_ app or account.
- **GUIDE** — show the user instructions and, where possible, deep-link to the native setting screen so they change it themselves.

A further distinction inside EXAMINE is load-bearing: reading a _stored language preference_ (the actual setting value) is categorically different from reading _rendered on-screen text_ and heuristically inferring the displayed language. The first is unavailable everywhere; the second is available only in narrow, caveated cases.

## Capability by platform

| Surface                         | SET (auto)                                                                                                                                                             | EXAMINE another app's stored pref                                                                | EXAMINE via rendered text                                                                                                                     | GUIDE (deep-link)                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Windows**                     | ✅ `Set-WinUILanguageOverride` (pack must be installed; sign-out to apply)                                                                                             | ❌                                                                                               | ⚠️ UI Automation can read other apps' rendered text (not verified in this pass)                                                               | ✅                                                                                        |
| **macOS**                       | ❌ (sandbox)                                                                                                                                                           | ❌ (separate defaults containers)                                                                | ⚠️ via `AXUIElement` + user-granted Accessibility permission; app must be **unsandboxed → off the Mac App Store**                             | ✅                                                                                        |
| **Linux**                       | ⚠️ open model; scripted locale changes (`localectl`, `LANG`/`LC_*`, DE settings) are plausible but were not adversarially verified here                                | ⚠️ environment-level only                                                                        | n/a                                                                                                                                           | ✅                                                                                        |
| **iOS / iPadOS**                | ❌ (sandbox); per-app toggle is **user-driven**                                                                                                                        | ❌                                                                                               | ❌ no third-party cross-app read exists at all                                                                                                | ✅ (own-app pane reliable; other panes use private URL schemes and risk review rejection) |
| **Android**                     | ❌ for other apps; an app can set **its own** locale (`setApplicationLocales`); per-app toggle is user-driven and needs the target app's `android:localeConfig`        | ❌ (`SharedPreferences` are `MODE_PRIVATE`)                                                      | ⚠️ a running AccessibilityService can read other apps' rendered text — but see [the accessibility question](#the-accessibility-tool-question) | ✅ (public intent to the per-app language screen)                                         |
| **ChromeOS**                    | ❌ consumer; ✅ enterprise (sign-in-screen language via Admin console)                                                                                                 | ❌ consumer                                                                                      | n/a                                                                                                                                           | ✅                                                                                        |
| **Web (browser extension)**     | ⚠️ sets the locale **signal** (Accept-Language + `navigator.language`), per-site — changes how a site _detects/serves_ language, **not** the stored account preference | ✅ the extension reads page content/`Content-Language` (this is the one place EXAMINE is strong) | ✅                                                                                                                                            | ✅                                                                                        |
| **Google account / Gmail**      | ✅ Gmail `settings.updateLanguage` sets the per-product UI language via user OAuth (not silent; not the account-wide Google language)                                  | —                                                                                                | —                                                                                                                                             | ✅                                                                                        |
| **Meta / Microsoft / Apple ID** | ❓ no settable account-language API verified — treat as deep-link/UI only                                                                                              | —                                                                                                | —                                                                                                                                             | ✅                                                                                        |

**Reading the table.** GUIDE is the universal floor — it needs no privileged access, it is just instructions plus a URL. SET is the rare, opportunistic case (Windows OS, the web locale signal, a few per-product account APIs). EXAMINE of _another app's_ language is the surprising one: the stored preference is unreadable everywhere, and rendered-text inference exists only on Android and macOS with serious strings attached, never on iOS.

## Key mechanisms

- **Web locale signal.** A browser extension can override the `Accept-Language` HTTP header (MV3 `declarativeNetRequest` / Firefox `webRequest`) and `navigator.language`/`navigator.languages`, per-site. This is standardized and already shipped by several extensions. It influences how a server _detects and serves_ language; it does **not** write the server-side stored account preference.
- **Per-product account APIs.** Some account surfaces expose an authenticated setter — Gmail's `settings.updateLanguage` is a verified example (scope `gmail.settings.basic`, requires user OAuth consent). This does **not** generalize: no equivalent settable UI-language API was verified for Meta, Microsoft, or Apple ID.
- **`hl=` URL parameter.** Affects the language of the current request on many Google properties; whether it _persists_ a preference vs. only affecting the single response was not established.
- **Windows display language.** `Set-WinUILanguageOverride` sets the per-user UI language for a script to call — the one genuine programmatic SET among the in-scope OSes. Caveats: the language pack must already be installed (`Install-Language`, usually admin), and the change applies after sign-out/in.
- **Native per-app language.** iOS exposes a per-app Language toggle (the app must declare multi-language support; the device needs ≥2 languages). Android 13+ exposes per-app language, but only if the target app declares `android:localeConfig` — omit it and the app never appears in the list. Both are **user-driven Settings toggles**, not third-party-writable.
- **MDM / enterprise.** Android EMM "managed configurations" let admins push app settings remotely, but only for keys the target app's developer chose to expose (empty schema = unconfigurable). ChromeOS admins can set the sign-in-screen language via the Google Admin console (enrollment required). Apple's configuration-profile catalog has **no** language/locale payload — language/region can only be preset at DEP/Setup-Assistant enrollment time, a distinct mechanism.

## Hard constraints

- **Apple sandbox (iOS/iPadOS, macOS).** Designed to "prevent apps from gathering or modifying information stored by other apps" — note _gathering_ (reading) is barred too, not just modifying. Cross-app access is deny-by-default, permitted only through Apple-provided services and signed entitlements. Each app's `AppleLanguages` value lives in its own defaults domain, writable (and readable) only by that app for itself.
- **Android AccessibilityService policy.** The only technical route to read other apps' UI is the AccessibilityService, and Google Play restricts the `isAccessibilityTool` declaration to tools that "help people with disabilities." Any use that "enables an app to autonomously initiate, plan, and execute actions" is prohibited; non-exempt use requires prominent in-app disclosure + affirmative consent; reading other apps' content via accessibility is classified as sensitive-data collection. The policy is **tightening** (Oct 2025 clarification; Android 16/17 Advanced Protection auto-revokes accessibility from apps not classified as accessibility tools), not loosening.
- **Private storage is private.** Another app's settings store is unreachable cross-app on every OS — Android `SharedPreferences` are `MODE_PRIVATE` (`WORLD_READABLE` throws `SecurityException` since API 24); Apple's sandbox isolates each app's defaults container. There is no API for one app to read another's locale _preference_ on any platform.

## The accessibility-tool question

A recurring proposal is that qualifying as a _genuine_ accessibility tool would unlock reading other apps' language. It does not, in the way one hopes:

- **The stored preference is unreadable on every platform, even with full accessibility status.** Accessibility APIs surface the rendered UI tree, never another app's private settings store.
- **Rendered-text inference is the ceiling, and only here:** Android (while an AccessibilityService runs — but a language tool is a general utility that does not fit Google's disability-scoped `isAccessibilityTool` eligibility, so shipping it carries high rejection/removal risk under a tightening policy) and macOS (`AXUIElement` with the user-granted Accessibility permission, but the app must be unsandboxed, hence distributed outside the Mac App Store). **iOS offers no third-party cross-app read at all.**
- Inferring language from rendered text is inherently brittle — icons, numerals, proper nouns, and mixed-language screens all confound it — and yields "this app is _showing_ language X right now," never "this app's UI-language setting _is_ X."

## Legal context (Ukraine)

Relevant because a "users should receive their local language by default" obligation exists in law for some sectors. Stated precisely, from the Law of Ukraine "On ensuring the functioning of the Ukrainian language as the state language" (No. 2704-VIII, 2019):

- **Software UI (Art. 27 §1).** Software with a UI sold in Ukraine must offer an interface in "the State language, English **and/or** other official languages of the EU." So a Russian-only UI is non-compliant, but an **English UI is fully compliant** — Ukrainian is not mandatory for general software.
- **Websites (Art. 27 §6).** Online representations of businesses **registered in Ukraine** must have a Ukrainian version that "should be loaded by default for users in Ukraine." Foreign entities are bound only if they have a Ukrainian subsidiary/branch/representative office.
- **Consumer service (Art. 30).** The language of consumer services in Ukraine "shall be the State language"; at a client's request, service may also be provided in another language.
- **Scope & enforcement.** The duties bind entities registered/operating in Ukraine; foreign-only platforms (Google, Meta, Apple) without a Ukrainian establishment are largely outside the website mandate. Enforcement runs through the Commissioner for the Protection of the State Language, with administrative fines that are levied in practice but modest in size.

**Boundary.** This legal framework does not compel a foreign platform to expose an API, and it does not change Apple's or Google's own (strictly disability-scoped) definitions of "accessibility." It is context about _user need and obligation_, not a technical permission lever.

## Generic vs. mission-specific

Every mechanism above is **language-agnostic** — identical to an expat, a polyglot, or an accessibility user. Two points are specific to a "reduce Russian, prefer the local language" mission:

1. **Which language the lever targets** — the same Accept-Language / `navigator.language` override points at `uk` (or the user's local language) instead of `ru`.
2. **The fallback-chain caveat (load-bearing).** Merely _removing_ Russian from the locale signal frequently lands the user on **English**, not Ukrainian, because of how servers resolve language fallbacks. A signal-based approach must therefore **assert the wanted language explicitly** (correct `q`-value ordering, a deliberate `navigator.languages` array) rather than just dropping `ru`. Dropping ru ≠ landing on uk.

## Sources

Primary platform documentation and law (accessed 2026-06):

- Android per-app language & `localeConfig` — https://developer.android.com/guide/topics/resources/app-languages · https://android-developers.googleblog.com/2022/11/per-app-language-preferences-part-1.html
- Android `SharedPreferences` privacy — https://developer.android.com/training/data-storage/shared-preferences
- iOS per-app language — https://developer.apple.com/news/?id=u2cfuj88
- Windows `Set-WinUILanguageOverride` — https://learn.microsoft.com/en-us/powershell/module/international/set-winuilanguageoverride
- Apple Platform Security (sandbox) — https://support.apple.com/guide/security/security-of-runtime-process-sec15bfe098e/web
- Apple App Sandbox — https://developer.apple.com/documentation/security/app-sandbox
- Apple configuration-profile reference — https://developer.apple.com/business/documentation/Configuration-Profile-Reference.pdf
- Google Play AccessibilityService policy — https://support.google.com/googleplay/android-developer/answer/10964491 · prominent disclosure — https://support.google.com/googleplay/android-developer/answer/11150561
- Gmail API language settings — https://developers.google.com/workspace/gmail/api/guides/language-settings
- Android EMM managed configurations — https://developers.google.com/android/work/play/emm-api/managed-configurations
- ChromeOS device language policy — https://support.google.com/chrome/a/answer/1375678
- Browser locale-signal extensions (examples) — https://chromewebstore.google.com/detail/locale-switcher/kngfjpghaokedippaapkfihdlmmlafcc · https://github.com/sorz/accept-language-per-site
- Law of Ukraine No. 2704-VIII — https://zakon.rada.gov.ua/laws/show/2704-19?lang=en · English translation (Venice Commission CDL-REF(2019)036) — https://docs-venice.coe.int/api/Document?pdffile=CDL-REF(2019)036-e · Commissioner for the Protection of the State Language — https://mova-ombudsman.gov.ua/en
