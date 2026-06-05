import type { LanguageCode } from '@movar/lang-detect';
import { attachCurtain, defaultHiddenIcon } from './curtain';
import { getContentMessages } from './i18n/content';
import { getCurrentColorScheme } from '@movar/page-mode/context';
import { attachTooltip, type TooltipHandle } from './tooltip';
import {
  HIDDEN_ATTR,
  LABEL_SEPARATORS,
  LEADING_SEPARATOR_RUN,
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

// fallow-ignore-next-line unused-export
export const PICKER_CURTAIN_KIND = 'picker-container';

/** Per-anchor tooltip handles, used to detach a previously-attached
 *  tooltip when annotateSurvivingLinks re-runs (MutationObserver, settings
 *  change) and the hidden-language list might have changed. WeakMap so
 *  detached/removed anchors are GC'd along with their handles. */
const anchorTooltips = new WeakMap<HTMLElement, TooltipHandle>();

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
  return isPureSeparatorText((el.textContent ?? '').trim());
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
    const text = link.el.textContent ?? '';
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
    const prevHidden = prevEl !== null && prevEl.hasAttribute(HIDDEN_ATTR);
    const nextHidden = nextEl !== null && nextEl.hasAttribute(HIDDEN_ATTR);
    const trimmed = trimSeparatorText(text, prevHidden, nextHidden);
    if (trimmed === null) continue;

    const span = container.ownerDocument.createElement('span');
    span.dataset['movarKind'] = TEXT_DIVIDER_KIND;
    span.setAttribute(ORIGINAL_TEXT_ATTR, text);
    span.textContent = trimmed;
    node.replaceWith(span);
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
 *   - detach all tooltips Movar attached to surviving links
 *   - mark the container with RESTORED_ATTR so the next MutationObserver
 *     re-fire of filterPickers skips it
 *
 * Scoped to one picker — does NOT touch curtains, other pickers, or
 * content-filter blur cards. Use restoreAll (in content.ts) for the
 * page-wide sweep.
 */
// Four passes (links / dividers / trimmed text / tooltips) plus the
// terminal mark — each handles a distinct artefact of the filter pipeline
// and the function is the inverse of that pipeline. Splitting would force
// the caller to chain four exports that only make sense together.
// fallow-ignore-next-line complexity
function restorePickerInPlace(picker: Picker): void {
  // Un-hide classified links.
  for (const link of picker.links) {
    if (!link.el.hasAttribute(HIDDEN_ATTR)) continue;
    link.el.removeAttribute(HIDDEN_ATTR);
    link.el.style.removeProperty('display');
    if (link.el instanceof HTMLOptionElement) link.el.hidden = false;
  }
  // Un-hide divider siblings hidden as a consequence.
  for (const child of picker.container.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.hasAttribute(HIDDEN_ATTR)) continue;
    child.removeAttribute(HIDDEN_ATTR);
    child.style.removeProperty('display');
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
  // Detach the tooltips Movar attached to surviving links.
  for (const link of picker.links) {
    const handle = anchorTooltips.get(link.el);
    if (!handle) continue;
    handle.detach();
    anchorTooltips.delete(link.el);
  }
  // Mark the container so filterPickers' next pass leaves it alone.
  picker.container.setAttribute(RESTORED_ATTR, '');
}

/**
 * Attach a styled tooltip to every surviving classified link in this
 * picker. Carries a short title, body listing the hidden languages by
 * endonym, and a "Show hidden options" action that restores the picker
 * in place (un-hides links, dividers, and trimmed text within this
 * container — without touching curtains or other pickers).
 *
 * Idempotent across MutationObserver re-fires: each anchor's previous
 * tooltip handle is tracked in `anchorTooltips` and detached before a
 * new tooltip is attached, so the body stays in sync if the hidden-
 * language list changed since the last call.
 */
function annotateSurvivingLinks(picker: Picker, hiddenLanguages: LanguageCode[]): void {
  if (hiddenLanguages.length === 0) return;
  const { content } = getContentMessages();
  const endonyms = hiddenLanguages.map((c) => endonym(c));
  const title = content.pickerSurvivor.title;
  const body = content.pickerSurvivor.body(endonyms);
  const showLabel = content.pickerSurvivor.show;

  for (const link of picker.links) {
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    // Always detach + re-attach so the body text reflects the current
    // hidden-language list. Cheap: detach removes a few listeners and
    // one DOM node.
    const existing = anchorTooltips.get(link.el);
    if (existing) existing.detach();
    const handle = attachTooltip(link.el, {
      title,
      body,
      colorScheme: getCurrentColorScheme(),
      action: {
        label: showLabel,
        onClick: () => restorePickerInPlace(picker),
      },
    });
    anchorTooltips.set(link.el, handle);
  }
}

// fallow-ignore-next-line unused-export
export function hideElement(el: HTMLElement, reason: string): void {
  if (el.hasAttribute(HIDDEN_ATTR)) return;
  // Snapshot the site's own inline display so it can be put back verbatim
  // (attribute-stored so the snapshot survives serialization/re-mounts in
  // component frameworks).
  const originalDisplay = el.style.getPropertyValue('display');
  const originalPriority = el.style.getPropertyPriority('display');
  el.setAttribute(ORIGINAL_DISPLAY_ATTR, originalDisplay);
  el.setAttribute(ORIGINAL_DISPLAY_PRIORITY_ATTR, originalPriority);

  el.setAttribute(HIDDEN_ATTR, reason);
  el.style.setProperty('display', 'none', 'important');
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

/** Endonym for a language code via `Intl.DisplayNames`, falling back to the
 *  bare code if the runtime doesn't carry the language in CLDR. Passing the
 *  code as both the locale AND the target gives us the language's name in
 *  itself ("uk" → "українська", "de" → "Deutsch") — see the design grill
 *  for why endonym beats exonym for in-host-page chips. */
function endonym(code: LanguageCode): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Replace the picker container with a chip overlay. `survivingLang` is the
 *  single language the user could still pick — `null` when zero options
 *  survived (the chip degrades to sigil-only, no language name to show). */
function attachPickerContainerCurtain(
  container: HTMLElement,
  survivingLang: LanguageCode | null,
): void {
  const { content } = getContentMessages();
  const label = survivingLang === null ? '' : endonym(survivingLang);
  const description = content.pickerHidden.chipLabel(label || null);
  const handle = attachCurtain(container, {
    mode: 'replace',
    skin: 'chip',
    icon: defaultHiddenIcon(),
    // `title` is the visible label in the chip; empty string → sigil-only.
    // The description goes to aria-label + host `title` for sighted hover
    // and screen-reader access.
    title: label,
    description,
    ariaLabel: description,
    colorScheme: getCurrentColorScheme(),
    actions: [
      {
        label: content.pickerHidden.show,
        onClick: (ctx) => {
          ctx.detach();
        },
      },
    ],
  });
  handle.host.dataset['movarKind'] = PICKER_CURTAIN_KIND;
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
 *
 * Without `options`, falls back to the legacy "hide anything not in keep"
 * semantics — except when `keep` is empty (then it's a no-op, since the
 * user has no expressed preference and we shouldn't hide everything). In
 * the strict mode, if ≤1 language remains in a picker afterward, the
 * whole container is replaced by a chip overlay marking which language
 * the user's preference collapsed to (or sigil-only when zero remain).
 */
/** Hide blocked links in a single picker; return the surviving (visible) entries. */
function filterPickerLinks(
  picker: Picker,
  shouldHide: (lang: LanguageCode) => boolean,
  hiddenLinks: ClassifiedLink[],
): ClassifiedLink[] {
  const survivors: ClassifiedLink[] = [];
  for (const link of picker.links) {
    if (!shouldHide(link.language)) {
      survivors.push(link);
      continue;
    }
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    hideElement(link.el, 'not-in-priority');
    hiddenLinks.push(link);
  }
  return survivors;
}

// The cyclomatic count comes from the per-picker pipeline: hide links, then
// gate three independent cleanup passes (dividers / orphan-text / tooltip)
// on `willCurtain` and survivor counts, then attach the chip when the
// strict path triggers. Each branch handles a different concern; flattening
// them into nested helpers would hide the pipeline shape.
// fallow-ignore-next-line complexity
export function filterPickers(
  pickers: Picker[],
  keep: LanguageCode[],
  options?: FilterOptions,
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
  // noise on top of the user's own choice.
  const shouldCurtainContainer = !blockedSet;

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
    // In-container cleanup (stranded `|` siblings + bare-text orphan
    // separators inside surviving leaves + hover tooltips on survivors)
    // only fires when the container stays visible. When the chip is about
    // to hide the whole container, cleanup would be invisible AND would
    // leak past the chip's "click-to-restore = exact picker state"
    // contract.
    if (survivors.length < picker.links.length && !willCurtain) {
      hideUselessDividers(picker);
      trimOrphanSeparators(picker);
      trimContainerTextSeparators(picker);
      // Tooltip lists EVERY currently-hidden language in this picker, not
      // just the ones hidden in this call — so MutationObserver re-fires
      // don't "forget" earlier hides.
      const hiddenLangsInOrder: LanguageCode[] = [];
      const seenHiddenLang = new Set<LanguageCode>();
      for (const link of picker.links) {
        if (!link.el.hasAttribute(HIDDEN_ATTR)) continue;
        if (seenHiddenLang.has(link.language)) continue;
        seenHiddenLang.add(link.language);
        hiddenLangsInOrder.push(link.language);
      }
      annotateSurvivingLinks(picker, hiddenLangsInOrder);
    }
    if (willCurtain) {
      const survivingLang = survivors[0]?.language ?? null;
      attachPickerContainerCurtain(picker.container, survivingLang);
      hiddenContainers.push(picker.container);
    }
  }

  return { hiddenLinks, hiddenContainers };
}
