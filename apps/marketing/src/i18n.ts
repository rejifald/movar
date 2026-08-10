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

import type { SafeguardId } from './lib/safeguards';

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
  /** Label on the link to the `/how-movar-works` deep dive. */
  deepDiveLinkLabel: string;
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
  /** Second link, to `/transparency#cant-spy`. "Nothing leaves your browser"
   *  reliably raises "…today", so the answer to that follow-up is one click
   *  from where the claim is made rather than two pages deep. */
  safeguardsLabel: string;
}

interface CloseStrings {
  sectionTitle: string;
  sectionLead: string;
  emailLabel: string;
  /** Primary CTA — the Discord server. Email stays as the quieter second
   *  option for anything that needs a private reply. */
  discordLabel: string;
}

interface FooterStrings {
  credits: string;
  privacy: string;
  transparency: string;
  download: string;
  feedback: string;
  sourceCode: string;
  /** Link to the `/how-movar-works` deep dive. */
  howMovarWorks: string;
  /** The footer's social-icon row. The marks carry no visible text, so each
   *  network's string here IS the link's accessible name. Keyed by `SocialId`
   *  in `lib/social-links.ts`. */
  social: {
    /** aria-label for the row itself, naming what the icons have in common. */
    label: string;
    discord: string;
    instagram: string;
    facebook: string;
  };
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
  /** "Why a *future* version couldn't quietly spy either" — the structural
   *  safeguards section. Its citations live in `lib/safeguards.ts`, keyed by
   *  the same `SafeguardId`, so the two locales can't cite different sources. */
  safeguards: {
    heading: string;
    intro: string;
    /** Label above each card's list of primary sources. */
    sourcesLabel: string;
    items: Record<SafeguardId, { title: string; body: string }>;
    /** The honest closer: this removes the quiet paths, not the possibility. */
    closing: string;
  };
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
  /**
   * Screen-reader-only note appended to the CTA on the browsers where it hands
   * off to both the store and the /install guide (see lib/install-handoff):
   * there the store opens in a new tab, which is otherwise announced to nobody.
   */
  newTab: string;
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
  /**
   * Alt text for this entry's before/after screenshot pair (see
   * `imagePairs` in Examples.astro, keyed by the same entry index). Only
   * entries with a captured screenshot pair need this — the rest render
   * text-only and never read it.
   */
  alt?: {
    without: string;
    withMovar: string;
  };
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

/** One bulleted mechanism. A point that cites a source uses the object form so
 *  the pages can render the citation as a real link — plain point strings stay
 *  escaped verbatim (several quote literal markup like `<link rel="alternate">`).
 *
 *  An `href` starting with `/` is an in-site link and renders in the same tab;
 *  anything else is external and opens in a new one. */
type DeepDivePoint =
  | string
  | {
      /** Sentence text up to the link, including any opening bracket. */
      before: string;
      /** Visible link text, e.g. "W3Techs". */
      linkLabel: string;
      /** Source URL backing the figure — external, or an in-site path. */
      href: string;
      /** Remainder of the sentence after the link. */
      after: string;
    };

interface DeepDiveSection {
  /** Slug used as the in-page anchor — kept stable so the Problem
   *  section (and any external writeup) can deep-link to a specific
   *  mechanism. */
  id: string;
  heading: string;
  /** Short punch sentence under the heading. */
  lead: string;
  /** Bulleted mechanisms — each entry is one full sentence or short
   *  paragraph, never a fragment. */
  points: DeepDivePoint[];
}

/**
 * A long-form deep-dive page: eyebrow + h1 + lead, an inline table of
 * contents, N numbered sections of bulleted mechanisms, and a closing block.
 *
 * Two pages share this shape — `/why-this-happens` (why the internet keeps
 * handing you the wrong language) and `/how-movar-works` (how Movar decides
 * what a page is written in, and the rules it holds itself to). Both grew out
 * of the same long-form article, so they read as two halves of one piece.
 */
export interface DeepDivePageStrings {
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
  /** The page's numbered sections, in reading order. */
  sections: DeepDiveSection[];
  closing: {
    heading: string;
    body: string;
    /** Optional label for a link out of the closing block — used to hand
     *  `/why-this-happens` off to `/how-movar-works`. */
    linkLabel?: string;
    /** In-site path the closing link points at. */
    linkHref?: string;
  };
}

/** One reason block on the /why-not-ai page. Reuses DeepDivePoint so a
 *  reason that cites a measured figure can render it as a real link. */
interface WhyNotAiSection {
  /** Stable in-page anchor slug. */
  id: string;
  heading: string;
  /** Short punch sentence under the heading. */
  lead: string;
  points: DeepDivePoint[];
}

/**
 * The /why-not-ai page — why Movar doesn't hand the "what language is this?"
 * decision to a general-purpose AI model.
 *
 * Scope matters for literal truth: Movar DOES run an on-device ML language
 * detector (the browser's `LanguageDetector`) and a statistical one (`franc`),
 * so this page never claims "no AI". It claims that no AI *decides what gets
 * hidden*, and the `whatWeUse` block names what does. Store reviewers hold the
 * public copy to literal truth — see docs/store-policy-stance.md.
 *
 * The figures come from the benchmark recorded in
 * docs/no-llm-language-detection.md. Keep them in sync with that ADR: it is the
 * source of truth, this page is the retelling.
 */
interface WhyNotAiStrings {
  /** <title> for the page. */
  pageTitle: string;
  /** <meta name="description"> for the page. */
  pageDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
  };
  /** Heading above the inline table of contents. */
  tocHeading: string;
  /** The honesty block, rendered FIRST — before any of the reasons — so the
   *  page can't read as a blanket "we don't use AI" claim. */
  whatWeUse: {
    heading: string;
    body: string;
    /** Two or three plainly-worded items: what actually runs. */
    items: string[];
  };
  /** The reasons, in decreasing order of how much they drove the decision. */
  sections: WhyNotAiSection[];
  /** What would make us change our mind — stated so the refusal is falsifiable
   *  rather than dogmatic. */
  changeOurMind: {
    heading: string;
    body: string;
  };
  closing: {
    heading: string;
    body: string;
    /** Label for the link to the full written decision record. */
    adrLinkLabel: string;
    /** Label for the link on to the no-translation stance. */
    privacyLinkLabel: string;
  };
  /** Label for links that point here (footer). */
  linkLabel: string;
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
  /**
   * Edge-only heads-up shown in the Chromium flow: Edge installs Movar from the
   * Chrome Web Store, behind a one-time "allow extensions from other stores"
   * prompt. Revealed by the guide's script only when Edge is detected.
   */
  edgeNote: string;
  flows: {
    chromium: InstallGuideFlow;
    firefox: InstallGuideFlow;
    safari: InstallGuideFlow;
    safariIos: InstallGuideFlow;
  };
  /**
   * Closing privacy note answering the "read all your data" prompt — and the
   * hesitation the iOS flow's Private Browsing step raises. Rendered as a
   * titled card with a link to the source, not as a trailing footnote: the
   * guarantee is the reason the permissions above are safe to grant, so it has
   * to read as part of the guide rather than fine print under it.
   */
  reassuranceTitle: string;
  reassurance: string;
  /** Label on the closing note's link to the public source code. */
  sourceLink: string;
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
  whyThisHappens: DeepDivePageStrings;
  howMovarWorks: DeepDivePageStrings;
  whyNotAi: WhyNotAiStrings;
  installGuide: InstallGuideStrings;
}

/**
 * Brand tagline — the single source of truth for the two-line slogan. The
 * marketing hero, the OG share card, and the homepage <title> all derive
 * from this, so the wording can't drift between surfaces the way it once did
 * (the <title> read lowercase "keep the internet…" while every other surface
 * read "Keep the internet…").
 *
 * Line 2 keeps its trailing period because the hero and OG card render it as
 * a sentence; the <title> strips it via `titleTagline`, matching this app's
 * other page titles, which carry no sentence punctuation.
 *
 * The README and the extension store listings mirror this wording through
 * their own parity checks — `scripts/check-readme-parity.mts` reads
 * `strings.en.hero`, so this stays the canonical source for them too.
 */
const tagline = {
  en: { line1: 'Keep the internet', line2: 'in your language.' },
  uk: { line1: 'Налаштуйте інтернет', line2: 'на рідну мову.' },
} as const satisfies Record<Locale, { line1: string; line2: string }>;

/** The tagline as a single `<title>` line — joined, trailing period dropped. */
const titleTagline = (locale: Locale): string => {
  const line = `${tagline[locale].line1} ${tagline[locale].line2}`;
  return line.endsWith('.') ? line.slice(0, -1) : line;
};

const en: Strings = {
  meta: {
    htmlLang: 'en',
    defaultTitle: `Movar — ${titleTagline('en')}`,
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
    headlineLine1: tagline.en.line1,
    headlineLine2: tagline.en.line2,
    subhead:
      "Sites keep handing you the wrong language even when you've asked clearly. Movar fixes that — quietly, without translating a thing.",
  },
  problem: {
    sectionTitle: 'Why Movar was created',
    sectionLead:
      'Sites keep handing you Russian. Even when you typed Ukrainian. Even when your browser is set to Ukrainian. By the thousandth time, skimming it beats hunting for the switch.',
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
        heading: "What a page declares isn't what it says.",
        body: 'A site serves Russian text and marks the page up as Ukrainian. Search trusts the markup over the text, so a Russian page enters the index as a Ukrainian one. You filter results to Ukrainian and get Russian pages wearing a Ukrainian label.',
      },
      {
        heading: "Bilingual sites pick for you — and don't hold the choice.",
        body: "Ukrainian shops, news sites, and platforms often have a full Ukrainian version sitting behind their Russian one. And once you find the switch, the choice doesn't stick: the cookie is scoped to one subdomain, the menu links back to the Russian root, and a broken hreflang quietly bounces you back.",
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
        body: 'Some sites serve Russian whatever you set. On a marketplace there is nothing to switch: the interface is Ukrainian, the listings and reviews are Russian. So Movar goes item by item — Russian posts, videos, and results get blurred or hidden, Ukrainian ones stay. Nothing translated.',
        note: 'This step is off by default — turn it on in the extension settings. The curtain lifts in one click.',
      },
    ],
    deepDiveLinkLabel: 'How Movar detects language',
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
        alt: {
          without:
            'Google search results for a Cyrillic query, with Russian-language pages dominating',
          withMovar: 'Same Google search, now returning Ukrainian-language pages',
        },
      },
      {
        site: "Google's summary card",
        scenario: 'You search by name for a game, film, or person — say, "God of War".',
        without:
          "The summary card next to the results comes back in English. Your browser is set to Ukrainian, but Google's instant answer doesn't follow.",
        withMovar:
          'Movar tells Google to localise that card too — title, plot, ratings, release info, all in Ukrainian.',
        alt: {
          without:
            'Google search for "God of War" with the summary card on the right rendered in English',
          withMovar: 'Same Google search, summary card now rendered in Ukrainian',
        },
      },
      {
        site: 'YouTube',
        scenario: 'You search YouTube in Ukrainian, e.g. "новини" or "інтервʼю".',
        without:
          "Both search and recommendations lean Russian. The interface matches your browser language, but what YouTube *recommends* doesn't.",
        withMovar:
          'Movar tells YouTube your language and country — so the same Cyrillic search returns Ukrainian creators and Ukrainian recommendations.',
        alt: {
          without:
            'YouTube results for a Ukrainian-language query, recommendations dominated by Russian-language channels',
          withMovar: 'Same YouTube search, now recommending Ukrainian creators',
        },
      },
      {
        site: 'A Ukrainian online shop',
        scenario: 'You find a product through a Ukrainian Google search and click through.',
        without:
          'The shop opens in Russian by default — even though it has a full Ukrainian version at a different address.',
        withMovar:
          'Movar asks the shop to show its Ukrainian version, and you read in Ukrainian for the rest of your visit.',
        alt: {
          without: 'A Ukrainian online shop product page opened in Russian by default',
          withMovar: 'The same shop product page showing its Ukrainian version',
        },
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
      "Doesn't translate content — never, not even as an option. It only blurs or hides the imposed language.",
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
    safeguardsLabel: "Why a future version can't change that quietly",
  },
  close: {
    sectionTitle: 'Have feedback?',
    sectionLead:
      'Have a question, an idea, or a site where Movar missed? Join the Discord or drop a note. Movar is non-commercial — reviews and bug reports help most.',
    emailLabel: 'Email support@movar.fyi',
    discordLabel: 'Join the Discord',
  },
  footer: {
    credits: 'Movar community · MIT license',
    privacy: 'Privacy',
    transparency: 'Transparency',
    download: 'Install',
    feedback: 'Get in touch',
    sourceCode: 'Source code',
    howMovarWorks: 'How Movar works',
    social: {
      label: 'Movar on social media',
      discord: 'Movar on Discord',
      instagram: 'Movar on Instagram',
      facebook: 'Movar on Facebook',
    },
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
    claimedAtLabel: "Where it's claimed",
    caveatHeading: 'About the network-silence check',
    caveat:
      'The "nothing leaves your browser" promise is checked twice. On every commit, a scan of the extension\'s source looks for outgoing-network calls (fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource). On every build, the same scan runs again over the emitted bundle — dependencies and framework runtime included — and one hit fails the build. What neither catches is a call assembled dynamically at runtime, so treat this as strong evidence, not a runtime guarantee. The build also confirms the manifest declares no data collection and that no analytics dependency ships.',
    safeguards: {
      heading: "Why Movar can't quietly start spying on you",
      intro:
        'The checks above describe the version you have. The worry people actually raise is about the next one: an extension that behaves today and starts collecting tomorrow. That worry is well-earned — it has happened to other extensions. Here is what stands in the way, none of which is us asking you to trust us.',
      sourcesLabel: 'Check for yourself',
      items: {
        openSource: {
          title: 'Every line is public — and the build is reproducible',
          body: "Movar is MIT-licensed and developed in the open: every commit, every release, every review. That alone only proves the source is clean, not that the source is what you installed — so the release script builds the extension twice and fails if the two packages differ by a single byte. Anyone can rebuild a tagged commit and compare it, file hash by file hash, against the package the store served them. Firefox's reviewers do exactly that, from build instructions shipped in the repo.",
        },
        permissions: {
          title: 'Movar never asks for the permission it would need to report on you',
          body: 'Its manifest requests three narrow APIs: storage for your settings, alarms so a timed pause can end on its own, and declarativeNetRequest for the language preference it sends to sites. Access to the pages you visit is optional on Chrome and Firefox — you grant it during setup and can take it back. And the language rewrite is declarative: Movar hands the browser a rule and the browser applies it. Movar never sees the request, and never sees what came back.',
        },
        permissionChange: {
          title: "A new permission can't arrive quietly",
          body: 'If a future version asked for more, your browser would stop and ask you first — this is not a courtesy the developer chooses. Chrome disables an extension outright until you accept a newly added permission warning. Firefox refuses to install the update at all and leaves the version you already have running. There is no path from "three narrow permissions" to "reads everything you type" that doesn\'t put a dialog on your screen.',
        },
        storeReview: {
          title: 'Every update is reviewed before it reaches you',
          body: 'Updates arrive through the Chrome Web Store, Firefox Add-ons, and the App Store; Movar runs no update server of its own. All three review every submission, not just the first: Chrome states that plainly, and treats broad host permissions and obfuscated code as the things to look hardest at. Mozilla goes further for bundled extensions like Movar, rebuilding the add-on from submitted source and requiring the diff against the shipped package to be empty.',
        },
        buildCheck: {
          title: 'The build turns red if the code learns to phone home',
          body: "On every commit and in CI, a check scans the extension's source for any outgoing-network call — fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource — along with any analytics dependency and the declaration that Movar collects no data. Then every build runs the same scan over the bundle it just emitted, dependencies and framework runtime included, so a request that arrived inside somebody else's package fails the build just as loudly. One hit anywhere and the build stops; it cannot be waved through by a reviewer in a hurry. Both checks are a few dozen lines you can read in a minute.",
        },
        noRemoteCode: {
          title: 'There is no server on our side to change its mind',
          body: 'Movar has no backend at all: no accounts, no config endpoint, no feature flags, nothing to flip. Manifest V3 also forbids extensions from loading code from anywhere else — everything Movar runs ships inside the reviewed package. So a change in behaviour cannot be a switch someone throws on a Tuesday. It has to be a public commit, a passing build, a store review, and a new version arriving on your machine.',
        },
      },
      closing:
        "None of this makes spying impossible in principle; nothing does, for any software you run. What it removes is every quiet path. A version of Movar that started collecting anything would have to survive a public commit, a build check written to catch it, three independent store reviews, and — the moment it needed a permission it doesn't have — a prompt on your own screen. Somewhere in that chain, you would find out.",
    },
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
    newTab: 'opens the store in a new tab',
  },
  og: {
    taglineLine1: tagline.en.line1,
    taglineLine2: tagline.en.line2,
    caption: 'Free · Open source · Nothing leaves your browser',
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
          {
            before:
              'The big detectors — CLD2 and CLD3, fastText, and the in-house variants search engines run — are trained on corpora where the Russian web is roughly five times larger than the Ukrainian one (per ',
            linkLabel: 'W3Techs',
            href: 'https://w3techs.com/technologies/overview/content_language',
            after:
              ', Russian is 3.4% of websites against 0.7% for Ukrainian). Ambiguous input falls back to the bigger pile.',
          },
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
          'The machinery that decides which version to surface, and what to label it, trusts what the site declares — lang, hreflang, URL structure, sitemap — over what the text actually says. Nothing reconciles the two: a Russian page enters the index as Ukrainian, so you filter results to Ukrainian and get Russian pages wearing a Ukrainian label.',
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
        id: 'second-class',
        heading: 'The Ukrainian version exists, on second-class terms',
        lead: 'Say you reach the Ukrainian version. It is rarely an equal — and here the cause is human, not technical.',
        points: [
          'It gets built to exist, then maintained on whatever is left over. Buttons, system messages, checkout-form errors, tooltips, and third-party widgets stay Russian — they simply live in a file nobody translated.',
          "The chat widget bolted onto the site answers in Russian whatever language you write to it in. It is a separate product with its own language logic, and the site's language setting doesn't reach it.",
          "Banners and infographics are drawn in Russian. Text inside an image is a designer's job, not a line in a translation file, so the copy gets localised and the artwork stays as it was.",
          'The translation itself is often machine-made and unproofed — the kind where "две недели" of shipping comes back as "двома неділями", two Sundays instead of two weeks.',
          'Formally, a Ukrainian version exists. In practice you are reading a mixture — and it is the mixture that pushes people back to the Russian one, where at least a human wrote it.',
        ],
      },
      {
        id: 'user-content',
        heading: 'Russian is missing from the picker, not from the feed',
        lead: 'A category of its own: marketplaces, classifieds, and anything where the content is written by users.',
        points: [
          "The interface can be flawless Ukrainian, and Russian isn't even offered in the language picker — the choice is Ukrainian or English.",
          'The listings, descriptions, specs, and reviews are Russian anyway, because nobody checks the language of the content. The platform localises its own shell, not what sellers and posters upload into it.',
          'There is nothing here to switch. The page really is Ukrainian — only some of its blocks are Russian, and no site-level language choice fixes that.',
          'This is why a verdict for the whole page is useless here: each card needs its own. It is the line where a language setting ends and content filtering begins.',
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
          {
            before: 'The loop is clearest where the numbers are public. The ',
            linkLabel: 'Steam hardware survey',
            href: 'https://store.steampowered.com/hwsurvey/',
            after:
              " reports the language players run the client in: as of July 2026, Russian is the platform's third language at 9.3%, Ukrainian its fifteenth at 0.7%. Publishers read that table when they decide which localisations to commission.",
          },
          'A player whose client is set to Russian out of habit lands in that 9.3% and confirms the "nobody plays in Ukrainian" case for another year. The lever runs the other way too: Ukrainian has already passed Italian on Steam — 0.70% against 0.63% — a language localised by default for decades.',
        ],
      },
    ],
    closing: {
      heading: "What Movar can and can't do here",
      body: "Movar can fix the parts that happen in your browser: the request your browser sends, the URL you visit, the parameters appended to a search, the language switcher Movar already knows about for a given site. It can't edit cached CDN responses, retag misclassified Wikipedia entries, translate embedded images, make an AI write its answer in Ukrainian, or rewrite the economics. Getting the browser-level mechanics right is a precondition for the rest, though — until the signal coming from individual readers is clean, no one downstream can read it.",
      linkLabel: 'How Movar decides the language — and the rules it holds to',
      linkHref: '/how-movar-works',
    },
  },
  howMovarWorks: {
    pageTitle: 'How Movar works — Movar',
    pageDescription:
      'How Movar works out what language a page — and a single card — is written in: a ladder of six signals, a classifier for short strings, and an "unknown" verdict. Plus the rules it holds itself to, why it never translates, and what it cannot do.',
    hero: {
      eyebrow: 'Deep dive',
      title: 'How Movar works',
      lead: 'Saying "Movar sees that the page is Russian" is easy, but it is the hardest part of the whole job — and the reason shows when the signals disagree. The language picker shows "UA" as active. The <html lang> attribute says ru. The classifier, reading the text itself, returns a third answer. Who is right? This page walks through how Movar weighs the evidence, the rules it works under, why it refuses to translate, and where its reach ends.',
    },
    tocHeading: 'On this page',
    sections: [
      {
        id: 'signal-ladder',
        heading: 'A ladder of signals, strongest first',
        lead: 'Movar settles the disagreement by weighing evidence rather than taking a vote. The first signal that answers decides.',
        points: [
          "First is the active entry in the site's language picker, and it outranks <html lang> even though intuition says otherwise. The picker is drawn by the same code that draws the content: they are built together and almost always agree.",
          'Second is <html lang>. It sits in a template and lives its own life — some sites serve lang="ru" on every locale without exception.',
          'Then the subdomain ru.example.com, then a path segment matched strictly, so that /ru-return-warranty does not read as ru, and finally self-hreflang, where the page points at itself with a language tag.',
          {
            before:
              "When all five stay silent, the text of the page is what is left. Here Movar tries the browser's built-in ",
            linkLabel: 'language detector',
            href: 'https://developer.chrome.com/docs/ai/language-detection',
            after:
              ' — Chrome and Edge ship one: where it is available it is the more accurate option, and where it is not, franc runs against local trigram tables. That is the sixth and last step for a whole-page verdict.',
          },
          'Where the evidence runs out, the verdict is "unknown" — and Movar touches nothing.',
        ],
      },
      {
        id: 'per-element',
        heading: 'Short strings need a different classifier',
        lead: 'A verdict for the page is not the end of it. A product card, a menu item, a result heading each have to be classified on their own, and a three-word string is too small for both AI and trigrams.',
        points: [
          'The obvious approach is distinctive letters: і, ї, є, ґ against ы, ё. On a paragraph it works beautifully; on a short title with none of them it stays silent, and on a quotation it lies. So letters are not the whole method here — only the first rung of four.',
          'The rungs in order: distinctive letters, then hand-picked function words with the highest precision, then frequency words generated from a subtitle corpus, and finally franc — a trigram backstop, and only for text of 24 characters or more. The rung whose leader pulls ahead by at least one wins.',
          '"Distinctive" means not "unique in the world" but "unique among the languages we are telling apart right now". The letter і settles Ukrainian against Russian, because only the first has it — but between Ukrainian and Belarusian it decides nothing, because both do.',
          "When the card carries a language tag of its own — Google labels its AI answer block with a proprietary attribute — Movar weighs tag and text together: the tag decides while there is little text, but a confident read of the text overrides it. A card labelled Ukrainian that is really Russian doesn't get to hide behind its label.",
          'The conclusion comes back with its evidence, not just a language code: which rung fired, by what margin, and whether there was anything to choose between at all. And where the votes split, the verdict is "unknown" — which for Movar means "leave it alone".',
        ],
      },
      {
        id: 'langtell',
        heading: 'The classifier grew into its own package',
        lead: 'This part eventually outgrew Movar: the classifier, the language profiles, and the codes moved into a separate package published on npm.',
        points: [
          {
            before: '',
            linkLabel: 'langtell',
            href: 'https://www.npmjs.com/package/langtell',
            after:
              ' answers a different question from franc or cld3. Not "what language is this text" but "what language is this heading, given the page and the headings it arrived with" — and it shows what the conclusion was built from.',
          },
          'It reads more than the text itself: <html lang>, og:locale, and the Content-Language header all count as evidence, and the verdict comes back with a list of what influenced it, so it is always visible why a string was classified the way it was.',
          'Its Cyrillic set is wider than Movar needs — Serbian, Macedonian, and Kazakh are in there too — so anyone can take it for their own pair of languages. Zero required dependencies, MIT, and franc plugs in separately and only when needed.',
          'What stayed in Movar is what is specific to Movar: the fast heuristic for the main path, the engine orchestrator, and BCP-47 normalisation. All of it on the device: no request out, no telemetry. That is a condition, not a side effect.',
        ],
      },
      {
        id: 'principles',
        heading: 'Rules Movar holds itself to',
        lead: 'Behind each of these decisions is a rule that stays in force even when breaking it would be convenient.',
        points: [
          'Switch first, hide last. Movar is not a blocker: its main job is to find the Ukrainian version that already exists and switch the site to it.',
          'Shared mechanisms, not a list of sites. The header, hreflang, markup, and language pickers exist everywhere, so the base layer works on a site Movar has never seen. The page models for Google and YouTube are an extension, not the foundation.',
          'The criterion is language, not content. Movar does not judge texts or attach labels to them.',
          'Better to miss something Russian than to hide something Ukrainian by mistake. The whole detection mechanism runs on evidence, and "not sure" means "leave it alone".',
          'An explicit choice by the reader outranks a setting. If you clicked "Russian" on a site yourself, Movar does not throw you back — it stands down on that site for the rest of the session, at most a day. Otherwise the extension would be undoing your own choice.',
          'No content filtering by default. Hiding content is off until you turn it on in the settings.',
          'All processing on the device, AI included. Opportunistic, not required: where a built-in detector exists Movar uses it, and where it does not, local algorithms do the work. It never downloads AI models and never demands a newer browser.',
          'No looking inside media. Movar does not read text inside images, video, or audio. That is a principle and a limitation at once.',
          'No analytics. No counters, no telemetry, no "anonymous statistics".',
          {
            before:
              'The promises are checked by a program. Each one is verified against the source on every build: "nothing leaves your browser" is a check that scans the sources for network calls and fails the build if it finds one. Not marketing, a test — live results on the ',
            linkLabel: 'Transparency',
            href: '/transparency',
            after: ' page.',
          },
          'Never translate. Not ever, not even as an option. The next section is about exactly that.',
        ],
      },
      {
        id: 'no-translation',
        heading: 'Why Movar never translates',
        lead: 'The obvious response to "this text is in the wrong language" is to translate it. Movar refuses on principle, and it is probably the most important decision in the whole product.',
        points: [
          'What does it do with the Russian still on the page? Neither translates it nor hides the page wholesale. It removes individual elements, exactly the ones in a blocked language: the "Russian" entry in a language picker, a Russian result in Google\'s listing, a video card on YouTube. The rest stays as it is.',
          'Translation launders the source. Machine Ukrainian reads like the real thing, and you are alone again with exactly the content you fenced yourself off from — now in a language you trust, propaganda included. The signal "this is Russian" is the thing people install Movar for.',
          'Translation stalls Ukrainian. The Ukrainian-language audience is invisible to the people making content — it dissolves into the Russian-language numbers. The reader is satisfied and the author never learns that their audience would rather read Ukrainian. The demand stays invisible.',
          'When there is no Ukrainian content, there are exactly two honest options: show it as it is, or hide it. You choose which: filtered content either disappears or stays in place behind a blurred curtain.',
          'Movar does not sort authors into right and wrong. Propaganda hides behind Ukrainian perfectly well — language alone guarantees nothing about the quality of a text. A pro-Ukrainian author writing in Russian is caught by the filter too, because the criterion here is language, not loyalty. Any other criterion would turn a language tool into something else entirely.',
        ],
      },
      {
        id: 'limits',
        heading: "What Movar can't do",
        lead: 'It would be dishonest to pretend the extension fixes everything.',
        points: [
          "Movar fixes what happens in your browser: the request that gets sent, the URL you open, the search parameters, the switcher it already knows for a site. It doesn't edit cached CDN responses, retag misclassified Wikipedia articles, translate text baked into an image, or make an AI answer in Ukrainian.",
          'The item-by-item filter has a hard edge. To remove a card, Movar has to understand the page structure, and right now it knows Google results and YouTube. On a marketplace it cleans up the picker and leaves the product cards. Every new structure is its own rule — the honest answer to "what about my site?".',
          "YouTube has no equivalent of Google's lr — no parameter that genuinely filters out Russian-language video; hl and gl only nudge the interface, the ranking, and the recommendations. The URL guarantees nothing there, and the only thing that removes Russian cards is the same item-by-item filter you switch on by hand.",
          'When a Ukrainian-only Google filter returns an empty page, Movar re-runs the query once without it. Insisting on the language to the bitter end would mean showing you zero results instead of the ones that do exist.',
          'But a clean signal is the precondition for everything else. While the systems see a muddy signal, detectors, ranking, and AI answers will keep pointing at the wrong language.',
        ],
      },
    ],
    closing: {
      heading: 'Like the idea? Get involved',
      body: "Movar is non-commercial: no paid tier, no premium features, no data for sale. There is one goal — more Ukrainian on the internet. Four things help most. An honest review in an extension store: ratings are how stores decide who to show an extension to. Telling people about it — everyone who switches Movar on is one more clean signal in the same statistics that localisation budgets grow from. A bug report about a site where Movar missed, or fired where it shouldn't have: each one becomes a test and stops recurring. And design — icons, illustrations, store-page assets; that is what is in shortest supply.",
      linkLabel: 'Get in touch',
      linkHref: '/#close',
    },
  },
  whyNotAi: {
    pageTitle: "Why we don't use AI — Movar",
    pageDescription:
      "Movar decides what language a page is in with a small on-device detector, not a chatbot. We tested Chrome's built-in AI model on 422 real text samples: it hid two thirds of Ukrainian pages that discuss Russia. Here are the numbers.",
    hero: {
      eyebrow: 'A decision, with receipts',
      title: "Why we don't use AI",
      lead: 'Every browser now ships a general-purpose AI model, and the obvious idea is to let it decide what language a page is written in. We built that, measured it against 422 real text samples — Wikipedia articles and human-written sentences, not examples of our own invention — and threw it away. It was wrong more often than the boring code it would have replaced, and it was wrong in the one direction that matters most: it hid Ukrainian.',
    },
    tocHeading: 'On this page',
    whatWeUse: {
      heading: 'First, what Movar actually runs',
      body: "We won't pretend Movar is machine-learning-free — that would be an easy claim to make and it would be false. Movar reads letters and words to work out what language something is in, and two small pieces of software help it do that. Neither one writes, rewrites, summarises, or reasons about what a page means. Neither one sends anything anywhere.",
      items: [
        "Your browser's own language detector — a small model Chrome and Edge already ship for their translate feature. Movar uses it only if your browser already has it, and never triggers a download.",
        'A statistical detector called franc, which counts letter patterns. Open source, no model file, and the same on every browser — this is what carries Firefox and Safari.',
        'A set of hand-written rules for Ukrainian and Russian spelling: і, ї, є, ґ against ы, ё, ъ, э. Dull, fast, and it cannot be talked into changing its mind.',
      ],
    },
    sections: [
      {
        id: 'topic',
        heading: 'An AI reads what a page is about, not what language it is in',
        lead: 'This is the whole reason. Everything else is just cost.',
        points: [
          'Ukrainian media writes about Russia constantly. Russian media writes about Ukraine constantly. So we tested exactly that: Ukrainian articles about Moscow, and Russian articles about Kyiv, taken from Wikipedia rather than written by us.',
          'The AI called 66% of the Ukrainian pages Russian. If Movar had trusted it, it would have hidden two thirds of Ukrainian articles about Russia from the people who installed Movar to read Ukrainian.',
          'In the other direction it called 56% of the Russian pages Ukrainian — letting through the very content it was asked to catch.',
          'The small detector Movar actually uses hid none of them. Zero out of fifty.',
          'You can see the mistake without any adversarial trickery. Give the AI a paragraph of plain English that happens to mention a "Ukrainian musician" and "Ukrainian folk music", and it answers: Ukrainian. It isn\'t identifying a language. It\'s answering "what is this about?" — and for Movar those are not the same question.',
        ],
      },
      {
        id: 'prompting',
        heading: 'We tried to prompt our way out of it, and it got worse',
        lead: 'The usual answer to a badly-behaved model is a better prompt. We tried that, twice.',
        points: [
          'We instructed it, in plain words, to ignore the subject matter — that a text about Ukraine may well be written in Russian, and that the topic is irrelevant. It kept scoring the topic.',
          'We then showed it four worked examples, two of them exactly this trap, with the correct answer spelled out. Accuracy dropped further: from 39% to 32% on longer pages, and from 21% to 13% on short ones.',
          'With those examples in hand it answered Ukrainian 46 times and Russian 49 times, on a set that was 45 Russian and 50 Ukrainian. That is a coin toss with extra steps.',
          "Forcing it to choose only between Ukrainian and Russian didn't help either. It changed the shape of the answer, not the quality of the judgement.",
        ],
      },
      {
        id: 'accuracy',
        heading: 'It was simply less accurate, everywhere',
        lead: 'Not a trade-off — a straight loss on every category of page we tested.',
        points: [
          'Across all 422 samples: 70% correct for the AI, against 93% for what Movar ships today.',
          'On full pages of article text, where you would most expect a language model to shine: 84% against 100%.',
          'Compared sample by sample, the AI was uniquely right 15 times and uniquely wrong 112 times.',
          'Every one of its common mistakes was inside the pair Movar acts on: Ukrainian mistaken for Russian, Russian mistaken for Ukrainian, Belarusian mistaken for either.',
        ],
      },
      {
        id: 'speed',
        heading: 'It would make every page slower',
        lead: 'Movar has to decide before you see the page. An AI cannot answer that fast.',
        points: [
          'Movar budgets 150 milliseconds for the whole language decision, because it happens while the page is loading and you are waiting for it.',
          'The AI took about 0.4 seconds per check in the configuration we would have had to ship, and 1.1 seconds for the slowest ones. Not one of the 422 samples came in under the budget.',
          'The first page after you open your browser is far worse: the model needs roughly 22 seconds to wake up before it answers anything at all.',
          'What Movar uses today answers a full page in about 20 milliseconds, and short text in well under one.',
        ],
      },
      {
        id: 'battery',
        heading: 'It would drain your battery',
        lead: 'A multi-gigabyte model runs on your graphics chip. That is not free, and you pay it on every page you open.',
        points: [
          'We measured the work: 40 language decisions cost 22 seconds of processor time — roughly half a second of computation for every single page.',
          "The small detector Movar uses costs around a fortieth of that. So the AI is at least 25 times more expensive per page, and that figure is a floor: it doesn't count the energy the graphics chip burns.",
          'Movar runs on laptops and phones. Half a second of heavy computation per page means a warmer machine, a louder fan, and less time on battery — repaid on every navigation, for as long as the extension is installed.',
          'The model file itself is about 4 GB on disk, and it has to stay there.',
        ],
      },
      {
        id: 'reach',
        heading: 'Almost none of you could use it anyway',
        lead: 'Browser AI has hardware requirements that read like a gaming PC spec sheet.',
        points: [
          'It needs a desktop computer: Windows 10 or 11, macOS 13 or newer, Linux, or ChromeOS. There is no phone or tablet support at all.',
          'It needs more than 4 GB of dedicated graphics memory, 16 GB of RAM, and 22 GB of free disk space before it will even download.',
          'It exists only in Chrome and Edge. Firefox and Safari have nothing like it, and those are exactly the browsers where Movar leans hardest on its fallback detector.',
          'Building a core feature that most people can never run means shipping two products and only testing one of them.',
        ],
      },
      {
        id: 'quiet',
        heading: 'And it would break the quiet',
        lead: 'Movar sends nothing, anywhere. Adding an AI puts that at risk for no gain.',
        points: [
          "The browser's AI does run on your own machine — we're not accusing it of spying. But it arrives as a multi-gigabyte download, and Movar currently makes no network requests at all. That silence is a promise we would rather keep than qualify.",
          "For the same reason Movar doesn't translate Russian into Ukrainian, even though your browser could. A machine translation reads like native Ukrainian, so it quietly launders the thing you installed Movar to avoid.",
        ],
      },
    ],
    changeOurMind: {
      heading: 'What would change our mind',
      body: 'This is a measurement, not a principle about AI, so it can be overturned by a better measurement. We would reopen it for a browser model that gets Ukrainian-about-Russia wrong less than 5% of the time, answers inside the 150-millisecond budget, and costs no more than about twice the computation of the small detector. All three, on the same test set, including the pages where the topic and the language disagree — because that is the test that broke every version we tried.',
    },
    closing: {
      heading: 'Read the whole thing',
      body: 'The full decision — the corpus, every table, the failure catalogue, and the three unrelated bugs the benchmark turned up in our own code — is written down in the repository, in the same format we use for every architectural decision. It is public because the numbers should be arguable.',
      adrLinkLabel: 'The decision record on GitHub',
      privacyLinkLabel: 'How Movar handles your data',
    },
    linkLabel: 'Why no AI',
  },
  installGuide: {
    htmlTitle: 'Install guide — Movar',
    metaDescription:
      "Step by step: install Movar from your browser's store and let it read page content, so it keeps each page in your language.",
    eyebrow: 'Install guide',
    title: 'Install Movar',
    intro:
      'Movar keeps every page in your language. Pick your browser below and follow the steps — the one that matters is letting Movar read the content of the sites you visit.',
    yourBrowser: 'Your browser',
    edgeNote:
      'On Edge, Movar installs from the Chrome Web Store. The first time, Edge asks you to "allow extensions from other stores" — that\'s expected. Allow it once, then add Movar; it installs into Edge like any other extension.',
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
            title: 'Pin Movar (optional)',
            body: 'Click the extensions puzzle icon in the toolbar and pin Movar.',
          },
          {
            title: 'Let Movar read page content',
            body: 'Movar reads each page\'s content to detect its language, then switches it to yours. Open the Movar menu and set site access to "On all sites".',
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
            title: 'Pin Movar (optional)',
            body: 'Pin Movar to the toolbar so it stays one click away.',
          },
          {
            title: 'Keep access to every site',
            body: 'Firefox grants that access at install. To change it later, open about:addons, select Movar, and use "Permissions".',
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
            body: 'Open the Settings app, then Apps → Safari → Extensions → Movar and turn it on. Allow it in Private Browsing too — Movar has no servers to send anything to, so your private tabs stay private.',
          },
          {
            title: 'Allow all websites',
            body: 'Under Movar, set "All Websites" to "Allow".',
          },
        ],
      },
    },
    reassuranceTitle: 'Nothing leaves your browser',
    reassurance:
      "Movar only reads a page's content to detect its language, then switches it to yours. It has no servers, no accounts, no analytics — nothing about your browsing ever leaves your device. Every line of it is public.",
    sourceLink: 'Read the source code',
    linkLabel: 'Install guide',
  },
};

const uk: Strings = {
  meta: {
    htmlLang: 'uk',
    defaultTitle: `Мовар — ${titleTagline('uk')}`,
    defaultDescription:
      'Мовар відкриває пошук Google, YouTube і двомовні сайти вашою мовою — без перекладу. Безкоштовно, відкритий код, лише у вашому браузері.',
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
    headlineLine1: tagline.uk.line1,
    headlineLine2: tagline.uk.line2,
    subhead:
      'Ви налаштували браузер на українську, а сайти все одно вперто навʼязують російську. Мовар невтомно повертає вашу мову — на кожній сторінці, без жодного перекладу.',
  },
  problem: {
    sectionTitle: 'Для чого створений Мовар',
    sectionLead:
      'Сайти раз у раз дають вам російську. Навіть коли і запит, і браузер — українською. І на тисячний раз простіше прочитати як є, ніж шукати перемикач.',
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
        heading: 'Задекларована мова й справжня — різні речі.',
        body: 'Сайт віддає російський текст, а в розмітці пише, що сторінка українська. Пошук вірить розмітці, а не тексту, тож російська сторінка потрапляє в індекс як українська. Ви фільтруєте видачу за українською — і отримуєте російські результати з українською биркою.',
      },
      {
        heading: 'Двомовні сайти обирають за вас — і не тримають вибір.',
        body: 'Українські магазини, новинні сайти та платформи часто мають українську версію — просто заховану за російською. А коли ви таки знайшли перемикач, вибір не тримається: кука живе в межах одного піддомену, посилання в меню веде на кореневу російську, а поламаний hreflang мовчки кидає вас назад.',
      },
    ],
    closeLine: 'Мовар невтомно виправляє все це — на кожній сторінці, яку ви відкриваєте.',
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
    closeLine: 'Мовар розриває це коло.',
  },
  howItWorks: {
    sectionTitle: 'Як це працює',
    sectionLead:
      'Мовар працює у два кроки. Перший заявляє вашу мову — пошуку й сайтам. Другий відсіює російське, що прослизнуло попри все. Усе — у вашому браузері, без перекладу.',
    steps: [
      {
        title: 'Крок 1. Заявляємо вашу мову наперед',
        body: 'Пошуковики вгадують мову з ваших літер — і кирилицю читають як російську. Мовар додає вашу справжню мову прямо в запит, тож Google, YouTube, Bing і DuckDuckGo відповідають правильною. А коли двомовний сайт ховає українську за російською, Мовар одразу веде вас на вашу версію.',
      },
      {
        title: 'Крок 2. Відсіюємо те, що прослизнуло',
        badge: 'тестування',
        body: 'Деякі сайти віддають російське, хоч що б ви налаштували. А на маркетплейсах перемикати взагалі нема на що: інтерфейс український, а картки товарів і відгуки — російські. Тому Мовар працює поелементно: російські дописи, відео й результати розмиває за завісою або прибирає зовсім, а українські лишає. Без перекладу.',
        note: 'Цей крок вимкнено за замовчуванням — увімкніть його в налаштуваннях розширення. Завісу можна підняти в один клік.',
      },
    ],
    deepDiveLinkLabel: 'Як Мовар визначає мову — докладніше',
  },
  examples: {
    sectionTitle: 'Приклади',
    sectionLead:
      'Так само це працює для Google будь-якої країни і для двомовних сайтів, список яких ми постійно розширюємо.',
    without: 'До Мовара',
    withMovar: 'Після Мовара',
    entries: [
      {
        site: 'Google',
        scenario: 'Ви шукаєте щось кирилицею, наприклад «політика» або «новини».',
        without:
          'Перші результати — російською. Google бачить кирилицю — і за замовчуванням показує те, чого більше: російські сторінки.',
        withMovar:
          'Мовар додає до запиту підказку про українську — ще в браузері. Українські статті повертаються нагору.',
        alt: {
          without:
            'Результати пошуку Google за кириличним запитом, де переважають російськомовні сторінки',
          withMovar: 'Той самий пошук Google, тепер повертає україномовні сторінки',
        },
      },
      {
        site: 'Картка-довідка Google',
        scenario: 'Ви шукаєте за назвою — гру, фільм, людину. Скажімо, «God of War».',
        without:
          'Картка-довідка поряд із результатами повертається англійською. Браузер налаштовано на українську, але швидка відповідь Google це не враховує.',
        withMovar:
          'Мовар просить Google локалізувати й цю картку — назва, опис, оцінки, дата виходу, усе українською.',
        alt: {
          without: 'Пошук Google за запитом «God of War», де картка-довідка праворуч — англійською',
          withMovar: 'Той самий пошук Google, картка-довідка тепер українською',
        },
      },
      {
        site: 'YouTube',
        scenario: 'Ви шукаєте на YouTube українською, наприклад «новини» чи «інтервʼю».',
        without:
          'І пошук, і рекомендації йдуть переважно російською. Мова сайту збігається з вашим браузером, а от що YouTube вам радить — ні.',
        withMovar:
          'Мовар каже YouTube вашу мову й країну — і той самий кириличний пошук показує українських авторів і рекомендації.',
        alt: {
          without:
            'Результати YouTube за україномовним запитом, у рекомендаціях переважають російськомовні канали',
          withMovar: 'Той самий пошук YouTube, тепер рекомендує українських авторів',
        },
      },
      {
        site: 'Український інтернет-магазин',
        scenario: 'Ви знайшли товар через український Google і відкрили його.',
        without:
          'Магазин за замовчуванням відкриває російську версію — хоча українська теж є, просто за іншою адресою.',
        withMovar:
          'Мовар просить магазин показати українську версію — і ви читаєте українською до кінця візиту.',
        alt: {
          without:
            'Сторінка товару українського інтернет-магазину, відкрита російською за замовчуванням',
          withMovar: 'Та сама сторінка товару — тепер показує українську версію',
        },
      },
    ],
  },
  beforeAfter: {
    sectionTitle: 'Подивіться, як це працює',
    sectionLead: 'Той самий запит, інша мова. Два приклади на google.com.ua.',
    without: 'До Мовара',
    withMovar: 'Після Мовара',
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
    sectionTitle: 'Чого Мовар не робить',
    sectionLead: 'Ось чого Мовар не робить — заради приватності та продуктивності.',
    items: [
      'Не перекладає вміст — ніколи, навіть опційно. Лише розмиває або ховає навʼязану мову.',
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
      'У Мовара немає ні серверів, ні акаунтів, ні аналітики. Усе, що він робить, — визначає мову, переписує адреси, перемикає сайти — відбувається у вашому браузері. Ні ваші пошуки, ні відвідані сайти, ні налаштування не покидають ваш браузер.',
    linkLabel: 'Повна політика приватності',
    safeguardsLabel: 'Чому майбутня версія не змінить цього непомітно',
  },
  close: {
    sectionTitle: 'Маєте відгук?',
    sectionLead:
      'Маєте запитання, ідею чи сайт, де Мовар не спрацював? Приєднуйтеся до Discord або напишіть. Мовар некомерційний — відгук у магазині та баг-репорт допомагають найбільше.',
    emailLabel: 'Написати на support@movar.fyi',
    discordLabel: 'Приєднатися до Discord',
  },
  footer: {
    credits: 'Спільнота Мовар · ліцензія MIT',
    privacy: 'Приватність',
    transparency: 'Прозорість',
    download: 'Встановити',
    feedback: 'Написати нам',
    sourceCode: 'Вихідний код',
    howMovarWorks: 'Як працює Мовар',
    social: {
      label: 'Мовар у соцмережах',
      discord: 'Мовар у Discord',
      instagram: 'Мовар в Instagram',
      facebook: 'Мовар у Facebook',
    },
  },
  transparency: {
    htmlTitle: 'Прозорість — Мовар',
    metaDescription:
      'Обіцянки Мовара, які машинно перевіряються щодо вихідного коду під час кожної збірки. Перегляньте докази.',
    eyebrow: 'Перевіряється під час кожної збірки',
    heading: 'Прозорість',
    intro:
      'Мовар дає кілька обіцянок. Кожна з них перевіряється щодо зафіксованого коду під час кожної збірки — ті самі перевірки, що формують значок у README. Ось живі результати.',
    verifiedLabel: 'Перевірено',
    brokenLabel: 'Порушено',
    proofLabel: 'Що ми перевірили',
    claimedAtLabel: 'Де це заявлено',
    caveatHeading: 'Про перевірку мережевої тиші',
    caveat:
      'Обіцянку «нічого не покидає браузер» перевіряють двічі. На кожному коміті сканування шукає у вихідному коді розширення вихідні мережеві виклики (fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource). На кожній збірці те саме сканування проходить уже по зібраному пакунку — разом із залежностями та рантаймом фреймворку, — і одне влучання валить збірку. Чого не виявляє жодне з них — це виклик, зібраний динамічно під час виконання, тож сприймайте це як вагомий доказ, а не гарантію під час виконання. Збірка також підтверджує, що маніфест не декларує збору даних і що не постачається жодної залежності для аналітики.',
    safeguards: {
      heading: 'Чому Мовар не може почати стежити за вами непомітно',
      intro:
        'Перевірки вище описують ту версію, яку ви маєте. Але побоювання, яке справді озвучують, стосується наступної: розширення поводиться добре сьогодні, а завтра починає збирати дані. Це побоювання заслужене — таке вже траплялося з іншими розширеннями. Ось що стоїть на заваді, і жоден із цих пунктів не зводиться до «просто повірте нам».',
      sourcesLabel: 'Перевірте самі',
      items: {
        openSource: {
          title: 'Кожен рядок публічний — а збірка відтворювана',
          body: 'Мовар має ліцензію MIT і розробляється відкрито: кожен коміт, кожен реліз, кожне обговорення змін. Саме по собі це доводить лише те, що вихідний код чистий, — але не те, що саме з нього зібрано пакунок, який ви встановили. Тому скрипт релізу збирає розширення двічі й падає, якщо два пакунки різняться хоч на байт. Будь-хто може перезібрати позначений тегом коміт і порівняти його — хеш файлу з хешем — із пакунком, який видав йому магазин. Рецензенти Firefox роблять саме це, за інструкціями зі збірки, що лежать у репозиторії.',
        },
        permissions: {
          title: 'Мовар ніколи не просить дозволу, потрібного, щоб про вас доповідати',
          body: 'Його маніфест запитує три вузькі API: storage — для ваших налаштувань, alarms — щоб тимчасова пауза сама завершилася, і declarativeNetRequest — для мовних уподобань, які він повідомляє сайтам. Доступ до сторінок, які ви відвідуєте, у Chrome і Firefox необовʼязковий: ви надаєте його під час налаштування й можете забрати назад. А заміна мови — декларативна: Мовар передає браузерові правило, і застосовує його браузер. Мовар не бачить ні самого запиту, ні того, що прийшло у відповідь.',
        },
        permissionChange: {
          title: 'Новий дозвіл не може зʼявитися непомітно',
          body: 'Якщо майбутня версія попросить більше, браузер спершу зупиниться й запитає вас — і це не любʼязність, яку обирає розробник. Chrome повністю вимикає розширення, доки ви не приймете новододаний дозвіл. Firefox узагалі відмовляється встановлювати оновлення й лишає працювати ту версію, яку ви вже маєте. Немає шляху від «трьох вузьких дозволів» до «читає все, що ви друкуєте», який не вивів би діалог на ваш екран.',
        },
        storeReview: {
          title: 'Кожне оновлення проходить перевірку, перш ніж дійти до вас',
          body: 'Оновлення приходять через Chrome Web Store, Firefox Add-ons і App Store; власного сервера оновлень у Мовара немає. Усі три перевіряють кожну подачу, а не тільки першу: Chrome прямо про це пише й найпильніше дивиться саме на широкі дозволи до сайтів та обфускований код. Mozilla для зібраних розширень на кшталт Мовара йде далі: перезбирає додаток із наданого вихідного коду й вимагає, щоб різниця з опублікованим пакунком була порожньою.',
        },
        buildCheck: {
          title: 'Збірка стає червоною, якщо код навчиться «дзвонити додому»',
          body: 'На кожному коміті та в CI перевірка сканує вихідний код розширення на будь-який вихідний мережевий виклик — fetch, XMLHttpRequest, WebSocket, sendBeacon, EventSource — а також на будь-яку залежність з аналітикою й на декларацію, що Мовар не збирає даних. А далі кожна збірка проганяє те саме сканування по щойно зібраному пакунку, разом із залежностями та рантаймом фреймворку, — тож запит, який приїхав усередині чужого пакета, валить збірку так само гучно. Одне влучання будь-де — і збірка спиняється; це не та річ, яку рецензент може поспіхом пропустити. Обидві перевірки — це кілька десятків рядків, які можна прочитати за хвилину.',
        },
        noRemoteCode: {
          title: 'З нашого боку немає сервера, який міг би передумати',
          body: 'У Мовара взагалі немає бекенду: ні акаунтів, ні ендпоїнта конфігурації, ні перемикачів функцій — нічого, що можна ввімкнути. Manifest V3 до того ж забороняє розширенням завантажувати код звідкись іззовні: усе, що Мовар виконує, лежить усередині перевіреного пакета. Тож зміна поведінки не може бути перемикачем, який хтось клацнув у вівторок. Це має бути публічний коміт, успішна збірка, перевірка в магазині й нова версія, що прийшла на вашу машину.',
        },
      },
      closing:
        'Ніщо з цього не робить стеження неможливим у принципі — для будь-якої програми, яку ви запускаєте, такої гарантії не існує. Але це прибирає всі тихі шляхи. Версія Мовара, яка почала б щось збирати, мусила б пережити публічний коміт, перевірку збірки, написану саме щоб її зловити, три незалежні перевірки магазинів і — щойно їй знадобиться дозвіл, якого вона не має, — запит на вашому власному екрані. Десь у цьому ланцюжку ви про це дізнаєтеся.',
    },
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
    addGeneric: 'Встановити Мовар у браузер',
    viaGithub: 'Завантажити Мовар з GitHub',
    soon: 'Незабаром',
    newTab: 'магазин відкриється в новій вкладці',
  },
  og: {
    taglineLine1: tagline.uk.line1,
    taglineLine2: tagline.uk.line2,
    caption: 'Безкоштовно · Відкритий код · Нічого не покидає браузер',
  },
  whyThisHappens: {
    pageTitle: 'Чому так стається — Мовар',
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
          {
            before:
              'Великі детектори — CLD2 і CLD3, fastText, плюс власні варіанти пошуковиків — натреновані на корпусах, де російський веб приблизно впʼятеро більший за український (за ',
            linkLabel: 'даними W3Techs',
            href: 'https://w3techs.com/technologies/overview/content_language',
            after:
              ', російською написано 3,4% сайтів проти 0,7% українською). Неоднозначний вхід відкочується до більшого корпусу.',
          },
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
          '<html lang="ru"> на сторінці, яка насправді українською — найчастіший випадок. Зворотне — українська розмітка на російському змісті — трапляється приблизно так само часто. Мовар спочатку читає атрибут, а коли значення виглядає ненадійним, запускає власне визначення.',
          'Вкладені атрибути lang на одній сторінці суперечать одне одному. Українська оболонка, що огортає <div lang="ru"> з основним контентом — формально коректна розмітка, але марна для будь-якого правила рівня сайту, якому потрібна одна відповідь.',
          '<link rel="alternate" hreflang> вказує на URL-адреси, у яких <html lang> однакові — кожен «альтернативний» варіант декларує ту саму мову. У Мовара є захист від циклів редиректів саме через цей шаблон; без нього розширення ганялося б за власним хвостом по зламаному графу hreflang.',
          'og:locale, og:locale:alternate та meta http-equiv="Content-Language" зазвичай суперечать одне одному й <html lang>. Якому сигналу довіряє конкретний скрапер, той і перемагає.',
          'inLanguage зі Schema.org та xhtml:link rel="alternate" у sitemap декларують, що українська версія існує. Відкриваєш URL — а тіло сторінки досі російською: CMS публікує запис до того, як виконається переклад.',
          '<title> і <h1> сторінки — однією мовою, тіло — іншою. Google індексує заголовок; читачі читають тіло.',
          'Машинерія, що вирішує, яку версію показати в пошуку й як її підписати, довіряє тому, що сайт декларує — lang, hreflang, структурі URL, sitemap, — а не тому, що насправді в тексті. Ніхто не звіряє одне з одним: російська сторінка потрапляє в індекс як українська, а ви фільтруєте видачу за українською і отримуєте російські результати з українською биркою.',
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
        id: 'second-class',
        heading: 'Українська версія є — але на правах додаткової',
        lead: 'Припустімо, ви таки дісталися української версії. Рівною вона буває рідко — і тут причина вже не технічна, а людська.',
        points: [
          'Її роблять «щоб була», а далі підтримують за залишковим принципом. Кнопки, службові повідомлення, помилки у формі замовлення, підказки й сторонні віджети лишаються російськими — вони просто лежать не в тому файлі, який перекладали.',
          'Вбудований у сайт чат-бот відповідає російською, хай би якою мовою ви до нього писали. Це окремий продукт із власною мовною логікою, і мовне налаштування сайту його не стосується.',
          'Банери та інфографіка намальовані російською. Підпис усередині картинки — робота дизайнера, а не рядок у файлі перекладу, тож текст локалізують, а зображення лишають як є.',
          'Сам переклад часто машинний і невичитаний — той, де «электропитание» стає «електрохарчуванням», електричний котел — «казаном», а «две недели» доставки — «двома неділями» замість двох тижнів.',
          'Формально українська версія є. Насправді ви читаєте суміш — і саме вона підштовхує повернутися на російську, де принаймні все написано людиною.',
        ],
      },
      {
        id: 'user-content',
        heading: 'У переліку мов російської немає — а в стрічці вона є',
        lead: 'Окремий випадок — маркетплейси, дошки оголошень і все, де вміст пишуть самі користувачі.',
        points: [
          'Інтерфейс там буває бездоганно українським, а в перемикачі мов російської немає навіть у списку — обирати можна хіба між українською та англійською.',
          'Але картки товарів, описи, характеристики й відгуки — російською, бо мову вмісту не перевіряє ніхто. Платформа локалізує свою оболонку, а не те, що в неї заливають продавці й дописувачі.',
          'Перемикати тут нема на що. Сторінка справді українська — російські в ній лише окремі блоки, тож жоден вибір мови на рівні сайту цього не виправить.',
          'Саме тому вердикт для всієї сторінки тут марний: потрібен окремий висновок для кожної картки. Це і є та межа, за якою мовне налаштування закінчується, а починається фільтр вмісту.',
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
          {
            before: 'Найкраще цикл видно там, де цифри публічні. ',
            linkLabel: 'Опитування Steam',
            href: 'https://store.steampowered.com/hwsurvey/',
            after:
              ' показує, якою мовою користувачі запускають клієнт: станом на липень 2026-го російська — третя мова платформи з 9,3%, українська — 0,7% і пʼятнадцяте місце. Видавці дивляться саме в цю таблицю, вирішуючи, які локалізації замовляти. Гравець, у якого клієнт стоїть російською за звичкою, щороку підтверджує аргумент «українською майже ніхто не грає».',
          },
          'Важіль працює і в інший бік. За останні роки українська в Steam уже обійшла італійську — 0,70% проти 0,63% — мову, яку локалізували за замовчуванням десятиліттями.',
        ],
      },
    ],
    closing: {
      heading: 'Що Мовар може, а чого не може',
      body: 'Мовар може виправити те, що відбувається у вашому браузері: запит, який надсилає браузер, адресу, яку ви відвідуєте, параметри, додані до пошуку, перемикач мови, який Мовар уже знає для конкретного сайту. Він не може правити закешовані відповіді CDN, виправляти мовні теги в неправильно класифікованих статтях Вікіпедії, перекладати тексти на зображеннях, змусити ШІ написати відповідь українською чи переписати економіку. Але правильні механіки на рівні браузера — передумова для всього іншого: поки сигнал від окремих читачів не буде чистим, ніхто нижче по ланцюгу не зможе його прочитати.',
      linkLabel: 'Як Мовар визначає мову — і за якими правилами діє',
      linkHref: '/uk/how-movar-works',
    },
  },
  howMovarWorks: {
    pageTitle: 'Як працює Мовар — Мовар',
    pageDescription:
      'Як Мовар визначає мову сторінки й окремої картки: драбина з шести сигналів, класифікатор коротких рядків, вердикт «невідомо». А також правила, яких Мовар не порушує, чому він принципово не перекладає і чого не може.',
    hero: {
      eyebrow: 'Глибше',
      title: 'Як працює Мовар',
      lead: 'Сказати «Мовар бачить, що сторінка російською» легко — але це найважча частина всієї роботи, і найкраще видно чому, коли сигнали суперечать один одному. Перемикач мов показує активною «UA». Атрибут <html lang> каже ru. Класифікатор, подивившись на сам текст, повертає третє. Хто має рацію? Ця сторінка показує, як Мовар зважує докази, за якими правилами діє, чому принципово не перекладає — і де проходить межа його можливостей.',
    },
    tocHeading: 'На цій сторінці',
    sections: [
      {
        id: 'signal-ladder',
        heading: 'Драбина сигналів: від найнадійнішого до найслабшого',
        lead: 'Мовар розвʼязує суперечку сигналів не голосуванням, а зважуванням доказів. Перший сигнал, що дав відповідь, вирішує.',
        points: [
          'Перший — активний пункт перемикача мов, і саме він важливіший за атрибут <html lang>, хоча інтуїція підказує навпаки. Перемикач малює той самий код, що малює й контент: вони розробляються разом і майже завжди збігаються.',
          'Другий — <html lang>. Він лежить у шаблоні й живе власним життям: є сайти, що віддають lang="ru" на всіх без винятку локалях.',
          'Далі — піддомен ru.example.com, потім сегмент шляху зі строгим збігом, щоб /ru-return-warranty не спрацював на ru, і насамкінець self-hreflang, коли сторінка сама вказує на себе з мовною міткою.',
          {
            before:
              'Коли всі пʼять сигналів мовчать, лишається сам текст сторінки. Тут Мовар пробує вбудований у браузер ',
            linkLabel: 'визначник мови',
            href: 'https://developer.chrome.com/docs/ai/language-detection',
            after:
              ' — Chrome та Edge мають його з коробки: коли він доступний, то точніший, а коли його немає — працює franc на локальних таблицях триграм. Це шостий і останній крок для вердикту всієї сторінки.',
          },
          'Коли доказів бракує — вердикт «невідомо», і Мовар нічого не чіпає.',
        ],
      },
      {
        id: 'per-element',
        heading: 'Для коротких рядків потрібен інший класифікатор',
        lead: 'Вердикт для сторінки — це ще не все. Картку товару, пункт меню, заголовок результату доводиться класифікувати поодинці, а рядок у три слова замалий і для ШІ, і для триграм.',
        points: [
          'Найочевидніше рішення — характерні літери: і, ї, є, ґ проти ы, ё. На абзаці працює чудово; на короткій назві без жодної такої літери мовчить, а на цитаті — бреше. Тому літери тут не весь метод, а лише перший щабель драбини з чотирьох.',
          'Щаблі за порядком: характерні літери, потім вручну відібрані службові слова з найвищою точністю, потім частотні слова з корпусу субтитрів, і насамкінець franc — триграмна підстраховка, і лише для тексту від 24 символів. Виграє той щабель, чий лідер першим відірвався хоча б на одиницю.',
          '«Характерний» означає не «унікальний у світі», а «унікальний серед тих мов, які ми зараз розрізняємо». Літера і вирішує суперечку між українською та російською, бо є лише в першій, — але між українською та білоруською вона не визначальна, бо є в обох.',
          'Коли сама картка несе мовну мітку — Google, наприклад, підписує власним атрибутом блок ШІ-відповіді — Мовар зважує мітку й текст разом: мітка вирішує, поки тексту мало, але впевнене читання тексту її перебиває. Картка, підписана українською, а насправді російська, за своєю биркою не сховається.',
          'Висновок повертається не самим кодом мови, а разом із доказами: який щабель спрацював, з яким відривом і чи взагалі було з чого обирати. А коли голоси розділилися — вердикт «невідомо», що для Мовара означає «не чіпати».',
        ],
      },
      {
        id: 'langtell',
        heading: 'Класифікатор виріс в окремий пакет',
        lead: 'Ця частина зрештою переросла сам Мовар: класифікатор, профілі мов і коди винесені в окремий пакет, опублікований на npm.',
        points: [
          {
            before: '',
            linkLabel: 'langtell',
            href: 'https://www.npmjs.com/package/langtell',
            after:
              ' відповідає не на питання «якою мовою цей текст», як franc чи cld3, а на питання «якою мовою цей заголовок, з огляду на сторінку й заголовки, з якими він приїхав» — і показує, з чого склався висновок.',
          },
          'Він дивиться не лише на сам текст, а й на <html lang>, og:locale та заголовок Content-Language, зважує ці докази й повертає вердикт разом із переліком того, що на нього вплинуло, — тож завжди видно, чому рядок класифіковано саме так.',
          'Кириличний набір там ширший, ніж потрібно Мовару — є ще сербська, македонська, казахська, — тож будь-хто може взяти його під власну пару мов. Нуль обовʼязкових залежностей, ліцензія MIT, franc підключається окремо й лише якщо потрібен.',
          'У Мовара лишилося те, що специфічне саме для нього: швидка евристика для основного шляху, оркестратор рушіїв і нормалізація BCP-47. І все це — на пристрої: жодного запиту назовні, жодної телеметрії. Це не побічний ефект, а умова.',
        ],
      },
      {
        id: 'principles',
        heading: 'Правила, яких Мовар не порушує',
        lead: 'За всіма цими рішеннями стоять правила, які лишаються в силі навіть тоді, коли порушити їх зручно.',
        points: [
          'Спершу перемкнути, приховати — в останню чергу. Мовар не блокувальник: головна його робота — знайти українську версію, яка вже існує, і перемкнути сайт на неї.',
          'Через спільні механізми, а не через список сайтів. Заголовок, hreflang, розмітка, перемикач мов є всюди, тож базовий рівень працює й на сайті, якого Мовар ніколи не бачив. Власні моделі сторінки для Google і YouTube — надбудова, а не фундамент.',
          'Критерій — мова, а не зміст. Мовар не оцінює тексти й не вішає ярликів.',
          'Краще не приховати російське, ніж помилково приховати українське. Весь механізм визначення базується на доказах, а висновок «не впевнений» означає «не чіпати».',
          'Явний вибір користувача сильніший за налаштування. Якщо ви самі клікнули на сайті «російська», Мовар не перекидає вас назад — він відступає на цьому сайті до кінця сеансу, щонайбільше на добу. Інакше розширення скасовувало б ваш власний вибір.',
          'Не фільтруємо контент за замовчуванням. Приховування вмісту вимкнене, доки ви самі не ввімкнете його в налаштуваннях.',
          'Уся обробка — на пристрої, включно з ШІ. Опортуністично, а не обовʼязково: є вбудований визначник — беремо, немає — працюємо на локальних алгоритмах. Ніколи не завантажуємо ШІ-моделі й не вимагаємо новішого браузера.',
          'Не заглядаємо в медіа. Мовар не читає текст усередині зображень, відео чи звуку. Це водночас принцип і обмеження.',
          'Жодної аналітики. Ні лічильників, ні телеметрії, ні «анонімної статистики».',
          {
            before:
              'Обіцянки перевіряє алгоритм. Кожна звіряється з кодом на кожній збірці: «нічого не покидає браузер» — це перевірка, яка сканує джерела на мережеві виклики й блокує збірку, якщо знайде. Не маркетинг, а тест — живі результати на сторінці ',
            linkLabel: 'Прозорість',
            href: '/uk/transparency',
            after: '.',
          },
          'Не перекладати. Ніколи, навіть опційно. Наступний розділ — саме про це.',
        ],
      },
      {
        id: 'no-translation',
        heading: 'Чому Мовар не перекладає',
        lead: 'Найочевидніша реакція на «текст не тією мовою» — перекласти його. Мовар цього не робить принципово, і це, мабуть, найважливіше рішення в усьому продукті.',
        points: [
          'Що він робить із російським вмістом, який таки лишився на сторінці? Не перекладає — і не ховає сторінку цілком. Він прибирає окремі елементи, рівно ті, що заблокованою мовою: варіант «російська» зі списку в перемикачі, російський результат у видачі Google, картку відео на YouTube. Решта сторінки лишається як є.',
          'Переклад відмиває джерело. Машинна українська читається як питомий текст, і ви знову опиняєтесь наодинці рівно з тим вмістом, від якого відгородились, — тепер мовою, якій довіряєте, з пропагандою включно. Сигнал «це російське» і є те, заради чого Мовар встановлюють.',
          'Переклад гальмує розвиток української. Україномовної аудиторії не видно тим, хто створює контент, — вона розчиняється в російськомовній статистиці. Читач задоволений, а автор так і не дізнається, що його аудиторія українською читає охочіше. Попит лишається невидимим.',
          'Чесних варіантів, коли українського контенту немає, рівно два: показати як є — або приховати. Обираєте ви: відфільтроване або зникає, або лишається на місці за розмитою завісою.',
          'Мовар не ділить авторів на правильних і неправильних. Пропаганда чудово маскується й під українську — сама лише мова не гарантує нічого про якість тексту. Під фільтр потрапляє й проукраїнський автор, який пише російською, бо критерій тут мова, а не лояльність. Будь-який інший критерій перетворив би мовний інструмент на щось зовсім інше.',
        ],
      },
      {
        id: 'limits',
        heading: 'Чого Мовар не може',
        lead: 'Було б нечесно вдавати, що розширення лагодить усе.',
        points: [
          'Мовар виправляє те, що відбувається у вашому браузері: запит, який надсилається, адресу, яку ви відкриваєте, параметри пошуку, перемикач, який він уже знає для сайту. Він не править закешовані відповіді CDN, не перетеговує неправильно класифіковані статті Вікіпедії, не перекладе текст, вкарбований у зображення, і не змусить ШІ відповісти українською.',
          'Поелементний фільтр має чітку межу: щоб прибрати картку, Мовар має розуміти структуру сторінки, а зараз він знає видачу Google і YouTube. На маркетплейсі перемикач Мовар почистить, а картки товарів залишаться. Кожна нова структура — це окреме правило, і це чесна відповідь на питання «а мій сайт?».',
          'У YouTube немає аналога google-івського lr — жодного параметра, який справді відсіює російськомовні відео; hl і gl лише підштовхують інтерфейс, ранжування й рекомендації. Тож адреса там нічого не гарантує, і єдине, що прибирає російські картки, — поелементний фільтр, який ви вмикаєте вручну.',
          'Коли фільтр Google за українською дає порожню сторінку, Мовар один раз перезапитує без нього. Наполягати на мові до кінця означало б показати вам нуль результатів замість тих, що таки є.',
          'Але чіткий сигнал — передумова для всього іншого. Поки системи бачитимуть «брудний» сигнал, детектори, ранжування та ШІ-відповіді будуть орієнтовані на некоректну мову.',
        ],
      },
    ],
    closing: {
      heading: 'Сподобалась ідея? Долучайтеся',
      body: 'Мовар — некомерційний проєкт: ні платної версії, ні преміум-функцій, ні даних на продаж. Мета одна — щоб української в інтернеті ставало більше. Найбільше допомагають чотири речі. Чесний відгук у магазині розширень: саме за оцінками магазини вирішують, кому показувати розширення. Розповідь знайомим — кожен, хто вмикає Мовар, це ще один чистий сигнал у тій самій статистиці, з якої ростуть бюджети на локалізацію. Баг-репорт про сайт, де Мовар не спрацював — або спрацював там, де не мав: кожен такий випадок стає тестом і більше не повторюється. І дизайн — іконки, ілюстрації, матеріали для сторінок у магазинах; цього бракує найбільше.',
      linkLabel: 'Написати нам',
      linkHref: '/uk/#close',
    },
  },
  whyNotAi: {
    pageTitle: 'Чому ми не використовуємо ШІ — Мовар',
    pageDescription:
      'Мовар визначає мову сторінки маленьким детектором у вашому браузері, а не чатботом. Ми перевірили вбудовану модель ШІ від Chrome на 422 справжніх фрагментах тексту: вона приховала дві третини українських сторінок про Росію. Ось цифри.',
    hero: {
      eyebrow: 'Рішення з доказами',
      title: 'Чому ми не використовуємо ШІ',
      lead: 'Кожен браузер тепер має вбудовану універсальну модель ШІ, і найочевидніша ідея — доручити їй визначати, якою мовою написана сторінка. Ми це зробили, перевірили на 422 справжніх фрагментах тексту — статтях з Вікіпедії та написаних людьми реченнях, а не на власних вигаданих прикладах, — і викинули. Модель помилялася частіше за нудний код, який мала замінити, і помилялася саме в тому напрямку, який болить найбільше: вона приховувала українське.',
    },
    tocHeading: 'На цій сторінці',
    whatWeUse: {
      heading: 'Спершу — що насправді працює в Моварі',
      body: 'Ми не вдаватимемо, що в Моварі немає машинного навчання: таку заяву легко зробити, але вона була б неправдою. Мовар читає літери та слова, щоб зрозуміти мову, і в цьому йому допомагають дві невеликі програми. Жодна з них не пише, не переписує, не переказує і не розмірковує про зміст сторінки. Жодна нічого нікуди не надсилає.',
      items: [
        'Власний визначник мови вашого браузера — маленька модель, яку Chrome та Edge вже мають для свого перекладача. Мовар користується ним лише тоді, коли він у вас уже є, і ніколи не запускає завантаження.',
        'Статистичний визначник franc, який рахує буквосполучення. Відкритий код, без файлу моделі, однаковий у кожному браузері — саме він тримає Firefox і Safari.',
        'Набір написаних вручну правил української та російської орфографії: і, ї, є, ґ проти ы, ё, ъ, э. Нудно, швидко, і його неможливо переконати змінити думку.',
      ],
    },
    sections: [
      {
        id: 'topic',
        heading: 'ШІ читає, про що сторінка, а не якою вона мовою',
        lead: 'Це і є головна причина. Усе інше — лише ціна.',
        points: [
          'Українські медіа постійно пишуть про Росію. Російські медіа постійно пишуть про Україну. Тому ми перевірили саме це: українські статті про Москву та російські статті про Київ, узяті з Вікіпедії, а не написані нами.',
          'ШІ назвав 66% українських сторінок російськими. Якби Мовар йому довірився, він приховав би дві третини українських статей про Росію від людей, які встановили Мовар, щоб читати українською.',
          'У зворотному напрямку він назвав 56% російських сторінок українськими — пропускаючи саме той вміст, який мав упізнати.',
          'Маленький визначник, яким Мовар користується насправді, не приховав жодної. Нуль із пʼятдесяти.',
          'Помилку видно й без жодних хитрощів. Дайте ШІ абзац звичайного англійського тексту, у якому згадано «українського музиканта» й «українську народну музику», — і він відповість: українська. Він не визначає мову. Він відповідає на питання «про що це?» — а для Мовара це різні питання.',
        ],
      },
      {
        id: 'prompting',
        heading: 'Ми спробували виправити це промптом — стало гірше',
        lead: 'Звична відповідь на погану поведінку моделі — кращий промпт. Ми пробували двічі.',
        points: [
          'Ми прямо вказали їй не зважати на тему: текст про Україну може бути написаний російською, і предмет розмови не має значення. Вона все одно оцінювала тему.',
          'Тоді ми показали їй чотири готові приклади, два з них — саме ця пастка, з написаною правильною відповіддю. Точність упала ще нижче: з 39% до 32% на довгих сторінках і з 21% до 13% на коротких.',
          'З цими прикладами вона відповіла «українська» 46 разів і «російська» 49 разів на наборі, де було 45 російських і 50 українських сторінок. Це підкидання монети, тільки складніше.',
          'Обмеження вибору лише двома варіантами — українська або російська — теж не допомогло. Це змінило форму відповіді, а не якість судження.',
        ],
      },
      {
        id: 'accuracy',
        heading: 'Він був просто менш точний — усюди',
        lead: 'Це не компроміс, а чистий програш у кожній категорії сторінок, які ми перевіряли.',
        points: [
          'На всіх 422 фрагментах: 70% правильних відповідей у ШІ проти 93% у того, що Мовар має сьогодні.',
          'На повних текстах статей, де від мовної моделі найбільше очікуєш переваги: 84% проти 100%.',
          'У порівнянні фрагмент за фрагментом ШІ мав рацію там, де інші помилялися, 15 разів — і помилявся там, де інші мали рацію, 112 разів.',
          'Усі його типові помилки — усередині пари, з якою працює Мовар: українську прийнято за російську, російську за українську, білоруську за будь-яку з двох.',
        ],
      },
      {
        id: 'speed',
        heading: 'Сторінки завантажувалися б повільніше',
        lead: 'Мовар мусить вирішити, перш ніж ви побачите сторінку. ШІ не встигає.',
        points: [
          'Мовар відводить на все мовне рішення 150 мілісекунд, бо воно відбувається під час завантаження сторінки — і ви на нього чекаєте.',
          'ШІ витрачав близько 0,4 секунди на одну перевірку в тій конфігурації, яку довелося б випускати, і 1,1 секунди на найповільніших. Жоден із 422 фрагментів не вклався в бюджет.',
          'Найгірше з першою сторінкою після запуску браузера: моделі потрібно приблизно 22 секунди, щоб «прокинутися», перш ніж вона взагалі щось відповість.',
          'Те, чим Мовар користується сьогодні, обробляє повну сторінку приблизно за 20 мілісекунд, а короткий текст — менш ніж за одну.',
        ],
      },
      {
        id: 'battery',
        heading: 'Він садив би вам батарею',
        lead: 'Модель на кілька гігабайтів працює на вашій графічній підсистемі. Це не безкоштовно — і ви платите за кожну відкриту сторінку.',
        points: [
          'Ми виміряли роботу: 40 мовних рішень коштували 22 секунди процесорного часу — приблизно пів секунди обчислень на кожну окрему сторінку.',
          'Маленький визначник, яким користується Мовар, коштує десь одну сорокову від цього. Тобто ШІ щонайменше у 25 разів дорожчий на сторінку — і це нижня межа: тут не враховано енергію, яку спалює графічний чип.',
          'Мовар працює на ноутбуках і телефонах. Пів секунди важких обчислень на сторінку означає теплішу машину, гучніший кулер і менше часу від батареї — і так на кожному переході, поки розширення встановлене.',
          'Сам файл моделі займає близько 4 ГБ на диску, і він мусить там лежати.',
        ],
      },
      {
        id: 'reach',
        heading: 'Майже ніхто з вас однаково не зміг би цим скористатися',
        lead: 'Вимоги браузерного ШІ до заліза читаються як опис ігрового ПК.',
        points: [
          'Потрібен настільний компʼютер: Windows 10 або 11, macOS 13 чи новіша, Linux або ChromeOS. Підтримки телефонів і планшетів немає взагалі.',
          'Потрібно понад 4 ГБ відеопамʼяті, 16 ГБ оперативної памʼяті та 22 ГБ вільного місця на диску — ще до того, як модель почне завантажуватися.',
          'Він існує лише в Chrome та Edge. У Firefox і Safari нічого схожого немає — а це саме ті браузери, де Мовар найбільше спирається на резервний визначник.',
          'Робити ключову функцію, яку більшість людей ніколи не зможе запустити, означає випускати два продукти й тестувати лише один.',
        ],
      },
      {
        id: 'quiet',
        heading: 'І він порушив би тишу',
        lead: 'Мовар нічого й нікуди не надсилає. Додавання ШІ ставить це під питання без жодної вигоди.',
        points: [
          'Браузерний ШІ справді працює на вашій машині — ми не звинувачуємо його у шпигуванні. Але він приходить як завантаження на кілька гігабайтів, а Мовар зараз не робить жодного сітьового запиту. Цю тишу ми радше збережемо, ніж почнемо уточнювати.',
          'З тієї самої причини Мовар не перекладає російське українською, хоч ваш браузер це вміє. Машинний переклад читається як природна українська — і тихо відмиває саме те, від чого ви встановили Мовар.',
        ],
      },
    ],
    changeOurMind: {
      heading: 'Що змінило б нашу думку',
      body: 'Це вимірювання, а не принципова позиція щодо ШІ, — тож його можна скасувати кращим вимірюванням. Ми повернемося до питання для браузерної моделі, яка помиляється на українському тексті про Росію менш ніж у 5% випадків, вкладається в бюджет 150 мілісекунд і коштує не більше ніж удвічі дорожче за обчисленнями від маленького визначника. Усі три умови, на тому самому наборі — включно зі сторінками, де тема й мова розходяться, бо саме цей тест зламав кожну версію, яку ми пробували.',
    },
    closing: {
      heading: 'Прочитати повністю',
      body: 'Повне рішення — набір даних, усі таблиці, каталог помилок і три сторонні баги, які цей тест виявив у нашому власному коді, — записане в репозиторії, у тому самому форматі, що й кожне наше архітектурне рішення. Воно публічне, бо цифри мають бути предметом дискусії.',
      adrLinkLabel: 'Запис рішення на GitHub',
      privacyLinkLabel: 'Як Мовар працює з вашими даними',
    },
    linkLabel: 'Чому без ШІ',
  },
  installGuide: {
    htmlTitle: 'Гід зі встановлення — Мовар',
    metaDescription:
      'Крок за кроком: встановіть Мовар із магазину браузера й дозвольте йому читати вміст сторінок, щоб тримати кожну сторінку вашою мовою.',
    eyebrow: 'Гід зі встановлення',
    title: 'Встановіть Мовар',
    intro:
      'Мовар тримає кожну сторінку вашою мовою. Оберіть свій браузер нижче й виконайте кроки — головний з них: дозволити Мовару читати вміст сайтів, які ви відвідуєте.',
    yourBrowser: 'Ваш браузер',
    edgeNote:
      'У Edge розширення Мовар встановлюється з Chrome Web Store. Першого разу Edge попросить «дозволити розширення з інших магазинів» — це нормально. Дозвольте один раз і додайте Мовар; він встановиться в Edge, як і будь-яке інше розширення.',
    flows: {
      chromium: {
        label: 'Chrome, Edge, Brave і Opera',
        tab: 'Chrome та інші',
        steps: [
          {
            title: 'Додайте з магазину',
            body: 'Відкрийте Мовар у Chrome Web Store і додайте його до браузера.',
          },
          {
            title: 'Підтвердьте встановлення',
            body: 'Браузер попередить, що Мовар може читати й змінювати дані сайтів. Прийміть — це доступ, потрібний Мовару.',
          },
          {
            title: 'Закріпіть Мовар (необовʼязково)',
            body: 'Натисніть значок розширень (пазл) на панелі та закріпіть Мовар.',
          },
          {
            title: 'Дозвольте Мовару читати вміст сторінки',
            body: 'Мовар читає вміст кожної сторінки, щоб визначити її мову, а потім перемикає її на вашу. Відкрийте меню Мовара і виберіть доступ «На всіх сайтах».',
          },
        ],
      },
      firefox: {
        label: 'Firefox',
        tab: 'Firefox',
        steps: [
          {
            title: 'Додайте з магазину',
            body: 'Відкрийте Мовар на Firefox Add-ons і додайте його до Firefox.',
          },
          {
            title: 'Підтвердьте встановлення',
            body: 'Firefox попросить дозволити доступ до ваших даних для всіх сайтів. Прийміть — без цього Мовар не працює.',
          },
          {
            title: 'Закріпіть Мовар (необовʼязково)',
            body: 'Закріпіть Мовар на панелі, щоб він був за один клік.',
          },
          {
            title: 'Збережіть доступ до сайтів',
            body: 'Firefox надає цей доступ під час встановлення. Щоб змінити його, відкрийте about:addons, виберіть Мовар і розділ «Дозволи».',
          },
        ],
      },
      safari: {
        label: 'Safari на Mac',
        tab: 'Safari',
        steps: [
          {
            title: 'Встановіть з App Store',
            body: 'Встановіть Мовар із Mac App Store і відкрийте застосунок один раз.',
          },
          {
            title: 'Увімкніть Мовар',
            body: 'У параметрах Safari відкрийте «Розширення» й увімкніть Мовар.',
          },
          {
            title: 'Дозвольте на всіх сайтах',
            body: 'У «Розширеннях» виберіть Мовар і оберіть «Дозволити на всіх сайтах».',
          },
        ],
      },
      safariIos: {
        label: 'Safari на iPhone та iPad',
        tab: 'iPhone та iPad',
        steps: [
          {
            title: 'Встановіть з App Store',
            body: 'Встановіть Мовар з App Store.',
          },
          {
            title: 'Увімкніть Мовар',
            body: 'Відкрийте «Параметри», далі «Програми» → Safari → «Розширення» → Мовар і ввімкніть його. Дозвольте й у приватному перегляді — у Мовара немає серверів, куди щось надсилати, тож ваші приватні вкладки залишаються приватними.',
          },
          {
            title: 'Дозвольте всі сайти',
            body: 'Для Мовара встановіть «Усі сайти» на «Дозволити».',
          },
        ],
      },
    },
    reassuranceTitle: 'Нічого не покидає ваш браузер',
    reassurance:
      'Мовар лише читає вміст сторінки, щоб визначити її мову та перемкнути на вашу. У нього немає ні серверів, ні акаунтів, ні аналітики — жоден слід вашого перегляду не залишає пристрій. Увесь його код відкритий.',
    sourceLink: 'Переглянути вихідний код',
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

/** Path to the "why we don't use AI" page of a given locale. */
export function localeWhyNotAiHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/why-not-ai' : '/why-not-ai';
}

/** Path to the "how Movar works" deep-dive page of a given locale. */
export function localeHowMovarWorksHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/how-movar-works' : '/how-movar-works';
}

/** Path to the install-guide page of a given locale. */
export function localeInstallHref(lang: Locale): string {
  return lang === 'uk' ? '/uk/install' : '/install';
}
