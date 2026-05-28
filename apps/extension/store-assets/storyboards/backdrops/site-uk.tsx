import type { ReactNode } from 'react';

import { SiteFrame, type SiteFrameContent } from './site-frame';

/**
 * Fictitious services site — *Tochka24* — in its **Ukrainian** after-state.
 * Backdrop for the right half of the "correction applied" diptych (scene
 * #2). All layout lives in `SiteFrame`; this file owns only the localized
 * copy plus the `children` slot that hosts the production popup.
 *
 * The diptych shows the *same site* in two languages so the before/after
 * read as Movar's correction having flipped a switch.
 */
const UK_CONTENT: SiteFrameContent = {
  lang: 'uk',
  nav: ['Послуги', 'Ціни', 'Зона роботи', 'Допомога'],
  loginLabel: 'Увійти',
  hero: {
    title: 'Освіжіть дім без зайвих клопотів.',
    body: 'Прибирання, дрібний ремонт, доставка — в одному застосунку, з прозорою ціною та фіксованим часом приїзду майстра.',
    cta: 'Замовити майстра →',
  },
  features: [
    {
      title: 'Прозорі ціни',
      body: 'Ціна видно до замовлення. Без сюрпризів у чеку та без «по факту робіт».',
    },
    {
      title: 'Час під контролем',
      body: 'Вікно приїзду — 30 хвилин. Якщо майстер запізнюється, знижка автоматично.',
    },
    {
      title: 'Перевірені майстри',
      body: 'Усі майстри з чинними документами та підтвердженим досвідом.',
    },
  ],
};

export function SiteBackdropUK({ children }: { children?: ReactNode }) {
  return <SiteFrame content={UK_CONTENT}>{children}</SiteFrame>;
}
