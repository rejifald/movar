// @ts-check
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFrontmatter } from '@astrojs/markdown-remark';
import { defineConfig, passthroughImageService } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { slug as githubSlug } from 'github-slugger';
import tailwindcss from '@tailwindcss/vite';

import { remarkInlineChart } from './plugins/remark-inline-chart.mjs';

const SITE = 'https://movar.fyi';

/**
 * Routes that are built and served but deliberately not offered to search
 * engines yet. The sitemap integration hands `filter` a full URL with a
 * trailing slash, so entries are pre-expanded to compare as plain strings:
 * `new Set(['/some-page'].map((path) => `${SITE}${path}/`))`.
 *
 * Hand-listed pages go in `UNLISTED_PAGES`; blog drafts are read out of their
 * own frontmatter instead. A draft is withheld from four places at once — the
 * index, the feed, the sitemap and the robots meta — and three of those read
 * the `draft` flag off the post Astro parsed. Making the fourth a hand-kept
 * list would mean the sitemap could silently disagree with the post, which is
 * the one failure this whole mechanism exists to prevent. Reading the flag is
 * only half of not disagreeing, though: this file cannot call `getCollection`,
 * so it re-does what the content layer does — with the content layer's own
 * parser and the content layer's own id rules, below — rather than with an
 * approximation that agrees on today's posts and diverges on tomorrow's.
 */
/** @type {string[]} */
const UNLISTED_PAGES = [];

/** Where the `blog` collection is loaded from — see `src/content.config.ts`. */
const BLOG_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'src/content/blog');

/**
 * The two frontmatter fields this file has an opinion about. The real schema
 * is in `src/content.config.ts`; `unknown` here because YAML can put anything
 * in either one and it is the checks below, not a cast, that decide.
 *
 * @typedef {{ draft?: unknown; slug?: unknown }} PostFrontmatter
 */

/**
 * The id Astro's glob loader will give a post — which is also its URL segment.
 *
 * Mirrors that loader's default `generateId`: a frontmatter `slug` wins
 * outright, otherwise each path segment goes through the same GitHub slugger
 * and a trailing `/index` collapses. Taking the filename verbatim instead
 * would not be a near miss, it would be a no-op — `Movu-Rakhuyut.md` is served
 * at `/uk/blog/movu-rakhuyut/`, so the excluded string would match no sitemap
 * entry at all, and nothing anywhere would say so.
 *
 * @param {string} relativePath post file, relative to `BLOG_DIR`
 * @param {PostFrontmatter} frontmatter
 * @returns {string}
 */
function collectionId(relativePath, frontmatter) {
  if (typeof frontmatter.slug === 'string' && frontmatter.slug) return frontmatter.slug;
  return relativePath
    .replace(/\.md$/, '')
    .split(path.sep)
    .map((segment) => githubSlug(segment))
    .join('/')
    .replace(/\/index$/, '');
}

/**
 * `/uk/blog/<id>` for every post whose frontmatter says `draft: true`.
 *
 * The parse is `@astrojs/markdown-remark`'s, which is the one the content
 * layer itself runs, so `draft` means here exactly what it means there and
 * cannot mean less: `True` and `TRUE` are the boolean YAML says they are, a
 * trailing `# until Friday` is a comment, and a `draft: true` sitting in the
 * body — inside a code fence, say — is body text, because only the block
 * between the fences is read. A regex over the whole file got each of those
 * four wrong in a different direction.
 *
 * The walk is recursive for the same reason: the collection globs `.md` at any
 * depth, so a post filed under a year directory is a post with a URL, and a
 * flat `readdirSync` simply never saw it.
 *
 * @returns {string[]}
 */
function draftPostPaths() {
  return readdirSync(BLOG_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({
      name,
      /** @type {PostFrontmatter} */
      frontmatter: parseFrontmatter(readFileSync(path.join(BLOG_DIR, name), 'utf8')).frontmatter,
    }))
    .filter(({ frontmatter }) => frontmatter.draft === true)
    .map(({ name, frontmatter }) => `/uk/blog/${collectionId(name, frontmatter)}`);
}

/** @type {Set<string>} */
const UNLISTED = new Set([...UNLISTED_PAGES, ...draftPostPaths()].map((path) => `${SITE}${path}/`));

// https://astro.build/config
export default defineConfig({
  markdown: {
    /*
     * Article charts are SVG and must be inlined rather than linked — an
     * `<img>`-loaded SVG cannot reach the page's fonts or theme variables.
     * See `plugins/remark-inline-chart.mjs`.
     */
    remarkPlugins: [remarkInlineChart],
  },
  site: SITE,
  output: 'static',
  // Auto-generated sitemap (sitemap-index.xml → sitemap-0.xml) so new pages
  // can never silently drop out the way the old hand-maintained sitemap.xml
  // did. The i18n block teaches the integration our routing — EN at the root,
  // UK under /uk/ — so it emits the same xhtml:link hreflang alternates as
  // BaseLayout's <head>. Status pages (404/500, incl. /uk/404) are excluded
  // automatically. robots.txt points crawlers at /sitemap-index.xml.
  integrations: [
    sitemap({
      i18n: {
        defaultLocale: 'en',
        locales: { en: 'en', uk: 'uk' },
      },
      // Pages still being finished are excluded here AND carry `noindex` via
      // BaseLayout. Both are needed: the sitemap is what actively invites a
      // crawler, and `noindex` is what it must find if it arrives anyway.
      // Not linking to a page is neither of those things — a static build
      // ships every page and the CDN serves it to anyone who asks.
      //
      // Drop an entry from `UNLISTED_PAGES` when its page is ready to be
      // found; a post publishes by clearing its own `draft` flag instead.
      filter: (page) => !UNLISTED.has(page),
    }),
  ],
  // Blog-post illustrations live beside their Markdown in
  // `src/content/blog/assets/`, which puts them through `astro:assets` — and
  // the default image service there is Sharp, a native dependency this site
  // has never needed. Every image it ships (OG cards, /install mockups,
  // example screenshots) is already a PNG captured at its final size and
  // served as-is from `public/`; the article scenes are the same kind of asset
  // at the same weight (~200KB each, matching `public/screenshots/`). So the
  // passthrough service keeps the co-located, relative-path authoring that
  // content collections are good at, without adding a native build dependency
  // for a transform we would not use.
  //
  // Revisit if a post ever needs genuinely large or responsive imagery: that
  // is the point where installing Sharp starts paying for itself.
  image: { service: passthroughImageService() },
  // Keep dev/preview on the port declared in .claude/launch.json so the
  // preview MCP's health check on 4321 doesn't miss the server when vite
  // would otherwise silently fall through to 4322+.
  server: { port: 4321 },
  vite: {
    server: { strictPort: true },
    preview: { strictPort: true },
    // Astro 5.18 bundles Vite 6 types, but @tailwindcss/vite 4.3 in this
    // workspace resolves to its vite-7 build (Storybook 10 forces vite 7
    // hoisted at the marketing devDep root). The two Plugin shapes are
    // runtime-compatible — Astro accepts the plugin — but cross-major
    // Plugin types collide under `astro check`. Drop the cast when Astro
    // ships vite-7 types.
    // @ts-expect-error cross-major vite Plugin shape (vite 6 ↔ vite 7)
    plugins: [tailwindcss()],
  },
});
