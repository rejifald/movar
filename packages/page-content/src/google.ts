/**
 * Google SERP PageExtractor — produces { kind: 'result', hideMode: 'hide' }
 * nodes for Google search result pages.
 *
 * Organic-result text is classified from an allow-list of the result's OWN
 * content (title + snippet — see ORGANIC_CONTENT_SELECTORS), so Google's
 * injected UI-language chrome never contaminates the language sample and new
 * chrome needs no ignore-list. A whole-card-minus-chrome fallback
 * (FALLBACK_CHROME_SELECTOR) covers the rare case where a content anchor
 * rotates. PAA rows have no inner structure, so they serialize whole.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/google';
 */
import { isGoogleHost } from '@movar/host-match';
import type { ContentNode, PageContentModel, PageExtractor } from './types';
import { serializeContentText, serializeElementText } from './serialize';
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

/** Allow-list of an organic result's OWN content — the title <h3> and the
 *  result snippet (`data-sncf="1"`, Google's structured-snippet "format 1"
 *  slot). These, and only these, drive language classification.
 *
 *  Why an allow-list and not whole-card text: Google injects its own chrome
 *  (the "Translate this page" link, a rich-annotation row) INTO each card,
 *  rendered in the user's Search language regardless of the result's language.
 *  Whole-card serialization sweeps that in and mislabels a short foreign result
 *  as the UI language — e.g. a Russian shopping result whose only distinctive
 *  Russian letters (`ы`/`э`/`ъ`/`ё`, rare in running text) get outnumbered by
 *  the Ukrainian chrome's `і`s, so it classifies as Ukrainian and is kept.
 *  Serializing only the content sidesteps that, AND — being an allow-list — it
 *  excludes any chrome Google adds LATER for free, with no ignore-list to grow.
 *  `data-sncf` is the durable `data-sn*` family (cf. the data-hveid/data-ved we
 *  anchor results on), not a rotating styling hash. */
const ORGANIC_CONTENT_SELECTORS = ['h3', '[data-sncf="1"]'];

/** Whole-card FALLBACK chrome block-list — consulted by {@link serializeContentText}
 *  ONLY when {@link ORGANIC_CONTENT_SELECTORS} comes up short (e.g. the snippet
 *  slot rotated away, leaving a bare title). It widens to the whole card with the
 *  two injected UI-language regions pruned, so we still get a usable, mostly
 *  chrome-free sample rather than classifying a title alone:
 *   - `[data-sncf="2"]` — the rich-annotation row (store rating «оцінка
 *     магазину», distance «Магазин поблизу», delivery «Безкоштовна доставка»).
 *   - `a[href*="translate.google.com"]` — the "Translate this page"
 *     («Перекласти цю сторінку») link, which Google injects precisely because it
 *     detected the result as foreign (`…&sl=ru&tl=uk`).
 *  This block-list is the defensive net, not the steady state — so it does not
 *  need to chase every new chrome type the way whole-card serialization would. */
const FALLBACK_CHROME_SELECTOR = '[data-sncf="2"], a[href*="translate.google.com"]';

// ─── Extractor implementation ─────────────────────────────────────────────
//
// Host gate: SERP structure (#rso h3 → data-hveid, related-question-pair) is
// identical across every Google ccTLD, so this extractor accepts *any* google.*
// host via the shared `isGoogleHost` predicate (also used by the redirect rules
// in @movar/host-match, so both layers agree on what a Google host is). Non-SERP
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
  // data-hveid card) and People-also-ask question rows. Tracked in separate
  // sets because their text is serialized differently (see the map below).
  const organic = new Set<HTMLElement>();
  for (const h3 of root.querySelectorAll<HTMLElement>(ORGANIC_TITLE_ANCHOR)) {
    const card = organicCardFor(h3, root);
    if (card) organic.add(card);
  }

  const paa = new Set<HTMLElement>();
  for (const question of root.querySelectorAll<HTMLElement>(PAA_QUESTION_SELECTOR)) {
    paa.add(question);
  }

  // Drop any element nested inside another selected one — keep the outermost
  // result container, so nested cards (e.g. sitelinks carrying their own
  // data-hveid under a parent result) collapse to one node instead of two.
  const all = [...organic, ...paa];
  const nodes: ContentNode[] = all
    .filter((el) => !all.some((other) => other !== el && other.contains(el)))
    .map(
      (el): ContentNode => ({
        el,
        kind: 'result',
        hideMode: 'hide',
        // Organic cards: classify the result's own title+snippet (allow-list),
        // widening to the whole card minus injected chrome only if those anchors
        // come up short. PAA rows have no chrome and no title/snippet split — the
        // whole row IS the question text.
        text: organic.has(el)
          ? serializeContentText(el, {
              content: ORGANIC_CONTENT_SELECTORS,
              excludeOnFallback: FALLBACK_CHROME_SELECTOR,
            })
          : serializeElementText(el),
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
