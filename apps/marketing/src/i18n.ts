/**
 * Marketing-site i18n. Two locales: 'en' (default) and 'uk'.
 *
 * Components accept a `lang: Locale` prop and look up their strings in the
 * dictionary below. Pages declare their lang by routing — /index.astro is
 * English, /uk/index.astro is Ukrainian — and pass it down. Visitors are
 * routed between the two automatically: an edge middleware in
 * functions/_middleware.ts reads Accept-Language and 302-redirects, with a
 * client-side fallback in BaseLayout's head script for surfaces where the
 * middleware isn't in front (local dev, static fetches). There is no manual
 * switcher.
 *
 * Adding a third locale: extend the union, add a key to `strings`, update
 * `alternateLocaleHref` to handle the third path prefix, add a row to the
 * UK_COUNTERPART map in functions/_middleware.ts (or generalise it), and
 * extend BaseLayout's head-script match list.
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
  /** Label on the link to the /why-this-happens deep-dive page. Sits
   *  under the closeLine and styled like the Privacy callout's link. */
  deepDiveLinkLabel: string;
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
  /** Label on the footer link to the /why-this-happens deep-dive page. */
  whyThisHappens: string;
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

interface BeforeAfterPairStrings {
  /** Heading above the pair — names the specific scenario. */
  subtitle: string;
  /** Caption under the "Without Movar" half. */
  withoutCaption: string;
  /** Caption under the "With Movar" half. */
  withCaption: string;
}

interface BeforeAfterStrings {
  sectionTitle: string;
  sectionLead: string;
  /** Per-card label, shared across every pair. */
  without: string;
  withMovar: string;
  /**
   * One entry per stacked diptych. `search` is the Cyrillic-news SERP
   * demo (result ordering); `knowledge` is the English-name entity
   * demo (Google's summary card / Knowledge Panel localisation).
   */
  pairs: {
    search: BeforeAfterPairStrings;
    knowledge: BeforeAfterPairStrings;
  };
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

interface OgStrings {
  /**
   * Two-line tagline rendered on the 1200×630 Open Graph share card.
   * Mirrors the hero headline; kept as a separate key so OG copy can
   * diverge from on-page copy without ripple edits to the hero section.
   */
  taglineLine1: string;
  taglineLine2: string;
  /** Bottom-right caption on the OG card. Shorter is better — social
   *  preview crops at the platform's whim. */
  caption: string;
}

interface WhyThisHappensSection {
  /** Slug used as the in-page anchor — kept stable so the Problem
   *  section (and any external writeup) can deep-link to a specific
   *  mechanism. */
  id: string;
  heading: string;
  /** Short punch sentence under the heading. */
  lead: string;
  /** Bulleted mechanisms — each entry is one full sentence or short
   *  paragraph, never a fragment. */
  points: string[];
}

interface WhyThisHappensStrings {
  /** <title> for the page. */
  pageTitle: string;
  /** <meta name="description"> for the page. */
  pageDescription: string;
  hero: {
    /** Small eyebrow above the h1 — e.g. "Deep dive". */
    eyebrow: string;
    /** h1 — the page title visible on the page. */
    title: string;
    /** Intro paragraph below the h1, sets up the rest. */
    lead: string;
  };
  /** Small heading above the inline table of contents. */
  tocHeading: string;
  /** Seven sections covering the full stack of failures. Order is
   *  deliberate: detection → markup → transport → search engines →
   *  bilingual sites → embedded surfaces → economic feedback loop. */
  sections: WhyThisHappensSection[];
  closing: {
    heading: string;
    body: string;
  };
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
  og: OgStrings;
  whyThisHappens: WhyThisHappensStrings;
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
    deepDiveLinkLabel: 'Read why this keeps happening',
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
    sectionTitle: "Four things you'll see",
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
        site: "Google's summary card",
        scenario: 'You search by name for a game, film, or person — say, "God of War".',
        without:
          "The summary card next to the results comes back in English. Your browser is set to Ukrainian, but Google's instant answer doesn't follow.",
        withMovar:
          'Movar tells Google to localise that card too — title, plot, ratings, release info, all in Ukrainian.',
      },
      {
        site: 'YouTube',
        scenario: 'You search YouTube in Ukrainian, e.g. "новини" or "інтервʼю".',
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
    sectionLead: 'Same search, different language. Two examples on google.com.ua.',
    without: 'Without Movar',
    withMovar: 'With Movar',
    pairs: {
      search: {
        subtitle: 'A Cyrillic news search',
        withoutCaption: 'Top results in Russian.',
        withCaption: 'Ukrainian results pinned to the top.',
      },
      knowledge: {
        subtitle: 'Searching for "God of War"',
        withoutCaption: 'Summary card in English.',
        withCaption: 'Same card, now in Ukrainian.',
      },
    },
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
    emailLabel: 'Email support@movar.fyi',
  },
  footer: {
    credits: 'Movar community · MIT license',
    privacy: 'Privacy',
    download: 'Download',
    feedback: 'Get in touch',
    whyThisHappens: 'Why this happens',
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
  og: {
    taglineLine1: 'Keep the internet',
    taglineLine2: 'in your language.',
    caption: 'Free · Open source · No tracking',
  },
  whyThisHappens: {
    pageTitle: 'Why this keeps happening — Movar',
    pageDescription:
      'A walk through the moving parts that put Russian in front of visitors asking for Ukrainian: language detection, page markup, server behaviour, search-engine quirks, bilingual-site patterns, and the feedback loop they create.',
    hero: {
      eyebrow: 'Deep dive',
      title: 'Why this keeps happening',
      lead: "The home page covers the short version: sites default to Russian even when you've asked for Ukrainian. The longer version is a stack of small failures, each defensible on its own, that pile up into the same outcome. This page walks the stack — what your browser asks for, what the page declares, what the detector guesses, what the search engine surfaces, what bilingual sites do with the choice, and how site owners read the result back into next year's investment.",
    },
    tocHeading: 'On this page',
    sections: [
      {
        id: 'detection',
        heading: 'Language detectors guess from letters',
        lead: "They don't read pages; they pick the language whose training corpus has the most matching n-grams. For Cyrillic, that's Russian.",
        points: [
          'The big detectors — CLD2 and CLD3, fastText, and the in-house variants search engines run — are trained on corpora where the Russian web is roughly three to four times larger than the Ukrainian one. Ambiguous input falls back to the bigger pile.',
          'Short inputs sit below the detector\'s confidence floor. A one- or two-word query like "новини" or "погода" doesn\'t carry enough signal to override the prior. The prior, for Cyrillic, is Russian.',
          'Ukrainian and Russian share most function words, a lot of vocabulary, and most of the alphabet. A page heavy on shared tokens — a product listing, a navigation menu, a footer — classifies as the larger-corpus language by default.',
          'Mixed-language pages collapse to a single label. A Ukrainian article with a Russian comments section is read holistically and tagged Russian; a Ukrainian product page surrounded by Russian reviews gets the same treatment.',
          'Transliterated content drops out of Cyrillic detection entirely. Ukrainian names written in Latin — Volodymyr, Kyiv, Lviv — read as English. So does any Ukrainian written in Latinka or romanised in URLs.',
        ],
      },
      {
        id: 'markup',
        heading: 'Pages declare their language and get it wrong',
        lead: 'HTML has standard ways to mark up language. Most sites either skip them, fill them in wrong, or contradict themselves across mechanisms.',
        points: [
          '<html lang="ru"> on a page that is in fact Ukrainian is the most common case. The inverse — Ukrainian markup on Russian content — happens about as often. Movar reads the attribute first, then runs its own detection when the value looks unreliable.',
          'Nested lang attributes on the same page disagree with each other. A Ukrainian shell wrapping a <div lang="ru"> content area is technically correct markup, but useless for any site-wide policy that needs one answer.',
          '<link rel="alternate" hreflang> entries point to URLs whose <html lang> all match — every "alternate" claims the same language. Movar carries a redirect loop-guard specifically because of this pattern; without it, the extension would chase its tail across the site\'s broken hreflang graph.',
          'og:locale, og:locale:alternate, and meta http-equiv="Content-Language" routinely disagree with each other and with <html lang>. Whichever signal a given scraper trusts is which one wins.',
          'Schema.org\'s inLanguage and the sitemap\'s xhtml:link rel="alternate" declare that a Ukrainian variant exists. Open the URL and the body is still Russian — the CMS publishes the row before the translation runs.',
          "The page's <title> and <h1> are in one language, the body in another. Google indexes the title; visitors read the body.",
        ],
      },
      {
        id: 'transport',
        heading: 'The transport layer ignores what your browser asks for',
        lead: 'Your browser sends Accept-Language: uk on every request. Most servers do not act on it.',
        points: [
          'Many servers read only the first two characters of Accept-Language, ignore the q-value, or honour the header on the first hit and then cache that decision against your session for the rest of the visit.',
          "CDNs cache responses by URL alone. The first visitor's variant — usually Russian, because the broader market is bigger — gets served to every subsequent visitor who shares the cache key.",
          'Geo-IP overrides the header. A browser set to Ukrainian, on a foreign network, gets Russian regardless of what the header claims. A browser set to Russian, inside Ukraine, gets the opposite. Neither matches the stated preference.',
          'Legacy ru-UA locale tags persist in older installations and old account profiles. Some servers treat them as Russian, some as Ukrainian; both are wrong about half the time.',
          'A cookie set on a single accidental click overrides every Accept-Language header you send afterward. The cookie outlasts the choice that set it, often by years.',
        ],
      },
      {
        id: 'search-engines',
        heading: 'Search engines run language as three separate axes',
        lead: "Interface language, results language, and the query's detected language are three different settings. All three have to agree before you reliably get Ukrainian results back.",
        points: [
          "On Google, hl= controls the interface language while lr= and cr= filter the results. Setting one does not move the other. The query's detected language is a third axis on top of both.",
          'The knowledge panel — the summary card next to results — is sourced from the most-edited Wikipedia for the entity in question. That is usually English or Russian regardless of your UI language. Ukrainian Wikipedia is smaller, so the panel falls back to the larger source.',
          'Wikidata holds multilingual labels for most entities, but the panel uses them only above an editor-count threshold. Below that, it falls back to English or Russian and the Ukrainian label sits unused.',
          'YouTube treats UI language, search-query language, and recommendation language as three independent signals. Setting the interface to Ukrainian tells the recommender nothing about what to recommend.',
          'The Ukrainian-language index is structurally smaller than the Russian one. Ranking is partly relative — a Russian result with mid-tier signals can outrank a Ukrainian result with the same signals just because its corpus is denser.',
        ],
      },
      {
        id: 'bilingual-sites',
        heading: 'Bilingual sites default to the bigger market',
        lead: 'Sites that maintain both a Ukrainian and a Russian version still ship the Russian one by default, and the path to the Ukrainian one is rarely obvious.',
        points: [
          'The Russian variant sits on the root URL. The Ukrainian variant lives behind /uk/, /ua/, or a separate subdomain. Click a search result, land on Russian.',
          "The switcher is in the footer, behind a hamburger menu, or hidden under a flag icon that's easy to miss. Most visitors never find it.",
          'The switch cookie is scoped to a single subdomain. Cross from www.example.com to shop.example.com and the choice resets.',
          'The preference is stored against a user account. Logged-out browsing — which is most browsing — reverts to the default on every visit.',
          'The CMS instances drift. The Ukrainian translation lags weeks behind the Russian original, so the Ukrainian-defaulted visitor sees stale content and self-selects back to the Russian version. Site owners then read the resulting analytics and conclude Russian is what readers prefer.',
        ],
      },
      {
        id: 'beyond-the-page',
        heading: 'The page is not the whole experience',
        lead: "Even a Ukrainian page arrives wrapped in things the page itself can't translate.",
        points: [
          "Images carry untranslated text — banners, infographics, ad creative, product screenshots. There is no page-level mechanism to flip them; each image is a separate decision the page can't make.",
          "Embedded players — YouTube videos, Twitter cards, Spotify clips, Vimeo, SoundCloud — don't inherit the host page's language. Each embed makes its own choice from its own signals.",
          'Mobile-app stores serve Russian descriptions and screenshots in Ukrainian locales, even when the app itself ships a Ukrainian UI. The store listing is a separate publishing surface from the app.',
          'Transactional emails, push notifications, and newsletters frequently ignore the site-level language preference and use whichever language was the default when the account was created.',
          'Alt text and ARIA labels stay in the source language even when the surrounding page is translated. Screen-reader users get a different language from sighted ones on the same page.',
        ],
      },
      {
        id: 'the-loop',
        heading: 'The economics flow back into the technology',
        lead: "All of this is supposed to be invisible to site owners. It isn't — and the loop tightens on its own.",
        points: [
          "Analytics report that \"most readers chose Russian\". The decision was the site's default, not the readers'. The signal feeding next year's investment decisions is the site's own past behaviour, not user preference.",
          'Machine-translated Ukrainian variants read poorly, so users prefer the Russian original — survival bias the metrics treat as preference.',
          'Operating-system defaults — Windows installations in Ukraine that shipped with Russian, mobile devices set up before Ukrainian was an interface option — leak into every signal above and rarely get reset.',
          'The result is a feedback loop. Smaller Ukrainian audience this year leads to less Ukrainian content commissioned next year. Less content leads to a smaller index. A smaller index leads to detectors and rankers tilting further toward Russian by default. A bigger default produces a smaller Ukrainian audience the year after. The loop runs on its own.',
        ],
      },
    ],
    closing: {
      heading: "What Movar can and can't do here",
      body: "Movar can fix the parts that happen in your browser: the request your browser sends, the URL you visit, the parameters appended to a search, the language switcher Movar already knows about for a given site. It can't edit cached CDN responses, retag misclassified Wikipedia entries, translate embedded images, or rewrite the economics. Getting the browser-level mechanics right is a precondition for the rest, though — until the signal coming from individual readers is clean, no one downstream can read it.",
    },
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
    deepDiveLinkLabel: 'Чому це триває — докладніше',
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
        heading: 'Менше зʼявляється — менше робиться.',
        body: 'Українські магазини, автори й редакції отримують менше читачів, ніж мали б — не тому що їхня робота гірша, а тому що читачі їх просто не бачать. Менше аудиторії цього року — менше українського контенту наступного. Менше контенту — більше випадків, коли сайт обирає за вас. Цикл затягується сам.',
      },
      {
        heading: 'Ви обрали українську — сайт обирає за вас іншу.',
        body: 'Налаштувати браузер українською — це рішення; для багатьох читачів — свідоме і нещодавнє. Браузер передає це рішення сайтам у кожному запиті. Сайти його ігнорують. Ваш вибір скасовується в ту саму мить, коли ви його робите.',
      },
    ],
    closeLine: 'Це не обовʼязково має тривати. Виправлення — маленьке.',
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
    sectionTitle: 'Чотири речі, які ви побачите',
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
        site: 'Картка-довідка Google',
        scenario: 'Ви шукаєте за назвою — гру, фільм, людину. Скажімо, «God of War».',
        without:
          'Картка-довідка поряд із результатами повертається англійською. Браузер налаштовано на українську, але швидка відповідь Google це не враховує.',
        withMovar:
          'Movar просить Google локалізувати й цю картку — назва, опис, оцінки, дата виходу, усе українською.',
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
    sectionLead: 'Той самий запит, інша мова. Два приклади на google.com.ua.',
    without: 'Без Movar',
    withMovar: 'З Movar',
    pairs: {
      search: {
        subtitle: 'Кириличний пошук новин',
        withoutCaption: 'Перші результати — російською.',
        withCaption: 'Українські результати закріплені нагорі.',
      },
      knowledge: {
        subtitle: 'Запит «God of War»',
        withoutCaption: 'Картка-довідка англійською.',
        withCaption: 'Та сама картка — українською.',
      },
    },
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
    emailLabel: 'Написати на support@movar.fyi',
  },
  footer: {
    credits: 'Спільнота Movar · ліцензія MIT',
    privacy: 'Приватність',
    download: 'Завантажити',
    feedback: 'Написати нам',
    whyThisHappens: 'Чому це триває',
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
  og: {
    taglineLine1: 'Хай інтернет буде',
    taglineLine2: 'вашою мовою.',
    caption: 'Безкоштовно · Відкритий код · Без стеження',
  },
  whyThisHappens: {
    pageTitle: 'Чому це триває — Movar',
    pageDescription:
      'Розбір складових, через які читачам, що просять українську, видають російське: визначення мови, розмітка сторінки, поведінка серверів, особливості пошуковиків, шаблони двомовних сайтів і цикл зворотного звʼязку, який вони утворюють.',
    hero: {
      eyebrow: 'Глибше',
      title: 'Чому це триває',
      lead: 'На головній — коротка версія: сайти за замовчуванням віддають російську, навіть коли ви просили українську. Довша версія — це купа дрібних збоїв, кожен з яких сам по собі виправдовуваний, але разом вони складаються в той самий результат. Ця сторінка проходить весь стек — що запитує ваш браузер, що декларує сторінка, що вгадує детектор, що показує пошуковик, що з вашим вибором роблять двомовні сайти, і як власники сайтів зчитують результат у наступний рік інвестицій.',
    },
    tocHeading: 'На цій сторінці',
    sections: [
      {
        id: 'detection',
        heading: 'Детектори мов вгадують за літерами',
        lead: 'Вони не читають сторінки — вони обирають мову, чий тренувальний корпус має найбільше збігів за n-грамами. Для кирилиці це російська.',
        points: [
          'Великі детектори — CLD2 і CLD3, fastText, плюс власні варіанти пошуковиків — натреновані на корпусах, де російський веб приблизно у три-чотири рази більший за український. Неоднозначний вхід відкочується до більшої купи.',
          'Короткі запити нижчі за поріг впевненості детектора. Запит з одного-двох слів — наприклад, «новини» чи «погода» — не несе достатньо сигналу, щоб перебити апріорі. А апріорі для кирилиці — російська.',
          'Українська та російська ділять більшість службових слів, чимало лексики й майже всю абетку. Сторінка, де переважають спільні токени — картка товару, меню навігації, футер, — за замовчуванням класифікується як мова з більшим корпусом.',
          'Сторінки зі змішаними мовами зводяться до одного ярлика. Українська стаття з російським коментарями читається цілісно і отримує тег «російська»; українська картка товару серед російських відгуків — те саме.',
          'Транслітерований контент випадає з кириличного детектування взагалі. Українські імена латинкою — Volodymyr, Kyiv, Lviv — читаються як англійська. Як і будь-яка українська латинкою чи романізована в URL-адресах.',
        ],
      },
      {
        id: 'markup',
        heading: 'Сторінки декларують свою мову — і помиляються',
        lead: 'HTML має стандартні способи позначати мову. Більшість сайтів або пропускають їх, або заповнюють неправильно, або суперечать самі собі в різних механізмах.',
        points: [
          '<html lang="ru"> на сторінці, яка насправді українською — найчастіший випадок. Зворотне — українська розмітка на російському змісті — трапляється приблизно так само часто. Movar спочатку читає атрибут, а коли значення виглядає ненадійним, запускає власне визначення.',
          'Вкладені атрибути lang на одній сторінці суперечать одне одному. Українська оболонка, що огортає <div lang="ru"> з основним контентом — формально коректна розмітка, але марна для будь-якої політики рівня сайту, що потребує однієї відповіді.',
          '<link rel="alternate" hreflang> вказує на URL-адреси, у яких <html lang> однакові — кожен «альтернативний» варіант декларує ту саму мову. У Movar є захист від циклів редиректів саме через цей шаблон; без нього розширення ганялося б за власним хвостом по зламаному графу hreflang.',
          'og:locale, og:locale:alternate та meta http-equiv="Content-Language" зазвичай суперечать одне одному й <html lang>. Який сигнал довірений конкретному скраперу — той і перемагає.',
          'inLanguage зі Schema.org та xhtml:link rel="alternate" у sitemap декларують, що українська версія існує. Відкриваєш URL — а тіло сторінки досі російською: CMS публікує запис до того, як виконається переклад.',
          '<title> і <h1> сторінки — однією мовою, тіло — іншою. Google індексує заголовок; читачі читають тіло.',
        ],
      },
      {
        id: 'transport',
        heading: 'Транспортний шар ігнорує те, що запитує ваш браузер',
        lead: 'Ваш браузер з кожним запитом надсилає Accept-Language: uk. Більшість серверів цього не враховують.',
        points: [
          'Багато серверів читають лише перші два символи Accept-Language, ігнорують q-параметр або поважають заголовок лише на першому хіті — а потім кешують це рішення для всього сеансу.',
          'CDN кешують відповіді лише за URL. Варіант, який отримав перший відвідувач — зазвичай російський, бо ринок більший, — потім лунає всім іншим, у кого збігається ключ кешу.',
          'Geo-IP перебиває заголовок. Браузер з налаштуванням «українська» у закордонній мережі отримує російську, незважаючи на заголовок. Браузер з налаштуванням «російська» всередині України — навпаки. Жодна з двох поведінок не збігається із заявленою.',
          'Застарілі теги локалі ru-UA лишаються в старіших інсталяціях і профілях акаунтів. Одні сервери трактують їх як російську, інші як українську; обидві відповіді помиляються приблизно в половині випадків.',
          'Кука, виставлена одним випадковим кліком, перебиває кожен Accept-Language, який ви надсилаєте потім. Кука живе довше за вибір, який її поставив, — часто роками.',
        ],
      },
      {
        id: 'search-engines',
        heading: 'Пошуковики тримають мову на трьох окремих осях',
        lead: 'Мова інтерфейсу, мова результатів і визначена мова запиту — це три різні налаштування. Всі три мають збігтися, перш ніж ви надійно отримаєте українські результати.',
        points: [
          'У Google hl= керує мовою інтерфейсу, тоді як lr= і cr= фільтрують результати. Налаштування одного не зрушує іншого. Визначена мова запиту — третя вісь поверх обох.',
          'Картка-довідка — та, що стоїть поряд із результатами — формується з найактивнішої Вікіпедії для відповідної сутності. Зазвичай це англійська або російська, незалежно від мови інтерфейсу. Українська Вікіпедія менша, тому картка відкочується до більшого джерела.',
          'У Wikidata є багатомовні мітки для більшості сутностей, але картка користується ними лише вище певного порогу кількості редакторів. Нижче порогу — відкат до англійської чи російської, а українська мітка лишається без діла.',
          'YouTube тримає мову інтерфейсу, мову запиту й мову рекомендацій як три незалежні сигнали. Поставити інтерфейс на українську ще нічого не каже рекомендувальній системі про те, що рекомендувати.',
          'Україномовний індекс структурно менший за російський. Ранжування частково відносне — російський результат із середніми сигналами може обійти український із тими самими сигналами просто тому, що його корпус щільніший.',
        ],
      },
      {
        id: 'bilingual-sites',
        heading: 'Двомовні сайти за замовчуванням ведуть на більший ринок',
        lead: 'Сайти, що мають і українську, і російську версію, все одно за замовчуванням видають російську — а шлях до української рідко буває очевидним.',
        points: [
          'Російський варіант сидить на кореневій URL-адресі. Українська версія живе за /uk/, /ua/ або на окремому піддомені. Клік по результату пошуку — і ви на російській.',
          'Перемикач захований у футері, за гамбургер-меню чи під значком прапора, який легко пропустити. Більшість відвідувачів його ніколи не знаходить.',
          'Кука вибору живе тільки в межах одного піддомену. Перейти з www.example.com на shop.example.com — і вибір скидається.',
          'Налаштування привʼязане до акаунта користувача. Гостьовий перегляд — а саме він складає більшість трафіку — за кожним відвідуванням повертається до замовчування.',
          'Інсталяції CMS розходяться. Українська версія перекладу відстає від російського оригіналу на тижні, тому український-за-замовчуванням відвідувач бачить застарілий контент і сам перемикається на російську версію. Власники сайтів читають отриману аналітику і роблять висновок, що читачі хочуть саме російської.',
        ],
      },
      {
        id: 'beyond-the-page',
        heading: 'Сторінка — це не весь досвід',
        lead: 'Навіть українська сторінка приходить загорнутою в речі, які сама сторінка не може перекласти.',
        points: [
          'Зображення несуть неперекладений текст — банери, інфографіка, креатив реклами, скриншоти продукту. Жодного механізму рівня сторінки, щоб перевернути їх, немає; кожне зображення — окреме рішення, яке сторінка не приймає.',
          'Вбудовані плеєри — відео з YouTube, картки Twitter, кліпи Spotify, Vimeo, SoundCloud — не успадковують мову батьківської сторінки. Кожне вбудування робить власний вибір зі своїх сигналів.',
          'Магазини мобільних застосунків в українських локалях віддають російські описи й скриншоти, навіть коли в самому застосунку є українська локалізація. Сторінка магазину — це окрема публікаційна поверхня від застосунку.',
          'Транзакційні листи, push-сповіщення й розсилки нерідко ігнорують мовне налаштування сайту й користуються тією мовою, яка була за замовчуванням під час створення акаунта.',
          'Alt-текст і ARIA-мітки лишаються тією мовою, на якій вони були записані, навіть коли сторінка перекладена. Користувачі скрін-рідерів отримують з тієї самої сторінки іншу мову, ніж зрячі.',
        ],
      },
      {
        id: 'the-loop',
        heading: 'Економіка тече назад у технологію',
        lead: 'Усе це мало б бути невидимим для власників сайтів. Але це не так — і цикл стискається сам.',
        points: [
          'Аналітика повідомляє, що «більшість читачів обрала російську». Рішення приймав не читач, а сам сайт. Сигнал, з якого виростають інвестиції наступного року, — це попередня поведінка самого сайту, а не реальний вибір користувача.',
          'Машинно перекладені українські версії читаються погано, тож користувачі надають перевагу російському оригіналу — і це bias виживання, який метрики трактують як уподобання.',
          'Налаштування операційної системи за замовчуванням — інсталяції Windows в Україні, які приходили з російською, мобільні пристрої, налаштовані до того, як українська стала опцією інтерфейсу — просочуються в кожен сигнал вище й рідко скидаються.',
          'У підсумку утворюється зворотний цикл. Менша україномовна аудиторія цьогоріч веде до меншої кількості українського контенту в замовленнях наступного року. Менше контенту — менший індекс. Менший індекс — детектори й ранжувальники нахиляються до російської ще сильніше за замовчуванням. Більше замовчувань — менша україномовна аудиторія наступного року. Цикл крутиться сам.',
        ],
      },
    ],
    closing: {
      heading: 'Що Movar може, а чого не може',
      body: 'Movar може виправити те, що відбувається у вашому браузері: запит, який надсилає браузер, адресу, яку ви відвідуєте, параметри, додані до пошуку, перемикач мови, який Movar уже знає для конкретного сайту. Він не може правити закешовані відповіді CDN, переставляти теги в неправильно класифікованих статтях Вікіпедії, перекладати тексти на зображеннях чи переписувати економіку. Але правильні механіки на рівні браузера — передумова для всього іншого: поки сигнал від окремих читачів не буде чистим, ніхто нижче по ланцюгу не зможе його прочитати.',
    },
  },
};

export const strings: Record<Locale, Strings> = { en, uk };

function enToUk(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/uk/';
  return `/uk${pathname}`;
}

function ukToEn(pathname: string): string {
  const stripped = pathname.replace(/^\/uk/, '');
  if (stripped === '' || stripped === '/') return '/';
  return stripped;
}

/**
 * Compute the path to the same page in the other locale. Used by
 * BaseLayout's `<link rel="alternate" hreflang>` tags so search engines can
 * route directly to the matching locale.
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

/** Path to the "why this keeps happening" deep-dive page of a given locale. */
export function localeWhyThisHappensHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/why-this-happens' : '/why-this-happens';
}
