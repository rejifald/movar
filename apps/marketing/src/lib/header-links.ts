/*
 * The header's entries, in one place: the component renders them and the
 * Storybook mock next to it renders the same list, so the two used to be a
 * copy-and-paste pair that could silently disagree about where a link goes
 * — the exact problem ./footer-links solved for the footer.
 */
import { FALLBACK_HREF } from './downloads';
import { forLanguageLinks } from './for-language-links';
import { localePrivacyHref, strings } from '../i18n';
import type { Locale } from '../i18n';

export interface HeaderLink {
  href: string;
  label: string;
  /** The install link, resolved client-side by ./download-cta. */
  download: boolean;
}

/** A labelled set of destinations, rendered as one nav slot that opens. */
export interface HeaderGroup {
  /** Stable handle for the disclosure's `id` / `aria-controls` pair. */
  id: string;
  label: string;
  links: HeaderLink[];
}

export type HeaderEntry = HeaderLink | HeaderGroup;

/** Narrows an entry to the group case — the renderers branch on this. */
export function isHeaderGroup(entry: HeaderEntry): entry is HeaderGroup {
  return 'links' in entry;
}

/**
 * The entries that render in the desktop row and the mobile menu — each is an
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
 * ## Why «Для мови» is a group, and why the blog is not in it
 *
 * The row holds about three labels before it stops fitting beside the brand at
 * the `sm:` breakpoint where it first appears, and there are four Ukrainian
 * destinations that want a slot. Grouping costs one slot instead of three and
 * says something true: these are the pages about the language rather than about
 * Movar, which is the split the footer has drawn under this same heading since
 * its fifth column was added.
 *
 * The blog keeps the flat slot it was given when it first came up here, and is
 * the one member of the set the header pulls out. It is the destination people
 * arrive for by name — a headline they were sent — where the guide and the
 * directory are things a reader goes looking for once they already have a
 * reason to. Naming it costs a slot the measurements say is there.
 *
 * So the two surfaces arrange the same set differently, on purpose, and each
 * says so. What the set *contains* is decided once, in ./for-language-links,
 * which is why the blog is singled out by `id` and not by matching an href.
 *
 * In English the set is one entry long (the guide and the blog are
 * Ukrainian-only), so the group holds a single link and renders as a plain one
 * instead — a menu in front of one destination is a click that buys nothing.
 *
 * The group's label is the footer column's own heading rather than a new nav
 * string. They name the same set on the same site, and two strings for one name
 * is how a rename lands on one surface and not the other.
 */
export function headerEntries(lang: Locale): HeaderEntry[] {
  const t = strings[lang];
  const forLanguage = forLanguageLinks(lang).map((link) => ({ ...link, download: false }));
  const promoted = forLanguage.filter((link) => link.id === 'blog');
  const grouped = forLanguage.filter((link) => link.id !== 'blog');

  return [
    ...promoted,
    ...(grouped.length === 1 && grouped[0] !== undefined
      ? [grouped[0]]
      : [{ id: 'for-language', label: t.footer.groups.forLanguage, links: grouped }]),
    { href: localePrivacyHref(lang), label: t.nav.privacy, download: false },
    { href: FALLBACK_HREF, label: t.nav.download, download: true },
  ];
}
