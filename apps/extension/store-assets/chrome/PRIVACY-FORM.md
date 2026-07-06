# Chrome Web Store — Privacy tab

Copy for the Privacy tab in the Chrome Web Store Developer Dashboard. Mirrors the permission breakdown in [`deployment-checklist.md`](../../../../deployment-checklist.md#permission-justifications) and the privacy page at <https://movar.fyi/privacy>. Re-verify before each submission — if a permission, supported search engine, or data-flow claim changes, update this file at the same time.

Reference: <https://developer.chrome.com/docs/webstore/program-policies#extensions>

---

## Single purpose

> Movar enforces the user's preferred website language. It sets the `Accept-Language` header the browser sends so sites serve content in that language; detects when a multilingual site has still served a non-preferred language so the user can switch with one click; and — when the user opts in to DOM modification — conceals on-page content that remains in a language the user has chosen to block. All three are facets of the one purpose: making the web appear in the languages the user wants.

**Single-purpose decision (maintainer note, not store copy).** The opt-in content-script concealment runs on any site (`resolveNeeds()` in [`apps/extension/src/lib/capabilities.ts`](../../src/lib/capabilities.ts) returns the `conceal` chunk for every host whenever `contentModification` is on; only the per-site `model` chunk is host-gated). We judge this **within** the single purpose above rather than a second purpose: concealing blocked-language content is the on-page half of "enforce preferred language," the same goal the `Accept-Language` rewrite pursues at the request layer. It is off by default, user-initiated, and never leaves the device. Reviewed and accepted as single-purpose-compliant; if a Chrome reviewer reads "enforce preferred language" more narrowly (header-only), the fallback is to reword the single-purpose statement to lead with "make the web appear in your preferred languages, by request-header negotiation and optional on-page concealment" — same behaviour, broader framing.

---

## Permission justifications

**`storage`**

> Persist the user's preferences (target language, allowlisted sites, hidden languages, UI language, DOM-modification opt-in) and operational state (current pause status, plus a rolling corrections log capped at the last 1,000 entries — domain only, never full URLs or page contents). Preferences live in `chrome.storage.sync` so they roam with the user's profile; operational state lives in `chrome.storage.local` and never leaves the device.

**`declarativeNetRequest`**

> Rewrite the browser's `Accept-Language` request header to the user's preferred language order on page (top-level and sub-frame) navigations, so sites serve content in that language; sites the user allowlists are excluded. The rule is declarative and only sets this one request header — the `declarativeNetRequest` rule itself never inspects or modifies request bodies, response bodies, or page content. (On-page DOM changes, when the user opts in, are made by the content script under the host permission below — not by this rule.)

**`alarms`**

> Schedule Movar's automatic resume when a timed (1-hour) pause expires, so protection comes back exactly when the user was told it would. No other use.

**Host permission `<all_urls>`**

> The content script runs on whichever site the user is currently viewing. By default it only reads the page enough to detect its language and surface a one-click switch. If the user turns on DOM modification (off by default), the content script additionally conceals on-page content that is in a language the user has blocked — blurring it behind a reversible "Show" curtain or hiding it — on any site, since blocked-language content can appear anywhere. Because users expect in-language content everywhere on the web, the permission cannot be narrowed to a fixed allowlist — so it's declared optional and requested at runtime, via a one-click native prompt from the extension's first-run onboarding page, rather than granted unconditionally at install. No page content or browsing history ever leaves the device.

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

Chrome Sync encrypts the payload before it leaves the device, and Movar runs no server of its own. Under Chrome's policy this is not "developer-collected user data," so the "Does not collect" answer is correct.

**Controller / processor framing (for a GDPR-minded reviewer).** Movar never receives the synced preferences server-side — it has no server. The data the extension writes to `chrome.storage.sync` (target languages, allowlist, hidden languages, UI language, the DOM-modification opt-in) is roamed between the user's own devices by **the user's browser-sync service** (Google's Chrome Sync / Mozilla's Firefox Sync), which the user enables on their own account. In data-protection terms the user is acting on their own data through a sync service they chose; Movar is not a _controller_ of that data because it neither determines the purposes of any server-side processing nor ever holds the data off the user's devices, and it is not a _processor_ because no one instructs it to process the data on a server. The corrections log and pause state live in `chrome.storage.local` and never sync at all. We state "no data collected" on this basis; this is a maintainer posture, not legal advice. The full breakdown is at [`apps/marketing/src/pages/privacy.astro`](../../../marketing/src/pages/privacy.astro) if a reviewer asks.
