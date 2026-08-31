/*
 * The «Для мови» set: the pages that are about the language rather than about
 * Movar — the settings guide, the blog, and the «Для української» directory.
 *
 * One list, two renderers. The footer shows the whole set as a column; the
 * header shows most of it as a menu and promotes the blog to a slot of its own
 * (see ./header-links). Written out twice, the two would drift the first time a
 * page is added — which is the exact failure ./header-links and ./footer-links
 * were each extracted to stop, so the shared half is extracted too rather than
 * trusted. What differs between the surfaces is arrangement, and each states
 * its own; what exists is decided here, once.
 *
 * The guide and the blog are Ukrainian-only (see ./guide, ./blog and
 * `src/content.config.ts`), so in English this set is the directory alone. That
 * is what leaves the header's group holding one link there and rendering it
 * plain: a menu in front of a single destination is a click that buys nothing.
 */
import { BLOG_INDEX_HREF, blogStrings } from './blog';
import { GUIDE_INDEX_HREF, guideStrings } from './guide';
import { localeForUkrainianHref, strings } from '../i18n';
import type { Locale } from '../i18n';

/** Stable handle for one destination, so a caller can single one out without
 *  matching on an href or a translated label. */
export type ForLanguageId = 'guide' | 'blog' | 'directory';

export interface ForLanguageLink {
  id: ForLanguageId;
  href: string;
  label: string;
}

/**
 * The set, in the order the footer renders it — and, minus the entry the header
 * promotes out, the order the header's menu keeps too.
 *
 * The guide leads: it is the one entry a reader can act on in the next five
 * minutes, and the other two are reading. The directory closes because it is
 * the one entry that is not about this site at all.
 */
export function forLanguageLinks(lang: Locale): ForLanguageLink[] {
  return [
    ...(lang === 'uk'
      ? [
          { id: 'guide' as const, href: GUIDE_INDEX_HREF, label: guideStrings.navLabel },
          { id: 'blog' as const, href: BLOG_INDEX_HREF, label: blogStrings.navLabel },
        ]
      : []),
    {
      id: 'directory' as const,
      href: localeForUkrainianHref(lang),
      label: strings[lang].forUkrainian.navLabel,
    },
  ];
}
