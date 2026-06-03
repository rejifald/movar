import type { JSX, ReactNode } from 'react';

import { ShopFrame, type ShopContent } from './shop-frame';

/**
 * "With Movar" half of the online-shop before/after pair. Movar's
 * Accept-Language hint travels with the click, so _Крамко_ serves its
 * Ukrainian edition at the `/ua/` address instead of the Russian
 * default — the whole page is now Ukrainian and the УК pill is active.
 * The highlighted `ua` segment is the visible signal that the request's
 * language preference reached the shop.
 *
 * Same fictitious brand/product as the without half; see that file and
 * `shop-frame.tsx` for the rationale.
 */

/** Ukrainian edition content — reused by the marketplace diptych. */
export const SHOP_WITH_CONTENT: ShopContent = {
  activeLocale: 'uk',
  nav: ['Каталог', 'Доставка й оплата', 'Контакти'],
  breadcrumb: ['Головна', 'Аудіо', 'Навушники'],
  title: 'Бездротові навушники Aura X3',
  rating: '4.8',
  reviews: '1 240 відгуків',
  price: '2 499 грн',
  inStock: 'В наявності',
  features: ['Активне шумозаглушення', 'До 30 годин роботи', 'Швидка зарядка USB-C'],
  addToCart: 'Додати в кошик',
  description:
    'Накладні навушники з активним шумозаглушенням та автономністю до 30 годин. Швидка зарядка, зручне оголівʼя та інтуїтивне керування.',
  delivery: 'Доставка завтра · Оплата частинами · 14 днів на повернення',
};

/** Shared with-Movar URL — the shop's Ukrainian edition; the `ua`
 *  segment is highlighted as the param the language hint produced. */
export function shopWithUrlBar(): ReactNode {
  return (
    <>
      kramko.example/<mark>ua</mark>/audio/aura-x3
    </>
  );
}

export function ShopWithMovarBackdrop(): JSX.Element {
  return <ShopFrame lang="uk" urlBar={shopWithUrlBar()} content={SHOP_WITH_CONTENT} />;
}
