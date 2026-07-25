import type { LanguageCode } from '@movar/lang-detect';
import type { Picker, PickedRedirect } from './types';

/** Returns the clickable element for the highest-priority language the picker
 *  actually has a link for, paired with that matched language — `lang` here,
 *  NOT `priority[0]`, since an earlier priority language may have no link at
 *  all. Callers must record the returned `language`, not the priority list's
 *  head (issue #299). */
export function pickRedirectTarget(
  pickers: Picker[],
  priority: LanguageCode[],
): PickedRedirect | null {
  const all = pickers.flatMap((p) => p.links);
  for (const lang of priority) {
    const match = all.find((l) => l.language === lang);
    if (!match) continue;
    if (match.el instanceof HTMLAnchorElement) return { target: match.el, language: lang };
    if (match.el instanceof HTMLButtonElement) return { target: match.el, language: lang };
    // Wrapper element (e.g. <li data-lang>) — look inside for an anchor or button.
    const inner = match.el.querySelector<HTMLAnchorElement | HTMLButtonElement>('a[href], button');
    if (inner) return { target: inner, language: lang };
  }
  return null;
}
