/**
 * Single source of truth for the `data-movar-*` attribute names Movar stamps on
 * the DOM it owns — curtain hosts, survivor-tooltip hosts, and the per-node
 * conceal markers. These are a STABLE CONTRACT: the string values must not
 * change. The popup's hidden-summary, the "Show everything" reveal sweeps, and
 * the cross-module selectors all key on them.
 *
 * Why colocate them here: the content-script MutationObserver's
 * `isMovarOwnedMutation` predicate (see `installMutationObserver` in
 * content-runtime) has to recognise Movar's *own* insertions so a conceal batch
 * doesn't re-arm the apply loop. The modules that stamp the markers
 * (`curtain.ts`, `tooltip.ts`, `content-conceal.ts`, `content-modification.ts`,
 * `hidden-summary.ts`) and that predicate must agree on the exact attribute
 * names — when they each kept a private copy, the "ignore our own DOM" rule
 * could silently drift from the attributes it was meant to match. One module,
 * no drift.
 */

/** Curtain host (blur / cover overlay), appended to the concealed target. */
export const CURTAIN_HOST_ATTR = 'data-movar-curtain';
/** Survivor-tooltip host, appended to `document.body`. */
export const TOOLTIP_HOST_ATTR = 'data-movar-tooltip';
/** Hard-hide marker (`display:none`); its value is the reason
 *  (`not-in-priority` for picker items, `content-filter:…` for cards). */
export const HIDDEN_ATTR = 'data-movar-hidden';
/** Marks a content card concealed by a blur curtain. */
export const CONTENT_BLURRED_ATTR = 'data-movar-content-blurred';
/** Marks a node the user explicitly revealed via the curtain. */
export const REVEALED_ATTR = 'data-movar-revealed';
/** "Scanned, not blocked" sentinel — skip on the next filter pass. */
export const CONTENT_CHECKED_ATTR = 'data-movar-content-checked';

/** Selector matching every element Movar inserts or stamps. The MutationObserver
 *  predicate uses it to recognise (and skip) its own concealment DOM. */
export const MOVAR_OWNED_SELECTOR = [
  CURTAIN_HOST_ATTR,
  TOOLTIP_HOST_ATTR,
  HIDDEN_ATTR,
  CONTENT_BLURRED_ATTR,
  REVEALED_ATTR,
  CONTENT_CHECKED_ATTR,
]
  .map((attr) => `[${attr}]`)
  .join(',');

/** True when `node` is — or is contained by — an element Movar owns or stamped.
 *  Non-element nodes (text/comment) are never Movar-owned: Movar only inserts
 *  marked *elements* (curtain/tooltip hosts) into the light DOM, so a bare text
 *  node added to the page is a genuine page change. */
export function isMovarOwnedNode(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.closest(MOVAR_OWNED_SELECTOR) !== null;
}

/**
 * True when a MutationObserver batch consists *only* of Movar's own insertions
 * — i.e. no record adds a node the page itself introduced.
 *
 * Such batches are the feedback from our own conceal pass: each pass appends
 * curtain/tooltip hosts into the observed `document.body` subtree, which the
 * observer would otherwise read as "the page changed" and schedule yet another
 * full re-walk — a self-perpetuating cadence on busy pages.
 *
 * Keyed on ADDED nodes only. The in-place hides Movar performs (setting
 * `display:none` + `data-movar-hidden` on a site card) are attribute mutations,
 * which the observer is not configured to watch, so they never reach this
 * predicate. A record with no added nodes (a pure removal) likewise doesn't
 * count as a page addition, so it doesn't re-arm the loop either.
 */
export function isMovarOwnedMutation(records: readonly MutationRecord[]): boolean {
  return records.every((record) => [...record.addedNodes].every(isMovarOwnedNode));
}
