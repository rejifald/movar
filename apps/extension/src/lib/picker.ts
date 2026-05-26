import type { LanguageCode } from '@movar/shared';
import { normalizeBCP47, normalizeLanguageCode } from './lang-codes';

/** Max length a link/label's text can be before we stop treating it as a language label. */
const MAX_LANG_TEXT = 32;
/** Max ancestors we walk up looking for a picker container. */
const MAX_PICKER_DEPTH = 6;

const QUERY_LANG_PARAMS = ['lang', 'locale', 'hl', 'language'] as const;

const HIDDEN_ATTR = 'data-movar-hidden';

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
].join(', ');

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
    // Otherwise scan each `-`/`_`-separated part, skipping noise words.
    for (const part of cls.split(/[-_]/)) {
      if (!part || CLASS_NOISE.has(part.toLowerCase())) continue;
      const lang = normalizeLanguageCode(part);
      if (lang) return lang;
    }
  }
  return null;
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

  let url: URL | null = null;
  try {
    url = new URL(el.href, el.baseURI);
  } catch {
    // Not a valid URL — fall through.
  }
  if (!url) return null;

  // Query parameters are explicit by convention (`?lang=`, `?hl=en-US`) — these
  // unambiguously identify a language switcher.
  for (const param of QUERY_LANG_PARAMS) {
    const value = url.searchParams.get(param);
    if (value) {
      const lang = normalizeBCP47(value);
      if (lang) return { el, language: lang };
    }
  }

  // Path segments are FREE-TEXT slugs — strict match only AND require a
  // corroborating signal on the same anchor. /ru works for a logo link to the
  // RU homepage just as much as for an actual language picker; the difference
  // is that real picker items also carry a flag image, language-named text,
  // a title="Russian", or a `ru-link` class.
  const firstSeg = url.pathname.split('/').filter(Boolean)[0];
  if (!firstSeg) return null;
  const urlLang = normalizeLanguageCode(firstSeg);
  if (!urlLang) return null;

  // Check class hints (these are language-coded on real pickers).
  if (typeof el.className === 'string' && el.className) {
    if (languageFromClasses(el.className) === urlLang) {
      return { el, language: urlLang };
    }
  }
  // Check label-like signals (text, title, aria-label, descendant img alt).
  const signals: string[] = [];
  const text = (el.textContent ?? '').trim();
  if (text && text.length <= MAX_LANG_TEXT) signals.push(text);
  for (const attr of ['title', 'aria-label'] as const) {
    const v = el.getAttribute(attr);
    if (v && v.length <= MAX_LANG_TEXT) signals.push(v);
  }
  const img = el.querySelector('img[alt]');
  if (img) {
    const alt = img.getAttribute('alt');
    if (alt && alt.length <= MAX_LANG_TEXT) signals.push(alt);
  }
  for (const signal of signals) {
    if (normalizeLanguageCode(signal) === urlLang) {
      return { el, language: urlLang };
    }
  }
  return null;
}

/**
 * Classify any element as a language link. Tries signals from most to least
 * reliable: hreflang/URL (anchors) → data-lang/data-locale → class pattern →
 * aria-label/title → text → descendant <img alt> (flag-only pickers).
 */
export function classifyLanguageElement(el: HTMLElement): ClassifiedLink | null {
  if (el instanceof HTMLAnchorElement) {
    const anchored = classifyAnchor(el);
    if (anchored) return anchored;
  }

  // data-lang / data-locale are explicit data attributes; BCP47 is common.
  const dataLang = el.getAttribute('data-lang') ?? el.getAttribute('data-locale');
  if (dataLang) {
    const lang = normalizeBCP47(dataLang);
    if (lang) return { el, language: lang };
  }

  if (!(el instanceof HTMLAnchorElement)) {
    const hreflang = el.getAttribute('hreflang');
    if (hreflang) {
      const lang = normalizeBCP47(hreflang);
      if (lang) return { el, language: lang };
    }
  }

  const className = el.className;
  if (typeof className === 'string' && className) {
    const lang = languageFromClasses(className);
    if (lang) return { el, language: lang };
  }

  for (const attr of ['aria-label', 'title'] as const) {
    const src = el.getAttribute(attr);
    if (src && src.length <= MAX_LANG_TEXT) {
      const lang = normalizeLanguageCode(src);
      if (lang) return { el, language: lang };
    }
  }

  const text = (el.textContent ?? '').trim();
  if (text && text.length <= MAX_LANG_TEXT) {
    const lang = normalizeLanguageCode(text);
    if (lang) return { el, language: lang };
  }

  // Last resort: a flag-only picker — language hidden in a descendant <img alt>.
  // Restricted to leaf-like clickables; doing it for any element would let a
  // container classify itself via its first child's flag and shadow real items.
  if (el instanceof HTMLAnchorElement || el instanceof HTMLButtonElement) {
    const img = el.querySelector('img[alt]');
    if (img) {
      const alt = img.getAttribute('alt');
      if (alt && alt.length <= MAX_LANG_TEXT) {
        const lang = normalizeLanguageCode(alt);
        if (lang) return { el, language: lang };
      }
    }
  }

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

/** Classify the container's direct children, deduping against already-classified items. */
function classifyContainerChildren(
  container: HTMLElement,
  preClassified: ClassifiedLink[],
): ClassifiedLink[] {
  const inside: ClassifiedLink[] = preClassified.filter((c) => container.contains(c.el));
  const seen = new Set<HTMLElement>(inside.map((c) => c.el));

  for (const child of Array.from(container.children) as HTMLElement[]) {
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
  const candidates = Array.from(root.querySelectorAll<HTMLElement>(SEED_SELECTORS));
  // querySelectorAll already dedupes element identity across the comma-list.
  const classified: ClassifiedLink[] = [];
  for (const el of candidates) {
    const c = classifyLanguageElement(el);
    if (c) classified.push(c);
  }
  if (classified.length < 2) return [];

  const deduped = dedupNested(classified);
  if (deduped.length < 2) return [];

  const byContainer = new Map<HTMLElement, ClassifiedLink[]>();
  for (const link of deduped) {
    let parent: HTMLElement | null = link.el.parentElement;
    for (let depth = 0; parent !== null && depth < MAX_PICKER_DEPTH; depth++) {
      const insideLinks = classifyContainerChildren(parent, deduped);
      if (insideLinks.length >= 2) {
        if (!byContainer.has(parent)) byContainer.set(parent, insideLinks);
        break;
      }
      parent = parent.parentElement;
    }
  }

  return Array.from(byContainer, ([container, links]) => ({ container, links }));
}

export function hideElement(el: HTMLElement, reason: string): void {
  if (el.hasAttribute(HIDDEN_ATTR)) return;
  el.setAttribute(HIDDEN_ATTR, reason);
  el.style.setProperty('display', 'none', 'important');
  // <option> needs the `hidden` attribute too — older browsers ignore display:none on it.
  if (el instanceof HTMLOptionElement) el.hidden = true;
}

/**
 * Hide every classified link whose language is NOT in `keep`. If, after
 * filtering, ≤1 language remains in a picker, hide the whole container too
 * (a one-option picker is just visual noise).
 */
export function filterPickers(pickers: Picker[], keep: LanguageCode[]): FilterResult {
  const hiddenLinks: ClassifiedLink[] = [];
  const hiddenContainers: HTMLElement[] = [];
  const keepSet = new Set(keep);

  for (const picker of pickers) {
    let remaining = 0;
    for (const link of picker.links) {
      if (!keepSet.has(link.language)) {
        if (!link.el.hasAttribute(HIDDEN_ATTR)) {
          hideElement(link.el, 'not-in-priority');
          hiddenLinks.push(link);
        }
      } else {
        remaining++;
      }
    }
    if (remaining <= 1 && !picker.container.hasAttribute(HIDDEN_ATTR)) {
      hideElement(picker.container, 'single-option');
      hiddenContainers.push(picker.container);
    }
  }

  return { hiddenLinks, hiddenContainers };
}

export function detectPageLanguage(
  doc: Document = document,
  loc: Pick<Location, 'pathname'> = location,
): LanguageCode | null {
  // <html lang="..."> is BCP47 by spec — region suffix is legal.
  const htmlLang = doc.documentElement.getAttribute('lang');
  if (htmlLang) {
    const norm = normalizeBCP47(htmlLang);
    if (norm) return norm;
  }
  // Path segment is a free-text slug — strict only, to avoid e.g.
  // /ru-return-warranty being mistaken for a Russian page.
  const firstSeg = loc.pathname.split('/').filter(Boolean)[0];
  if (firstSeg) {
    const norm = normalizeLanguageCode(firstSeg);
    if (norm) return norm;
  }
  return null;
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
