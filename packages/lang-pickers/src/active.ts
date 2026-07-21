// The split-and-classify loop mirrors textToLanguage in classify.ts — collect-all vs
// return-first. They can't share a helper without an active<->classify import cycle; the
// duplication is exempted in .fallowrc.json (file-level inline suppression is banned).
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

/** True when an anchor has no real destination — `null`/empty/`#`/`javascript:`
 *  href. This alone does NOT mean "current language": such an href is just as
 *  often a JS-driven switcher for some OTHER language. Treated as a weak signal
 *  that only marks the active language when corroborated (aria/class) or when it
 *  is the picker's only candidate. */
function hasNoRealHref(el: HTMLElement): boolean {
  if (!(el instanceof HTMLAnchorElement)) return false;
  const rawHref = el.getAttribute('href');
  return rawHref == null || rawHref === '' || rawHref === '#' || rawHref.startsWith('javascript:');
}

/** Resolve a classified entry to the element whose active-ness actually decides
 *  it. A wrapper (`<li>`, `<div>`, …) that contains exactly one interactive
 *  switcher — an anchor WITH an href, or a button — is a switcher ITEM, so it's
 *  judged by that switcher, not by the wrapper being non-clickable. Anchors and
 *  buttons resolve to themselves; a wrapper with no lone switcher inside
 *  resolves to itself (a genuine bare-text marker like
 *  `<span class="lang-uk">UK</span>`). This is what stops OpenCart-style
 *  `<li><a href="#">…</a></li>` option lists — yato.com.ua — from reading their
 *  FIRST option as the active language. */
function resolveSwitcher(el: HTMLElement): HTMLElement {
  if (el instanceof HTMLAnchorElement || el instanceof HTMLButtonElement) return el;
  const interactive = el.querySelectorAll<HTMLElement>('a[href], button');
  const lone = interactive.length === 1 ? interactive.item(0) : null;
  return lone ?? el;
}

/** True when this classified picker entry is, by construction, NOT a working
 *  switcher to ANOTHER language — so it must be the active ("you are here") one:
 *  a bare non-interactive marker (span/div/etc.), an anchor pointing at the
 *  current URL, or an explicitly disabled button. A wrapper element is judged by
 *  the lone switcher it contains (see {@link resolveSwitcher}). Deliberately
 *  EXCLUDES the bare-href anchor case (`#`, empty, javascript:) — see
 *  {@link hasNoRealHref}: a no-href anchor is frequently a JS switcher for a
 *  different language, so it isn't a reliable "current locale" marker on its own. */
function isInactiveSwitcher(el: HTMLElement, currentHref: string | undefined): boolean {
  const target = resolveSwitcher(el);
  if (target instanceof HTMLAnchorElement) {
    // A real self-link (href resolves to the current URL) IS the active marker;
    // a bare/`#` href is not — it's deferred to the corroborated/sole-candidate
    // path so it can't short-circuit a genuine class/aria signal.
    if (hasNoRealHref(target)) return false;
    return currentHref !== undefined && target.href === currentHref;
  }
  if (target instanceof HTMLButtonElement) {
    return target.disabled || target.getAttribute('aria-disabled') === 'true';
  }
  // A non-interactive element (target === el). A leaf-ish marker with NO
  // interactive descendant is the active one by construction; a switcher
  // CLUSTER (several interactive descendants) is not a bare marker → abstain.
  return el.querySelector('a[href], button') === null;
}

/** Extract every language token from a single text node by splitting on
 *  separators (`UA | DE` → ['uk', 'de']). Different from `textToLanguage`,
 *  which returns only the first match — we need ALL of them so multi-token
 *  ambiguity can be detected by the caller. */
export function languagesInText(text: string): LanguageCode[] {
  const out: LanguageCode[] = [];
  const direct = classifyToken(text);
  if (direct != null) out.push(direct);
  if (!LABEL_SEPARATORS.test(text)) return out;
  for (const part of text.split(LABEL_SEPARATORS)) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length > MAX_LANG_TEXT) continue;
    const partLang = classifyToken(trimmed);
    if (partLang != null) out.push(partLang);
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
 *   2. The classified link is a non-working switcher BY CONSTRUCTION —
 *      a non-anchor marker, an anchor whose href is the current URL, or a
 *      disabled button.
 *   3. `class` containing `active` / `current` / `selected`.
 *   3a. A bare/`#`/`javascript:`-href anchor (no real destination) — but ONLY
 *      when corroborated by an aria/class signal, or when it is the picker's
 *      single candidate. A no-href anchor is just as often a JS switcher for
 *      ANOTHER language, so on its own it must not be read as the current one
 *      (that would e.g. make a Russian page look already-switched).
 *   4. A bare-text language token inside the picker container that no
 *      classified link covers — the `<div>UA | <a>RU</a> | <a>EN</a></div>`
 *      pattern where the active locale isn't an element child.
 *
 * Returns null when nothing clearly marks one entry as active, or when
 * multiple plausible markers point at different languages (we'd rather
 * abstain than guess in an ambiguous picker).
 */
// Independent passes, each a different signal — flattening would just hide
// which pass fired.
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
  // A no-real-href anchor only marks the active language when corroborated by
  // an aria/class signal (handled above already, so it would have returned) OR
  // when it is the picker's only candidate — a single dead-href entry has no
  // sibling to switch to, so it can only be "you are here".
  if (picker.links.length === 1) {
    const [only] = picker.links;
    if (only && hasNoRealHref(only.el)) return only.language;
  }
  const linkLangs = new Set(picker.links.map((l) => l.language));
  const extra = bareTextLanguagesInContainer(picker, linkLangs);
  if (extra.size === 1) {
    const [only] = extra;
    return only ?? null;
  }
  return null;
}
