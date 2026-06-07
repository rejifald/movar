# Chrome Web Store — Privacy tab

Copy for the Privacy tab in the Chrome Web Store Developer Dashboard. Mirrors the permission breakdown in [`deployment-checklist.md`](../../../../deployment-checklist.md#permission-justifications) and the privacy page at <https://movar.fyi/privacy>. Re-verify before each submission — if a permission, supported search engine, or data-flow claim changes, update this file at the same time.

Reference: <https://developer.chrome.com/docs/webstore/program-policies#extensions>

---

## Single purpose

> Movar enforces the user's preferred website language: it sets the `Accept-Language` header the browser sends so sites serve content in that language, and detects when a multilingual site has still served a non-preferred language so the user can switch with one click.

---

## Permission justifications

**`storage`**

> Persist the user's preferences (target language, allowlisted sites, hidden languages, UI language, DOM-modification opt-in) and operational state (current pause status, plus a rolling corrections log capped at the last 1,000 entries — domain only, never full URLs or page contents). Preferences live in `chrome.storage.sync` so they roam with the user's profile; operational state lives in `chrome.storage.local` and never leaves the device.

**`declarativeNetRequest`**

> Rewrite the browser's `Accept-Language` request header to the user's preferred language order on page (top-level and sub-frame) navigations, so sites serve content in that language; sites the user allowlists are excluded. The rule is declarative and only sets this one request header — the extension never inspects or modifies request bodies or page content.

**`alarms`**

> Schedule Movar's automatic resume when a timed (1-hour) pause expires, so protection comes back exactly when the user was told it would. No other use.

**Host permission `<all_urls>`**

> The content script applies language-correction logic on whichever site the user is currently viewing. Because users expect in-language content everywhere on the web, the permission cannot be narrowed to a fixed allowlist. No page content or browsing history ever leaves the device.

**Remote code**

> No. The extension ships all code in the package; it does not load or execute remote scripts, WebAssembly, or `eval`'d strings.

---

## Data usage

**Data collected:** none of the listed categories.

- No personally identifiable information
- No health information
- No financial and payment information
- No authentication information
- No personal communications
- No location
- No web history
- No user activity
- No website content

Tick all three certification checkboxes:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** <https://movar.fyi/privacy>

---

## Note on `chrome.storage.sync`

Chrome Sync encrypts the payload before it leaves the device, and Movar runs no server of its own. Under Chrome's policy this is not "developer-collected user data," so the "Does not collect" answer is correct. The full breakdown is at [`apps/marketing/src/pages/privacy.astro`](../../../marketing/src/pages/privacy.astro) if a reviewer asks.
