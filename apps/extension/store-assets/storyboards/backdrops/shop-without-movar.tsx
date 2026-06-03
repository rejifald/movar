import type { JSX, ReactNode } from 'react';

import { ShopFrame, type ShopContent } from './shop-frame';

/**
 * "Without Movar" half of the online-shop before/after pair. The user
 * clicked through from a Ukrainian Google result, but _Крамко_ defaults
 * to its Russian edition because nothing in the request asked for
 * Ukrainian — so the whole product page comes back in Russian and the
 * РУ pill is active.
 *
 * Fictitious brand on the `.example` TLD; the product model ("Aura X3")
 * is invented. See `shop-frame.tsx` for the scene rationale.
 */

/** Russian edition content — reused by the marketplace diptych. */
export const SHOP_WITHOUT_CONTENT: ShopContent = {
  activeLocale: 'ru',
  nav: ['Каталог', 'Доставка и оплата', 'Контакты'],
  breadcrumb: ['Главная', 'Аудио', 'Наушники'],
  title: 'Беспроводные наушники Aura X3',
  rating: '4.8',
  reviews: '1 240 отзывов',
  price: '2 499 грн',
  inStock: 'В наличии',
  features: ['Активное шумоподавление', 'До 30 часов работы', 'Быстрая зарядка USB-C'],
  addToCart: 'Добавить в корзину',
  description:
    'Накладные наушники с активным шумоподавлением и автономностью до 30 часов. Быстрая зарядка, удобное оголовье и понятное управление.',
  delivery: 'Доставка завтра · Оплата частями · 14 дней на возврат',
};

/** Shared without-Movar URL — the shop's Russian edition path. */
export function shopWithoutUrlBar(): ReactNode {
  return <>kramko.example/ru/audio/aura-x3</>;
}

export function ShopWithoutMovarBackdrop(): JSX.Element {
  return <ShopFrame lang="ru" urlBar={shopWithoutUrlBar()} content={SHOP_WITHOUT_CONTENT} />;
}
