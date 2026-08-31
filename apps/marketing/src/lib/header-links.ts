/*
 * The header's links, in one place: the component renders them and the
 * Storybook mock next to it renders the same list, so the two used to be a
 * copy-and-paste pair that could silently disagree about where a link goes
 * — the exact problem ./footer-links solved for the footer.
 */
import { BLOG_INDEX_HREF, blogStrings } from './blog';
import { FALLBACK_HREF } from './downloads';
import { localePrivacyHref, strings } from '../i18n';
import type { Locale } from '../i18n';

export interface HeaderLink {
  href: string;
  label: string;
  /** The install link, resolved client-side by ./download-cta. */
  download: boolean;
}

/**
 * The links that render in the desktop row and the mobile menu — each is an
 * action or an off-page destination. In-page section jumps were tried here
 * and removed: the page is a scroll-first narrative, and anchors to its own
 * sections earn nothing on the homepage while resolving to a different page
 * everywhere else the header renders. `download` flags the install link,
 * which the caller resolves to a browser-detected store, mirroring the hero
 * CTA.
 *
 * Contact lives in the footer only (its "contact" column) — the header is
 * for primary navigation, and the mailto is a low-frequency destination that
 * doesn't need a permanent slot in the sticky bar.
 *
 * The blog is Ukrainian-only (see ./blog), so it's the one link here that
 * exists in one locale only — same reasoning as the footer's "for-language"
 * column.
 */
export function headerLinks(lang: Locale): HeaderLink[] {
  const t = strings[lang];
  return [
    ...(lang === 'uk'
      ? [{ href: BLOG_INDEX_HREF, label: blogStrings.navLabel, download: false }]
      : []),
    { href: localePrivacyHref(lang), label: t.nav.privacy, download: false },
    { href: FALLBACK_HREF, label: t.nav.download, download: true },
  ];
}
