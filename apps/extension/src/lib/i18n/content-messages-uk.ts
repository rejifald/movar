import type { ContentMessages } from './content-messages-en';

/** Ukrainian content-script curtain strings. Typed against {@link ContentMessages}
 *  (the English canonical shape) so missing keys fail the build. See
 *  content-messages-en.ts for why this subset is split from the full catalogue. */
export const contentMessagesUk: ContentMessages = {
  pickerHidden: {
    chipLabel: (endonym) =>
      endonym === null
        ? 'Movar приховав перемикач мов — натисніть, щоб показати'
        : `Movar — ${endonym}. Натисніть, щоб показати перемикач мов.`,
    show: 'Показати',
  },
  pickerSurvivor: {
    title: 'Деякі варіанти приховано',
    body: (hidden) => `Movar приховав: ${hidden.join(', ')}.`,
    show: 'Показати приховані варіанти',
  },
  contentHidden: {
    title: 'Приховано вміст',
    descriptionForLanguage: (code) =>
      code === 'ru' ? 'Російською мовою' : 'Мова не у вашому списку',
    ariaLabelForLanguage: (code) =>
      code === 'ru' ? 'Movar: приховано російськомовний вміст' : 'Movar: приховано вміст',
    show: 'Показати',
  },
};
