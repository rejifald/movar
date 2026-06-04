/**
 * Google SERP PageExtractor — produces { kind: 'result', hideMode: 'hide' }
 * nodes for Google search result pages.
 *
 * Text is serialized with serializeElementText (whole-card textContent) because
 * SERP cards have no single reliable inner selector — matching the original
 * filterContentByLanguage approach.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/google';
 */
import { isGoogleHost } from '@movar/rules';
import type { ContentNode, PageContentModel, PageExtractor } from './types';
import { serializeElementText } from './serialize';
import { registerExtractor } from './registry';

// ─── Selector constants ───────────────────────────────────────────────────
//
// Google ships two kinds of selector and only one is safe to build on:
//
//   - Obfuscated *styling* classes (div.tF2Cxc, div.MjjYud, jscontroller hashes
//     like Da4hkd/SC7lYd) are minifier output. They rotate without notice — a
//     selector built on them silently matches zero nodes after a redesign while
//     synthetic unit tests stay green. div.g already died this way. We do NOT
//     keep them even as fallbacks: a rotating fallback is just a deferred
//     silent-miss. If a layout isn't covered, the fix is another *reliable*
//     anchor, not a class crutch.
//   - Signals Google has kept for ~a decade because click-logging and a11y
//     depend on them: the #rso results-list id, the <h3> result title, and the
//     data-hveid logging attribute on each result card.
//
// Google uses no list semantics for web results — no <ul>/<li>, and the only
// role="listitem" elements are the search-mode tabs (Усі / Зображення / …), not
// results. So the durable anchor for an organic result is its <h3> title; we
// climb from there to the enclosing data-hveid card (the unit to hide).

/** Organic result titles: each web result is a title <h3> inside the #rso
 *  results list. We climb each <h3> to its {@link ORGANIC_CONTAINER}. */
const ORGANIC_TITLE_ANCHOR = '#rso h3';

/** The card an organic title sits in — its nearest data-hveid ancestor.
 *  Hiding this hides the whole result (title + snippet + url). */
const ORGANIC_CONTAINER = '[data-hveid]';

/** "People also ask" (Схожі запитання) — one row of the accordion as its own
 *  node. `related-question-pair` is a *readable*, long-stable class (not a
 *  styling hash); scoping [data-q] to the block instead would reintroduce the
 *  rotating jscontroller hash. Per-row nodes keep filtering atomic — a Russian
 *  question is hidden while a Ukrainian one in the same block stays. */
const PAA_QUESTION_SELECTOR = 'div.related-question-pair';

// ─── Extractor implementation ─────────────────────────────────────────────
//
// Host gate: SERP structure (#rso h3 → data-hveid, related-question-pair) is
// identical across every Google ccTLD, so this extractor accepts *any* google.*
// host via the shared `isGoogleHost` predicate (also used by the redirect rules
// in @movar/rules, so both layers agree on what a Google host is). Non-SERP
// Google properties (mail/docs/maps/sites.google.com) match too, but extract()
// finds no #rso results there and returns no nodes, so running on them is
// harmless.

/**
 * Climb from an organic title <h3> to the result card enclosing it: the nearest
 * data-hveid ancestor. Returns null when there's no card boundary, or when
 * `closest` escapes a subtree `root` (it walks the live tree, not just `root`).
 */
function organicCardFor(h3: HTMLElement, root: ParentNode): HTMLElement | null {
  const card = h3.closest<HTMLElement>(ORGANIC_CONTAINER);
  if (!card) return null;
  if (root instanceof Element && !root.contains(card)) return null;
  return card;
}

function extractGoogle(root: ParentNode): PageContentModel {
  // Two reliable sources: organic results (anchor each #rso <h3> to its
  // data-hveid card) and People-also-ask question rows. A Set dedupes the
  // common case where several titles resolve to the same card.
  const els = new Set<HTMLElement>();

  for (const h3 of root.querySelectorAll<HTMLElement>(ORGANIC_TITLE_ANCHOR)) {
    const card = organicCardFor(h3, root);
    if (card) els.add(card);
  }

  for (const question of root.querySelectorAll<HTMLElement>(PAA_QUESTION_SELECTOR)) {
    els.add(question);
  }

  // Drop any element nested inside another selected one — keep the outermost
  // result container, so nested cards (e.g. sitelinks carrying their own
  // data-hveid under a parent result) collapse to one node instead of two.
  const all = [...els];
  const nodes: ContentNode[] = all
    .filter((el) => !all.some((other) => other !== el && other.contains(el)))
    // Whole-card text — SERP blocks have no reliable inner title selector.
    .map(
      (el): ContentNode => ({
        el,
        kind: 'result',
        hideMode: 'hide',
        text: serializeElementText(el),
      }),
    );

  return { extractor: 'google', nodes };
}

export const GOOGLE_EXTRACTOR: PageExtractor = {
  id: 'google',
  matches: isGoogleHost,
  extract: extractGoogle,
};

// Self-register on import so `import './page-content/google'` is all a
// caller needs to activate this extractor.
registerExtractor(GOOGLE_EXTRACTOR);
