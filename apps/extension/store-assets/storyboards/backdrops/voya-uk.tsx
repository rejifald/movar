import type { JSX } from 'react';

import { VoyaBackdrop, type VoyaSiteContent } from './voya-frame';

/**
 * Ukrainian variant of the *Voya* travel-site backdrop — used as the
 * with-Movar half of the language-dialog diptych (scene #4). No
 * dialog: with Accept-Language set, the site serves the Ukrainian
 * variant directly without prompting.
 */
const UK_CONTENT: VoyaSiteContent = {
  lang: 'uk',
  nav: ['Авіаквитки', 'Готелі', 'Оренда авто', 'Тури'],
  loginLabel: 'Увійти',
  hero: {
    title: 'Знайдіть наступну подорож',
    subtitle: 'Авіаквитки, готелі та оренда авто на одній сторінці — без прихованих зборів.',
    fields: { from: 'Звідки — куди', checkIn: 'Заїзд', checkOut: 'Виїзд' },
    cta: 'Знайти',
  },
  deals: [
    {
      city: 'Прага',
      tagline: 'Прямий рейс, вихідні удвох',
      price: 'від 5 800 ₴',
    },
    {
      city: 'Барселона',
      tagline: 'Пляж і архітектура Гауді',
      price: 'від 8 900 ₴',
    },
    {
      city: 'Тбілісі',
      tagline: 'Гастрономічні вихідні',
      price: 'від 4 600 ₴',
    },
  ],
};

export function VoyaBackdropUK(): JSX.Element {
  return <VoyaBackdrop content={UK_CONTENT} />;
}
