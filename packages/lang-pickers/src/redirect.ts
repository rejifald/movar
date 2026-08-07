import type { LanguageCode } from '@movar/lang-detect';
import type { Picker, PickedRedirect, RedirectTarget } from './types';

/**
 * Attributes and roles that mark an element as a *disclosure control* — its job
 * is to REVEAL the picker, not to choose a language. Bootstrap's
 * `data-toggle="dropdown"` (3/4) and `data-bs-toggle` (5), plus the ARIA
 * disclosure and combobox patterns, cover the shapes seen in the wild.
 *
 * This matters most on a page that is ALREADY serving the preferred language,
 * because a collapsed switcher labels its toggle with the language you are
 * currently in (`<button class="dropdown-toggle">УКР</button>`). That toggle is
 * then the first — often only — entry matching the top of the priority list, so
 * a naive match hands it back as the redirect target and activating it merely
 * pops the menu open in the visitor's face. Nothing clicked on such a page
 * before `trySatisfyLanguageGate` existed, which is why it surfaced with it.
 */
const DISCLOSURE_SELECTOR = [
  '[aria-haspopup]:not([aria-haspopup="false"])',
  '[aria-expanded]',
  '[data-toggle~="dropdown"]',
  '[data-bs-toggle~="dropdown"]',
  '[role="combobox"]',
].join(',');

function isDisclosureControl(el: Element): boolean {
  return el.matches(DISCLOSURE_SELECTOR);
}

/** The element to activate for one classified entry, or null when the entry
 *  offers no way to switch INTO its language — a bare "you are here" marker, a
 *  wrapper with nothing interactive inside, or a control that only opens the
 *  menu (see {@link DISCLOSURE_SELECTOR}). */
function activatableTarget(el: HTMLElement): RedirectTarget | null {
  const clickable =
    el instanceof HTMLAnchorElement || el instanceof HTMLButtonElement
      ? el
      : // Wrapper element (e.g. <li data-lang>) — look inside for an anchor or button.
        el.querySelector<HTMLAnchorElement | HTMLButtonElement>('a[href], button');
  if (clickable === null) return null;
  return isDisclosureControl(clickable) ? null : clickable;
}

/** Returns the clickable element for the highest-priority language the picker
 *  actually has a *usable* entry for, paired with that matched language — `lang`
 *  here, NOT `priority[0]`, since an earlier priority language may have no link
 *  at all. Callers must record the returned `language`, not the priority list's
 *  head (issue #299). */
export function pickRedirectTarget(
  pickers: Picker[],
  priority: LanguageCode[],
): PickedRedirect | null {
  const all = pickers.flatMap((p) => p.links);
  for (const lang of priority) {
    const matches = all.filter((l) => l.language === lang);
    // Language absent from every picker — try the next preference down.
    if (matches.length === 0) continue;
    for (const match of matches) {
      const target = activatableTarget(match.el);
      if (target) return { target, language: lang };
    }
    // The page OFFERS this language but nothing here switches INTO it: every
    // entry is an inert marker or a menu opener, which is exactly what a picker
    // looks like when the page is already serving that language. Stop instead
    // of falling through — activating a lower-priority language would DOWNGRADE
    // a page that is already at the best one on offer (uk → en on an
    // already-Ukrainian page).
    return null;
  }
  return null;
}
