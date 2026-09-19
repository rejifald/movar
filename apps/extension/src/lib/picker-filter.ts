import type { LanguageCode } from '@movar/lang-detect';
import type { ContentPresenter, PresenterHandle } from './content-presenter';
import { CURTAIN_HOST_ATTR } from './movar-markers';
import {
  HIDDEN_ATTR,
  LABEL_SEPARATORS,
  LEADING_SEPARATOR_RUN,
  ORIGINAL_BORDER_ATTRS,
  ORIGINAL_DISPLAY_ATTR,
  ORIGINAL_DISPLAY_PRIORITY_ATTR,
  ORIGINAL_TEXT_ATTR,
  RESTORED_ATTR,
  TEXT_DIVIDER_KIND,
  TRAILING_SEPARATOR_RUN,
} from '@movar/lang-pickers/types';
import type {
  ClassifiedLink,
  FilterOptions,
  FilterResult,
  Picker,
} from '@movar/lang-pickers/types';

/** Pattern for class tokens that mark an element as a visual separator
 *  ("divider", "lang-sep", "separator-line", "bullet-icon", etc.). Tokenised
 *  match — requires a delimiter on each side so we don't false-positive on
 *  unrelated words that happen to contain "sep". */
const DIVIDER_CLASS_PATTERN = /(^|[-_\s])(divider|separator|sep|bullet|pipe)([-_\s]|$)/i;

const PICKER_CURTAIN_KIND = 'picker-container';
const PICKER_ENTRY_CURTAIN_KIND = 'picker-entry';
const PICKER_BADGE_KIND = 'picker-badge';

/**
 * One mark Movar has put on the page, and what it currently says.
 *
 * Three registries share this shape — survivor tooltips (keyed by the anchor),
 * in-row chips (by the hidden entry) and control badges (by the control) — so
 * one detach and one currency check serve all of them. They were five maps and
 * three near-identical helpers, whose paired key/handle writes could drift and
 * leave a permanently-stale guard.
 *
 * WeakMap throughout: an anchor the site re-renders away takes its mark with it.
 */
interface Mark {
  handle: PresenterHandle;
  /** What this mark SAYS — see {@link surfaceKey}. */
  key: string;
}
type MarkRegistry = WeakMap<HTMLElement, Mark>;

const survivorTooltips: MarkRegistry = new WeakMap();
const entryChips: MarkRegistry = new WeakMap();
const controlBadgeMarks: MarkRegistry = new WeakMap();

/** Detach `el`'s mark from `registry`, if any — removing its host and its entry
 *  in the overlay's own registry. Idempotent. */
function detachMark(registry: MarkRegistry, el: HTMLElement): void {
  const mark = registry.get(el);
  if (!mark) return;
  mark.handle.detach();
  registry.delete(el);
}

/**
 * True when `el` already carries a mark saying exactly `key` AND that mark is
 * still ON THE PAGE.
 *
 * The connected check is what keeps idempotence from becoming erasure. The
 * page-wide sweeps (`detachAllCurtains` / `detachAllTooltips`) resolve handles
 * off the DOM and cannot reach these module-level maps, so after a pause, a
 * settings toggle or "Show everything" a registry still holds a mark whose host
 * is long gone. Keyed on presence alone, the next pass concluded "already
 * marked" and attached nothing — re-hiding the entry with no explanation and no
 * way back, which is the exact silent concealment this file exists to prevent.
 */
function markIsCurrent(registry: MarkRegistry, el: HTMLElement, key: string): boolean {
  const mark = registry.get(el);
  return mark?.key === key && mark.handle.host.isConnected;
}

/** Stable identity for a mark's copy: the hidden languages it names, plus the
 *  presenter's copy revision — the locale, which changes the WORDS without
 *  changing the languages, and which a locale-only settings change applies with
 *  no teardown behind it. */
function surfaceKey(
  hiddenLanguages: readonly LanguageCode[],
  presenter: ContentPresenter | undefined,
): string {
  return `${hiddenLanguages.join(',')}|${presenter?.copyRevision() ?? ''}`;
}

/** Text that is entirely separator characters and whitespace, and contains
 *  at least one non-whitespace separator. Pure-whitespace nodes are layout,
 *  not dividers. Separator set is the same one classifyLanguageElement uses
 *  for "UA | RU"-style bare-text splitting. */
function isPureSeparatorText(text: string): boolean {
  if (!text) return false;
  return /^[\s|/·•›→,;–—]+$/.test(text) && LABEL_SEPARATORS.test(text);
}

function hasDividerClass(el: HTMLElement): boolean {
  return typeof el.className === 'string' && DIVIDER_CLASS_PATTERN.test(el.className);
}

function isDividerCandidate(el: HTMLElement): boolean {
  if (hasDividerClass(el)) return true;
  return isPureSeparatorText(el.textContent.trim());
}

/** True when this picker-container direct child wraps (or is) a classified
 *  language link. Used by hideUselessDividers to identify the link-bearing
 *  slots; everything between them is fair game for divider detection. */
function childWrapsLanguageLink(child: HTMLElement, links: ClassifiedLink[]): boolean {
  return links.some((l) => l.el === child || child.contains(l.el));
}

/** True when every classified language link inside this child is hidden.
 *  Common case is one link per child; for the (rare) wrapper-of-many case
 *  we require ALL contained links to be hidden before treating the wrapper
 *  itself as a hidden link slot. */
function childIsHidden(child: HTMLElement, links: ClassifiedLink[]): boolean {
  const contained = links.filter((l) => l.el === child || child.contains(l.el));
  if (contained.length === 0) return false;
  return contained.every((l) => l.el.hasAttribute(HIDDEN_ATTR));
}

/**
 * Hide divider elements (visual separators between picker items —
 * `<span class="divider">|</span>`, `<i>·</i>`, etc.) whose immediately
 * adjacent classified-link siblings have been hidden by filterPickerLinks.
 *
 * A divider is "useful" only when both nearest link-bearing siblings are
 * still visible: a `|` between two visible links is structure, a `|` after
 * a hidden link is a stranded character. We walk the picker container's
 * direct children only — going deeper risks classifying a `/` inside a
 * button label as a divider.
 */
// Branchy by construction: two-pointer search for nearest link siblings
// on either side, plus the "hidden iff at least one side gone" decision.
// Each branch is a distinct case rather than nested logic, which is why
// the cyclomatic count is high relative to function length.
/* eslint-disable sonarjs/cognitive-complexity -- branchy two-pointer divider scan; each branch a distinct case, flattening obscures intent */
// fallow-ignore-next-line complexity
function hideUselessDividers(picker: Picker): void {
  const children = [...picker.container.children] as HTMLElement[];
  type Kind = 'link' | 'divider' | 'other';
  const kinds: Kind[] = children.map((child) => {
    if (childWrapsLanguageLink(child, picker.links)) return 'link';
    if (isDividerCandidate(child)) return 'divider';
    return 'other';
  });

  for (let i = 0; i < children.length; i++) {
    if (kinds[i] !== 'divider') continue;
    const divider = children[i];
    if (!divider) continue;
    let leftLink: HTMLElement | null = null;
    for (let j = i - 1; j >= 0; j--) {
      if (kinds[j] === 'link') {
        leftLink = children[j] ?? null;
        break;
      }
    }
    let rightLink: HTMLElement | null = null;
    for (let j = i + 1; j < children.length; j++) {
      if (kinds[j] === 'link') {
        rightLink = children[j] ?? null;
        break;
      }
    }
    const leftHidden = !leftLink || childIsHidden(leftLink, picker.links);
    const rightHidden = !rightLink || childIsHidden(rightLink, picker.links);
    if (leftHidden || rightHidden) {
      hideElement(divider, 'useless-delimiter');
    }
  }
}
/* eslint-enable sonarjs/cognitive-complexity -- re-enable after hideUselessDividers */

/**
 * Trim orphan separator runs (`UA  |  `) from the text of surviving leaf
 * links whose adjacent picker-container-level sibling is hidden. Covers
 * the 001.com.ua-style picker where the active language and its visual
 * `|` separator share a single text node, so they can't be hidden by
 * element-level passes (hideElement / hideUselessDividers).
 *
 * Only touches leaves (no element children) — anything with structure
 * would need DOM surgery, which the snapshot-and-restore contract doesn't
 * cover cleanly. Only touches links whose `link.el` is a direct child of
 * the picker container — nested cases (`<li><span>UA | </span></li>`)
 * would need to walk up to find the wrapper sibling, which is deferred.
 *
 * Original text is snapshotted in ORIGINAL_TEXT_ATTR so the popup's
 * "Show everything on this page" restore can put it back verbatim.
 * Repeated re-runs (MutationObserver re-fires) overwrite the snapshot
 * with the current pre-trim text, so a site re-render that replaces our
 * trimmed text with the original is followed by a fresh snapshot of the
 * (correct) original — not a stale one from the first pass.
 */
// Six guard clauses + two trim branches = high cyclomatic count, but the
/** Compute a trimmed separator text given the hidden state of each side.
 *  Returns `null` when no trim is needed (i.e. result equals input). */
function trimSeparatorText(text: string, prevHidden: boolean, nextHidden: boolean): string | null {
  if (!prevHidden && !nextHidden) return null;
  let trimmed = text;
  if (prevHidden) trimmed = trimmed.replace(LEADING_SEPARATOR_RUN, '');
  if (nextHidden) trimmed = trimmed.replace(TRAILING_SEPARATOR_RUN, '');
  return trimmed === text ? null : trimmed;
}

// guards are independent preconditions (each rules out a different class
// of input) rather than nested logic.
// fallow-ignore-next-line complexity
function trimOrphanSeparators(picker: Picker): void {
  for (const link of picker.links) {
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    if (link.el.children.length > 0) continue;
    if (link.el.parentElement !== picker.container) continue;
    const text = link.el.textContent;
    if (!LABEL_SEPARATORS.test(text)) continue;

    const prev = link.el.previousElementSibling;
    const next = link.el.nextElementSibling;
    const prevHidden = prev instanceof HTMLElement && prev.hasAttribute(HIDDEN_ATTR);
    const nextHidden = next instanceof HTMLElement && next.hasAttribute(HIDDEN_ATTR);
    const trimmed = trimSeparatorText(text, prevHidden, nextHidden);
    if (trimmed === null) continue;

    link.el.setAttribute(ORIGINAL_TEXT_ATTR, text);
    link.el.textContent = trimmed;
  }
}

/** Find the nearest element sibling of a node, walking past intervening
 *  text/comment nodes. Returns null if no such sibling exists. */
function adjacentElement(
  node: Node,
  direction: 'previousSibling' | 'nextSibling',
): HTMLElement | null {
  let cursor: Node | null = node[direction];
  while (cursor) {
    if (cursor.nodeType === Node.ELEMENT_NODE) return cursor as HTMLElement;
    cursor = cursor[direction];
  }
  return null;
}

/**
 * Trim orphan separators that live in TEXT NODES at the picker-container
 * level (siblings of the classified links, not children of them). This is
 * the spizhenko.clinic / many-WordPress-themes pattern:
 *
 *   <div>UA | <a>RU</a> | <a>EN</a></div>
 *
 * The active locale ("UA") and its trailing `|` share one text node; the
 * `|` between RU and EN is its own text node. When RU gets hidden by
 * filterPickerLinks, both the trailing `|` after UA and the standalone `|`
 * between RU and EN become stranded — element-level hide passes can't
 * touch them (text nodes have no style, no attributes).
 *
 * The fix wraps each affected text node in a marker `<span>` whose text
 * is the trimmed content, snapshotting the original on the wrapper so
 * `clearAllModifications` can put the verbatim text back. The wrapper
 * carries `data-movar-kind="text-divider"` so classifyContainerChildren
 * recognises it as structural and never classifies it as a language entry.
 *
 * Sibling to `trimOrphanSeparators` (which handles the leaf-link case
 * where the separator sits INSIDE a classified link's textContent) and
 * `hideUselessDividers` (which handles separator ELEMENTS).
 */
// Iterates childNodes, classifies each text node's two-sided "gone" state,
// then computes the trim — three independent decisions wrapped in one loop.
// fallow-ignore-next-line complexity
function trimContainerTextSeparators(picker: Picker): void {
  const container = picker.container;
  // Snapshot first; we mutate the DOM during iteration.
  const nodes = [...container.childNodes];
  for (const node of nodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const text = node.nodeValue ?? '';
    if (!text.trim()) continue;
    if (!LABEL_SEPARATORS.test(text)) continue;

    const prevEl = adjacentElement(node, 'previousSibling');
    const nextEl = adjacentElement(node, 'nextSibling');
    // Edge of container counts as "not gone" — there was never a sibling
    // there to be hidden, so the separator at that edge isn't orphan. The
    // text might still get trimmed on the OTHER side if that side is gone.
    const prevHidden = prevEl?.hasAttribute(HIDDEN_ATTR) ?? false;
    const nextHidden = nextEl?.hasAttribute(HIDDEN_ATTR) ?? false;
    const trimmed = trimSeparatorText(text, prevHidden, nextHidden);
    if (trimmed === null) continue;

    const span = container.ownerDocument.createElement('span');
    span.dataset['movarKind'] = TEXT_DIVIDER_KIND;
    span.setAttribute(ORIGINAL_TEXT_ATTR, text);
    span.textContent = trimmed;
    node.replaceWith(span);
  }
}

/** Snapshot an element's own inline value + priority for `property` into the
 *  given attributes, then write ours over it. Attribute-stored so the snapshot
 *  survives serialization / re-mounts in component frameworks. */
function overrideInlineProperty(
  el: HTMLElement,
  property: string,
  attrs: { value: string; priority: string },
  next: { value: string; priority: string },
): void {
  el.setAttribute(attrs.value, el.style.getPropertyValue(property));
  el.setAttribute(attrs.priority, el.style.getPropertyPriority(property));
  el.style.setProperty(property, next.value, next.priority);
}

/** Inverse of {@link overrideInlineProperty}: put the site's own inline value
 *  back verbatim when it had one, else remove the property entirely, then drop
 *  the consumed snapshot attributes. A blind `removeProperty` would wipe an
 *  inline value the element carried before Movar ever touched it. */
function restoreInlineProperty(
  el: HTMLElement,
  property: string,
  attrs: { value: string; priority: string },
): void {
  const original = el.getAttribute(attrs.value);
  const priority = el.getAttribute(attrs.priority);
  el.removeAttribute(attrs.value);
  el.removeAttribute(attrs.priority);
  if (original !== null && original !== '') {
    el.style.setProperty(property, original, priority ?? '');
  } else {
    el.style.removeProperty(property);
  }
}

const DISPLAY_ATTRS = { value: ORIGINAL_DISPLAY_ATTR, priority: ORIGINAL_DISPLAY_PRIORITY_ATTR };

/** Restore an element's inline `display` to exactly what {@link hideElement}
 *  snapshotted — value AND priority. Mirrors curtain.ts's
 *  revertReplaceSideEffects contract. Exported so content-modification.ts's
 *  site-wide HIDDEN_ATTR sweep (teardownContentModification) restores
 *  picker-hidden elements the same way, without needing to know the
 *  picker-filter internals. */
export function restoreOriginalDisplay(el: HTMLElement): void {
  restoreInlineProperty(el, 'display', DISPLAY_ATTRS);
}

/**
 * The separator sides a surviving entry can carry, paired with the sibling
 * direction each one faces. `left` is drawn against whatever precedes the
 * entry, `right` against whatever follows it.
 */
const BORDER_SIDES = [
  {
    property: 'border-left-width',
    towards: 'previousElementSibling',
    attrs: ORIGINAL_BORDER_ATTRS.left,
  },
  {
    property: 'border-right-width',
    towards: 'nextElementSibling',
    attrs: ORIGINAL_BORDER_ATTRS.right,
  },
] as const;

/** True when `property` currently resolves to a visible (non-zero) width. Read
 *  from computed style, not inline: the rule almost always comes from the
 *  site's stylesheet, which is the whole reason no node-level pass can see it. */
function hasVisibleBorder(el: HTMLElement, property: string): boolean {
  const view = el.ownerDocument.defaultView;
  if (!view) return false;
  const width = view.getComputedStyle(el).getPropertyValue(property);
  return width !== '' && Number.parseFloat(width) > 0;
}

/**
 * Zero a separator BORDER on a surviving entry's edge when the neighbour that
 * border was drawn against is now hidden.
 *
 * The fourth and subtlest divider shape. `hideUselessDividers` handles
 * separator ELEMENTS, `trimOrphanSeparators` separator characters inside a
 * surviving leaf, `trimContainerTextSeparators` separator TEXT NODES — but
 * stls.store draws its `|` as `border-right: 1px solid #e0e0e0` on the UA
 * entry itself. There is no node to hide or text to trim: once RU goes, that
 * rule is a stray vertical line hanging off the last remaining language.
 *
 * Runs AFTER hideUselessDividers on purpose — an intervening divider element
 * is hidden by then, so "immediate sibling is hidden" is the correct test even
 * when a `<span class="divider">` sat between the two entries. A neighbour
 * that is still visible keeps its border: that rule is separating the survivor
 * from something the user can still see.
 */
/** Zero one side of one survivor, if that side is currently a border facing a
 *  hidden neighbour. Split out from the loop below purely so each guard reads
 *  as its own precondition rather than as nested control flow. */
function hideEdgeBorderSide(el: HTMLElement, side: (typeof BORDER_SIDES)[number]): void {
  const { property, towards, attrs } = side;
  if (el.hasAttribute(attrs.value)) return; // already zeroed on an earlier pass
  const neighbour = el[towards];
  if (!(neighbour instanceof HTMLElement)) return;
  if (!neighbour.hasAttribute(HIDDEN_ATTR)) return;
  if (!hasVisibleBorder(el, property)) return;
  // `0px`, not `0` — CSSOM normalises the latter anyway, and writing what it
  // stores keeps the round-trip readable in the DOM inspector.
  overrideInlineProperty(el, property, attrs, { value: '0px', priority: 'important' });
}

function hideOrphanEdgeBorders(picker: Picker): void {
  for (const link of picker.links) {
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    if (link.el.parentElement !== picker.container) continue;
    for (const side of BORDER_SIDES) hideEdgeBorderSide(link.el, side);
  }
}

/** Undo {@link hideOrphanEdgeBorders} for one element. Idempotent — a no-op on
 *  an element we never touched. Exported for content-modification.ts's
 *  site-wide teardown sweep. */
export function restoreOriginalBorders(el: HTMLElement): void {
  for (const { property, attrs } of BORDER_SIDES) {
    if (!el.hasAttribute(attrs.value)) continue;
    restoreInlineProperty(el, property, attrs);
  }
}

/**
 * Restore every Movar mutation inside one picker container:
 *
 *   - un-hide every classified link with HIDDEN_ATTR
 *   - un-hide every divider sibling with HIDDEN_ATTR (the
 *     hideUselessDividers output)
 *   - put back any leaf-link textContent we trimmed via
 *     trimOrphanSeparators (ORIGINAL_TEXT_ATTR)
 *   - detach all tooltips Movar attached to surviving links, and all in-row
 *     chips it left standing in a list picker's hidden rows
 *   - mark the container with RESTORED_ATTR so the next MutationObserver
 *     re-fire of filterPickers skips it
 *
 * Scoped to one picker — does NOT touch curtains, other pickers, or
 * content-filter blur cards. Use restoreAll (in content.ts) for the
 * page-wide sweep.
 */
// Five passes (links / dividers / edge borders / trimmed text / tooltips)
// plus the terminal mark — each handles a distinct artefact of the filter
// pipeline and the function is the inverse of that pipeline. Splitting would
// force the caller to chain five exports that only make sense together.
/* eslint-disable sonarjs/cognitive-complexity -- inverse of the multi-pass filter pipeline; splitting forces coupled exports */
// fallow-ignore-next-line complexity
function restorePickerInPlace(picker: Picker): void {
  // Drop the in-row chips FIRST. Each one reverts the entry's inline `display`
  // to the value it snapshotted — `none !important`, written by hideElement
  // before the chip went up — so the un-hide below has to be what runs last.
  for (const link of picker.links) {
    detachMark(entryChips, link.el);
  }
  // Un-hide classified links. Iterates the full pre-dedup set (falling back
  // to `links` when a caller never populated it) so a regional-variant
  // duplicate that filterPickerLinks hid via `allLinks` — and which may not
  // be a direct child of the container — is also restored, not just the
  // deduped display entries.
  for (const link of picker.allLinks ?? picker.links) {
    if (!link.el.hasAttribute(HIDDEN_ATTR)) continue;
    link.el.removeAttribute(HIDDEN_ATTR);
    restoreOriginalDisplay(link.el);
    if (link.el instanceof HTMLOptionElement) link.el.hidden = false;
  }
  // Un-hide divider siblings hidden as a consequence — and any entry this
  // picker object does not know about. `picker.links` is a snapshot; a row the
  // site added after it was taken is still hidden and may still carry a chip, so
  // detaching only the snapshot's chips left an orphan chip beside a row it had
  // just un-hidden, and a second click on that orphan wrote the snapshotted
  // `display: none !important` back onto an entry no longer carrying
  // HIDDEN_ATTR — invisible, and unreachable by any later pass or sweep.
  for (const child of picker.container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.hasAttribute(HIDDEN_ATTR)) continue;
    detachMark(entryChips, child);
    child.removeAttribute(HIDDEN_ATTR);
    restoreOriginalDisplay(child);
  }
  // Put back separator borders zeroed on survivors — their neighbour is
  // visible again, so the rule between them is load-bearing once more.
  for (const link of picker.links) {
    restoreOriginalBorders(link.el);
  }
  // Restore trimmed textContent on leaf links.
  for (const link of picker.links) {
    const original = link.el.getAttribute(ORIGINAL_TEXT_ATTR);
    if (original === null) continue;
    link.el.removeAttribute(ORIGINAL_TEXT_ATTR);
    link.el.textContent = original;
  }
  // Replace text-divider marker spans with text nodes carrying the original
  // separator text. The wrapper is structural — once the picker is restored,
  // putting the verbatim text node back keeps the DOM shape the site
  // originally rendered.
  const dividerSpans = picker.container.querySelectorAll<HTMLElement>(
    `[data-movar-kind="${TEXT_DIVIDER_KIND}"]`,
  );
  for (const span of dividerSpans) {
    const original = span.getAttribute(ORIGINAL_TEXT_ATTR);
    if (original === null) {
      span.remove();
      continue;
    }
    span.replaceWith(picker.container.ownerDocument.createTextNode(original));
  }
  // Detach the tooltips Movar attached to surviving links, and the badge a
  // native <select> carries beside its control — the badge owns the tooltip
  // anchored on it, so detaching the badge takes both.
  for (const link of picker.links) {
    detachMark(survivorTooltips, link.el);
  }
  detachMark(controlBadgeMarks, picker.container);
  // Mark the container so filterPickers' next pass leaves it alone.
  picker.container.setAttribute(RESTORED_ATTR, '');
}
/* eslint-enable sonarjs/cognitive-complexity -- re-enable after restorePickerInPlace */

/** The commonest value in `heights`, or 0 for an empty list. Ties go to the
 *  SMALLER height: a floor under the row is invisible (the chip's own content
 *  fills it), a floor over it is the too-tall band this measurement exists to
 *  prevent. */
function commonestHeight(heights: readonly number[]): number {
  const counts = new Map<number, number>();
  let best = 0;
  let bestCount = 0;
  for (const height of heights) {
    const count = (counts.get(height) ?? 0) + 1;
    counts.set(height, count);
    if (count > bestCount || (count === bestCount && height < best)) {
      best = height;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Height of the box `entry` used to occupy, taken from the still-visible
 * siblings that are ROWS LIKE IT — 0 when none can be measured.
 *
 * Measured off siblings rather than off the entry itself because by the time a
 * chip goes up, `filterPickerLinks` has already hidden the entry and its box is
 * gone; un-hiding it to measure would mean a write, a forced reflow and a
 * re-hide on every observer re-fire.
 *
 * A list picker's ROWS are uniform by construction — that uniformity is most of
 * what makes it a list rather than a strip — but its child list holds more than
 * rows. Grouped listboxes (MUI's ListSubheader, HeadlessUI's section labels,
 * every "Recently used / All languages" split) put a `role="presentation"`
 * header first, and separators and "clear selection" affordances sit there too;
 * all of them are deliberately NOT row-shaped. Taking the first visible sibling
 * whatever it was measured a header at 37px against 28px option rows — a 32%
 * overshoot, one band in the list taller than everything around it.
 *
 * So the entry's own `role` picks its peers, and the commonest height among
 * them is the answer — the mode rather than the first, so one row that wrapped
 * to two lines doesn't set the floor for the rest either. Siblings with a
 * different role are the fallback for the picker that has no peers at all (one
 * classified row among unclassifiable ones is common; one row, full stop, is
 * not), where the shape of the list is all there is to go on.
 *
 * Skips Movar's own hosts and anything else already hidden, so a second chip in
 * the same container never measures the first one.
 */
function slotHeightFor(entry: HTMLElement): number {
  const parent = entry.parentElement;
  if (!parent) return 0;
  const role = entry.getAttribute('role');
  const peers: number[] = [];
  const rest: number[] = [];
  for (const sibling of parent.children) {
    if (sibling === entry || !(sibling instanceof HTMLElement)) continue;
    if (sibling.hasAttribute(HIDDEN_ATTR)) continue;
    if (sibling.hasAttribute(CURTAIN_HOST_ATTR)) continue;
    if (sibling.offsetHeight <= 0) continue;
    (sibling.getAttribute('role') === role ? peers : rest).push(sibling.offsetHeight);
  }
  return commonestHeight(peers.length > 0 ? peers : rest);
}

/**
 * Picker containers being watched for a box that arrives after the filter has
 * already run, each with the re-measure to run when one does.
 *
 * {@link slotHeightFor} needs a laid-out row, and a list picker is usually
 * inside a dropdown that is CLOSED on the pass that hides the entry, where every
 * row reports `offsetHeight === 0`. Recovering from that needs a LATER pass, and
 * the content script has exactly two triggers for one: a MutationObserver
 * configured `{ childList: true, subtree: true }` and `wxt:locationchange`
 * (both in content-runtime.ts). Neither fires for the shape this exists for — a
 * panel that is in the DOM from the first byte and opens by toggling a CLASS
 * (Bootstrap's `.dropdown-menu.show`, a HeadlessUI static panel, `<details>`, a
 * pure-CSS `:hover` menu), which adds and removes nothing. Measured in Chromium
 * on the Bootstrap-shaped fixture: rows 28px, chip 21px, the host's inline
 * `min-height` never set, for the life of the page.
 *
 * A ResizeObserver is what turns "the panel opened" into an event the filter can
 * hear: the closed container has no box and gains one the moment the class
 * lands. It re-runs {@link markHiddenEntries} for that picker, and the height in
 * the mark key does the rest — a rebuild only when the number actually changed.
 *
 * No feedback loop with the page-wide observer: a rebuilt chip is a curtain host
 * carrying CURTAIN_HOST_ATTR, so the batch reads as Movar's own and
 * `isMovarOwnedMutation` (movar-markers.ts) drops it. And no loop with itself —
 * the rebuild changes the container's height, the re-measure that follows reads
 * the same row height, the key matches and nothing moves.
 */
const slotWatchers = new Map<HTMLElement, () => void>();
let slotObserver: ResizeObserver | null = null;

/** Re-measure every watched picker, and evict the ones whose container has left
 *  the page. One observation per picker and a page has one or two, so sweeping
 *  the whole map costs a handful of offsetHeight reads and buys the eviction in
 *  the same loop — the same bargain `repositionAllBadges` makes in curtain.ts.
 *  Iterates a copy: a re-measure can unwatch. */
function onSlotResize(): void {
  // eslint-disable-next-line unicorn/no-useless-spread -- deliberate copy: a re-measure can unwatch and re-watch its own container, which a live Map iterator would then visit a second time
  for (const [container, remeasure] of [...slotWatchers]) {
    if (container.isConnected) remeasure();
    else unwatchSlot(container);
  }
}

function watchSlot(container: HTMLElement, remeasure: () => void): void {
  // No ResizeObserver — jsdom, and any engine old enough to lack it. The chip
  // keeps the recovery it had before this watcher existed: whatever the next
  // page-wide pass happens to measure.
  if (typeof ResizeObserver === 'undefined') return;
  slotObserver ??= new ResizeObserver(onSlotResize);
  if (!slotWatchers.has(container)) slotObserver.observe(container);
  // Always the newest closure. It holds the picker snapshot and the presenter of
  // the pass that installed it, and a settings change re-runs the filter with no
  // teardown behind it — so a stale closure would keep re-asserting the previous
  // settings' surface every time the dropdown moved.
  slotWatchers.set(container, remeasure);
}

/** Stop watching `container`, and put the observer away once the last watcher is
 *  gone. The half curtain.ts's badge listeners learned to have: "Turn Movar off"
 *  must be able to remove every global this module installs. */
function unwatchSlot(container: HTMLElement): void {
  if (!slotWatchers.delete(container)) return;
  slotObserver?.unobserve(container);
  if (slotWatchers.size > 0) return;
  slotObserver?.disconnect();
  slotObserver = null;
}

/**
 * A chip's curtain has come down — by its own "Show", by a picker-level restore,
 * or by the page-wide sweep behind "Turn Movar off", which resolves handles off
 * the DOM and never reaches this module's registries. That last path is the
 * reason this is an `onDetach` hook rather than a line in {@link detachMark}:
 * the same lesson the control badge's `releaseControl` records.
 *
 * Once the last chip of a picker is gone there is nothing left to re-measure, so
 * the watcher goes with it. A REBUILD also passes through here, one line before
 * the replacement goes up — the pass re-registers the watcher when it ends, at
 * the cost of one no-op observation.
 */
function releaseSlotWatch(picker: Picker): void {
  const standing = picker.links.some(
    (link) => entryChips.get(link.el)?.handle.host.isConnected === true,
  );
  if (!standing) unwatchSlot(picker.container);
}
/**
 * Mark each hidden entry of a LIST-shaped picker with a chip in its own row,
 * instead of hanging a tooltip off every survivor.
 *
 * Why the two shapes diverge here: the survivor tooltip is a hover popup, and a
 * list picker is the one shape where that is actively hostile. Its rows are what
 * the visitor sweeps the pointer across to read the options — so a tooltip on
 * each survivor turns every recognised row into a trap that opens a panel over
 * the rows around it, at a z-index above the site's own dropdown. On
 * bigfive-test.com (42 options, 9 of them languages Movar classifies) that was
 * eight hover traps inside the list, and picking any other language meant
 * dodging them. An inline strip has no such problem — and no row to mark either,
 * since the cleanup passes close the gap completely — so it keeps the tooltip.
 *
 * One chip per hidden LANGUAGE, not per hidden element: `picker.links` is the
 * deduped display set, so a picker carrying both `ru-RU` and `ru-UA` gets a
 * single marker while `filterPickerLinks` still hides both elements.
 *
 * Idempotent across MutationObserver re-fires — the previous chip is detached
 * first, the same way {@link annotateSurvivingLinks} handles its tooltips.
 *
 * Re-entrant by design: {@link slotWatchers} calls this again, for one picker,
 * when that picker's container gains the box it did not have on the first pass.
 */
function markHiddenEntries(picker: Picker, presenter: ContentPresenter | undefined): void {
  const visible = presenter?.hasVisiblePresentation === true;
  let standing = false;
  for (const link of picker.links) {
    const hidden = link.el.hasAttribute(HIDDEN_ATTR);
    // The eligibility checks come BEFORE the skip, never after it: a conceal-mode
    // flip to 'hide' drops the presenter without changing the hidden languages,
    // and a guard that ran first would leave curtain-mode chips standing in the
    // mode whose contract is that Movar adds no surface.
    //
    // A PARENTLESS entry is one the site re-rendered away since `picker.links`
    // was taken: it can measure nothing and can hold nothing (a replace-mode
    // curtain inserts itself before its target, and attachCurtain throws without
    // a parent). Only reachable since the slot watcher started calling this with
    // a snapshot that can outlive its DOM.
    if (!hidden || !visible || link.el.parentElement === null) {
      detachMark(entryChips, link.el);
      continue;
    }
    // The measured height is part of the key, and a rebuild is how a chip takes
    // a new measurement: a list picker is usually inside a dropdown that is
    // CLOSED when the filter runs, where every row measures 0, so a chip keyed
    // only on its language would keep the floorless height it was born with and
    // render at half its neighbours' for the life of the page. What re-runs this
    // function once the rows have a box is {@link slotWatchers} — the page-wide
    // observer cannot, because opening such a dropdown mutates no childList.
    const slotHeight = slotHeightFor(link.el);
    const key = `${surfaceKey([link.language], presenter)}|${String(slotHeight)}`;
    if (markIsCurrent(entryChips, link.el, key)) {
      standing = true;
      continue;
    }
    detachMark(entryChips, link.el);
    const handle = presenter.attachPickerEntryCurtain({
      entry: link.el,
      language: link.language,
      slotHeight,
      restore: () => {
        restorePickerInPlace(picker);
      },
      onDetach: () => {
        releaseSlotWatch(picker);
      },
    });
    if (handle === null) continue;
    handle.host.dataset['movarKind'] = PICKER_ENTRY_CURTAIN_KIND;
    entryChips.set(link.el, { handle, key });
    standing = true;
  }
  // Watch for a slot that becomes measurable only while there is a chip to
  // re-floor. Nothing standing — no hidden rows, no presenter, or a presenter
  // that declined to mount — means this module has nothing left to do for this
  // picker, and holding a live observer on its container would be one more
  // global for "Turn Movar off" to have to find.
  if (standing) {
    watchSlot(picker.container, () => {
      markHiddenEntries(picker, presenter);
    });
  } else {
    unwatchSlot(picker.container);
  }
}

/**
 * Mark a native `<select>` with a badge beside the control.
 *
 * Its `<option>`s can carry nothing: an `<option>` may not contain an element,
 * and — measured in Chromium on the `picker-select-ru` fixture — every
 * `<option>` reports a 0x0 box even with the control on screen, so it can take
 * neither a chip nor a hover. Anchoring the survivor tooltip to each surviving
 * option, which is what the inline path does, produced explanation surfaces that
 * could never be opened.
 *
 * Anchoring on the `<select>` itself works, but says nothing until someone
 * happens to hover it — and on a control the visitor is aiming at anyway, that
 * is a coin flip. The badge is the fix: an always-visible mark floating beside
 * the control, resting as the bare sigil and expanding to its label while the
 * control is hovered or focused, with the detail and the restore action in a
 * tooltip anchored on the control. It is appended to `document.body` rather
 * than the site's tree — so no sibling selector, child index or flex gap count
 * changes and nothing shifts — and is `pointer-events: none`, `aria-hidden` and
 * untabbable, so it cannot take a click, a focus or a screen-reader stop.
 *
 * Idempotent across MutationObserver re-fires the same way the tooltip paths
 * are, and for a sharper reason: a rebuilt badge would restart its fade and drop
 * an open tooltip mid-read.
 */
function markNativeControl(
  picker: Picker,
  hiddenLanguages: LanguageCode[],
  presenter: ContentPresenter | undefined,
): void {
  const key = surfaceKey(hiddenLanguages, presenter);
  if (hiddenLanguages.length === 0 || presenter?.hasVisiblePresentation !== true) {
    detachMark(controlBadgeMarks, picker.container);
    return;
  }
  if (markIsCurrent(controlBadgeMarks, picker.container, key)) return;
  detachMark(controlBadgeMarks, picker.container);
  const handle = presenter.attachPickerControlBadge({
    control: picker.container,
    hiddenLanguages,
    restore: () => {
      restorePickerInPlace(picker);
    },
  });
  if (handle === null) return;
  handle.host.dataset['movarKind'] = PICKER_BADGE_KIND;
  controlBadgeMarks.set(picker.container, { handle, key });
}

/**
 * Attach a styled tooltip to every surviving classified link in this
 * picker. Carries a short title, body listing the hidden languages by
 * endonym, and a "Show hidden options" action that restores the picker
 * in place (un-hides links, dividers, and trimmed text within this
 * container — without touching curtains or other pickers).
 *
 * Idempotent across MutationObserver re-fires: each anchor's previous
 * tooltip mark is tracked in `survivorTooltips` and always detached first
 * (via {@link detachMark}), so the body stays in sync if the
 * hidden-language list changed since the last call. That detach runs even
 * for links this pass then skips — now HIDDEN_ATTR, or no visible
 * presenter — so a link that stops being a tooltip candidate never leaves
 * its old host/registry entry behind.
 */
function annotateSurvivingLinks(
  picker: Picker,
  hiddenLanguages: LanguageCode[],
  presenter: ContentPresenter | undefined,
): void {
  const key = surfaceKey(hiddenLanguages, presenter);
  // Nothing hidden means nothing to explain — and any tooltip still up is now
  // stale, so this is a detach, never a bare return.
  const visible = hiddenLanguages.length > 0 && presenter?.hasVisiblePresentation === true;
  for (const link of picker.links) {
    // Eligibility first, skip second — see markHiddenEntries. Running the skip
    // first also re-opened movar#303: an anchor that stops being a candidate
    // without changing the key kept its stale tooltip.
    if (link.el.hasAttribute(HIDDEN_ATTR) || !visible) {
      detachMark(survivorTooltips, link.el);
      continue;
    }
    if (markIsCurrent(survivorTooltips, link.el, key)) continue;
    detachMark(survivorTooltips, link.el);
    const handle = presenter.attachPickerSurvivorTooltip({
      anchor: link.el,
      hiddenLanguages,
      restore: () => {
        restorePickerInPlace(picker);
      },
    });
    if (handle === null) continue;
    survivorTooltips.set(link.el, { handle, key });
  }
}

function hideElement(el: HTMLElement, reason: string): void {
  if (el.hasAttribute(HIDDEN_ATTR)) return;
  el.setAttribute(HIDDEN_ATTR, reason);
  overrideInlineProperty(el, 'display', DISPLAY_ATTRS, { value: 'none', priority: 'important' });
  // <option> needs the `hidden` attribute too — older browsers ignore display:none on it.
  if (el instanceof HTMLOptionElement) el.hidden = true;
}

/** True when the container has been replaced by a picker-container curtain.
 *  The curtain host is inserted as the immediate previous sibling. */
function isContainerCurtained(container: HTMLElement): boolean {
  const prev = container.previousElementSibling;
  return (
    prev instanceof HTMLElement &&
    Object.hasOwn(prev.dataset, 'movarCurtain') &&
    prev.dataset['movarKind'] === PICKER_CURTAIN_KIND
  );
}

/** Replace the picker container with a chip overlay. `survivingLang` is the
 *  single language the user could still pick — `null` when zero options
 *  survived (the chip degrades to sigil-only, no language name to show). */
function attachPickerContainerCurtain(
  container: HTMLElement,
  survivingLang: LanguageCode | null,
  presenter: ContentPresenter | undefined,
): void {
  if (presenter?.hasVisiblePresentation !== true) return;
  const handle = presenter.attachPickerContainerCurtain({
    container,
    survivingLanguage: survivingLang,
  });
  if (handle !== null) handle.host.dataset['movarKind'] = PICKER_CURTAIN_KIND;
}

/**
 * Hide picker links the user doesn't want to see.
 *
 * When `options.blocked` is provided, only blocked languages are hidden —
 * languages outside `keep` but not in `blocked` are tolerated and stay
 * visible. This is the recommended path; it matches the "blocked vs
 * everything-else" mental model users have. In this mode the picker
 * container itself is NEVER curtained — even a single surviving link is
 * left visible as a normal picker, since the user explicitly chose what
 * to block and the surviving options are what they've consented to see.
 * What the survivor gets instead is {@link cleanupSurvivingContainer}: every
 * trace of the entry that went (divider elements, orphan separator text, and
 * a separator BORDER left facing the gap) plus the tooltip naming what was
 * hidden.
 *
 * Without `options`, falls back to the legacy "hide anything not in keep"
 * semantics — except when `keep` is empty (then it's a no-op, since the
 * user has no expressed preference and we shouldn't hide everything). In
 * the strict mode, if ≤1 language remains in a picker afterward, the
 * whole container is replaced by a chip overlay marking which language
 * the user's preference collapsed to (or sigil-only when zero remain).
 */
/** Hide blocked links in a single picker; return the surviving (visible) entries.
 *
 *  Hides every classified element in `picker.allLinks` (the full pre-dedup
 *  set) whose language is blocked — not just the first-per-language entries
 *  in `picker.links`. `dedupByLanguage` (extract.ts) collapses regional
 *  variants (e.g. `ru-RU`/`ru-UA`) down to one display entry, so hiding only
 *  `picker.links` would leave a second same-language element fully visible
 *  and clickable, letting the blocked language leak through it (movar#293).
 *  Survivors are still reported from `picker.links` — dedup is for
 *  display/tooltip purposes only, so language counting elsewhere (curtain
 *  trigger, tooltip body) is unaffected. */
function filterPickerLinks(
  picker: Picker,
  shouldHide: (lang: LanguageCode) => boolean,
  hiddenLinks: ClassifiedLink[],
): ClassifiedLink[] {
  for (const link of picker.allLinks ?? picker.links) {
    if (!shouldHide(link.language)) continue;
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    hideElement(link.el, 'not-in-priority');
    hiddenLinks.push(link);
  }
  return picker.links.filter((link) => !shouldHide(link.language));
}

/** Every language currently hidden in this picker, in DOM order, deduped. The
 *  tooltip lists EVERY hidden language — not just the ones hidden in the current
 *  call — so MutationObserver re-fires don't "forget" earlier hides. */
function collectHiddenLanguages(picker: Picker): LanguageCode[] {
  const hiddenLangsInOrder: LanguageCode[] = [];
  const seenHiddenLang = new Set<LanguageCode>();
  for (const link of picker.links) {
    if (!link.el.hasAttribute(HIDDEN_ATTR)) continue;
    if (seenHiddenLang.has(link.language)) continue;
    seenHiddenLang.add(link.language);
    hiddenLangsInOrder.push(link.language);
  }
  return hiddenLangsInOrder;
}

/**
 * Drop any surface belonging to a layout this picker no longer has.
 *
 * `pickerLayout` is re-derived from live ARIA roles on every pass, so the
 * verdict can change mid-life — a react-aria picker that stamps `role="listbox"`
 * on after hydration is read as `inline` on the pass before and `list` on the
 * pass after. Each mark path only ever detached its OWN kind, so the earlier
 * verdict's surfaces stayed attached: on exactly the shape this work targets,
 * the chip went up while the inline-era survivor tooltips remained as hover
 * traps over the listbox rows — the defect being fixed, re-created by the fix.
 *
 * Every call is a no-op when there is nothing of that kind to drop, so this
 * costs nothing in the steady state.
 */
function detachForeignSurfaces(picker: Picker): void {
  const dropTooltips = picker.layout !== 'inline';
  const dropChips = picker.layout !== 'list';
  for (const link of picker.links) {
    if (dropTooltips) detachMark(survivorTooltips, link.el);
    if (dropChips) detachMark(entryChips, link.el);
  }
  if (picker.layout !== 'native') detachMark(controlBadgeMarks, picker.container);
}

/**
 * In-container cleanup for a picker that stays visible after some links were
 * hidden: drop stranded `|` divider siblings, zero separator borders left
 * facing the gap, trim bare-text orphan separators (inside surviving leaves
 * and at the container level), then attach the survivor tooltip listing what's
 * hidden.
 *
 * The four passes cover the four ways a site can draw a divider — as an
 * element, as a CSS border, as characters inside a label, and as a bare text
 * node — and they run in that order because the border pass reads "is my
 * neighbour hidden?", which only settles once the element pass has hidden any
 * stranded divider node between them.
 *
 * Only called when the container stays visible. When the chip is about to hide
 * the whole container, this cleanup would be invisible AND would leak past the
 * chip's "click-to-restore = exact picker state" contract.
 *
 * The four passes run for every layout — a list picker simply has no separators
 * for them to find. What the layout picks is the SURFACE that explains the gap:
 * an in-row chip for a list, the survivor tooltip for an inline strip (see
 * {@link markHiddenEntries} for why a list must not get the tooltip).
 */
function cleanupSurvivingContainer(picker: Picker, presenter: ContentPresenter | undefined): void {
  hideUselessDividers(picker);
  hideOrphanEdgeBorders(picker);
  trimOrphanSeparators(picker);
  trimContainerTextSeparators(picker);
  detachForeignSurfaces(picker);
  if (picker.layout === 'list') {
    markHiddenEntries(picker, presenter);
    return;
  }
  if (picker.layout === 'native') {
    markNativeControl(picker, collectHiddenLanguages(picker), presenter);
    return;
  }
  annotateSurvivingLinks(picker, collectHiddenLanguages(picker), presenter);
}

// The cyclomatic count comes from the per-picker pipeline: hide links, then
// run the in-container cleanup (gated on survivor counts / willCurtain), then
// attach the chip when the strict path triggers. Each branch handles a
// different concern; flattening them would hide the pipeline shape.
/* eslint-disable sonarjs/cognitive-complexity -- per-picker pipeline (hide links, gated cleanup, attach chip); each branch is a separate concern, flattening hides the pipeline shape */
// fallow-ignore-next-line complexity
export function filterPickers(
  pickers: Picker[],
  keep: LanguageCode[],
  options?: FilterOptions,
  presenter?: ContentPresenter,
): FilterResult {
  const hiddenLinks: ClassifiedLink[] = [];
  const hiddenContainers: HTMLElement[] = [];
  const keepSet = new Set(keep);
  const blockedSet = options?.blocked ? new Set(options.blocked) : null;

  // No expressed preference at all — do nothing. Avoids the empty-priority
  // landmine where `keep=[]` would have hidden every picker link.
  if (keepSet.size === 0 && !blockedSet) {
    return { hiddenLinks, hiddenContainers };
  }

  const shouldHide = (lang: LanguageCode): boolean =>
    blockedSet ? blockedSet.has(lang) : !keepSet.has(lang);

  // Container-curtaining only fires in strict (keep-only) mode. The
  // blocked-only path strips its blocked entries and trusts whatever the
  // user consented to see — even a single survivor stays visible as a
  // normal picker, because announcing "Movar hid this" would just be
  // noise on top of the user's own choice. What that survivor DOES get is
  // the full in-container cleanup (dividers, orphan separators, dangling
  // edge borders) plus the tooltip explaining what went.
  const shouldCurtainContainer = !blockedSet && presenter?.hasVisiblePresentation === true;

  for (const picker of pickers) {
    // Containers the user explicitly restored via the survivor tooltip
    // (or any future per-container "show options" surface) stay out of
    // future filtering passes. MutationObserver fires aggressively on
    // SPA pages — without this skip, every re-render would re-hide the
    // picker the user just chose to see.
    if (picker.container.hasAttribute(RESTORED_ATTR)) continue;
    const survivors = filterPickerLinks(picker, shouldHide, hiddenLinks);
    const willCurtain =
      shouldCurtainContainer && survivors.length <= 1 && !isContainerCurtained(picker.container);
    // In-container cleanup only fires when the container stays visible (see
    // cleanupSurvivingContainer for why the curtained case is excluded).
    if (survivors.length < picker.links.length && !willCurtain) {
      cleanupSurvivingContainer(picker, presenter);
    }
    if (willCurtain) {
      const survivingLang = survivors[0]?.language ?? null;
      attachPickerContainerCurtain(picker.container, survivingLang, presenter);
      hiddenContainers.push(picker.container);
    }
  }

  return { hiddenLinks, hiddenContainers };
}
/* eslint-enable sonarjs/cognitive-complexity -- re-enable after filterPickers */
