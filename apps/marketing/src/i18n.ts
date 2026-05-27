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
  examples: string;
  limitations: string;
  download: string;
  privacy: string;
  feedback: string;
}

interface HeroStrings {
  badge: string;
  headlineLine1: string;
  headlineLine2: string;
  subhead: string;
}

interface HowItWorksStep {
  title: string;
  body: string;
}

interface HowItWorksStrings {
  sectionTitle: string;
  sectionLead: string;
  steps: HowItWorksStep[]; // exactly 2
}

interface LimitationsRow {
  does: string;
  doesNot: string;
}

interface LimitationsStrings {
  sectionTitle: string;
  sectionLead: string;
  doesHeading: string; // "What Movar does" / "Що Movar робить"
  doesNotHeading: string; // "What it can't do" / "Що Movar не робить"
  rows: LimitationsRow[]; // 4 rows
}

interface CloseStrings {
  sectionTitle: string;
  sectionLead: string;
  emailLabel: string;
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

interface ExampleEntry {
  site: string;
  scenario: string;
  without: string;
  withMovar: string;
}

interface ExamplesStrings {
  sectionTitle: string;
  sectionLead: string;
  without: string;
  withMovar: string;
  entries: ExampleEntry[];
}

export interface Strings {
  meta: MetaStrings;
  nav: NavStrings;
  hero: HeroStrings;
  howItWorks: HowItWorksStrings;
  examples: ExamplesStrings;
  beforeAfter: BeforeAfterStrings;
  limitations: LimitationsStrings;
  close: CloseStrings;
  footer: FooterStrings;
  download: DownloadStrings;
  switcher: SwitcherStrings;
}

const en: Strings = {
  meta: {
    htmlLang: 'en',
    defaultTitle: 'Movar — keep the internet in your language',
    defaultDescription:
      'Movar puts the right language in front of you on Google, YouTube, and bilingual sites — without translating a thing. Free, open source, stays on your device.',
  },
  nav: {
    howItWorks: 'How it works',
    examples: 'Examples',
    limitations: 'Limits',
    download: 'Download',
    privacy: 'Privacy',
    feedback: 'Get in touch',
  },
  hero: {
    badge: 'Free · Open source · No tracking',
    headlineLine1: 'Keep the internet',
    headlineLine2: 'in your language.',
    subhead:
      'Movar puts the right language in front of you on Google, YouTube, and bilingual sites — without translating a thing.',
  },
  howItWorks: {
    sectionTitle: 'How it works',
    sectionLead: 'Two steps. After the first one, you can forget Movar is there.',
    steps: [
      {
        title: 'Pick your language',
        body: 'Once, the first time you click Movar\'s icon. Movar remembers it for next time and syncs the choice between your devices.',
      },
      {
        title: 'Browse like normal',
        body: 'Movar quietly nudges every search toward your language — and switches bilingual sites to your version when you open them.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Three concrete cases',
    sectionLead:
      'The same idea applies to every country version of Google and to a list of bilingual sites we keep adding to.',
    without: 'Without Movar',
    withMovar: 'With Movar',
    entries: [
      {
        site: 'google.com.ua',
        scenario: 'You type a Cyrillic search like "політика" or "новини".',
        without:
          "The top results are in Russian. Google sees Cyrillic and falls back to whatever language has more pages on the open web — and that's Russian.",
        withMovar:
          'Movar adds a Ukrainian-language hint to your search before it leaves your browser. Ukrainian articles come back to the top.',
      },
      {
        site: 'youtube.com',
        scenario: 'You search YouTube in Ukrainian, e.g. "новини" or "інтерв\'ю".',
        without:
          "Both search and recommendations lean Russian. The interface matches your browser language, but what YouTube *recommends* doesn't.",
        withMovar:
          'Movar tells YouTube your language and country — so the same Cyrillic search returns Ukrainian creators and Ukrainian recommendations.',
      },
      {
        site: 'electrica-shop.com.ua',
        scenario: 'You find a product through a Ukrainian Google search and click through.',
        without:
          'The shop opens in Russian by default — even though it has a full Ukrainian version at a different address.',
        withMovar:
          'Movar asks the shop to show its Ukrainian version, and you read in Ukrainian for the rest of your visit.',
      },
    ],
  },
  beforeAfter: {
    sectionTitle: 'See it in action',
    sectionLead: 'Same Cyrillic query on google.com.ua, two outcomes.',
    without: 'Without Movar',
    withMovar: 'With Movar',
    withoutCaption: 'Top results in Russian.',
    withCaption: 'Ukrainian results pinned to the top.',
  },
  limitations: {
    sectionTitle: "What Movar can and can't do",
    sectionLead: "What Movar does for you — and what it leaves alone.",
    doesHeading: 'What Movar does',
    doesNotHeading: "What it can't do",
    rows: [
      {
        does: 'Pushes your language to the top of Google, Bing, DuckDuckGo, and YouTube results.',
        doesNot: 'Translate anything — pages stay in whatever language they were written in.',
      },
      {
        does: 'Switches a list of bilingual sites (Ukrainian shops, news sites) to your language.',
        doesNot:
          'Affect the videos themselves — only what YouTube recommends next to and after them.',
      },
      {
        does: 'Works the moment a page loads — nothing to click, no waiting.',
        doesNot: 'Cover every site on the web — only the ones Movar already knows about.',
      },
      {
        does: "Lets you exempt any site in one click if you'd rather it stay untouched.",
        doesNot:
          "Auto-enable in private/incognito windows — that's a browser-level setting you flip on once in your extension settings.",
      },
    ],
  },
  close: {
    sectionTitle: 'Stay in touch',
    sectionLead:
      "Movar isn't live in browser stores yet. If you have a question, an idea, or just want to hear from us at launch, drop a note.",
    emailLabel: 'Email feedback@movar.fyi',
  },
  footer: {
    credits: 'Movar community · MIT license',
    privacy: 'Privacy',
    download: 'Download',
    feedback: 'Get in touch',
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
      'Movar показує вам ту мову, яку ви читаєте — у пошуку Google, на YouTube, на двомовних сайтах. Без перекладу. Безкоштовно, відкритий код, працює лише на вашому пристрої.',
  },
  nav: {
    howItWorks: 'Як це працює',
    examples: 'Приклади',
    limitations: 'Межі',
    download: 'Завантажити',
    privacy: 'Приватність',
    feedback: 'Написати нам',
  },
  hero: {
    badge: 'Безкоштовно · Відкритий код · Без стеження',
    headlineLine1: 'Хай інтернет буде',
    headlineLine2: 'вашою мовою.',
    subhead:
      'Movar показує вам ту мову, яку ви читаєте — у пошуку Google, на YouTube, на двомовних сайтах. Без перекладу.',
  },
  howItWorks: {
    sectionTitle: 'Як це працює',
    sectionLead: 'Два кроки. Після першого Movar можна забути — він просто працює.',
    steps: [
      {
        title: 'Виберіть мову',
        body: 'Один раз — коли вперше клацнете на іконці Movar. Він запамʼятає вибір і синхронізує його між вашими пристроями.',
      },
      {
        title: 'Користуйтесь інтернетом як завжди',
        body: 'Movar тихо підказує пошуковим системам вашу мову, а двомовні сайти перемикає на ваш варіант, щойно ви їх відкриваєте.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Три конкретні приклади',
    sectionLead:
      'Той самий підхід працює для кожної країнної версії Google і для списку двомовних сайтів, який поступово зростає.',
    without: 'Без Movar',
    withMovar: 'З Movar',
    entries: [
      {
        site: 'google.com.ua',
        scenario: 'Ви шукаєте щось кирилицею, наприклад «політика» або «новини».',
        without:
          'Перші результати — російською. Google бачить кирилицю — і за замовчуванням показує те, чого в інтернеті більше: російські сторінки.',
        withMovar:
          'Movar додає підказку про українську мову до пошукового запиту, перш ніж він піде з вашого браузера. Українські статті повертаються нагору.',
      },
      {
        site: 'youtube.com',
        scenario: 'Ви шукаєте на YouTube українською, наприклад «новини» чи «інтервʼю».',
        without:
          'І пошук, і рекомендації йдуть переважно російською. Мова сайту збігається з вашим браузером, а от що YouTube вам радить — ні.',
        withMovar:
          'Movar каже YouTube, якою мовою ви читаєте і з якої ви країни — і той самий кириличний пошук показує українських авторів та українські рекомендації.',
      },
      {
        site: 'electrica-shop.com.ua',
        scenario: 'Ви знайшли товар через український Google і відкрили його.',
        without:
          'Магазин за замовчуванням відкриває російську версію — хоча українська теж є, просто за іншою адресою.',
        withMovar:
          'Movar просить магазин показати українську версію — і ви читаєте українською до кінця візиту.',
      },
    ],
  },
  beforeAfter: {
    sectionTitle: 'Подивіться, як це працює',
    sectionLead: 'Той самий кириличний запит на google.com.ua, два результати.',
    without: 'Без Movar',
    withMovar: 'З Movar',
    withoutCaption: 'Перші результати — російською.',
    withCaption: 'Українські результати закріплені нагорі.',
  },
  limitations: {
    sectionTitle: 'Що Movar може, а чого ні',
    sectionLead: 'Що Movar робить — і чого не робить.',
    doesHeading: 'Що Movar робить',
    doesNotHeading: 'Чого Movar не робить',
    rows: [
      {
        does: 'Піднімає вашу мову на перші місця у пошуку Google, Bing, DuckDuckGo та YouTube.',
        doesNot: 'Не перекладає — сторінки залишаються тією мовою, якою їх написано.',
      },
      {
        does: 'Перемикає двомовні сайти (українські магазини, новини) на вашу мову.',
        doesNot: 'Не впливає на самі відео — лише на те, що YouTube радить дивитися далі.',
      },
      {
        does: 'Працює щойно сторінка відкривається — нічого тицяти, нічого чекати.',
        doesNot: 'Не охоплює весь інтернет — лише сайти, які Movar уже знає.',
      },
      {
        does: 'Дає виключити будь-який сайт в один клік, якщо ви хочете залишити його як є.',
        doesNot:
          'Не вмикається автоматично у приватних/інкогніто вікнах — це налаштування браузера, яке вмикається одним кліком у налаштуваннях розширень.',
      },
    ],
  },
  close: {
    sectionTitle: 'Залишайтеся на звʼязку',
    sectionLead:
      'Movar ще не зʼявився у магазинах розширень. Якщо маєте запитання, ідею чи хочете почути про запуск — напишіть нам.',
    emailLabel: 'Написати на feedback@movar.fyi',
  },
  footer: {
    credits: 'Спільнота Movar · ліцензія MIT',
    privacy: 'Приватність',
    download: 'Завантажити',
    feedback: 'Написати нам',
  },
  download: {
    add: {
      chrome: 'Додати в Chrome',
      edge: 'Додати в Edge',
      firefox: 'Додати в Firefox',
    },
    soon: 'Незабаром',
  },
  switcher: {
    alternateLabel: 'English',
  },
};

export const strings: Record<Locale, Strings> = { en, uk };

function enToUk(pathname: string, search: string, hash: string): string {
  const trimmed = pathname.replace(/\/$/, '');
  const base = trimmed === '' ? '/uk/' : `/uk${trimmed}`;
  return base + search + hash;
}

function ukToEn(pathname: string, search: string, hash: string): string {
  const stripped = pathname.replace(/^\/uk/, '');
  const base = stripped === '' || stripped === '/' ? '/' : stripped;
  return base + search + hash;
}

/**
 * Compute the URL to the same page in the other locale. Used by the
 * language switcher in the header.
 *
 * The first argument is a URL-like object `{ pathname, search, hash }` so
 * query strings and hash fragments are preserved across the locale switch.
 *
 *   { pathname: '/',           search: '', hash: '' }  →  /uk/
 *   { pathname: '/privacy',    search: '', hash: '' }  →  /uk/privacy
 *   { pathname: '/uk/',        search: '', hash: '' }  →  /
 *   { pathname: '/uk/privacy', search: '', hash: '' }  →  /privacy
 *   { pathname: '/uk/', search: '?utm_source=x', hash: '#examples' }
 *                                                   →  /?utm_source=x#examples
 */
export function alternateLocaleHref(
  url: { pathname: string; search: string; hash: string },
  current: Locale,
): string {
  return current === 'en'
    ? enToUk(url.pathname, url.search, url.hash)
    : ukToEn(url.pathname, url.search, url.hash);
}

/** Path to the home page of a given locale. */
export function localeHomeHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/' : '/';
}

/** Path to the privacy page of a given locale. */
export function localePrivacyHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/privacy' : '/privacy';
}
