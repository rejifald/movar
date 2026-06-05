import type { LanguageCode } from '@movar/lang-detect';
import { LABEL_SEPARATORS, MAX_LANG_TEXT } from './types';
import type { Picker } from './types';
import { classifyToken } from './classify';

/** CSS class tokens that conventionally mark the active entry in a nav/picker.
 *  Matched as whole tokens against the element's className. */
const ACTIVE_CLASS_PATTERN = /(?:^|\s)(?:is-)?(?:active|current|selected)(?:\s|$|-|_)/i;

/** `aria-current` values that mark an entry as the page's current language.
 *  `page` is the canonical one; `true`, `language`, and `location` show up in
 *  the wild on language switchers and nav menus that double as locale picks. */
const ACTIVE_ARIA_CURRENT = new Set(['page', 'true', 'language', 'location']);

function isActiveByAria(el: HTMLElement): boolean {
  const value = el.getAttribute('aria-current');
  return value !== null && ACTIVE_ARIA_CURRENT.has(value);
}

function isActiveByClass(el: HTMLElement): boolean {
  return typeof el.className === 'string' && ACTIVE_CLASS_PATTERN.test(el.className);
}

/** True when this classified picker entry is NOT a working language switcher:
 *  the conventional way a picker marks "you are here" is by serving the
 *  current locale as a non-anchor (span/div/etc.), an anchor pointing at
 *  the current URL, or an explicitly disabled button. */
function isInactiveSwitcher(el: HTMLElement, currentHref: string | undefined): boolean {
  if (el instanceof HTMLAnchorElement) {
    const rawHref = el.getAttribute('href');
    if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) return true;
    return currentHref !== undefined && el.href === currentHref;
  }
  if (el instanceof HTMLButtonElement) {
    return el.disabled || el.getAttribute('aria-disabled') === 'true';
  }
  // span / div / li / etc. classified as a language entry — by construction
  // a non-clickable marker, so it's the active one.
  return true;
}

/** Extract every language token from a single text node by splitting on
 *  separators (`UA | DE` → ['uk', 'de']). Different from `textToLanguage`,
 *  which returns only the first match — we need ALL of them so multi-token
 *  ambiguity can be detected by the caller. */
export function languagesInText(text: string): LanguageCode[] {
  const out: LanguageCode[] = [];
  const direct = classifyToken(text);
  if (direct) out.push(direct);
  if (!LABEL_SEPARATORS.test(text)) return out;
  for (const part of text.split(LABEL_SEPARATORS)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length > MAX_LANG_TEXT) continue;
    const partLang = classifyToken(trimmed);
    if (partLang) out.push(partLang);
  }
  return out;
}

/** Walk the picker container's text nodes looking for language tokens that
 *  aren't represented by any classified link. Common pattern this catches:
 *  `<div>UA | <a>RU</a> | <a>EN</a></div>` — `UA` is plain text marking the
 *  active locale, while RU/EN are switcher anchors. Skips text inside any
 *  classified link element so we don't re-count their own labels. */
export function bareTextLanguagesInContainer(
  picker: Picker,
  excludeLangs: ReadonlySet<LanguageCode>,
): Set<LanguageCode> {
  const found = new Set<LanguageCode>();
  const linkEls = new Set(picker.links.map((l) => l.el));
  const walker = picker.container.ownerDocument.createTreeWalker(
    picker.container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        for (let p: Node | null = node.parentNode; p && p !== picker.container; p = p.parentNode) {
          if (p instanceof HTMLElement && linkEls.has(p)) return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').trim();
    if (!text) continue;
    for (const lang of languagesInText(text)) {
      if (!excludeLangs.has(lang)) found.add(lang);
    }
  }
  return found;
}

/**
 * Identify which entry in a picker represents the page's current language.
 *
 * Signals, most to least reliable:
 *   1. `aria-current` on a classified link.
 *   2. The classified link is not a working switcher — non-anchor element,
 *      anchor with no/self href, or disabled button.
 *   3. `class` containing `active` / `current` / `selected`.
 *   4. A bare-text language token inside the picker container that no
 *      classified link covers — the `<div>UA | <a>RU</a> | <a>EN</a></div>`
 *      pattern where the active locale isn't an element child.
 *
 * Returns null when nothing clearly marks one entry as active, or when
 * multiple plausible markers point at different languages (we'd rather
 * abstain than guess in an ambiguous picker).
 */
// Four independent passes, each a different signal — flattening would just
// hide which pass fired.
// fallow-ignore-next-line complexity
export function activeLanguageFromPicker(
  picker: Picker,
  currentHref: string | undefined = typeof location === 'undefined' ? undefined : location.href,
): LanguageCode | null {
  for (const link of picker.links) {
    if (isActiveByAria(link.el)) return link.language;
  }
  for (const link of picker.links) {
    if (isInactiveSwitcher(link.el, currentHref)) return link.language;
  }
  for (const link of picker.links) {
    if (isActiveByClass(link.el)) return link.language;
  }
  const linkLangs = new Set(picker.links.map((l) => l.language));
  const extra = bareTextLanguagesInContainer(picker, linkLangs);
  if (extra.size === 1) {
    const [only] = extra;
    return only ?? null;
  }
  return null;
}
