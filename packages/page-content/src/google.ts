/**
 * Google SERP PageExtractor — produces { kind: 'result', hideMode: 'hide' }
 * nodes for Google search result pages.
 *
 * Organic-result text is classified from an allow-list of the result's OWN
 * content (title + snippet — see ORGANIC_CONTENT_SELECTORS), so Google's
 * injected UI-language chrome never contaminates the language sample and new
 * chrome needs no ignore-list. A whole-card-minus-chrome fallback
 * (FALLBACK_CHROME_SELECTOR) covers the rare case where a content anchor
 * rotates. Sponsored text ads (`[data-text-ad]`) get the same treatment for the
 * same reason — they classify on their headline ALONE (AD_CONTENT_SELECTORS),
 * because Google injects a Search-UI-language location extension (address,
 * opening hours) that would otherwise flip a Russian ad to the interface
 * language. PAA rows have no inner structure, so they serialize whole. AI
 * Overview answers ride Google's own `data-rl` response-language label —
 * surfaced as `declaredLang`, so the filter can act on the declaration
 * instead of sampling the block's chrome-contaminated, late-streaming text.
 *
 * Product/shopping results carry no <h3> — their title is a `role="heading"`
 * div — so the <h3> anchor misses them and the whole card would slip through.
 * They're recovered by the standard `lang` attribute Google tags them with
 * (DECLARED_RESULT_SELECTOR): the same declared-language evidence class as
 * `data-rl`, folded into the organic bucket carrying that declaration, so the
 * filter decides them on Google's own label rather than their date-contaminated
 * snippet.
 *
 * This module registers itself on import. Importers only need:
 *   import './page-content/google';
 */
import { isGoogleHost } from '@movar/host-match';
import { normalizeBCP47 } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import type { ContentNode, PageContentModel, PageExtractor } from './types';
import { serializeContentText, serializeElementText, serializeNodeText } from './serialize';
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

/** Some organic results carry no <h3>: product/shopping cards render their
 *  title as a `role="heading"` div, so {@link ORGANIC_TITLE_ANCHOR} never
 *  matches and the whole card slips through unfiltered. Google does, though,
 *  tag such a card's content with a standard `lang` attribute — the same
 *  declared-language evidence class as {@link DECLARED_LANG_ATTR} (data-rl),
 *  and a W3C attribute a11y depends on, so durable where a styling class isn't.
 *  We recover these missed results by that declaration: any `lang` scoped INSIDE
 *  #rso (so the page-level <html lang> and non-result chrome never match),
 *  climbed to its self-contained result unit and folded into the organic bucket
 *  carrying the normalized code as {@link ContentNode.declaredLang}. The filter
 *  then decides the card on Google's own label — no <h3> needed, and no
 *  dependence on sampling the card's chrome-contaminated text (the localized
 *  date «25 квіт. 2026 р.» that would otherwise pull a short Russian result
 *  toward the interface language). */
const DECLARED_RESULT_SELECTOR = '#rso [lang]';

/** "People also ask" (Схожі запитання) — one row of the accordion as its own
 *  node. `related-question-pair` is a *readable*, long-stable class (not a
 *  styling hash); scoping [data-q] to the block instead would reintroduce the
 *  rotating jscontroller hash. Per-row nodes keep filtering atomic — a Russian
 *  question is hidden while a Ukrainian one in the same block stays. */
const PAA_QUESTION_SELECTOR = 'div.related-question-pair';

/** `data-rl` — Google's response-language label: a generic language-BEARER
 *  attribute, not an AI-Overview marker per se (observed live: `data-rl="ru"`
 *  on the AI Overview's answer region of a Ukrainian SERP, but nothing about
 *  the attribute is answer-specific). Same durable `data-*` family as the
 *  data-hveid/data-sncf we already build on, and it carries a language
 *  *verdict*, not just a boundary: the normalized value is surfaced as
 *  {@link ContentNode.declaredLang}, which the filter decides on outright —
 *  strong enough to conceal a block before its streamed text arrives.
 *
 *  The label may sit on an inner text region, so the node's element is not
 *  the labeled element itself but the whole self-contained unit found by
 *  {@link declaredBlockFor} — the goal is to not see the unit at all
 *  (header, media carousel, "show more" included) when it isn't in a
 *  targeted language. On today's SERP the known carrier of this label is
 *  the AI Overview («Огляд від ШІ»), which is why labeled units map to the
 *  'ai-answer' card kind below. If the attribute rotates away we fail open
 *  (the block shows unfiltered), never closed. */
const DECLARED_LANG_ATTR = 'data-rl';

/** Elements carrying {@link DECLARED_LANG_ATTR}. */
const DECLARED_LANG_SELECTOR = '[data-rl]';

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

/** Sponsored text ads (Реклама / «Спонсорований результат»): each ad card is a
 *  `data-text-ad` div — the same durable `data-*` family we anchor organic
 *  results on (data-hveid/data-sncf), not a rotating styling hash. Ads live in
 *  the `#tvcap`/`#bottomads` rails OUTSIDE `#rso`, and carry a
 *  `div[role="heading"]` headline instead of an `<h3>`, so the organic anchor
 *  never sees them — they need their own pass. Presence-matched (`[data-text-ad]`,
 *  not `="1"`) so a value change doesn't drop them. */
const SPONSORED_AD_SELECTOR = '[data-text-ad]';

/** Allow-list of a sponsored ad's OWN content: the headline
 *  `div[role="heading"]` (durable a11y role — screen readers announce an ad's
 *  headline as a heading, so Google keeps it, same rationale as the organic
 *  `<h3>`). This is the ONLY chrome-free content anchor an ad exposes: it has no
 *  `data-sncf` snippet, and Google injects a LOCATION extension (address, weekday
 *  opening hours, «Понад … відвідувань за останній місяць») rendered in the
 *  Search UI language. On a Russian ad shown to a Ukrainian user that injected
 *  chrome is Ukrainian and OUTWEIGHS the ad body — a whole-card sample flips the
 *  verdict to Ukrainian and the ad survives. So ads classify on the headline
 *  ALONE, with no whole-card fallback (see {@link toContentNode}): fail open (an
 *  unreadable headline → empty text → kept), never re-admit the localized chrome
 *  the way the organic fallback safely can. */
const AD_CONTENT_SELECTORS = ['[role="heading"]'];

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

/**
 * Climb from a language-labeled element to the whole unit it labels: the
 * highest ancestor that still contains none of the page's other landmarks —
 * the #rso results list, any selected result/PAA card, any other labeled
 * block. A labeled unit is a self-contained subtree sitting NEXT TO the
 * results, never around them, so the climb tops out exactly one level below
 * their common ancestor: the full block, header and media carousel included,
 * not just the labeled text region. Landmarks already inside the labeled
 * element (a nested inner label) don't bound the climb — the outer label wins.
 *
 * With no landmark to bound the climb (no results on the page) the labeled
 * element itself is returned rather than risking a climb to <body>.
 */
function declaredBlockFor(
  rlEl: HTMLElement,
  root: ParentNode,
  landmarks: readonly Element[],
): HTMLElement {
  const foreign = landmarks.filter((l) => !rlEl.contains(l));
  if (foreign.length === 0) return rlEl;
  let block = rlEl;
  for (let parent = block.parentElement; parent !== null; parent = parent.parentElement) {
    if (root instanceof Element && !root.contains(parent)) break;
    if (foreign.some((f) => parent.contains(f))) break;
    block = parent;
  }
  return block;
}

/** The language-labeled units on a SERP, keyed for node-building: the set of
 *  blocks to hide, each block's declared language (normalized, when its label
 *  resolves), and the labeled REGION whose text classifies it. */
interface LabeledBlocks {
  blocks: Set<HTMLElement>;
  declaredByBlock: Map<HTMLElement, LanguageCode>;
  labelRegionByBlock: Map<HTMLElement, HTMLElement>;
}

/**
 * Collect language-labeled units, anchored on Google's data-rl declared-language
 * attribute (today: the AI Overview). Sanity guards: a labeled element that
 * CONTAINS the #rso results list, or any selected result/PAA card, cannot be a
 * self-contained labeled unit (those sit alongside the results, never around
 * them) — treating such a wrapper as one node would swallow the per-card nodes
 * via the outermost-wins pass and hide them wholesale on one verdict. Skip it
 * and let the per-card nodes do their atomic work. Each surviving label is
 * climbed to its whole unit ({@link declaredBlockFor}) so a conceal removes the
 * block's header and media, not just the labeled region; the label's value is
 * normalized HERE, so the model hands the filter a known code or nothing.
 */
function collectLabeledBlocks(
  root: ParentNode,
  atomicUnits: readonly HTMLElement[],
): LabeledBlocks {
  const rso = root.querySelector('#rso');
  const labeled = [...root.querySelectorAll<HTMLElement>(DECLARED_LANG_SELECTOR)].filter(
    (el) => el.querySelector('#rso') === null && !atomicUnits.some((unit) => el.contains(unit)),
  );
  const blocks = new Set<HTMLElement>();
  const declaredByBlock = new Map<HTMLElement, LanguageCode>();
  const labelRegionByBlock = new Map<HTMLElement, HTMLElement>();
  for (const rlEl of labeled) {
    const block = declaredBlockFor(rlEl, root, [
      ...(rso === null ? [] : [rso]),
      ...atomicUnits,
      ...labeled.filter((other) => other !== rlEl),
    ]);
    blocks.add(block);
    // The classification sample is the LABELED region's own text, not the whole
    // block's: the block carries localized UI chrome («Огляд від ШІ», «Показати
    // більше») that would pull a language read toward the interface language and
    // mask a foreign answer. Google labels the answer region precisely, so its
    // text is the answer's language. First label wins per block.
    if (!labelRegionByBlock.has(block)) labelRegionByBlock.set(block, rlEl);
    const declared = normalizeBCP47(rlEl.getAttribute(DECLARED_LANG_ATTR) ?? '');
    if (declared !== null && !declaredByBlock.has(block)) declaredByBlock.set(block, declared);
  }
  return { blocks, declaredByBlock, labelRegionByBlock };
}

/** A set of declared-language result cards plus each block's normalized code. */
interface DeclaredResults {
  blocks: Set<HTMLElement>;
  declaredByBlock: Map<HTMLElement, LanguageCode>;
}

/**
 * Collect result cards Google labels with a `lang` attribute but that carry no
 * <h3> (product/shopping cards, whose title is a `role="heading"` div). Mirrors
 * {@link collectLabeledBlocks}'s guards and climb, with two differences: the
 * anchor is the standard `lang` attribute scoped to #rso, and {@link
 * extractGoogle} folds each block into the ORGANIC bucket — so these classify on
 * their own title+snippet allow-list and stay kind 'result', not 'ai-answer'.
 *
 * A `lang` element that CONTAINS a selected result/PAA/ad card can't itself be
 * one atomic result (it wraps one) — skip it and let the per-card nodes do their
 * atomic work. Each surviving label is climbed to its self-contained result unit
 * ({@link declaredBlockFor}); the code is normalized HERE. An inner `lang` span
 * (a foreign-language quote inside a result) resolves to its own block, but the
 * outermost-wins pass in {@link extractGoogle} drops it inside the enclosing
 * result — so the outer result's declaration is the one that survives.
 */
function collectDeclaredResults(
  root: ParentNode,
  atomicUnits: readonly HTMLElement[],
): DeclaredResults {
  const rso = root.querySelector('#rso');
  const labeled = [...root.querySelectorAll<HTMLElement>(DECLARED_RESULT_SELECTOR)].filter(
    (el) => !atomicUnits.some((unit) => el.contains(unit)),
  );
  const blocks = new Set<HTMLElement>();
  const declaredByBlock = new Map<HTMLElement, LanguageCode>();
  for (const langEl of labeled) {
    const block = declaredBlockFor(langEl, root, [
      ...(rso === null ? [] : [rso]),
      ...atomicUnits,
      ...labeled.filter((other) => other !== langEl),
    ]);
    blocks.add(block);
    const declared = normalizeBCP47(langEl.getAttribute('lang') ?? '');
    if (declared !== null && !declaredByBlock.has(block)) declaredByBlock.set(block, declared);
  }
  return { blocks, declaredByBlock };
}

/** Build the ContentNode for one selected element. Organic cards classify their
 *  own title+snippet (allow-list, widening to the whole card minus injected
 *  chrome only if those anchors come up short) — a `lang`-anchored product card
 *  is an organic card too, classified the same way but ALSO carrying its
 *  declaration. Sponsored ads are 'ad' and classify their headline ALONE via
 *  {@link AD_CONTENT_SELECTORS} — a pure allow-list with NO whole-card fallback,
 *  so Google's injected UI-language location extension can never enter the
 *  sample (an empty headline yields empty text and the ad is kept, failing
 *  open). Labeled units are 'ai-answer' and classify the labeled REGION's text
 *  (the answer), keeping the block's UI chrome out of the sample even though the
 *  whole block `el` is what conceals. Both declared-language sources — the
 *  `lang` product cards and the `data-rl` answers — reach `declaredByEl`, so a
 *  node's declaration is read from there regardless of which found it. PAA rows
 *  serialize whole — the row IS the question text. */
function toContentNode(
  el: HTMLElement,
  organic: ReadonlySet<HTMLElement>,
  sponsored: ReadonlySet<HTMLElement>,
  labeled: LabeledBlocks,
  declaredByEl: ReadonlyMap<HTMLElement, LanguageCode>,
): ContentNode {
  let kind: ContentNode['kind'] = 'result';
  if (labeled.blocks.has(el)) kind = 'ai-answer';
  else if (sponsored.has(el)) kind = 'ad';

  let text: string;
  if (organic.has(el)) {
    text = serializeContentText(el, {
      content: ORGANIC_CONTENT_SELECTORS,
      excludeOnFallback: FALLBACK_CHROME_SELECTOR,
    });
  } else if (sponsored.has(el)) {
    text = serializeNodeText(el, AD_CONTENT_SELECTORS);
  } else {
    text = serializeElementText(labeled.labelRegionByBlock.get(el) ?? el);
  }

  const node: ContentNode = { el, kind, hideMode: 'hide', text };
  const declared = declaredByEl.get(el);
  if (declared !== undefined) node.declaredLang = declared;
  return node;
}

function extractGoogle(root: ParentNode): PageContentModel {
  // Reliable sources, each in its own set because their text is serialized
  // differently (see toContentNode): organic results (anchor each #rso <h3> to
  // its data-hveid card), People-also-ask question rows, and sponsored ads.
  const organic = new Set<HTMLElement>();
  for (const h3 of root.querySelectorAll<HTMLElement>(ORGANIC_TITLE_ANCHOR)) {
    const card = organicCardFor(h3, root);
    if (card) organic.add(card);
  }

  const paa = new Set<HTMLElement>();
  for (const question of root.querySelectorAll<HTMLElement>(PAA_QUESTION_SELECTOR)) {
    paa.add(question);
  }

  // Sponsored text ads — the paid rails above/below the organic results.
  const sponsored = new Set<HTMLElement>();
  for (const ad of root.querySelectorAll<HTMLElement>(SPONSORED_AD_SELECTOR)) {
    sponsored.add(ad);
  }

  // Declared-language results: cards Google labels with a standard `lang` whose
  // title is NOT an <h3> (product/shopping cards). Fold each into the organic
  // bucket — same result kind + own-content allow-list — and carry the
  // declaration so the fused gate can decide the card on Google's own label.
  const declaredResults = collectDeclaredResults(root, [...organic, ...paa, ...sponsored]);
  for (const block of declaredResults.blocks) organic.add(block);

  const labeled = collectLabeledBlocks(root, [...organic, ...paa, ...sponsored]);

  // One declared-language lookup keyed by element: the `lang`-anchored results
  // plus the `data-rl`-labeled answers. toContentNode reads a node's declaration
  // from here regardless of which source found it.
  const declaredByEl = new Map<HTMLElement, LanguageCode>([
    ...declaredResults.declaredByBlock,
    ...labeled.declaredByBlock,
  ]);

  // Drop any element nested inside another selected one — keep the outermost
  // result container, so nested cards (e.g. sitelinks carrying their own
  // data-hveid under a parent result, or an inner `lang` quote under a product
  // card) collapse to one node instead of two.
  const all = [...organic, ...paa, ...sponsored, ...labeled.blocks];
  const nodes: ContentNode[] = all
    .filter((el) => !all.some((other) => other !== el && other.contains(el)))
    .map((el) => toContentNode(el, organic, sponsored, labeled, declaredByEl));

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
