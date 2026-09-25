/**
 * The studio band's data contract and loader.
 *
 * The band that closes the site after `Footer.astro` — the studio's credit and
 * its links back to Oleks Crane (`docs/design/studio-band/anatomy.md` in the
 * `olekscrane` repo, frozen 2026-09-26; `StudioBand.astro` renders this data).
 * One committed JSON file per language, read at build time, never fetched: the
 * olekscrane.com API that will choose and rank the related projects is
 * rejifald/olekscrane#29, and until it ships a scheduled job refreshes these
 * files by pull request. The shape here is already that API's.
 *
 * Validated with zod, so a malformed file fails `astro build` with a readable
 * error instead of shipping a broken band. A direct dependency rather than
 * `astro:content`'s re-exported `z` (which `content.config.ts` uses): that
 * virtual module only resolves inside Astro's own Vite pipeline, and this
 * module is also imported by `studio-band.test.ts` under plain `vitest run`
 * (`vitest.config.ts` has no Astro plugin) — tried first, and
 * `Cannot find package 'astro:content'` is what sent this to a real
 * dependency instead. Pinned to the same 3.x line `astro` itself carries, so
 * the two never disagree on the zod API surface this file uses. `related`
 * intentionally has no length cap in the schema: the component itself
 * renders at most three and ignores the rest, per the anatomy's "ignore any
 * item past the third" — a fourth entry is a rendering detail, not a
 * build-breaking shape error.
 */
import { z } from 'zod';

import ukData from '../data/studio-band.uk.json';
import enData from '../data/studio-band.en.json';
import type { Locale } from '../i18n';

const studioBandRelatedSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  href: z.string().url(),
});

const studioBandAskSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  label: z.string().min(1),
  href: z.string().url(),
});

const studioBandSchema = z.object({
  version: z.literal(1),
  project: z.string().min(1),
  lang: z.enum(['en', 'uk']),
  title: z.string().min(1),
  studio: z.object({
    name: z.literal('Oleks Crane'),
    href: z.string().url(),
  }),
  all: z.object({
    label: z.string().min(1),
    href: z.string().url(),
  }),
  related: z.array(studioBandRelatedSchema),
  ask: studioBandAskSchema.nullable(),
});

export type StudioBandData = z.infer<typeof studioBandSchema>;

/**
 * Validate one data file's contents. Exported (rather than the schema itself)
 * so `studio-band.test.ts` can assert the failure shape without reaching into
 * a zod internal, and so callers always get the typed result or a thrown
 * `ZodError` — never a raw schema to misuse.
 */
export function parseStudioBandData(data: unknown): StudioBandData {
  return studioBandSchema.parse(data);
}

/**
 * Parsed once at module load, so a malformed file fails the build the moment
 * anything imports this module — every page does, transitively, through
 * `Footer.astro` — rather than lazily on whichever page happens to render
 * first.
 */
const DATA: Record<Locale, StudioBandData> = {
  en: parseStudioBandData(enData),
  uk: parseStudioBandData(ukData),
};

/** The validated studio band data for a page's language. */
export function getStudioBandData(lang: Locale): StudioBandData {
  return DATA[lang];
}
