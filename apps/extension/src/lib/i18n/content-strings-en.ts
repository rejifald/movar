import type { ContentStrings } from './content-strings';

/** English curtain strings — the canonical shape, and the one locale bundled in
 *  the content script (the default, and the fallback shown when the worker can't
 *  be reached). Every other locale lives in the worker and is fetched on demand. */
export const contentStringsEn: ContentStrings = {
  pickerHidden: {
    chipLabel: 'Movar — {endonym}. Click to show the language picker.',
    chipLabelNoLang: 'Movar hid this language picker — click to show',
    show: 'Show',
  },
  pickerSurvivor: {
    title: 'Some options hidden',
    body: 'Movar hid: {languages}.',
    show: 'Show hidden options',
  },
  contentHidden: {
    title: 'Content hidden',
    descriptionRussian: 'In Russian',
    description: 'Language not in your list',
    ariaLabelRussian: 'Movar: Russian content hidden',
    ariaLabel: 'Movar: content hidden',
    show: 'Show',
  },
};
