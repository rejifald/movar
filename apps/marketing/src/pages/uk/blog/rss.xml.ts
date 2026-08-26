/*
 * RSS 2.0 feed for the blog, emitted as a static file at build time.
 *
 * Hand-rolled rather than pulling in `@astrojs/rss`: the feed is one channel
 * with a handful of items and no enclosures or custom namespaces, so the
 * package would earn its dependency purely by escaping text — which is the one
 * part below that is written out explicitly and covered by an e2e assertion
 * that the built feed parses as XML. Keeping it dependency-free also matches
 * how the rest of this repo treats small, well-understood formats.
 *
 * The feed is Ukrainian-only, like the section it describes.
 */
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import {
  BLOG_FEED_HREF,
  BLOG_INDEX_HREF,
  blogPostHref,
  blogStrings,
  isPublished,
} from '../../../lib/blog';

/**
 * Escape text for an XML *text node* or attribute value.
 *
 * `&` must be replaced first — escaping it after `<` would double-escape the
 * `&` in the `&lt;` we just produced. Titles here carry Ukrainian typographic
 * quotes («…») which need no escaping, and ampersands, which do.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async (context) => {
  // `context.site` is `astro.config.mjs`'s `site`. Items need absolute URLs —
  // a feed reader has no page to resolve a relative path against.
  const site = context.site;
  if (!site) throw new Error('astro.config.mjs must set `site` for the RSS feed to build');

  /** Absolute URL, path used verbatim — for the feed file's own address. */
  const absolute = (path: string): string => new URL(path, site).toString();

  /**
   * Absolute URL of a *page*, trailing slash included.
   *
   * Astro emits directory routes (`…/tykha-kapitulyatsiya/index.html`) and
   * `<link rel="canonical">` carries the slash, but the in-site href helpers
   * omit it (the host 308-redirects, which costs a page view nothing). A feed
   * entry is different: its `guid` is a permanent identity and its `link` is
   * what gets shared onward, so a form that disagrees with canonical would
   * split one post across two URLs. Pages only — appending a slash to
   * `rss.xml` would point the self-link at a directory that does not exist.
   */
  const canonicalPage = (path: string): string => absolute(path.endsWith('/') ? path : `${path}/`);

  const posts = (await getCollection('blog', isPublished)).toSorted(
    (a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime(),
  );

  const items = posts
    .map((post) => {
      const url = canonicalPage(blogPostHref(post.id));
      return [
        '    <item>',
        `      <title>${escapeXml(post.data.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        // Permanent, unique, and identical to the link — `isPermaLink="true"`
        // says exactly that, so readers de-duplicate on re-publish.
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.data.lead)}</description>`,
        `      <pubDate>${post.data.pubDate.toUTCString()}</pubDate>`,
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(blogStrings.feed.title)}</title>
    <link>${escapeXml(canonicalPage(BLOG_INDEX_HREF))}</link>
    <description>${escapeXml(blogStrings.feed.description)}</description>
    <language>uk</language>
    <atom:link href="${escapeXml(absolute(BLOG_FEED_HREF))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
