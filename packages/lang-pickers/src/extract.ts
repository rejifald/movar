import { MAX_PICKER_DEPTH, SEED_SELECTORS, TEXT_DIVIDER_KIND } from './types';
import type { ClassifiedLink, Picker } from './types';
import { classifyLanguageElement } from './classify';

/** Keep only outer elements when a classified element is nested inside another. */
export function dedupNested(items: ClassifiedLink[]): ClassifiedLink[] {
  return items.filter((item) => {
    let p: HTMLElement | null = item.el.parentElement;
    while (p) {
      if (items.some((other) => other.el === p)) return false;
      p = p.parentElement;
    }
    return true;
  });
}

/** Keep only the first entry per language code. Picker UIs that ship multiple
 *  regional variants (en-US, en-GB, en-AU) collapse to a single EN entry —
 *  the user doesn't need to see "three Englishes" once region info is stripped. */
function dedupByLanguage(items: ClassifiedLink[]): ClassifiedLink[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.language)) return false;
    seen.add(item.language);
    return true;
  });
}

/** Classify the container's direct children, deduping against already-classified items. */
export function classifyContainerChildren(
  container: HTMLElement,
  preClassified: ClassifiedLink[],
): ClassifiedLink[] {
  const inside: ClassifiedLink[] = preClassified.filter((c) => container.contains(c.el));
  const seen = new Set<HTMLElement>(inside.map((c) => c.el));

  for (const child of [...container.children] as HTMLElement[]) {
    if (seen.has(child)) continue;
    if (inside.some((c) => child.contains(c.el))) continue; // child wraps a pre-classified item
    // Skip Movar-added marker elements (e.g., text-divider spans from
    // trimContainerTextSeparators). They're structural wrappers around
    // separator-bearing text nodes, not language entries — classifying
    // them would put a fake "link" into picker.links and subject the
    // wrapper to filter/hide logic that's meant for real switchers.
    if (child.dataset['movarKind'] === TEXT_DIVIDER_KIND) continue;
    const classified = classifyLanguageElement(child);
    if (classified) {
      inside.push(classified);
      seen.add(child);
    }
  }
  return dedupNested(inside);
}

/** Walk the DOM (including open shadow roots) and return every element
 *  matching `selector`. Shadow-pierce is essential for component libraries
 *  that render the entire picker inside a custom element. */
export function deepQuerySelectorAll(root: ParentNode, selector: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  // Direct matches in this root.
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    out.push(el);
  }
  // Recurse into open shadow roots discovered under this root.
  for (const el of root.querySelectorAll<HTMLElement>('*')) {
    if (el.shadowRoot) {
      out.push(...deepQuerySelectorAll(el.shadowRoot, selector));
    }
  }
  return out;
}

/** `<html>`/`<body>` sometimes carry page-level locale metadata as a
 *  `data-lang`/`data-locale`/`lang` attribute — UMI.CMS stamps
 *  `data-lang="ru"` on `<html>`, for example — never as a picker item. If
 *  seeded, one of them would classify and, being the ancestor of literally
 *  every other classified element on the page, `dedupNested`'s "keep only
 *  outer elements" rule would discard every real picker candidate in favor of
 *  this single unusable entry — unusable because it has no parent to walk a
 *  container search from, so `findLanguagePickers` returns zero pickers even
 *  when a real, well-formed switcher is on the page. */
function isPageRoot(el: HTMLElement): boolean {
  return el === document.documentElement || el === document.body;
}

function classifyAll(elements: HTMLElement[]): ClassifiedLink[] {
  const out: ClassifiedLink[] = [];
  for (const el of elements) {
    if (isPageRoot(el)) continue;
    const c = classifyLanguageElement(el);
    if (c) out.push(c);
  }
  return out;
}

/** Walk ancestors of `link` until one is a multi-language container, or we
 *  exhaust MAX_PICKER_DEPTH. Returns the container + its classified children. */
function findPickerContainer(
  link: ClassifiedLink,
  pool: ClassifiedLink[],
): { container: HTMLElement; links: ClassifiedLink[] } | null {
  let parent: HTMLElement | null = link.el.parentElement;
  for (let depth = 0; parent !== null && depth < MAX_PICKER_DEPTH; depth++) {
    const insideLinks = classifyContainerChildren(parent, pool);
    // A picker offers a CHOICE between languages — a cluster of links that
    // all classify as the same language (e.g., Google SERPs propagate
    // ?hl=uk into every internal link, marking them all as "uk") is not a
    // picker. Require ≥2 distinct languages, not just ≥2 anchors.
    const distinctLangs = new Set(insideLinks.map((l) => l.language));
    if (distinctLangs.size >= 2) {
      return { container: parent, links: insideLinks };
    }
    parent = parent.parentElement;
  }
  return null;
}

/** Discard outer containers that subsume an inner one. When a same-language
 *  cluster (e.g., result block with ?hl=uk anchors) and a real picker live
 *  under the same wide ancestor, that ancestor will accumulate enough
 *  distinct languages to look like a picker — but the real picker is the
 *  inner one. Keep only leaf-most containers. */
export function pruneOuterContainers(containers: HTMLElement[]): HTMLElement[] {
  return containers.filter((c) => !containers.some((other) => other !== c && c.contains(other)));
}

/**
 * Find language pickers on the page. Seeded broadly (anchors, data-lang, class
 * hints, hreflang); once at least two classified elements share a small common
 * ancestor, that ancestor becomes the picker. Direct children of the candidate
 * also get classified, so an active-language `<span>` pairs with a switch `<a>`.
 *
 * Site-agnostic: the rules database is consulted only when redirecting; picker
 * filtering relies purely on these heuristics.
 */
export function findLanguagePickers(root: ParentNode = document): Picker[] {
  // querySelectorAll already dedupes element identity across the comma-list.
  const classified = classifyAll(deepQuerySelectorAll(root, SEED_SELECTORS));
  // One-seed pickers are real: sites commonly render the active language as
  // a bare-text span ("UA | ") next to a single switch anchor — only the
  // anchor gets seeded, but its sibling classifies once we walk into the
  // container. The ≥2-distinct-languages guard in `findPickerContainer`
  // below is the actual safety net; a lone /uk/ anchor with no language
  // siblings still won't be picker-classified.
  if (classified.length === 0) return [];

  const deduped = dedupNested(classified);
  if (deduped.length === 0) return [];

  const byContainer = new Map<HTMLElement, ClassifiedLink[]>();
  for (const link of deduped) {
    const found = findPickerContainer(link, deduped);
    if (found && !byContainer.has(found.container)) {
      byContainer.set(found.container, found.links);
    }
  }

  const minimal = pruneOuterContainers([...byContainer.keys()]);
  return minimal.map((container) => {
    const links = byContainer.get(container) ?? [];
    return { container, links: dedupByLanguage(links) };
  });
}
