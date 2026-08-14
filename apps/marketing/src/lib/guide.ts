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
  /**
   * What the guide is — and, more importantly, what it is not.
   *
   * «Мовна гігієна» names the idea the guide is built on: language settings
   * are upkeep, not one-time setup, because they silently roll back. But the
   * phrase is already used in Ukrainian for watching your own speech —
   * surzhyk, calques, «правильні» слова — so leaving it undefined invites a
   * reading the guide does not intend. Hence this block, and hence the three
   * explicit negations: they close off the misreadings rather than hoping
   * nobody arrives at them.
   */
  about: {
    heading: 'Що таке мовна гігієна',
    body: '«Гігієна» тут у тому ж значенні, що в «цифровій гігієні»: кілька простих речей, які варто робити регулярно, щоб середовище лишалося таким, як ви його налаштували. Мовна гігієна — це доглядати за тим, як ви заявляєте свою мову, і не давати налаштуванням тихо відкотитися: додана клавіатура повертає мову до списку, а Google дописує до профілю ту мову, якою ви щось прочитали.',
    notHeading: 'Чим це не є',
    not: [
      {
        title: 'Це не про те, як ви говорите й пишете',
        body: 'Тут не буде ні суржику, ні кальок, ні «правильних» слів. Ідеться не про ваше мовлення, а про ваше середовище: мову, якою з вами розмовляють інтерфейси, пошук і стрічки.',
      },
      {
        title: 'Це не про оцінку мов чи текстів',
        body: 'Критерій один — мова, якою ви попросили з вами говорити. Російська згадується тут часто, бо саме вона найчастіше приїжджає замість української за замовчуванням, і сховати це означало б не пояснити механізм.',
      },
      {
        title: 'Це не «прибрати російську»',
        body: 'Прибрати недостатньо: звільнене місце дістається англійській, а не українській. Саме тому кожен крок в інструкціях сформульовано як «поставте українську першою».',
      },
    ],
  },
  /**
   * The honest boundary. Everything above is the reader's half of the deal;
   * this is where the other half starts, and where the extension has a
   * legitimate reason to appear rather than an advertising one.
   */
  limits: {
    heading: 'Чого не полагодити налаштуваннями',
    body: 'Заголовок, який надсилає браузер, — це прохання, і сервер має право його проігнорувати. Сайт може віддати російський текст, підписавши його як українську; посилання в меню може повернути вас на російську версію. Рекомендаційні стрічки мають ще один шар: налаштування прибирає заявлений сигнал, але не вгаданий — X прямо каже, що перелік «мов, які ви можете знати» він склав із вашої активності. Тому стрічки вирівнюються тижнями й від того, що ви дивитесь, а не тільки від того, що ви обрали.',
  },
  /**
   * The closing checklist. Ticks live in `localStorage` — on the device, like
   * everything else on this page — so a reader can work through twenty
   * settings across several sittings without losing their place.
   */
  checklist: {
    heading: 'Чекліст',
    lead: 'Скрізь, де є список мов, цільовий стан один: українська перша, англійська друга, російської в списку немає.',
    /** `{done}` and `{total}` are substituted by the component. */
    progress: '{done} з {total}',
    reset: 'Очистити',
    groups: [
      {
        heading: 'Пристрій',
        items: [
          { id: 'os-lang', label: 'Мова інтерфейсу системи — українська' },
          { id: 'os-list', label: 'Список мов упорядковано, російської в ньому немає' },
          { id: 'os-region', label: 'Регіон — Україна' },
          { id: 'os-keys', label: 'Розкладки: лишилися українська та англійська' },
          { id: 'os-recheck', label: 'Після зміни клавіатур список мов перевірено ще раз' },
        ],
      },
      {
        heading: 'Браузер',
        items: [
          { id: 'br-pages', label: 'Мова сторінок — українська перша' },
          { id: 'br-ui', label: 'Мова інтерфейсу браузера — українська' },
          { id: 'br-check', label: 'Перевірено, що браузер справді надсилає `uk`' },
        ],
      },
      {
        heading: 'Google',
        items: [
          { id: 'g-account', label: 'Мова облікового запису — українська' },
          { id: 'g-auto', label: 'Автододавання мов вимкнено' },
          { id: 'g-display', label: 'Мова інтерфейсу пошуку — українська' },
          { id: 'g-results', label: 'Фільтр мови результатів — українська' },
          { id: 'g-region', label: 'Регіон пошуку — Україна' },
          { id: 'g-products', label: 'Gmail, YouTube, Maps і News перевірено окремо' },
        ],
      },
      {
        heading: 'Сервіси й сайти',
        items: [
          { id: 's-steam', label: 'Steam: клієнт і магазин — два різні налаштування' },
          { id: 's-fb', label: 'Facebook: перевірено на кожному пристрої' },
          { id: 's-x', label: 'X: перелік «мов, які ви можете знати» почищено' },
          { id: 's-netflix', label: 'Netflix: на кожному профілі' },
          { id: 's-mail', label: 'Мова листів і сповіщень — окремо від мови інтерфейсу' },
          { id: 'site-pick', label: 'На щоденних сайтах мову обрано на самому сайті' },
        ],
      },
    ],
  },
} as const;
