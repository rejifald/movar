import type { LanguageCode } from '@movar/lang-detect';
import type { Picker, RedirectTarget } from './types';

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
