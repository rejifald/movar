import type { ContentStrings } from './content-strings';

/** Ukrainian curtain strings. Typed against {@link ContentStrings} so missing
 *  keys fail the build. Bundled in the worker, not the content script — the
 *  content fetches it only when Ukrainian is the active UI locale. */
export const contentStringsUk: ContentStrings = {
  pickerHidden: {
    chipLabel: 'Мовар — {endonym}. Натисніть, щоб показати перемикач мов.',
    chipLabelNoLang: 'Мовар приховав перемикач мов — натисніть, щоб показати',
    show: 'Показати',
  },
  pickerSurvivor: {
    title: 'Деякі варіанти приховано',
    body: 'Мовар приховав: {languages}.',
    show: 'Показати приховані варіанти',
  },
  contentHidden: {
    title: 'Приховано вміст',
    descriptionRussian: 'Російською мовою',
    description: 'Мова не у вашому списку',
    ariaLabelRussian: 'Мовар: приховано російськомовний вміст',
    ariaLabel: 'Мовар: приховано вміст',
    show: 'Показати',
    hideAll: 'Приховати всі',
  },
  liveRegion: {
    concealed: 'Мовар приховав заблокований вміст на цій сторінці',
    revealed: 'Мовар відновив усе на цій сторінці',
  },
};
