# App Store Connect — App Privacy + export compliance (iOS · iPadOS · macOS)

Answers for **App Store Connect → App Privacy** (the privacy "nutrition label")
and the **export-compliance** prompt at upload. iOS and macOS share the one app
record (`fyi.movar.safari`), so these answers cover both. Mirrors
[`store-assets/chrome/PRIVACY-FORM.md`](../chrome/PRIVACY-FORM.md) and
<https://movar.fyi/privacy> — **nothing is collected.** Re-verify before each
submission; if a permission or data-flow claim changes, update this file, the
Chrome/Edge forms, and the privacy page together.

---

## App Privacy — data collection

**"Do you or your third-party partners collect data from this app?" → No, we do
not collect data from this app.**

The published listing then shows **Data Not Collected**, and every data category
(Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info,
Contacts, User Content, Browsing History, Search History, Identifiers, Purchases,
Usage Data, Diagnostics, Other Data) is **Not Collected**.

Consequently:

- **Data Used to Track You:** None.
- **Data Linked to You:** None.
- **Data Not Linked to You:** None.

### Why "Data Not Collected" is the correct answer (rationale)

- **No server, no account, no analytics.** Movar runs no backend of its own and
  ships no telemetry, tracking, or crash/analytics SDK.
- **Preferences** (target languages, allowlisted sites, hidden languages, UI
  language, the content-modification opt-in) are stored via the OS's own sync —
  Safari's iCloud-backed `storage.sync` and/or the on-device
  `group.fyi.movar.safari` App Group shared with the extension. They roam only
  between the user's **own** devices through a sync service the user enabled; the
  developer never receives them. Under Apple's definition, data that stays on the
  device / in the user's iCloud and is never transmitted to the developer or a
  third party is **not "collected."**
- **Operational state** — the pause status and a rolling corrections log (last
  1,000 entries, **domain only**, never full URLs or page contents) — is
  **device-local** (`storage.local`) and never syncs.
- **No page content, URLs, or browsing history ever leave the device.** The
  `Accept-Language` correction is a declarative header rewrite; the optional
  on-page concealment runs entirely in the content script.

(Same basis as the Chrome/Edge "does not collect" declarations — see the
`chrome.storage.sync` controller/processor note in the Chrome form.)

---

## Export compliance (the upload / "Encryption" prompt)

- Both App targets' `Info.plist` declare **`ITSAppUsesNonExemptEncryption = false`**
  (`apps/extension/safari/Movar/iOS (App)/Info.plist` and
  `macOS (App)/Info.plist`), which auto-answers the export-compliance question at
  upload: the app uses **no non-exempt encryption**. It makes only standard HTTPS
  requests (via the browser) and ships no proprietary or otherwise non-exempt
  cryptography.
- No CCATS and no annual self-classification report are required.

---

## Other App Store Connect metadata

| Field                | Value                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Privacy Policy URL   | <https://movar.fyi/privacy> (EN; Ukrainian at `/uk/privacy`)          |
| Age rating           | answer every content question **None → 4+**                           |
| Data types touched\* | language preferences + a domain-only corrections log (both on-device) |

\* Not "collected" in Apple's sense (never transmitted to the developer) — listed
here only so the questionnaire answers are traceable.
