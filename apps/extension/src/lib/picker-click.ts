import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import type { LanguageCode } from '@movar/lang-detect';

/**
 * Walk up from `el` to the nearest ancestor that classifies as a language
 * element (an anchor with `hreflang`, an `<option value="ru">`, …), returning
 * its language. Stops at `<body>` to bound the walk. Pure DOM read.
 */
export function nearestClassifiedLanguage(el: Element | null): LanguageCode | null {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement) {
      const classified = classifyLanguageElement(cur);
      if (classified) return classified.language;
    }
    cur = cur.parentElement;
  }
  return null;
}

/**
 * True when `el` (or any ancestor up to `<body>`) is one of the containers we
 * identified as a language picker on the most recent apply pass. The container
 * set is passed in so this stays a pure query over caller-owned state.
 */
export function isInsideKnownPicker(
  el: Element | null,
  knownContainers: WeakSet<HTMLElement>,
): boolean {
  let cur: Element | null = el;
  while (cur && cur !== document.body) {
    if (cur instanceof HTMLElement && knownContainers.has(cur)) return true;
    cur = cur.parentElement;
  }
  return false;
}

/**
 * The language a click on `target` represents as a deliberate picker choice, or
 * null when the click is not inside a known picker (an incidental "Read in
 * Russian" link, a `?lang=ru` deep link) or classifies to nothing. Combines the
 * two walks above so the content script's capture-phase listener stays a thin
 * guard-and-record shell around one decision.
 */
export function pickerChoiceForTarget(
  target: Element | null,
  knownContainers: WeakSet<HTMLElement>,
): LanguageCode | null {
  if (!target) return null;
  if (!isInsideKnownPicker(target, knownContainers)) return null;
  return nearestClassifiedLanguage(target);
}
