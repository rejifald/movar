/*
 * The guide's routes, grouping and Ukrainian chrome copy.
 *
 * Sibling of ./blog, and single-locale for the same reason (see
 * `src/content.config.ts`). Kept apart from `i18n.ts` because that module's
 * shape is a bilingual parity contract, and this section has no English half
 * to keep in step.
 */

/** Hub page. Ukrainian-only, so the `/uk` prefix is unconditional. */
export const GUIDE_INDEX_HREF = '/uk/guide';

/** Permalink for one guide page, keyed by its content-collection id. */
export function guidePageHref(id: string): string {
  return `${GUIDE_INDEX_HREF}/${id}`;
}

/** The hub's blocks, in render order. `id` matches the collection's `group`. */
export const GUIDE_GROUPS = [
  {
    id: 'device',
    heading: 'Пристрій',
    lead: 'Системна мова й список мов, який читають застосунки та сайти.',
  },
  {
    id: 'browser',
    heading: 'Браузер',
    lead: 'Список мов, який браузер просить у кожного сайту.',
  },
  {
    id: 'account',
    heading: 'Google',
    lead: 'Мова інтерфейсу, мова результатів і кожен продукт окремо.',
  },
  {
    id: 'service',
    heading: 'Сервіси',
    lead: 'Власні списки мов, які не читають ні систему, ні браузер.',
  },
  {
    id: 'sites',
    heading: 'Окремі сайти',
    lead: 'Вибір, збережений на самому сайті, і мова листів.',
  },
] as const;

export type GuideGroupId = (typeof GUIDE_GROUPS)[number]['id'];

/**
 * Format the «оновлено» stamp. Guide pages carry a date because a settings
 * instruction without one cannot be trusted — vendors move these menus.
 */
export function formatUpdated(date: Date): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export const guideStrings = {
  navLabel: 'Інструкція',
  index: {
    pageTitle: 'Як зробити українську мовою за замовчуванням — Movar',
    pageDescription:
      'Покрокові інструкції для системи, браузера, Google і сервісів: де заявити українську і як не дати налаштуванням відкотитися.',
    eyebrow: 'Інструкція',
    title: 'Як зробити українську мовою за замовчуванням',
    lead: 'Прибрати російську недостатньо — звільнене місце дістається англійській. Оберіть, що налаштовуєте, і зробіть це за кілька хвилин.',
  },
  /** The three rules, restated compactly on the hub. Every page below applies
   *  them, so they are stated once here rather than repeated twenty times. */
  rules: {
    heading: 'Три правила',
    lead: 'Усі інструкції нижче — застосування цих трьох правил.',
    items: [
      {
        title: 'Прибрати російську ≠ обрати українську',
        body: 'Мову контенту сервіси зважують з кількох сигналів одразу — мови запиту, інтерфейсу, пристрою та регіону. Профіль, у якому російської просто немає, розвʼязується в англійську. Українську треба поставити першою, а не просто звільнити місце.',
      },
      {
        title: 'Видалити, а не понизити',
        body: 'Сайт бере з вашого списку найвищу мову, яку підтримує. Якщо української та англійської версій у нього немає, російська на останньому місці все одно виграє — вона є в списку, і цього достатньо.',
      },
      {
        title: 'Мова інтерфейсу ≠ мова контенту',
        body: 'Майже скрізь це два різні налаштування. Мова інтерфейсу пошуку Google не змінює мови результатів; мова інтерфейсу X не змінює стрічки. Якщо ви перемкнули інтерфейс, а нічого не змінилося — шукайте друге налаштування.',
      },
    ],
  },
  detect: {
    /** Rendered by the hub's on-device detection. `{platform}` is replaced. */
    heading: 'Схоже, у вас {platform}',
    body: 'Почніть із цих сторінок — решта нижче.',
  },
  checker: {
    heading: 'Що ваш браузер просить просто зараз',
    /** Shown before the script runs, and if it cannot run at all. */
    idle: 'Перевіряємо…',
    unavailable: 'Браузер не повідомляє список мов.',
    good: 'Ваш браузер просить сторінки українською.',
    notFirst: 'Українська є у вашому списку, але не першою — сайти віддадуть те, що вище.',
    hasBlocked:
      'У списку є російська: сайт, який має російську версію й не має української, віддасть саме її.',
    missing: 'Українська не заявлена взагалі — сайти обиратимуть мову за вас.',
    /** Label above the raw list, so the reader sees the evidence. */
    listLabel: 'Ваш список мов',
  },
  page: {
    backToIndex: 'Усі інструкції',
    updated: 'Оновлено',
    /** Cross-links at the foot of every page. */
    nextHeading: 'Далі',
  },
} as const;
