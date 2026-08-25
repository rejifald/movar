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

import { SPHERES } from './lib/for-ukrainian';
import { GUIDE_MATCH_TOKENS } from './lib/guide';

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

/*
 * `guide` — the settings guide at `/uk/guide`. Ukrainian-only for the same
 * reason as `blog`, and it inherits the same `localeAlternates={false}`
 * requirement.
 *
 * It is a *separate* collection rather than more blog posts because the two
 * are different kinds of writing and age differently. A post is dated and
 * finished: «Тиха капітуляція» says what was true when it was published and
 * is never revised. A guide page is a maintained instruction whose whole
 * value is being current — every vendor in it moves its menus, and the
 * research behind it (`docs/articles/movna-hihiiena.research.md`) is full of
 * settings that were renamed or removed. So a guide page carries `updated`,
 * not `pubDate`, and the index sorts by `group` + `order` rather than by date.
 *
 * Pages are small and single-purpose on purpose: a reader arrives from a
 * search for «як змінити мову в <платформа>», fixes that one thing, and
 * leaves. The hub at `/uk/guide` carries the framing (the three rules) so no
 * individual page has to.
 */
const guide = defineCollection({
  loader: glob({ base: './src/content/guide', pattern: '**/*.md' }),
  schema: z.object({
    /** The page's `<h1>` and `<title>` — phrased as the question a reader
     *  searches, e.g. «Як змінити мову у Windows». */
    title: z.string(),
    /** Short label for the hub's card grid, e.g. «Windows». The full title is
     *  too long to scan in a grid of twenty. */
    navLabel: z.string(),
    description: z.string().max(META_DESCRIPTION_MAX),
    /** Which block of the hub the page belongs to. */
    group: z.enum(['device', 'browser', 'account', 'service', 'sites']),
    /** Sort position within the group. Sparse (10, 20, 30…) so a page can be
     *  inserted without renumbering its neighbours. */
    order: z.number(),
    /** When the steps were last checked against the vendor's live UI. Shown on
     *  the page, because a settings instruction with no date is untrustworthy. */
    updated: z.coerce.date(),
    /** Tokens the hub's on-device detection matches against, so a visitor's
     *  own platform is highlighted first. Pages that apply to everyone omit it.
     *
     *  The vocabulary is `GUIDE_MATCH_TOKENS` in `src/lib/guide.ts` — the same
     *  list `detectTokens` emits — so a token no user agent can produce fails
     *  the build rather than shipping a card the detection never surfaces. */
    match: z.array(z.enum(GUIDE_MATCH_TOKENS)).optional(),
  }),
});

/*
 * `projects` — the «Для української» directory. Unlike `blog`, this one ships
 * in BOTH locales, so `summary` carries `uk` and `en` and a missing half is a
 * build failure rather than an English card in a Ukrainian grid. (The blog's
 * single-locale reasoning above is deliberate and does not apply here; do not
 * "fix" the inconsistency.)
 *
 * One entry per file, so a submission is a single added file and the diff is
 * trivially reviewable. The body is empty by design — everything a reader sees
 * is frontmatter; there is no prose to write about someone else's project.
 *
 * Nothing here ranks, scores or tiers an entry. That absence is the feature:
 * the directory promotes these projects and is in no position to grade them.
 * See `docs/articles/for-ukrainian.plan.md`.
 */
/** One line, not a paragraph: the card shows a summary, not a description. */
const SUMMARY_MAX = 200;

const projects = defineCollection({
  loader: glob({ base: './src/content/projects', pattern: '**/*.md' }),
  schema: z
    .object({
      /** Rendered as the card heading, and the key the alphabetical sort uses. */
      name: z.string(),
      /** Fixed enum, mirrored from `src/lib/for-ukrainian.ts`. */
      sphere: z.enum(SPHERES),
      /** Where a reader is sent. Checked by `pnpm check:projects`. */
      url: z.string().url(),
      /** One line per locale. Both required — see the note above. */
      summary: z.object({
        uk: z.string().max(SUMMARY_MAX),
        en: z.string().max(SUMMARY_MAX),
      }),
      /**
       * Where the project is actually active, when that is not `url` — a
       * GitHub org, a Telegram channel, a Discord. An entry whose only signal
       * is a dormant site gets delisted; one that is alive somewhere else
       * points there instead.
       */
      activeAt: z.string().url().optional(),
      /** Date a human last opened the link and confirmed the project is alive. */
      lastVerified: z.coerce.date(),
      /** Set when the project displays the badge. Never a listing condition,
       *  never a sort key, never a visual tier. */
      badge: z.boolean().default(false),
      /** Shown plainly: a reader deserves to know when a listed course or tool
       *  costs money before they click. */
      funding: z.enum(['volunteer', 'non-profit', 'commercial', 'mixed']),
      /** True when the entry names a person rather than a project or org. */
      person: z.boolean().default(false),
      /** Consent to be named, with the date and channel it was given on. */
      consent: z.object({ date: z.coerce.date(), channel: z.string() }).optional(),
    })
    /*
     * The consent rule, enforced by the schema rather than by remembering:
     * an entry naming an individual cannot ship without a recorded consent,
     * and only such an entry may carry one. A named person is personal data
     * with a right to object and to erasure, so the basis for holding it has
     * to be visible in the entry itself.
     */
    .refine((e) => e.person === Boolean(e.consent), {
      message:
        'an entry naming an individual requires recorded consent, and only such an entry may carry one',
    }),
});

export const collections = { blog, guide, projects };
