/*
 * The footer's destinations, in one place: the component renders them and the
 * Storybook mock next to it renders the same list, so the two used to be a
 * copy-and-paste pair that could silently disagree about where a link goes.
 */
import { DISCORD_URL, FEEDBACK_URL, SOURCE_URL } from '@movar/brand';

import { BLOG_INDEX_HREF, blogStrings } from './blog';
import { FALLBACK_HREF } from './downloads';
import { GUIDE_INDEX_HREF, guideStrings } from './guide';
import {
  localeChangelogHref,
  localeHowMovarWorksHref,
  localeInstallHref,
  localePrivacyHref,
  localeTransparencyHref,
  localeWhyNotAiHref,
  strings,
} from '../i18n';
import type { Locale } from '../i18n';

export interface FooterLink {
  href: string;
  label: string;
  /** Leaves the site, so it opens in a new tab. */
  external: boolean;
  /** The install link, resolved client-side by ./download-cta. */
  download: boolean;
}

export interface FooterColumn {
  id: string;
  heading: string;
  links: FooterLink[];
}

/**
 * The ten destinations, grouped into the four columns the footer renders.
 *
 * One row stopped working at nine links: the Ukrainian set alone measured 637px
 * of a 1024px row at seven, and every further link either shrank the labels
 * until they folded mid-word or pushed the nav into a ragged second line under
 * the brand. Columns scale instead — an eleventh link lengthens a column rather
 * than re-flowing the whole footer.
 *
 * Grouped by what the visitor is here for, not by page type: get it, understand
 * it, decide whether to trust it, reach a human. `sourceCode` sits under "how it
 * works" because reading the code IS the deepest answer to that question.
 *
 * Contact holds the two channels that answer back — the support inbox and the
 * Discord server. Discord also has a mark in the social row below, and that
 * repetition is deliberate: the column is where you go to *ask* something, the
 * marks are where you go to *follow* along.
 *
 * `external` marks the links that leave the site (GitHub, Discord) and so open
 * in a new tab. `FEEDBACK_URL` is a `mailto:`, which the browser hands to a mail
 * client without navigating away — it deliberately gets no `target`.
 *
 * `download` marks the install link, which is not a destination on this site at
 * all: like the header's, it resolves client-side to the visitor's own
 * marketplace (see ./download-cta). It used to jump to the home page's
 * `#download` CTA, which meant the same word in the header and in the footer did
 * two different things — one installed, one scrolled. `FALLBACK_HREF` is the SSR
 * href, so no-JS visitors and unrecognised browsers still land on the releases
 * page rather than on nothing.
 */
export function footerColumns(lang: Locale): FooterColumn[] {
  const t = strings[lang].footer;
  return [
    {
      id: 'install',
      heading: t.groups.install,
      links: [
        { href: FALLBACK_HREF, label: t.download, external: false, download: true },
        {
          href: localeInstallHref(lang),
          label: strings[lang].installGuide.linkLabel,
          external: false,
          download: false,
        },
        { href: localeChangelogHref(lang), label: t.changelog, external: false, download: false },
      ],
    },
    {
      id: 'understand',
      heading: t.groups.understand,
      links: [
        // The guide and the blog are Ukrainian-only (see ./guide, ./blog and
        // src/content.config.ts), so they are the two links in this footer
        // that exist in one locale. Linking them from the English footer
        // would send an English reader to pages of Ukrainian prose, so the
        // column is simply shorter there.
        ...(lang === 'uk'
          ? [
              {
                href: GUIDE_INDEX_HREF,
                label: guideStrings.navLabel,
                external: false,
                download: false,
              },
              {
                href: BLOG_INDEX_HREF,
                label: blogStrings.navLabel,
                external: false,
                download: false,
              },
            ]
          : []),
        {
          href: localeHowMovarWorksHref(lang),
          label: t.howMovarWorks,
          external: false,
          download: false,
        },
        // The short form ("Why no AI" / "Чому без ШІ"), not the page's own h1 —
        // a column is narrow, and the label reads as a question either way.
        {
          href: localeWhyNotAiHref(lang),
          label: strings[lang].whyNotAi.linkLabel,
          external: false,
          download: false,
        },
        { href: SOURCE_URL, label: t.sourceCode, external: true, download: false },
      ],
    },
    {
      id: 'trust',
      heading: t.groups.trust,
      links: [
        { href: localePrivacyHref(lang), label: t.privacy, external: false, download: false },
        {
          href: localeTransparencyHref(lang),
          label: t.transparency,
          external: false,
          download: false,
        },
      ],
    },
    {
      id: 'contact',
      heading: t.groups.contact,
      links: [
        { href: FEEDBACK_URL, label: t.email, external: false, download: false },
        { href: DISCORD_URL, label: t.discord, external: true, download: false },
      ],
    },
  ];
}
