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
import type { LanguageCode, SnippetVerdict } from '@movar/lang-detect';
import { attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';
import { getContentMessages } from './i18n/content';
import { getCurrentColorScheme } from '@movar/page-mode/context';
import type { ContentNode, FilteredCard, PageContentModel } from '@movar/page-content/types';

// ─── Data attributes (stable contract — must not change) ─────────────────

const HIDDEN_ATTR = 'data-movar-hidden';
const CHECKED_ATTR = 'data-movar-content-checked';
const BLURRED_ATTR = 'data-movar-content-blurred';
const REVEALED_ATTR = 'data-movar-revealed';

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

// ─── Internal hide helpers ────────────────────────────────────────────────

function attachBlurCurtain(el: HTMLElement, language: LanguageCode): void {
  el.setAttribute(BLURRED_ATTR, language);
  const content = getContentMessages();
  attachCurtain(el, {
    mode: 'cover',
    icon: defaultHiddenIcon(),
    title: content.contentHidden.title,
    description: content.contentHidden.descriptionForLanguage(language),
    ariaLabel: content.contentHidden.ariaLabelForLanguage(language),
    colorScheme: getCurrentColorScheme(),
    actions: [
      {
        label: content.contentHidden.show,
        onClick: (ctx) => {
          ctx.detach();
          el.removeAttribute(BLURRED_ATTR);
          el.setAttribute(REVEALED_ATTR, 'true');
        },
      },
    ],
  });
}

function hideCard(el: HTMLElement, node: ContentNode, language: LanguageCode): void {
  el.setAttribute(HIDDEN_ATTR, `content-filter:${node.kind}:${language}`);
  el.style.setProperty('display', 'none', 'important');
}

// ─── Public conceal/reveal API ────────────────────────────────────────────

/**
 * Conceal a ContentNode whose language is blocked. Dispatches on
 * `node.hideMode`: 'blur' attaches a curtain, 'hide' sets display:none.
 *
 * The blur curtain's color scheme is read from the page-mode context
 * (set by the content-script bootstrap and kept live by the watcher),
 * so this signature stays clean even as the orchestrator's state grows.
 *
 * Returns true when a new concealment was applied, false when already
 * concealed/revealed (idempotent).
 */
export function concealNode(node: ContentNode, language: LanguageCode): boolean {
  // Guard against double-conceal or concealing a user-revealed card.
  // Deliberately does NOT check CHECKED_ATTR — that marker means "was scanned
  // but not blocked"; concealNode may be called directly by callers who set
  // their own gate before this point.
  if (isRevealed(node) || isConcealed(node)) return false;
  if (node.hideMode === 'hide') {
    hideCard(node.el, node, language);
  } else {
    attachBlurCurtain(node.el, language);
  }
  return true;
}

/**
 * Remove the blur curtain from `node` and mark it REVEALED so subsequent
 * filter passes skip it.
 */
export function revealNode(node: ContentNode): void {
  node.el.removeAttribute(BLURRED_ATTR);
  node.el.setAttribute(REVEALED_ATTR, 'true');
  detachAllCurtains(node.el);
}

/**
 * Sweep every BLURRED card inside `root` and reveal them all. Used by the
 * popup's "Show all" action.
 *
 * Equivalent to the old `revealAllBlurred`.
 */
export function revealAllNodes(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    card.setAttribute(REVEALED_ATTR, 'true');
    detachAllCurtains(card);
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
export function clearAllMarks(root: ParentNode = document): void {
  for (const card of root.querySelectorAll<HTMLElement>(`[${BLURRED_ATTR}]`)) {
    card.removeAttribute(BLURRED_ATTR);
    detachAllCurtains(card);
  }
  for (const card of root.querySelectorAll<HTMLElement>(`[${CHECKED_ATTR}]`)) {
    card.removeAttribute(CHECKED_ATTR);
  }
}

// ─── Main filter loop ─────────────────────────────────────────────────────

/** Batched snippet classifier (rungs 1–3). Receives every scanned card's text
 *  plus the candidate language codes, and returns one verdict (or null) per text,
 *  in order. The whole classifier — the language profiles AND franc — runs behind
 *  this, off the content thread: the extension wires it to the background worker
 *  (`classifySnippets`); tests inject a direct in-process classifier. */
export type SnippetClassifier = (
  texts: readonly string[],
  candidateCodes: readonly LanguageCode[],
) => Promise<readonly (SnippetVerdict | null)[]>;

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

/** Conceal `node` when `verdict` is a confident, non-enabled language clearing
 *  the rung's hide margin, and push the hit. 'unknown', an enabled language, or
 *  a sub-bar lead all mean "keep". Shared by both filter phases. */
function concealIfBlocked(
  node: ContentNode,
  verdict: SnippetVerdict,
  enabled: ReadonlySet<LanguageCode>,
  hits: FilteredCard[],
): void {
  if (
    verdict.language === 'unknown' ||
    enabled.has(verdict.language) ||
    verdict.margin < minHideMargin(verdict.rung)
  ) {
    return;
  }
  if (concealNode(node, verdict.language)) {
    hits.push({ el: node.el, fromLang: verdict.language, kind: node.kind });
  }
}

/**
 * Scan every node in `model` and conceal any whose detected language is
 * confidently not in `enabled` (classified against `candidateCodes`). Idempotent
 * — nodes already concealed or user-revealed are skipped.
 *
 * Classification (rungs 1–3 — the language profiles and franc) runs off the
 * content thread via `classify`: collect every scanned card's text, classify the
 * batch in ONE round-trip, then conceal the confident, non-enabled hits. The
 * conceal decision (the block-only margin gate) stays here. The blur curtains'
 * color scheme is read from the page-mode context. Returns the nodes newly
 * concealed on this call, so the caller can log one correction event per card.
 */
export async function applyContentFilter(
  model: PageContentModel,
  { candidateCodes, enabled, classify }: ContentFilterOptions,
): Promise<FilteredCard[]> {
  if (candidateCodes.length === 0) return [];

  // Collect every scannable card (marking it CHECKED so the next pass skips it).
  const cards: { node: ContentNode; text: string }[] = [];
  for (const node of model.nodes) {
    if (shouldSkip(node)) continue;
    // Lazy-load: card is in DOM but text not yet populated. Skip without
    // marking — the next mutation pass will see it again once text hydrates.
    if (!node.text) continue;
    node.el.setAttribute(CHECKED_ATTR, 'true');
    cards.push({ node, text: node.text });
  }
  if (cards.length === 0) return [];

  // One batched classification round-trip, then conceal the confident hits.
  const verdicts = await classify(
    cards.map((c) => c.text),
    candidateCodes,
  );
  const hits: FilteredCard[] = [];
  cards.forEach(({ node }, i) => {
    const verdict = verdicts[i];
    if (verdict) concealIfBlocked(node, verdict, enabled, hits);
  });
  return hits;
}
