---
type: research
id: android-extension-reach
status: reference
date: 2026-09-07
summary: Platform survey of every route that could put Movar's blocking behaviour in front of Android users, measured against StatCounter's August 2026 Ukrainian mobile split (Chrome 63.52%, Safari 28.23%, Samsung Internet 2.83%, Opera 2.51%, Firefox 0.77%). The load-bearing finding is that ~70% of Ukrainian mobile browsing is Android and roughly 99% of that sits on browsers with no WebExtension runtime at all — the constraint is the browsers, not our packaging. Firefox for Android is the only working path and already ships (AMO listing carries the "Available on Firefox for Android" badge via the `gecko_android` floor of 142), reaching under 1% of the market. Edge for Android is the only Chromium door that exists but its Android catalogue is a small manually curated allowlist gated behind a five-step application whose current status Microsoft has not answered since March 2026, and step one — a public Edge Add-ons listing — is still unmet on our side. Chrome has no extension runtime and no stated plans; Samsung Internet's add-ons are Galaxy Store APKs on Samsung's own non-WebExtension API; the AccessibilityService route stays ruled out by Google's tightening disability-scoped policy. Corrects a natural misconception: shipping an extension inside a native app is an Apple-only mechanism, and the only Android equivalent is bundling into our own GeckoView browser via `WebExtensionController.ensureBuiltIn`. Decision recorded 2026-09-07 — no new platforms now, and nothing built on a non-WebExtension add-on API.
---

# Reaching Android users with the extension

## What this is

A survey of the routes by which Movar's concealment behaviour could reach Android
users, with each route's cost and its reachable audience. It is research plus one
standing decision (below); it is **not** a roadmap commitment to build any of it.

It is the browser-side companion to
[interface-language-control-feasibility.md](./interface-language-control-feasibility.md),
which answers the adjacent OS-side question (can one app control another app's UI
language — no) and whose Android findings this doc does not repeat.

## The load-bearing number

StatCounter, Ukraine, **mobile only**, August 2026:

| Browser          | Share  | Can run Movar?                           |
| ---------------- | ------ | ---------------------------------------- |
| Chrome           | 63.52% | ❌ no extension runtime, no stated plans |
| Safari           | 28.23% | ✅ shipped — App Store, iOS/iPadOS       |
| Samsung Internet | 2.83%  | ⚠️ own add-on API, not WebExtensions     |
| Opera            | 2.51%  | ❌                                       |
| Firefox          | 0.77%  | ✅ shipping today via AMO                |

(The remaining share is spread across other browsers.)

Safari's 28% is iOS and already covered. That leaves Android at roughly 70% of
Ukrainian mobile browsing, of which about **99% is on browsers where no extension
can run at all**. Every judgement below follows from this table: the ceiling on
Android is set by browser vendors, not by anything we package or publish.

## What ships today

Movar is already installable on **Firefox for Android**. The AMO listing carries
the "Available on Firefox for Android™" badge (verified 2026-09-07, v1.8.1, 21 AMO
users, 5★/3 reviews), which the `gecko_android.strict_min_version: '142.0'` block
in [wxt.config.ts](../apps/extension/wxt.config.ts) is what earns. Mozilla opened
AMO installs to Firefox for Android in v120 (2023-12-14); any extension its
developer marks Android-compatible is installable.

The marketing site already routes for this: `isAndroidChromium()` in
[downloads.ts](../apps/marketing/src/lib/downloads.ts) deliberately separates
_identity_ from _installability_, and the CTA swaps to "Add to Firefox for
Android" with `androidNote` explaining why a Chromium browser on Android offers
no working alternative.

**Known gap:** nobody has verified the extension is actually _usable_ on a phone.
The popup, options page and onboarding were designed for desktop browser chrome;
on Firefox for Android the popup renders as a panel. We advertise this path in the
CTA without having tested it. This is in-house work, needs no vendor, and should
precede any spend on Android reach.

## Why "ship it inside a native app" is an Apple-only trick

Worth stating explicitly, because the App Store precedent makes the opposite
assumption feel obvious. On Apple platforms the container app **is** the
distribution channel — Safari Web Extensions are only distributable inside a
native app, which is the original reason `apps/safari-host-app` exists (see
[native-shells.md](./native-shells.md), which notes the wrapper began life
satisfying exactly that requirement).

Android has no equivalent:

- **Chromium on Android** exposes no extension runtime, so there is nothing for a
  container to install _into_. A Play app cannot grant Chrome a capability Chrome
  does not have.
- **Firefox for Android** has a real runtime, but installs come from AMO through
  the browser's own add-ons UI. There is no intent, no API and no sideload path
  for a third-party APK to push an XPI into Firefox.

A Play listing therefore buys **zero** extension distribution. The Android entry
in native-shells.md is a Compose shell over `@movar/audit-engine` — Movar Audit,
a different product surface with no extension anywhere in it.

## Per-browser findings

### Chrome for Android — closed

No extension support, and Google has stated no intent to add it. The "Add to
Desktop" affordance on a phone pushes the extension to a signed-in _desktop_
Chrome; it never activates anything on the device. Nothing to do here.

### Edge for Android — the only Chromium door, and it is ajar

Edge ships extensions on Android in stable (from the v134 line), but:

- the catalogue is a **manually curated allowlist**, small — reporting through
  2026 has put it around twenty-odd extensions — and the in-browser extensions
  page is still labelled beta;
- the wider behaviour exists in pre-release channels: Edge **Canary** opened to
  all desktop extensions (2025-10), and **Beta 143** added search across
  "thousands" of Edge Add-ons listings (2025-11). Whether that has reached stable
  is unconfirmed.

Microsoft's documented developer route onto Android, per
[MicrosoftEdge-Extensions#529](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/529):

1. be published on the Edge Add-ons store;
2. give a clear user-value statement for mobile browser users;
3. confirm the extension is ready for Edge Android — core functions verified there;
4. supply core-function test cases for Edge Android's QA team;
5. submit the request through a Microsoft Forms link.

Two facts matter. **Requirement 1 is our own blocker** — the native Edge Add-ons
listing is still pending (see the `browserStore` comment in downloads.ts and
[deployment-checklist.md](../deployment-checklist.md)), and a store search finds
no Movar. That listing is owed anyway for desktop Edge. And **the process may be
obsolete**: issue #529 asks whether the five steps still apply or whether all Edge
extensions are now available on Android by default. Opened 2026-03-13, still open,
no Microsoft answer as of 2026-09-07.

Upside is uncertain regardless: Edge does not clear StatCounter's reporting
threshold for Ukrainian mobile. This is a bet on a door, not on an audience.

### Samsung Internet — bigger audience, wrong API

At 2.83% it is 3.7× Firefox's Ukrainian mobile share, and it does support add-ons
— but they are **APKs distributed through Galaxy Store against Samsung's own
add-on API**, not WebExtensions. Reaching it is a rewrite, not a port. Public
documentation is thin and much of it dates to 2019. Explicitly out of scope under
the decision below.

### Firefox forks — free, negligible

IronFox, Iceraven, Fennec and friends install AMO add-ons (some via custom
collections). We already reach them at zero marginal cost by being on AMO. Nothing
to do, nothing to claim.

## The only real bundling route, if it ever matters

If Movar ever wanted one install that both ships the browser and enables the
blocking, the mechanism exists and is WebExtension-based: GeckoView's
`WebExtensionController.ensureBuiltIn("resource://android/assets/movar/", "movar@movar.fyi")`
installs an extension **from a folder inside the APK**. Built-in extensions need
no signing, are not re-installed when the version is unchanged, and get native
messaging — which would also let a single app host the audit engine.

The catch is that this does not reach Chrome users; it asks them to switch
browsers, which is the same ask as "install Firefox" made from a no-name browser,
plus a browser to maintain in perpetuity. Recorded here so the option is costed
rather than rediscovered, not because it is proposed.

## Dead ends

- **AccessibilityService** — already ruled out in
  [interface-language-control-feasibility.md](./interface-language-control-feasibility.md);
  Google's `isAccessibilityTool` eligibility is disability-scoped and the policy
  is tightening, not loosening.
- **Kiwi Browser** — the usual answer to "Chromium extensions on Android" is gone:
  archived January 2025. Its extension code was absorbed into Edge Canary, which
  is why Edge's Play listing courts former Kiwi users. Edge is the successor to
  that audience, not a separate option.

## Decision — 2026-09-07

**No new platforms now, and nothing built on a non-WebExtension add-on API.**

What that rules out for the time being: Samsung Internet (wrong API), a
Movar-branded GeckoView browser (a new platform to own), and any Android-native
concealment surface.

What it leaves in, because neither is a new platform:

- **Firefox for Android** — already shipping; the only open work is confirming the
  UI is usable on a phone.
- **The Edge Add-ons listing** — owed for desktop Edge regardless. Once it is
  public, applying to the Edge Android catalogue is a form plus test cases, and
  worth doing then rather than as a separate initiative.

The honest summary of the position this leaves us in: Android reach stays under
1% of the Ukrainian mobile market, and that is a browser-vendor fact we are
choosing not to buy our way around.

## What would change this

Revisit when any of these becomes true:

- Edge for Android drops the curated allowlist in **stable** (watch issue #529, or
  simply retest once our Edge listing is live).
- Chrome for Android ships any extension runtime — this would move ~64% of the
  market in one step and would outweigh everything else in this document.
- Firefox for Android's share moves materially in Ukraine.
- Movar Audit ships an Android shell for its own reasons, at which point the
  marginal cost of a GeckoView-hosted browser is no longer a browser from scratch.

## Open questions

- Is the Edge Android five-step process still current? Unanswered by Microsoft
  since 2026-03-13; cheapest resolution is to file the Forms request once the Edge
  Add-ons listing is public.
- Does Movar's popup / options / onboarding actually work on Firefox for Android?
  Untested, and we advertise the path today.
- Should the marketing CTA say anything about Edge on Android if we are ever
  admitted to that catalogue? It would be the first case where
  `isAndroidChromium()` is too blunt.

## Sources

Accessed 2026-09-07 unless noted:

- StatCounter, mobile browser share, Ukraine — https://gs.statcounter.com/browser-market-share/mobile/ukraine
- Mozilla, open extensions on Firefox for Android — https://blog.mozilla.org/addons/2023/11/28/open-extensions-on-firefox-for-android-debut-december-14-but-you-can-get-a-sneak-peek-today/
- Firefox for Android, find and install extensions — https://support.mozilla.org/en-US/kb/find-and-install-add-ons-firefox-android
- GeckoView, interacting with web content (built-in extensions) — https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/web-extensions.html
- GeckoView `WebExtensionController` javadoc — https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/WebExtensionController.html
- Edge Android developer requirements — https://github.com/microsoft/MicrosoftEdge-Extensions/issues/529 (opened 2026-03-13)
- Edge extension publishing — https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension
- Edge mobile stable release notes — https://learn.microsoft.com/en-us/deployedge/microsoft-edge-relnote-mobile-stable-channel
- Edge Android extension store, first reporting — https://www.androidauthority.com/microsoft-edge-extensions-android-3535402/
- Edge Beta opens the catalogue (2025-11-11) — https://www.androidauthority.com/microsoft-edge-chrome-extensions-upgrade-3614551/
- Edge Canary, all desktop extensions (2025-10-22) — https://www.windowslatest.com/2025/10/22/microsoft-is-bringing-all-windows-11s-desktop-extensions-to-edge-on-android/
- Chrome for Android has no extensions — https://www.quetta.net/blog/does-chrome-android-support-extensions
- Kiwi Browser discontinued (2025-01) — https://www.alternativeto.net/news/2025/1/kiwi-browser-discontinued-explore-alternatives-for-extension-support-and-security/

## References

- [interface-language-control-feasibility.md](./interface-language-control-feasibility.md) — the OS-side counterpart; Android AccessibilityService and per-app language findings
- [native-shells.md](./native-shells.md) — why the native shells exist, and why the Android one is not an extension container
- [ROADMAP.md](./ROADMAP.md) — store distribution status, including the pending Edge listing
- [../deployment-checklist.md](../deployment-checklist.md) — the Edge first-submission package and the `gecko_android` floor rationale
