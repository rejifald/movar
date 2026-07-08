---
summary: Catalogue of recurring bug *classes* — recognise the signature, apply the guard.
---

# Pitfalls & recurring issue signatures

A catalogue of bug **classes** we've hit (or expect to hit) more than once. Unlike a
changelog of individual fixes, each entry describes a _pattern_: how to recognise it,
where it bites, why it happens, and the durable guard that prevents the whole class.

**Add an entry** when a fix turns out to be an instance of a general pattern rather than
a one-off — especially if the failure was silent (green tests, wrong behaviour in the wild).

**Each entry must be self-sufficient.** A reader should be able to **identify** the bug and
**tackle** it from the entry alone — without following any link, opening a PR, or reading the
implementation. Code paths are pointers to _where_ the pattern lives, never a substitute for
explaining _what_ it is and _how_ to fix it. Write the fix as a recipe, not a reference.

**Per-entry template**

- **Signature** — recognise it from the _symptom_, before you know the cause.
- **Blast radius** — every place in the codebase where the pattern can occur.
- **Root cause** — the underlying mechanism, stated in full.
- **Guard** — a concrete, implementable recipe that kills the class, not just the instance.
- **Instances** — concrete sightings (in-repo file + symbol; describe each self-containedly).
- **Review checklist** — what to ask when touching the blast-radius code.

---

## 1. Language detection fed non-content text ("sample contamination")

> _Tags: language-detection, content-filter, page-content, lang-detect_

**Signature.** A foreign-language item is **kept** (not hidden, not switched) even though a
human plainly reads it as the blocked language. Tell-tales: the item is **short**, and/or it
sits among host UI rendered in the _keep_ language (a "translate" link, store ratings, view
counts, badges). Unit tests stay green because synthetic fixtures use clean, single-language text.

**Blast radius.** Anywhere text is extracted and handed to a language classifier:

- Per-card content filtering — each site extractor serialises a card's text, which is then
  classified to decide hide/keep.
- Page-language detection's text fallback — a whole-page visible-text sample classified to
  decide a redirect, used only when the structural signals (active picker entry, `<html lang>`,
  subdomain, path, self-hreflang) all abstain. Those structural signals carry no free text and
  are immune; only the text fallback is exposed.
- Any new extractor, detector, or text-serialiser added later.

**Root cause.** The serialised sample includes text that is **not the item's own language**:
host-injected UI chrome rendered in the user's UI language (a "Translate this page" link, a
store-rating/delivery annotation row), platform-translated titles, boilerplate, nav/footer.
The classifier is **count-based and provenance-blind** — it cannot tell the site's content from
the platform's chrome — so a couple of keep-language tokens outvote a short blocked-language
body. Russian running text is especially exposed: its distinctive-vs-Ukrainian letters
(`ы`/`э`/`ъ`/`ё`) are rare, so a short Russian snippet may carry only one, which two words of
injected Ukrainian chrome cancel out — flipping the verdict to "Ukrainian, keep".

**Guard — classify the content, not the container.**

1. Serialise an **allow-list** of the item's _own_ content (its title + main snippet/body),
   **not** the whole element. Because an allow-list is a closed set, any chrome the host injects
   _later_ (new annotation rows, badges, links) is excluded automatically — there is no
   ignore-list to grow. This is the opposite of a "strip known chrome" block-list, which is an
   open set: every new chrome type is a silent miss until someone notices and adds a selector.
2. If the allow-list comes up short (a content anchor is missing or rotated, so you'd be
   classifying a bare title), **fall back** to the whole element with known-chrome subtrees
   pruned — but treat this as the rare safety net, not the default path.
3. Anchor every selector on **durable** signals — stable `data-*` attributes, ids, semantic
   tags. **Never** obfuscated/minified styling classes: they rotate without notice, so a
   class-based selector silently matches zero nodes after a redesign while unit tests stay green.
4. For a whole-page detector with no per-item anchor, scope to landmarks (`<main>`/`<article>`),
   treat the verdict as **coarse**, and never let it drive an irreversible action without a guard
   (loop-guard, mode gate).
5. **Validate with a real saved page**, never a synthetic single-language fixture — the bug only
   appears once real host chrome is in the sample. The versioned corpus of trimmed real captures
   lives at **`packages/page-content/fixtures/`**, one subdirectory per verdict surface
   (`google-serp/`, `youtube/`, `pickers/`, `redirect-sites/`). Each `NAME.fixture.html` has a
   sibling `NAME.expected.json` manifest pinning the fixture **shape** (durable selector → count)
   and the expected per-node verdict (`hide`/`keep` + `fromLang`). The fs-backed harnesses live in
   the extension app (which has the node types): `apps/extension/src/lib/corpus-content.test.ts`
   runs the extractor + `classifyBySnippet` over the content surfaces, and
   `apps/extension/src/lib/corpus-pickers.test.ts` routes the picker/redirect surfaces through
   `@movar/lang-pickers` + `getRuleForHost`. **To add a fixture:** save the page, trim it to the
   durable subtree the extractor walks (drop `<script>`/`<style>`/remote assets/PII, keep the
   contaminating chrome — see `fixtures/README.md` for the full recipe), drop it in the right
   surface dir with a manifest, and run the harness. The shape-pin guard makes a vacuous re-save
   that drops the contaminated card fail loudly instead of passing green.

**Instances.**

- **Google SERP** (`packages/page-content/src/google.ts`) — an injected "Translate this page"
  link plus a store-annotation row (rendered in the UI language) were swept into the whole-card
  text and flipped a short Russian shopping result to "Ukrainian", so it survived the filter.
  Fixed per the recipe: serialise the result's title + snippet via an allow-list of durable
  selectors, with a whole-card-minus-chrome fallback (`serializeContentText`).
- **YouTube** (`packages/page-content/src/youtube.ts`) — already allow-list (video title +
  channel name only), so injected metadata (view counts, timestamps) never enters the sample;
  **not** exposed to this bug. _Adjacent, still open:_ YouTube sometimes **auto-translates the
  title itself** into the UI language — a different mechanism (the platform rewrites the content,
  not separate chrome), with no reliable DOM signal to recover the original yet.
- **Page-language text fallback** (`apps/extension/src/lib/page-text.ts`) — a coarse whole-page
  sample; shares the DNA but is gated behind the structural detector and a loop-guarded redirect,
  so it's by-design, not a defect.

**Review checklist** (when adding or maintaining an extractor or a detector):

- Does the serialised text include anything the _site_ renders in the UI language — links,
  badges, ratings, "translate", view counts, timestamps?
- Is the text an **allow-list** of content selectors (good), or a whole-element / whole-page
  grab (suspect)?
- Would a **short** blocked-language item survive being mixed with a couple of keep-language
  tokens of chrome?
- Are the selectors **durable** (`data-*`, ids, semantic tags) rather than obfuscated styling
  classes?
- Did you test with a **real saved page**, not a synthetic single-language fixture?

---

## 2. Overlay assumed a block-box target ("inline-target degeneracy")

> _Tags: curtain, overlays, content-filter, css, responsive_

**Signature.** A curtain (or any absolutely-positioned overlay) mounted over a target renders
wrong _only for some targets_ while working fine over big cards: the pill **escapes its target
and overlaps its neighbours**, or several overlays **pile into one spot**. Tell-tales — the
broken targets are **inline** (a bare `<a>`/`<span>` run) or **short** (a one/two-line row, e.g.
Google "People also ask"); the overlay is _not_ clipped to the target even though the code set
`overflow: hidden` on it.

**Blast radius.** Anywhere Movar covers a target with an `inset: 0` overlay whose fill/clip
assumes the target is a box:

- The content curtain's **cover** mode (`apps/extension/src/lib/curtain.ts` → `attachCurtain` /
  `applyCoverSideEffects`), used over every content card the filter conceals.
- Any future overlay positioned against a page element it did not itself create (tooltips,
  highlight rings, badges).

**Root cause.** Two CSS facts about **inline** boxes bite together: (1) a `position: relative`
inline element gives an absolutely-positioned child a **degenerate (often 0-width) containing
block**, so `inset: 0` doesn't cover the visible text; and (2) `overflow` is a **no-op on
non-replaced inline elements**, so the overlay is never clipped to the target. The overlay then
paints at the wrong size/place and can't be contained. Separately, a **short block** target _is_
a box but is shorter than a fixed-height overlay, so a vertically-stacked pill overflows and
collides with adjacent overlays.

**Guard.**

1. **Give the overlay a box.** Before applying cover side effects, if
   `getComputedStyle(target).display === 'inline'`, promote the target to `inline-block`
   (snapshot + restore the inline `display`, `!important` to defeat a site rule). inline-block
   establishes a content-sized box that `inset: 0` fills and `overflow: hidden` clips, while
   keeping the element inline in the surrounding flow.
2. **Make the overlay responsive to that box.** Don't hard-size the overlay content. Make the
   overlay a **named size container** (`container: <name> / size`) and let the inner card
   collapse via `@container` queries when the target is short/narrow — shed the description, then
   the secondary action, then the title. Keep the headline + primary action to the smallest size.
   Name the container so the rules can't be driven by a stray page container or leak to a sibling
   skin that has no such container.
3. **Keep the host inside the target.** Cover mode appends its host as a _child_ of the target so
   the page-wide reveal/hide sweeps (which scope to the target) find it. Don't "fix" inline by
   switching to a sibling host — promoting `display` keeps the host in place and the sweeps intact.

**jsdom caveat.** Custom-element cards (`ytd-*`, `ytm-*`) default to `display: inline` in jsdom
(no site CSS), which would trip the inline promotion in tests and diverge from production (where
the site's own CSS makes them block). `apps/extension/src/lib/test-setup.ts` injects
`:not(:defined) { display: block }` to restore that fidelity, so tests exercise the real
block-card path; genuine inline HTML is `:defined`-inline and still promotes as in the browser.

**Instances.**

- **Content curtain over Google PAA rows + inline targets**
  (`apps/extension/src/lib/curtain.ts`) — a fixed ~260×90 vertical pill overflowed short
  `div.related-question-pair` rows (piling up, one overlay per row landing in the same strip) and
  escaped bare inline targets entirely (0-width host). Fixed with the `movar-cover` size container
  - `@container` collapse and the inline→inline-block promotion in `promoteInlineTarget`.

**Review checklist** (when adding or touching an overlay):

- Does the overlay assume the target is a **block box**? What happens over `display: inline`?
- Is the overlay a **fixed size**, or does it adapt to a short/narrow target?
- Is `overflow: hidden` relied on to clip — knowing it **no-ops on inline** targets?
- Is the overlay host a **child of the target**, so target-scoped sweeps still find it?

---

## 3. Emptied container left as a dangling shell ("orphaned wrapper")

> _Tags: content-filter, page-content, concealment, dom_

**Signature.** After concealment, a visibly empty box, list, or section remains on the
page — no text, no cards, sometimes just a lingering toggle or heading — where a group
of items used to be. Tell-tale: every item WITHIN a shared container got concealed
individually, but the container itself (a `<ul>`, a shelf wrapper, a sources-list
dialog) was never its own `ContentNode`, so nothing ever told it to go away.

**Blast radius.** Any container whose children are extracted and concealed as
independent nodes rather than as one unit:

- Any site extractor that emits per-item nodes for a list/shelf (Google's PAA rows, AI
  Overview citation cards, a YouTube shelf) instead of one node per whole shelf.
- Any future extractor with the same per-item-node shape.

**Root cause.** `PageContentModel` is a FLAT list of independent `ContentNode`s with no
parent/child relationship between them. Concealing node A has no way to know A was
container C's last visible child — C is simply never examined, so it is left in the DOM
exactly as before: present, in-flow, and now empty.

**Guard — climb and hide what's left empty, bounded by what's still visible.**

1. After concealing a node, walk up its ancestor chain and hard-hide any ancestor now
   left with no visible content of its own (`concealEmptyAncestors` in
   `apps/extension/src/lib/content-conceal.ts`).
2. "No visible content" must recurse through non-hidden descendants only (a
   `display:none` child — ours or the page's own — contributes nothing) AND must check
   inside any attached shadow root (`hasVisibleContent`) — Movar's own curtain renders
   its pill inside an `open` shadow root, invisible to a light-DOM-only walk, so
   skipping this check would misjudge a curtained-but-otherwise-full container as empty.
3. Stop at the first ancestor that still has visible content — everything above it is
   safe by construction (an ancestor of a non-empty element can't itself be empty).
4. Never climb to `<body>`/`<html>` — this is page-content cleanup, not page-chrome
   removal.
5. Mark the hidden container with the SAME `content-filter:` `HIDDEN_ATTR` reason prefix
   as a regular card hide, so the existing reveal sweeps (`revealAllNodes`,
   `hideAllConcealed`) pick it up for free — "Show everything" must restore an emptied
   section along with its cards, not leave it hidden.
6. This is a RUNTIME (DOM-state) rule, not an extraction-time one: it belongs in the
   concealment module (`content-conceal.ts`), not in `@movar/page-content` (which stays
   concealment-free per its own boundary), and it runs for every site automatically —
   no per-extractor wiring needed.

**Instances.**

- **Google AI Overview sources list** (`packages/page-content/src/google.ts`,
  `AI_SOURCE_CARD_SELECTOR`) — each citation card is its own `ContentNode`; when every
  card in the "N сайтів" list is in a blocked language, the surrounding `<ul>`/dialog
  wrapper would otherwise survive as an empty, useless shell. Fixed by
  `concealEmptyAncestors` in `content-conceal.ts`.

**Review checklist** (when adding an extractor, or touching the conceal path):

- Does this extractor emit MULTIPLE nodes per logical group (list rows, shelf items)?
  If so, its shared container needs no extra wiring — the empty-container climb handles
  it generically.
- After concealing every item in a group in a test, does the shared container's
  `display`/`HIDDEN_ATTR` state look right — hidden AND revealable?
- Does the emptiness check account for shadow-DOM content (curtains, tooltips), not
  just light-DOM text?

---

## 3. Opaque session token × forcing filter ("context-pinned empty SERP")

> _Tags: site-rules, search-params, redirects, google_

**Signature.** A search rewrite that adds a **hard result filter** (Google's `lr=lang_*`)
returns **zero organic results** — or an order-of-magnitude fewer — for a query that plainly
has plenty, while the same query without the filter is healthy. It masquerades as a
classifier gap ("the engine hasn't tagged enough pages in this language") or a broken filter
syntax; both were confidently diagnosed and both were wrong. Tell-tales: the failing URL (or
the request immediately before it) carried an opaque token minted **before** the rewrite ran;
reloading does not help; the same URL reads healthy again minutes-to-hours later with nothing
changed.

**Blast radius.** Any `enforce`-mode `searchParams` rule whose strategy sets a forcing
filter:

- Google's `lr` (`apps/extension/src/sites/google/index.ts`) — the only forcing filter today.
- Any future engine rule that adopts one. Bing's `setlang` and DuckDuckGo's `kl` bias without
  forcing, so those rules deliberately carry **no** strip lists — nothing exists for a stale
  token to catastrophically intersect with. Adding a forcing param to either changes that
  calculus; re-read this entry first.

**Root cause.** Search engines mint opaque, session-scoped tokens at **entry surfaces**,
before a content script can rewrite anything: the browser omnibox attaches its own
suggestion-session blob, and the engine's homepage/suggest box attaches a family of session
and interaction tokens. The serving stack computes a candidate set under that pre-rewrite
context — carried either **on the URL** (the token survives onto the rewritten URL) or **in
server-side session state** (the poisoned entry request is served before the rewrite's
redirect, and the pin stays hot on the session for a short window). Intersecting the pinned
candidate set with the freshly appended filter yields zero. Pins are **ephemeral** (they
decay in minutes to hours), which makes the class treacherous to test: a clean reading can
**convict but never acquit** a parameter.

**Guard — three layers, each matched to where the pin lives** (all on the Google rule; the
mechanisms are shared and rule-configurable):

1. **`stripParams`** (rewrite-triggering; `applySearchParams` in
   `apps/extension/src/lib/strategy.ts`) — for tokens **convicted by live testing**. Mere
   presence forces a rewrite, so a stuck URL is cleaned even when the language params already
   match. That trigger costs a navigation wherever the token appears — never put a param here
   that rides SERP-internal URLs (pagination/refinements), or every one of them double-loads.
2. **`scrubParams`/`scrubPrefixes`** (non-navigating hygiene, same applier) — dropped only
   when a navigation is already happening, never causing one. Safe for whole namespaces and
   suspected-but-unconvicted tokens. Entry URLs never carry the filter param, so they always
   rewrite — scrubs reliably cover exactly the URLs where pre-rewrite tokens are born, free.
3. **`emptyResultsRetry`** (`apps/extension/src/lib/empty-results-retry.ts`) — for the
   session-carried residual that URL surgery cannot reach: a settled page carrying the filter
   param with a rendered-but-empty results area is retried **exactly once** with the filter
   dropped (interface param stays). The retry itself is the test — a pinned query recovers, a
   legitimately-empty one stays empty and is never retried again (per-tab loop-guard marker).

Rules of the road: **never** strip or scrub user-facing state (`pws`, `tbs`, `udm`, `tbm`,
`start`, `safe`, …) — that failure mode is _silent_, unlike this class's loud one; the
strategy must stay **stateless** (each rewrite derives from the current URL only — pinned by
the cross-call tests in `strategy.searchParams.test.ts` and
`google-rule.integration.test.ts`); and vet every new suspect with the live protocol in
[`google-search-url-params.md`](./google-search-url-params.md) (fresh same-session values,
extension off, baseline count alongside every batch).

**Instances.**

- **`sei`** — session-event token; carried prior-session locale bias over a freshly set
  `hl`/`lr`. First convicted instance; original `stripParams` entry.
- **`gs_lcrp`** — omnibox-session blob; isolated live by removing the single param (0 → ~1M
  results, everything else unchanged). Along the way, two wrong theories — a classifier gap
  and broken `lr` pipe-join syntax — were each disproven only by one-variable live tests.
- **`oq` (wrong keyboard layout)** — Chrome's original-query attribution, normally a harmless
  prefix of `q`. A query started under a Latin layout leaves a Latin artifact on a Cyrillic
  search (`oq=htkt` for `реле`); as a pre-rewrite language signal it intersects `lr` to zero.
  Stripped, not scrubbed — it poisons an already-at-target URL (`hl`/`lr` set, `oq` riding
  along), the same stuck-state recovery `gs_lcrp` needs. The lone convicted _user-facing_
  param: kept until reported, moved to `stripParams` because it drives nothing the user sees.
- **Server-side session pin** — zero results on a fully cleaned URL (post-strip, `hl`/`lr`
  correct) that read ~1M in the same browser minutes later; every parameter on it acquitted
  individually. The pin rode the session, seeded by the entry request served before the
  rewrite could redirect. Closed by `emptyResultsRetry`, not by URL surgery.

**Review checklist** (when touching a `searchParams` rule or triaging a "no results" report):

- Does the rule force-filter results? If not (Bing/DDG today), strip lists are probably
  unnecessary — and this whole class is structurally absent.
- New strip candidate: convicted by a **live, fresh-value, one-variable** test, or merely
  suspected? Convicted → `stripParams`; same class/namespace but unproven → scrub tier;
  user-facing → keep, always.
- Does the candidate appear on SERP-internal URLs? Then `stripParams` would double-load every
  pagination/refinement — scrub tier or nothing.
- Triaging a zero-result report: capture the **full URL**, check whether the _exact_ URL
  still reproduces after a few minutes (URL-carried vs session-carried pin), and use
  param-position forensics — params the extension appended sit at the **end** of the query
  string, params the engine emitted sit mid-URL, so the URL itself tells you whether the
  rewrite fired.
- Anything memorized across queries? The strategy and retry state must key on exact full
  URLs (per-tab, TTL'd) so a changed query can never inherit a previous one's suppression.
