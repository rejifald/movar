import { SiteFrame, type SiteFrameContent } from './site-frame';

/**
 * Fictitious services site — *Tochka24* — in its always-bad **Russian**
 * default state. Backdrop for the left half of the "correction applied"
 * diptych (scene #2). All layout lives in `SiteFrame`; this file owns
 * only the localized copy that the diptych contrasts against `site-uk`.
 *
 * No popup overlay — the RU state never hosts the Movar popup; that's
 * the whole point of the before/after pairing. The UA twin
 * (`site-uk.tsx`) is the one that passes the popup as `children`.
 */
const RU_CONTENT: SiteFrameContent = {
  lang: 'ru',
  nav: ['Услуги', 'Цены', 'Зона работы', 'Помощь'],
  loginLabel: 'Войти',
  hero: {
    title: 'Освежите дом без лишних хлопот.',
    body: 'Уборка, мелкий ремонт, доставка — в одном приложении, с прозрачной ценой и фиксированным временем приезда мастера.',
    cta: 'Заказать мастера →',
  },
  features: [
    {
      title: 'Прозрачные цены',
      body: 'Цена видна до заказа. Без сюрпризов в чеке и без «по факту работ».',
    },
    {
      title: 'Время под контролем',
      body: 'Окно приезда — 30 минут. Если мастер задерживается, скидка автоматически.',
    },
    {
      title: 'Проверенные мастера',
      body: 'Все мастера с действующими документами и подтверждённым опытом.',
    },
  ],
};

export function SiteBackdropRU() {
  return <SiteFrame content={RU_CONTENT} />;
}
