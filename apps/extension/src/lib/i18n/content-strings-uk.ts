import type { ContentStrings } from './content-strings';

/** Ukrainian curtain strings. Typed against {@link ContentStrings} so missing
 *  keys fail the build. Bundled in the worker, not the content script — the
 *  content fetches it only when Ukrainian is the active UI locale. */
export const contentStringsUk: ContentStrings = {
  pickerHidden: {
    chipLabel: 'Movar — {endonym}. Натисніть, щоб показати перемикач мов.',
    chipLabelNoLang: 'Movar приховав перемикач мов — натисніть, щоб показати',
    show: 'Показати',
  },
  pickerSurvivor: {
    title: 'Деякі варіанти приховано',
    body: 'Movar приховав: {languages}.',
    show: 'Показати приховані варіанти',
  },
  contentHidden: {
    title: 'Приховано вміст',
    descriptionRussian: 'Російською мовою',
    description: 'Мова не у вашому списку',
    ariaLabelRussian: 'Movar: приховано російськомовний вміст',
    ariaLabel: 'Movar: приховано вміст',
    show: 'Показати',
  },
};
