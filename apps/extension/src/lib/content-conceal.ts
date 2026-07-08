/**
 * Per-node conceal/reveal primitives for the page-content module.
 *
 * concealNode      — attach a blur curtain (blur mode) or display:none (hide
 *                    mode) to a ContentNode. Idempotent.
 * revealNode       — remove the curtain + BLURRED marker; mark REVEALED so
 *                    future applyContentFilter passes skip this node.
 * revealAllNodes   — sweep every BLURRED node on the page (or in `root`).
 * isConcealed      — true when the node has been blurred or hidden by Movar.
 * isRevealed       — true when the user clicked "Show" on the curtain.
 * applyContentFilter — the main per-model scan-and-conceal loop.
 */
import { isFusedVerdict } from '@movar/lang-detect';
import type { FusedVerdict, LanguageCode, SnippetItem, SnippetVerdict } from '@movar/lang-detect';
import type { ConcealMode } from '@movar/settings';
import type { ContentPresenter } from './content-presenter';
import { isHiddenElement } from '@movar/page-content';
import { isDeclaredLangNode } from '@movar/page-content/types';
import type {
  ContentNode,
  FilteredCard,
  HideMode,
  PageContentModel,
} from '@movar/page-content/types';
import {
  HIDDEN_ATTR,
  CONTENT_CHECKED_ATTR as CHECKED_ATTR,
  CONTENT_BLURRED_ATTR as BLURRED_ATTR,
  REVEALED_ATTR,
} from './movar-markers';

// ─── Data attributes (stable contract — must not change) ─────────────────
// Names live in ./movar-markers (imported at the top) so the content-script
// observer's "ignore our own insertions" predicate can't drift from what we
// stamp here. CHECKED/BLURRED are aliased to keep this module's local names.

// ─── Node-state predicates ────────────────────────────────────────────────

/**
 * True when the node has been actively concealed — either blurred (curtain
 * attached) or hard-hidden (display:none). Does NOT include the CHECKED_ATTR
 * (scanned-but-not-blocked) marker, since that is a "was examined" sentinel,
 * not a "is hidden" one.
 */
export function isConcealed(node: ContentNode): boolean {
  return node.el.hasAttribute(BLURRED_ATTR) || node.el.hasAttribute(HIDDEN_ATTR);
}

/** True when the user has explicitly revealed this node via the curtain. */
export function isRevealed(node: ContentNode): boolean {
  return node.el.hasAttribute(REVEALED_ATTR);
}

/**
 * True when this node should be skipped entirely on the next filter pass —
 * already concealed, already revealed by the user, or already scanned and
 * found not to be blocked.
 */
function shouldSkip(node: ContentNode): boolean {
  return (
    node.el.hasAttribute(REVEALED_ATTR) ||
    node.el.hasAttribute(BLURRED_ATTR) ||
    node.el.hasAttribute(HIDDEN_ATTR) ||
    node.el.hasAttribute(CHECKED_ATTR)
  );
}

// ─── Conceal-mode resolution ──────────────────────────────────────────────

/** Resolve the user's conceal-mode preference to the concrete DOM treatment.
 *  `ContentNode.hideMode` is older model metadata and no longer acts as a floor:
 *  curtain means a reversible curtain everywhere, hide means `display:none`
 *  everywhere. See docs/content-filtering-modes.md. */
export function concealModeToHideMode(pref: ConcealMode): HideMode {
  return pref === 'hide' ? 'hide' : 'blur';
}

/** Per-pass conceal inputs the node itself can't carry. Injected by the
 *  content-modification facade so this module stays settings-free. */
export interface ConcealOptions {
  /** The user's conceal-mode preference. */
  concealMode: ConcealMode;
  /** Optional presentation surface. Omit it in hide mode so no curtain/tooltip
   *  code is pulled into the structural chunk. */
  presenter?: ContentPresenter;
  /** Persist 'hide' as the standing preference — invoked by a blur curtain's
   *  "Hide all" action. The facade wires this to settings; omitted in contexts
   *  that don't persist (e.g. direct unit tests). */
  onHideAll?: (() => void) | undefined;
}

// ─── Internal hide helpers ────────────────────────────────────────────────

function attachBlurCurtain(node: ContentNode, language: LanguageCode, opts: ConcealOptions): void {
  const presenter = opts.presenter;
  if (presenter?.hasVisiblePresentation !== true) {
    hideCard(node.el, node, language);
    return;
  }
  const el = node.el;
  el.setAttribute(BLURRED_ATTR, language);
  const handle = presenter.attachContentCurtain({
    target: el,
    language,
    reveal: () => {
      el.removeAttribute(BLURRED_ATTR);
      el.setAttribute(REVEALED_ATTR, 'true');
    },
    hideAll: () => {
      hideAllConcealed(document, presenter);
      opts.onHideAll?.();
    },
  });
  if (handle !== null) return;

  el.removeAttribute(BLURRED_ATTR);
  hideCard(el, node, language);
}

function hideCard(el: HTMLElement, node: ContentNode, language: LanguageCode): void {
  el.setAttribute(HIDDEN_ATTR, `content-filter:${node.kind}:${language}`);
  el.style.setProperty('display', 'none', 'important');
}

// ─── Empty-container cleanup ──────────────────────────────────────────────
//
// General rule, not site-specific: concealing a node can leave its parent
// container with nothing left to show — a sources list whose every citation
// just got hidden, a shelf whose every item is gone. Left alone that's a
// dangling empty box (or, in curtain mode, nothing at all — see below). This
// module owns the CLEANUP (not @movar/page-content, which stays concealment-
// free) so every conceal path gets it for free, not just Google's — but reuses
// page-content's own hidden-element test (isHiddenElement) rather than a
// second copy, so the two modules' notions of "hidden" can't drift apart.

/** Replaced/media elements that render visually with no child text of their
 *  own — must count as "content" or an emptied text check would wrongly treat
 *  a container that still shows a lone image/icon as empty. */
const VISUAL_LEAF_TAGS = new Set(['img', 'svg', 'video', 'canvas', 'iframe', 'picture', 'embed']);

/** True when `el` is something a user could see: not hidden outright, and
 *  either a visible media leaf, content inside an attached shadow root (a
 *  blur-mode curtain is a CHILD of its target, curtain.ts, but renders its
 *  pill inside an `open` shadow root — invisible to plain childNodes
 *  traversal, so a container whose cards are curtained rather than hidden
 *  must not be misread as empty), or a visible descendant. */
function isVisibleElement(el: Element): boolean {
  if (isHiddenElement(el)) return false;
  if (VISUAL_LEAF_TAGS.has(el.tagName.toLowerCase())) return true;
  if (el.shadowRoot !== null && hasVisibleContent(el.shadowRoot)) return true;
  return [...el.childNodes].some(hasVisibleContent);
}

/** True when `node` — element, shadow root, or text — has any visible content
 *  anywhere in its subtree: non-whitespace text, a visible media leaf, or
 *  shadow-root content, recursing through non-hidden descendants only, so a
 *  display:none child (ours or the page's own) contributes nothing — same
 *  as serialize.ts's text walk. */
function hasVisibleContent(node: Node): boolean {
  switch (node.nodeType) {
    case Node.TEXT_NODE: {
      return (node.nodeValue ?? '').trim() !== '';
    }
    case Node.ELEMENT_NODE: {
      return isVisibleElement(node as Element);
    }
    case Node.DOCUMENT_FRAGMENT_NODE: {
      return [...node.childNodes].some(hasVisibleContent);
    }
    default: {
      return false;
    }
  }
}

/**
 * After concealing `el`, climb its ancestor chain and hard-hide any ancestor
 * now left with no visible content of its own. Stops at the first ancestor
 * that still has visible content (nothing further up can be empty either, so
 * there's nothing more to do), or at an ancestor already marked HIDDEN_ATTR
 * (a previous card's climb already resolved everything above it, and
 * concealment only ever removes visibility within one pass — never restores
 * it — so that resolution can't have gone stale). Never climbs to
 * `<body>`/`<html>`: this is page-content cleanup, not page-chrome removal.
 *
 * Marked with the same `content-filter:` HIDDEN_ATTR reason prefix as a
 * regular hide, so revealAllNodes/hideAllConcealed sweep these containers
 * too — "Show everything" must bring an emptied section back along with its
 * cards.
 */
function concealEmptyAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent !== null && parent !== document.body && parent !== document.documentElement) {
    if (parent.hasAttribute(HIDDEN_ATTR)) return;
    if (hasVisibleContent(parent)) return;
    parent.setAttribute(HIDDEN_ATTR, 'content-filter:container:empty');
    parent.style.setProperty('display', 'none', 'important');
    parent = parent.parentElement;
  }
}

// ─── Public conceal/reveal API ────────────────────────────────────────────

/**
 * Conceal a ContentNode whose language is blocked. Dispatches on the
 * user's `opts.concealMode`: 'curtain' attaches a reversible curtain, 'hide'
 * sets display:none.
 *
 * The blur curtain is delegated to an injected presenter. In hide mode, or when
 * presenter loading fails, the fallback is a hard hide so blocked content still
 * disappears without loading UI bytes.
 *
 * Returns true when a new concealment was applied, false when already
 * concealed/revealed (idempotent).
 */
export function concealNode(
  node: ContentNode,
  language: LanguageCode,
  opts: ConcealOptions,
): boolean {
  // Guard against double-conceal or concealing a user-revealed card.
  // Deliberately does NOT check CHECKED_ATTR — that marker means "was scanned
  // but not blocked"; concealNode may be called directly by callers who set
  // their own gate before this point.
  if (isRevealed(node) || isConcealed(node)) return false;
  if (concealModeToHideMode(opts.concealMode) === 'hide') {
    hideCard(node.el, node, language);
  } else {
    attachBlurCurtain(node, language, opts);
  }
  concealEmptyAncestors(node.el);
  return true;
}

/**
 * Remove the blur curtain from `node` and mark it REVEALED so subsequent
 * filter passes skip it.
 */
export function revealNode(node: ContentNode, presenter?: ContentPresenter): void {
  node.el.removeAttribute(BLURRED_ATTR);
  node.el.setAttribute(REVEALED_ATTR, 'true');
  presenter?.detachCurtains(node.el);
}

/** Selector for content cards hard-hidden by the content filter (reason prefix
 *  `content-filter:…`), as opposed to picker links hidden with reason
 *  `not-in-priority`. Keeps the two concealment channels from crossing in the
 *  page-wide sweeps below. */
const HIDDEN_CONTENT_SELECTOR = `[${HIDDEN_ATTR}^="content-filter"]`;

/**
 * Sweep every concealed content card inside `root` and reveal them all, marking
 * each REVEALED so subsequent filter passes skip it. Covers BOTH concealment
 * shapes symmetrically: blurred cards (curtain detached) and hard-hidden cards
 * (display:none cleared). Used by the popup's "Show everything on this page".
 *
 * The hard-hide branch is what makes a popup reveal durable: without the
 * REVEALED stamp, the next applyContentFilter pass would re-hide the card the
 * moment the page re-renders (the blur path has always had this; the hide path
 * did not). Picker hides use a different reason and are handled separately.
 */
export function revealAllNodes(root: ParentNode = document, presenter?: ContentPresenter): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    card.setAttribute(REVEALED_ATTR, 'true');
    presenter?.detachCurtains(card);
  }
  for (const card of root.querySelectorAll<HTMLElement>(HIDDEN_CONTENT_SELECTOR)) {
    card.removeAttribute(HIDDEN_ATTR);
    card.style.removeProperty('display');
    card.setAttribute(REVEALED_ATTR, 'true');
  }
}

/**
 * Escalate every blurred content card inside `root` to a hard hide: detach the
 * curtain, drop the BLURRED marker, and set display:none. Used by the curtain's
 * "Hide all" action and by the content-modification facade to enforce 'hide'
 * mode on cards that were curtained before the user escalated. Idempotent —
 * already-hidden cards have no BLURRED marker, so they're left untouched.
 *
 * Does NOT mark cards REVEALED: a hidden card is still concealed, just more
 * firmly. A later "Show everything" reveals them via {@link revealAllNodes}.
 */
export function hideAllConcealed(root: ParentNode = document, presenter?: ContentPresenter): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    const language = card.getAttribute(BLURRED_ATTR) ?? '';
    presenter?.detachCurtains(card);
    card.removeAttribute(BLURRED_ATTR);
    card.setAttribute(HIDDEN_ATTR, `content-filter:escalated:${language}`);
    card.style.setProperty('display', 'none', 'important');
  }
}

/**
 * De-escalate every hard-hidden content card inside `root` back into a curtain:
 * clear `display:none` + HIDDEN_ATTR, attach a curtain, and mark BLURRED. Mirror
 * of {@link hideAllConcealed} for the opposite mode switch — used by the
 * content-modification facade to enforce 'curtain' mode on cards hidden before
 * the user de-escalated. Idempotent — already-curtained cards have no
 * HIDDEN_ATTR content-filter reason, so they're left untouched.
 *
 * Picker hides (`not-in-priority`) are a different concealment channel and
 * never match {@link HIDDEN_CONTENT_SELECTOR}, so they are untouched here.
 *
 * No ContentNode is available for a card found this way (only a raw element
 * survives in the DOM), so this bypasses {@link concealNode}/attachBlurCurtain
 * and calls the presenter directly. When presentation isn't available (no
 * presenter, or attach fails), the card is left exactly as it was — hidden is
 * still a valid concealed state, just not the requested one.
 */
export function curtainAllHidden(root: ParentNode = document, presenter?: ContentPresenter): void {
  if (presenter?.hasVisiblePresentation !== true) return;
  for (const card of root.querySelectorAll<HTMLElement>(HIDDEN_CONTENT_SELECTOR)) {
    const reason = card.getAttribute(HIDDEN_ATTR) ?? '';
    const language: LanguageCode = reason.slice(reason.lastIndexOf(':') + 1);
    card.removeAttribute(HIDDEN_ATTR);
    card.style.removeProperty('display');
    card.setAttribute(BLURRED_ATTR, language);
    const handle = presenter.attachContentCurtain({
      target: card,
      language,
      reveal: () => {
        card.removeAttribute(BLURRED_ATTR);
        card.setAttribute(REVEALED_ATTR, 'true');
      },
      hideAll: () => {
        hideAllConcealed(document, presenter);
      },
    });
    if (handle !== null) continue;
    // Presentation failed after DOM was already updated for the new mode —
    // fall back to a hard hide rather than leaving the card BLURRED with no
    // curtain attached (invisible/unreachable, since blur alone applies no
    // visual treatment without the presenter's curtain UI).
    card.removeAttribute(BLURRED_ATTR);
    card.setAttribute(HIDDEN_ATTR, `content-filter:escalated:${language}`);
    card.style.setProperty('display', 'none', 'important');
  }
}

/**
 * Strip every bookkeeping mark Movar added — BLURRED and CHECKED on cards,
 * plus their curtains — without marking any card REVEALED. Used when the
 * user turns content modification OFF in the popup.
 *
 * Deliberately leaves REVEALED_ATTR alone — that flag records per-card
 * "Show" clicks the user made on the curtain itself, and those choices
 * should survive a toggle off/on cycle.
 *
 * Equivalent to the old `clearAllContentMarks`.
 */
export function clearAllMarks(root: ParentNode = document, presenter?: ContentPresenter): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    presenter?.detachCurtains(card);
  }
  for (const card of root.querySelectorAll<HTMLElement>(`[${CHECKED_ATTR}]`)) {
    card.removeAttribute(CHECKED_ATTR);
  }
}

// ─── Main filter loop ─────────────────────────────────────────────────────

/** Batched snippet classifier. Receives every scanned card (its text, plus a
 *  declared language when the model labels the node) and the candidate codes,
 *  and returns one verdict (or null) per item, in order — a rung-margin
 *  {@link SnippetVerdict} for text-only cards, a {@link FusedVerdict} for
 *  declared ones. The whole classifier — the language profiles AND franc — runs
 *  behind this, off the content thread: the extension wires it to the background
 *  worker (`classifySnippets`); tests inject a direct in-process classifier. */
export type SnippetClassifier = (
  items: readonly SnippetItem[],
  candidateCodes: readonly LanguageCode[],
) => Promise<readonly (SnippetVerdict | FusedVerdict | null)[]>;

/** Inputs for {@link applyContentFilter}. */
export interface ContentFilterOptions {
  /** Languages to tell apart — the user's enabled languages ∪ the imposed
   *  overlay (today: priority ∪ blocked), as codes. Empty disables the filter. */
  candidateCodes: readonly LanguageCode[];
  /** Languages the user keeps. A card is concealed only when its detected
   *  language is confidently NOT one of these (the allowlist predicate). */
  enabled: ReadonlySet<LanguageCode>;
  /** Classifier for the scanned card texts — runs off the content thread (the
   *  language profiles + franc live in the worker, not the content bundle). */
  classify: SnippetClassifier;
  /** User's conceal-mode preference. */
  concealMode: ConcealMode;
  /** Presenter for curtain mode. Omit in hide mode. */
  presenter?: ContentPresenter;
  /** Persist 'hide' as the standing preference — threaded to each blur curtain's
   *  "Hide all" action. */
  onHideAll?: (() => void) | undefined;
  /** Staleness predicate, checked once immediately after the async classify
   *  round-trip and before the conceal loop. When it returns true the tick has
   *  been superseded (settings toggled off, "Show everything", pause) — bail
   *  with no concealment so we don't re-hide cards the user just revealed. The
   *  worker round-trip itself isn't cancellable, so this gates only the
   *  post-await DOM writes — which is the only window that could re-conceal. */
  isStale?: (() => boolean) | undefined;
}

/** Minimum lead a verdict must clear before a *hide* — a keep needs none. The
 *  bar tightens for less-trusted rungs (the block-only asymmetry; see the ADR
 *  docs/per-snippet-language-detection.md). */
/** Rung 3 (franc) minimum score-gap needed to commit a hide. Calibrated
 *  against distinctive-free residual titles: genuinely-Russian ones franc-rank
 *  ru at ~0.24–0.45, while Ukrainian almost always trips rung 1/2a; 0.22
 *  catches the ru residual without an observed uk over-hide. */
const FRANC_MIN_HIDE_MARGIN = 0.22;

/** Rung identifier for the franc (character-trigram) classifier. */
const FRANC_RUNG = 3;

function minHideMargin(rung: SnippetVerdict['rung']): number {
  switch (rung) {
    case 1:
    case '2a': {
      return 1;
    }
    case '2b': {
      return 2;
    }
    case FRANC_RUNG: {
      return FRANC_MIN_HIDE_MARGIN;
    }
    // null verdict → never hide
    case null: {
      return Number.POSITIVE_INFINITY;
    }
  }
}

/** One card queued for the classifier: the node to conceal and the wire item
 *  (its text, plus a declared language when the model labels the node). */
interface ScannableCard {
  node: ContentNode;
  item: SnippetItem;
}

/** Collect the cards to classify this pass. A node the model declares carries
 *  its declaration and is scannable even with empty text; an undeclared node
 *  with no text yet is lazy-loading — skipped (unmarked) for the next mutation
 *  pass. A card is marked CHECKED only when it has a full text read to commit
 *  to, so a declaration-only card (empty text) re-fuses once its text streams. */
function collectScannableCards(nodes: readonly ContentNode[]): ScannableCard[] {
  const cards: ScannableCard[] = [];
  for (const node of nodes) {
    if (shouldSkip(node)) continue;
    const declared = isDeclaredLangNode(node) ? node.declaredLang : undefined;
    if (declared === undefined && !node.text) continue;
    if (node.text) node.el.setAttribute(CHECKED_ATTR, 'true');
    cards.push({
      node,
      item: declared === undefined ? { text: node.text } : { text: node.text, declared },
    });
  }
  return cards;
}

/** Decide a declared card on its fused verdict — langtell already combined the
 *  page's declaration with the card's own text (the declaration decides on
 *  weak/absent text; a confident text read overrides a mislabel) and applied
 *  its own winning-score threshold, so a non-unknown verdict is a real one.
 *  Conceal iff that language isn't kept. A keep is left unmarked here: the
 *  collection loop marks CHECKED only for cards that carried text, so a
 *  declaration-only card (empty text) re-fuses once its text streams in. */
function decideFused(
  node: ContentNode,
  verdict: FusedVerdict,
  enabled: ReadonlySet<LanguageCode>,
  hits: FilteredCard[],
  opts: ConcealOptions,
): void {
  if (verdict.language === 'unknown' || enabled.has(verdict.language)) return;
  if (concealNode(node, verdict.language, opts)) {
    hits.push({ el: node.el, fromLang: verdict.language, kind: node.kind });
  }
}

/** Conceal `node` when `verdict` is a confident, non-enabled language clearing
 *  the rung's hide margin, and push the hit. 'unknown', an enabled language, or
 *  a sub-bar lead all mean "keep". Shared by both filter phases. */
function concealIfBlocked(
  node: ContentNode,
  verdict: SnippetVerdict,
  enabled: ReadonlySet<LanguageCode>,
  hits: FilteredCard[],
  opts: ConcealOptions,
): void {
  if (
    verdict.language === 'unknown' ||
    enabled.has(verdict.language) ||
    verdict.margin < minHideMargin(verdict.rung)
  ) {
    return;
  }
  if (concealNode(node, verdict.language, opts)) {
    hits.push({ el: node.el, fromLang: verdict.language, kind: node.kind });
  }
}

/**
 * Scan every node in `model` and conceal any whose detected language is
 * confidently not in `enabled` (classified against `candidateCodes`). Idempotent
 * — nodes already concealed or user-revealed are skipped.
 *
 * A node the model labels with a declared language (e.g. Google's `data-rl`)
 * rides the SAME batch, carrying its declaration alongside its text. The worker
 * fuses the two: the declaration decides when the text is weak or absent (a
 * block whose answer hasn't streamed in yet), and a confident text read
 * overrides a mislabel — so a page that mislabels Ukrainian content as Russian
 * can't force a conceal, and one that mislabels Russian as Ukrainian doesn't
 * escape one. A declared card is scannable even with empty text; an undeclared
 * card with no text yet is left for the next mutation pass.
 *
 * Classification (rungs 1–3 — the language profiles and franc) runs off the
 * content thread via `classify`: collect every scanned card, classify the batch
 * in ONE round-trip, then conceal the confident, non-enabled hits. The conceal
 * decision — the block-only rung-margin gate for text cards, the fused gate for
 * declared ones — stays here. The blur curtains' color scheme is read from the
 * page-mode context. Returns the nodes newly concealed on this call, so the
 * caller can log one correction event per card.
 */
export async function applyContentFilter(
  model: PageContentModel,
  {
    candidateCodes,
    enabled,
    classify,
    concealMode,
    presenter,
    onHideAll,
    isStale,
  }: ContentFilterOptions,
): Promise<FilteredCard[]> {
  if (candidateCodes.length === 0) return [];
  const concealOpts: ConcealOptions = { concealMode };
  if (presenter) concealOpts.presenter = presenter;
  if (onHideAll) concealOpts.onHideAll = onHideAll;

  const hits: FilteredCard[] = [];

  // Collect every scannable card into the batch — each carries its text and,
  // when the model declares the node's language, that declaration.
  const cards = collectScannableCards(model.nodes);
  if (cards.length === 0) return hits;

  // One batched classification round-trip, then conceal the confident hits.
  const verdicts = await classify(
    cards.map((c) => c.item),
    candidateCodes,
  );
  // The classify await is the deepest async window in the apply tick. If the
  // user toggled the feature off, clicked "Show everything", or paused while it
  // was in flight, the page has already been revealed/torn down — concealing now
  // would re-hide cards with no further mutation to undo it. Bail before any DOM
  // write. (CHECKED markers set above survive; teardown sweeps them.)
  if (isStale?.() === true) return hits;
  cards.forEach(({ node }, i) => {
    const verdict = verdicts[i];
    if (!verdict) return;
    if (isFusedVerdict(verdict)) decideFused(node, verdict, enabled, hits, concealOpts);
    else concealIfBlocked(node, verdict, enabled, hits, concealOpts);
  });
  return hits;
}
