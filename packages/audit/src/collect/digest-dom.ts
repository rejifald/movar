/**
 * The DOM tier, against **any** `Document`: HTML already parsed in,
 * serializable {@link DocumentEvidence} out.
 *
 * This module is the half of the digest that both collectors share. It touches
 * no `jsdom`, no `node:*`, and no DOM **globals** — only the `Document` it is
 * handed and that document's own `ownerDocument` / `createTreeWalker`. So the
 * same code digests a jsdom document under Node (see `./digest.ts`, which adds
 * the parse step and the globals shim) and a `DOMParser.parseFromString`
 * document inside the host app's `WKWebView`, where the DOM is real and no shim
 * is needed at all.
 *
 * That split is what lets one digest serve two runtimes. It matters more than
 * it looks: a second, drifting reimplementation of "what counts as an hreflang
 * alternate" would mean two collectors that disagree about the same page, and
 * `Evidence` is supposed to be the only thing they share.
 *
 * It **samples and never classifies** — the classifier runs inside `evaluate()`,
 * so a stored bundle re-adjudicates against improved detection years later.
 * Values are captured **verbatim**. Normalizing an `hreflang` or a picker label
 * here would move a judgement out of the replayable half of the system and into
 * the half that runs once.
 *
 * ### The one global dependency, and where it lives
 *
 * `@movar/lang-pickers` is the real picker model the extension ships, and reusing
 * it (rather than a second, drifting reimplementation) is the whole point of this
 * tier. Its production code narrows with `instanceof HTMLAnchorElement` and
 * friends, which are **globals**. In a browser or a `WKWebView` those are the
 * document's own constructors and everything just works; under bare Node they
 * are undefined, so the model would quietly classify nothing and every page
 * would look like it had no language picker — a false `not-applicable` on four
 * rules rather than a loud failure. Installing them is therefore the Node
 * wrapper's job, not this module's.
 */

import { findLanguagePickers } from '@movar/lang-pickers';
import { activeLanguageFromPicker, buildPickerModel } from '@movar/lang-pickers';
import type { ClassifiedLink, Picker } from '@movar/lang-pickers';
import type {
  AlternateLink,
  DocumentEvidence,
  LangAttribute,
  LinkTarget,
  NodePath,
  PickerEvidence,
  PickerOption,
  TextNodeSample,
} from '../evidence';

/**
 * Sampling ceiling. Generous enough that a real page is not truncated, but a
 * pathological one cannot produce an unbounded bundle. When it bites, the caller
 * is told — see {@link DigestResult.sampling} — because a silently truncated
 * sample makes every denominator downstream a lie.
 */
export const MAX_TEXT_NODE_SAMPLES = 1500;
/** Per-node text ceiling. Long enough for a paragraph, short enough to bound size. */
export const MAX_TEXT_NODE_CHARS = 2000;
/** Text shorter than this is not worth sampling at all. */
const MIN_SAMPLED_CHARS = 2;
/** `NodeFilter.SHOW_TEXT` — named so the walker does not carry a bare `4`. */
const SHOW_TEXT = 4;

const SKIPPED_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'svg',
  'head',
]);

/** Semantic regions the report splits chrome from body on. */
const REGION_BY_TAG: ReadonlyMap<string, string> = new Map([
  ['nav', 'nav'],
  ['footer', 'footer'],
  ['header', 'nav'],
  ['main', 'main'],
  ['article', 'main'],
]);
const REGION_BY_ROLE: ReadonlyMap<string, string> = new Map([
  ['navigation', 'nav'],
  ['contentinfo', 'footer'],
  ['banner', 'nav'],
  ['main', 'main'],
]);

export interface DigestOptions {
  /** The page's own URL, for resolving relative hrefs and the active entry. */
  readonly url?: string;
  /** Alternates the probe tier found in a `Link:` response header. */
  readonly headerAlternates?: readonly AlternateLink[];
}

export interface SamplingReport {
  /** Text nodes the walker saw. */
  readonly examined: number;
  /** Text nodes that reached the digest. */
  readonly sampled: number;
  /** Set only when the cap was applied. */
  readonly cappedAt?: number;
}

export interface DigestResult {
  readonly document: DocumentEvidence;
  readonly sampling: SamplingReport;
}

/* -------------------------------------------------------------------------- */
/* Node paths — a permanent wire-format field every collector must match       */
/* -------------------------------------------------------------------------- */

/**
 * A stable, human-readable CSS-ish path to one element.
 *
 * `nodePath` is part of the `Evidence` contract and is quoted in published
 * findings, so every collector — including the future Swift one — must produce
 * the same string for the same element. The format is deliberately boring:
 * lower-cased tag names from `<html>` down, joined by `>`, each with an
 * `:nth-of-type(n)` suffix when it has same-tag siblings. That is enough to be
 * unique, and it stays readable in a document a non-technical auditor reads.
 */
export function nodePathOf(element: Element, cache: NodePathCache = new WeakMap()): NodePath {
  const cached = cache.get(element);
  if (cached !== undefined) return cached;
  const parent = element.parentElement;
  const path =
    parent === null ? stepOf(element) : `${nodePathOf(parent, cache)} > ${stepOf(element)}`;
  cache.set(element, path);
  return path;
}

/**
 * Memoises paths per element for one digest.
 *
 * Without it every sampled text node re-walks its whole ancestor chain, and the
 * per-level sibling scan makes that quadratic: a perfectly ordinary 1500-node
 * page took over a minute before this existed. Ancestors are shared by
 * construction, so caching them makes the walk effectively linear.
 */
export type NodePathCache = WeakMap<Element, NodePath>;

/**
 * One step of the path: the tag, plus `:nth-of-type(n)` when the element has a
 * same-tag sibling.
 *
 * Counted by walking siblings rather than materialising `parent.children`:
 * spreading a live jsdom collection once per node is the other half of what
 * made this quadratic.
 */
function stepOf(element: Element): string {
  const tag = element.tagName.toLowerCase();
  if (element.parentElement === null) return tag;

  let index = 1;
  let hasSameTagSibling = false;
  for (
    let node = element.previousElementSibling;
    node !== null;
    node = node.previousElementSibling
  ) {
    if (node.tagName === element.tagName) {
      index += 1;
      hasSameTagSibling = true;
    }
  }
  if (!hasSameTagSibling) {
    for (let node = element.nextElementSibling; node !== null; node = node.nextElementSibling) {
      if (node.tagName === element.tagName) {
        hasSameTagSibling = true;
        break;
      }
    }
  }
  return hasSameTagSibling ? `${tag}:nth-of-type(${index})` : tag;
}

/* -------------------------------------------------------------------------- */
/* Field extraction                                                            */
/* -------------------------------------------------------------------------- */

/** `<html lang>` verbatim: `null` absent, `''` present-but-empty, else the value. */
function htmlLangOf(doc: Document): string | null {
  const root = doc.documentElement;
  if (!root.hasAttribute('lang')) return null;
  return root.getAttribute('lang') ?? '';
}

/** Every *other* element carrying `lang`. Excludes `<html>` by construction. */
function langAttributesOf(doc: Document, cache: NodePathCache): readonly LangAttribute[] {
  const found: LangAttribute[] = [];
  for (const element of doc.querySelectorAll('[lang]')) {
    if (element === doc.documentElement) continue;
    found.push({
      nodePath: nodePathOf(element, cache),
      value: element.getAttribute('lang') ?? '',
    });
  }
  return found;
}

/** `<link rel="alternate" hreflang>`, values verbatim, merged with header ones. */
function alternatesOf(
  doc: Document,
  headerAlternates: readonly AlternateLink[],
  cache: NodePathCache,
): readonly AlternateLink[] {
  const found: AlternateLink[] = [...headerAlternates];
  for (const link of doc.querySelectorAll('link[rel~="alternate"][hreflang]')) {
    found.push({
      hreflang: link.getAttribute('hreflang') ?? '',
      href: link.getAttribute('href') ?? '',
      source: 'link',
      nodePath: nodePathOf(link, cache),
    });
  }
  return found;
}

function linksOf(doc: Document, cache: NodePathCache): readonly LinkTarget[] {
  const found: LinkTarget[] = [];
  for (const anchor of doc.querySelectorAll('a[href]')) {
    const rel = anchor.getAttribute('rel');
    const hreflang = anchor.getAttribute('hreflang');
    found.push({
      href: anchor.getAttribute('href') ?? '',
      nodePath: nodePathOf(anchor, cache),
      ...(rel === null || rel === '' ? {} : { rel }),
      ...(hreflang === null || hreflang === '' ? {} : { hreflang }),
    });
  }
  return found;
}

/**
 * The label a picker entry offers, **as the site expressed it**.
 *
 * Visible text first, then the carriers a framework switcher may use instead —
 * `value="UA"`, `hreflang`, `lang`, `data-lang`. Never normalized: the kernel
 * decides what `UA` means, and doing it here would move that judgement out of
 * the replayable half of the system.
 */
function optionLabel(element: Element): string {
  const text = element.textContent.replace(/\s+/gu, ' ').trim();
  if (text !== '') return text;
  for (const attribute of ['value', 'hreflang', 'lang', 'data-lang', 'data-locale', 'title']) {
    const value = element.getAttribute(attribute);
    if (value !== null && value.trim() !== '') return value.trim();
  }
  return '';
}

/**
 * A picker entry's navigable target, or `null` when it exposes none.
 *
 * The `null` is load-bearing: it is exactly what `core/picker-no-navigable-target`
 * adjudicates, so it must never be softened to `'#'` or `''`. A bare `#` is also
 * no target, and is reported as such.
 */
function optionHref(element: Element): string | null {
  const href = element.getAttribute('href');
  if (href === null) return null;
  const trimmed = href.trim();
  if (trimmed === '' || trimmed === '#') return null;
  return trimmed;
}

function optionsOf(
  picker: Picker,
  currentHref: string | undefined,
  cache: NodePathCache,
): readonly PickerOption[] {
  const entries: readonly ClassifiedLink[] = picker.allLinks ?? picker.links;
  const active = activeLanguageFromPicker(picker, currentHref);
  return entries.map((entry) => ({
    label: optionLabel(entry.el),
    href: optionHref(entry.el),
    active: active !== null && entry.language === active,
    nodePath: nodePathOf(entry.el, cache),
  }));
}

/**
 * The page's language picker, digested — or `null` when the site has none.
 *
 * A `null` here is a real answer, not a failure: movar.fyi deliberately has no
 * switcher, and the picker rules must read `not-applicable` rather than `fail`.
 */
function pickerOf(
  doc: Document,
  currentHref: string | undefined,
  cache: NodePathCache,
): PickerEvidence | null {
  const pickers = findLanguagePickers(doc);
  if (pickers.length === 0) return null;
  const model = buildPickerModel(pickers, currentHref);
  const [first] = model.pickers;
  if (first === undefined) return null;

  const options = optionsOf(first, currentHref, cache);
  const activeOption = options.find((option) => option.active);
  return {
    nodePath: nodePathOf(first.container, cache),
    kind: model.extractor,
    activeLabel: activeOption?.label ?? null,
    options,
  };
}

/* -------------------------------------------------------------------------- */
/* Text sampling                                                               */
/* -------------------------------------------------------------------------- */

function isSkipped(element: Element | null): boolean {
  let current = element;
  while (current !== null) {
    if (SKIPPED_ELEMENTS.has(current.tagName.toLowerCase())) return true;
    current = current.parentElement;
  }
  return false;
}

/** The nearest ancestor's declared `lang`, or `null` when nothing declares one. */
function inheritedLangOf(element: Element | null): string | null {
  let current = element;
  while (current !== null) {
    const lang = current.getAttribute('lang');
    if (lang !== null && lang.trim() !== '') return lang;
    current = current.parentElement;
  }
  return null;
}

/** `'nav'` / `'footer'` / `'main'` from the nearest semantic ancestor or role. */
function regionOf(element: Element | null): string | undefined {
  let current = element;
  while (current !== null) {
    const byTag = REGION_BY_TAG.get(current.tagName.toLowerCase());
    if (byTag !== undefined) return byTag;
    const role = current.getAttribute('role');
    const byRole = role === null ? undefined : REGION_BY_ROLE.get(role.toLowerCase());
    if (byRole !== undefined) return byRole;
    current = current.parentElement;
  }
  return undefined;
}

function sampleTextNodes(
  doc: Document,
  cache: NodePathCache,
): {
  readonly samples: readonly TextNodeSample[];
  readonly report: SamplingReport;
} {
  const samples: TextNodeSample[] = [];
  const walker = doc.createTreeWalker(doc.body, SHOW_TEXT);
  let examined = 0;

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const raw = (node.nodeValue ?? '').replace(/\s+/gu, ' ').trim();
    if (raw.length < MIN_SAMPLED_CHARS) continue;
    const parent = node.parentElement;
    if (isSkipped(parent)) continue;
    examined += 1;
    if (samples.length >= MAX_TEXT_NODE_SAMPLES) continue;

    const region = regionOf(parent);
    samples.push({
      nodePath: parent === null ? '' : nodePathOf(parent, cache),
      text: raw.slice(0, MAX_TEXT_NODE_CHARS),
      inheritedLang: inheritedLangOf(parent),
      ...(region === undefined ? {} : { region }),
    });
  }

  return {
    samples,
    report: {
      examined,
      sampled: samples.length,
      ...(examined > samples.length ? { cappedAt: MAX_TEXT_NODE_SAMPLES } : {}),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Reduce an already-parsed document to the structural digest `evaluate()`
 * adjudicates.
 *
 * Takes any DOM `Document` — jsdom's under Node, `DOMParser`'s inside the host
 * app's `WKWebView`. The caller owns parsing and (under Node only) the DOM
 * globals `@movar/lang-pickers` narrows against; see this module's header.
 */
export function digestFromDocument(doc: Document, options: DigestOptions = {}): DigestResult {
  const cache: NodePathCache = new WeakMap();
  const { samples, report } = sampleTextNodes(doc, cache);

  return {
    document: {
      htmlLang: htmlLangOf(doc),
      langAttributes: langAttributesOf(doc, cache),
      alternates: alternatesOf(doc, options.headerAlternates ?? [], cache),
      picker: pickerOf(doc, options.url, cache),
      links: linksOf(doc, cache),
      textNodes: samples,
    },
    sampling: report,
  };
}
