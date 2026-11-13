# App Store Connect — App Review notes (iOS · iPadOS · macOS)

Copy for **App Store Connect → [version] → App Review Information → Notes**, plus
the maintainer talking points to keep to hand if the reviewer asks a follow-up.
Both the iOS and macOS platforms live on the one app record (`fyi.movar.safari`),
so the same notes apply to both. Mirrors the permission + privacy facts in
[`deployment-checklist.md`](../../../../deployment-checklist.md#permission-justifications)
and [`docs/store-policy-stance.md`](../../../../docs/store-policy-stance.md).
**Re-verify before each submission.**

**Sign-in:** none. Leave the demo-account fields blank — every feature works
without an account and without a purchase, and everything except **Audit** (which
requests the site you name) works with no network connection at all.

**Contact:** support@movar.fyi

---

## Notes field (paste verbatim)

> Movar is a Safari Web Extension shipped inside this app. The app is **not just a
> launcher**: its main screen leads with **Movar Audit**, a tool that works with the
> extension switched off. Type any site's address and the app requests that page
> once per language preference, then produces a language-conformance report — what
> the site declares, what it actually serves, and whether its language switcher
> works — which you can re-run and export as a self-contained document. Below the
> audit, the same screen configures the extension (language priority, sites to
> skip, hiding blocked-language content); About — version, licences and support
> links — is the last row. (On Mac the same list is the window's sidebar.)
>
> **How to enable + test the extension**
>
> 1. Open the Movar app once. While the extension is off, the main screen leads
>    with a card spelling out the enable path for this exact device (on Mac, a
>    status row with a button that opens Safari's Extensions settings).
> 2. **iOS / iPadOS:** Settings ▸ Apps ▸ Safari ▸ Extensions ▸ Movar → turn On,
>    then set website access to **Allow** (All Websites). (On iOS 17 and earlier
>    the path omits the "Apps" step: Settings ▸ Safari ▸ Extensions ▸ Movar.)
>    **macOS:** Safari ▸ Settings ▸ Extensions → enable Movar, then "Always Allow
>    on Every Website."
> 3. Visit a multilingual site, or run a Google search that can return Russian
>    (e.g. a google.com.ua query). Movar asks the site for your preferred
>    language (Ukrainian first, English fallback) via the `Accept-Language`
>    header; if a multilingual page still serves a blocked language you can switch
>    with one tap, and — only if you opt in — it hides on-page content that stays
>    in a language you've chosen to block. Tap the Movar toolbar item to open the
>    popup (status, pause, reveal).
>
> **Privacy:** Movar has no server and no account. Nothing about your browsing
> leaves the device — preferences roam only via the OS's own iCloud / browser
> sync, and there is no analytics or tracking of any kind. The app↔extension
> settings bridge is on-device IPC (App Group + native messaging), not a network
> call. The one feature that uses the network is **Audit**, and only when you ask
> it to: it requests the site you typed, from your device, after a confirmation
> naming that host — never a Movar server, because there isn't one.
> Full policy: https://movar.fyi/privacy

---

## Maintainer talking points (NOT submitted — for reviewer follow-ups)

- **Guideline 4.2 (Minimum Functionality).** The container app must do more than
  launch/configure the extension. It does: **Movar Audit** takes a URL and
  produces a language-conformance report on it — the same `evaluate()` kernel the
  CLI runs, rendered natively, re-runnable and exportable as a self-contained HTML
  document. It is a standalone diagnostic tool, not a setting, and needs neither
  the extension nor an account. It does need the network (it fetches the site the
  reviewer names); if a reviewer reports the app as "only a launcher", point at the
  audit flow first and offer a test URL that answers quickly (movar.fyi).
  History: until 2026-11 the app also carried an on-device text **Detector**,
  listed here as a second 4.2 feature. The owner removed it with the one-list
  redesign (`docs/design/host-app/anatomy.md`), so Audit now carries this case
  alone. This is the deliberate 4.2 remediation — see `deployment-checklist.md`.
- **`<all_urls>` host permission.** The extension applies the language
  correction on whichever site the user is viewing, so it can't be narrowed to a
  fixed allowlist (users expect in-language content everywhere). On Safari the
  user grants this through Safari's own per-site "Allow on Every Website" control,
  not silently. No page content or browsing history ever leaves the device.
- **`nativeMessaging` (Safari-only permission).** Backs the host-app settings
  bridge: the app writes `MovarSettings` into the `group.fyi.movar.safari` App
  Group and the extension reconciles it via native messaging. This is
  same-device app↔extension IPC — no data leaves the device, no network use.
- **Guideline 1.1 / discouraged content — "why does it block Russian?"** Movar is
  a language-preference tool, not a judgement about speakers. Only `ru` is
  locked-on by default (the core user need); every other language — including
  fellow Cyrillic languages such as Belarusian — is detected, kept visible, and
  user-controllable. It **blocks, never translates**, and transmits nothing. Full
  written stance: `docs/store-policy-stance.md`.
- **No remote code (2.5.2 / self-contained).** All JavaScript ships in the app
  bundle under a `default-src 'self'` CSP; nothing is fetched, `eval`'d, or loaded
  from a remote host at runtime.
