# @movar/extension

## 1.5.1

### Patch Changes

- ffb6b07: Fix video clicks being aborted on YouTube search results. Clicking a video on `/results` is a same-document Navigation API push to `/watch`, and the browser fires the location-change event _before_ the navigation commits — while `location.href` still reads `/results`. Movar re-applied its `hl`/`gl` search-params rewrite to that stale URL and `location.replace()`d, clobbering the click, so the page blinked and the video never opened. The re-evaluation after a client-side URL change now waits for the navigation to commit before resetting guards or re-running, so the enforce-mode rewrite can no longer abort an in-flight click.

## 1.5.0

### Minor Changes

- 7a43390: Manage exempt sites (the allowlist) directly from the extension. The options page now shows an "Exempt sites" editor to add, review, and remove domains where Movar takes no action, and the popup gains an "Always skip this site" action that exempts the current site in one click. Exempt domains are normalised to one canonical form — a bare `example.com`, with `www.`/scheme/path stripped — so a site you exempt from the popup is matched consistently by both the content script and the network-level rewrite, and covers its subdomains.

### Patch Changes

- f342354: Hide the popup's "Always skip this site" action on hosts that can't be stored as an exempt domain. A dotless host such as `localhost` or an intranet name is dropped by the allowlist's canonicaliser at the storage boundary, so offering the action there previously reloaded the tab without exempting anything. The popup now gates the affordance on `isStorableDomain`, matching the rule the settings boundary applies.
- 1256077: Re-apply Movar's Google language switch after you solve a Google captcha (the "unusual traffic" / `/sorry` interstitial). Previously the results came back in the blocked language: the page you were returned to still counted as recently-redirected, so Movar treated the captcha detour as a redirect loop and skipped the switch. Movar now recognises the `/sorry` interstitial as an external interruption and re-applies the `hl`/`lr` switch on the search page you land back on.
- 1256077: Hide Google's "Схожі запитання" (People also ask) section heading when every question inside it is concealed, instead of leaving the label dangling over an empty box. The empty-container cleanup now treats a lone section heading as a passive label rather than content that keeps the section alive — while still preserving functional controls beside an emptied list, such as the AI Overview "5 сайтів" sources toggle. "Show everything" brings the whole section back together with its rows.
- d4d4edc: Fix broken on-site search on Ukrainian OpenCart shops (reported on yato.com.ua). Their language switcher renders each option as a `<li>` wrapping a dead-href (`href="#"`) JavaScript switcher anchor, and the extractor keeps the `<li>` wrappers as the picker's classified links. The active-language detector treated the first non-anchor entry as the "you are here" marker, so a Ukrainian page (`<html lang="uk">`) was read as Russian — its first option is `Русский`. The extension then tried to "correct" the page: the site's own `uk` hreflang is self-referential (a no-op), so it followed the Ukrainian switcher anchor, which — with `<base href>` plus `href="#"` — resolves to the homepage, discarding the user's search results. Active-language detection now judges a wrapper element by the lone switcher it contains instead of assuming any non-anchor entry is the active one, so these pickers correctly abstain and detection falls through to `<html lang>`.

## 1.4.3

### Patch Changes

- 893f392: Skip declarativeNetRequest writes whose outcome is already installed. The background resync — which re-runs on every service-worker wake, settings change, pause/snooze flip, and alarm expiry — previously rewrote both dynamic rules (Accept-Language, Google /search redirect) unconditionally. Each sync now reads the installed rules via `getDynamicRules`, deep-compares against the rule it would write, and skips the `updateDynamicRules` call when they already match (including "should be absent and is absent"). Every dynamic-rules write rewrites the browser's on-disk rules store, and on Safari ≤ 26.4 that store can crash the whole browser at launch (WebKit bug 305585) — so redundant writes were exposure, not just waste. Any doubt (failed read, platform-added keys, structural mismatch) falls back to the exact write behaviour shipped before.
- Open a freshly-selected tab in the macOS and iOS companion app at its top. The app's tabs share one scroll position, so switching away from a tab you had scrolled down (a long Detector report, or the Settings list on a small screen) left the next tab opened mid-page. Selecting a tab now resets it to the top — whether by click or arrow key — matching how native tab bars behave.
- Give the toolbar icon a consistent border in every state. The static fallback icon — shown on tabs Movar hasn't evaluated yet, such as a background tab, a still-loading or non-web page, or any tab after the browser suspended Movar's background worker — was the plain brand mark with no status ring, so it looked border-less next to the ringed active, paused, and off looks and could read as a state that had lost its outline. The fallback now wears a neutral resting ring matching the rest of the icon family, so an unevaluated tab always looks intentional. The brand logo used elsewhere (store artwork, the Safari app icon) is unchanged.
- Stop the toolbar icon flashing its red "needs attention" look for a frame on page load. While a tab was still loading, a momentary gap in the hidden-content signal made the icon paint the attention posture before settling into its normal state — a visible red→green flicker on every navigation. Movar now holds the icon steady while a tab is loading and repaints it once the page finishes, so the flash is gone.

## 1.4.2

### Patch Changes

- 7b8ee85: Fix Movar failing to find a site's language switcher at all — automatic switching silently did nothing, with no error — on sites that stamp a `data-lang`/`data-locale` attribute on `<html>` (a common CMS pattern for page-level locale metadata; UMI.CMS shops like ds-electronics.com.ua do this as `data-lang="ru"`). Movar's picker scan seeds candidates on `data-lang`/`data-locale`, meant for individual switcher items, but `<html>` matched too — and being the ancestor of every other element on the page, it crowded out the real switcher from consideration entirely. Movar now ignores `<html>` and `<body>` as switcher candidates; they're never legitimate switcher items themselves.

## 1.4.1

### Patch Changes

- a448116: Fix Movar giving up on Ukrainian shops that run on UMI.CMS and model language as a prefix-less URL for Ukrainian (e.g. `/rele/`) versus `/ru/…` for Russian. These sites advertise a language link that actually 301-redirects straight back to the Russian page; Movar followed it, got bounced, and — as a side effect of the bounce-loop protection — also stopped trying the shop's own, correct on-page language switcher. That switcher was separately going undetected because its link was labeled "UKR" in Latin letters, which language detection previously only recognized in the Cyrillic spelling "укр". Movar now recognizes the Latin label and will still try the shop's own switcher after a broken language link bounces, while still refusing to retry a link that bounces on its own.

## 1.4.0

### Minor Changes

- cc98c70: Reflect Movar's state in the browser toolbar icon instead of always showing the same static mark. The icon now shows distinct looks for: active, actively hiding content on the current page (with a count badge), paused, turned off, exempted for this site, and needing attention. It is driven by the same state the popup renders, so the two can never disagree.

### Patch Changes

- cc98c70: Let the popup's crash screen turn Movar off for the current site. The crash screen previously offered only a Reload button, leaving no way out if reloading didn't fix the crash short of digging through the browser's extension settings. It now offers "Turn off for this site" — and the exemption lasts only until Movar's next update, after which the site is automatically retried, so a since-fixed crash doesn't leave the site disabled forever. The popup's messaging distinguishes this temporary "off until update" state from a permanent exemption set in settings.
- cc98c70: Recolor the concealment curtain (the cover shown over hidden content) from a cool blue-grey palette onto the warm stone tones the rest of Movar uses, so it matches the tooltip and the product's other UI. Purely a color change — same layout and behavior.
- cc98c70: Stop Google's AI Mode chat from forcing a full page reload after every message. Google updates the page's URL after each chat turn without an actual navigation, and Movar mistook that URL change for a mistranslated search and hard-reloaded to correct it — interrupting the conversation. Movar now recognizes normal AI Mode chat activity and leaves it alone, reloading only when the page's language settings are genuinely wrong.
- cc98c70: Stop the MV3 service worker crashing on every page load. The background process crashed with an error on each navigation — surfacing an "Errors" badge in chrome://extensions — because the language-detection library touched the page's DOM from a background context that has none. It was most noticeable on sites where Movar doesn't otherwise act, since the console error was the only sign anything was wrong. Language detection behaves exactly as before.
- cc98c70: Rebuild the popup's crash screen to look like part of Movar. When the popup failed to render, it showed a cramped, broken-looking error panel with a wrapping heading and clipped text; it now shows the same brand bar as the rest of the popup, a muted "unexpected error" message, and a reload button, properly sized to fit.
- cc98c70: Compact the popup's language-priority display from a row of pills into one neutral text line (e.g. "Priority: Ukrainian › English"). The old pills always highlighted the first entry regardless of which language was actually active on the page, which read as a status indicator it wasn't; the plain line drops that false signal and frees up popup space.
- cc98c70: Remove the redundant "Movar" logo bar from the popup and most tabs of the macOS and iOS companion apps — it only repeated context the OS already shows (the toolbar icon just clicked, or the app's window title). The popup now opens straight onto the status view, and the affected screens gain back roughly 44–50px of space. The iOS app's About tab is unchanged.
- cc98c70: Fix dark-mode styling of the tooltip shown on a language-switcher link that survived filtering. In dark mode the tooltip card blended into the page background and its "Show hidden options" button rendered in light-mode colors, making it nearly invisible; it now has proper dark styling matching the rest of Movar's dark-mode UI.
- cc98c70: Unify text styling — font sizes, weights, spacing, and letter-spacing — across the extension and companion apps onto one shared type scale, replacing scattered one-off values. Nearly invisible day to day; the one visible change is the Safari host app's Settings tab, whose text sizes shift slightly to match the rest of the app.

## 1.3.0

### Minor Changes

- e3fea6a: Rewrite Google search URLs BEFORE the request leaves the browser, via a `declarativeNetRequest` dynamic redirect rule (Chrome/Firefox).

  The `/search` language rewrite (`hl`, pipe-joined `lr`, plus stripping Google's opaque session tokens `sei`/`gs_lcrp`/`aqs`/`rlz` and the enumerated `gs_*` family) previously ran only in the content script — after the raw entry request had already been served. That cost a visible double load on every omnibox/homepage search, and the raw request, carrying Chrome's pre-rewrite `gs_lcrp` context token, could seed the server-side "pinned candidate set" that intersects with the `lr` filter down to zero organic results. The new dynamic rule (id 2, generated from the same site-rule gates and regenerated on every settings/pause/snooze change like the Accept-Language rule) redirects the navigation network-side with `queryTransform`: one page load per search, and the poisoned request never reaches Google. The transform is idempotent (same-URL redirects are skipped, pinned by e2e), `/maps` and q-less URLs never match, and the content-script rewrite stays as the fallback for Safari (excluded: known `queryTransform` bugs), denied host permission, and prefix-scrubbing new `gs_*` tokens; the empty-SERP retry keeps covering pins seeded by vectors the rule can't see.

- 623abba: Pipe-join Google's `lr` parameter across every preferred language. A user whose priority is `[uk, en]` now ends up with `lr=lang_uk|lang_en` on `/search`, so results can come from either language. Previously only the top preference reached `lr`, which made English speakers with Ukrainian as their #1 lose every English result they'd otherwise expect.

  `hl` continues to take the top preference only — it's the UI + AI Overview language, a "pick one" knob.

  Adds an optional per-param `joinPreferences?: boolean` field to the `searchParams` strategy. The Google rule sets it on `lr`; `hl` keeps the existing single-value behaviour. Other rules (Bing `setlang`, DDG `kl`, YouTube `hl`/`gl`) are unchanged — none of them have a documented OR-join syntax.

  `applyStrategy` now accepts `LanguageCode | readonly LanguageCode[]` as its target; single-value callers (tests, the hreflang fallback) keep working unchanged.

  Policy assertion: the rewrite is driven only by the user's stored preferences (already `ru`-free via `enforceLockedLanguages`). Browser locale and inbound URL state — including a stale `hl=ru&lr=lang_ru` from a Google referrer — are overwritten, never inherited.

- b631c62: Make the Google SERP content filter actually hide Russian on the current layout, and extend it to "People also ask".

  The extractor matched only `div.g` / `div[data-snhf]`, which hit zero nodes on today's Google markup — so Russian organic results and the "Схожі запитання" (People also ask) questions leaked through unfiltered. Organic results are now found by a layout-stable anchor (each `#rso` result `<h3>` climbed to its enclosing `data-hveid` card) instead of obfuscated styling classes (`div.tF2Cxc`, …) that rotate and silently stop matching. No rotating-class fallbacks are kept — a stale fallback is just a deferred silent-miss; the fix for an uncovered layout is another reliable anchor. People-also-ask questions are filtered per row (`div.related-question-pair`), so a Russian question is hidden while a Ukrainian one in the same block stays. Nested result cards (sitelinks) collapse to the outermost container so a result is never hidden twice.

  The content filter now also runs on any `google.*` ccTLD (matched structurally on the SERP shape), not just a fixed seven-domain allowlist.

### Patch Changes

- 5447501: Center the content curtain's pill within the concealed card (both axes), and render the secondary "Hide all" action as borderless text so the hierarchy against the primary "Show" button reads more clearly. Tall blocks still top-anchor the pill so a viewport-collapsed block (e.g. Google's AI Overview) keeps the reveal control on screen.
- 523c2b3: Keep the conceal curtain over content a site streams in after it attaches (e.g. Google's AI Overview).

  A cover-mode curtain only blurred and made `inert` the children that existed at the moment it attached. Google's AI Overview declares its block early — so Movar can conceal it before the answer's language is even visible — then streams in its header, "show more" and the ⋮ overflow menu afterward. Those late nodes escaped the curtain: they stayed crisp and focusable on top of the overlay and occluded the curtain's own "Show" button. The curtain now watches its target with a `MutationObserver` and applies the same aria-hidden + inert + blur to any child added after attach (leaving its own host reachable, and disconnecting the observer on detach).

- 2c30a20: Collapse the content-hidden curtain to a single eye symbol at its smallest size. The cover pill's responsive collapse gains a floor tier: on a target too small for even the icon plus one action (short and ≤132px wide), it folds down to just the slashed-eye mark, so a tiny concealed element still shows a clear "hidden" marker instead of an overflowing or clipped pill.
- d77acbd: Make the "content hidden" curtain responsive so it works over inline and short targets, not just roomy block cards.

  Cover mode positioned the curtain with `position:absolute; inset:0` and clipped it with `overflow:hidden`, which only works when the target is a block box. Over a bare `display:inline` target the overlay got a 0-width containing block (and `overflow` is a no-op on inline boxes), so the pill escaped its target; over short block rows (e.g. Google's «Схожі запитання» / "People also ask") the fixed-height vertical pill overflowed and several pills piled into one strip. Inline targets are now promoted to `inline-block` so the overlay has a content-sized box to fill and clip (kept inline in the flow, host still a child of the target), and the pill is a size-query container that collapses to a single-line bar — shedding the description, then the secondary action, then the title — as the target gets short or narrow.

- 5447501: Keep the content curtain's "Show" reveal action reachable as the pill collapses on short or narrow cards. "Show" is now the pill's primary action, so it survives the responsive collapse (which sheds the secondary "Hide all" first) instead of being dropped alongside it at the very first step — previously a short or narrow concealed card could end up blurred with no in-place way to reveal it.
- 2fafb56: Keep the conceal curtain's reveal control visible on tall blocks (e.g. Google's AI Overview).

  The cover curtain centered its reveal pill in the target's box. Sites collapse tall blocks to a short preview — Google's AI Overview shows about one screenful with a "show more" while the concealed element stays 700–1300px tall in the DOM — so the centered pill landed in the collapsed-away region and was clipped out of view. The result was blurred content with no reachable "Show" control at any scroll position. The pill is now anchored to the top of the block, keeping it in the visible band regardless of the block's full height. (Complements the short/inline-target responsiveness added alongside it.)

- 235ee2f: Stop a `lang`-declared Google result (product/shopping cards, whose title is a `role="heading"` div, not an `<h3>`) from surviving on leaked interface-language chrome. These cards are recovered by Google's own per-result `lang` label and folded into the organic bucket — but they were still run through the whole-card fallback that widens the classification sample when the title+snippet allow-list comes up short, and that fallback re-admits Google's Ukrainian UI chrome (the "Люди також шукають" pivots, the store-review prompt, the rich-annotation row). A confident interface-language read then overrode the reliable `lang="ru"` declaration and the card was kept.

  Two live shapes triggered it, both because the allow-list under-captures the result's own text: an inline thumbnail row occupies `data-sncf="1"` (the snippet's usual slot) and shifts the Russian snippet to `data-sncf="2"` — which the fallback prunes as "chrome" — so the sample became pure chrome; and a short snippet (under the fallback's min-chars bar) let the pivots outweigh it. Both classified as Ukrainian and the `ru` card slipped through.

  Declared cards now classify from their title+snippet allow-list ALONE, with no whole-card fallback — the same rule sponsored ads and AI-source cards already follow, and the behaviour the module already documented as its intent. When the allow-list is empty or short, the card falls to its `lang` declaration (which the fused gate decides on), never to leaked chrome; a card whose snippet the allow-list does capture still corrects a genuine mislabel via that text.

- 479e616: Add the empty-SERP detect-and-retry fallback for Google (docs/google-search-url-params.md, finding #1). A poisoned omnibox entry request (opaque `gs_lcrp` token, served before the rewrite can redirect away) can pin Google's server-side session so that even a fully cleaned URL with correct `hl`/`lr` intersects down to zero organic results for a short hot window — URL stripping (`sei`, `gs_lcrp`, the `gs_*` scrub tier) cannot reach that state. The content runtime now detects the residual case after the page settles — filter param `lr` present, `#search` results area rendered, zero `a h3` organic titles (a DOM count, no localized "About 0 results" parsing) — and retries the same query exactly once without `lr`, keeping `hl` so the interface language holds. The retry is once-per-URL via the session-scoped loop guard: the empty URL is marked so it never re-retries (a legitimately-empty query stays put — the retry itself is the test), and the retried URL is pre-marked so the enforce rewrite doesn't re-add `lr` and bounce back. Each retry logs a `search-retry` correction event, visible in the options Insights dashboard.
- b5688fa: Add a second, non-navigating "scrub" tier to the `searchParams` strategy and use it on the Google rule: `scrubPrefixes: ['gs_']` and `scrubParams: ['aqs', 'rlz']` are dropped whenever a rewrite navigation is already happening, but — unlike `stripParams` — never trigger a navigation by themselves. Entry URLs (omnibox, homepage form) never carry `lr`, so they always rewrite and always get scrubbed; SERP-box refinements that carry `gs_lp` with `hl`/`lr` already correct stay put, costing zero extra page loads. This future-proofs against the bug class behind the `sei` and `gs_lcrp` fixes (opaque pre-rewrite session tokens pinning results against the `lr` filter) without an allowlist's silent-breakage risk. Audit, live-test evidence, and the vetting method are documented in docs/google-search-url-params.md.
- 03e0b3a: Fix content filtering (concealment) silently not working on iOS/Safari.

  The dynamic capability chunks the content script imports at runtime via `runtime.getURL` — `features/conceal.js`, `features/curtain-ui.js`, and the per-site `models/*.js` — were emitted into the Safari build output and rsynced onto disk, but `features/` and `models/` were never registered as folder references in `Movar.xcodeproj`. Xcode only bundles referenced folders, so both directories were dropped from the built `.appex`: on-device, `import(runtime.getURL('features/conceal.js'))` 404'd and `capability-loader`'s `.catch(() => null)` turned it into a silent no-op, leaving concealment dead on iOS while the Accept-Language language switch (a background DNR rule, not a content-script chunk) kept working. Register `features/` and `models/` as folder references in both extension targets, and add a post-sync guard to `sync-safari-resources.mts` that fails the build if any emitted output directory lacks a folder reference, so the drift can't recur unnoticed.

- 275aa1f: Fix the macOS wrapper app opening at a too-small, non-resizable window.

  The Safari host app's macOS window used the stock Apple extension-template geometry — a fixed 425×350 content rect with a `titled + closable` style mask — so the three-tab host UI (fixed top brand bar, scrolling Settings panel, fixed bottom tab bar) was clipped, and the window could be neither resized nor minimised. Enlarge the default to 480×700 and add `resizable` + `miniaturizable` to the window style mask in `Main.storyboard`; pin `contentMinSize` to 380×480 in `ViewController.viewWillAppear()` so a resize can't shrink it below usability. macOS-only (`#if os(macOS)`); iOS is unaffected. The window keeps `restorable="NO"` with no frame-autosave, so it opens at the new size on every launch.

- eba3490: Strip Google's `gs_lcrp` query parameter on `/search` URL rewrites, alongside the existing `sei` strip. `gs_lcrp` is an opaque per-omnibox-session context blob Chrome attaches before this rewrite runs; left in place, it pinned Google's serving to a candidate set computed under the pre-rewrite (often Russian-leaning) language context, and intersecting that pinned set with the `lr` filter could produce zero organic results for an otherwise healthy query. Confirmed by direct testing: removing only `gs_lcrp` took one affected query ("Реле напруги") from 0 results to ~1M, with `hl`/`lr` unchanged.

  Previously this looked like a language-classifier gap and was documented as an accepted trade-off; it wasn't — `lr=lang_uk` and even the joined `lr=lang_uk|lang_en` both return results once `gs_lcrp` is gone.

- Updated dependencies [4a87fd1]
- Updated dependencies [623abba]
- Updated dependencies [623abba]
  - @movar/page-content@0.0.1
  - @movar/host-match@0.1.0
