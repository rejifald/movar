import type { LanguageCode } from '@movar/shared';
import { detectCyrillicLanguage } from '@movar/lang-detect';
import { attachCurtain, defaultHiddenIcon } from './curtain';
import { getContentMessages } from './i18n/content';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';
import { attachTooltip, type TooltipHandle } from './tooltip';

/** Max length a link/label's text can be before we stop treating it as a language label. */
const MAX_LANG_TEXT = 32;
/** Max ancestors we walk up looking for a picker container. Picker items in
 *  modern frameworks (Headless UI, Radix, etc.) are commonly wrapped 8+
 *  levels deep before reaching the shared container. */
const MAX_PICKER_DEPTH = 12;

const QUERY_LANG_PARAMS = ['lang', 'locale', 'hl', 'language'] as const;

/** Visual separators that sit between adjacent language labels in a single
 *  text node ("UA  |  RU", "EN / DE", "Українська · Русский", "EN – DE").
 *  Hyphen/underscore/whitespace are intentionally excluded — those occur
 *  inside legitimate alias keys ('по-русски', 'in english') and would
 *  over-split. Used only by `textToLanguage`; `languageFromText` restricts
 *  separator splitting to leaf elements so a container of inline labels
 *  doesn't classify as one of its inner languages. */
const LABEL_SEPARATORS = /[|/·•›→,;–—]/;

const HIDDEN_ATTR = 'data-movar-hidden';
const ORIGINAL_DISPLAY_ATTR = 'data-movar-original-display';
const ORIGINAL_DISPLAY_PRIORITY_ATTR = 'data-movar-original-display-priority';
/** Snapshot of a picker-link leaf's textContent before we trimmed an orphan
 *  separator from it. Restored by content.ts clearAllModifications so
 *  "Show everything on this page" returns the leaf to verbatim site state. */
export const ORIGINAL_TEXT_ATTR = 'data-movar-original-text';
/** Marker placed on a picker container after the user clicks "Show hidden
 *  options" in the survivor tooltip. filterPickers skips marked containers
 *  so MutationObserver re-runs don't undo the restore. Cleared by
 *  clearAllModifications (popup's "Show everything") so global restore
 *  resets per-picker memory too. */
export const RESTORED_ATTR = 'data-movar-restored';
/** Per-anchor tooltip handles, used to detach a previously-attached
 *  tooltip when annotateSurvivingLinks re-runs (MutationObserver, settings
 *  change) and the hidden-language list might have changed. WeakMap so
 *  detached/removed anchors are GC'd along with their handles. */
const anchorTooltips = new WeakMap<HTMLElement, TooltipHandle>();

/** Leading/trailing run of whitespace + separator characters. Same set as
 *  LABEL_SEPARATORS plus whitespace (`\s` matches U+00A0 nbsp, which is
 *  what real sites use for `UA&nbsp;|&nbsp;` spacing). */
const LEADING_SEPARATOR_RUN = /^[\s|/·•›→,;–—]+/;
const TRAILING_SEPARATOR_RUN = /[\s|/·•›→,;–—]+$/;

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
// Bytewise codepoint validation; the six early-return guards are the readable
// shape for this decode.
// fallow-ignore-next-line complexity
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

/** Strict per-token classify — alias table or flag emoji, no tokenisation. */
function classifyToken(text: string): LanguageCode | null {
  const direct = normalizeLanguageCode(text);
  if (direct) return direct;
  const country = flagEmojiToCountry(text);
  return country ? (COUNTRY_TO_LANG[country] ?? null) : null;
}

/** Resolve text — plain alias, BCP47 tag, or flag emoji — to a language.
 *  When the whole string doesn't classify, falls back to splitting on visual
 *  separators ("UA | ", "EN / DE") and returning the first token that does.
 *  Don't call this on the textContent of an element with element children —
 *  see `languageFromText` for why. */
function textToLanguage(text: string): LanguageCode | null {
  const direct = classifyToken(text);
  if (direct) return direct;
  if (!LABEL_SEPARATORS.test(text)) return null;
  for (const part of text.split(LABEL_SEPARATORS)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length > MAX_LANG_TEXT) continue;
    const partLang = classifyToken(trimmed);
    if (partLang) return partLang;
  }
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
  // Separator-split only fires on leaf elements (no element children). A
  // bare <span>UA  |  </span> next to a switch <a> classifies cleanly — but
  // if the element has children, its textContent is the joined labels of
  // inner nodes ("UA | RU"), and splitting would let the container itself
  // classify as one of those languages and shadow per-child detection.
  if (el.children.length > 0) return classifyToken(text);
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

/** Pattern for class tokens that mark an element as a visual separator
 *  ("divider", "lang-sep", "separator-line", "bullet-icon", etc.). Tokenised
 *  match — requires a delimiter on each side so we don't false-positive on
 *  unrelated words that happen to contain "sep". */
const DIVIDER_CLASS_PATTERN = /(^|[-_\s])(divider|separator|sep|bullet|pipe)([-_\s]|$)/i;

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
    if (!prevHidden && !nextHidden) continue;

    let trimmed = text;
    if (prevHidden) trimmed = trimmed.replace(LEADING_SEPARATOR_RUN, '');
    if (nextHidden) trimmed = trimmed.replace(TRAILING_SEPARATOR_RUN, '');
    if (trimmed === text) continue;

    link.el.setAttribute(ORIGINAL_TEXT_ATTR, text);
    link.el.textContent = trimmed;
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
      action: {
        label: showLabel,
        onClick: () => restorePickerInPlace(picker),
      },
    });
    anchorTooltips.set(link.el, handle);
  }
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
