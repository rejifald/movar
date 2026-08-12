---
name: adopt-site
description: |
  Adopt a site into Movar, or repair an adoption after a redesign. Two
  phases: Phase 1 teaches Movar to switch the SITE's own language (picker,
  language gate/modal, hreflang, cookie/path/query, redirect SiteRule);
  Phase 2 — only for sites whose correctly-switched pages still show
  blocked-language CONTENT items (search results, feeds, recommendations,
  UGC) — models the page structure (@movar/page-content extractor) so Movar
  filters per-card. Use when the user asks to add/support a new site ("add
  rozetka", "X still serves Russian", "X ignores my language preference"),
  when an adopted site redesigned and cards leak through ("movar misses
  videos on YouTube", "X changed markup"), when asked to survey or verify a
  site's DOM against the model, or when an enforce-mode rule needs its
  SPA-navigation safety re-verified. Do NOT use for: language-detection /
  classifier work (@movar/lang-detect), concealment UI (curtains, tooltips,
  page-mode), marketing or store copy, or bug fixes that don't touch site
  adoption.
---

# Adopt a site (or repair an adoption)

Movar adopts a site in two phases, in order. Most sites stop after Phase 1.
This skill is the orchestration; the invariants live in the canonical docs it
points at — read them at the step that needs them, never restate them.

## Ground rules (both phases)

- **Live proof is mandatory.** Every claim about a site's markup or behavior
  is verified against the live site in a browser, with the probes in
  [references/probes.md](references/probes.md). Prefer Claude-in-Chrome (real
  sessions); fall back to the in-app Browser pane (logged-out — note the
  difference in your report). Logged-out caveats: feeds/grids sometimes stall
  hydration — that is transient, retry the page before concluding "empty";
  survey mobile via the mobile viewport preset (UA emulation) against the
  `m.` host; NEVER solve a CAPTCHA — fall back to corpus evidence and say so
  in the report.
- **Say what you could not observe.** A surface you could not reach is
  reported as unverified, never silently assumed covered.
- Cheapest lever wins: never start Phase 2 work a Phase 1 rule would solve.

## Step 0 — Surface inventory (before either phase)

Adoption starts with an inventory, not a survey: enumerate **every page type
the site serves** and classify each row before touching any code. Two axes:

- **Hosts** — everything the host predicate will match (a suffix predicate
  like `*.youtube.com` drags music/kids/studio subdomains into scope whether
  intended or not; each matched host is a row).
- **Routes** — home/feed, search + every vertical it serves, item pages
  (alone and with list/queue context), section/channel/category tabs, list
  pages, posts/UGC surfaces, hashtag/topic pages, live hubs, the mobile
  host's mirrors of all of the above. Use the route-inventory probe
  ([references/probes.md](references/probes.md)) plus the site's own nav.

Classify every row as one of: **switch** (Phase 1 acts), **model** (Phase 2
extracts), **ignore** (deliberately out of scope — record the stance, e.g.
"the player itself", "user's own queue"), or **unverified** (could not
observe — say why). The inventory is the adoption's contract: the phases
below work through its `switch`/`model` rows, the done-bar requires every
row classified, and the extractor header + PR carry the final table. A row
nobody classified is a gap, not a stance.

## Phase 1 — whole-site language switching

Goal: the site itself serves the target language.

1. **Survey the site's own levers live** — what does it already offer? A
   picker/gate (`@movar/lang-pickers` may already detect it — check
   [packages/lang-pickers/AGENTS.md](../../../packages/lang-pickers/AGENTS.md)),
   `<link rel="alternate" hreflang>`, a cookie/localStorage key, a path
   segment or subdomain, query params. Use the census probe; confirm each
   lever by DRIVING it live and watching the URL/cookie/render.
2. **Author the `SiteRule`.** The strategy menu, wiring steps (registry,
   `SAMPLE_HOSTS`, behavioural test), and risk notes are canonical in
   [apps/extension/src/sites/CONTRIBUTING-A-SITE.md](../../../apps/extension/src/sites/CONTRIBUTING-A-SITE.md).
   Follow its wiring list verbatim.
3. **`enforce: true` needs two extra proofs** (search-engine-shaped sites):
   the strategy is no-op-safe at target (re-run changes nothing), and the
   SPA-navigation safety holds — run the nav-timing and guard-dance probes
   and read [docs/pitfalls.md](../../../docs/pitfalls.md) §5 before touching
   anything event-driven.
4. **Corpus fixture.** Capture the picker/redirect surface per
   [packages/page-content/fixtures/README.md](../../../packages/page-content/fixtures/README.md)
   into `fixtures/pickers/` or `fixtures/redirect-sites/`.
5. **Live-drive the finished switch** on the real site as the closing proof.

## Phase gate — does this site need Phase 2?

Graduate to Phase 2 only when the correctly-switched site still shows
blocked-language **content items**: search results, feeds, recommendations,
user-generated content (Google and YouTube are the two residents today). A
site that fully re-renders in the chosen language stops at Phase 1 — a
Phase-2 model is a budgeted content-script chunk plus a corpus and a standing
maintenance surface; it must earn that cost.

## Phase 2 — page-structure model

Goal: a `@movar/page-content` extractor that turns every hot-path page into
per-card `ContentNode`s.

1. **Hot-path survey.** Enumerate the surfaces before modelling: home/feed,
   search, item page (and item page with list/queue context), section and
   channel/category pages, list pages, the mobile host. Run the census and
   card-anatomy probes on each; record which surfaces you could not observe.
2. **Write the shapes.** Selector and sampling discipline are canonical in
   [packages/page-content/AGENTS.md](../../../packages/page-content/AGENTS.md)
   and [docs/pitfalls.md](../../../docs/pitfalls.md) §1 — durable anchors
   only, allow-list text sampling, fail open. Kind/hideMode semantics live in
   `packages/page-content/src/types.ts`; nested cards get outermost-wins
   dedup (see `google.ts`/`youtube.ts` for the pattern).
3. **Wire the chunk.** `apps/extension/src/sites/<site>/` model descriptor +
   lazy `models/<site>.js` chunk (copy `./youtube/`), inside the byte budget
   (`CAPABILITY_BUDGETS_KB`, enforced at build — see
   [apps/extension/AGENTS.md](../../../apps/extension/AGENTS.md)).
4. **Tests + corpus.** Synthetic unit tests per shape; one real-capture
   fixture per new/changed surface per the corpus README recipe. **Verify
   every verdict against `classifyBySnippet` before pinning it** (probe the
   classifier with the exact serialized samples); a case the pipeline gets
   wrong is encoded loudly as an asserted false-keep with a note, never
   dropped.
5. **Live shape-mirror, before and after.** Mirror the shipped shapes in-page
   (probes.md) on EVERY claimed surface: expected node counts, expected
   nested-dedup count, zero empty samples (except documented fail-open
   cells). The before-run is the drift evidence; the after-run is the proof.
6. **Record provenance + non-goals** in the extractor header: the dated
   survey table and the surfaces deliberately NOT extracted, with the stance
   — so the next audit can tell stance from gap. Update the package
   AGENTS.md youtube/google-style bullet for the new extractor.

## Definition of done (all of it, both phases)

- [ ] Surface inventory complete — every host × route row classified
      switch / model / ignore (with stance) / unverified (with reason)
- [ ] Package-scoped tests, lint, typecheck green (`pnpm --filter <pkg> …`)
- [ ] Corpus fixture(s) per changed surface, classifier-verified verdicts
- [ ] Live proof captured: Phase-1 switch driven / Phase-2 mirror clean on
      every surface (or the unreached surfaces named as unverified)
- [ ] Extractor header carries the dated survey + non-goals; AGENTS.md updated
- [ ] Extension build green — chunk budgets hold
- [ ] `pnpm test:coverage && pnpm gen:readme --refresh` (metrics-gate snapshot)
- [ ] `pnpm nx reset`, then a plain `git push` (hooks must run; never
      `--no-verify`)
- [ ] PR carries the hot-path coverage matrix, the non-goals, and named
      follow-ups
