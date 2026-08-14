/*
 * Content collections for the marketing site.
 *
 * `blog` is the site's long-form section, and it is deliberately the only
 * part of movar.fyi that is **Ukrainian-only**. Everything else here ships in
 * both locales (EN at the root, UK under `/uk/`); the blog is written for a
 * Ukrainian-speaking audience about Ukrainian-language hygiene, and a machine
 * -translated English half would say nothing to anyone. Pages live under
 * `src/pages/uk/blog/` with no English counterpart, which has three
 * consequences worth knowing before adding a post:
 *
 *   1. `BaseLayout` must be given `localeAlternates={false}` — its inline
 *      locale-redirect script would otherwise bounce an English-preferring
 *      visitor from `/uk/blog/…` to a `/blog/…` that does not exist, and its
 *      `hreflang` alternates would advertise that same missing page.
 *   2. `functions/_middleware.ts` needs no `MIRRORED_PAGES` entry: that
 *      allowlist marks the EN canonical paths that redirect to a UK twin, and
 *      there is no EN path here to redirect from.
 *   3. Prose is authored in Markdown rather than in `i18n.ts`. The rest of the
 *      site keeps its copy in typed dictionaries because every string exists
 *      twice; a single-locale article has no parity to enforce, and 300 lines
 *      of prose in a TypeScript object would be unreadable.
 *
 * Images referenced from a post body (`./assets/foo.png`) are optimised by
 * Astro at build time. `assets/` is also where `scripts/capture-article-
 * assets.mts` writes its Storybook-rendered scenes, so the file a reader sees
 * is the file that script produces — no second copy to drift.
 */
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/** Google truncates a meta description around here, so the schema enforces it
 *  at build time rather than letting a long one ship and get cut mid-word. */
const META_DESCRIPTION_MAX = 160;

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    /** Rendered as the page's `<h1>` and its `<title>`; also the index card's heading. */
    title: z.string(),
    /** One sentence, ≤160 chars: the meta description and the OG/Twitter card blurb. */
    description: z.string().max(META_DESCRIPTION_MAX),
    /** The deck under the `<h1>`, and the summary on the index card. Longer and
     *  more conversational than `description`, which has a length budget to keep. */
    lead: z.string(),
    /** Publication date. Drives the index ordering and the RSS `pubDate`. */
    pubDate: z.coerce.date(),
    /** Set only when a published post is materially revised; surfaced next to
     *  `pubDate` so a reader can tell a correction from a fresh post. */
    updatedDate: z.coerce.date().optional(),
  }),
});

export const collections = { blog };
