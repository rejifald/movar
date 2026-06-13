---
type: adr
id: content-filtering-modes
status: proposed
date: 2026-06-08
summary: Reframe the popup's "hide content" control as **filtering** — the honest umbrella for what the feature already does (curtain *or* hard-hide), since it isn't always literal hiding. Today `hideMode` ('blur' = curtain, 'hide' = display:none) is per-shape developer config the user can't touch; this ADR lifts the curtain-vs-hide choice into a user-facing **conceal mode** setting (`curtain` default, `hide` opt-in) applied uniformly to every blocked card (Update 2026-06-08: an earlier draft escalated a per-shape `hideMode` floor; that floor is dropped — conceal mode is global, so curtains may appear on Google results / channel links / Shorts shelves). The blur curtain gains a "Hide all" action (the inverse of the popup's existing "Show everything"), and the popup's reveal path is made durable for hard-hidden cards (which today have no REVEALED skip-marker, so they re-hide on the next scan). Builds on multi-shape-content-filter.md's HideMode; stays squarely block-only per no-content-translation.md. Two product decisions are deferred to Open questions, chief among them whether to flip filtering from opt-in to on-by-default.
---

# Content filtering — curtain vs. complete hide

> **Update 2026-06-08 — conceal mode is global; the per-shape floor is dropped.** `concealMode` now applies uniformly: `'curtain'` curtains _every_ blocked card; `'hide'` removes _every_ blocked card. Decision: a curtain **is** acceptable on a Google result, channel link, and Shorts shelf. This supersedes the `effectiveHideMode` floor mechanism in **Decision §2**, the **escalate-only** rationale, and reverses **Considered alternatives → "Full per-shape override"** (now adopted). The per-shape `hideMode` on `CardShape` / `ContentNode` becomes vestigial (see [multi-shape-content-filter.md](./multi-shape-content-filter.md)).

## Context

The popup surfaces one control for the DOM-modifying feature: a checkbox labelled **"Hide blocked-language content"** ([ContentToggle.tsx](../apps/extension/src/entrypoints/popup/ContentToggle.tsx), copy `t.contentToggle` in [messages-en.ts:225](../apps/extension/src/lib/i18n/messages-en.ts)). It writes a single boolean, `settings.contentModification` ([settings/src/index.ts:28](../packages/settings/src/index.ts)), **off by default** — "the safer baseline ships only header/URL-level switching."

But "hide" is not what the feature always does. Concealment dispatches on a per-node `hideMode` ([content-conceal.ts:100](../apps/extension/src/lib/content-conceal.ts)):

- **`blur`** → a **curtain**: an overlay with a "Show" action and hover-peek; the card stays in layout, reversibly obscured ([curtain.ts](../apps/extension/src/lib/curtain.ts)). This is _filtering_, not hiding — the content is still there, marked and de-emphasised.
- **`hide`** → `display: none !important` on the card. No curtain, no affordance. This is literal hiding.

`hideMode` is **developer config, baked per shape** ([page-content/src/types.ts:38](../packages/page-content/src/types.ts)), chosen by the site model author for what reads well on each surface:

| Surface                          | `hideMode` | Why                                                                                                           |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| YouTube video card               | `blur`     | False-positive risk; let the user peek ([youtube.ts:97](../packages/page-content/src/youtube.ts))             |
| YouTube channel / shelf / shorts | `hide`     | Nothing to peek at; a blurred channel link is pointless                                                       |
| Google SERP result               | `hide`     | A blurred-but-clickable result is worse than absent ([google.ts:100](../packages/page-content/src/google.ts)) |

The user has **no say** in this. Someone who wants every blocked card _gone_ (not curtained) can't get it; someone who'd rather audit what was filtered can't force a curtain where the site chose `hide`.

The popup already surfaces the effects: [HiddenPanel.tsx](../apps/extension/src/entrypoints/popup/HiddenPanel.tsx) shows counts (the `feedCards` total already sums both blurred and hard-hidden cards — [hidden-summary.ts:43](../apps/extension/src/lib/hidden-summary.ts)) and a **"Show everything on this page"** button wired to `revealAllContent` ([content-modification.ts:232](../apps/extension/src/lib/content-modification.ts)).

There is a latent asymmetry in that reveal path. `revealAllNodes` sets the durable `REVEALED_ATTR` skip-marker only on **blurred** cards ([content-conceal.ts:130](../apps/extension/src/lib/content-conceal.ts)); the per-card curtain "Show" button does the same. The hard-`hide` path has **no equivalent marker**. `teardownContentModification` strips `display:none`, but without a REVEALED mark the next `applyContentFilter` pass re-scans and re-hides the card — so on a re-rendering grid (YouTube) a popup "Show everything" un-hides hard-hidden cards only until the next mutation. Blur reveals durably; hide does not.

## Decision

Three coordinated changes; the model reframe is the spine.

### 1. Reframe the control as _filtering_

The popup/options control becomes **"Filter blocked-language content"** — the umbrella that honestly covers both outcomes (curtain or hide). The capability claim stays literally true: Movar still _hides_ Russian (hide is one mode; curtain still conceals). This is a copy change, not a mechanism change, and not a storage-key change — `settings.contentModification` keeps its name (no migration), only its user-facing framing moves.

### 2. Lift curtain-vs-hide into a user **conceal mode**

Add one setting:

```ts
// packages/settings/src/index.ts
export type ConcealMode = 'curtain' | 'hide';

export interface MovarSettings {
  // …existing…
  /** When filtering is on, how blocked cards are concealed. 'curtain' overlays
   *  a reversible curtain; 'hide' removes every blocked card with display:none. */
  concealMode: ConcealMode; // default 'curtain'
}
```

The user setting is global:

```ts
// Conceal mode is global — no per-shape floor. The user preference IS the mode.
//   'curtain' → blur overlay (peekable) on every blocked card
//   'hide'    → display:none on every blocked card
function concealStyle(pref: ConcealMode): 'blur' | 'hide' {
  return pref === 'hide' ? 'hide' : 'blur';
}
```

- `concealMode: 'curtain'` (default) → every blocked card gets a curtain (blur overlay, peekable), uniformly across all surfaces.
- `concealMode: 'hide'` → every blocked card becomes `display:none`, no curtain.
- No per-surface exception: a curtain on a Google result, channel card, or Shorts shelf is accepted (see Update).

`concealNode` reads `settings.concealMode` directly (no per-node `hideMode`). The per-shape floor on `CardShape` / `ContentNode` becomes vestigial — drop it when implementing (see [multi-shape-content-filter.md](./multi-shape-content-filter.md)).

### 3. "Hide all" on the curtain + a durable popup reveal

- The blur curtain gains a second action, **"Hide all"**, beside "Show" — the inverse of the popup's "Show everything on this page." It escalates every currently-curtained card on the page to `display:none` and flips `concealMode` to `'hide'` so the choice sticks. The curtain's `actions` array already supports this ([curtain.ts:77](../apps/extension/src/lib/curtain.ts)); it's one more entry in `attachBlurCurtain`.
- The popup's reveal is made **durable for hard-hidden cards**: introduce a REVEALED-equivalent skip-marker for the `hide` path so a popup "Show everything" survives the next scan instead of re-hiding (closes the asymmetry in Context). The HiddenPanel keeps its single "Show everything" CTA; the count copy may split "behind a curtain" vs "fully hidden" so the user knows which they're looking at.

## Rationale

- **Honesty of language.** The control says "hide" but the default outcome on the highest-traffic surface (YouTube videos) is a _curtain_ — visible, reversible, peekable. "Filter" is the term that's true for both branches; calling it "hide" oversells the default and undersells the curtain's auditability.
- **The choice is genuinely the user's.** Curtain vs. hide is a values call, not a correctness call. The cautious user wants a reversible curtain they can audit and undo (consistent with the per-card "Show" affordance Movar already ships). The committed user wants blocked content _gone_ — no grey card reminding them it existed. The site model can't know which; only the user does.
- **Global mode keeps the UI honest.** The popup labels promise two visible behaviours: keep filtered cards behind a curtain, or hide them. Letting a per-shape floor hard-hide under the curtain option would make the setting lie on some surfaces, so the user's choice overrides the old `hideMode` floor.
- **Reveal must be symmetric with hide.** If the user can hard-hide content (mode or "Hide all"), the popup must be able to bring it back as durably as it brings back a curtain. The current blur-only REVEALED marker is an accident of the curtain being built first; a richer hide path turns that accident into a visible bug (un-hide, then flash back on the next YouTube re-render).
- **This is squarely block-only.** Curtain-vs-hide is _how_ to conceal, never whether to translate — fully inside the policy of [no-content-translation.md](./no-content-translation.md). And it builds directly on the `HideMode` introduced in [multi-shape-content-filter.md](./multi-shape-content-filter.md): that ADR shipped the per-shape blur/hide dispatch; this one lifts the same axis into a user dimension.

## Consequences

**Settings.** New `concealMode: ConcealMode` (default `'curtain'`) in [settings/src/index.ts](../packages/settings/src/index.ts) + `defaultSettings`. Additive — no migration, no locked-language interaction.

**Conceal core.** [content-conceal.ts](../apps/extension/src/lib/content-conceal.ts): `concealNode` dispatches on `settings.concealMode` directly (no `effectiveHideMode`, no per-node floor); `attachBlurCurtain` grows the "Hide all" action; the hide path gains a durable skip-marker and a `revealAllHidden`-style sweep so reveal is symmetric with `revealAllNodes`.

**Curtain.** No structural change — one extra `CurtainAction` ([curtain.ts](../apps/extension/src/lib/curtain.ts)).

**Facade + messaging.** [content-modification.ts](../apps/extension/src/lib/content-modification.ts) threads `concealMode` through `applyContentModification`; "Hide all" and the durable reveal may need a new content-script message beside `movar:getHidden` / `movar:restoreHidden` ([messaging.ts](../apps/extension/src/lib/messaging.ts)).

**Popup + options UI.** [ContentToggle.tsx](../apps/extension/src/entrypoints/popup/ContentToggle.tsx) and [PageContentSection.tsx](../apps/extension/src/entrypoints/options/PageContentSection.tsx) relabel to "Filter…" and gain a curtain/hide mode selector (radio or segmented control), shown only when filtering is on. [HiddenPanel.tsx](../apps/extension/src/entrypoints/popup/HiddenPanel.tsx) count copy may split curtained vs hidden.

**i18n.** New strings in [messages-en.ts](../apps/extension/src/lib/i18n/messages-en.ts) / `messages-uk.ts` (mode labels, "Filter…"), and a "Hide all" curtain string in [content-strings-en.ts](../apps/extension/src/lib/i18n/content-strings-en.ts) / `content-strings-uk.ts` beside `contentHidden.show`. Both locales must land together — UK is a shipped UI language.

**Copy-surface audit (the wide blast radius).** "Hide" appears across store listings, marketing, privacy pages, README, and `docs/copy.md`. The capability claim _"hides Russian"_ must stay literally true for store reviewers — and it does (hide remains a mode). But the in-product control's reframe to "filter" should be reconciled with those surfaces so the product and its copy agree (the standard product-claim copy reconciliation; no automated guard).

**Tests.** Per-mode conceal in `content-conceal.test.ts` (curtain applies even to old `hide`-floor nodes; hide hard-hides every node); durable hide-reveal survives a re-scan; "Hide all" curtain action in `curtain.*.test.ts`; popup mode selector + relabel in the popup/options specs.

## Known limitations

### Flash of blocked content (FOUC) — accepted, performance-bound

Concealment is gated entirely behind an **asynchronous** classification
round-trip: `applyContentFilter` collects candidate cards, then
`await classify(...)` ([content-conceal.ts](../apps/extension/src/lib/content-conceal.ts))
ships their text to the background worker that hosts franc and waits for the
verdict before attaching a curtain or hiding. Between first paint and the verdict
returning, blocked-language cards are briefly visible — most noticeably on
infinite-scroll feeds (YouTube) where fresh cards stream in and every batch
incurs another round-trip.

There is deliberately **no** synchronous, content-thread pre-hide today, for two
performance reasons:

- The always-on content script is kept **franc-free and under budget**
  (`check:content-bundle`; franc and the language profiles live in the worker,
  not `content.js`). A synchronous detector in the content thread would pull
  detection weight back into the always-injected bundle.
- A blunt "hide everything until classified" pre-pass would flash _legitimate_
  (Ukrainian/English) content instead — trading one flicker for a worse one — and
  risks hiding the page's own chrome before a verdict exists.

**Status: known, unresolved, subject to change.** A future iteration may add a
cheap synchronous **rung-1 pre-pass** (alphabet / distinctive-character scan) in
the content thread to conceal _unambiguously_ Cyrillic-distinctive cards
instantly, deferring only the ambiguous residual to the async franc round-trip;
or stamp candidate cards with a transient `opacity: 0` holding state until the
verdict resolves. Both add complexity and content-bundle weight, so they are
deferred until the trade-off is worth it. Tracked here as an accepted limitation
rather than a bug.

## Considered alternatives

- **Leave `hideMode` developer-only (status quo).** Rejected: the curtain-vs-hide call is the user's values call, and "hide" mislabels the curtain default. The whole point is to give the user the dial.
- **Uniform global mode (the user choice applies to every surface).** **Adopted 2026-06-08** (originally rejected here). A curtain on a Google result / channel link / Shorts shelf was deemed worse than hiding; reversed for the simpler one-axis model — and a curtain stays peekable/auditable everywhere, which is _better_ for false positives on surfaces that used to hard-hide. The per-shape `hideMode` floor is dropped.
- **Per-site mode instead of global.** Deferred (see Open questions). A global mode is the simplest honest default; per-site is more power and more UI for a preference most users will set once.
- **Rename the storage key `contentModification` → `contentFiltering`.** Rejected for now: a persisted-key rename needs a storage migration for installed users, for zero behavioural gain. Reframe the _copy_, keep the key.
- **Itemised hidden-content list in the popup (per-card preview + per-item reveal).** Deferred (see Open questions): the popup is a separate document with only summary counts, and a `display:none` node can be torn out and recreated by an SPA, invalidating any handle. Durable reveal-all is the high-value, tractable v1; per-item listing is a stretch needing the content script to expose per-node metadata.

## Open questions

1. **Should filtering flip from opt-in to on-by-default?** _(Decision A — the biggest one, deliberately separable.)_ The original framing called filtering "opt-out." Today it's opt-in (off by default), a deliberate trust/store-review posture — Movar modifies page DOM only after the user asks. Flipping the default would have the published extension altering pages out of the box, which touches the "safer baseline" rationale and store-review expectations. **Recommendation:** land the mode choice, "Hide all", and durable reveal _regardless_ of this — they're all orthogonal to the default. Treat the opt-in→opt-out flip as its own decision (and likely its own ADR), not a rider on this one. The mechanism here works either way.
2. **Global mode vs per-site.** Recommendation: ship global first; revisit per-site if requested.
3. **Does "Hide all" on the curtain persist (flip `concealMode: 'hide'`) or act page-only?** Recommendation: persist — a user who clicks "Hide all" is expressing a standing preference, and the symmetric "Show everything" already implies durability. Confirm.
4. **Default conceal mode.** Recommendation: `curtain` — it's the reversible, auditable choice and matches today's most-visible behaviour. Hide is the opt-in escalation.

## Out of scope / relations to other ADRs

- **Block-only is untouched.** This ADR only chooses _how_ to conceal; translation stays rejected per [no-content-translation.md](./no-content-translation.md).
- **Built on [multi-shape-content-filter.md](./multi-shape-content-filter.md).** That ADR introduced `HideMode` and the per-shape blur/hide dispatch (Phase 1, shipped). This ADR promotes that axis to a user setting; the old per-surface floor is vestigial.
- **The `blocked: ['ru']` lock and `enabled` master switch are unrelated** and unchanged.
- **Per-item hidden-content listing** and the **opt-in→opt-out default flip** are explicitly deferred (Open questions 1 and the last Considered alternative).
