/**
 * The DOM tier, against **any** `Document`: HTML already parsed in,
 * serializable {@link DocumentEvidence} out.
 *
 * This module is the half of the digest that both collectors share. It touches
 * no `jsdom`, no `node:*`, and no DOM **globals** — only the `Document` it is
 * handed. So the same code digests a jsdom document under Node (see
 * `./digest.ts`, which adds the parse step and the globals shim) and a
 * `DOMParser.parseFromString` document inside the host app's `WKWebView`, where
 * the DOM is real and no shim is needed.
 *
 * That split is what lets one digest serve two runtimes, and it matters more
 * than it looks: a second, drifting reimplementation of "what counts as an
 * hreflang alternate" would mean two collectors that disagree about the same
 * page, when `Evidence` is supposed to be the only thing they share.
 *
 * It **samples and never classifies** — the classifier runs inside `evaluate()`,
 * so a stored bundle re-adjudicates against improved detection years later.
 * Values are captured **verbatim**: normalizing an `hreflang` or a picker label
 * here would move a judgement out of the replayable half of the system.
 *
 * The one global dependency is `@movar/lang-pickers`, which narrows with
 * `instanceof HTMLAnchorElement` and friends. In a browser or a `WKWebView`
 * those are the document's own constructors; under bare Node they are undefined,
 * so installing them is the Node wrapper's job — see `DigestOptions.withDom`.
 */

import { findLanguagePickers } from '@movar/lang-pickers';
import { activeLanguageFromPicker, buildPickerModel } from '@movar/lang-pickers';
import type { ClassifiedLink, Picker } from '@movar/lang-pickers';
import type {
  AlternateLink,
  DocumentEvidence,
  HeadLanguageDeclaration,
  HeadTextField,
  HeadTextSample,
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
  /** The `Content-Language` response header, when the probe tier saw one. */
  readonly contentLanguageHeader?: string;
  /**
   * Runs `run` with the DOM globals `@movar/lang-pickers` narrows against
   * (`instanceof HTMLAnchorElement`, `NodeFilter`) in scope.
   *
   * Defaults to calling `run` directly, which is correct in any real DOM — a
   * browser tab, a `WKWebView` — where those globals ARE the document's own.
   * Only the Node wrapper needs to install them, and it passes this so the
   * install brackets **the picker step alone**.
   *
   * That narrowness is load-bearing, not tidiness: wrapping the whole digest
   * instead measured ~50% slower on a 1500-node page under coverage, enough to
   * time a test out on CI. Swapping globals is cheap; doing it around the
   * text-sampling walk is not.
   */
  readonly withDom?: <T>(run: () => T) => T;
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
/* The head                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The `<meta>` carriers of a head language declaration, and what each one is.
 *
 * `og:*` uses `property`, `twitter:*` and `description` use `name`, and real
 * pages mix the two attributes freely — so both are looked up for every key
 * rather than trusting each vocabulary to have been spelled correctly.
 */
const META_DECLARATIONS: ReadonlyMap<string, HeadLanguageDeclaration['kind']> = new Map([
  ['og:locale', 'og-locale'],
  ['og:locale:alternate', 'og-locale-alternate'],
  ['content-language', 'content-language'],
]);

/** The head text fields the classifier may be asked about. */
const META_TEXT_FIELDS: ReadonlyMap<string, HeadTextField> = new Map([
  ['description', 'meta-description'],
  ['og:title', 'og:title'],
  ['og:description', 'og:description'],
  ['twitter:title', 'twitter:title'],
  ['twitter:description', 'twitter:description'],
]);

/** The key a `<meta>` declares itself under, whichever attribute carries it. */
function metaKey(element: Element): string {
  const key =
    element.getAttribute('property') ??
    element.getAttribute('name') ??
    element.getAttribute('http-equiv') ??
    '';
  return key.trim().toLowerCase();
}

function metaContent(element: Element): string {
  return (element.getAttribute('content') ?? '').replace(/\s+/gu, ' ').trim();
}

/**
 * The head's declared language surface, plus the response header's when the
 * probe tier collected one.
 *
 * The header is folded in here — exactly as `Link:` alternates already are — so
 * that `core/lang-contradicts-content-language` stays a `static` rule that
 * replays against a stored bundle instead of reaching for a probe.
 */
function headDeclarationsOf(
  doc: Document,
  contentLanguageHeader: string | undefined,
  cache: NodePathCache,
): readonly HeadLanguageDeclaration[] {
  const found: HeadLanguageDeclaration[] = [];
  const header = contentLanguageHeader?.trim() ?? '';
  if (header !== '') {
    found.push({ kind: 'content-language', value: header, source: 'header' });
  }
  for (const element of doc.querySelectorAll('meta')) {
    const kind = META_DECLARATIONS.get(metaKey(element));
    if (kind === undefined) continue;
    const value = metaContent(element);
    if (value === '') continue;
    found.push({ kind, value, source: 'meta', nodePath: nodePathOf(element, cache) });
  }
  return found;
}

/**
 * The head's own text, sampled verbatim and never classified here.
 *
 * Kept out of {@link sampleTextNodes} on purpose: these strings are adjudicated
 * as their own samples against their own denominator, and pooling them with
 * body text would bury a wholly-untranslated title in a thousand-node vote.
 */
function headTextsOf(doc: Document, cache: NodePathCache): readonly HeadTextSample[] {
  const found: HeadTextSample[] = [];
  const title = doc.querySelector('title');
  const titleText = (title?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  if (title !== null && titleText !== '') {
    found.push({
      field: 'title',
      text: titleText.slice(0, MAX_TEXT_NODE_CHARS),
      nodePath: nodePathOf(title, cache),
    });
  }
  for (const element of doc.querySelectorAll('meta')) {
    const field = META_TEXT_FIELDS.get(metaKey(element));
    if (field === undefined) continue;
    const text = metaContent(element);
    if (text === '') continue;
    found.push({
      field,
      text: text.slice(0, MAX_TEXT_NODE_CHARS),
      nodePath: nodePathOf(element, cache),
    });
  }
  return found;
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
 * globals the picker model narrows against.
 */
export function digestFromDocument(doc: Document, options: DigestOptions = {}): DigestResult {
  const cache: NodePathCache = new WeakMap();
  const { samples, report } = sampleTextNodes(doc, cache);
  // Only the picker model needs the globals; keep the window as narrow as
  // possible — see `DigestOptions.withDom`.
  const runWithDom = options.withDom ?? ((run) => run());
  const picker = runWithDom(() => pickerOf(doc, options.url, cache));

  return {
    document: {
      htmlLang: htmlLangOf(doc),
      langAttributes: langAttributesOf(doc, cache),
      alternates: alternatesOf(doc, options.headerAlternates ?? [], cache),
      picker,
      links: linksOf(doc, cache),
      textNodes: samples,
      head: {
        declarations: headDeclarationsOf(doc, options.contentLanguageHeader, cache),
        texts: headTextsOf(doc, cache),
      },
    },
    sampling: report,
  };
}
