# Microsoft Edge Add-ons — Privacy page

Copy for the Privacy page in the Microsoft Edge Add-ons Partner Center. Mirrors the permission breakdown in [`deployment-checklist.md`](../../../../deployment-checklist.md#permission-justifications) and the privacy page at <https://movar.fyi/privacy>. Re-verify before each submission — if a permission, supported search engine, or data-flow claim changes, update this file at the same time.

Reference: <https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/edge-extension-policies>

The Chrome Web Store equivalent lives at [`../chrome/PRIVACY-FORM.md`](../chrome/PRIVACY-FORM.md). As of mid-2026, Microsoft moved the privacy fields out of the Properties page into a dedicated Privacy page whose five sections (Single Purpose, Permission justifications, Remote code, Data usage, Privacy policy) map 1:1 to Chrome's Privacy tab — so this document tracks Chrome's structure verbatim. The only known deltas are wording-level: Microsoft does not publish its data-category checkbox labels or the exact certification sentences in its public docs (they are only visible as a screenshot inside Partner Center), so the labels under **Data usage** below must be cross-checked against the live form at submission time and, if Microsoft uses different wording, edited to match.

---

## Single Purpose Description

> Movar enforces the user's preferred website language: it appends a language parameter to outgoing search-engine requests (Google, Bing, DuckDuckGo, YouTube) and detects when a multilingual site has served a non-preferred language so the user can switch with one click.

---

## Permission justifications

**`storage`**

> Persist the user's preferences (target language, allowlisted sites, hidden languages, UI language, DOM-modification opt-in) and operational state (current pause status, rolling counter of corrections applied today). Preferences live in `chrome.storage.sync` so they roam with the user's profile; operational state lives in `chrome.storage.local` and never leaves the device.

**`declarativeNetRequest`**

> Append the user's preferred-language query parameter to outgoing requests to supported search engines (Google, Bing, DuckDuckGo, YouTube) so results render in their chosen language. Rules are static and declarative; the extension never inspects or modifies request bodies.

**`alarms`**

> Schedule the daily reset of the "corrections today" counter shown in the popup. No other use.

**`tabs`**

> Read the active tab's URL when the popup or options page opens, so the UI can show whether the current site is on the user's allowlist and offer a one-click toggle. The extension never opens, moves, or closes tabs.

**Host permission `<all_urls>`**

> The content script applies language-correction logic on whichever site the user is currently viewing. Because users expect in-language content everywhere on the web, the permission cannot be narrowed to a fixed allowlist. No page content or browsing history ever leaves the device.

---

## Are you using remote code?

Select **"No, I am not using remote code."**

> Movar is a Manifest V3 extension; Microsoft explicitly forbids remotely hosted code under MV3. The package ships all code locally and does not load remote scripts, WebAssembly, or `eval`'d strings.

---

## Data usage

### What user data do you plan to collect from users now or in the future?

**Data collected:** none.

Leave every data-category checkbox unticked. Microsoft does not publish the exact labels in its docs — verify against the live Partner Center form at submission time. The categories typically mirror Chrome's set (personally identifiable information, health, financial and payment, authentication, personal communications, location, web history, user activity, website content); none of them applies to Movar.

### I certify that the following disclosures are true

Tick every certification checkbox. Microsoft does not publish the exact certification sentences in its docs (they appear only in the Partner Center screenshot), but per the Edge developer policies the certifications cover data minimization (§1.5.1), the privacy-policy requirement (§1.5.2), no data brokering (§1.5.3), opt-in consent for sharing with third parties (§1.5.3), secure transmission (§1.5.5), and the highly-sensitive-information limit (§1.5.6). Movar collects no user data, so each certification holds true by default.

If Microsoft ever surfaces a certification whose text Movar cannot honestly affirm, stop and reconcile the divergence before submitting — do not tick anything blind.

**Privacy Policy URL:** <https://movar.fyi/privacy>

---

## Note on `chrome.storage.sync`

Chrome Sync (which Edge inherits as `chrome.storage.sync` on the Chromium API surface) encrypts the payload before it leaves the device, and Movar runs no server of its own. Under Microsoft's developer policy this is not developer-collected user data, so the "no data collected" answer is correct. The full breakdown is at [`apps/marketing/src/pages/privacy.astro`](../../../marketing/src/pages/privacy.astro) if a reviewer asks.
