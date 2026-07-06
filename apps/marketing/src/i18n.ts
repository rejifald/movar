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
  download: string;
  feedback: string;
  privacy: string;
  /** Accessible label for the mobile hamburger toggle. */
  menu: string;
}

interface HeroStrings {
  /** Three trust claims for the hero eyebrow chip. Each renders with its
   *  own icon (free → Tag, openSource → CodeXml, privacy → ShieldCheck).
   *  Keep the privacy line in step with the Privacy section's "nothing
   *  leaves your browser" claim. */
  badge: {
    free: string;
    openSource: string;
    privacy: string;
  };
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
  facts: StakesFact[]; // exactly 4
  /** Transition line at the bottom, hands off to HowItWorks. */
  closeLine: string;
}

interface HowItWorksStep {
  title: string;
  body: string;
  /** Optional status pill shown next to the title — e.g. "Beta". */
  badge?: string;
  /** Optional footnote shown under the body, rendered with a leading "*". */
  note?: string;
}

interface HowItWorksStrings {
  sectionTitle: string;
  sectionLead: string;
  /** Two parallel mechanisms — one for search engines, one for bilingual sites. */
  steps: HowItWorksStep[]; // exactly 2
}

interface LimitationsStrings {
  sectionTitle: string;
  sectionLead: string;
  /** Each entry is one thing Movar deliberately does not do, with a brief why. */
  items: string[];
  /** Inline label for the source-code link appended after the final (privacy) item. */
  sourceLink: string;
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
  transparency: string;
  download: string;
  feedback: string;
  sourceCode: string;
}

/** Chrome for the public `/transparency` page. The per-promise claim + proof
 *  strings themselves come from `scripts/lib/promises.mts` (English, verbatim);
 *  these are the localized labels around them. */
interface TransparencyStrings {
  htmlTitle: string;
  metaDescription: string;
  eyebrow: string;
  heading: string;
  intro: string;
  /** Status pills. */
  verifiedLabel: string;
  brokenLabel: string;
  /** Per-card labels. */
  proofLabel: string;
  claimedAtLabel: string;
  /** The static-source-check caveat for the network-silence promise. */
  caveatHeading: string;
  caveat: string;
  /** Link back to the full privacy policy. */
  privacyLink: string;
}

interface DownloadStrings {
  /**
   * Per-browser labels. JS swaps the CTA to the one matching the visitor.
   * Opera and Brave install Chromium extensions via the Chrome Web Store
   * but show their own brand on the button.
   */
  add: Record<'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'safari' | 'safari-ios', string>;
  /** Neutral SSR label, rendered before JS runs. */
  addGeneric: string;
  /**
   * Label shown post-detection to visitors on an unrecognised browser
   * (Tor, mobile in-app browsers, niche/private builds). The CTA points
   * at the GitHub releases page so power users can sideload a build.
   */
  viaGithub: string;
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
  /** Eight sections covering the full stack of failures. Order is
   *  deliberate: detection → markup → transport → search engines →
   *  AI answers → bilingual sites → embedded surfaces → economic
   *  feedback loop. */
  sections: WhyThisHappensSection[];
  closing: {
    heading: string;
    body: string;
  };
}

interface InstallGuideFlow {
  /** Browser-family heading, e.g. "Chrome, Edge, Brave & Opera". */
  label: string;
  /** Short label for the browser-selector pill, e.g. "Chrome & others". */
  tab: string;
  /** Ordered install→permission steps: title + one-sentence body. */
  steps: { title: string; body: string }[];
}

/** The /install guide page — the whole flow from store install to the
 *  host-access grant, per browser family. Mirrors the extension's first-run
 *  onboarding (packages/i18n `onboarding.*`) but adds the pre-install steps the
 *  onboarding can't cover (opening the store, accepting the permission prompt). */
interface InstallGuideStrings {
  htmlTitle: string;
  metaDescription: string;
  eyebrow: string;
  title: string;
  intro: string;
  /** Badge marking the flow that matches the visitor's detected browser. */
  yourBrowser: string;
  flows: {
    chromium: InstallGuideFlow;
    firefox: InstallGuideFlow;
    safari: InstallGuideFlow;
    safariIos: InstallGuideFlow;
  };
  /** Quiet privacy reassurance answering the "read all your data" prompt. */
  reassurance: string;
  /** Label for links that point here (footer + under the hero CTA). */
  linkLabel: string;
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
  transparency: TransparencyStrings;
  download: DownloadStrings;
  og: OgStrings;
  whyThisHappens: WhyThisHappensStrings;
  installGuide: InstallGuideStrings;
}

const en: Strings = {
  meta: {
    htmlLang: 'en',
    defaultTitle: 'Movar — keep the internet in your language',
    defaultDescription:
      'Movar puts the right language in front of you on Google, YouTube, and bilingual sites — without translating a thing. Free, open source, stays in your browser.',
  },
  nav: {
    download: 'Install',
    feedback: 'Contact',
    privacy: 'Privacy',
    menu: 'Menu',
  },
  hero: {
    badge: {
      free: 'Free',
      openSource: 'Open source',
      privacy: 'Nothing leaves your browser',
    },
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
      {
        heading: 'AI reads this skewed web back to everyone.',
        body: 'Search increasingly opens with an AI-written answer, and assistants answer from the web instead of linking to it. Those answers arrive in the language of the pages the AI read — for Cyrillic queries today, mostly Russian. Every site that goes Ukrainian changes what the AI reads next, and eventually the language it answers in.',
      },
    ],
    closeLine: 'None of it has to keep happening. The fix is small.',
  },
  howItWorks: {
    sectionTitle: 'How it works',
    sectionLead:
      'Movar works in two steps. The first declares your language — to search engines and sites. The second filters out the Russian that still slips through. Everything stays in your browser, nothing translated.',
    steps: [
      {
        title: 'Step 1. Declare your language up front',
        body: 'Search engines guess your language from your letters — and Cyrillic reads as Russian. Movar attaches your real language to the query itself, so Google, YouTube, Bing, and DuckDuckGo answer in the right one. And when a bilingual site hides the Ukrainian version behind the Russian one, Movar takes you straight to yours.',
      },
      {
        title: 'Step 2. Filter out what slips through',
        badge: 'Beta',
        body: 'Some sites serve Russian no matter what you set. There Movar goes after the content itself — Russian posts, videos, and results are blurred behind a curtain you can lift, or hidden outright if you prefer, while Ukrainian ones stay. Item by item, nothing translated.',
        note: 'This step is off by default — turn it on in the extension settings.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Examples',
    sectionLead:
      'The same idea applies to every country version of Google and to a list of bilingual sites we keep adding to.',
    without: 'Before Movar',
    withMovar: 'After Movar',
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
    without: 'Before Movar',
    withMovar: 'After Movar',
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
    sectionTitle: "What Movar doesn't do",
    sectionLead: "Here's what Movar doesn't do — for your privacy and your performance.",
    items: [
      "Doesn't translate content. It only blurs or hides the imposed language.",
      "Doesn't check the language of media content.",
      'Filters nothing without your say-so — on-page content filtering stays off until you turn it on.',
      "Doesn't slow down page load. Its footprint is negligible — lighter than an ad blocker's.",
      "Doesn't track you. No accounts, no analytics, no profile.",
      'Sends nothing anywhere. Everything stays in your browser, and the code is open source — check it yourself.',
    ],
    sourceLink: 'Source code',
  },
  privacy: {
    sectionTitle: 'Stays in your browser',
    sectionLead:
      'Movar has no servers, no accounts, no analytics. Everything it does — detecting your language, rewriting URLs, switching sites — happens right in your browser. Nothing about your browsing, your queries, or your preferences ever leaves it.',
    linkLabel: 'Read the full privacy policy',
  },
  close: {
    sectionTitle: 'Have feedback?',
    sectionLead: 'Have a question, an idea, or anything else? Drop a note.',
    emailLabel: 'Email support@movar.fyi',
  },
  footer: {
    credits: 'Movar community · MIT license',
    privacy: 'Privacy',
    transparency: 'Transparency',
    download: 'Install',
    feedback: 'Get in touch',
    sourceCode: 'Source code',
  },
  transparency: {
    htmlTitle: 'Transparency — Movar',
    metaDescription:
      "Movar's trust claims, machine-verified against the source code on every build. See the proofs.",
    eyebrow: 'Verified on every build',
    heading: 'Transparency',
    intro:
      'Movar makes a few promises. Each one is checked against the committed source code on every build — the same checks that drive the README badge. These are the live results.',
    verifiedLabel: 'Verified',
    brokenLabel: 'Broken',
    proofLabel: 'What we checked',
    claimedAtLabel: 'Where it’s claimed',
    caveatHeading: 'About the network-silence check',
    caveat:
      'The “nothing leaves your browser” promise is verified by a static source check at build time: a scan of the extension’s source for outgoing-network calls (fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource). A regex over source cannot catch a call that is obfuscated or assembled dynamically at runtime — so treat this as strong evidence, not a runtime guarantee. The build also confirms the manifest declares no data collection and that no analytics dependency ships.',
    privacyLink: 'Read the full privacy policy',
  },
  download: {
    add: {
      chrome: 'Add to Chrome',
      edge: 'Add to Edge',
      firefox: 'Add to Firefox',
      opera: 'Add to Opera',
      brave: 'Add to Brave',
      safari: 'Add to Safari',
      'safari-ios': 'Add to Safari (iOS)',
    },
    addGeneric: 'Add Movar to your browser',
    viaGithub: 'Get Movar from GitHub',
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
      'A walk through the moving parts that put Russian in front of visitors asking for Ukrainian: language detection, page markup, server behaviour, search-engine quirks, the AI answers built on top of them, bilingual-site patterns, and the feedback loop they create.',
    hero: {
      eyebrow: 'Deep dive',
      title: 'Why this keeps happening',
      lead: "The home page covers the short version: sites default to Russian even when you've asked for Ukrainian. The longer version is a stack of small failures, each defensible on its own, that pile up into the same outcome. This page walks the stack — what your browser asks for, what the page declares, what the detector guesses, what the search engine surfaces, what the AI answer layer writes on top of that, what bilingual sites do with the choice, and how site owners read the result back into next year's investment.",
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
        id: 'ai-answers',
        heading: 'AI answers speak the language of their sources',
        lead: 'Search is growing an answer layer — AI overviews and chat assistants that write a reply instead of listing links. The reply arrives in whatever language the sources were written in.',
        points: [
          'An AI answer is assembled from the pages retrieved for your query. When the strongest sources for a Cyrillic query are Russian, the answer comes out Russian — even when your interface is Ukrainian and your search settings ask for Ukrainian pages.',
          'The search-language setting filters which links get ranked. It does not constrain what the answer engine writes — you can watch both on one screen: Ukrainian interface, Ukrainian results filter, Russian answer above them.',
          'Ukrainian businesses feed this themselves. A Ukrainian manufacturer whose product pages are written in Russian becomes a Russian source — and gets quoted to Ukrainian customers in Russian, above every organic result.',
          "There is no after-the-fact fix. An answer generated in Russian is a Russian text; machine-translating it would only dress it up as Ukrainian. The honest options are exactly two: show it as it is, or don't show it at all.",
          'The corpus is the only lever. These systems answer from what they can read, so every page a Ukrainian site publishes in Ukrainian shifts the pool — more Ukrainian sources retrieved today, more Ukrainian answers written tomorrow. The answer layer makes going Ukrainian count double.',
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
      body: "Movar can fix the parts that happen in your browser: the request your browser sends, the URL you visit, the parameters appended to a search, the language switcher Movar already knows about for a given site. It can't edit cached CDN responses, retag misclassified Wikipedia entries, translate embedded images, make an AI write its answer in Ukrainian, or rewrite the economics. Getting the browser-level mechanics right is a precondition for the rest, though — until the signal coming from individual readers is clean, no one downstream can read it.",
    },
  },
  installGuide: {
    htmlTitle: 'Install guide — Movar',
    metaDescription:
      "Step by step: install Movar from your browser's store and let it read every site, so it keeps each page in your language.",
    eyebrow: 'Install guide',
    title: 'Install Movar',
    intro:
      'Movar keeps every page in your language. Pick your browser below and follow the steps — the one that matters is letting Movar read the sites you visit.',
    yourBrowser: 'Your browser',
    flows: {
      chromium: {
        label: 'Chrome, Edge, Brave & Opera',
        tab: 'Chrome & others',
        steps: [
          {
            title: 'Add it from the store',
            body: 'Open Movar in the Chrome Web Store and add it to your browser.',
          },
          {
            title: 'Confirm the install',
            body: "Your browser warns that Movar can read and change site data. Accept it — that's the access Movar needs.",
          },
          {
            title: 'Pin Movar',
            body: 'Click the extensions puzzle icon in the toolbar and pin Movar.',
          },
          {
            title: 'Let Movar read every site',
            body: 'Movar reads each page to detect its language. Open the Movar menu and set site access to "On all sites".',
          },
          {
            title: 'Set your language',
            body: "Open Movar's settings and put your language first. Movar requests every site in that order.",
          },
        ],
      },
      firefox: {
        label: 'Firefox',
        tab: 'Firefox',
        steps: [
          {
            title: 'Add it from the store',
            body: 'Open Movar on Firefox Add-ons and add it to Firefox.',
          },
          {
            title: 'Confirm the install',
            body: 'Firefox asks to allow access to your data for all sites. Accept it — Movar needs it to work.',
          },
          {
            title: 'Pin Movar',
            body: 'Pin Movar to the toolbar so it stays one click away.',
          },
          {
            title: 'Keep access to every site',
            body: 'Firefox grants that access at install. To change it later, open about:addons, select Movar, and use "Permissions".',
          },
          {
            title: 'Set your language',
            body: "Open Movar's settings and put your language first.",
          },
        ],
      },
      safari: {
        label: 'Safari on Mac',
        tab: 'Safari',
        steps: [
          {
            title: 'Get it from the App Store',
            body: 'Install Movar from the Mac App Store, then open the app once.',
          },
          {
            title: 'Turn Movar on',
            body: 'In Safari Settings, open Extensions and switch Movar on.',
          },
          {
            title: 'Allow on every website',
            body: 'In Extensions, select Movar and choose "Allow on Every Website".',
          },
          {
            title: 'Set your language',
            body: 'Open the Movar app and put your language first.',
          },
        ],
      },
      safariIos: {
        label: 'Safari on iPhone & iPad',
        tab: 'iPhone & iPad',
        steps: [
          {
            title: 'Get it from the App Store',
            body: 'Install Movar from the App Store.',
          },
          {
            title: 'Turn Movar on',
            body: 'Open the Settings app, then Apps → Safari → Extensions → Movar, and turn it on.',
          },
          {
            title: 'Allow all websites',
            body: 'Under Movar, set "All Websites" to "Allow".',
          },
          {
            title: 'Set your language',
            body: 'Open the Movar app and put your language first.',
          },
        ],
      },
    },
    reassurance:
      'Movar reads pages only to detect and switch their language. It has no servers — nothing about your browsing leaves your device.',
    linkLabel: 'Install guide',
  },
};

const uk: Strings = {
  meta: {
    htmlLang: 'uk',
    defaultTitle: 'Movar — налаштуйте інтернет на рідну мову',
    defaultDescription:
      'Movar відкриває пошук Google, YouTube і двомовні сайти вашою мовою — без перекладу. Безкоштовно, відкритий код, лише у вашому браузері.',
  },
  nav: {
    download: 'Встановити',
    feedback: 'Звʼязатись',
    privacy: 'Приватність',
    menu: 'Меню',
  },
  hero: {
    badge: {
      free: 'Безкоштовно',
      openSource: 'Відкритий код',
      privacy: 'Нічого не покидає браузер',
    },
    headlineLine1: 'Налаштуйте інтернет',
    headlineLine2: 'на рідну мову.',
    subhead:
      'Ви налаштували браузер на українську, а сайти все одно вперто навʼязують російську. Movar невтомно повертає вашу мову — на кожній сторінці, без жодного перекладу.',
  },
  problem: {
    sectionTitle: 'Для чого створений Movar',
    sectionLead:
      'Сайти раз у раз дають вам російську. Навіть коли і запит, і браузер — українською.',
    facts: [
      {
        heading: 'Кирилицю читають як російську.',
        body: 'Пошукові системи бачать кириличні літери — і за замовчуванням вважають це російською. Українське слово їх не переконує — російською і пишуть, і шукають більше.',
      },
      {
        heading: 'Мова браузера — лише підказка.',
        body: 'Браузер на кожен запит каже сайту: «українською, будь ласка». Сайт може це проігнорувати. Більшість так і робить.',
      },
      {
        heading: 'Двомовні сайти обирають за вас.',
        body: 'Українські магазини, новинні сайти та платформи часто мають українську версію — просто заховану за російською. Ви прийшли українською, а читаєте російською. Доки не знайдете перемикач.',
      },
    ],
    closeLine: 'Movar невтомно виправляє все це — на кожній сторінці, яку ви відкриваєте.',
    deepDiveLinkLabel: 'Чому так стається — докладніше',
  },
  stakes: {
    sectionTitle: 'Чому це важливо',
    sectionLead: 'Поодинці це дрібниці. Разом вони формують український інтернет.',
    facts: [
      {
        heading: 'Сайт обрав за вас — у звітах це виглядає як ваш вибір.',
        body: 'Власники бачать в аналітиці, що більшість відвідувачів читає російською, — і вкладаються відповідно: більше російського, менше українського. Але цей сигнал — не вибір читачів, а вибір, який сайт зробив за них.',
      },
      {
        heading: 'Менше бачать — менше створюють.',
        body: 'Українські магазини, автори й редакції отримують менше читачів — не тому, що гірші, а тому, що їх просто не бачать. Менше аудиторії цього року — менше українського контенту наступного. Менше контенту — більше випадків, коли сайт обирає за вас. І коло замикається.',
      },
      {
        heading: 'Ви обрали українську — сайт обирає за вас російську.',
        body: 'Налаштувати браузер українською — свідоме рішення. Браузер передає його сайтам у кожному запиті, а вони ігнорують. Ваш вибір скасовують у ту саму мить, коли ви його робите.',
      },
      {
        heading: 'ШІ переказує цей перекошений інтернет усім.',
        body: 'Пошук дедалі частіше починається з відповіді, написаної ШІ, а асистенти відповідають самі замість давати посилання. Ці відповіді приходять мовою сторінок, які ШІ прочитав, — за кириличними запитами сьогодні це переважно російська. Кожен сайт, що переходить на українську, змінює те, що ШІ читатиме далі, — а з часом і мову, якою він відповідає.',
      },
    ],
    closeLine: 'Movar розриває це коло.',
  },
  howItWorks: {
    sectionTitle: 'Як це працює',
    sectionLead:
      'Movar працює у два кроки. Перший заявляє вашу мову — пошуку й сайтам. Другий відсіює російське, що прослизнуло попри все. Усе — у вашому браузері, без перекладу.',
    steps: [
      {
        title: 'Крок 1. Заявляємо вашу мову наперед',
        body: 'Пошуковики вгадують мову з ваших літер — і кирилицю читають як російську. Movar додає вашу справжню мову прямо в запит, тож Google, YouTube, Bing і DuckDuckGo відповідають правильною. А коли двомовний сайт ховає українську за російською, Movar одразу веде вас на вашу версію.',
      },
      {
        title: 'Крок 2. Відсіюємо те, що прослизнуло',
        badge: 'тестування',
        body: 'Деякі сайти віддають російське, хоч що б ви налаштували. Тоді Movar береться за сам контент — російські дописи, відео й результати розмиває за завісою, яку можна підняти, або прибирає зовсім, а українські лишає, точково й без перекладу.',
        note: 'Цей крок вимкнено за замовчуванням — увімкніть його в налаштуваннях розширення.',
      },
    ],
  },
  examples: {
    sectionTitle: 'Приклади',
    sectionLead:
      'Так само це працює для Google будь-якої країни і для двомовних сайтів, список яких ми постійно розширюємо.',
    without: 'До Movar',
    withMovar: 'Після Movar',
    entries: [
      {
        site: 'Google',
        scenario: 'Ви шукаєте щось кирилицею, наприклад «політика» або «новини».',
        without:
          'Перші результати — російською. Google бачить кирилицю — і за замовчуванням показує те, чого більше: російські сторінки.',
        withMovar:
          'Movar додає до запиту підказку про українську — ще в браузері. Українські статті повертаються нагору.',
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
          'Movar каже YouTube вашу мову й країну — і той самий кириличний пошук показує українських авторів і рекомендації.',
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
    without: 'До Movar',
    withMovar: 'Після Movar',
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
    sectionTitle: 'Чого Movar не робить',
    sectionLead: 'Ось чого Movar не робить — заради приватності та продуктивності.',
    items: [
      'Не перекладає вміст. Лише розмиває або ховає навʼязану мову.',
      'Не перевіряє мову вмісту медіа.',
      'Нічого не фільтрує без вашого дозволу — фільтрування вмісту на сторінці вимкнене, доки ви самі його не ввімкнете.',
      'Не сповільнює завантаження сторінок. Його вплив мізерний — менший, ніж у блокувальника реклами.',
      'Не стежить за вами. Жодних акаунтів, аналітики чи профілю.',
      'Нічого нікуди не надсилає. Усе — у вашому браузері, а код відкритий: перевірте самі.',
    ],
    sourceLink: 'Вихідний код',
  },
  privacy: {
    sectionTitle: 'Залишається у вашому браузері',
    sectionLead:
      'У Movar немає ні серверів, ні акаунтів, ні аналітики. Усе, що він робить, — визначає мову, переписує адреси, перемикає сайти — відбувається у вашому браузері. Ні ваші пошуки, ні відвідані сайти, ні налаштування не покидають ваш браузер.',
    linkLabel: 'Повна політика приватності',
  },
  close: {
    sectionTitle: 'Маєте відгук?',
    sectionLead: 'Маєте запитання, ідею чи щось інше? Напишіть.',
    emailLabel: 'Написати на support@movar.fyi',
  },
  footer: {
    credits: 'Спільнота Movar · ліцензія MIT',
    privacy: 'Приватність',
    transparency: 'Прозорість',
    download: 'Встановити',
    feedback: 'Написати нам',
    sourceCode: 'Вихідний код',
  },
  transparency: {
    htmlTitle: 'Прозорість — Movar',
    metaDescription:
      'Обіцянки Movar, які машинно перевіряються щодо вихідного коду під час кожної збірки. Перегляньте докази.',
    eyebrow: 'Перевіряється під час кожної збірки',
    heading: 'Прозорість',
    intro:
      'Movar дає кілька обіцянок. Кожна з них перевіряється щодо зафіксованого коду під час кожної збірки — ті самі перевірки, що формують значок у README. Ось живі результати.',
    verifiedLabel: 'Перевірено',
    brokenLabel: 'Порушено',
    proofLabel: 'Що ми перевірили',
    claimedAtLabel: 'Де це заявлено',
    caveatHeading: 'Про перевірку мережевої тиші',
    caveat:
      'Обіцянку «нічого не покидає браузер» перевіряє статична перевірка коду під час збірки: сканування вихідного коду розширення на вихідні мережеві виклики (fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource). Регулярний вираз за кодом не може виявити виклик, який обфусковано або зібрано динамічно під час виконання, — тож сприймайте це як вагомий доказ, а не гарантію під час виконання. Збірка також підтверджує, що маніфест не декларує збору даних і що не постачається жодної залежності для аналітики.',
    privacyLink: 'Читати повну політику приватності',
  },
  download: {
    add: {
      chrome: 'Встановити в Chrome',
      edge: 'Встановити в Edge',
      firefox: 'Встановити в Firefox',
      opera: 'Встановити в Opera',
      brave: 'Встановити в Brave',
      safari: 'Встановити в Safari',
      'safari-ios': 'Встановити в Safari (iOS)',
    },
    addGeneric: 'Встановити Movar у браузер',
    viaGithub: 'Завантажити Movar з GitHub',
    soon: 'Незабаром',
  },
  og: {
    taglineLine1: 'Налаштуйте інтернет',
    taglineLine2: 'на рідну мову.',
    caption: 'Безкоштовно · Відкритий код · Без стеження',
  },
  whyThisHappens: {
    pageTitle: 'Чому так стається — Movar',
    pageDescription:
      'Розбір складових, через які читачам, що просять українську, видають російське: визначення мови, розмітка сторінки, поведінка серверів, особливості пошуковиків, ШІ-відповіді поверх них, шаблони двомовних сайтів і цикл зворотного звʼязку, який вони утворюють.',
    hero: {
      eyebrow: 'Глибше',
      title: 'Чому так стається',
      lead: 'На головній — коротка версія: сайти за замовчуванням віддають російську, навіть коли ви просили українську. Довша версія — це купа дрібних збоїв, де кожен сам по собі має пояснення, але разом вони складаються в той самий результат. Ця сторінка проходить весь стек — що запитує ваш браузер, що декларує сторінка, що вгадує детектор, що показує пошуковик, що поверх цього пише ШІ, що з вашим вибором роблять двомовні сайти, і як власники сайтів переносять цей результат у бюджети наступного року.',
    },
    tocHeading: 'На цій сторінці',
    sections: [
      {
        id: 'detection',
        heading: 'Детектори мов вгадують за літерами',
        lead: 'Вони не читають сторінки — вони обирають мову, чий тренувальний корпус має найбільше збігів за n-грамами. Для кирилиці це російська.',
        points: [
          'Великі детектори — CLD2 і CLD3, fastText, плюс власні варіанти пошуковиків — натреновані на корпусах, де російський веб приблизно у три-чотири рази більший за український. Неоднозначний вхід відкочується до більшого корпусу.',
          'Короткі запити нижчі за поріг впевненості детектора. Запит з одного-двох слів — наприклад, «новини» чи «погода» — не несе достатньо сигналу, щоб перебити початкове припущення. А для кирилиці це припущення — російська.',
          'Українська та російська ділять більшість службових слів, чимало лексики й майже всю абетку. Сторінка, де переважають спільні токени — картка товару, меню навігації, футер, — за замовчуванням класифікується як мова з більшим корпусом.',
          'Сторінки зі змішаними мовами зводяться до одного ярлика. Українська стаття з російською секцією коментарів читається цілісно і отримує тег «російська»; українська картка товару серед російських відгуків — те саме.',
          'Транслітерований контент випадає з кириличного детектування взагалі. Українські імена латинкою — Volodymyr, Kyiv, Lviv — читаються як англійська. Як і будь-яка українська латинкою чи романізована в URL-адресах.',
        ],
      },
      {
        id: 'markup',
        heading: 'Сторінки декларують свою мову — і помиляються',
        lead: 'HTML має стандартні способи позначати мову. Більшість сайтів або пропускають їх, або заповнюють неправильно, або суперечать самі собі в різних механізмах.',
        points: [
          '<html lang="ru"> на сторінці, яка насправді українською — найчастіший випадок. Зворотне — українська розмітка на російському змісті — трапляється приблизно так само часто. Movar спочатку читає атрибут, а коли значення виглядає ненадійним, запускає власне визначення.',
          'Вкладені атрибути lang на одній сторінці суперечать одне одному. Українська оболонка, що огортає <div lang="ru"> з основним контентом — формально коректна розмітка, але марна для будь-якого правила рівня сайту, якому потрібна одна відповідь.',
          '<link rel="alternate" hreflang> вказує на URL-адреси, у яких <html lang> однакові — кожен «альтернативний» варіант декларує ту саму мову. У Movar є захист від циклів редиректів саме через цей шаблон; без нього розширення ганялося б за власним хвостом по зламаному графу hreflang.',
          'og:locale, og:locale:alternate та meta http-equiv="Content-Language" зазвичай суперечать одне одному й <html lang>. Якому сигналу довіряє конкретний скрапер, той і перемагає.',
          'inLanguage зі Schema.org та xhtml:link rel="alternate" у sitemap декларують, що українська версія існує. Відкриваєш URL — а тіло сторінки досі російською: CMS публікує запис до того, як виконається переклад.',
          '<title> і <h1> сторінки — однією мовою, тіло — іншою. Google індексує заголовок; читачі читають тіло.',
        ],
      },
      {
        id: 'transport',
        heading: 'Транспортний шар ігнорує те, що запитує ваш браузер',
        lead: 'Ваш браузер з кожним запитом надсилає Accept-Language: uk. Більшість серверів цього не враховують.',
        points: [
          'Багато серверів читають лише перші два символи Accept-Language, ігнорують q-параметр або враховують заголовок лише при першому зверненні — а потім кешують це рішення для всього сеансу.',
          'CDN кешують відповіді лише за URL. Варіант, який отримав перший відвідувач — зазвичай російський, бо ринок більший, — потім дістається всім іншим, у кого збігається ключ кешу.',
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
          'YouTube тримає мову інтерфейсу, мову запиту й мову рекомендацій як три незалежні сигнали. Поставити інтерфейс на українську ще нічого не каже системі рекомендацій про те, що саме рекомендувати.',
          'Україномовний індекс структурно менший за російський. Ранжування частково відносне — російський результат із середніми сигналами може обійти український із тими самими сигналами просто тому, що його корпус щільніший.',
        ],
      },
      {
        id: 'ai-answers',
        heading: 'ШІ відповідає мовою своїх джерел',
        lead: 'У пошуку виростає шар відповідей — ШІ-огляди й чат-асистенти, які замість списку посилань пишуть готову відповідь. Відповідь приходить тією мовою, якою написані джерела.',
        points: [
          'Відповідь ШІ складається зі сторінок, знайдених за вашим запитом. Коли найсильніші джерела за кириличним запитом — російські, відповідь виходить російською. Навіть коли інтерфейс — українською, а налаштування пошуку просять українські сторінки.',
          'Мовне налаштування пошуку фільтрує, які посилання потраплять у видачу. Воно не обмежує, що напише генератор відповіді — обидва видно на одному екрані: інтерфейс український, фільтр результатів український, а над ними — російська відповідь.',
          'Українські бізнеси годують це власноруч. Український виробник, чиї сторінки товарів написані російською, стає російським джерелом — і його цитують українським покупцям російською, вище за всі звичайні результати.',
          'Виправити це постфактум неможливо. Відповідь, згенерована російською, — це російський текст; машинний переклад лише вдягнув би його в українське. Чесних варіантів рівно два: показати як є — або не показувати взагалі.',
          'Єдиний важіль — корпус. Ці системи відповідають з того, що можуть прочитати, тож кожна сторінка, яку український сайт публікує українською, зсуває пул: більше українських джерел сьогодні — більше українських відповідей завтра. Через шар відповідей перехід на українську важить подвійно.',
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
          'Інсталяції CMS розходяться. Українська версія перекладу відстає від російського оригіналу на тижні, тому відвідувач, що потрапив на українську за замовчуванням, бачить застарілий контент і сам перемикається на російську версію. Власники сайтів читають отриману аналітику і роблять висновок, що читачі хочуть саме російської.',
        ],
      },
      {
        id: 'beyond-the-page',
        heading: 'Сторінка — це не весь досвід',
        lead: 'Навіть українська сторінка приходить загорнутою в речі, які сама сторінка не може перекласти.',
        points: [
          'Зображення несуть неперекладений текст — банери, інфографіка, креатив реклами, скриншоти продукту. Жодного механізму рівня сторінки, щоб перевернути їх, немає; кожне зображення — окреме рішення, яке сторінка не приймає.',
          'Вбудовані плеєри — відео з YouTube, картки Twitter, кліпи Spotify, Vimeo, SoundCloud — не успадковують мову батьківської сторінки. Кожне вбудування робить власний вибір зі своїх сигналів.',
          'Магазини мобільних застосунків в українських локалях віддають російські описи й скриншоти, навіть коли в самому застосунку є українська локалізація. Сторінка в магазині застосунків публікується окремо від самого застосунку.',
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
          'Машинно перекладені українські версії читаються погано, тож користувачі надають перевагу російському оригіналу — і це похибка виживання, яку метрики трактують як уподобання.',
          'Налаштування операційної системи за замовчуванням — інсталяції Windows в Україні, які приходили з російською, мобільні пристрої, налаштовані до того, як українська стала опцією інтерфейсу — просочуються в кожен сигнал вище й рідко скидаються.',
          'У підсумку утворюється зворотний цикл. Менша україномовна аудиторія цьогоріч веде до меншої кількості українського контенту в замовленнях наступного року. Менше контенту — менший індекс. Менший індекс — детектори й ранжувальники нахиляються до російської ще сильніше за замовчуванням. Більше замовчувань — менша україномовна аудиторія наступного року. Цикл крутиться сам.',
        ],
      },
    ],
    closing: {
      heading: 'Що Movar може, а чого не може',
      body: 'Movar може виправити те, що відбувається у вашому браузері: запит, який надсилає браузер, адресу, яку ви відвідуєте, параметри, додані до пошуку, перемикач мови, який Movar уже знає для конкретного сайту. Він не може правити закешовані відповіді CDN, виправляти мовні теги в неправильно класифікованих статтях Вікіпедії, перекладати тексти на зображеннях, змусити ШІ написати відповідь українською чи переписати економіку. Але правильні механіки на рівні браузера — передумова для всього іншого: поки сигнал від окремих читачів не буде чистим, ніхто нижче по ланцюгу не зможе його прочитати.',
    },
  },
  installGuide: {
    htmlTitle: 'Гід зі встановлення — Movar',
    metaDescription:
      'Крок за кроком: встановіть Movar із магазину браузера й дозвольте йому читати всі сайти, щоб тримати кожну сторінку вашою мовою.',
    eyebrow: 'Гід зі встановлення',
    title: 'Встановіть Movar',
    intro:
      'Movar тримає кожну сторінку вашою мовою. Оберіть свій браузер нижче й виконайте кроки — головний з них: дозволити Movar читати сайти, які ви відвідуєте.',
    yourBrowser: 'Ваш браузер',
    flows: {
      chromium: {
        label: 'Chrome, Edge, Brave і Opera',
        tab: 'Chrome та інші',
        steps: [
          {
            title: 'Додайте з магазину',
            body: 'Відкрийте Movar у Chrome Web Store і додайте його до браузера.',
          },
          {
            title: 'Підтвердьте встановлення',
            body: 'Браузер попередить, що Movar може читати й змінювати дані сайтів. Прийміть — це доступ, потрібний Movar.',
          },
          {
            title: 'Закріпіть Movar',
            body: 'Натисніть значок розширень (пазл) на панелі та закріпіть Movar.',
          },
          {
            title: 'Дозвольте читати всі сайти',
            body: 'Movar читає кожну сторінку, щоб визначити її мову. Відкрийте меню Movar і виберіть доступ «На всіх сайтах».',
          },
          {
            title: 'Оберіть свою мову',
            body: 'Відкрийте налаштування Movar і поставте свою мову першою. Movar запитуватиме кожен сайт у цьому порядку.',
          },
        ],
      },
      firefox: {
        label: 'Firefox',
        tab: 'Firefox',
        steps: [
          {
            title: 'Додайте з магазину',
            body: 'Відкрийте Movar на Firefox Add-ons і додайте його до Firefox.',
          },
          {
            title: 'Підтвердьте встановлення',
            body: 'Firefox попросить дозволити доступ до ваших даних для всіх сайтів. Прийміть — без цього Movar не працює.',
          },
          {
            title: 'Закріпіть Movar',
            body: 'Закріпіть Movar на панелі, щоб він був за один клік.',
          },
          {
            title: 'Збережіть доступ до сайтів',
            body: 'Firefox надає цей доступ під час встановлення. Щоб змінити його, відкрийте about:addons, виберіть Movar і розділ «Дозволи».',
          },
          {
            title: 'Оберіть свою мову',
            body: 'Відкрийте налаштування Movar і поставте свою мову першою.',
          },
        ],
      },
      safari: {
        label: 'Safari на Mac',
        tab: 'Safari',
        steps: [
          {
            title: 'Встановіть з App Store',
            body: 'Встановіть Movar із Mac App Store і відкрийте застосунок один раз.',
          },
          {
            title: 'Увімкніть Movar',
            body: 'У налаштуваннях Safari відкрийте «Розширення» й увімкніть Movar.',
          },
          {
            title: 'Дозвольте на всіх сайтах',
            body: 'У «Розширеннях» виберіть Movar і оберіть «Дозволити на всіх сайтах».',
          },
          {
            title: 'Оберіть свою мову',
            body: 'Відкрийте застосунок Movar і поставте свою мову першою.',
          },
        ],
      },
      safariIos: {
        label: 'Safari на iPhone та iPad',
        tab: 'iPhone та iPad',
        steps: [
          {
            title: 'Встановіть з App Store',
            body: 'Встановіть Movar з App Store.',
          },
          {
            title: 'Увімкніть Movar',
            body: 'Відкрийте «Налаштування», далі «Програми» → Safari → «Розширення» → Movar і ввімкніть його.',
          },
          {
            title: 'Дозвольте всі сайти',
            body: 'Для Movar встановіть «Усі сайти» на «Дозволити».',
          },
          {
            title: 'Оберіть свою мову',
            body: 'Відкрийте застосунок Movar і поставте свою мову першою.',
          },
        ],
      },
    },
    reassurance:
      'Movar читає сторінки лише щоб визначити та перемкнути їхню мову. У нього немає серверів — жоден слід вашого перегляду не залишає пристрій.',
    linkLabel: 'Гід зі встановлення',
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

/** Path to the transparency page of a given locale. */
export function localeTransparencyHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/transparency' : '/transparency';
}

/** Path to the "why this keeps happening" deep-dive page of a given locale. */
export function localeWhyThisHappensHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/why-this-happens' : '/why-this-happens';
}

/** Path to the install-guide page of a given locale. */
export function localeInstallHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/install' : '/install';
}
