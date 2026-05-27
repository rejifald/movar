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

interface HowItWorksStep {
  title: string;
  body: string;
}

interface HowItWorksStrings {
  sectionTitle: string;
  sectionLead: string;
  steps: HowItWorksStep[]; // exactly 3
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

interface ExampleEntry {
  site: string;
  scenario: string;
  without: string;
  withMovar: string;
  // NOTE: `technique` field removed — the badge it powered is being dropped from the UI.
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
      'Movar tells Google, Bing, DuckDuckGo, and YouTube what language you read in — so search results, videos, and bilingual sites match. Free, open source, stays on your device.',
  },
  nav: {
    howItWorks: 'How it works',
    download: 'Download',
    privacy: 'Privacy',
    feedback: 'Feedback',
  },
  hero: {
    badge: 'Free · Open source · No tracking',
    headlineLine1: 'Keep the internet',
    headlineLine2: 'in your language.',
    subhead:
      'Movar tells Google, Bing, DuckDuckGo, and YouTube what language you read in — and switches bilingual sites to the version you actually want. Everything stays on your device.',
    comingSoon: 'Coming soon to Chrome, Edge, and Firefox.',
  },
  howItWorks: {
    sectionTitle: 'How it works',
    sectionLead: 'Three steps. After the first one, you can forget Movar is there.',
    steps: [
      {
        title: 'Pick your language',
        body: 'Once, in the popup. Movar remembers your choice across browser restarts and syncs it between your own devices.',
      },
      {
        title: 'Browse like normal',
        body: 'Movar quietly adds a language hint to your searches on Google, Bing, DuckDuckGo, and YouTube — and switches bilingual sites to your version when you open them.',
      },
      {
        title: 'Override per site',
        body: 'If you want a particular site left alone, toggle Movar off for it in one click. Everything else keeps working.',
      },
    ],
  },
  examples: {
    sectionTitle: 'How it looks in practice',
    sectionLead:
      'Three sites where Movar changes what you see. The same idea applies to every country version of Google, to Bing and DuckDuckGo, and to a list of bilingual sites we keep adding to.',
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
    sectionLead:
      'Honest scope. Movar is sharp at one thing and intentionally hands-off about the rest.',
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
          'Run in private/incognito windows unless you tick "Allow in private windows" in your browser.',
      },
    ],
  },
  features: {
    sectionTitle: 'What changes for you',
    sectionLead:
      "Once you've picked a language, three things start happening — quietly, on every site Movar covers.",
    cards: [
      {
        title: 'Search matches your language',
        body: 'Google, Bing, DuckDuckGo, and YouTube get a clear language hint with every search — so Ukrainian queries stop defaulting to Russian results.',
      },
      {
        title: 'Bilingual sites land on the right version',
        body: "When a Ukrainian-language site routes you to its Russian page, Movar quietly takes you back via the site's own language picker — the same one you'd click manually.",
      },
      {
        title: 'Stays on your device',
        body: 'No account, no telemetry, no remote server. Your preferences live in your browser. Everything Movar does happens right where you are.',
      },
    ],
  },
  footer: {
    credits: 'Movar community · MIT license',
    privacy: 'Privacy',
    download: 'Download',
    feedback: 'Contact',
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
      'Movar підказує пошуковим системам Google, Bing, DuckDuckGo та YouTube вашу мову — щоб результати, відео та двомовні сайти відповідали тому, як ви читаєте. Безкоштовно, відкритий код, працює лише на вашому пристрої.',
  },
  nav: {
    howItWorks: 'Як це працює',
    download: 'Завантажити',
    privacy: 'Приватність',
    feedback: 'Написати нам',
  },
  hero: {
    badge: 'Безкоштовно · Відкритий код · Без стеження',
    headlineLine1: 'Хай інтернет буде',
    headlineLine2: 'вашою мовою.',
    subhead:
      'Movar підказує Google, Bing, DuckDuckGo та YouTube вашу мову, а двомовні сайти переводить на ту мову, якою ви читаєте. Усе працює лише у вашому браузері.',
    comingSoon: 'Незабаром для Chrome, Edge та Firefox.',
  },
  howItWorks: {
    sectionTitle: 'Як це працює',
    sectionLead: 'Три кроки. Після першого Movar можна забути — він просто працює.',
    steps: [
      {
        title: 'Виберіть мову',
        body: 'Один раз — у спливному вікні. Movar запамʼятає ваш вибір між перезапусками браузера і синхронізує його між вашими пристроями.',
      },
      {
        title: 'Користуйтесь інтернетом як завжди',
        body: 'Movar тихо підказує пошуковим системам Google, Bing, DuckDuckGo та YouTube вашу мову — а двомовні сайти перемикає на ваш варіант, щойно ви їх відкриваєте.',
      },
      {
        title: 'Винятки — за бажанням',
        body: 'Якщо якийсь сайт треба залишити у спокої, вимкніть Movar для нього в один клік. Решта продовжує працювати як раніше.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Як це виглядає на практиці',
    sectionLead:
      'Три сайти, де Movar змінює те, що ви бачите. Той самий підхід працює для кожної країнної версії Google, для Bing та DuckDuckGo, і для списку двомовних сайтів, який поступово зростає.',
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
    sectionLead: 'Чесний обсяг. Movar добре робить одне і свідомо не лізе в інше.',
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
          'Не вмикається у приватних/інкогніто вікнах, поки ви самі не дозволите це у браузері.',
      },
    ],
  },
  features: {
    sectionTitle: 'Що зміниться для вас',
    sectionLead:
      'Щойно ви вкажете мову, три речі починають відбуватися — тихо, на кожному сайті, який Movar охоплює.',
    cards: [
      {
        title: 'Пошук відповідає вашій мові',
        body: 'Google, Bing, DuckDuckGo та YouTube отримують чітку підказку про мову з кожним запитом — і кириличний пошук перестає за замовчуванням повертати російські сторінки.',
      },
      {
        title: 'Двомовні сайти потрапляють у правильну версію',
        body: 'Коли україномовний сайт переводить вас на російську сторінку, Movar тихо повертає українську — користуючись тим самим перемикачем, що й сам сайт.',
      },
      {
        title: 'Усе залишається на вашому пристрої',
        body: 'Без облікового запису, без стеження, без статистики. Налаштування живуть у вашому браузері. Усе, що робить Movar, відбувається тут же, на вашому пристрої.',
      },
    ],
  },
  footer: {
    credits: 'Спільнота Movar · ліцензія MIT',
    privacy: 'Приватність',
    download: 'Завантажити',
    feedback: 'Написати',
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
 * BREAKING CHANGE from the original signature: the first argument is now a
 * URL-like object `{ pathname, search, hash }` instead of a bare `pathname`
 * string. This preserves query strings and hash fragments when switching
 * locale. Callers previously passing `Astro.url.pathname` must now pass
 * `Astro.url` (or an equivalent object). The caller in Header.astro will be
 * updated by the next wave.
 *
 *   { pathname: '/',           search: '', hash: '' }  →  /uk/
 *   { pathname: '/privacy',    search: '', hash: '' }  →  /uk/privacy
 *   { pathname: '/uk/',        search: '', hash: '' }  →  /
 *   { pathname: '/uk/privacy', search: '', hash: '' }  →  /privacy
 *   { pathname: '/uk/',        search: '?utm_source=x', hash: '#examples' }
 *                                                       →  /#examples?utm_source=x
 *
 * Wait — hash comes before search in a URL. The correct reconstruction is
 * pathname + search + hash, matching the URL spec order.
 *
 *   { pathname: '/uk/', search: '?utm_source=x', hash: '#examples' }
 *                                                  →  /?utm_source=x#examples
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
