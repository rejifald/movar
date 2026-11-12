/*
 * The `projects` collection schema — the «Для української» directory entry.
 *
 * Lives here rather than inline in `src/content.config.ts` so its rules can be
 * unit-tested: that file imports `astro:content`, which only exists inside
 * Astro's own runtime. Astro's `image()` helper is injected for the same
 * reason — the content config passes the real one, a test passes a fake that
 * turns a path into image metadata the way Astro's does.
 *
 * Nothing here ranks, scores or tiers an entry. That absence is the feature:
 * the directory promotes these projects and is in no position to grade them.
 * See `docs/articles/for-ukrainian.plan.md`.
 */
import { z } from 'astro/zod';

import { SPHERES } from './for-ukrainian';

/** One line, not a paragraph: the card shows a summary, not a description. */
const SUMMARY_MAX = 200;

/** The mark is drawn in the address line's ink as a mask, so only a vector
 *  file can take that ink at 14–16px without blurring. Checked on the path,
 *  because Astro's content layer resolves `image()` to metadata only at
 *  render time — at parse time the value is still the path. */
const SVG_PATH = /\.svg$/i;

/** When and where permission was given — for naming a person, or for
 *  showing a project's mark. */
const recordedConsent = z.object({ date: z.coerce.date(), channel: z.string() });

export function projectSchema<I extends z.ZodTypeAny>(image: () => I) {
  return (
    z
      .object({
        /** Rendered as the card heading, and the key the alphabetical sort uses. */
        name: z.string(),
        /** Fixed enum, mirrored from `src/lib/for-ukrainian.ts`. */
        sphere: z.enum(SPHERES),
        /** Where a reader is sent. Checked by `pnpm check:projects`. */
        url: z.string().url(),
        /** One line per locale. Both required — see `src/content.config.ts`. */
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
        consent: recordedConsent.optional(),
        /**
         * The project's own mark, shown in the address line at that line's
         * size and in its single ink whatever the file's colours, so it reads
         * as a byline and never as promotion. Shown only with the project's
         * recorded permission (`markConsent`). SVG only — see `SVG_PATH`.
         * Lives beside the entries, e.g. `./marks/<slug>.svg`.
         */
        mark: z
          .string()
          .regex(SVG_PATH, 'a project mark must be an SVG file')
          .pipe(image())
          .optional(),
        /** The project's permission to show its mark, with date and channel. */
        markConsent: recordedConsent.optional(),
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
      })
      /*
       * The same shape for a mark: a project's logo is its own, so the
       * directory shows one only with a record of being allowed to, and a
       * permission with no mark to apply to is a stale record.
       */
      .refine((e) => Boolean(e.mark) === Boolean(e.markConsent), {
        message:
          'an entry showing a mark requires recorded permission for it, and only such an entry may carry one',
        path: ['markConsent'],
      })
  );
}
