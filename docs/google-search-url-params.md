---
summary: Why the Google /search rewrite strips some query params and deliberately keeps the rest — the audit, the live-test method, and the blocklist-vs-allowlist decision.
---

# Google search URL parameters: what we strip, what we keep, and why

The Google site rule (`apps/extension/src/sites/google/index.ts`) rewrites
`/search` URLs to set `hl` (interface language) and `lr` (result-language
filter). This document records the parameter audit behind the rule's
`stripParams`/`scrubParams` configuration, the method used to test a
suspected parameter, and why the rule deliberately stays a **blocklist**
rather than an allowlist. It exists so the next parameter bug starts from
evidence instead of re-deriving all of this.

## The bug class

Google attaches opaque, session-scoped tokens to search URLs, and Chrome
adds a legible attribution param that can misfire the same way. Three of
them are confirmed to have corrupted rewritten searches:

- **`sei`** — a session-event token that carried prior-session locale bias
  forward, overriding a freshly set `hl`/`lr`.
- **`gs_lcrp`** — an omnibox-session context blob Chrome attaches _before_
  the extension's rewrite runs. Left on the rewritten URL, it pinned
  serving to a candidate set computed under the pre-rewrite language
  context; intersecting that pinned set with the `lr` filter produced
  **zero organic results** for an otherwise healthy query. Removing only
  `gs_lcrp` took the query from 0 to ~1M results with `hl`/`lr` unchanged.
- **`oq`** — Chrome's "original query" (what was typed in the omnibox before
  a suggestion was accepted). Unlike the two above it is legible, not opaque,
  and normally harmless — it mirrors a prefix of `q`. But a wrong-keyboard-
  layout entry poisons it: starting `реле напруги` under a Latin layout
  autocompletes the Cyrillic query while `oq` keeps the physical keys typed,
  `htkt`. That stray Latin original-query is a pre-rewrite language signal;
  once `lr=lang_uk|lang_en` filters results it intersects to **zero**.
  User-reported and reproduced by hand — the SERP fills in the moment `oq` is
  dropped, `hl`/`lr` unchanged. It is a strip rather than kept (see below)
  because its healthy-case value is near-nil — it drives no result set or
  correction UI — so the empty-SERP risk wins.

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
   durable fix for the residual case is detect-and-retry: an empty SERP
   with `lr` present retried once without `lr` — implemented in the content
   runtime (`apps/extension/src/lib/empty-results-retry.ts`, configured via
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

- **`stripParams`** (`['sei', 'gs_lcrp', 'oq']`) — confirmed-harmful tokens.
  Their mere presence forces a rewrite, so a stuck URL is cleaned even when
  `hl`/`lr` already match (the exact recovery path the `gs_lcrp` fix
  needed — and the reason `oq` is a strip, not a scrub: its poisoned URL
  arrives already at target, `oq` riding a correct `hl`/`lr`, where a
  non-navigating scrub would see nothing to do and leave the SERP stuck at
  zero across reloads). This trigger costs a navigation wherever the token
  appears, so the bar for entry is _confirmed live evidence_.
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

Never strip or scrub genuinely user-facing state: `q`, `start`, `udm`,
`tbm`, `tbs`, `as_*`, `safe`, `nfpr`, `filter`, and especially `pws` —
`pws=0` is an explicit user choice that stripping would silently undo.
(`oq` was on this list until a wrong-layout value was convicted of the
empty-SERP bug; it moved to `stripParams` because, unlike the params here,
it drives nothing the user sees — see the bug-class section above.)

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
   unproven → scrub tier. User-facing → keep, always.
