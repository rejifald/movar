import type { LanguageCode } from '@movar/shared';
import { detectCyrillicLanguage } from '@movar/lang-detect';
import { attachCurtain, defaultHiddenIcon } from './curtain';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';

/** Max length a link/label's text can be before we stop treating it as a language label. */
const MAX_LANG_TEXT = 32;
/** Max ancestors we walk up looking for a picker container. Picker items in
 *  modern frameworks (Headless UI, Radix, etc.) are commonly wrapped 8+
 *  levels deep before reaching the shared container. */
const MAX_PICKER_DEPTH = 12;

const QUERY_LANG_PARAMS = ['lang', 'locale', 'hl', 'language'] as const;

const HIDDEN_ATTR = 'data-movar-hidden';
const ORIGINAL_DISPLAY_ATTR = 'data-movar-original-display';
const ORIGINAL_DISPLAY_PRIORITY_ATTR = 'data-movar-original-display-priority';

/**
 * Class-name parts we should NEVER treat as language codes. Most are common
 * structural/library prefixes that happen to be 2-3 letters and could collide
 * with ISO codes (e.g. `fi` for Finnish vs flag-icons-css's `fi` prefix).
 */
const CLASS_NOISE = new Set([
  // Structural words common in picker class names
  'link',
  'flag',
  'icon',
  'menu',
  'item',
  'option',
  'option-value',
  'header',
  'footer',
  'social',
  'lang',
  'language',
  'locale',
  'i18n',
  'switch',
  'switcher',
  'nav',
  'tab',
  'list',
  'wrapper',
  'container',
  'btn',
  'button',
  'control',
  'dropdown',
  // Library prefixes that frequently appear in class lists
  'fa', // Font Awesome
  'fi', // flag-icons-css — also Finnish, but the icon-lib usage is overwhelming
  'mb', // Tailwind margin
  'ml',
  'mr',
  'mt',
  'pb',
  'pl',
  'pr',
  'pt',
  'px',
  'py',
  // Tailwind/Bootstrap state words
  'is',
  'has',
  'active',
  'current',
  'selected',
  'disabled',
]);

/**
 * Selectors that broadly indicate "could be a language switcher element".
 * classify() filters the noise — querying broadly is fine. Excludes
 * `link[hreflang]` (in <head>, not visible picker UI) and `<meta>` cases.
 *
 * Includes `option[value]` so native <select>-based pickers get discovered;
 * an `<option>` doesn't typically carry the lang/locale/flag class hints.
 */
const SEED_SELECTORS = [
  'a[href]',
  '[data-lang]',
  '[data-locale]',
  '[hreflang]:not(link):not(meta)',
  '[class*="lang"]',
  '[class*="locale"]',
  '[class*="flag-"]',
  '[class*="-link"]',
  'option[value]',
].join(', ');

/** ISO 3166-1 alpha-2 country → primary language we ship a rule for. */
const COUNTRY_TO_LANG: Record<string, LanguageCode> = {
  UA: 'uk',
  RU: 'ru',
  GB: 'en',
  US: 'en',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  FR: 'fr',
  ES: 'es',
  IT: 'it',
  PL: 'pl',
};

/** Decode a regional-indicator flag emoji into its ISO 3166-1 alpha-2 code.
 *  Returns null for anything that isn't exactly a two-codepoint flag. */
function flagEmojiToCountry(text: string): string | null {
  const trimmed = text.trim();
  const cps = [...trimmed];
  if (cps.length !== 2) return null;
  const [first, second] = cps;
  if (first === undefined || second === undefined) return null;
  const a = first.codePointAt(0);
  const b = second.codePointAt(0);
  if (a === undefined || b === undefined) return null;
  const REGIONAL_A = 0x1f1e6;
  const REGIONAL_Z = 0x1f1ff;
  if (a < REGIONAL_A || a > REGIONAL_Z) return null;
  if (b < REGIONAL_A || b > REGIONAL_Z) return null;
  const c1 = String.fromCodePoint(0x41 + (a - REGIONAL_A));
  const c2 = String.fromCodePoint(0x41 + (b - REGIONAL_A));
  return c1 + c2;
}

/** Resolve text — plain alias, BCP47 tag, or flag emoji — to a language. */
function textToLanguage(text: string): LanguageCode | null {
  const direct = normalizeLanguageCode(text);
  if (direct) return direct;
  const country = flagEmojiToCountry(text);
  if (country) return COUNTRY_TO_LANG[country] ?? null;
  return null;
}

export interface ClassifiedLink {
  el: HTMLElement;
  language: LanguageCode;
}

export interface Picker {
  container: HTMLElement;
  links: ClassifiedLink[];
}

export interface FilterResult {
  hiddenLinks: ClassifiedLink[];
  hiddenContainers: HTMLElement[];
}

/** Try to find a language code anywhere in the class list, ignoring noise tokens. */
function languageFromClasses(className: string): LanguageCode | null {
  for (const cls of className.split(/\s+/)) {
    if (!cls) continue;
    // Direct match on the whole token (e.g. `uk`, `ua`).
    const direct = normalizeLanguageCode(cls);
    if (direct) return direct;
    // Otherwise scan each part split on `-`, `_`, OR a camelCase boundary
    // (`langRu` → ['lang', 'Ru']). Skip noise words.
    for (const part of cls.split(/[-_]|(?=[A-Z])/)) {
      if (!part || CLASS_NOISE.has(part.toLowerCase())) continue;
      const lang = normalizeLanguageCode(part);
      if (lang) return lang;
    }
  }
  return null;
}

function parseAnchorURL(el: HTMLAnchorElement): URL | null {
  try {
    return new URL(el.href, el.baseURI);
  } catch {
    return null;
  }
}

function languageFromQueryParams(url: URL): LanguageCode | null {
  for (const param of QUERY_LANG_PARAMS) {
    const value = url.searchParams.get(param);
    if (!value) continue;
    const lang = normalizeBCP47(value);
    if (lang) return lang;
  }
  return null;
}

/** Label-like signals on an anchor — text, title, aria-label, descendant img alt. */
function collectAnchorLabelSignals(el: HTMLAnchorElement): string[] {
  const signals: string[] = [];
  const text = (el.textContent ?? '').trim();
  if (text && text.length <= MAX_LANG_TEXT) signals.push(text);
  for (const attr of ['title', 'aria-label'] as const) {
    const v = el.getAttribute(attr);
    if (v && v.length <= MAX_LANG_TEXT) signals.push(v);
  }
  const img = el.querySelector('img[alt]');
  const alt = img?.getAttribute('alt');
  if (alt && alt.length <= MAX_LANG_TEXT) signals.push(alt);
  return signals;
}

/** Corroborate a path-segment language guess via class hints or label signals. */
function anchorCorroboratesLanguage(el: HTMLAnchorElement, urlLang: LanguageCode): boolean {
  if (
    typeof el.className === 'string' &&
    el.className &&
    languageFromClasses(el.className) === urlLang
  )
    return true;
  for (const signal of collectAnchorLabelSignals(el)) {
    if (textToLanguage(signal) === urlLang) return true;
  }
  return false;
}

/** Anchor-only signals: hreflang attr + URL path/query, with corroboration
 *  for the noisy path-segment case. */
function classifyAnchor(el: HTMLAnchorElement): ClassifiedLink | null {
  // hreflang is documented as BCP47 → split-on-hyphen is correct here.
  const hreflang = el.getAttribute('hreflang');
  if (hreflang) {
    const lang = normalizeBCP47(hreflang);
    if (lang) return { el, language: lang };
  }

  const url = parseAnchorURL(el);
  if (!url) return null;

  // Query parameters are explicit by convention (`?lang=`, `?hl=en-US`) — these
  // unambiguously identify a language switcher.
  const queryLang = languageFromQueryParams(url);
  if (queryLang) return { el, language: queryLang };

  // Path segments are FREE-TEXT slugs — strict match only AND require a
  // corroborating signal on the same anchor. /ru works for a logo link to the
  // RU homepage just as much as for an actual language picker; the difference
  // is that real picker items also carry a flag image, language-named text,
  // a title="Russian", or a `ru-link` class.
  const firstSeg = url.pathname.split('/').find(Boolean);
  if (!firstSeg) return null;
  const urlLang = normalizeLanguageCode(firstSeg);
  if (!urlLang) return null;

  return anchorCorroboratesLanguage(el, urlLang) ? { el, language: urlLang } : null;
}

function languageFromOptionValue(el: HTMLElement): LanguageCode | null {
  if (!(el instanceof HTMLOptionElement)) return null;
  const value = el.getAttribute('value');
  return value ? normalizeBCP47(value) : null;
}

function languageFromDataAttrs(el: HTMLElement): LanguageCode | null {
  const dataLang = el.dataset['lang'] ?? el.dataset['locale'];
  return dataLang ? normalizeBCP47(dataLang) : null;
}

function languageFromHreflangAttr(el: HTMLElement): LanguageCode | null {
  const hreflang = el.getAttribute('hreflang');
  return hreflang ? normalizeBCP47(hreflang) : null;
}

function languageFromLabelAttrs(el: HTMLElement): LanguageCode | null {
  for (const attr of ['aria-label', 'title'] as const) {
    const src = el.getAttribute(attr);
    if (!src || src.length > MAX_LANG_TEXT) continue;
    const lang = textToLanguage(src);
    if (lang) return lang;
  }
  return null;
}

function languageFromText(el: HTMLElement): LanguageCode | null {
  const text = (el.textContent ?? '').trim();
  if (!text || text.length > MAX_LANG_TEXT) return null;
  return textToLanguage(text);
}

/** Flag-only picker fallback. Restricted to leaf-like clickables; doing it
 *  for any element would let a container classify itself via its first
 *  child's flag and shadow real items. */
function languageFromDescendantFlag(el: HTMLElement): LanguageCode | null {
  if (!(el instanceof HTMLAnchorElement) && !(el instanceof HTMLButtonElement)) return null;
  const img = el.querySelector('img[alt]');
  const alt = img?.getAttribute('alt');
  if (!alt || alt.length > MAX_LANG_TEXT) return null;
  return textToLanguage(alt);
}

/**
 * Classify any element as a language link. Tries signals from most to least
 * reliable: hreflang/URL (anchors) → option value → data-lang/data-locale →
 * class pattern → aria-label/title → text → descendant <img alt>
 * (flag-only pickers).
 */
export function classifyLanguageElement(el: HTMLElement): ClassifiedLink | null {
  if (el instanceof HTMLAnchorElement) {
    const anchored = classifyAnchor(el);
    if (anchored) return anchored;
  }

  const fromOption = languageFromOptionValue(el);
  if (fromOption) return { el, language: fromOption };

  const fromData = languageFromDataAttrs(el);
  if (fromData) return { el, language: fromData };

  // hreflang on anchors is already covered by classifyAnchor above.
  if (!(el instanceof HTMLAnchorElement)) {
    const fromHreflang = languageFromHreflangAttr(el);
    if (fromHreflang) return { el, language: fromHreflang };
  }

  const className = el.className;
  if (typeof className === 'string' && className) {
    const lang = languageFromClasses(className);
    if (lang) return { el, language: lang };
  }

  const fromLabel = languageFromLabelAttrs(el);
  if (fromLabel) return { el, language: fromLabel };

  const fromText = languageFromText(el);
  if (fromText) return { el, language: fromText };

  const fromFlag = languageFromDescendantFlag(el);
  if (fromFlag) return { el, language: fromFlag };

  return null;
}

/** Keep only outer elements when a classified element is nested inside another. */
function dedupNested(items: ClassifiedLink[]): ClassifiedLink[] {
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
  const seen = new Set<LanguageCode>();
  return items.filter((item) => {
    if (seen.has(item.language)) return false;
    seen.add(item.language);
    return true;
  });
}

/** Classify the container's direct children, deduping against already-classified items. */
function classifyContainerChildren(
  container: HTMLElement,
  preClassified: ClassifiedLink[],
): ClassifiedLink[] {
  const inside: ClassifiedLink[] = preClassified.filter((c) => container.contains(c.el));
  const seen = new Set<HTMLElement>(inside.map((c) => c.el));

  for (const child of [...container.children] as HTMLElement[]) {
    if (seen.has(child)) continue;
    if (inside.some((c) => child.contains(c.el))) continue; // child wraps a pre-classified item
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
function deepQuerySelectorAll(root: ParentNode, selector: string): HTMLElement[] {
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

function classifyAll(elements: HTMLElement[]): ClassifiedLink[] {
  const out: ClassifiedLink[] = [];
  for (const el of elements) {
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
function pruneOuterContainers(containers: HTMLElement[]): HTMLElement[] {
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
  if (classified.length < 2) return [];

  const deduped = dedupNested(classified);
  if (deduped.length < 2) return [];

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

function hideElement(el: HTMLElement, reason: string): void {
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

const PICKER_CURTAIN_KIND = 'picker-container';

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

function attachPickerContainerCurtain(container: HTMLElement): void {
  const handle = attachCurtain(container, {
    mode: 'replace',
    icon: defaultHiddenIcon(),
    title: 'Перемикач прихований',
    description: 'У списку немає бажаних мов',
    actions: [
      {
        label: 'Показати',
        onClick: (ctx) => {
          ctx.detach();
        },
      },
    ],
  });
  handle.host.dataset['movarKind'] = PICKER_CURTAIN_KIND;
}

export interface FilterOptions {
  /** Explicitly blocked languages — distinct from "not in priority". When
   *  provided, only blocked languages are stripped; languages outside the
   *  keep list but not blocked are tolerated. */
  blocked?: LanguageCode[];
}

/**
 * Hide picker links the user doesn't want to see.
 *
 * When `options.blocked` is provided, only blocked languages are hidden —
 * languages outside `keep` but not in `blocked` are tolerated and stay
 * visible. This is the recommended path; it matches the "blocked vs
 * everything-else" mental model users have.
 *
 * Without `options`, falls back to the legacy "hide anything not in keep"
 * semantics — except when `keep` is empty (then it's a no-op, since the
 * user has no expressed preference and we shouldn't hide everything).
 *
 * If ≤1 language remains in a picker afterward, hide the whole container
 * too (a one-option picker is visual noise).
 */
/** Hide blocked links in a single picker; return how many links survived. */
function filterPickerLinks(
  picker: Picker,
  shouldHide: (lang: LanguageCode) => boolean,
  hiddenLinks: ClassifiedLink[],
): number {
  let remaining = 0;
  for (const link of picker.links) {
    if (!shouldHide(link.language)) {
      remaining++;
      continue;
    }
    if (link.el.hasAttribute(HIDDEN_ATTR)) continue;
    hideElement(link.el, 'not-in-priority');
    hiddenLinks.push(link);
  }
  return remaining;
}

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

  for (const picker of pickers) {
    const remaining = filterPickerLinks(picker, shouldHide, hiddenLinks);
    if (remaining <= 1 && !isContainerCurtained(picker.container)) {
      attachPickerContainerCurtain(picker.container);
      hiddenContainers.push(picker.container);
    }
  }

  return { hiddenLinks, hiddenContainers };
}

function languageFromHtmlLang(doc: Document): LanguageCode | null {
  const htmlLang = doc.documentElement.getAttribute('lang');
  return htmlLang ? normalizeBCP47(htmlLang) : null;
}

/** Apex domains like `example.com` are skipped — the first label is the
 *  registrable name, not a language. Only 3+ label hostnames qualify. */
function languageFromSubdomain(hostname: string | undefined): LanguageCode | null {
  if (!hostname) return null;
  const labels = hostname.split('.');
  if (labels.length < 3) return null;
  const first = labels[0];
  return first ? normalizeLanguageCode(first) : null;
}

function languageFromPathSegments(pathname: string | undefined): LanguageCode | null {
  if (!pathname) return null;
  for (const seg of pathname.split('/').filter(Boolean)) {
    const norm = normalizeLanguageCode(seg);
    if (norm) return norm;
  }
  return null;
}

/** Self-targeted hreflang: `<link rel="alternate" hreflang="X" href="THIS URL">`
 *  declares the current page's language explicitly. */
function languageFromSelfHreflang(doc: Document, href: string | undefined): LanguageCode | null {
  if (!href) return null;
  const links = doc.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]');
  for (const link of links) {
    if (link.href !== href) continue;
    const norm = normalizeBCP47(link.hreflang);
    if (norm) return norm;
  }
  return null;
}

/** Bails on `unknown` — we'd rather miss a detection than guess wrong about
 *  whole-page language and start filtering or redirecting based on a false
 *  positive. */
function languageFromBodyText(doc: Document): LanguageCode | null {
  if (!doc.body) return null;
  const text = (doc.body.textContent ?? '').trim();
  if (!text) return null;
  const det = detectCyrillicLanguage(text);
  return det.language === 'unknown' ? null : det.language;
}

/**
 * Detect what language the current page is in.
 *
 * Signals, most to least reliable:
 *   1. `<html lang>` — declared by the author, BCP47.
 *   2. Subdomain — `ru.example.com`, `ua.example.com`. Only if multi-label
 *      (apex domains like `example.com` are skipped — the first label is
 *      the registrable name, not a language).
 *   3. Path segments — any segment that strict-matches a language alias.
 *      Strict, not BCP47, so `/ru-return-warranty` doesn't false-positive.
 *   4. Self-targeted hreflang — `<link rel="alternate" hreflang="X"
 *      href="THIS URL">` declares the current page's language explicitly.
 *   5. Body text — Cyrillic-content detection when nothing else fired.
 */
export function detectPageLanguage(
  doc: Document = document,
  loc: Partial<Pick<Location, 'pathname' | 'hostname' | 'href'>> = location,
): LanguageCode | null {
  return (
    languageFromHtmlLang(doc) ??
    languageFromSubdomain(loc.hostname) ??
    languageFromPathSegments(loc.pathname) ??
    languageFromSelfHreflang(doc, loc.href) ??
    languageFromBodyText(doc)
  );
}

/**
 * The clickable element a content script can use to switch into the
 * highest-priority language available in the picker. Prefers a real anchor
 * (cleanest: just `location.replace(href)`), but falls back to a button —
 * useful on sites whose language picker is a form POST (e.g. bosch-centre).
 */
export type RedirectTarget = HTMLAnchorElement | HTMLButtonElement;

export function pickRedirectTarget(
  pickers: Picker[],
  priority: LanguageCode[],
): RedirectTarget | null {
  const all = pickers.flatMap((p) => p.links);
  for (const lang of priority) {
    const match = all.find((l) => l.language === lang);
    if (!match) continue;
    if (match.el instanceof HTMLAnchorElement) return match.el;
    if (match.el instanceof HTMLButtonElement) return match.el;
    // Wrapper element (e.g. <li data-lang>) — look inside for an anchor or button.
    const inner = match.el.querySelector<HTMLAnchorElement | HTMLButtonElement>('a[href], button');
    if (inner) return inner;
  }
  return null;
}
