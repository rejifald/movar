---
summary: Why the Google /search rewrite strips some query params and deliberately keeps the rest — the audit, the live-test method, the blocklist-vs-allowlist decision, and the pre-request DNR prevention layer.
---

# Google search URL parameters: what we strip, what we keep, and why

The Google `/search` rewrite sets `hl` (interface language) and `lr`
(result-language filter) and drops a small set of opaque session tokens. It
runs at two layers: a `declarativeNetRequest` redirect rule that rewrites the
URL **before the request leaves the browser** (`apps/extension/src/lib/dnr.ts`,
see "The prevention layer" below), and the content-script fallback rule
(`apps/extension/src/sites/google/index.ts`) that corrects any request the DNR
layer couldn't touch. This document records the parameter audit behind the
`stripParams`/`scrubParams` configuration, the method used to test a
suspected parameter, and why the rule deliberately stays a **blocklist**
rather than an allowlist. It exists so the next parameter bug starts from
evidence instead of re-deriving all of this.

## The bug class

Google attaches opaque, session-scoped tokens to search URLs. Two of them
are confirmed to have corrupted rewritten searches:

- **`sei`** — a session-event token that carried prior-session locale bias
  forward, overriding a freshly set `hl`/`lr`.
- **`gs_lcrp`** — an omnibox-session context blob Chrome attaches _before_
  the extension's rewrite runs. Left on the rewritten URL, it pinned
  serving to a candidate set computed under the pre-rewrite language
  context; intersecting that pinned set with the `lr` filter produced
  **zero organic results** for an otherwise healthy query. Removing only
  `gs_lcrp` took the query from 0 to ~1M results with `hl`/`lr` unchanged.

The mechanism, generalized: _a token minted under one language context +
a hard result filter applied afterwards = an empty or skewed intersection._
Interface-only parameters can't trigger it; it needs a forcing filter like
`lr`. That is also why the Bing and DuckDuckGo rules carry no strip lists:
neither `setlang` nor `kl` force-filters results, so there is nothing for a
stale token to catastrophically intersect with. Verified live: Bing's own
pagination preserves `setlang` and mints only `FPIG`/`FORM`/`first`
(impression GUID, surface tag, page offset), its homepage form mints
`form=QBLH`, and the result count reads identical with and without those
entry tokens; DuckDuckGo's entry mints only `ia=web`, and its search form
carries `kl` forward on its own. Neither engine exposed a token-bias
surface worth stripping.

## Key empirical findings

All findings below come from paired same-query comparisons in a real,
signed-in desktop browser with the extension disabled (adding one parameter
at a time to a clean `q` + `hl` + `lr` baseline URL and reading Google's
result-count line). Fetching SERPs outside a real browser session gets an
anti-automation page and proves nothing.

1. **Token pinning is ephemeral — and lives server-side.** The exact
   `gs_lcrp` value that deterministically zeroed a query read clean ~24
   hours later, and a fresh token from a healthy session read clean
   immediately. Sharper still: a zero-result SERP was later observed on a
   URL carrying **no** strippable token at all (post-strip, `hl`/`lr`
   correct), and that exact URL read ~1M in the same browser minutes later.
   The pinned candidate set binds to live session state on Google's side —
   seeded by the poisoned entry request, which is served _before_ any
   client-side rewrite can redirect away — and decays on its own (minutes
   to hours). Two practical consequences: a clean reading can **convict but
   never acquit** a parameter (it only shows that value, that session, that
   day was harmless), and URL stripping has a **ceiling** — it prevents the
   token from re-attaching the pin on subsequent requests, but cannot stop
   the hot-window case where the session itself still carries it. The
   entry-request seeding vector itself is now closed network-side by the
   pre-request DNR rewrite (see "The prevention layer" below), which keeps
   the poisoned request from ever reaching Google where the platform
   supports it. The durable fix for whatever residue remains is
   detect-and-retry: an empty SERP with `lr` present retried once without
   `lr` — implemented in the content runtime
   (`apps/extension/src/lib/empty-results-retry.ts`, configured via
   the Google rule's `emptyResultsRetry`: a settled page with a rendered
   `#search` area and zero `a h3` organic titles navigates once to the same
   query minus `lr`, guarded by the per-tab loop-guard marker).
2. **Entry URLs never carry `lr`.** Omnibox entries carry
   `gs_lcrp`/`sourceid`/`ie`/`oq` (entity suggestions add `gs_ssp`);
   homepage-form entries carry `ei`/`iflsig`/`ved`/`uact`/`sxsrf`/
   `sca_esv`/`gs_lp`/`sclient`/`source=hp`. Neither entry surface emits
   `lr`, so the rewrite always fires on entry — anything we want to drop can
   ride that navigation for free.
3. **SERP-internal navigations preserve `hl`/`lr`.** Pagination and
   search-box refinements carry the language params over (Google even
   mirrors `lr` into `tbs=lr:...` on internal navigations), so the rewrite
   correctly no-ops there — zero added page loads. Internal URLs also carry
   their own token set (`ei`, `ved`, `sca_esv`, `sxsrf`, viewport hints, and
   new tokens that appear without notice), and refinements carry a fresh
   `gs_lp` — minted under the already-corrected context.
4. **Candidates tested clean** (subject to the acquittal caveat above):
   `ei`, `iflsig`, `ved`, `uact`, `sxsrf`, `sca_esv`, `gs_lp`, `gs_ssp`
   (both matching and mismatched entity), and `pws=0` — isolated and in
   full combination.
5. **The user-facing parameter surface churns.** `num` (results per page)
   stopped working in September 2025; `udm` verticals appeared in 2024
   alongside the older `tbm`; `pws=0` became a Google-emitted control
   ("results without personalization") in late 2024. None of this is
   formally documented — the working set is community-tracked.

## Blocklist, not allowlist

An allowlist ("keep only known-good params, drop the rest") looks like it
closes the bug class permanently. It fails on three counts:

- **Silent breakage.** An allowlist that misses a user-facing parameter
  breaks it _silently_: dropping `udm`/`tbm` bounces the user out of their
  vertical, dropping `tbs` clears their date filter, dropping `start`
  resets pagination, dropping `pws=0` silently re-enables personalization
  the user opted out of. Finding #5 guarantees the list goes stale. A
  blocklist gap fails _loud_ — zero results, a user notices and reports it,
  which is exactly how both confirmed tokens were found.
- **Navigation churn.** The rewrite navigates whenever the rebuilt URL
  differs from the current one. Internal SERP URLs always carry parameters
  outside any allowlist (finding #3), so an allowlist rewrite would
  double-load every pagination, tab switch, and refinement.
- **It protects the wrong URLs.** Dangerous tokens are minted _before_ the
  rewrite runs — on entry URLs, which always rewrite anyway (finding #2).
  Post-rewrite internal URLs mint their tokens under the corrected context.

## The two-tier design

- **`stripParams`** (`['sei', 'gs_lcrp']`) — confirmed-harmful tokens. Their
  mere presence forces a rewrite, so a stuck URL is cleaned even when
  `hl`/`lr` already match (the exact recovery path the `gs_lcrp` fix
  needed). This trigger costs a navigation wherever the token appears, so
  the bar for entry is _confirmed live evidence_.
- **`scrubPrefixes`/`scrubParams`** (`['gs_']`; `['aqs', 'rlz']`) —
  hygiene tier. Dropped only when a navigation is already happening; never
  triggers one. Because entry URLs always rewrite, scrubs reliably cover
  the URLs where pre-rewrite tokens are born, at zero added page loads —
  a refinement URL carrying `gs_lp` with correct `hl`/`lr` stays put.
  `gs_*` is the suggest/omnibox session-state namespace both `gs_lcrp` and
  `gs_lp`/`gs_ssp` belong to; `aqs` is `gs_lcrp`'s predecessor (Chromium
  commit `e2ad407`, 2022: "this effectively replaces aqs with gs_lcrp",
  rolled out gradually via Finch — so older builds still send `aqs`);
  `rlz` encodes install-time language cohort, sent by desktop Chrome only
  for brand-tagged installs but by mobile Chrome always.
  None of the scrubbed params is confirmed harmful — the tier is cheap
  insurance against the confirmed class.

Never strip or scrub user-facing state: `q`, `oq`, `start`, `udm`, `tbm`,
`tbs`, `as_*`, `safe`, `nfpr`, `filter`, and especially `pws` — `pws=0` is
an explicit user choice that stripping would silently undo.

## AI Mode chat: a strip-listed token that never stays stripped

Google's AI Mode (`udm=50`) is a chat surface, not a one-shot SERP: every
follow-up turn calls `history.replaceState` to rewrite the address bar with
Google's own bookkeeping state — confirmed live by watching `window.location`
across turns with no extension installed. `sei` (the confirmed-harmful token
above) is part of that bookkeeping and reappears on **every single turn**,
even though it never changed value turn-to-turn in the observed session (only
an accompanying opaque token, `mstk`, grew each turn).

That reappearance used to be catastrophic. `stripParams`'s presence-alone
trigger (see "The two-tier design") doesn't distinguish "a stale token that
survived from a poisoned entry request" (the case it exists for) from "the
page's own live script re-asserting a token it always carries." The
content-script rule re-evaluates on every `wxt:locationchange`
(`content-runtime.ts`'s `handleLocationChange` — needed so an SPA-routed
rewrite target, e.g. YouTube's results page, is still enforced after route
changes the MutationObserver can't see). Combined with `sei` reappearing every
turn, this forced a real `location.replace` on every single chat turn — a
genuine navigation that discards the in-page chat state, which is what a user
experiences as the extension "crashing" and the page refreshing repeatedly
while chatting. The loop-guard (`lib/loop-guard.ts`) cannot catch this the way
it catches YouTube's `bare → params → bare` oscillation: that guard matches
the exact URL redirected FROM, and AI Mode's `mstk` grows every turn, so no
two turns ever produce the same "from" URL for the guard to recognize.

The fix: only the **first** enforce-mode evaluation for a given page/pathname
lineage may treat a strip-listed token's mere presence as a trigger
(preserving the `gs_lcrp` stale-session recovery this doc opens with).
`content-runtime.ts` tracks this with a module-level `enforceCheckedOnce`
flag (reset alongside the loop guard on a genuine pathname change) and passes
its inverse down as `StrategyContext.ignoreStripParamsForTrigger`
(`lib/strategy.ts`). Every repeat tick on the same pathname instead asks "do
`hl`/`lr` themselves already match the target, ignoring strip/scrub params
entirely?" — if so, it's a no-op regardless of what Google's own script keeps
re-attaching; a genuine `hl`/`lr` drift still forces a rewrite unconditionally.
Regression coverage: `strategy.searchParams.test.ts`'s
`ignoreStripParamsForTrigger` block (leaf-level) and `content.test.ts`'s
"does not force a fresh navigation on every same-path AI Mode chat turn"
(full orchestration, three simulated turns).

## The prevention layer: pre-request DNR rewrite

The content-script rewrite has a structural blind spot: it runs only after
the browser has already **served** the raw entry request. That costs one
wasted page load per entry search (the visible double-load), and — worse —
the raw request, carrying Chrome's freshly minted `gs_lcrp`, is exactly what
seeds the server-side pin of finding #1. URL hygiene after the fact cannot
un-send it.

Layer 0 closes that gap: a `declarativeNetRequest` dynamic redirect rule
(`apps/extension/src/lib/dnr.ts`, `buildGoogleSearchRedirectRule`) rewrites
the URL inside the browser's network stack, before the request leaves. One
render per search, and the poisoned request never reaches Google.

- **Condition** — derived from the same gates the content-script rule uses:
  every `google.*` ccTLD (`GOOGLE_REQUEST_DOMAINS` in `@movar/host-match`,
  generated from the same suffix set as `isGoogleHost` and parity-tested
  against it), a `/search` path prefix, a present `q` param (RE2
  `regexFilter`; `oq=` cannot satisfy it), `main_frame` only. `/maps` and
  q-less surfaces never match. Allowlisted and snoozed hosts are excluded,
  and the rule is regenerated from `settings.priority` on every settings /
  pause / snooze change, exactly like the Accept-Language rule.
- **Action** — `queryTransform`: `addOrReplaceParams` writes `hl` (top
  preference) and the pipe-joined `lr` (`lang_uk|lang_en`); `removeParams`
  drops the strip tier, the scrub tier, and the enumerated `gs_*` family.
  The strip-vs-scrub distinction **collapses at this layer**: a DNR redirect
  costs no page load, so there is no navigation trigger to price — both
  tiers ride `removeParams`. What cannot be expressed is a _prefix_ scrub
  (`removeParams` is exact-name only), so the known `gs_*` members are
  enumerated (`GS_FAMILY_PARAMS` in the Google site adapter) and a novel
  family member is still caught by the content-script prefix scrub.
- **Idempotence / loop safety** — the transform is a fixed point after one
  application, and browsers skip a redirect whose target equals the request
  URL (Firefox documents this verbatim; for Chrome it is pinned empirically
  by the e2e suite). An already-clean SERP-internal navigation (pagination,
  refinement) is a matched-but-skipped no-op.
- **Platforms** — Chrome and Firefox. Safari is compile-time excluded: its
  DNR nominally accepts `transform` but has verified-open `queryTransform`
  bugs, and a wrong network-side rewrite is worse than the fallback. The
  rule also silently cannot act until the user grants host access (the
  onboarding grant) — the same precondition the content script has.
- **The fallback stays** — the content-script `searchParams` rule is
  layer 1: it covers Safari, denied-permission states, and any request DNR
  never saw, and it must compute **byte-identical** URLs to the DNR
  transform (pinned by a parity test in `dnr.test.ts`) or it would
  re-navigate pages layer 0 already fixed. Layer 2 is the empty-results
  retry (finding #1) — still needed because a pin can be seeded by vectors
  layer 0 never sees: solving a Google **captcha** (which leaves a
  degraded-trust session state), another device on the same Google session,
  pre-install browsing, or a non-entry surface.
- **Layer 2 must switch layer 0 off for its own navigation.** The retry
  escapes a pin by navigating to the same query with `lr` dropped — but that
  navigation is a `/search?q=` `main_frame` request, exactly what layer 0
  matches, so layer 0 would re-add `lr` before it left the browser (it can't
  see the content-script loop-guard that suppresses the layer-1 rewrite) and
  bounce the retry straight back to the pinned zero-result URL. So the retry
  first messages the background to **suspend the redirect rule**
  (`suspendGoogleSearchRedirectRule`, via `movar:suspendGoogleRedirect`),
  then navigates; a timed alarm re-installs the rule ~30s later (self-healing
  across a closed tab or a slept worker, which a `setTimeout` would not
  survive). During a run of failing searches the rule stays down and layers
  1–2 carry Google, and it returns once searches recover. Anyone editing
  layer 0's match condition or the retry must preserve this handshake —
  without it the retry is a silent no-op against the network layer.

Verification lives in `apps/e2e/src/offline/google-search-dnr.spec.ts`: the
installed rule's transform, Chrome's own matcher accepting entry URLs and
rejecting `/maps` / q-less / non-Google URLs, a mocked navigation proving the
raw omnibox URL never reaches the network (exactly one, already-rewritten
request), and the same-URL-skip pin.

## Vetting a suspected parameter

1. Use a real, signed-in desktop browser. Disable the extension for the
   test so its own rewrite doesn't confound the comparison.
2. Establish a baseline: `q=<query>&hl=<code>&lr=lang_<code>` → record the
   result-count line. Re-run it alongside every batch; serving drifts.
3. Capture a **fresh, same-session** value of the suspect (type the query
   at the entry surface that mints it; copy the URL). Day-old or foreign
   values are worthless — see finding #1.
4. Add only the suspect to the baseline URL and compare counts. An
   order-of-magnitude drop or zero convicts it; a clean reading acquits
   only that value, that session, that day.
5. URL forensics: parameters the extension appended sit at the _end_ of the
   query string; parameters Google emitted sit mid-URL. This tells you
   whether a rewrite fired on any captured URL.
6. Convicted → `stripParams` (with an integration test mirroring the
   existing `gs_lcrp` ones). Same namespace/class as a convicted token but
   unproven → scrub tier. User-facing → keep, always. The DNR rule's
   `removeParams` is derived from `stripParams` + `scrubParams`, so a new
   _exact-name_ entry reaches the prevention layer automatically — but a
   token matched only by a `scrubPrefixes` prefix must also be added to
   `GS_FAMILY_PARAMS` (or a sibling enumeration) by exact name, because
   `queryTransform.removeParams` has no prefix matching.
