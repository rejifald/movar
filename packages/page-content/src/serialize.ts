/**
 * Text serialization helpers for the page-content module.
 *
 * serializeNodeText  — extract visible text from selector matches inside a
 *                      card element, with hidden-subtree skipping and
 *                      nested-match deduplication.
 * serializeModelText — join every node's pre-serialized text with newlines,
 *                      used when a caller needs the full page-content corpus.
 */
import type { PageContentModel } from './types';

/** Tags whose entire subtree is invisible to the user. */
const INVISIBLE_TAGS = new Set(['script', 'style', 'noscript']);

/**
 * Return true when `el` should be excluded from text extraction because
 * it is hidden from the user.
 */
function isHiddenElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (INVISIBLE_TAGS.has(tag)) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if ((el as HTMLElement).hidden !== false) return true;
  if ((el as HTMLElement).style.display === 'none') return true;
  return false;
}

/**
 * Concatenate text from every `textSelectors` match inside `card`, skipping
 * hidden subtrees and deduplicating nested matches.
 *
 * Hidden-subtree skip rules:
 *   - `aria-hidden="true"` elements and their descendants are skipped.
 *   - Elements with the `hidden` attribute are skipped.
 *   - Elements with `style.display === 'none'` are skipped.
 *   - `<script>`, `<style>`, `<noscript>` parents are skipped.
 *
 * Nested-match dedup: if element A contains element B and both match, only
 * A contributes text (the ancestor's textContent already covers B's).
 *
 * Whitespace is collapsed — runs of whitespace become a single space; the
 * result is trimmed.
 */
export function serializeNodeText(card: HTMLElement, textSelectors: readonly string[]): string {
  const matched = new Set<Element>();
  for (const sel of textSelectors) {
    for (const el of card.querySelectorAll(sel)) {
      matched.add(el);
    }
  }
  const matchedList = [...matched];
  const parts: string[] = [];
  for (const el of matchedList) {
    // Skip nested-inside-another-match — the ancestor's text already covers this.
    if (matchedList.some((other) => other !== el && other.contains(el))) continue;
    // Skip hidden elements.
    if (isHiddenElement(el)) continue;
    const raw = el.textContent.replace(/\s+/g, ' ').trim();
    if (raw) parts.push(raw);
  }
  return parts.join(' ');
}

/**
 * Collect text under `node`, pruning any element subtree that
 * {@link isHiddenElement} treats as invisible — `<script>`/`<style>`/
 * `<noscript>`, `aria-hidden="true"`, the `hidden` attribute, or
 * `display:none` — plus any subtree whose root matches `excludeSelector`.
 * Mirrors the per-element skip rules of {@link serializeNodeText} so neither
 * serializer leaks script/JSON/offscreen text into the sample.
 */
function collectVisibleText(node: Node, excludeSelector: string | undefined): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  if (isHiddenElement(el)) return '';
  // Caller-pruned subtrees: drop the element and everything under it. The
  // Google extractor uses this to keep its injected UI-language chrome (the
  // "Translate this page" link, the rich-annotation row) out of the result's
  // language sample.
  if (excludeSelector !== undefined && el.matches(excludeSelector)) return '';
  let text = '';
  for (const child of node.childNodes) text += collectVisibleText(child, excludeSelector);
  return text;
}

/**
 * Serialize the visible text of an entire element without selector targeting.
 * Used when a card has no reliable inner selectors (e.g. Google SERP result
 * blocks). Walks the subtree and skips invisible descendants (script/style/
 * noscript, aria-hidden, hidden, display:none) — inline scripts and JSON
 * payloads inside SERP cards must not pollute the language sample — then
 * collapses whitespace and trims.
 *
 * `excludeSelector` (optional) prunes any subtree whose root matches it — for
 * callers that need to drop known non-content regions before the text is
 * language-classified (e.g. Google's injected UI-language chrome).
 */
export function serializeElementText(card: HTMLElement, excludeSelector?: string): string {
  if (isHiddenElement(card)) return '';
  return collectVisibleText(card, excludeSelector).replace(/\s+/g, ' ').trim();
}

/** Below this many characters, a content allow-list is treated as having missed
 *  the result's body (e.g. a card's snippet anchor rotated, leaving only a short
 *  title), so {@link serializeContentText} widens to the whole-card fallback.
 *  Sits in the gap between a SERP title alone (tens of chars) and title+snippet
 *  (~150+). Tunable per caller via {@link ContentTextOptions.minChars}. */
export const CONTENT_TEXT_MIN_CHARS = 100;

/** Options for {@link serializeContentText}. `content` and `excludeOnFallback`
 *  must be disjoint — a selector that is both content and chrome makes no sense. */
export interface ContentTextOptions {
  /** Allow-list of selectors for the node's OWN content (title, snippet, …).
   *  Their combined text is the primary, chrome-free classification sample. */
  content: readonly string[];
  /** Selector for subtrees to prune from the WHOLE-CARD fallback (injected
   *  non-content chrome). Ignored on the primary path. */
  excludeOnFallback?: string;
  /** Primary text shorter than this triggers the fallback. Default
   *  {@link CONTENT_TEXT_MIN_CHARS}. */
  minChars?: number;
}

/**
 * Hybrid card-text serializer: classify the result's OWN content, not its
 * container.
 *
 * Primary path — serialize only the `content` allow-list (e.g. title + snippet).
 * Because it's an allow-list, any chrome the host injects LATER (new annotation
 * rows, badges, links) is excluded for free — there is no ignore-list to grow.
 * This is the steady state for a well-formed card.
 *
 * Fallback path — when the allow-list yields too little text (`< minChars`: a
 * content anchor missed/rotated and we'd otherwise classify a bare title),
 * widen to the whole card with `excludeOnFallback` pruned. That keeps a usable
 * sample at the cost of re-admitting any chrome the block-list doesn't cover —
 * the rare, defensive case, not the norm. Returns whichever of the two samples
 * is longer, so the fallback never yields *less* signal than the allow-list.
 */
export function serializeContentText(card: HTMLElement, options: ContentTextOptions): string {
  const primary = serializeNodeText(card, options.content);
  if (primary.length >= (options.minChars ?? CONTENT_TEXT_MIN_CHARS)) return primary;
  const fallback = serializeElementText(card, options.excludeOnFallback);
  return fallback.length >= primary.length ? fallback : primary;
}

/**
 * Join every node's pre-serialized text with newlines, producing a corpus
 * string suitable for page-level language analysis.
 */
export function serializeModelText(model: PageContentModel): string {
  return model.nodes
    .map((n) => n.text)
    .filter(Boolean)
    .join('\n');
}
