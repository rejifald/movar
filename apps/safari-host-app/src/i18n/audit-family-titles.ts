/**
 * Section titles for the report's catalogue families, per locale.
 *
 * Lives beside `audit-rule-titles.ts` and for the same two reasons. The keys are
 * the kernel's family IDs — external identifiers with punctuation in them
 * (`'A. Page declaration'`) — which is exactly why they do not belong in
 * `HostMessages`: that catalogue is walked leaf-by-leaf by a dotted path in the
 * parity guard, and a key containing a dot is not addressable there. And the
 * kernel is not translated, so a display-only mapping is the only place these
 * can live at all.
 *
 * Unlike the rule titles, both locales are listed. The kernel's own family
 * titles are written for the catalogue — "Serving behaviour — the
 * Accept-Language response matrix" — and are the wrong register for a heading a
 * non-technical advocate reads. So English gets its own wording here rather than
 * falling through to the kernel's: these are the questions the report answers,
 * phrased as the composer's intro promises them.
 *
 * A family with no entry renders its cards without a heading rather than with an
 * empty one, so an unknown family ID (an older bundle, a pack this build does
 * not carry) degrades to "no section title" and never to a blank bar.
 */
import type { HostLocale } from '.';

const EN: Readonly<Record<string, string>> = {
  'A. Page declaration': 'What each page says it is',
  'B. Inventory': 'Which languages the site claims to offer',
  'C. Serving': 'What it actually serves',
  'D. Switch': 'Whether the language switcher works',
  'E. Content language': 'What the text itself looks like',
  'F. ua jurisdiction pack': 'Under Ukrainian law',
};

const UK: Readonly<Record<string, string>> = {
  'A. Page declaration': 'Що кожна сторінка про себе каже',
  'B. Inventory': 'Які мови сайт заявляє',
  'C. Serving': 'Що він видає насправді',
  'D. Switch': 'Чи працює перемикач мов',
  'E. Content language': 'Який вигляд має сам текст',
  'F. ua jurisdiction pack': 'За українським законом',
};

export const auditFamilyTitles: Readonly<Record<HostLocale, Readonly<Record<string, string>>>> = {
  en: EN,
  uk: UK,
};
