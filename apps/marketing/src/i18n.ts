/**
 * Marketing-site i18n. Two locales: 'en' (default) and 'uk'.
 *
 * Components accept a `lang: Locale` prop and look up their strings in the
 * dictionary below. Pages declare their lang by routing — /index.astro is
 * English, /uk/index.astro is Ukrainian — and pass it down. Locale picking
 * is automatic (see BaseLayout's head script); there is no manual switcher.
 *
 * Adding a third locale: extend the union, add a key to `strings`, and add
 * a route prefix to BaseLayout's auto-redirect logic.
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

interface ProblemFact {
  heading: string;
  body: string;
}

interface ProblemStrings {
  /** Small eyebrow above the lead — e.g. "Why Movar was created". */
  sectionTitle: string;
  /** The punch sentence. Visually the largest text in the section. */
  sectionLead: string;
  facts: ProblemFact[]; // exactly 3
  /** Transition line at the bottom, hands off to HowItWorks. */
  closeLine: string;
}

interface StakesFact {
  heading: string;
  body: string;
}

interface StakesStrings {
  /** Small eyebrow — e.g. "Why this matters". Sits between Problem and HowItWorks. */
  sectionTitle: string;
  /** Punch sentence covering the scale of the harm. */
  sectionLead: string;
  facts: StakesFact[]; // exactly 3
  /** Transition line at the bottom, hands off to HowItWorks. */
  closeLine: string;
}

interface HowItWorksStep {
  title: string;
  body: string;
}

interface HowItWorksStrings {
  sectionTitle: string;
  sectionLead: string;
  /** Two parallel mechanisms — one for search engines, one for bilingual sites. */
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

interface PrivacyStrings {
  sectionTitle: string;
  sectionLead: string;
  /** Link label that takes readers to the full /privacy policy page. */
  linkLabel: string;
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
  /** Per-browser labels. JS swaps the CTA to the one matching the visitor. */
  add: Record<'chrome' | 'edge' | 'firefox', string>;
  /** Fallback label rendered before JS runs and for unrecognised browsers. */
  addGeneric: string;
  /** Inline badge on the CTA when the matched store isn't live yet. */
  soon: string;
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
  problem: ProblemStrings;
  stakes: StakesStrings;
  howItWorks: HowItWorksStrings;
  examples: ExamplesStrings;
  beforeAfter: BeforeAfterStrings;
  limitations: LimitationsStrings;
  privacy: PrivacyStrings;
  close: CloseStrings;
  footer: FooterStrings;
  download: DownloadStrings;
}

const en: Strings = {
  meta: {
    htmlLang: 'en',
    defaultTitle: 'Movar — keep the internet in your language',
    defaultDescription:
      'Movar puts the right language in front of you on Google, YouTube, and bilingual sites — without translating a thing. Free, open source, stays in your browser.',
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
    badge: 'Free · Open source · In your browser',
    headlineLine1: 'Keep the internet',
    headlineLine2: 'in your language.',
    subhead:
      "Sites keep handing you the wrong language even when you've asked clearly. Movar fixes that — quietly, without translating a thing.",
  },
  problem: {
    sectionTitle: 'Why Movar was created',
    sectionLead:
      'Sites keep handing you Russian. Even when you typed Ukrainian. Even when your browser is set to Ukrainian.',
    facts: [
      {
        heading: 'Cyrillic gets read as Russian.',
        body: "Search engines see Cyrillic letters and assume Russian by default. The Ukrainian word you typed doesn't change their mind — there are simply more Russian pages on the open web, and the ranking follows the pile.",
      },
      {
        heading: 'Browser language is just a suggestion.',
        body: 'Your browser tells every site "Ukrainian, please" on every request. Sites are free to ignore that signal. Most do.',
      },
      {
        heading: 'Bilingual sites pick for you.',
        body: 'Ukrainian shops, news sites, and platforms often have a full Ukrainian version sitting behind their Russian one. You arrive in Ukrainian, you read in Russian — unless you go hunt for the switch.',
      },
    ],
    closeLine: 'Movar fixes all three, quietly, on every page you load.',
  },
  stakes: {
    sectionTitle: 'Why this matters',
    sectionLead: 'Each wrong default is small. Together they shape the Ukrainian internet.',
    facts: [
      {
        heading: 'A broken default looks like a real preference.',
        body: 'Site owners look at their analytics and see most visitors reading Russian. They invest accordingly — more Russian articles, less Ukrainian, sometimes none at all. The signal feeding that decision was their own default, not what readers would have chosen.',
      },
      {
        heading: 'Less surfaces, less gets made.',
        body: 'Ukrainian shops, creators, and newsrooms get fewer readers than they should — not because their work is worse, but because readers never see it. Less audience this year means less Ukrainian content next year. Less content means more wrong defaults. The loop tightens on its own.',
      },
      {
        heading: "Your choice loses to a default you didn't set.",
        body: "Setting your browser to Ukrainian is a decision — for many readers, a recent and deliberate one. Sites get told that on every request and override it anyway. The choice is undone in the moment it's made.",
      },
    ],
    closeLine: 'None of it has to keep happening. The fix is small.',
  },
  howItWorks: {
    sectionTitle: 'How it works',
    sectionLead:
      'No setup needed. Movar uses the language your browser is already set to and quietly makes every site follow it. It runs entirely in your browser — nothing leaves it.',
    steps: [
      {
        title: 'Search engines see your language, not just your letters.',
        body: 'Google, YouTube, Bing, and DuckDuckGo all guess your language from the letters you type — and Cyrillic looks like Russian to them. Movar attaches your actual language to every search before it leaves your browser, so they answer in the right one.',
      },
      {
        title: 'Bilingual sites open in your version, not theirs.',
        body: 'Ukrainian shops, news sites, and platforms often have separate Ukrainian and Russian versions and pick which one to show you. Movar takes you straight to the version that matches your browser.',
      },
    ],
  },
  examples: {
    sectionTitle: "Three things you'll see",
    sectionLead:
      'The same idea applies to every country version of Google and to a list of bilingual sites we keep adding to.',
    without: 'Without Movar',
    withMovar: 'With Movar',
    entries: [
      {
        site: 'Google',
        scenario: 'You type a Cyrillic search like "політика" or "новини".',
        without:
          "The top results are in Russian. Google sees Cyrillic and falls back to whatever language has more pages on the open web — and that's Russian.",
        withMovar:
          'Movar adds a Ukrainian-language hint to your search before it leaves your browser. Ukrainian articles come back to the top.',
      },
      {
        site: 'YouTube',
        scenario: 'You search YouTube in Ukrainian, e.g. "новини" or "інтерв\'ю".',
        without:
          "Both search and recommendations lean Russian. The interface matches your browser language, but what YouTube *recommends* doesn't.",
        withMovar:
          'Movar tells YouTube your language and country — so the same Cyrillic search returns Ukrainian creators and Ukrainian recommendations.',
      },
      {
        site: 'A Ukrainian online shop',
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
    sectionLead: 'What Movar does for you — and what it leaves alone.',
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
      {
        does: 'Runs entirely in your browser — no analytics, no telemetry, nothing sent to Movar.',
        doesNot: 'Need an account or a sign-in — Movar has no servers to sign in to.',
      },
    ],
  },
  privacy: {
    sectionTitle: 'Stays in your browser',
    sectionLead:
      'Movar has no servers, no accounts, no analytics. Everything it does — detecting your language, rewriting URLs, switching sites — happens right in your browser. Nothing about your browsing, your queries, or your preferences ever leaves it.',
    linkLabel: 'Read the full privacy policy',
  },
  close: {
    sectionTitle: 'Have feedback?',
    sectionLead:
      'Have a question, an idea, or want to hear from us when Movar launches? Drop a note.',
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
    addGeneric: 'Add Movar to your browser',
    soon: 'Soon',
  },
};

const uk: Strings = {
  meta: {
    htmlLang: 'uk',
    defaultTitle: 'Movar — тримайте інтернет вашою мовою',
    defaultDescription:
      'Movar показує вам ту мову, яку ви читаєте — у пошуку Google, на YouTube, на двомовних сайтах. Без перекладу. Безкоштовно, відкритий код, працює лише у вашому браузері.',
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
    badge: 'Безкоштовно · Відкритий код · У вашому браузері',
    headlineLine1: 'Хай інтернет буде',
    headlineLine2: 'вашою мовою.',
    subhead:
      'Сайти знов і знов віддають вам не ту мову, навіть коли ви запитуєте однозначно. Movar це тихо виправляє — без перекладу.',
  },
  problem: {
    sectionTitle: 'Чому Movar створено',
    sectionLead:
      'Сайти знов і знов віддають вам російську. Навіть коли ви ввели українською. Навіть коли браузер налаштовано на українську.',
    facts: [
      {
        heading: 'Кирилицю читають як російську.',
        body: 'Пошукові системи бачать кириличні літери — і за замовчуванням припускають російську. Те, що ви ввели українське слово, їх не переконує: російських сторінок в інтернеті просто більше, а ранжування йде за купою.',
      },
      {
        heading: 'Мова браузера — лише підказка.',
        body: 'Браузер на кожен запит каже сайту «українською, будь ласка». Сайт має право знехтувати. Більшість так і робить.',
      },
      {
        heading: 'Двомовні сайти обирають за вас.',
        body: 'Українські магазини, новинні сайти, платформи часто мають повну українську версію — захована вона за російською. Ви прийшли українською, читаєте російською. Доки не знайдете перемикача.',
      },
    ],
    closeLine: 'Movar тихо виправляє всі три — на кожній сторінці, яку ви відкриваєте.',
  },
  stakes: {
    sectionTitle: 'Чому це важливо',
    sectionLead: 'Кожен раз — дрібниця. Разом вони формують український інтернет.',
    facts: [
      {
        heading: 'Сайт обрав за вас — у звітах це виглядає як ваш вибір.',
        body: 'Власники сайтів дивляться в аналітику — і бачать, що більшість читачів читає російською. Вони інвестують відповідно: більше російських матеріалів, менше українських, іноді жодного. Сигнал, з якого вони беруть це рішення, — це не вибір читачів. Це вибір, який сайт зробив за них.',
      },
      {
        heading: "Менше з'являється — менше робиться.",
        body: 'Українські магазини, автори й редакції отримують менше читачів, ніж мали б — не тому що їхня робота гірша, а тому що читачі їх просто не бачать. Менше аудиторії цього року — менше українського контенту наступного. Менше контенту — більше випадків, коли сайт обирає за вас. Цикл затягується сам.',
      },
      {
        heading: 'Ви обрали українську — сайт обирає за вас іншу.',
        body: 'Налаштувати браузер українською — це рішення; для багатьох читачів — свідоме і нещодавнє. Браузер передає це рішення сайтам у кожному запиті. Сайти його ігнорують. Ваш вибір скасовується в ту саму мить, коли ви його робите.',
      },
    ],
    closeLine: "Це не обов'язково має тривати. Виправлення — маленьке.",
  },
  howItWorks: {
    sectionTitle: 'Як це працює',
    sectionLead:
      'Жодних налаштувань. Movar використовує мову, на яку вже налаштовано браузер, і тихо стежить, щоб її дотримувалися всі сайти. Усе працює у вашому браузері — нічого з нього не виходить.',
    steps: [
      {
        title: 'Пошуковики бачать вашу мову, а не лише ваші літери.',
        body: 'Google, YouTube, Bing і DuckDuckGo вгадують мову з літер, які ви ввели, — і кирилиця для них виглядає російською. Movar додає вашу справжню мову до кожного запиту, перш ніж він піде з браузера, — і вони відповідають правильною.',
      },
      {
        title: 'Двомовні сайти відкриваються у вашій версії, а не їхній.',
        body: 'Українські магазини, новинні сайти та платформи часто мають окремі українську й російську версії та обирають за вас. Movar веде вас одразу на версію, що відповідає вашому браузеру.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Три речі, які ви побачите',
    sectionLead:
      'Той самий підхід працює для кожної країнної версії Google і для списку двомовних сайтів, який поступово зростає.',
    without: 'Без Movar',
    withMovar: 'З Movar',
    entries: [
      {
        site: 'Google',
        scenario: 'Ви шукаєте щось кирилицею, наприклад «політика» або «новини».',
        without:
          'Перші результати — російською. Google бачить кирилицю — і за замовчуванням показує те, чого в інтернеті більше: російські сторінки.',
        withMovar:
          'Movar додає підказку про українську мову до пошукового запиту, перш ніж він піде з вашого браузера. Українські статті повертаються нагору.',
      },
      {
        site: 'YouTube',
        scenario: 'Ви шукаєте на YouTube українською, наприклад «новини» чи «інтервʼю».',
        without:
          'І пошук, і рекомендації йдуть переважно російською. Мова сайту збігається з вашим браузером, а от що YouTube вам радить — ні.',
        withMovar:
          'Movar каже YouTube, якою мовою ви читаєте і з якої ви країни — і той самий кириличний пошук показує українських авторів та українські рекомендації.',
      },
      {
        site: 'Український інтернет-магазин',
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
      {
        does: 'Працює лише у вашому браузері — без аналітики, без телеметрії, нічого не надсилає.',
        doesNot: 'Не вимагає акаунту чи входу — у Movar немає серверів, куди можна було б увійти.',
      },
    ],
  },
  privacy: {
    sectionTitle: 'Залишається у вашому браузері',
    sectionLead:
      'У Movar немає ні серверів, ні акаунтів, ні аналітики. Усе, що він робить — визначає вашу мову, переписує адреси, перемикає сайти — відбувається у вашому браузері. Ні ваші пошуки, ні те, що ви відвідуєте, ні ваші налаштування не виходять з нього.',
    linkLabel: 'Повна політика приватності',
  },
  close: {
    sectionTitle: 'Маєте відгук?',
    sectionLead: 'Маєте запитання, ідею чи хочете дізнатися про запуск? Напишіть.',
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
    addGeneric: 'Додати Movar у браузер',
    soon: 'Незабаром',
  },
};

export const strings: Record<Locale, Strings> = { en, uk };

/** Path to the home page of a given locale. */
export function localeHomeHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/' : '/';
}

/** Path to the privacy page of a given locale. */
export function localePrivacyHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/privacy' : '/privacy';
}
