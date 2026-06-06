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
  if ((el as HTMLElement).hidden) return true;
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
 * `display:none`. Mirrors the per-element skip rules of {@link serializeNodeText}
 * so neither serializer leaks script/JSON/offscreen text into the sample.
 */
function collectVisibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? '';
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  if (isHiddenElement(node as Element)) return '';
  let text = '';
  for (const child of node.childNodes) text += collectVisibleText(child);
  return text;
}

/**
 * Serialize the visible text of an entire element without selector targeting.
 * Used when a card has no reliable inner selectors (e.g. Google SERP result
 * blocks). Walks the subtree and skips invisible descendants (script/style/
 * noscript, aria-hidden, hidden, display:none) — inline scripts and JSON
 * payloads inside SERP cards must not pollute the language sample — then
 * collapses whitespace and trims.
 */
export function serializeElementText(card: HTMLElement): string {
  if (isHiddenElement(card)) return '';
  return collectVisibleText(card).replace(/\s+/g, ' ').trim();
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
