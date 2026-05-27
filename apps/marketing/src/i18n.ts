/**
 * Marketing-site i18n. Two locales: 'en' (default) and 'uk'.
 *
 * Components accept a `lang: Locale` prop and look up their strings in the
 * dictionary below. Pages declare their lang by routing — /index.astro is
 * English, /uk/index.astro is Ukrainian — and pass it down.
 *
 * Adding a third locale: extend the union, add a key to `strings`, update
 * `alternateLocaleHref` to handle the third path prefix.
 */

export type Locale = 'en' | 'uk';

interface NavStrings {
  howItWorks: string;
  download: string;
  privacy: string;
  feedback: string;
}

interface HeroStrings {
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  subhead: string;
  comingSoon: string;
}

interface FeatureCard {
  title: string;
  body: string;
}

interface FeaturesStrings {
  sectionTitle: string;
  sectionLead: string;
  cards: FeatureCard[];
}

interface FooterStrings {
  credits: string;
  privacy: string;
  download: string;
  feedback: string;
}

interface DownloadStrings {
  add: Record<'chrome' | 'edge' | 'firefox', string>;
  soon: string;
}

interface SwitcherStrings {
  /** Label of the OTHER locale (shown in the switcher link). */
  alternateLabel: string;
}

interface MetaStrings {
  /** Value of `<html lang>`. */
  htmlLang: string;
  /** Default <title> + meta description used by BaseLayout. */
  defaultTitle: string;
  defaultDescription: string;
}

interface BeforeAfterStrings {
  sectionTitle: string;
  sectionLead: string;
  without: string;
  withMovar: string;
  withoutCaption: string;
  withCaption: string;
}

export interface Strings {
  meta: MetaStrings;
  nav: NavStrings;
  hero: HeroStrings;
  beforeAfter: BeforeAfterStrings;
  features: FeaturesStrings;
  footer: FooterStrings;
  download: DownloadStrings;
  switcher: SwitcherStrings;
}

const en: Strings = {
  meta: {
    htmlLang: 'en',
    defaultTitle: 'Movar — keep the internet in your language',
    defaultDescription:
      'Keep the internet in your language. Movar nudges Google, Bing, DuckDuckGo, and YouTube to match your language.',
  },
  nav: {
    howItWorks: 'How it works',
    download: 'Download',
    privacy: 'Privacy',
    feedback: 'Feedback',
  },
  hero: {
    badge: 'Free · MIT-licensed · Privacy-first',
    headlineLine1: 'Keep the internet',
    headlineLine2: 'in your language.',
    subhead:
      'Movar nudges Google, Bing, DuckDuckGo, and YouTube to match your language — and quietly auto-switches sites that try to serve you the wrong one. All on-device.',
    comingSoon: 'Coming soon to Chrome, Edge, and Firefox.',
  },
  beforeAfter: {
    sectionTitle: 'See it in action',
    sectionLead: 'Same Cyrillic query on google.com.ua, two outcomes.',
    without: 'Without Movar',
    withMovar: 'With Movar',
    withoutCaption: 'Top results lean Russian.',
    withCaption: 'Ukrainian results pinned via hl=uk + lr=lang_uk.',
  },
  features: {
    sectionTitle: 'How Movar works',
    sectionLead: 'All running silently in the background once you pick a preferred language.',
    cards: [
      {
        title: 'Fixes search results',
        body: 'Google, Bing, DuckDuckGo, and YouTube get a language hint on every search, so results come back in your preferred language — no more Ukrainian queries defaulting to Russian.',
      },
      {
        title: 'Detects misrouted sites',
        body: "When a Ukrainian-language site routes you to Russian on a new page, Movar notices and auto-switches you back through the site's own language picker.",
      },
      {
        title: 'Stays out of the way',
        body: 'Movar only rewrites outgoing URLs and request headers — it never inspects request bodies, never injects ads, and never talks to a remote server.',
      },
      {
        title: 'Nothing leaves your device',
        body: 'No account, no telemetry, no analytics. Your preferences live in browser storage. Language detection runs entirely locally.',
      },
    ],
  },
  footer: {
    credits: 'Movar contributors · MIT',
    privacy: 'Privacy',
    download: 'Download',
    feedback: 'Feedback',
  },
  download: {
    add: {
      chrome: 'Add to Chrome',
      edge: 'Add to Edge',
      firefox: 'Add to Firefox',
    },
    soon: 'Soon',
  },
  switcher: {
    alternateLabel: 'Українська',
  },
};

const uk: Strings = {
  meta: {
    htmlLang: 'uk',
    defaultTitle: 'Movar — тримайте інтернет вашою мовою',
    defaultDescription:
      'Тримайте інтернет вашою мовою. Movar коригує Google, Bing, DuckDuckGo та YouTube, щоб результати показувались вибраною мовою.',
  },
  nav: {
    howItWorks: 'Як працює',
    download: 'Завантажити',
    privacy: 'Приватність',
    feedback: 'Зворотний звʼязок',
  },
  hero: {
    badge: 'Безкоштовно · Ліцензія MIT · Приватність насамперед',
    headlineLine1: 'Тримайте інтернет',
    headlineLine2: 'вашою мовою.',
    subhead:
      'Movar коригує Google, Bing, DuckDuckGo та YouTube, щоб результати поверталися вашою мовою — і тихо перемикає сайти, які підсовують не ту. Усе локально, без серверів.',
    comingSoon: 'Незабаром у Chrome, Edge та Firefox.',
  },
  beforeAfter: {
    sectionTitle: 'Подивіться, як це працює',
    sectionLead: 'Той самий кириличний запит на google.com.ua, два результати.',
    without: 'Без Movar',
    withMovar: 'З Movar',
    withoutCaption: 'Перші результати — російською.',
    withCaption: 'Українські результати закріплені через hl=uk + lr=lang_uk.',
  },
  features: {
    sectionTitle: 'Як працює Movar',
    sectionLead: 'Усе виконується непомітно у фоні після того, як ви оберете бажану мову.',
    cards: [
      {
        title: 'Виправляє результати пошуку',
        body: 'Google, Bing, DuckDuckGo та YouTube отримують підказку про мову на кожен запит, тож результати повертаються вашою мовою — українські запити більше не показують російські сторінки за замовчуванням.',
      },
      {
        title: 'Помічає неправильні перенаправлення',
        body: 'Коли україномовний сайт переводить вас на російську версію на іншій сторінці, Movar це помічає й автоматично перемикає назад через рідний перемикач мов сайту.',
      },
      {
        title: 'Не плутається під ногами',
        body: 'Movar лише переписує вихідні URL та заголовки запитів — не аналізує тіла запитів, не вставляє реклами та не звертається до віддалених серверів.',
      },
      {
        title: 'Нічого не покидає ваш пристрій',
        body: 'Без облікового запису, без телеметрії, без аналітики. Ваші налаштування зберігаються у браузері. Визначення мови виконується повністю локально.',
      },
    ],
  },
  footer: {
    credits: 'Учасники Movar · MIT',
    privacy: 'Приватність',
    download: 'Завантажити',
    feedback: 'Зворотний звʼязок',
  },
  download: {
    add: {
      chrome: 'Встановити для Chrome',
      edge: 'Встановити для Edge',
      firefox: 'Встановити для Firefox',
    },
    soon: 'Скоро',
  },
  switcher: {
    alternateLabel: 'English',
  },
};

export const strings: Record<Locale, Strings> = { en, uk };

function enToUk(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, '');
  if (trimmed === '') return '/uk/';
  return `/uk${trimmed}`;
}

function ukToEn(pathname: string): string {
  const stripped = pathname.replace(/^\/uk/, '');
  if (stripped === '' || stripped === '/') return '/';
  return stripped;
}

/**
 * Compute the path to the same page in the other locale. Used by the
 * language switcher in the header.
 *
 *   /                    →  /uk/
 *   /privacy             →  /uk/privacy
 *   /uk/                 →  /
 *   /uk/privacy          →  /privacy
 */
export function alternateLocaleHref(pathname: string, current: Locale): string {
  return current === 'en' ? enToUk(pathname) : ukToEn(pathname);
}

/** Path to the home page of a given locale. */
export function localeHomeHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/' : '/';
}

/** Path to the privacy page of a given locale. */
export function localePrivacyHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/privacy' : '/privacy';
}
